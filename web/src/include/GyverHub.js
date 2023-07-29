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

class Device {
  /** @type Connection[] */
  connections = []
  controls = null
  granted = false
  port = null
  ip = null
  info = {}

  constructor(id, info) {
    this.id = id;
    this.updateInfo(info)

    let icon = (!isESP() && this.info.icon) ? `<span class="icon icon_min" id="icon#${id}">${this.info.icon}</span>` : '';
    EL('devices').innerHTML += `
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
    EL(`device#${id}`).className = "device";
  }

  get connection() {
    if (this.connections)
      return this.connections[0];
    throw new Error("No connection to device");
  }

  addConnectionType(conn) {
    let connection;
    switch (conn) {
      case Conn.MQTT:
        connection = hub.mqtt;
        break;
      case Conn.WS:
        connection = new WebsocketConnection(this.ip);
        break;
      case Conn.BT:
        connection = hub.bt;
        break;
      case Conn.SERIAL:
        connection = hub.serial;
        break;
    }
    if (connection in this.connections) return;

    this.connections.push(connection);
    this.connections.sort((a, b) => a.priority - b.priority);
    EL(`${ConnNames[conn]}#${this.id}`).style.display = 'unset';
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

  async handlePacket(data, connection, ip) {
    switch (data.type) {
      case 'discover':
        if (focused) return;

        // COMPATIBILITY
        if (data.modules === undefined) data.modules = 0;
        if (data.ota_t === undefined) data.ota_t = 'bin';


        if (this.ip === null && ip !== null) {
          this.ip = ip;
        }

        log('Update device #' + this.id);
        this.updateInfo(data);
        this.addConnectionType(connection);

        if (data.icon.length) EL(`icon#${this.id}`).innerHTML = data.icon;
        EL(`name#${this.id}`).innerHTML = data.name ? data.name : 'Unknown';
        EL(`device#${this.id}`).className = "device";
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
        if (this.id !== focused) return;
        printCLI(data.text, data.color);
        break;

      case 'update':
        if (this.id !== focused) return;
        for (let name in data.updates) await applyUpdate(name, data.updates[name]);
        break;

      case 'ui':
        if (this.id !== focused) return;
        this.controls = data.controls;
        await showControls(data.controls, false, connection, devices[focused].ip);
        break;

      case 'info':
        if (this.id !== focused) return;
        showInfo(data);
        break;

      case 'push':
        if (!(this.id in devices)) return;
        let date = (new Date).getTime();
        if (date - push_timer < 3000) return;
        push_timer = date;
        showNotif(data.text, this.info.name);
        break;

      // ============== FS ==============
      case 'fsbr':
        if (this.id !== focused) return;
        showFsbr(data);
        break;

      case 'fs_error':
        if (this.id !== focused) return;
        EL('fsbr_inner').innerHTML = '<div class="fs_err">FS ERROR</div>';
        break;

      // ============= FETCH =============
      case 'fetch_start':
        if (this.id !== focused) return;

        fetching = focused;
        fetch_file = '';
        await post('fetch_chunk', fetch_path);
        reset_fetch_tout();
        break;

      case 'fetch_next_chunk':
        if (this.id !== fetching) return;

        fetch_file += data.data;
        if (data.chunk === data.amount - 1) {
          if (fetch_to_file) downloadFileEnd(fetch_file);
          else fetchEnd(fetch_name, fetch_index, fetch_file);
        } else {
          let perc = Math.round(data.chunk / data.amount * 100);
          if (fetch_to_file) processFile(perc);
          else EL('process#' + fetch_index).innerHTML = perc + '%';
          await post('fetch_chunk', fetch_path);
          reset_fetch_tout();
        }
        break;

      case 'fetch_err':
        if (this.id !== focused) return;

        if (fetch_to_file) errorFile();
        else EL('process#' + fetch_index).innerHTML = 'Aborted';
        showPopupError('Fetch aborted');
        stopFS();
        break;

      // ============= UPLOAD =============
      case 'upload_err':
        showPopupError('Upload aborted');
        setLabelTout('file_upload_btn', 'Error!', 'Upload');
        stopFS();
        break;

      case 'upload_start':
        if (this.id !== focused) return;
        uploading = focused;
        uploadNextChunk();
        reset_upload_tout();
        break;

      case 'upload_next_chunk':
        if (this.id !== uploading) return;
        uploadNextChunk();
        reset_upload_tout();
        break;

      case 'upload_end':
        showPopup('Upload Done!');
        stopFS();
        setLabelTout('file_upload_btn', 'Done!', 'Upload');
        await post('fsbr');
        break;

      // ============= OTA =============
      case 'ota_err':
        showPopupError('Ota aborted');
        setLabelTout('ota_label', 'ERROR', 'IDLE');
        stopFS();
        break;

      case 'ota_start':
        if (this.id !== focused) return;
        uploading = focused;
        otaNextChunk();
        reset_ota_tout();
        break;

      case 'ota_next_chunk':
        if (this.id !== uploading) return;
        otaNextChunk();
        reset_ota_tout();
        break;

      case 'ota_end':
        showPopup('OTA Done! Reboot');
        stopFS();
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
  priority = -1

  constructor() {
    super();
    this._client = null;
    this._discover_flag = false;
    this._pref_list = [];
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

    this._client.on('connect', async () => {
      this.showIcon(1);
      this._client.subscribe(hub.cfg.prefix + '/hub');

      this._pref_list = [hub.cfg.prefix];
      this._client.subscribe(hub.cfg.prefix + '/hub/' + hub.cfg.client_id + '/#');

      for (let id in devices) {
        if (!this._pref_list.includes(hub.cfg.prefix)) {
          await this._client.subscribeAsync(hub.cfg.prefix + '/hub/' + hub.cfg.client_id + '/#');
          this._pref_list.push(hub.cfg.prefix);
        }
        await this._client.subscribeAsync(hub.cfg.prefix + '/hub/' + id + '/get/#');
      }

      if (this._discover_flag) {
        this._discover_flag = false;
        await this.discover();
      }
    });

    this._client.on('error', function () {
      this.showIcon(0);
      this._client.end();
    });

    this._client.on('close', function () {
      this.showIcon(0);
      this._client.end();
    });

    this._client.on('message', async (topic, text) => {
      topic = topic.toString();
      text = text.toString();
      for (let pref of this._pref_list) {
        // prefix/hub
        if (topic === (pref + '/hub')) {
          await parseDevice(text, Conn.MQTT);

          // prefix/hub/hubid/id
        } else if (topic.startsWith(pref + '/hub/' + hub.cfg.client_id + '/')) {
          let id = topic.split('/').slice(-1)[0];
          if (!(id in devices) || !(id in devices_t)) {
            await parseDevice(text, Conn.MQTT);
            return;
          }

          if (!this._buffers[id]) this._buffers[id] = '';
          this._buffers[id] += text;
          if (this._buffers[id].endsWith('}\n')) {
            if (this._buffers[id].startsWith('\n{')) {
              await parseDevice(this._buffers[id], Conn.MQTT);
            }
            this._buffers[id] = '';
          }

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
    let uri0 = hub.cfg.prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
    if (this.connected) await this._client.publishAsync(uri0 + (name.length ? ('/' + name) : ''), value);  // no '\0'
  }

  async stop() {
    if (this.connected) await this._client.endAsync();
  }

  static async discover() {
    await hub.mqtt.discoverConn();
  }

  async discoverConn() {
    if (!this.connected) this._discover_flag = true;
    else for (let id in devices) {
      await this._client.publishAsync(hub.cfg.prefix + '/' + id, hub.cfg.client_id);
    }
    log('MQTT discover');
  }

  static async discoverAll() {
    await hub.mqtt.discoverAllConn();
  }

  async discoverAllConn() {
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
      await this._client.subscribeAsync(hub.cfg.prefix + '/hub/' + id + '/get/#');
      await this._client.subscribeAsync(hub.cfg.prefix + '/hub/' + hub.cfg.client_id + '/#');
      if (!this._pref_list.includes(hub.cfg.prefix)) this._pref_list.push(hub.cfg.prefix);
    }
  }
}

class WebsocketConnection extends Connection {
  static _discovering = false;

  static get isDiscovering() {
    return this._discovering;
  }

  static async discover() {
    for (let id in devices) {
      if (devices[id].ip === 'unset') continue;
      const ws = new this(devices[id].ip);
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
    await back_h();
  }

  static async _discoverAll(ip) {
    try {
      if (hub.cfg.use_hook) {
        const res = await fetch('http://' + ip + ':' + http_port + '/hub_discover_all', {
          signal: AbortSignal.timeout(tout_prd)
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
      let ws = new WebSocket(`ws://${this.ip}:${ws_port}/`, ['hub']);
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
      }, ws_tout);
    });
  }

  get focused() {
    return; // TODO
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
      this.ws = await this._getSocket(`ws://${this.ip}:${ws_port}/`);
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

    this.ws.addEventListener('close', async () => {
      log(`WS ${this.ip} closed`);
      if (this.focused) {
        await sleep(500);
        await this.start();
      }
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

    if (!this.focused) this.ws.close();
  }

  async checkHttp() {
    if (this.http_cfg.upd) return;

    try {
      const res = await fetch('http://' + this.ip + ':' + http_port + '/hub_http_cfg', {
        signal: AbortSignal.timeout(tout_prd)
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
    let uri = hub.cfg.prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
    if (name) uri += '/' + name;
    if (value) uri += '=' + value;
    if (this.connected) this.ws.send(uri.toString() + '\0');   // no '\0'
  }

  get connected() {
    return this.ws && this.readyState === 1;
  }

  async stop() {
    if (!this.ws || this.ws.readyState >= 2) return;
    log(`WS ${this.ip} close...`);
    this.ws.close();
  }
}

class SerialConnection extends Connection {
  priority = 500

  constructor() {
    super();
    this._port = null;
    this._reader = null;
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

  showIcon(state) {
    EL('serial_ok').style.display = state ? 'inline-block' : 'none';
  }

  async _run() {
    this._connected = true;
    try {
      log('[Serial] Open');
      this.showIcon(true);

      await this._readLoop();

    } catch (error) {
      log("[Serial] " + error);

    } finally {
      await this._port.close();
      this._port = null;

      log('[Serial] Close port');

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
                await parseDevice(buffer, Conn.SERIAL);
              }
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

  static async discover() {
    await hub.serial.send(hub.cfg.prefix);
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
    EL('serial_btn').style.display = ports.length ? 'inline-block' : 'none';
  }

  async send(cmd, name, value) {
    let uri = hub.cfg.prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
    if (name) uri += '/' + name;
    if (value) uri += '=' + value;

    if (!this._connected) {
      await this.start();
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
    let uri = hub.cfg.prefix + '/' + focused + '/' + hub.cfg.client_id + '/' + cmd;
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