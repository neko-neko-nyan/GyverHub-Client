"use strict";


import Connection from "./Connection";
import SerialConnection from "./SerialConnection";
import MqttConnection from "./MqttConnection";
import BluetoothConnection from "./BluetoothConnection";
import {refreshSpin, showErr} from "../utils";
import Device from "./Device";
import {ConnNames} from "./Connection";

let tout_interval = null;
let ping_interval = null;
let refresh_ui = false;

export default class GyverHub {
    cfg = {
        prefix: 'MyDevices', client_id: new Date().getTime().toString(16).slice(-8),
        use_ws: false, use_hook: true, local_ip: '192.168.1.1', netmask: 24,
        use_bt: false,
        use_serial: false, baudrate: 115200,
        use_mqtt: false, mq_host: 'test.mosquitto.org', mq_port: '8081', mq_login: '', mq_pass: '',
    };

    /** @type {Map<String,Device>} */
    devices = new Map;
    currentDeviceId = null;

    /**
     * @returns {Device | undefined}
     */
    get currentDevice() {
        return this.devices.get(this.currentDeviceId);
    }

    serial = new SerialConnection();
    mqtt = new MqttConnection();
    bt = new BluetoothConnection();

    /**
     * @param {string} text
     * @param {Connection} conn
     * @returns {Promise<void>}
     */
    async parseDevice(text, conn) {
        text = text.trim().replaceAll(/([^\\])\\([^"\\nrt])/ig, "$1\\\\$2")
            .replaceAll(/\t/ig, "\\t").replaceAll(/\n/ig, "\\n")
            .replaceAll(/\r/ig, "\\r");

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.log('Wrong packet (JSON):' + text);
            return;
        }

        let id = data.id;
        if (!id) return console.log('Wrong packet (ID)');

        console.log('Got packet from #' + id + ' ' + data.type + ' via ' + conn);

        if (id === this.currentDeviceId) {
            stop_tout();
            showErr(false);
            change_conn(conn);
        }

        const dev = this.devices.get(id);
        if (dev) await dev.handlePacket(data, conn);
        else if (data.type === 'discover') {
            if (this.currentDeviceId) return;

            // COMPATIBILITY
            if (data.modules === undefined) data.modules = 0;
            if (data.ota_t === undefined) data.ota_t = 'bin';
            // /COMPATIBILITY

            console.log('Add new device #' + id);
            const dev = new Device(id, data);
            dev.ip = ip;
            this.devices.set(id, dev);
            dev.addConnectionType(conn);
        }
    }
}

function change_conn(conn) {
    document.getElementById('conn').innerHTML = ConnNames[conn];
}

function stop_tout() {
    refreshSpin(false);
    if (tout_interval) clearTimeout(tout_interval);
    tout_interval = null;
}

function reset_tout() {
    if (tout_interval) return;
    refreshSpin(true);
    tout_interval = setTimeout(function () {
        console.log('Connection lost');
        refresh_ui = true;
        change_conn(Conn.ERROR);
        showErr(true);
        stop_tout();
    }, G.tout_prd);
}

function stop_ping() {
    if (ping_interval) clearInterval(ping_interval);
    ping_interval = null;
}

function reset_ping() {
    stop_ping();
    ping_interval = setInterval(async () => {
        if (refresh_ui) {
            refresh_ui = false;
            if (screen === 'info') await post('info');
            else if (screen === 'fsbr') await post('fsbr');
            else await post('focus');
        } else {
            await post('ping');
        }
    }, G.ping_prd);
}