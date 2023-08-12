import PinKeypadPage from "./uilib/PinKeypadPage";
import {
    app_title, fonts,
    app_version, baudrates, browser,
    checkIP, colors, getLocalIP, getMaskList,
    intToCol, isApp,
    isESP, isLocal, isPWA,
    isSSL,
    refreshSpin,
    showErr,
    showPopup,
    showPopupError, sleep, theme_cols, themes,
    window_ip
} from "./utils";
import WebsocketConnection from "./lib/WebsocketConnection";
import MqttConnection from "./lib/MqttConnection";
import SerialConnection from "./lib/SerialConnection";
import BluetoothConnection from "./lib/BluetoothConnection";
import GyverHub from "./lib/GyverHub";

let screen = 'main';
let deferredPrompt = null;
let show_version = false;
let cfg_changed = false;
let menu_f = false;
let updates = [];
let g_back_handler = null;

let cfg = {
  use_pin: false,
  pin: 0,
  ui_width: 450,
  theme: 'DARK',
  maincolor: 'GREEN',
  font: 'monospace',
  version: app_version,
  check_upd: true,
};
const hub = new GyverHub();


// ============= STARTUP ============
window.onload = async function () {
  if (!("serial" in navigator)) document.querySelector('#serial_col').style.display = 'none';
  if (!("bluetooth" in navigator)) document.querySelector('#bt_col').style.display = 'none';

  if (isSSL()) {
    document.querySelector('.btn-pwa-install-http').classList.add('info_btn_dis');
  } else {
    document.querySelector('.btn-pwa-install-https').classList.add('info_btn_dis');
  }

  for (let i of document.querySelectorAll('.browser'))
    i.textContent = browser();

  document.querySelector('.current-location').textContent = location.href;

  document.getElementById('title').innerHTML = app_title;
  document.getElementById('title').title = 'GyverHub v' + app_version + ' [' + hub.cfg.client_id + '] ' + (isPWA() ? 'PWA ' : '') + (isSSL() ? 'SSL ' : '') + (isLocal() ? 'Local ' : '') + (isESP() ? 'ESP ' : '') + (isApp() ? 'App ' : '');

  if (localStorage.hasOwnProperty('config')) {
    let cfg_r = JSON.parse(localStorage.getItem('config'));
    if (cfg_r.version !== cfg.version) {
      cfg_r.version = cfg.version;
      show_version = true;
    }
    if (Object.keys(cfg).length === Object.keys(cfg_r).length) {
      cfg = cfg_r;
      // if (!show_version) return;
    }
  }
  // localStorage.setItem('config', JSON.stringify(cfg));


  if (localStorage.hasOwnProperty('hub_config')) {
    let cfg_r = JSON.parse(localStorage.getItem('hub_config'));
    if (Object.keys(hub.cfg).length === Object.keys(cfg_r).length) {
      hub.cfg = cfg_r;
      // return;
    }
  }
  // localStorage.setItem('hub_config', JSON.stringify(hub.cfg));


  if (isESP()) hub.cfg.use_ws = true;

  /*NON-ESP*/
  try {
    const ip = await getLocalIP();
    if (ip.indexOf("local") < 0) {
      document.getElementById('local_ip').value = ip;
      hub.cfg.local_ip = ip;
    }
  } catch (e) {
  }
  /*/NON-ESP*/
  if (isESP()) {
    document.getElementById('local_ip').value = window_ip();
    hub.cfg.local_ip = window_ip();
  }

  update_theme();

  function preventDrop(e) {
    e.preventDefault()
    e.stopPropagation()
  }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => {
    document.body.addEventListener(e, preventDrop, false);
  });

  ['dragenter', 'dragover'].forEach(e => {
    document.body.addEventListener(e, function () {
      document.querySelectorAll('.drop_area').forEach((el) => {
        el.classList.add('active');
      });
    }, false);
  });

  ['dragleave', 'drop'].forEach(e => {
    document.body.addEventListener(e, function () {
      document.querySelectorAll('.drop_area').forEach((el) => {
        el.classList.remove('active');
      });
    }, false);
  });


  document.addEventListener('keydown', async function (e) {
    switch (e.keyCode) {
      case 116: // refresh on F5
        if (!e.ctrlKey) {
          e.preventDefault();
          await refresh_h();
        }
        break;

      case 192: // open cli on `
        if (hub.currentDeviceId) {
          e.preventDefault();
          toggleCLI();
        }
        break;

      default:
        break;
    }
  });

  window.history.pushState({page: 1}, "", "");
  window.onpopstate = async function () {
    window.history.pushState({page: 1}, "", "");
    await back_h();
  }

  /*NON-ESP*/
  if ('serviceWorker' in navigator && !isLocal() && !isApp() && app_version !== '__VER__') {
    await navigator.serviceWorker.register('/sw.js');
    window.addEventListener('beforeinstallprompt', (e) => deferredPrompt = e);
  }
  /*/NON-ESP*/

  if (cfg.use_pin) {
    const p = new PinKeypadPage(+cfg.pin);
    while (!await p.show()) {}
  }
  
  /*NON-ESP*/
  for (let baud of baudrates) {
    document.getElementById('baudrate').innerHTML += `<option value="${baud}">${baud}</option>`;
  }
  /*/NON-ESP*/
  for (let color in colors) {
    document.getElementById('maincolor').innerHTML += `<option value="${color}">${color}</option>`;
  }

  for (let font of fonts) {
    document.getElementById('font').innerHTML += `<option value="${font}">${font}</option>`;
  }

  for (let theme in themes) {
    document.getElementById('theme').innerHTML += `
    <option value="${theme}">${theme}</option>`;
  }

  const masks = getMaskList();
  for (let mask in masks) {
    document.getElementById('netmask').innerHTML += `<option value="${mask}">${masks[mask]}</option>`;
  }


  const info_labels_topics = {
    info_id: 'ID',
    info_set: 'Set',
    info_read: 'Read',
    info_get: 'Get',
    info_status: 'Status',
  };

  for (let id in info_labels_topics) {
    document.getElementById('info_topics').innerHTML += `
    <div class="cfg_row info">
      <label>${info_labels_topics[id]}</label>
      <label id="${id}" class="lbl_info info_small">-</label>
    </div>`;
  }


  for (let key in cfg) {
    if (key === 'version') continue;
    let el = document.getElementById(key);
    if (el === undefined) continue;
    if (el.type === 'checkbox') el.checked = cfg[key];
    else el.value = cfg[key];
  }
  for (let key in hub.cfg) {
    let el = document.getElementById(key);
    if (el === undefined) continue;
    if (el.type === 'checkbox') el.checked = hub.cfg[key];
    else el.value = hub.cfg[key];
  }


  update_theme();
  await show_screen('main');
  // load_devices();
  render_devices();
  await discover();
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();

  /*NON-ESP*/
  if (isSSL()) {
    document.getElementById('http_only_http').style.display = 'block';
    document.getElementById('http_settings').style.display = 'none';
    document.getElementById('pwa_unsafe').style.display = 'none';
  }
  if (isPWA() || isLocal() || isApp()) {
    document.getElementById('pwa_block').style.display = 'none';
  }
  if (isApp()) document.getElementById('app_block').style.display = 'none';

  await hub.serial.change();
  if (hub.cfg.use_mqtt) await hub.mqtt.start();

  setInterval(() => {
    if (hub.cfg.use_mqtt && !hub.mqtt.connected) {
      console.log('MQTT reconnect');
      hub.mqtt.start();
    }
  }, 5000);

  await sleep(1000);
  if (show_version)
    alert('Версия ' + app_version + '!\n' + '__NOTES__');
  /*/NON-ESP*/
}


