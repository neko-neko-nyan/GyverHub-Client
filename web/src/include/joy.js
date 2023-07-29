"use strict";

function adjust(color, ratio) {
  return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, Math.floor(parseInt(color, 16) * (ratio + 1)))).toString(16)).slice(-2));
}

function constrain(val, min, max) {
  return val < min ? min : (val > max ? max : val);
}

class Joystick {
  /**
   * @param {string} cont
   * @param {boolean} dpad
   * @param {string} color
   * @param {boolean} auto
   * @param {boolean} exp
   * @param {function({x: number, y: number}): Promise<void>} callback
   */
  constructor(cont, dpad, color, auto, exp, callback) {
    this.dpad = dpad;
    this.color = color;
    this.auto = auto
    this.exp = exp
    this.callback = callback;

    this.cv = document.getElementById('#' + cont);
    if (!this.cv || !this.cv.parentNode.clientWidth) return;
    this.size = this.cv.parentNode.clientWidth;

    this.cv.style.width = this.size + 'px';
    this.cv.style.height = this.size + 'px';
    this.size *= window.devicePixelRatio;
    this.cv.width = this.size;
    this.cv.height = this.size;
    this.cv.style.cursor = 'pointer';

    this.cx = this.cv.getContext("2d");
    this.r = this.size * 0.23;
    this.R = this.size * 0.4;
    this.centerX = this.size / 2;
    this.centerY = this.size / 2;
    this.movedX = this.centerX;
    this.movedY = this.centerY;
    this.pressed = 0;
    this.dpressed = 0;

    if ("ontouchstart" in document.documentElement) {
      this.cv.addEventListener("touchstart", this.onTouchStart.bind(this), false);
      if (!dpad) document.addEventListener("touchmove", this.onTouchMove.bind(this), false);
      document.addEventListener("touchend", this.onTouchEnd.bind(this), false);
    } else {
      this.cv.addEventListener("mousedown", this.onMouseDown.bind(this), false);
      if (!dpad) document.addEventListener("mousemove", this.onMouseMove.bind(this), false);
      document.addEventListener("mouseup", this.onMouseUp.bind(this), false);
    }
  }

  async _onMove(x, y) {
    if (this.pressed) {
      this.movedX = x * window.devicePixelRatio;
      this.movedY = y * window.devicePixelRatio;
      if (this.cv.offsetParent.tagName.toUpperCase() === "BODY") {
        this.movedX -= this.cv.offsetLeft * window.devicePixelRatio;
        this.movedY -= this.cv.offsetTop * window.devicePixelRatio;
      } else {
        this.movedX -= this.cv.offsetParent.offsetLeft * window.devicePixelRatio;
        this.movedY -= this.cv.offsetParent.offsetTop * window.devicePixelRatio;
      }
      await this.redraw();
    }
  }


  async onTouchStart(event) {
    this.pressed = 1;
    if (this.dpad) await this.onTouchMove(event);
  }

  async onTouchMove(event) {
    if (event.targetTouches[0].target === this.cv) {
      await this._onMove(event.targetTouches[0].pageX, event.targetTouches[0].pageY);
    }
  }

  async onTouchEnd(event) {
    if (this.auto || this.dpad) {
      this.movedX = this.centerX;
      this.movedY = this.centerY;
      await this.redraw();
    }
    if (!event.targetTouches.length) this.pressed = 0;
  }


  async onMouseDown(event) {
    this.pressed = 1;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'pointer';
    if (this.dpad) await this.onMouseMove(event);
  }

  async onMouseMove(event) {
    await this._onMove(event.pageX, event.pageY);
  }

  async onMouseUp() {
    if (this.auto || this.dpad) {
      this.movedX = this.centerX;
      this.movedY = this.centerY;
      await this.redraw();
    }
    this.pressed = 0;
    document.body.style.userSelect = 'unset';
    document.body.style.cursor = 'default';
  }


  async redraw() {
    this.cx.clearRect(0, 0, this.size, this.size);
    this.movedX = constrain(this.movedX, this.r, this.size - this.r);
    this.movedY = constrain(this.movedY, this.r, this.size - this.r);
    let x = Math.round((this.movedX - this.centerX) / (this.size / 2 - this.r) * 255);
    let y = -Math.round((this.movedY - this.centerY) / (this.size / 2 - this.r) * 255);

    if (this.dpad) {
      if (Math.abs(x) < 150 && Math.abs(y) < 150) {
        x = 0;
        y = 0;
      } else {
        this.dpressed = 1;
        if (Math.abs(x) > Math.abs(y)) {
          x = Math.sign(x);
          y = 0;
        } else {
          x = 0;
          y = Math.sign(y);
        }
      }

      this.cx.beginPath();
      this.cx.arc(this.centerX, this.centerY, this.R * 1.15, 0, 2 * Math.PI, false);
      this.cx.lineWidth = this.R / 20;
      this.cx.strokeStyle = this.color;
      this.cx.stroke();

      this.cx.lineWidth = this.R / 10;
      let rr = this.R * 0.9;
      let cw = this.R / 4;
      let ch = rr - cw;
      let sh = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < 4; i++) {
        this.cx.beginPath();
        this.cx.strokeStyle = (x === sh[i][0] && y === -sh[i][1]) ? adjust(this.color, 0.5) : this.color;
        this.cx.moveTo(this.centerX + ch * sh[i][0] - cw * sh[i][1], this.centerY + ch * sh[i][1] - cw * sh[i][0]);
        this.cx.lineTo(this.centerX + rr * sh[i][0], this.centerY + rr * sh[i][1]);
        this.cx.lineTo(this.centerX + ch * sh[i][0] + cw * sh[i][1], this.centerY + ch * sh[i][1] + cw * sh[i][0]);
        this.cx.stroke();
      }

      if (this.dpressed) await this.callback({x: x, y: y});
      if (!x && !y) this.dpressed = 0;

    } else {
      this.cx.beginPath();
      this.cx.arc(this.centerX, this.centerY, this.R, 0, 2 * Math.PI, false);
      let grd = this.cx.createRadialGradient(this.centerX, this.centerY, this.R * 2 / 3, this.centerX, this.centerY, this.R);
      grd.addColorStop(0, '#00000005');
      grd.addColorStop(1, '#00000030');
      this.cx.fillStyle = grd;
      this.cx.fill();

      this.cx.beginPath();
      this.cx.arc(this.movedX, this.movedY, this.r, 0, 2 * Math.PI, false);
      grd = this.cx.createRadialGradient(this.movedX, this.movedY, 0, this.movedX, this.movedY, this.r);
      grd.addColorStop(0, adjust(this.color, 0.4));
      grd.addColorStop(1, this.color);
      this.cx.fillStyle = grd;
      this.cx.fill();

      if (!this.pressed) return;
      if (this.exp) {
        x = ((x * x + 255) >> 8) * (x > 0 ? 1 : -1);
        y = ((y * y + 255) >> 8) * (y > 0 ? 1 : -1);
      }
      await this.callback({x: x, y: y});
    }
  }
}
