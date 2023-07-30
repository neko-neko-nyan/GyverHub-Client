let push_timer = 0;
let prev_set = null;

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

  if (id === hub.currentDeviceId) {
    stop_tout();
    showErr(false);
    change_conn(conn);
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
    dev.ip = ip;
    hub.devices.set(id, dev);
    dev.addConnectionType(conn);
  }
}

function setLabelTout(el, text1, text2) {
    EL(el).innerHTML = text1;
    setTimeout(() => EL(el).innerHTML = text2, 3000);
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

  const dev = hub.currentDevice

  for (const ctrl of controls) {
    if (dev.show_names && ctrl.name) ctrl.label = ctrl.name;
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
  if (dev.show_names) {
    let labels = document.querySelectorAll(".widget_label");
    for (let lbl of labels) lbl.classList.add('widget_label_name');
  }

  resizeFlags();
  moveSliders();
  scrollDown();
  resizeSpinners();

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
      if (!from_buffer) await nextFile();
      break;
    }
  }
}