/*NON-ESP*/
/**
 * @param {Device} device
 * @returns {Promise<void>}
 */
async function checkUpdates(device) {
  if (!cfg.check_upd) return;
  if (updates.includes(device.id)) return;
  let ver = device.info.version;
  if (!ver.includes('@')) return;
  let namever = ver.split('@');
  const resp = await fetch(`https://raw.githubusercontent.com/${namever[0]}/master/project.json`, {cache: "no-store"});
  let proj = await resp.json();
  if (proj.version === namever[1]) return;
  if (!device.isFocused) return;
  updates.push(device.id);
  if (confirm('Available new version v' + proj.version + ' for device [' + namever[0] + ']. Notes:\n' + proj.notes + '\n\nUpdate firmware?')) {
    if ('ota_url' in proj) await otaUrl(proj.ota_url, 'flash');
    else await otaUrl(`https://raw.githubusercontent.com/${namever[0]}/master/bin/firmware.${device.info.ota_t}`, 'flash');
  }
}

async function pwa_install(ssl) {
  if (ssl && !isSSL()) {
    if (confirm("Redirect to HTTPS?")) window.location.href = window.location.href.replace('http:', 'https:');
    else return;
  }
  if (!ssl && isSSL()) {
    if (confirm("Redirect to HTTP")) window.location.href = window.location.href.replace('https:', 'http:');
    else return;
  }
  if (!('serviceWorker' in navigator)) {
    alert('Error');
    return;
  }
  if (deferredPrompt !== null) {
    deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
  }
}

