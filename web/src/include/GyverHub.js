function getMaskList() {
  let list = [];
  for (let i = 0; i < 33; i++) {
    let imask;
    if (i === 32) imask = 0xffffffff;
    else imask = ~(0xffffffff >>> i);
    list.push(`${(imask >>> 24) & 0xff}.${(imask >>> 16) & 0xff}.${(imask >>> 8) & 0xff}.${imask & 0xff}`);
  }
  return list;
}

String.prototype.hashCode = function () {
  if (!this.length) return 0;
  let hash = new Uint32Array(1);
  for (let i = 0; i < this.length; i++) {
    hash[0] = ((hash[0] << 5) - hash[0]) + this.charCodeAt(i);
  }
  return hash[0];
}

class Connection {
  /**
   *
   * @param {String} cmd
   * @param {String} name
   * @param {String} value
   * @returns {Promise<void>}
   */
  async send(cmd, name, value) {}

  async discover() {}
}

class Device {
  /** @type Connection */
  connection = null

  constructor(id) {
    this.id = id;
  }

  addConnectionType(t){
    switch (devices_t[this.id].conn){
      case Conn.MQTT:
        this.connection = hub.mqtt;
        break;
      case Conn.WS:
        this.connection = hub.ws;
        break;
      case Conn.BT:
        this.connection = hub.bt;
        break;
      case Conn.SERIAL:
        this.connection = hub.serial;
        break;
    }
  }
}

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

  serial = new SerialConnection();
  mqtt = new MqttConnection();
  ws = new WebsocketConnection();
  bt = new BluetoothConnection();
}

class MqttConnection extends Connection {
  constructor() {
    super();
    this._client = null;
    this._discover_flag = false;
    this._pref_list = [];
  }

  get connected() {
    return this._client && this._client.connected;
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
      mq_show_icon(0);
      return;
    }

    this._client.on('connect', async () => {
      mq_show_icon(1);
      this._client.subscribe(hub.cfg.prefix + '/hub');

      this._pref_list = [hub.cfg.prefix];
      this._client.subscribe(hub.cfg.prefix + '/hub/' + hub.cfg.client_id + '/#');

      for (let id in devices) {
        if (!this._pref_list.includes(devices[id].prefix)) {
          await this._client.subscribeAsync(devices[id].prefix + '/hub/' + hub.cfg.client_id + '/#');
          this._pref_list.push(devices[id].prefix);
        }
        await this._client.subscribeAsync(devices[id].prefix + '/hub/' + id + '/get/#');
      }

      if (this._discover_flag) {
        this._discover_flag = false;
        await this.discover();
      }
    });

    this._client.on('error', function () {
      mq_show_icon(0);
      this._client.end();
    });

    this._client.on('close', function () {
      mq_show_icon(0);
      this._client.end();
    });

    this._client.on('message', async (topic, text) => {
      topic = topic.toString();
      text = text.toString();
      for (let pref of this._pref_list) {
        // prefix/hub
        if (topic === (pref + '/hub')) {
          await parseDevice('broadcast', text, Conn.MQTT);

          // prefix/hub/hubid/id
        } else if (topic.startsWith(pref + '/hub/' + hub.cfg.client_id + '/')) {
          let id = topic.split('/').slice(-1)[0];
          if (!(id in devices) || !(id in devices_t)) {
            await parseDevice(id, text, Conn.MQTT);
            return;
          }

          parsePacket(id, text, Conn.MQTT);

          // prefix/hub/id/get/name
        } else if (topic.startsWith(pref + '/hub/') && topic.includes('/get/')) {
          let idname = topic.split(pref + '/hub/')[1].split('/get/');
          if (idname[0] !== focused || idname.length !== 2) return;
          log('Got GET from id=' + idname[0] + ', name=' + idname[1] + ', value=' + text);
          await applyUpdate(idname[1], text);
          stop_tout();
        } else {
          log('Got MQTT unknown');
        }
      }
    });
  }

  async send(cmd, name, value) {
    let uri0 = devices[focused].prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
    if (this.connected) await this._client.publishAsync(uri0 + (name.length ? ('/' + name) : ''), value);  // no '\0'
  }

  async discover() {
    if (!this.connected) this._discover_flag = true;
    else for (let id in devices) {
      await this._client.publishAsync(devices[id].prefix + '/' + id, hub.cfg.client_id);
    }
    log('MQTT discover');
  }

  async stop() {
    if (this.connected) await this._client.endAsync();
  }

  async discoverAll() {
    if (!this.connected) return;
    if (!(hub.cfg.prefix in this._pref_list)) {
      await this._client.subscribeAsync(hub.cfg.prefix + '/hub');
      this._pref_list.push(hub.cfg.prefix);
      await this._client.subscribeAsync(hub.cfg.prefix + '/hub/' + hub.cfg.client_id + '/#');
    }
    await this._client.publishAsync(hub.cfg.prefix, hub.cfg.client_id)
    log('MQTT discover all');
  }

  async initNewDevice(id) {
    if (this.connected) {
      await this._client.subscribeAsync(devices[id].prefix + '/hub/' + id + '/get/#');
      await this._client.subscribeAsync(devices[id].prefix + '/hub/' + hub.cfg.client_id + '/#');
      if (!this._pref_list.includes(devices[id].prefix)) this._pref_list.push(devices[id].prefix);
    }
  }
}

