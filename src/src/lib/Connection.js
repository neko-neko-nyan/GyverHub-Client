"use strict";

export default class Connection {
    priority = 0

    /**
     *
     * @param {String} uri
     * @param {String} value
     * @returns {Promise<void>}
     */
    async send(uri, value) {
    }
}

export class Discoverer {
    async discover() {
    }

    async discoverAll() {
        await this.discover();
    }
}

export const Conn = {
    SERIAL: 0,
    BT: 1,
    WS: 2,
    MQTT: 3,
    NONE: 4,
    ERROR: 5,
};

export const ConnNames = ['Serial', 'BT', 'WS', 'MQTT', 'None', 'Error'];