async function loadProjects() {
  const resp = await fetch("https://raw.githubusercontent.com/GyverLibs/GyverHub-projects/main/projects.txt", {cache: "no-store"});
  let projects = await resp.text();
  projects = projects.split('\n');
  for (let proj of projects) {
    if (!proj) continue;
    await loadProject(proj);
  }
}

async function loadProject(repo) {
  repo = repo.split('https://github.com/')[1];
  if (!repo) return;

  const resp = await fetch(`https://raw.githubusercontent.com/${repo}/master/project.json`, {cache: "no-store"});
  let proj = await resp.text();
  try {
    proj = JSON.parse(proj);
  } catch (e) {
    return;
  }
  if (!('version' in proj) || !('notes' in proj) || !('about' in proj)) return;
  let name = repo.split('/')[1];
  if (name.length > 30) name = name.slice(0, 30) + '..';
  document.getElementById('projects').innerHTML += `
  <div class="proj">
    <div class="proj_inn">
      <div class="proj_name">
        <a href="${'https://github.com/' + repo}" target="_blank" title="${repo} v${proj.version}">${name}</a>
      <div class="proj_about">${proj.about}</div>
    </div>
  </div>
  `;
}

/*/NON-ESP*/

// =============== PIN ================

function check_type(arg) {
  if (arg.value.length > 0) {
    let c = arg.value[arg.value.length - 1];
    if (c < '0' || c > '9') arg.value = arg.value.slice(0, -1);
  }
}

// ============== RENDER ==============
function render_devices() {
  document.getElementById('devices').innerHTML = '';
  // TODO for (let id in devices) addDevice(id);
}

async function refresh_h() {
  if (screen === 'device') await post('focus');
  else if (screen === 'info') await post('info');
  else if (screen === 'fsbr') await post('fsbr');
  else await discover();
}

async function back_h() {
  if (document.getElementById('fsbr_edit').style.display === 'block') {
    editor_cancel();
    return;
  }
  await stopFS();
  if (menu_f) {
    menuDeact();
    menu_show(0);
    return;
  }
  if (g_back_handler){
    g_back_handler();
    return;
  }
  switch (screen) {
    case 'device':
      await release_all();
      await close_device();
      break;
    case 'info':
    case 'fsbr':
      menuDeact();
      await showControls(hub.currentDevice.controls);
      await show_screen('device');
      break;
    case 'config':
      if (cfg_changed) save_cfg();
      cfg_changed = false;
      await show_screen('main');
      await discover();
      break;
    case 'projects':
    case 'test':
      await show_screen('main');
      break;
  }
}