class WebsocketConnection extends Connection {
  async start(id) {
    if (!hub.cfg.use_ws) return;
    await this.checkHttp(id);
    if (devices_t[id].ws) return;
    if (devices[id].ip === 'unset') return;
    log(`WS ${id} open...`);

    devices_t[id].ws = new WebSocket(`ws://${devices[id].ip}:${ws_port}/`, ['hub']);

    devices_t[id].ws.onopen = function () {
      log(`WS ${id} opened`);
      if (ws_focus_flag) {
        ws_focus_flag = false;
        post('focus');
      }
      if (id !== focused) devices_t[id].ws.close();
    };

    devices_t[id].ws.onclose = () => {
      log(`WS ${id} closed`);
      devices_t[id].ws = null;
      ws_focus_flag = false;
      if (id === focused) setTimeout(() => this.start(id), 500);
    };

    devices_t[id].ws.onerror = function () {
      log(`WS ${id} error`);
    };

    devices_t[id].ws.onmessage = function (event) {
      reset_tout();
      parsePacket(id, event.data, Conn.WS);
    };
  }

  async checkHttp(id) {
    if (devices_t[id].http_cfg.upd) return;

    try {
      const res = await fetch('http://' + devices[id].ip + ':' + http_port + '/hub_http_cfg');
      const config = await res.json();
      for (let i in config) {
        if (config[i])
          devices_t[id].http_cfg[i] = config[i];
      }
    } catch (e) {
      // ignore
    }
    // TODO xhr.timeout = tout_prd;
  }

  async discover() {
    for (let id in devices) {
      if (devices[id].ip === 'unset') continue;
      await this.discoverIp(devices[id].ip, id);
      log('WS discover');
    }
  }

  discoverIp(ip, id = 'broadcast') {
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
      let ws = new WebSocket(`ws://${ip}:${ws_port}/`, ['hub']);
      ws.onopen = () => ws.send(hub.cfg.prefix + (id !== 'broadcast' ? ('/' + id) : '') + '\0');
      ws.onmessage = async function (event) {
        clearTimeout(tout);
        await parseDevice(id, event.data, Conn.WS, ip);
        ws.close();
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        ws = null;
        resolve();
      }

      const tout = setTimeout(() => {
        if (ws) ws.close();
      }, ws_tout);
    });
  }

  async discoverIps(ips) {
    discovering = true;
    refreshSpin(true);

    try {
      while (ips) {
        await Promise.all(ips.splice(0, 5).map(ip => this.discoverIp(ip)))
      }

    } finally {
      refreshSpin(false);
      discovering = false;
    }

    log('WS discover all');
  }

  async _discoverHook(ip) {
    try {
      const res = await fetch('http://' + ip + ':' + http_port + '/hub_discover_all', {
        signal: AbortSignal.timeout(tout_prd)
      });
      if (res.status !== 200) return;

      const text = await res.text();
      if (text !== 'OK') return;

      await this.discoverIp(ip);
    } catch (e) {
    }
  }

  async httpHook(ips) {
    discovering = true;
    refreshSpin(true);

    try {
      await Promise.all(ips.map(ip => this._discoverHook(ip)));

    } finally {
      refreshSpin(false);
      discovering = false;
    }

    log('WS hook discover all');
  }

  async discoverAll() {
    let ip_arr = getIPs();
    if (ip_arr == null) return;
    if (hub.cfg.use_hook) await this.httpHook(ip_arr);
    else await this.discoverIps(ip_arr);
  }

  async manualIp(ip) {
    if (!checkIP(ip)) {
      showPopupError('Wrong IP!');
      return;
    }
    log('WS manual ' + ip);
    await this.discoverIp(ip);
    await back_h();
  }

  async send(cmd, name, value) {
    let uri = devices[focused].prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
    if (name) uri += '/' + name;
    if (value) uri += '=' + value;
    if (this.connected(focused)) devices_t[focused].ws.send(uri.toString() + '\0');   // no '\0'
  }

  connected(id) {
    return (devices_t[id].ws && devices_t[id].ws.readyState === 1);
  }

  async stop(id) {
    if (!devices_t[id].ws || devices_t[id].ws.readyState >= 2) return;
    log(`WS ${id} close...`);
    devices_t[id].ws.close();
  }
}

