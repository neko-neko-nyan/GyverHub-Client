"use strict";

class BluetoothConnection extends Connection {
    priority = 200

    // based on https://github.com/loginov-rocks/Web-Bluetooth-Terminal
    constructor() {
        super();
        this._maxCharacteristicValueLength = 20;
        this._device = null;
        this._characteristic = null;
        this._serviceUuid = 0xFFE0;
        this._characteristicUuid = 0xFFE1;
        this._boundHandleDisconnection = this._handleDisconnection.bind(this);
        this._boundHandleCharacteristicValueChanged = this._handleCharacteristicValueChanged.bind(this);

        this._buffer = '';
    }

    async toggle() {
        if (!this.state()) {
            EL('bt_device').innerHTML = 'Connecting...';
            await this.open();
        } else await this.close();
    }

    static async discover() {
        await hub.bt.send(hub.cfg.prefix);
    }

    async onmessage(data) {
        for (let i = 0; i < data.length; i++) {
            this._buffer += data[i];
            if (this._buffer.endsWith('}\n')) {
                if (this._buffer.startsWith('\n{')) {
                    await parseDevice(this._buffer, Conn.BT);
                }
                this._buffer = '';
            }
        }
    }

    showOk(state) {
        EL('bt_ok').style.display = state ? 'inline-block' : 'none';
    }

    onopen() {
        EL('bt_btn').innerHTML = 'Disconnect';
        EL('bt_device').innerHTML = this.getName();
        this.showOk(true);
    }

    onclose() {
        EL('bt_btn').innerHTML = 'Connect';
        EL('bt_device').innerHTML = 'Not Connected';
        this.showOk(false);
    }

    onerror() {
        EL('bt_device').innerHTML = 'Not Connected';
        this.showOk(false);
    }

    state() {
        return this._device;
    }

    async open() {
        try {
            await this._connectToDevice(this._device);
            this.onopen();
        } catch (e) {
            this._onerror(e)
        }
    }

    async close() {
        await this._disconnectFromDevice(this._device);
        if (this._characteristic) {
            this._characteristic.removeEventListener('characteristicvaluechanged', this._boundHandleCharacteristicValueChanged);
            this._characteristic = null;
        }
        if (this._device) this.onclose();
        this._device = null;
    }

    async send(cmd, name, value) {
        let uri = hub.cfg.prefix + '/' + hub.currentDeviceId + '/' + hub.cfg.client_id + '/' + cmd;
        if (name) uri += '/' + name;
        if (value) uri += '=' + value;

        if (!this._characteristic) return this._onerror('No device');

        uri += '\0';
        const chunks = this.constructor._splitByLength(uri, this._maxCharacteristicValueLength);
        await this._writeToCharacteristic(this._characteristic, chunks[0]);

        for (let i = 1; i < chunks.length; i++) {
            if (!this._characteristic) {
                this._onerror('Device has been disconnected');
                break;
            }
            await this._writeToCharacteristic(this._characteristic, chunks[i]);
        }
    }

    getName() {
        return this._device ? this._device.name : '';
    }

    // private
    _onerror(e) {
        this.onerror('[BT] ' + e);
    }

    async _connectToDevice(device) {
        if (!device)
            device = await this._requestBluetoothDevice();
        let characteristic = await this._connectDeviceAndCacheCharacteristic(device);
        await this._startNotifications(characteristic);
    }

    async _disconnectFromDevice(device) {
        if (!device) return;
        device.removeEventListener('gattserverdisconnected', this._boundHandleDisconnection);
        if (device.gatt.connected)
            await device.gatt.disconnect();
    }

    async _requestBluetoothDevice() {
        this._device = await navigator.bluetooth.requestDevice({
            filters: [{services: [this._serviceUuid]}],
        }); // Remember device.
        this._device.addEventListener('gattserverdisconnected', this._boundHandleDisconnection);
        return this._device;
    }

    async _connectDeviceAndCacheCharacteristic(device) {
        if (device.gatt.connected && this._characteristic) {
            return this._characteristic;
        }
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(this._serviceUuid);
        this._characteristic = await service.getCharacteristic(this._characteristicUuid); // Remember characteristic.
        return this._characteristic;
    }

    async _startNotifications(characteristic) {
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', this._boundHandleCharacteristicValueChanged);
    }

    async _stopNotifications(characteristic) {
        await characteristic.stopNotifications();
        characteristic.removeEventListener('characteristicvaluechanged', this._boundHandleCharacteristicValueChanged);
    }

    async _handleDisconnection(event) {
        const device = event.target;
        this.onclose();
        try {
            const characteristic = await this._connectDeviceAndCacheCharacteristic(device);
            await this._startNotifications(characteristic);
            this.onopen();
        } catch (e) {
            this._onerror(e);
        }
    }

    async _handleCharacteristicValueChanged(event) {
        const value = new TextDecoder().decode(event.target.value);
        await this.onmessage(value);
    }

    async _writeToCharacteristic(characteristic, data) {
        return await characteristic.writeValue(new TextEncoder().encode(data));
    }

    static _splitByLength(string, length) {
        return string.match(new RegExp('(.|[\r\n]){1,' + length + '}', 'g'));
    }
}