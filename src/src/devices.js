
// ================ UTILS =================
async function showNotif(text, name) {
    if (!("Notification" in window) || Notification.permission !== 'granted') return;
    let descr = name + ' (' + new Date(Date.now()).toLocaleString() + ')';
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.showNotification(text, {body: descr, vibrate: true});
}

function formatToStep(val, step) {
    step = step.toString();
    if (step.includes('.')) return Number(val).toFixed((step.split('.')[1]).toString().length);
    else return val;
}




const Modules = {
    INFO: (1 << 0),
    FSBR: (1 << 1),
    FORMAT: (1 << 2),
    DOWNLOAD: (1 << 3),
    UPLOAD: (1 << 4),
    OTA: (1 << 5),
    OTA_URL: (1 << 6),
    REBOOT: (1 << 7),
    SET: (1 << 8),
    READ: (1 << 9),
    DELETE: (1 << 10),
    RENAME: (1 << 11)
};

// ============ SAVE/LOAD ==============
function save_devices() {
    // TODO localStorage.setItem('devices', JSON.stringify(devices));
}

function load_devices() {
    // if (localStorage.hasOwnProperty('devices')) {
    //  TODO devices = JSON.parse(localStorage.getItem('devices'));
    // }
}

// ============== DEVICE ===============
function readModule(module) {
    return hub.currentDevice.isModuleEnabled(module);
}

function setLabelTout(el, text1, text2) {
    document.getElementById(el).innerHTML = text1;
    setTimeout(() => document.getElementById(el).innerHTML = text2, 3000);
}

const G = {
    http_port: 80,
    ws_port: 81,
    tout_prd: 2800,
    ping_prd: 3000,
    oninput_prd: 100,
    ws_tout: 4000,
};

let set_tout = null;

// ============== SEND ================
async function post(cmd, name = '', value = '') {
    const device = hub.currentDevice;
    if (!device) return;

    if (cmd === 'set') {
        if (!device.isModuleEnabled(Modules.SET)) return;
        if (set_tout) clearTimeout(set_tout);
        prev_set = {name: name, value: value};
        set_tout = setTimeout(() => {
            set_tout = prev_set = null;
        }, G.tout_prd);
    }

    await device.connection.send(cmd, name, value);

    reset_ping();
    reset_tout();
    console.log('Post to #' + hub.currentDeviceId + ' via ' + device.connection + ', cmd=' + cmd + (name ? (', name=' + name) : '') + (value ? (', value=' + value) : ''))
}

async function release_all() {
    if (pressId) await post('set', pressId, 0);
    pressId = null;
}

async function click_h(name, dir) {
    pressId = (dir === 1) ? name : null;
    await post('set', name, dir);
}

async function set_h(name, value = '') {
    await post('set', name, value);
}

async function input_h(name, value) {
    if (!(name in oninp_buffer)) oninp_buffer[name] = {'value': null, 'tout': null};

    if (!oninp_buffer[name].tout) {
        await set_h(name, value);

        oninp_buffer[name].tout = setTimeout(async () => {
            if (oninp_buffer[name].value != null && !tout_interval) await set_h(name, oninp_buffer[name].value);
            oninp_buffer[name].tout = null;
            oninp_buffer[name].value = null;
        }, G.oninput_prd);
    } else {
        oninp_buffer[name].value = value;
    }
}
