let push_timer = 0;
let prev_set = null;

async function applyUpdate(name, value) {
  if (screen !== 'device') return;
  if (prev_set && prev_set.name === name && prev_set.value === value) {
    prev_set = null;
    return;
  }
  if (name in prompts) {
    await release_all();
    let res = prompt(value ? value : prompts[name].label, prompts[name].value);
    if (res !== null) {
      prompts[name].value = res;
      await set_h(name, res);
    }
    return;
  }
  if (name in confirms) {
    await release_all();
    let res = confirm(value ? value : confirms[name].label);
    await set_h(name, res ? 1 : 0);
    return;
  }
  if (name in pickers) {
    pickers[name].setColor(intToCol(value));
    return;
  }

  let el = EL('#' + name);
  if (!el) return;
  cl = el.classList;
  if (cl.contains('icon_t')) el.style.color = value;
  else if (cl.contains('text_t')) el.innerHTML = value;
  else if (cl.contains('input_t')) el.value = value;
  else if (cl.contains('date_t')) el.value = new Date(value * 1000).toISOString().split('T')[0];
  else if (cl.contains('time_t')) el.value = new Date(value * 1000).toISOString().split('T')[1].split('.')[0];
  else if (cl.contains('datetime_t')) el.value = new Date(value * 1000).toISOString().split('.')[0];
  else if (cl.contains('slider_t')) el.value = value, EL('out#' + name).innerHTML = value, moveSlider(el, false);
  else if (cl.contains('switch_t')) el.checked = (value === '1');
  else if (cl.contains('select_t')) el.value = value;
  else if (cl.contains('image_t')) {
    files.push({id: '#' + name, path: (value ? value : EL('#' + name).getAttribute("name")), type: 'img'});
    EL('wlabel#' + name).innerHTML = ' [0%]';
    if (files.length === 1) nextFile();
  } else if (cl.contains('canvas_t')) {
    if (name in canvases) {
      if (!canvases[name].value) {
        canvases[name].value = value;
        drawCanvas(canvases[name]);
      }
    }
  } else if (cl.contains('gauge_t')) {
    if (name in gauges) {
      gauges[name].value = Number(value);
      drawGauge(gauges[name]);
    }
  } else if (cl.contains('flags_t')) {
    let flags = document.getElementById('#' + name).getElementsByTagName('input');
    let val = value;
    for (let i = 0; i < flags.length; i++) {
      flags[i].checked = val & 1;
      val >>= 1;
    }
  }
}