function menu_show(state) {
  menu_f = state;
  let cl = document.getElementById('menu').classList;
  if (menu_f) cl.add('menu_show');
  else cl.remove('menu_show');
  document.getElementById('icon_menu').innerHTML = menu_f ? '' : '';
  document.getElementById('menu_overlay').style.display = menu_f ? 'block' : 'none';
}

function menu_h() {
  menu_show(!menu_f);
}

async function info_h() {
  await stopFS();
  menuDeact();
  menu_show(0);
  if (readModule(Modules.INFO)) await post('info');
  await show_screen('info');
  document.getElementById('menu_info').classList.add('menu_act');
}

async function fsbr_h() {
  menuDeact();
  menu_show(0);
  if (readModule(Modules.FSBR)) {
    await post('fsbr');
    document.getElementById('fsbr_inner').innerHTML = waiter();
  }
  document.getElementById('fs_browser').style.display = readModule(Modules.FSBR) ? 'block' : 'none';
  document.getElementById('fs_upload').style.display = readModule(Modules.UPLOAD) ? 'block' : 'none';
  document.getElementById('fs_otaf').style.display = readModule(Modules.OTA) ? 'block' : 'none';
  document.getElementById('fs_otaurl').style.display = readModule(Modules.OTA_URL) ? 'block' : 'none';
  document.getElementById('fs_format').style.display = readModule(Modules.FORMAT) ? 'inline-block' : 'none';
  document.getElementById('fs_update').style.display = readModule(Modules.FSBR) ? 'inline-block' : 'none';
  await show_screen('fsbr');
  document.getElementById('menu_fsbr').classList.add('menu_act');
}

async function device_h(id) {
  const device = hub.devices.get(id);
  if (WebsocketConnection.isDiscovering) return;
  if (!device || !device.connection) {
    //delete_h(id);
    return;
  }
  if (!device.isAccessAllowed) {
    const p = new PinKeypadPage(device.info.PIN);
    if (!await p.show()) {
      await show_screen("main");
      return;
    }
  }
  await open_device(device);
}

/**
 *
 * @param {Device} device
 * @returns {Promise<void>}
 */
async function open_device(device) {
  device.granted = true;
  /*NON-ESP*/
  await checkUpdates(device);
  /*/NON-ESP*/
  hub.currentDeviceId = device.id;
  refreshSpin(true);

  if (device.connection instanceof WebsocketConnection) {
    await device.connection.start();
  }

  await post('focus');

  console.log('Open device #' + device.id + ' via ???');

  document.getElementById('menu_user').innerHTML = '';
  await showControls(hub.currentDevice.controls, true);
  await show_screen('device');
  reset_ping();
}

async function close_device() {
  showErr(false);
    console.log('Close device #' + hub.currentDeviceId);

  if (hub.currentDevice.connection instanceof WebsocketConnection) {
    // 'unfocus' forbidden
    await hub.currentDevice.connection.stop();
    refreshSpin(false);

  } else {
    await post('unfocus');
  }
  hub.currentDeviceId = null;

  await show_screen('main');
  //sendDiscover();
  stop_ping();
  stop_tout();
}

