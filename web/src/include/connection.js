const http_port = 80;
const ws_port = 81;
const tout_prd = 2800;
const ping_prd = 3000;
const oninput_prd = 100;
const ws_tout = 4000;

// =============== VARS ==============
let discovering = false;
let ws_focus_flag = false;
let tout_interval = null;
let ping_interval = null;
let set_tout = null;
let oninput_tout = null;
let refresh_ui = false;

const Conn = {
  SERIAL: 0,
  BT: 1,
  WS: 2,
  MQTT: 3,
  NONE: 4,
  ERROR: 5,
};
const ConnNames = ['Serial', 'BT', 'WS', 'MQTT', 'None', 'Error'];

// ============== SEND ================
async function post(cmd, name = '', value = '') {
  if (!focused) return;
  if (cmd === 'set' && !readModule(Modules.SET)) return;
  if (cmd === 'set') {
    if (set_tout) clearTimeout(set_tout);
    prev_set = {name: name, value: value};
    set_tout = setTimeout(() => {
      set_tout = prev_set = null;
    }, tout_prd);
  }
  cmd = cmd.toString();
  name = name.toString();
  value = value.toString();

  const device = hub.devices.get(focused);
  await device.connection.send(cmd, name, value);

  let id = focused;

  reset_ping();
  reset_tout();
  log('Post to #' + id + ' via ' + ConnNames[devices_t[focused].conn] + ', cmd=' + cmd + (name ? (', name=' + name) : '') + (value ? (', value=' + value) : ''))
}

async function release_all() {
  if (pressId) await post('set', pressId, 0);
  pressId = null;
}

async function click_h(name, dir) {
  pressId = (dir === 1) ? name : null;
  await post('set', name, dir);
  reset_ping();
}

async function set_h(name, value = '') {
  await post('set', name, value);
  reset_ping();
}

async function input_h(name, value) {
  if (!(name in oninp_buffer)) oninp_buffer[name] = {'value': null, 'tout': null};

  if (!oninp_buffer[name].tout) {
    await set_h(name, value);

    oninp_buffer[name].tout = setTimeout(async () => {
      if (oninp_buffer[name].value != null && !tout_interval) await set_h(name, oninp_buffer[name].value);
      oninp_buffer[name].tout = null;
      oninp_buffer[name].value = null;
    }, oninput_prd);
  } else {
    oninp_buffer[name].value = value;
  }
}

async function reboot_h() {
  await post('reboot');
}

// ============== TIMEOUT =============
function change_conn(conn) {
  EL('conn').innerHTML = ConnNames[conn];
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
    log('Connection lost');
    refresh_ui = true;
    change_conn(Conn.ERROR);
    showErr(true);
    stop_tout();
  }, tout_prd);
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
  }, ping_prd);
}

function parsePacket(id, text, conn) {
  function checkPacket() {
    if (devices_t[id]['buffer'][ConnNames[conn]].endsWith('}\n')) {
      if (devices_t[id]['buffer'][ConnNames[conn]].startsWith('\n{')) parseDevice(id, devices_t[id]['buffer'][ConnNames[conn]], conn);
      devices_t[id]['buffer'][ConnNames[conn]] = '';
    }
  }

  if (conn === Conn.BT || conn === Conn.SERIAL) {
    for (let i = 0; i < text.length; i++) {
      devices_t[id]['buffer'][ConnNames[conn]] += text[i];
      checkPacket();
    }
  } else {
    devices_t[id]['buffer'][ConnNames[conn]] += text;
    checkPacket();
  }
}

// =============== MQTT ================
/*NON-ESP*/
async function mq_start() {
  await hub.mqtt.start();
}

async function mq_stop() {
  await hub.mqtt.stop();
}

function mq_show_icon(state) {
  EL('mqtt_ok').style.display = state ? 'inline-block' : 'none';
}

// ============= WEBSOCKET ==============

let bt_buffer = '';

async function manual_ws_h(ip) {
  await hub.ws.manualIp(ip);
}

// ================ SERIAL ================
async function serial_select() {
  await hub.serial.select();
}

async function serial_toggle() {
  await hub.serial.toggle();
}

async function serial_change() {
  await hub.serial.change();
}

function serial_show_icon(state) {
  EL('serial_ok').style.display = state ? 'inline-block' : 'none';
}

async function bt_toggle() {
  await hub.bt.toggle();
}

function bt_show_ok(state) {
  EL('bt_ok').style.display = state ? 'inline-block' : 'none';
}
