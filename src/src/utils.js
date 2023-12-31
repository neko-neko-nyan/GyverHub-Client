export const app_title = 'GyverHub';
export const non_esp = '__ESP__';
export const non_app = '__APP__';
export const app_version = '__VER__';

export const colors = {
  //RED: 0xcb2839,
  ORANGE: 0xd55f30,
  YELLOW: 0xd69d27,
  GREEN: 0x37A93C,
  MINT: 0x25b18f,
  AQUA: 0x2ba1cd,
  BLUE: 0x297bcd,
  VIOLET: 0x825ae7,
  PINK: 0xc8589a,
};
export const fonts = [
  'monospace',
  'system-ui',
  'cursive',
  'Arial',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Georgia',
  'Garamond',
];
export const themes = {
  DARK: 0,
  LIGHT: 1
};
export const baudrates = [4800, 9600, 19200, 38400, 57600, 74880, 115200, 230400, 250000, 500000, 1000000, 2000000];
export const theme_cols = [
  // back/tab/font/font2/dark/thumb/black/scheme/font4/shad/font3
  ['#1b1c20', '#26272c', '#eee', '#ccc', '#141516', '#444', '#0e0e0e', 'dark', '#222', '#000'],
  ['#eee', '#fff', '#111', '#333', '#ddd', '#999', '#bdbdbd', 'light', '#fff', '#000000a3']
];

export function isSSL() {
  return window.location.protocol === 'https:';
}

export function isLocal() {
  return window.location.href.startsWith('file') || checkIP(window_ip()) || window_ip() === 'localhost';
}

export function isApp() {
  return !non_app;
}

export function isPWA() {
  return (window.matchMedia('(display-mode: standalone)').matches) || (window.navigator.standalone) || document.referrer.includes('android-app://');
}

export function isESP() {
  return !non_esp;
}
export function getMime(name) {
  const mime_table = {
    'avi': 'video/x-msvideo',
    'bin': 'application/octet-stream',
    'bmp': 'image/bmp',
    'css': 'text/css',
    'csv': 'text/csv',
    'gz': 'application/gzip',
    'gif': 'image/gif',
    'html': 'text/html',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'js': 'text/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'svg': 'image/svg+xml',
    'txt': 'text/plain',
    'wav': 'audio/wav',
    'xml': 'application/xml',
  };
  let ext = name.split('.').pop();
  if (ext in mime_table) return mime_table[ext];
  else return 'text/plain';
}

export function EL(id) {
  return document.getElementById(id);
}

export function openURL(url) {
  window.open(url, '_blank').focus();
}

export function intToCol(val) {
  return "#" + Number(val).toString(16).padStart(6, '0');
}

export function intToColA(val) {
  return "#" + Number(val).toString(16).padStart(8, '0');
}

export function colToInt(str) {
  return parseInt(str.slice(1), 16);
}

export function notSupported() {
  alert('Browser not supported');
}

export function browser() {
  if (navigator.userAgent.includes("Opera") || navigator.userAgent.includes('OPR')) return 'opera';
  else if (navigator.userAgent.includes("Edg")) return 'edge';
  else if (navigator.userAgent.includes("Chrome")) return 'chrome';
  else if (navigator.userAgent.includes("Safari")) return 'safari';
  else if (navigator.userAgent.includes("Firefox")) return 'firefox';
  else if ((navigator.userAgent.includes("MSIE")) || (!!document.documentMode)) return 'IE';
  else return 'unknown';
}

export function disableScroll() {
  const TopScroll = window.scrollY || document.documentElement.scrollTop;
  const LeftScroll = window.scrollX || document.documentElement.scrollLeft;
  window.onscroll = function () {
    window.scrollTo(LeftScroll, TopScroll);
  };
}

export function refreshSpin(val) {
  if (val) EL('icon_refresh').classList.add('spinning');
  else EL('icon_refresh').classList.remove('spinning');
}

export function ratio() {
  return window.devicePixelRatio;
}

export function resize_h() {
  showGauges();
}