async function show_screen(nscreen) {
  document.body.dataset.page = nscreen;
  // await stopFS();
  screen = nscreen;

  document.getElementById('title').innerHTML = app_title;

  if (screen === 'main') {
    document.getElementById('conn').innerHTML = '';
    showCLI(false);

  } else if (screen === 'test') {
    document.getElementById('title').innerHTML = 'UI Test';

  } else if (screen === 'projects') {
    document.getElementById('title').innerHTML = 'Projects';
    document.getElementById('projects').innerHTML = '';
    await loadProjects();

  } else if (screen === 'device') {
    document.getElementById('title').innerHTML = hub.currentDevice.info.name;

  } else if (screen === 'config') {
    document.getElementById('title').innerHTML = 'Config';

  } else if (screen === 'info') {
    document.getElementById('title').innerHTML = hub.currentDevice.info.name + '/info';
    let id = hub.currentDeviceId;
    document.getElementById('info_break_sw').checked = hub.currentDevice.break_widgets;
    document.getElementById('info_names_sw').checked = hub.currentDevice.show_names;
    document.getElementById('info_cli_sw').checked = document.getElementById('cli_cont').style.display === 'block';

    document.getElementById('info_id').innerHTML = id;
    document.getElementById('info_set').innerHTML = hub.cfg.prefix + '/' + id + '/set/*';
    document.getElementById('info_read').innerHTML = hub.cfg.prefix + '/' + id + '/read/*';
    document.getElementById('info_get').innerHTML = hub.cfg.prefix + '/hub/' + id + '/get/*';
    document.getElementById('info_status').innerHTML = hub.cfg.prefix + '/hub/' + id + '/status';
    document.getElementById('reboot_btn').style.display = readModule(Modules.REBOOT) ? 'block' : 'none';

    document.getElementById('info_version').innerHTML = '';
    document.getElementById('info_net').innerHTML = '';
    document.getElementById('info_memory').innerHTML = '';
    document.getElementById('info_system').innerHTML = '';

  } else if (screen === 'fsbr') {
    document.getElementById('title').innerHTML = hub.currentDevice.info.name + '/fs';
  }
}

function delete_h(id) {
  if (confirm('Delete ' + id + '?')) {
    document.getElementById("device#" + id).remove();
    hub.devices.delete(id);
    save_devices();
    return 1;
  }
  return 0;
}

// ============== CLI =============
function printCLI(text, color) {
  if (document.getElementById('cli_cont').style.display === 'block') {
    if (document.getElementById('cli').innerHTML) document.getElementById('cli').innerHTML += '\n';
    let st = color ? `style="color:${intToCol(color)}"` : '';
    document.getElementById('cli').innerHTML += `><span ${st}">${text}</span>`;
    document.getElementById('cli').scrollTop = document.getElementById('cli').scrollHeight;
  }
}

function toggleCLI() {
  document.getElementById('cli').innerHTML = "";
  document.getElementById('cli_input').value = "";
  showCLI(!(document.getElementById('cli_cont').style.display === 'block'));
}

function showCLI(v) {
  document.getElementById('bottom_space').style.height = v ? '170px' : '50px';
  document.getElementById('cli_cont').style.display = v ? 'block' : 'none';
  if (v) document.getElementById('cli_input').focus();
  document.getElementById('info_cli_sw').checked = v;
}

async function checkCLI(event) {
  if (event.key === 'Enter') await sendCLI();
}

async function sendCLI() {
  await post('cli', 'cli', document.getElementById('cli_input').value);
  document.getElementById('cli_input').value = "";
}

// ============== DISCOVER =============

async function discover() {
  if (isESP()) {
    let has = false;
    for (const device of hub.devices.values()) {
      if (device.ip && window.location.href.includes(device.ip)) {
        has = true;
        break;
      }
    }

    if (!has && checkIP(window_ip())) {
      const ws = new WebsocketConnection(window_ip());
      await ws.discover()
    }
  }

  for (const [id, device] of hub.devices) {
    console.log("Clear connections for " + device.id)
    device.connections.length = 0;
    document.getElementById(`device#${id}`).className = "device offline";

    document.getElementById(`Serial#${id}`).style.display = 'none';
    document.getElementById(`BT#${id}`).style.display = 'none';
    document.getElementById(`WS#${id}`).style.display = 'none';
    document.getElementById(`MQTT#${id}`).style.display = 'none';
  }

  /*NON-ESP*/
  if (hub.cfg.use_mqtt) await MqttConnection.discover();
  if (hub.cfg.use_serial) await SerialConnection.discover();
  if (hub.cfg.use_bt) await BluetoothConnection.discover();
  /*/NON-ESP*/
  if (hub.cfg.use_ws && !isSSL()) await WebsocketConnection.discover();
}