class SerialConnection extends Connection {
  constructor() {
    super();
    this._port = null;
    this._reader = null;
    this._buffer = null;
    this._connected = false;
  }

  async start() {
    if (this._connected) return;

    const ports = await navigator.serial.getPorts();
    if (!ports.length) return;
    this._port = ports[0];

    await this._port.open({baudRate: hub.cfg.baudrate});
    this._run(); // launch!
  }

  async _run() {
    this._connected = true;
    try {
      log('[Serial] Open');
      serial_show_icon(true);
      if (this._buffer) {
        sleep(2000).then(async () => {
          await this.send(this._buffer);
          this._buffer = '';
        }); // launch, send data after 2 seconds delay
      }

      await this._readLoop();

    } catch (error) {
      log("[Serial] " + error);

    } finally {
      await this._port.close();
      this._port = null;

      log('[Serial] Close port');

      this._connected = false;
      serial_show_icon(false);
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

          if (focused) {
            parsePacket(focused, data, Conn.SERIAL);
          } else {
            buffer += data;
            if (buffer.endsWith("}\n")) {
              await parseDevice('broadcast', buffer, Conn.SERIAL);
              buffer = '';
            }
          }

        }

      } catch (error) {
        log("[Serial] " + error);

      } finally {
        await this._reader.releaseLock();
        this._reader = null;
        log('[Serial] Close readable');
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

  async discover() {
    await this.send(hub.cfg.prefix);
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
    serial_show_icon(0);
    if (this._connected) await this.stop();
    const ports = await navigator.serial.getPorts();
    EL('serial_btn').style.display = ports.length ? 'inline-block' : 'none';
  }

  async send(cmd, name, value) {
    let uri = devices[focused].prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
    if (name) uri += '/' + name;
    if (value) uri += '=' + value;

    if (!this._connected) {
      await this.start();
      this._buffer = uri;
      return;
    }
    try {
      const encoder = new TextEncoder();
      const writer = this._port.writable.getWriter();
      await writer.write(encoder.encode(uri + '\0'));
      writer.releaseLock();
    } catch (e) {
      log("[Serial] " + e);
    }
  }
}

class BluetoothConnection extends Connection {
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
  }

  async toggle() {
    if (!this.state()) {
      await this.open();
      EL('bt_device').innerHTML = 'Connecting...';
    } else await this.close();
  }

  async discover() {
    await this.send(hub.cfg.prefix);
  }

  async onmessage(data) {
    if (focused) {
      parsePacket(focused, data, Conn.BT);
    } else {
      bt_buffer += data;
      if (bt_buffer.endsWith("}\n")) {
        await parseDevice('broadcast', bt_buffer, Conn.BT);
        bt_buffer = '';
      }
    }
  }

  onopen() {
    EL('bt_btn').innerHTML = 'Disconnect';
    EL('bt_device').innerHTML = this.getName();
    bt_show_ok(true);
  }

  onclose() {
    EL('bt_btn').innerHTML = 'Connect';
    EL('bt_device').innerHTML = 'Not Connected';
    bt_show_ok(false);
  }

  onerror() {
    EL('bt_device').innerHTML = 'Not Connected';
    bt_show_ok(false);
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
    let uri = devices[focused].prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
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

  _connectToDevice(device) {
    return (device ? Promise.resolve(device) : this._requestBluetoothDevice()).then((device) => this._connectDeviceAndCacheCharacteristic(device)).then((characteristic) => this._startNotifications(characteristic)).catch((error) => {
      this._onerror(error);
      return Promise.reject(error);
    });
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