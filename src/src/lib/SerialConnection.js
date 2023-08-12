"use strict";

import Connection, {Conn} from './Connection';


export default class SerialConnection extends Connection {
    priority = 500

    constructor(hub) {
        super();
        this._hub = hub;
        this._port = null;
        this._reader = null;
        this._connected = false;
    }

    async start() {
        if (this._connected) return;

        const ports = await navigator.serial.getPorts();
        if (!ports.length) return;
        this._port = ports[0];

        await this._port.open({baudRate: this._hub.cfg.baudrate});
        // noinspection ES6MissingAwait
        this._run(); // launch!
    }

    showIcon(state) {
        document.getElementById('serial_ok').style.display = state ? 'inline-block' : 'none';
    }

    async _run() {
        this._connected = true;
        try {
            console.log('[Serial] Open');
            this.showIcon(true);

            await this._readLoop();

        } catch (error) {
            console.log("[Serial] " + error);

        } finally {
            await this._port.close();
            this._port = null;

            console.log('[Serial] Close port');

            this._connected = false;
            this.showIcon(false);
        }
    }

    async _readLoop() {
        while (this._port.readable && this._connected) {
            this._reader = this._port.readable.getReader();
            try {

                let buffer = '';
                while (this._connected) {
                    const {value, done} = await this._reader.read();
                    if (done) break;
                    const data = new TextDecoder().decode(value);

                    for (let i = 0; i < data.length; i++) {
                        buffer += data[i];
                        if (buffer.endsWith('}\n')) {
                            if (buffer.startsWith('\n{')) {
                                await this._hub.parseDevice(buffer, this);
                            }
                            buffer = '';
                        }
                    }
                }

            } catch (error) {
                console.log("[Serial] " + error);

            } finally {
                await this._reader.releaseLock();
                this._reader = null;
                console.log('[Serial] Close readable');
            }
        }
    }

    async stop() {
        this._connected = false;
        if (this._reader) await this._reader.cancel();
    }

    async toggle() {
        if (this._connected) await this.stop();
        else await this.start();
    }
    async select() {
        await this.stop();
        const ports = await navigator.serial.getPorts();
        for (let port of ports) await port.forget();
        try {
            await navigator.serial.requestPort();
        } catch (e) {
        }
        await this.change();
    }

    async change() {
        this.showIcon(0);
        if (this._connected) await this.stop();
        const ports = await navigator.serial.getPorts();
        document.getElementById('serial_btn').style.display = ports.length ? 'inline-block' : 'none';
    }

    async send(uri, value) {
        if (value) uri += '=' + value;
        uri += '\0';

        if (!this._connected) {
            await this.start();
        }

        try {
            const encoder = new TextEncoder();
            const writer = this._port.writable.getWriter();
            await writer.write(encoder.encode(uri));
            writer.releaseLock();
        } catch (e) {
            console.log("[Serial] " + e);
        }
    }

    async discover() {
        await this.send(this._hub.cfg.prefix);
    }

    static async discover() {
        await hub.serial.discover();
    }
}