async function discover_all() {
  /*NON-ESP*/
  if (hub.cfg.use_mqtt) await MqttConnection.discoverAll();
  if (hub.cfg.use_serial) await SerialConnection.discoverAll();
  if (hub.cfg.use_bt) await BluetoothConnection.discoverAll();
  /*/NON-ESP*/
  if (hub.cfg.use_ws && !isSSL()) await WebsocketConnection.discoverAll();
  if (cfg_changed) save_cfg();
  cfg_changed = false;
  await show_screen('main');
  await discover();
}

// ============= CFG ==============
function update_cfg(el) {
  if (el.type === 'text') el.value = el.value.trim();
  let val = (el.type === 'checkbox') ? el.checked : el.value;
  if (el.id in cfg) cfg[el.id] = val;
  else if (el.id in hub.cfg) hub.cfg[el.id] = val;
  cfg_changed = true;
  update_theme();
}

function save_cfg() {
  localStorage.setItem('config', JSON.stringify(cfg));
  localStorage.setItem('hub_config', JSON.stringify(hub.cfg));
}

async function cfg_export() {
  try {
    const config = {
      cfg, 'hub': hub.cfg //, devices
    }
    const text = btoa(JSON.stringify(config));
    await navigator.clipboard.writeText(text);
    showPopup('Copied to clipboard');
  } catch (e) {
    showPopupError('Export error');
  }
}

async function cfg_import() {
  try {
    let text = await navigator.clipboard.readText();
    let config
    try {
      config = JSON.parse(atob(text));
    } catch (e) {
    }
    cfg = config.cfg;
    hub.cfg = config.hub;
    // devices = config.devices;

    save_cfg();
    save_devices();
    showPopup('Import done');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    showPopupError('Wrong data');
  }
}

function update_theme() {
  let v = themes[cfg.theme];
  let r = document.querySelector(':root');
  r.style.setProperty('--back', theme_cols[v][0]);
  r.style.setProperty('--tab', theme_cols[v][1]);
  r.style.setProperty('--font', theme_cols[v][2]);
  r.style.setProperty('--font2', theme_cols[v][3]);
  r.style.setProperty('--dark', theme_cols[v][4]);
  r.style.setProperty('--thumb', theme_cols[v][5]);
  r.style.setProperty('--black', theme_cols[v][6]);
  r.style.setProperty('--scheme', theme_cols[v][7]);
  r.style.setProperty('--font_inv', theme_cols[v][8]);
  r.style.setProperty('--shad', theme_cols[v][9]);
  r.style.setProperty('--ui_width', cfg.ui_width + 'px');
  r.style.setProperty('--prim', intToCol(colors[cfg.maincolor]));
  r.style.setProperty('--font_f', cfg.font);

  let b = 'block';
  let n = 'none';
  let f = 'var(--font)';
  let f3 = 'var(--font3)';

  document.getElementById('ws_block').style.display = hub.cfg.use_ws ? b : n;
  document.getElementById('ws_label').style.color = hub.cfg.use_ws ? f : f3;
  document.getElementById('pin_block').style.display = cfg.use_pin ? b : n;
  document.getElementById('pin_label').style.color = cfg.use_pin ? f : f3;

  /*NON-ESP*/
  document.getElementById('mq_block').style.display = hub.cfg.use_mqtt ? b : n;
  document.getElementById('mqtt_label').style.color = hub.cfg.use_mqtt ? f : f3;
  document.getElementById('bt_block').style.display = hub.cfg.use_bt ? b : n;
  document.getElementById('bt_label').style.color = hub.cfg.use_bt ? f : f3;
  document.getElementById('serial_block').style.display = hub.cfg.use_serial ? b : n;
  document.getElementById('serial_label').style.color = hub.cfg.use_serial ? f : f3;
  /*/NON-ESP*/
}