async function parseDevice(text, conn, ip = null) {
  text = text.trim().replaceAll(/([^\\])\\([^"\\nrt])/ig, "$1\\\\$2").replaceAll(/\t/ig, "\\t").replaceAll(/\n/ig, "\\n").replaceAll(/\r/ig, "\\r");

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    log('Wrong packet (JSON):' + text);
    return;
  }

  let id = data.id;
  if (!id) return log('Wrong packet (ID)');
  // if (fromID !== 'broadcast' && fromID !== id) return log('Wrong packet (Unknown ID)');
  // if (fromID === 'broadcast' && device.type !== 'discover' && device.type !== 'update' && device.type !== 'push' && device.type !== 'print' && device.type !== 'data') return log('Wrong packet (error)');

  log('Got packet from #' + id + ' ' + data.type + ' via ' + ConnNames[conn]);

  if (id === focused) {
    stop_tout();
    showErr(false);
    change_conn(devices_t[focused].conn);
  }

  const dev = hub.devices.get(id);
  if (dev) await dev.handlePacket(data, conn, ip);
  else if (data.type === 'discover') {
    if (focused) return;

    // COMPATIBILITY
    if (data.modules === undefined) data.modules = 0;
    if (data.ota_t === undefined) data.ota_t = 'bin';
    //

    log('Add new device #' + id);
    const dev = new Device(id, data);
    hub.devices.set(id, dev);
    dev.addConnectionType(conn);
    await hub.mqtt.initNewDevice(id);
  }
}

async function showControls(controls, from_buffer = false, conn = Conn.NONE, ip = 'unset') {
  EL('controls').style.visibility = 'hidden';
  EL('controls').innerHTML = '';
  if (!controls) return;
  oninp_buffer = {};
  gauges = {};
  canvases = {};
  pickers = {};
  joys = {};
  prompts = {};
  confirms = {};
  dup_names = [];
  files = [];
  wid_row_count = 0;
  btn_row_count = 0;
  wid_row_id = null;
  btn_row_id = null;

  for (ctrl of controls) {
    if (devices[focused].show_names && ctrl.name) ctrl.label = ctrl.name;
    ctrl.wlabel = ctrl.label ? ctrl.label : ctrl.type;
    ctrl.clabel = (ctrl.label && ctrl.label !== '_no') ? ctrl.label : ctrl.type;
    ctrl.clabel = ctrl.clabel.charAt(0).toUpperCase() + ctrl.clabel.slice(1);

    switch (ctrl.type) {
      case 'button':
        addButton(ctrl);
        break;
      case 'button_i':
        addButtonIcon(ctrl);
        break;
      case 'spacer':
        addSpace(ctrl);
        break;
      case 'tabs':
        addTabs(ctrl);
        break;
      case 'title':
        addTitle(ctrl);
        break;
      case 'led':
        addLED(ctrl);
        break;
      case 'label':
        addLabel(ctrl);
        break;
      case 'icon':
        addIcon(ctrl);
        break;
      case 'input':
        addInput(ctrl);
        break;
      case 'pass':
        addPass(ctrl);
        break;
      case 'slider':
        addSlider(ctrl);
        break;
      case 'sliderW':
        addSliderW(ctrl);
        break;
      case 'switch':
        addSwitch(ctrl);
        break;
      case 'switch_i':
        addSwitchIcon(ctrl);
        break;
      case 'switch_t':
        addSwitchText(ctrl);
        break;
      case 'date':
        addDate(ctrl);
        break;
      case 'time':
        addTime(ctrl);
        break;
      case 'datetime':
        addDateTime(ctrl);
        break;
      case 'select':
        addSelect(ctrl);
        break;
      case 'week':
        addWeek(ctrl);
        break;
      case 'color':
        addColor(ctrl);
        break;
      case 'spinner':
        addSpinner(ctrl);
        break;
      case 'display':
        addDisplay(ctrl);
        break;
      case 'html':
        addHTML(ctrl);
        break;
      case 'flags':
        addFlags(ctrl);
        break;
      case 'log':
        addLog(ctrl);
        break;
      case 'row_b':
      case 'widget_b':
        beginWidgets(ctrl);
        break;
      case 'row_e':
      case 'widget_e':
        endWidgets();
        break;
      case 'canvas':
        addCanvas(ctrl);
        break;
      case 'gauge':
        addGauge(ctrl);
        break;
      case 'image':
        addImage(ctrl);
        break;
      case 'stream':
        addStream(ctrl, conn, ip);
        break;
      case 'dpad':
      case 'joy':
        addJoy(ctrl);
        break;
      case 'js':
        eval(ctrl.value);
        break;
      case 'confirm':
        confirms[ctrl.name] = {label: ctrl.label};
        break;
      case 'prompt':
        prompts[ctrl.name] = {label: ctrl.label, value: ctrl.value};
        break;
      case 'menu':
        addMenu(ctrl);
        break;
      case 'table':
        addTable(ctrl);
        break;
    }
  }
  if (devices[focused].show_names) {
    let labels = document.querySelectorAll(".widget_label");
    for (let lbl of labels) lbl.classList.add('widget_label_name');
  }

  resizeFlags();
  moveSliders();
  scrollDown();
  resizeSpinners();
  await renderElms(from_buffer);
}

async function renderElms(from_buffer) {
  while (1) {
    await waitAnimationFrame();
    let end = 1;
    for (let i in gauges) if (EL('#' + i) == null) end = 0;
    for (let i in canvases) if (EL('#' + i) == null) end = 0;
    for (let i in joys) if (EL('#' + i) == null) end = 0;
    for (let i in pickers) if (EL('#' + i) == null) end = 0;

    if (end) {
      if (dup_names.length) showPopupError('Duplicated names: ' + dup_names);
      showCanvases();
      showGauges();
      showPickers();
      await showJoys();
      EL('controls').style.visibility = 'visible';
      if (!from_buffer) nextFile();
      break;
    }
  }
}

function showInfo(device) {
  function addInfo(el, label, value, title = '') {
    EL(el).innerHTML += `
    <div class="cfg_row info">
      <label>${label}</label>
      <label title="${title}" class="lbl_info">${value}</label>
    </div>`;
  }

  EL('info_version').innerHTML = '';
  EL('info_net').innerHTML = '';
  EL('info_memory').innerHTML = '';
  EL('info_system').innerHTML = '';

  for (let i in device.info.version) addInfo('info_version', i, device.info.version[i]);
  for (let i in device.info.net) addInfo('info_net', i, device.info.net[i]);
  for (let i in device.info.memory) {
    if (typeof (device.info.memory[i]) == 'object') {
      let used = device.info.memory[i][0];
      let total = device.info.memory[i][1];
      let mem = (used / 1000).toFixed(1) + ' kB';
      if (total) mem += ' [' + (used / total * 100).toFixed(0) + '%]';
      addInfo('info_memory', i, mem, `Total ${(total / 1000).toFixed(1)} kB`);
    } else addInfo('info_memory', i, device.info.memory[i]);
  }
  for (let i in device.info.system) {
    if (i === 'Uptime') {
      let sec = device.info.system[i];
      let upt = Math.floor(sec / 86400) + ':' + new Date(sec * 1000).toISOString().slice(11, 19);
      let d = new Date();
      let utc = d.getTime() - (d.getTimezoneOffset() * 60000);
      addInfo('info_system', i, upt);
      addInfo('info_system', 'Started', new Date(utc - sec * 1000).toISOString().split('.')[0].replace('T', ' '));
      continue;
    }
    addInfo('info_system', i, device.info.system[i]);
  }
}

function setLabelTout(el, text1, text2) {
  EL(el).innerHTML = text1;
  setTimeout(() => EL(el).innerHTML = text2, 3000);
}