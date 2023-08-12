"use strict";

import WebsocketConnection from './WebsocketConnection';
import {intToCol, isESP, showPopup, showPopupError} from "../utils";
import {ConnNames} from "./Connection";

let push_timer = 0;
let prev_set = null;

export default class Device {
    /** @type Connection[] */
    connections = []
    controls = null
    granted = false
    port = null
    ip = null
    info = {}
    show_names = false
    break_widgets = false

    constructor(id, info) {
        this.id = id;
        this.updateInfo(info)

        let icon = (!isESP() && this.info.icon) ? `<span class="icon icon_min" id="icon#${id}">${this.info.icon}</span>` : '';
        document.getElementById('devices').innerHTML += `
<div class="device offline" id="device#${id}" onclick="device_h('${id}')" title="${id} [${hub.cfg.prefix}]">
  <div class="device_inner">
    <div class="d_icon ${icon ? '' : 'd_icon_empty'}">${icon}</div>
    <div class="d_head">
      <span>
        <span class="d_name" id="name#${id}">${this.info.name}</span>
        <sup class="conn_dev" id="Serial#${id}">S</sup>
        <sup class="conn_dev" id="BT#${id}">B</sup>
        <sup class="conn_dev" id="WS#${id}">W</sup>
        <sup class="conn_dev" id="MQTT#${id}">M</sup>
      </span>
    </div>
    <div class="icon d_delete" onclick="delete_h('${id}')"></div>
  </div>
</div>`;
        document.getElementById(`device#${id}`).className = "device";
    }

    get connection() {
        if (this.connections)
            return this.connections[0];
        throw new Error("No connection to device");
    }

    /**
     * @param {Connection} connection
     */
    addConnectionType(connection) {
        if (connection in this.connections) return;

        this.connections.push(connection);
        this.connections.sort((a, b) => b.priority - a.priority);

        console.log(this.connections)
        document.getElementById(`${ConnNames[conn]}#${this.id}`).style.display = 'unset';
    }

    updateInfo(data) {
        this.info.name = data.name;
        this.info.icon = data.icon;
        this.info.PIN = data.PIN;
        this.info.version = data.version;
        this.info.max_upl = data.max_upl;
        this.info.modules = data.modules;
        this.info.ota_t = data.ota_t;
        save_devices();
    }

    isModuleEnabled(module) {
        return !(this.info.modules & module);
    }

    get isFocused() {
        return this.id === hub.currentDeviceId;
    }

    get isAccessAllowed() {
        return this.granted || this.info.PIN === 0;
    }

    /**
     *
     * @param {{}} data
     * @param {Connection} connection
     * @returns {Promise<void>}
     */
    async handlePacket(data, connection) {
        switch (data.type) {
            case 'discover':
                if (hub.currentDeviceId) return;

                // COMPATIBILITY
                if (data.modules === undefined) data.modules = 0;
                if (data.ota_t === undefined) data.ota_t = 'bin';


                if (this.ip === null && connection instanceof WebsocketConnection) {
                    this.ip = connection.ip;
                }

                console.log('Update device #' + this.id);
                this.updateInfo(data);
                this.addConnectionType(connection);

                if (data.icon.length) document.getElementById(`icon#${this.id}`).innerHTML = data.icon;
                document.getElementById(`name#${this.id}`).innerHTML = data.name ? data.name : 'Unknown';
                document.getElementById(`device#${this.id}`).className = "device";
                break;

            case 'data':
                // RAW DATA
                break;

            case 'alert':
                await release_all();
                alert(data.text);
                break;

            case 'notice':
                showPopup(data.text, intToCol(data.color));
                break;

            case 'OK':
                break;

            case 'ERR':
                showPopupError(data.text);
                break;

            case 'print':
                if (!this.isFocused) return;
                printCLI(data.text, data.color);
                break;

            case 'update':
                if (!this.isFocused) return;
                for (let name in data.updates) await this.applyUpdate(name, data.updates[name]);
                break;

            case 'ui':
                if (!this.isFocused) return;
                this.controls = data.controls;
                await showControls(data.controls, false, connection, this.ip);
                break;

            case 'info':
                if (!this.isFocused) return;
                this.showInfo(data);
                break;

            case 'push':
                let date = (new Date).getTime();
                if (date - push_timer < 3000) return;
                push_timer = date;
                await showNotif(data.text, this.info.name);
                break;

            // ============== FS ==============
            case 'fsbr':
                if (!this.isFocused) return;
                showFsbr(data);
                break;

            case 'fs_error':
                if (!this.isFocused) return;
                EL('fsbr_inner').innerHTML = '<div class="fs_err">FS ERROR</div>';
                break;

            // ============= FETCH =============
            case 'fetch_start':
                if (!this.isFocused) return;

                fetching = this.id;
                fetch_file = '';
                await post('fetch_chunk', fetch_path);
                reset_fetch_tout();
                break;

            case 'fetch_next_chunk':
                if (!this.isFocused) return;

                fetch_file += data.data;
                if (data.chunk === data.amount - 1) {
                    if (fetch_to_file) await downloadFileEnd(fetch_file);
                    else await fetchEnd(fetch_name, fetch_index, fetch_file);
                } else {
                    let perc = Math.round(data.chunk / data.amount * 100);
                    if (fetch_to_file) processFile(perc);
                    else document.getElementById('process#' + fetch_index).innerHTML = perc + '%';
                    await post('fetch_chunk', fetch_path);
                    reset_fetch_tout();
                }
                break;

            case 'fetch_err':
                if (!this.isFocused) return;

                if (fetch_to_file) await errorFile();
                else document.getElementById('process#' + fetch_index).innerHTML = 'Aborted';
                showPopupError('Fetch aborted');
                await stopFS();
                break;

            // ============= UPLOAD =============
            case 'upload_err':
                showPopupError('Upload aborted');
                setLabelTout('file_upload_btn', 'Error!', 'Upload');
                await stopFS();
                break;

            case 'upload_start':
                if (!this.isFocused) return;
                uploading = this.id;
                await uploadNextChunk();
                reset_upload_tout();
                break;

            case 'upload_next_chunk':
                if (!this.isFocused) return;
                await uploadNextChunk();
                reset_upload_tout();
                break;

            case 'upload_end':
                showPopup('Upload Done!');
                await stopFS();
                setLabelTout('file_upload_btn', 'Done!', 'Upload');
                await post('fsbr');
                break;

            // ============= OTA =============
            case 'ota_err':
                showPopupError('Ota aborted');
                setLabelTout('ota_label', 'ERROR', 'IDLE');
                await stopFS();
                break;

            case 'ota_start':
                if (!this.isFocused) return;
                uploading = this.id;
                await otaNextChunk();
                reset_ota_tout();
                break;

            case 'ota_next_chunk':
                if (!this.isFocused) return;
                await otaNextChunk();
                reset_ota_tout();
                break;

            case 'ota_end':
                showPopup('OTA Done! Reboot');
                await stopFS();
                setLabelTout('ota_label', 'DONE', 'IDLE');
                break;

            // ============ OTA URL ============
            case 'ota_url_ok':
                showPopup('OTA Done!');
                break;

            case 'ota_url_err':
                showPopupError('OTA Error!');
                break;
        }
    }

