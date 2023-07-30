"use strict";


class WebsocketConnection extends Connection {
    static _discovering = false;

    static get isDiscovering() {
        return this._discovering;
    }

    static async discover() {
        for (const [id, device] of hub.devices) {
            if (device.ip === null) continue;
            const ws = new this(device.ip);
            log('WS discover');
            await ws.discover(id);
        }
    }

    static async manualIp(ip) {
        if (!checkIP(ip)) {
            showPopupError('Wrong IP!');
            return;
        }
        log('WS manual ' + ip);
        const ws = new this(ip);
        await ws.discover();
    }

    static async _discoverAll(ip) {
        try {
            if (hub.cfg.use_hook) {
                const res = await fetch('http://' + ip + ':' + G.http_port + '/hub_discover_all', {
                    signal: AbortSignal.timeout(G.tout_prd)
                });
                if (res.status !== 200) return;

                const text = await res.text();
                if (text !== 'OK') return;
            }

            const ws = new this(ip);
            await ws.discover();
        } catch (e) {
        }
    }

    static _getIPs() {
        let ip = EL('local_ip').value;
        if (!checkIP(ip)) {
            showPopupError('Wrong IP!');
            return null;
        }
        let ip_a = ip.split('.');
        let sum_ip = (ip_a[0] << 24) | (ip_a[1] << 16) | (ip_a[2] << 8) | ip_a[3];
        let cidr = Number(hub.cfg.netmask);
        let mask = ~(0xffffffff >>> cidr);
        let network, broadcast = 0, start_ip, end_ip;
        if (cidr === 32) {
            network = sum_ip;
            start_ip = network;
            end_ip = network;
        } else {
            network = sum_ip & mask;
            broadcast = network + (~mask);
            if (cidr === 31) {
                start_ip = network;
                end_ip = broadcast;
            } else {
                start_ip = network + 1;
                end_ip = broadcast - 1;
            }
        }
        let ips = ['192.168.4.1'];
        for (let ip = start_ip; ip <= end_ip; ip++) {
            ips.push(`${(ip >>> 24) & 0xff}.${(ip >>> 16) & 0xff}.${(ip >>> 8) & 0xff}.${ip & 0xff}`);
        }
        return ips;
    }

    static async discoverAll() {
        let ip_arr = this._getIPs();
        if (ip_arr === null) return;

        refreshSpin(true);
        log('WS discover all, hook = ' + hub.cfg.use_hook);
        const parallelMax = hub.cfg.use_hook ? 256 : 5;

        this._discovering = true;
        try {
            while (ip_arr.length) {
                await Promise.all(ip_arr.splice(0, parallelMax).map(async ip => this._discoverAll(ip)))
            }

        } finally {
            this._discovering = false;
            refreshSpin(false);
        }
    }

    constructor(ip) {
        super();
        this.ip = ip;
        this.ws = null;
        this._buffer = '';
        this.http_cfg = {
            upd: false,
        }
    }

    discover(id = null) {
        /*
        Как это работает:
        1. Мы инициируем открытие сокета
        2. Когда сокет открыт - отпрваляем в него discover
        3. Когда получаем ответ - добавляем устройство и отключаемся (discover успешен)
        4. Если за время ws_tout не успели получить ответ - отключаемся
        5. Также отключаемся при ошибке
        6. После закрытия соединения резолвим промис. Это позволит отследить момент, когда можно запустить новый запрос.
         */

        return new Promise(resolve => {
            let ws = new WebSocket(`ws://${this.ip}:${G.ws_port}/`, ['hub']);
            ws.onopen = () => ws.send(hub.cfg.prefix + (id ? '/' + id : '') + '\0');
            ws.onmessage = async (event) => {
                clearTimeout(tout);
                await parseDevice(event.data, Conn.WS, this.ip);
                ws.close();
            };
            ws.onerror = () => ws.close();
            ws.onclose = () => {
                ws = null;
                resolve();
            }

            const tout = setTimeout(() => {
                if (ws) ws.close();
            }, G.ws_tout);
        });
    }

    _getSocket(url) {
        return new Promise((resolve, reject) => {
            let ws = new WebSocket(url, ['hub']);
            ws.addEventListener('open', () => resolve(ws));
            ws.addEventListener('close', () => reject());
        });
    }

    async start() {
        if (!hub.cfg.use_ws) return;
        if (this.ws !== null) return;
        if (this.ip === null) return;
        this.ws = false; // do not allow to run in parallel

        await this.checkHttp();
        log(`WS ${this.ip} open...`);

        try {
            this.ws = await this._getSocket(`ws://${this.ip}:${G.ws_port}/`);
        } catch (e) {
            this.ws = null;
        }

        if (!this.ws) {
            log(`WS ${this.ip} failed to open`);
            return;
        }

        log(`WS ${this.ip} opened`);

        this.ws.addEventListener('error', () => {
            log(`WS ${this.ip} error`);
        });

        this.ws.addEventListener('close', async (e) => {
            log(`WS ${this.ip} closed`);
            console.log(e);
            this.ws = null;
            await sleep(500);

            if (hub.currentDevice && hub.currentDevice.connection === this)
                await this.start();
        });

        this.ws.addEventListener('message', async event => {
            reset_tout();
            this._buffer += event.data;
            if (this._buffer.endsWith('}\n')) {
                if (this._buffer.startsWith('\n{')) {
                    await parseDevice(this._buffer, Conn.WS);
                }
                this._buffer = '';
            }
        });
    }

    async checkHttp() {
        if (this.http_cfg.upd) return;

        try {
            const res = await fetch('http://' + this.ip + ':' + G.http_port + '/hub_http_cfg', {
                signal: AbortSignal.timeout(G.tout_prd)
            });
            const config = await res.json();

            for (let i in config) {
                if (config[i])
                    this.http_cfg[i] = config[i];
            }
            this.http_cfg.upd = true;

        } catch (e) {
            // ignore
        }
    }

    async send(cmd, name, value) {
        let uri = hub.cfg.prefix + '/' + hub.currentDeviceId + '/' + hub.cfg.client_id + '/' + cmd;
        if (name) uri += '/' + name;
        if (value) uri += '=' + value;
        if (this.connected) this.ws.send(uri.toString() + '\0');   // no '\0'
    }

    get connected() {
        return this.ws && this.ws.readyState === 1;
    }

    async stop() {
        if (!this.ws || this.ws.readyState >= 2) return;
        log(`WS ${this.ip} close...`);
        this.ws.close();
    }
}