export function waitAnimationFrame() {
  return new Promise(res => {
    requestAnimationFrame(() => res());
  });
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== POPUP ==============
let popupT1 = null, popupT2 = null;

export function showPopup(text, color = '#37a93c') {
  if (popupT1) clearTimeout(popupT1);
  if (popupT2) clearTimeout(popupT2);
  EL('notice').innerHTML = text;
  EL('notice').style.background = color;
  EL('notice').style.display = 'block';
  EL('notice').style.animation = "fade-in 0.5s forwards";
  popupT1 = setTimeout(() => {
    popupT1 = null;
    EL('notice').style.display = 'none'
  }, 3500);
  popupT2 = setTimeout(() => {
    popupT2 = null;
    EL('notice').style.animation = "fade-out 0.5s forwards"
  }, 3000);
}

export function showPopupError(text) {
  showPopup(text, '#a93737');
}

export function showErr(v) {
  EL('head_cont').style.background = v ? 'var(--err)' : 'var(--prim)';
}

export function getLocalIP() {
  return new Promise(function (resolve, reject) {
    const RTCPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection || window.RTCPeerConnection;
    if (!RTCPeerConnection) return reject('Not supported');

    const rtc = new RTCPeerConnection({iceServers: []});

    rtc.addEventListener('icecandidate', function (evt) {
      if (!evt.candidate || !evt.candidate.candidate) return;
      const parts = evt.candidate.candidate.split(' ');
      if (parts[7] === 'host')
        resolve(parts[4]);
    });

    rtc.createDataChannel('', {reliable: false});
    rtc.createOffer()
      .then(offerDesc => {
        return rtc.setLocalDescription(offerDesc);
      })
      .catch(e => {
        log(e);
      });
  });
}

export async function update_ip_h() {
  /*NON-ESP*/
  try {
    const ip = await getLocalIP();
    if (ip.includes('local')) alert(`Disable WEB RTC anonymizer: ${browser()}://flags/#enable-webrtc-hide-local-ips-with-mdns`);
    else EL('local_ip').value = ip;
  } catch (e) {
    notSupported();
  }
  /*/NON-ESP*/
  if (isESP()) EL('local_ip').value = window_ip();
}

export function checkIP(ip) {
  return Boolean(ip.match(/^((25[0-5]|(2[0-4]|1[0-9]|[1-9]|)[0-9])(\.(?!$)|$)){4}$/));
}

export function window_ip() {
  let ip = window.location.href.split('/')[2].split(':')[0];
  return checkIP(ip) ? ip : 'error';
}

export async function arrayBuffer2base64(data) {
  // Use a FileReader to generate a base64 data URI
  const base64url = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(new Blob([data]))
  })

  /*
  The result looks like
  "data:application/octet-stream;base64,<your base64 data>",
  so we split off the beginning:
  */
  return base64url.substring(base64url.indexOf(',') + 1);
}

export function getMaskList() {
    let list = [];
    for (let i = 0; i < 33; i++) {
        let imask;
        if (i === 32) imask = 0xffffffff;
        else imask = ~(0xffffffff >>> i);
        list.push(`${(imask >>> 24) & 0xff}.${(imask >>> 16) & 0xff}.${(imask >>> 8) & 0xff}.${imask & 0xff}`);
    }
    return list;
}


export function parseCSV(str) {
    // https://stackoverflow.com/a/14991797
    const arr = [];
    let quote = false;
    for (let row = 0, col = 0, c = 0; c < str.length; c++) {
        let cc = str[c], nc = str[c + 1];
        arr[row] = arr[row] || [];
        arr[row][col] = arr[row][col] || '';
        if (cc === '"' && quote && nc === '"') {
            arr[row][col] += cc;
            ++c;
            continue;
        }
        if (cc === '"') {
            quote = !quote;
            continue;
        }
        if (cc === ',' && !quote) {
            ++col;
            continue;
        }
        if (cc === '\r' && nc === '\n' && !quote) {
            ++row;
            col = 0;
            ++c;
            continue;
        }
        if (cc === '\n' && !quote) {
            ++row;
            col = 0;
            continue;
        }
        if (cc === '\r' && !quote) {
            ++row;
            col = 0;
            continue;
        }
        arr[row][col] += cc;
    }
    return arr;
}
