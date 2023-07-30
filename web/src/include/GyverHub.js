"use strict";


class GyverHub {
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
    ws = new WebsocketConnection();
    bt = new BluetoothConnection();
}