    async applyUpdate(name, value) {
        if (screen !== 'device') return;
        if (prev_set && prev_set.name === name && prev_set.value === value) {
            prev_set = null;
            return;
        }
        if (name in prompts) {
            await release_all();
            let res = prompt(value ? value : prompts[name].label, prompts[name].value);
            if (res !== null) {
                prompts[name].value = res;
                await set_h(name, res);
            }
            return;
        }
        if (name in confirms) {
            await release_all();
            let res = confirm(value ? value : confirms[name].label);
            await set_h(name, res ? '1' : '0');
            return;
        }
        if (name in pickers) {
            pickers[name].setColor(intToCol(value));
            return;
        }

        let el = document.getElementById('#' + name);
        if (!el) return;
        const cl = el.classList;
        if (cl.contains('icon_t')) el.style.color = value;
        else if (cl.contains('text_t')) el.innerHTML = value;
        else if (cl.contains('input_t')) el.value = value;
        else if (cl.contains('date_t')) el.value = new Date(value * 1000).toISOString().split('T')[0];
        else if (cl.contains('time_t')) el.value = new Date(value * 1000).toISOString().split('T')[1].split('.')[0];
        else if (cl.contains('datetime_t')) el.value = new Date(value * 1000).toISOString().split('.')[0];
        else if (cl.contains('slider_t')) el.value = value, document.getElementById('out#' + name).innerHTML = value, moveSlider(el, false);
        else if (cl.contains('switch_t')) el.checked = (value === '1');
        else if (cl.contains('select_t')) el.value = value;
        else if (cl.contains('image_t')) {
            files.push({id: '#' + name, path: (value ? value : EL('#' + name).getAttribute("name")), type: 'img'});
            document.getElementById('wlabel#' + name).innerHTML = ' [0%]';
            if (files.length === 1) await nextFile();
        } else if (cl.contains('canvas_t')) {
            if (name in canvases) {
                if (!canvases[name].value) {
                    canvases[name].value = value;
                    drawCanvas(canvases[name]);
                }
            }
        } else if (cl.contains('gauge_t')) {
            if (name in gauges) {
                gauges[name].value = Number(value);
                drawGauge(gauges[name]);
            }
        } else if (cl.contains('flags_t')) {
            let flags = document.getElementById('#' + name).getElementsByTagName('input');
            let val = value;
            for (let i = 0; i < flags.length; i++) {
                flags[i].checked = val & 1;
                val >>= 1;
            }
        }
    }

    showInfo(device) {
        function addInfo(el, label, value, title = '') {
            document.getElementById(el).innerHTML += `
    <div class="cfg_row info">
      <label>${label}</label>
      <label title="${title}" class="lbl_info">${value}</label>
    </div>`;
        }

        document.getElementById('info_version').innerHTML = '';
        document.getElementById('info_net').innerHTML = '';
        document.getElementById('info_memory').innerHTML = '';
        document.getElementById('info_system').innerHTML = '';

        for (let i in device.info.version) addInfo('info_version', i, device.info.version[i]);
        for (let i in device.info.net) addInfo('info_net', i, device.info.net[i]);
        for (let i in device.info.memory) {
            if (typeof (device.info.memory[i]) == 'object') {
                let used = device.info.memory[i][0];
                let total = device.info.memory[i][1];
                let mem = (used / 1000).toFixed(1) + ' kB';
                if (total) mem += ' [' + (used / total * 100).toFixed(0) + '%]';
                addInfo('info_memory', i, mem, `Total ${(total / 1000).toFixed(1)} kB`);
            } else addInfo('info_memory', i, device.info.memory[i]);
        }
        for (let i in device.info.system) {
            if (i === 'Uptime') {
                let sec = device.info.system[i];
                let upt = Math.floor(sec / 86400) + ':' + new Date(sec * 1000).toISOString().slice(11, 19);
                let d = new Date();
                let utc = d.getTime() - (d.getTimezoneOffset() * 60000);
                addInfo('info_system', i, upt);
                addInfo('info_system', 'Started', new Date(utc - sec * 1000).toISOString().split('.')[0].replace('T', ' '));
                continue;
            }
            addInfo('info_system', i, device.info.system[i]);
        }
    }
}