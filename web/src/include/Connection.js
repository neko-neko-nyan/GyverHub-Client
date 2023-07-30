"use strict";

class Connection {
    priority = 0

    /**
     *
     * @param {String} cmd
     * @param {String} name
     * @param {String} value
     * @returns {Promise<void>}
     */
    async send(cmd, name, value) {
    }

    static async discover() {
    }

    static async discoverAll() {
        await this.discover();
    }
}
