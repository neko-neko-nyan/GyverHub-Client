"use strict";

class MqttConnection extends Connection {
    priority = -1

    constructor() {
        super();
        this._client = null;
        this._discover_flag = false;
        this._buffers = {};
    }

    get connected() {
        return this._client && this._client.connected;
    }

    showIcon(state) {
        EL('mqtt_ok').style.display = state ? 'inline-block' : 'none';
    }

    async start() {
        if (this.connected) return;
        if (!hub.cfg.mq_host || !hub.cfg.mq_port) return;

        const url = 'wss://' + hub.cfg.mq_host + ':' + hub.cfg.mq_port + '/mqtt';
        const options = {
            keepalive: 60,
            clientId: 'HUB-' + Math.round(Math.random() * 0xffffffff).toString(16),
            username: hub.cfg.mq_login,
            password: hub.cfg.mq_pass,
            protocolId: 'MQTT',
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 1000,
            connectTimeout: 20 * 1000
        }

        try {
            this._client = await mqtt.connectAsync(url, options);
        } catch (e) {
            this.showIcon(0);
            return;
        }

        this._client.on('error', () => {
            this.showIcon(0);
            this._client.end();
        });

        this._client.on('close', () => {
            this.showIcon(0);
            this._client.end();
        });

        this._client.on('message', async (topic, data) => {

            /** @type string[] */
            const parts = topic.split('/');

            if (parts.length < 2) return;
            if (parts[0] !== hub.cfg.prefix) return;
            if (parts[1] !== 'hub') return;
            parts.splice(0, 2);

            // prefix/hub
            if (parts.length === 0) {
                await parseDevice(data.toString(), Conn.MQTT);

                // prefix/hub/hubid/id
            } else if (parts.length === 2 && parts[0] === hub.cfg.client_id) {
                let id = parts[1];
                const device = hub.devices.get(id);
                if (!device) {
                    await parseDevice(data.toString(), Conn.MQTT);
                    return;
                }

                if (!this._buffers[id]) this._buffers[id] = [];
                const buf = this._buffers[id];
                buf.push(data);

                const last = buf[buf.length - 1];
                if (last[last.length - 2] === '}'.charCodeAt(0) && last[last.length - 1] === '\n'.charCodeAt(0)) {
                    if (buf[0][0] === '\n'.charCodeAt(0) && buf[0][1] === '{'.charCodeAt(0)) {
                        // TODO device.handleUpdate()
                        await parseDevice(buf.map(i => i.toString()).join(''), Conn.MQTT);
                    }
                    buf.length = 0;
                }

                // prefix/hub/id/get/name
            } else if (parts.length === 3 && parts[1] === 'get') {
                const device = hub.currentDevice;
                if (parts[0] !== device.id) return;
                log('Got GET from id=' + parts[0] + ', name=' + parts[2]);

                await device.applyUpdate(parts[2], data.toString());
                stop_tout();
            }
        });

        this.showIcon(1);
        await this._client.subscribeAsync(hub.cfg.prefix + '/hub');
        await this._client.subscribeAsync(hub.cfg.prefix + '/hub/' + hub.cfg.client_id + '/#');

        for (const id of hub.devices.keys()) {
            await this._client.subscribeAsync(hub.cfg.prefix + '/hub/' + id + '/get/#');
        }

        if (this._discover_flag) {
            this._discover_flag = false;
            await this.discoverConn();
        }
    }

    async send(cmd, name, value) {
        let uri0 = hub.cfg.prefix + '/' + hub.currentDeviceId + '/' + hub.cfg.client_id + '/' + cmd;
        if (this.connected) await this._client.publishAsync(uri0 + (name.length ? ('/' + name) : ''), value);  // no '\0'
    }

    async stop() {
        if (this.connected) await this._client.endAsync();
    }

    static async discover() {
        await hub.mqtt.discoverConn();
    }

    async discoverConn() {
        log('MQTT discover');
        if (!this.connected) this._discover_flag = true;
        else for (const id of hub.devices.keys()) {
            await this._client.publishAsync(hub.cfg.prefix + '/' + id, hub.cfg.client_id);
        }
    }

    static async discoverAll() {
        await hub.mqtt.discoverAllConn();
    }

    async discoverAllConn() {
        if (!this.connected) return;
        log('MQTT discover all');
        await this._client.publishAsync(hub.cfg.prefix, hub.cfg.client_id);
    }
}
