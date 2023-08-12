import Pickr from '@simonwep/pickr';
import Joystick from "./uilib/Joystick";
import {Conn} from "./lib/Connection";
import {
    colors,
    colToInt,
    disableScroll,
    EL,
    intToCol,
    isESP,
    parseCSV,
    ratio,
    showPopupError,
    theme_cols,
    themes,
    waitAnimationFrame
} from "./utils";

export default class Components {
    constructor(show_names = false, break_widgets = false) {
        this.show_names = show_names
        this.break_widgets = break_widgets;
        this._reset();
    }

    _reset() {
        this.oninp_buffer = {};
        this.gauges = {};
        this.canvases = {};
        this.pickers = {};
        this.joys = {};
        this.prompts = {};
        this.confirms = {};
        this.dup_names = [];
        this.files = [];
        this.wid_row_count = 0;
        this.btn_row_count = 0;
        this.wid_row_id = null;
        this.dis_scroll_f = false;
        this.touch = 0;
        this.pressId = null;
    }

    async load(controls, from_buffer = false, conn = Conn.NONE, ip = 'unset') {
        document.getElementById('controls').style.visibility = 'hidden';
        document.getElementById('controls').innerHTML = '';

        if (!controls) return;

        this._reset();

        for (const ctrl of controls) {
            this.addControl(ctrl, conn, ip)
        }

        if (this.show_names) {
            let labels = document.querySelectorAll(".widget_label");
            for (let lbl of labels) lbl.classList.add('widget_label_name');
        }

        this.resizeFlags();
        this.moveSliders();
        this.scrollDown();
        this.resizeSpinners();

        while (1) {
            await waitAnimationFrame();
            let end = 1;
            for (let i in this.gauges) if (document.getElementById('#' + i) == null) end = 0;
            for (let i in this.canvases) if (document.getElementById('#' + i) == null) end = 0;
            for (let i in this.joys) if (document.getElementById('#' + i) == null) end = 0;
            for (let i in this.pickers) if (document.getElementById('#' + i) == null) end = 0;

            if (end) {
                if (this.dup_names.length) showPopupError('Duplicated names: ' + this.dup_names);
                this.showCanvases();
                this.showGauges();
                this.showPickers();
                await this.showJoys();
                document.getElementById('controls').style.visibility = 'visible';
                if (!from_buffer) await nextFile();
                break;
            }
        }
    }

    addControl(ctrl, conn, ip) {
        if (this.show_names && ctrl.name) ctrl.label = ctrl.name;
        ctrl.wlabel = ctrl.label ? ctrl.label : ctrl.type;
        ctrl.clabel = (ctrl.label && ctrl.label !== '_no') ? ctrl.label : ctrl.type;
        ctrl.clabel = ctrl.clabel.charAt(0).toUpperCase() + ctrl.clabel.slice(1);

        switch (ctrl.type) {
            case 'button':
                this.addButton(ctrl);
                break;
            case 'button_i':
                this.addButtonIcon(ctrl);
                break;
            case 'spacer':
                this.addSpace(ctrl);
                break;
            case 'tabs':
                this.addTabs(ctrl);
                break;
            case 'title':
                this.addTitle(ctrl);
                break;
            case 'led':
                this.addLED(ctrl);
                break;
            case 'label':
                this.addLabel(ctrl);
                break;
            case 'icon':
                this.addIcon(ctrl);
                break;
            case 'input':
                this.addInput(ctrl);
                break;
            case 'pass':
                this.addPass(ctrl);
                break;
            case 'slider':
                this.addSlider(ctrl);
                break;
            case 'sliderW':
                this.addSliderW(ctrl);
                break;
            case 'switch':
                this.addSwitch(ctrl);
                break;
            case 'switch_i':
                this.addSwitchIcon(ctrl);
                break;
            case 'switch_t':
                this.addSwitchText(ctrl);
                break;
            case 'date':
                this.addDate(ctrl);
                break;
            case 'time':
                this.addTime(ctrl);
                break;
            case 'datetime':
                this.addDateTime(ctrl);
                break;
            case 'select':
                this.addSelect(ctrl);
                break;
            case 'week':
                this.addWeek(ctrl);
                break;
            case 'color':
                this.addColor(ctrl);
                break;
            case 'spinner':
                this.addSpinner(ctrl);
                break;
            case 'display':
                this.addDisplay(ctrl);
                break;
            case 'html':
                this.addHTML(ctrl);
                break;
            case 'flags':
                this.addFlags(ctrl);
                break;
            case 'log':
                this.addLog(ctrl);
                break;
            case 'row_b':
            case 'widget_b':
                this.beginWidgets(ctrl);
                break;
            case 'row_e':
            case 'widget_e':
                this.this.endWidgets();
                break;
            case 'canvas':
                this.addCanvas(ctrl);
                break;
            case 'gauge':
                this.addGauge(ctrl);
                break;
            case 'image':
                this.addImage(ctrl);
                break;
            case 'stream':
                this.addStream(ctrl, conn, ip);
                break;
            case 'dpad':
            case 'joy':
                this.addJoy(ctrl);
                break;
            case 'js':
                eval(ctrl.value);
                break;
            case 'confirm':
                this.confirms[ctrl.name] = {label: ctrl.label};
                break;
            case 'prompt':
                this.prompts[ctrl.name] = {label: ctrl.label, value: ctrl.value};
                break;
            case 'menu':
                this.addMenu(ctrl);
                break;
            case 'table':
                this.addTable(ctrl);
                break;
        }
    }

    addButton(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        let inner, label = null;

        if (this.wid_row_id) {
            label = ctrl.wlabel
            let icon = '';
            if (isESP()) icon = "";
            if (ctrl.wlabel.charCodeAt(0) >= 0xF005) {
                icon = label[0];
                label = label.slice(1).trim();
            }
            this.endButtons();
            inner = this.renderButton(ctrl.name, 'icon btn_icon', ctrl.name, icon, ctrl.size * 3, ctrl.color, true);
        } else {
            if (!this.btn_row_id) this.beginButtons();
            let label = ctrl.clabel
            let icon = '';
            if (ctrl.clabel.charCodeAt(0) >= 0xF005) {
                icon = label[0];
                label = label.slice(1).trim();
                label = `<span class="icon icon_min">${icon}</span>&nbsp;` + label;
            }
            inner = this.renderButton(ctrl.name, 'c_btn', ctrl.name, label, ctrl.size, ctrl.color, false);
        }

        this.addWidget(ctrl.tab_w, ctrl.name, label, inner);
    }

    addButtonIcon(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        if (isESP()) ctrl.label = "";

        if (this.wid_row_id) {
            this.endButtons();
        } else if (!this.btn_row_id)
            this.beginButtons();

        let inner = this.renderButton(ctrl.name, 'icon btn_icon', ctrl.name, ctrl.label, ctrl.size, ctrl.color, true);
        this.addWidget(ctrl.tab_w, ctrl.name, '', inner, 0, true);
    }

    beginButtons() {
        this.btn_row_id = 'buttons_row#' + this.btn_row_count;
        this.btn_row_count++;
        EL('controls').innerHTML += `<div id="${this.btn_row_id}" class="control control_nob control_scroll"></div>`;
    }

    endButtons() {
        if (this.btn_row_id && EL(this.btn_row_id).getElementsByTagName('*').length === 1) {
            EL(this.btn_row_id).innerHTML = "<div></div>" + EL(this.btn_row_id).innerHTML + "<div></div>";  // center button
        }
        this.btn_row_id = null;
    }

    renderButton(title, className, name, label, size, color = null, is_icon = false) {
        const $button = document.createElement('button');
        $button.id = "#" + name;
        $button.title = title;
        $button.className = className;
        $button.style.fontSize = size + "px";
        $button.append(label);

        if (color !== null) $button.style[is_icon ? 'color' : 'backgroundColor'] = intToCol(color);

        $button.addEventListener('click', () => {
            set_h(name, 2)
        });

        $button.addEventListener('mousedown', () => {
            if(!touch) click_h(name, 1)
        });
        $button.addEventListener('mouseup', () => {
            if(!touch&&pressId) click_h(name, 0)
        });
        $button.addEventListener('mouseleave', () => {
            if(!touch&&pressId) click_h(name, 0)
        });


        $button.addEventListener('touchstart', () => {
           // touch = 1;
            click_h(name, 1);
        });
        $button.addEventListener('touchend', () => {
            click_h(name, 0);
        })

        return [$button];
    }

    addSpace(ctrl) {
        if (this.wid_row_id) {
            this.checkWidget(ctrl);
            this.wid_row_size += ctrl.tab_w;
            if (this.wid_row_size > 100) {
                // FIXME btn_row_id();
                this.wid_row_size = ctrl.tab_w;
            }
            EL(this.wid_row_id).innerHTML += `<div class="widget" style="width:${ctrl.tab_w}%"><div class="widget_inner widget_space"></div></div>`;
        } else {
            this.endButtons();
            EL('controls').innerHTML += `<div style="height:${ctrl.height}px"></div>`;
        }
    }

    addTabs(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let tabs = '';
        let labels = ctrl.text.toString().split(',');
        for (let i in labels) {
            let sel = (i === ctrl.value) ? 'class="tab_act"' : '';
            tabs += `<li onclick="set_h('${ctrl.name}','${i}')" ${sel}>${labels[i]}</li>`;
        }

        if (this.wid_row_id) {
            let inner = `<div class="navtab_tab"><ul>${tabs}</ul></div>`;
            this.addWidget(ctrl.tab_w, '', ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `<div class="navtab"><ul>${tabs}</ul></div>`;
        }
    }

    addTitle(ctrl) {
        this.endWidgets();
        this.endButtons();
        EL('controls').innerHTML += `<div class="control control_title"><span class="c_title">${ctrl.label}</span></div>`;
    }

    addLED(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let ch = ctrl.value ? 'checked' : '';
        if (ctrl.text && !isESP()) {
            if (this.wid_row_id) {
                let inner = `
      <label id="swlabel_${ctrl.name}" class="led_i_cont led_i_cont_tab"><input type="checkbox" class="switch_t" id='#${ctrl.name}' ${ch} disabled><span class="switch_i led_i led_i_tab">${ctrl.text}</span></label>
      `;
                this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
            } else {
                EL('controls').innerHTML += `
      <div class="control">
        <label title='${ctrl.name}'>${ctrl.clabel}</label>
        <label id="swlabel_${ctrl.name}" class="led_i_cont"><input type="checkbox" class="switch_t" id='#${ctrl.name}' ${ch} disabled><span class="switch_i led_i">${ctrl.text}</span></label>
      </div>
    `;
            }
        } else {
            if (this.wid_row_id) {
                let inner = `
    <label class="led_cont"><input type="checkbox" class="switch_t" id='#${ctrl.name}' ${ch} disabled><span class="led"></span></label>
    `;
                this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
            } else {
                EL('controls').innerHTML += `
      <div class="control">
        <label title='${ctrl.name}'>${ctrl.clabel}</label>
        <label class="led_cont"><input type="checkbox" class="switch_t" id='#${ctrl.name}' ${ch} disabled><span class="led"></span></label>
      </div>
    `;
            }
        }
    }

    addLabel(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let col = (ctrl.color) ? (`color:${intToCol(ctrl.color)}`) : '';
        if (this.wid_row_id) {
            let inner = `
    <label class="c_label text_t c_label_tab" id='#${ctrl.name}' style="${col};font-size:${ctrl.size}px">${ctrl.value}</label>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <label class="c_label text_t" id='#${ctrl.name}' style="${col};font-size:${ctrl.size}px">${ctrl.value}</label>
    </div>
  `;
        }
    }

    addIcon(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        if (isESP()) ctrl.text = "";
        let col = (ctrl.color != null) ? `color:${intToCol(ctrl.color)}` : '';
        if (this.wid_row_id) {
            let inner = `
    <span class="icon icon_t" id='#${ctrl.name}' style="${col}">${ctrl.text}</span>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
      <div class="control">
        <label title='${ctrl.name}'>${ctrl.clabel}</label>
        <span class="icon icon_t" id='#${ctrl.name}' style="${col}">${ctrl.text}</span>
      </div>
    `;
        }
    }

    addInput(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let col = (ctrl.color != null) ? ('box-shadow: 0px 2px 0px 0px ' + intToCol(ctrl.color)) : '';
        if (this.wid_row_id) {
            let inner = `
      <div class="cfg_inp_row cfg_inp_row_tab">
        <input class="cfg_inp c_inp input_t" style="${col}" type="text" value="${ctrl.value}" id="#${ctrl.name}" name="${ctrl.name}" onkeydown="checkEnter(this)" oninput="checkLen(this,${ctrl.max})" pattern="${ctrl.regex}">
        <div class="cfg_btn_block">
          <button class="icon cfg_btn" onclick="sendInput('${ctrl.name}')"></button>
        </div>
      </div>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <div class="cfg_inp_row">
        <input class="cfg_inp c_inp input_t" style="${col}" type="text" value="${ctrl.value}" id="#${ctrl.name}" name="${ctrl.name}" onkeydown="checkEnter(this)" oninput="checkLen(this,${ctrl.max})" pattern="${ctrl.regex}">
        <div class="cfg_btn_block">
          <button class="icon cfg_btn" onclick="sendInput('${ctrl.name}')"></button>
        </div>
      </div>
    </div>
  `;
        }
    }

    addPass(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let col = (ctrl.color != null) ? ('box-shadow: 0px 2px 0px 0px ' + intToCol(ctrl.color)) : '';
        if (this.wid_row_id) {
            let inner = `
      <div class="cfg_inp_row cfg_inp_row_tab">
        <input class="cfg_inp c_inp input_t" style="${col}" type="password" value="${ctrl.value}" id="#${ctrl.name}" name="${ctrl.name}" onkeydown="checkEnter(this)" oninput="checkLen(this,${ctrl.max})">
        <div class="cfg_btn_block2">
          <button class="icon cfg_btn" onclick="togglePass('#${ctrl.name}')"></button>
          <button class="icon cfg_btn" onclick="set_h('${ctrl.name}',EL('#${ctrl.name}').value)"></button>
        </div>
      </div>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <div class="cfg_inp_row">
        <input class="cfg_inp c_inp input_t" style="${col}" type="password" value="${ctrl.value}" id="#${ctrl.name}" name="${ctrl.name}" onkeydown="checkEnter(this)" oninput="checkLen(this,${ctrl.max})">
        <div class="cfg_btn_block2">
          <button class="icon cfg_btn" onclick="togglePass('#${ctrl.name}')"></button>
          <button class="icon cfg_btn" onclick="set_h('${ctrl.name}',EL('#${ctrl.name}').value)"></button>
        </div>
      </div>
    </div>
    `;
        }
    }

    addSlider(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let col = (ctrl.color != null) ? `background-image: linear-gradient(${intToCol(ctrl.color)}, ${intToCol(ctrl.color)})` : '';
        let formatted = formatToStep(ctrl.value, ctrl.step);
        if (this.wid_row_id) {
            let inner = `
    <input ontouchstart="dis_scroll_f=2" ontouchend="dis_scroll_f=0;enableScroll()" name="${ctrl.name}" id="#${ctrl.name}" oninput="moveSlider(this)" type="range" class="c_rangeW slider_t" style="${col}" value="${ctrl.value}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}"><div class="sldW_out"><output id="out#${ctrl.name}">${formatted}</output></div>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <div class="sld_name">
        <label title='${ctrl.name}'>${ctrl.clabel}</label>
        <label>:&nbsp;</label>
        <output id="out#${ctrl.name}">${formatted}</output>
      </div>
      <div class="cfg_inp_row">
        <input ontouchstart="dis_scroll_f=2" ontouchend="dis_scroll_f=0;enableScroll()" name="${ctrl.name}" id="#${ctrl.name}" oninput="moveSlider(this)" type="range" class="c_range slider_t" style="${col}" value="${ctrl.value}" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}">      
      </div>
    </div>
  `;
        }
    }

    addSwitch(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let ch = ctrl.value ? 'checked' : '';
        let col = (ctrl.color != null) ? `<style>#swlabel_${ctrl.name} input:checked+.slider{background:${intToCol(ctrl.color)}}</style>` : '';
        if (this.wid_row_id) {
            let inner = `${col}
    <label id="swlabel_${ctrl.name}" class="switch"><input type="checkbox" class="switch_t" id='#${ctrl.name}' onclick="set_h('${ctrl.name}',(this.checked ? 1 : 0))" ${ch}><span class="slider"></span></label>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `${col}
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <label id="swlabel_${ctrl.name}" class="switch"><input type="checkbox" class="switch_t" id='#${ctrl.name}' onclick="set_h('${ctrl.name}',(this.checked ? 1 : 0))" ${ch}><span class="slider"></span></label>
    </div>
  `;
        }
    }

    addSwitchIcon(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let ch = ctrl.value ? 'checked' : '';
        let text = ctrl.text ? ctrl.text : '';
        if (isESP()) text = "";
        if (this.wid_row_id) {
            let col = (ctrl.color != null) ? `<style>#swlabel_${ctrl.name} input:checked+.switch_i_tab{background:${intToCol(ctrl.color)};color:var(--font_inv)} #swlabel_${ctrl.name} .switch_i_tab{box-shadow: 0 0 0 2px ${intToCol(ctrl.color)};color:${intToCol(ctrl.color)}}</style>` : '';
            let inner = `${col}
    <label id="swlabel_${ctrl.name}" class="switch_i_cont switch_i_cont_tab"><input type="checkbox" onclick="set_h('${ctrl.name}',(this.checked ? 1 : 0))" class="switch_t" id='#${ctrl.name}' ${ch}><span class="switch_i switch_i_tab">${text}</span></label>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner, 120);
        } else {
            let col = (ctrl.color != null) ? `<style>#swlabel_${ctrl.name} input:checked+.switch_i{color:${intToCol(ctrl.color)}}</style>` : '';
            EL('controls').innerHTML += `${col}
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <label id="swlabel_${ctrl.name}" class="switch_i_cont"><input type="checkbox" onclick="set_h('${ctrl.name}',(this.checked ? 1 : 0))" class="switch_t" id='#${ctrl.name}' ${ch}><span class="switch_i">${text}</span></label>
    </div>
  `;
        }
    }

    addSwitchText(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let ch = ctrl.value ? 'checked' : '';
        let text = ctrl.text ? ctrl.text : 'ON';
        if (this.wid_row_id) {
            let col = (ctrl.color != null) ? `<style>#swlabel_${ctrl.name} input:checked+.switch_i_tab{background:${intToCol(ctrl.color)};color:var(--font_inv)} #swlabel_${ctrl.name} .switch_i_tab{box-shadow: 0 0 0 2px ${intToCol(ctrl.color)};color:${intToCol(ctrl.color)}}</style>` : '';
            let inner = `${col}
    <label id="swlabel_${ctrl.name}" class="switch_i_cont switch_i_cont_tab"><input type="checkbox" onclick="set_h('${ctrl.name}',(this.checked ? 1 : 0))" class="switch_t" id='#${ctrl.name}' ${ch}><span class="switch_i switch_i_tab switch_txt switch_txt_tab">${text}</span></label>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner, 120);
        } else {
            let col = (ctrl.color != null) ? `<style>#swlabel_${ctrl.name} input:checked+.switch_i{color:${intToCol(ctrl.color)}}</style>` : '';
            EL('controls').innerHTML += `${col}
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <label id="swlabel_${ctrl.name}" class="switch_i_cont"><input type="checkbox" onclick="set_h('${ctrl.name}',(this.checked ? 1 : 0))" class="switch_t" id='#${ctrl.name}' ${ch}><span class="switch_i switch_txt">${text}</span></label>
    </div>
  `;
        }
    }

    addDate(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let date = new Date(ctrl.value * 1000).toISOString().split('T')[0];
        let col = (ctrl.color != null) ? `color:${intToCol(ctrl.color)}` : '';
        if (this.wid_row_id) {
            let inner = `
    <input id='#${ctrl.name}' class="cfg_inp c_inp_block c_inp_block_tab date_t" style="${col}" type="date" value="${date}" onclick="this.showPicker()" onchange="set_h('${ctrl.name}',getUnix(this))">
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
      <div class="control">
        <label title='${ctrl.name}'>${ctrl.clabel}</label>
        <input id='#${ctrl.name}' class="cfg_inp c_inp_block datime date_t" style="${col}" type="date" value="${date}" onclick="this.showPicker()" onchange="set_h('${ctrl.name}',getUnix(this))">
      </div>
    `;
        }
    }

    addTime(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let time = new Date(ctrl.value * 1000).toISOString().split('T')[1].split('.')[0];
        let col = (ctrl.color != null) ? `color:${intToCol(ctrl.color)}` : '';
        if (this.wid_row_id) {
            let inner = `
    <input id='#${ctrl.name}' class="cfg_inp c_inp_block c_inp_block_tab time_t" style="${col}" type="time" value="${time}" onclick="this.showPicker()" onchange="set_h('${ctrl.name}',getUnix(this))" step="1">
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <input id='#${ctrl.name}' class="cfg_inp c_inp_block datime time_t" style="${col}" type="time" value="${time}" onclick="this.showPicker()" onchange="set_h('${ctrl.name}',getUnix(this))" step="1">
    </div>
  `;
        }
    }

    addDateTime(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let datetime = new Date(ctrl.value * 1000).toISOString().split('.')[0];
        let col = (ctrl.color != null) ? `color:${intToCol(ctrl.color)}` : '';
        if (this.wid_row_id) {
            let inner = `
    <input id='#${ctrl.name}' class="cfg_inp c_inp_block c_inp_block_tab datetime_t" style="${col}" type="datetime-local" value="${datetime}" onclick="this.showPicker()" onchange="set_h('${ctrl.name}',getUnix(this))" step="1">
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <input id='#${ctrl.name}' class="cfg_inp c_inp_block datime datime_w datetime_t" style="${col}" type="datetime-local" value="${datetime}" onclick="this.showPicker()" onchange="set_h('${ctrl.name}',getUnix(this))" step="1">
    </div>
  `;
        }
    }

    addSelect(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let elms = ctrl.text.toString().split(',');
        let options = '';
        for (let i in elms) {
            let sel = (i === ctrl.value) ? 'selected' : '';
            options += `<option value="${i}" ${sel}>${elms[i]}</option>`;
        }
        let col = (ctrl.color != null) ? `color:${intToCol(ctrl.color)}` : '';
        if (this.wid_row_id) {
            let inner = `
    <select class="cfg_inp c_inp_block select_t" style="${col}" id='#${ctrl.name}' onchange="set_h('${ctrl.name}',this.value)">
      ${options}
    </select>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
    <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <select class="cfg_inp c_inp_block select_t" style="${col}" id='#${ctrl.name}' onchange="set_h('${ctrl.name}',this.value)">
        ${options}
      </select>
    </div>
  `;
        }
    }

    addColor(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let color = intToCol(ctrl.value);
        let inner = `
    <div id="color_cont#${ctrl.name}" style="visibility: hidden">
      <div id='#${ctrl.name}'></div>
    </div>
    <button id="color_btn#${ctrl.name}" style="margin-left:-30px;color:${color}" class="icon cfg_btn_tab" onclick="openPicker('${ctrl.name}')"></button>
    `;

        if (this.wid_row_id) {
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      ${inner}
    </div>
    `;
        }
        this.pickers[ctrl.name] = color;
    }

    addSpinner(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let formatted = formatToStep(ctrl.value, ctrl.step);
        if (this.wid_row_id) {
            let inner = `
      <div class="spinner_row">
        <button class="icon cfg_btn btn_no_pad" onclick="spinSpinner(this, -1);set_h('${ctrl.name}',EL('#${ctrl.name}').value);"></button>
        <input id="#${ctrl.name}" name="${ctrl.name}" class="cfg_inp spinner input_t" type="number" oninput="resizeSpinner(this)" onkeydown="checkEnter(this)" value="${formatted}" min="${ctrl.min}"
          max="${ctrl.max}" step="${ctrl.step}">
        <button class="icon cfg_btn btn_no_pad" onclick="spinSpinner(this, 1);set_h('${ctrl.name}',EL('#${ctrl.name}').value);"></button>
      </div>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <div class="spinner_row">
        <button class="icon cfg_btn btn_no_pad" onclick="spinSpinner(this, -1);set_h('${ctrl.name}',EL('#${ctrl.name}').value);"></button>
        <input id="#${ctrl.name}" name="${ctrl.name}" class="cfg_inp spinner input_t" type="number" oninput="resizeSpinner(this)" onkeydown="checkEnter(this)" value="${formatted}" min="${ctrl.min}"
          max="${ctrl.max}" step="${ctrl.step}">
        <button class="icon cfg_btn btn_no_pad" onclick="spinSpinner(this, 1);set_h('${ctrl.name}',EL('#${ctrl.name}').value);"></button>
      </div>
    </div>
  `;
        }
    }

    addDisplay(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let col = (ctrl.color != null) ? ('background:' + intToCol(ctrl.color)) : '';
        if (this.wid_row_id) {
            let inner = `
    <textarea id="#${ctrl.name}" title='${ctrl.name}' class="cfg_inp c_area c_disp text_t" style="font-size:${ctrl.size}px;${col}" rows="${ctrl.rows}" readonly>${ctrl.value}</textarea>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <textarea id="#${ctrl.name}" title='${ctrl.name}' class="cfg_inp c_area c_disp text_t" style="font-size:${ctrl.size}px;${col}" rows="${ctrl.rows}" readonly>${ctrl.value}</textarea>
    </div>
  `;
        }
    }

    addHTML(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let inner = `<div name="text" id="#${ctrl.name}" title='${ctrl.name}' class="c_text text_t">${ctrl.value}</div>`;
        if (this.wid_row_id) {
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control control_nob">
      ${inner}
    </div>
    `;
        }
    }

    addFlags(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let flags = "";
        let val = ctrl.value;
        let labels = ctrl.text.toString().split(',');
        for (let i = 0; i < labels.length; i++) {
            let ch = (!(val & 1)) ? '' : 'checked';
            val >>= 1;
            flags += `<label id="swlabel_${ctrl.name}" class="chbutton chtext">
    <input name="${ctrl.name}" type="checkbox" onclick="set_h('${ctrl.name}',encodeFlags('${ctrl.name}'))" ${ch}>
    <span class="chbutton_s chtext_s">${labels[i]}</span></label>`;
        }
        let col = (ctrl.color != null) ? `<style>#swlabel_${ctrl.name} input:checked+.chbutton_s{background:${intToCol(ctrl.color)}}</style>` : '';

        if (this.wid_row_id) {
            let inner = `${col}
      <div class="chbutton_cont chbutton_cont_tab flags_t" id='#${ctrl.name}'>
        ${flags}
      </div>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `${col}
    <div class="control">
      <label title='${ctrl.name}'>${ctrl.clabel}</label>
      <div class="chbutton_cont flags_t" id='#${ctrl.name}'>
        ${flags}
      </div>
    </div>
  `;
        }
    }

    addLog(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        if (ctrl.text.endsWith('\n')) ctrl.text = ctrl.text.slice(0, -1);
        if (this.wid_row_id) {
            let inner = `
    <textarea id="#${ctrl.name}" title='${ctrl.name}' class="cfg_inp c_log text_t" readonly>${ctrl.text}</textarea>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control">
      <textarea id="#${ctrl.name}" title='${ctrl.name}' class="cfg_inp c_log text_t" readonly>${ctrl.text}</textarea>
    </div>
  `;
        }
    }

    beginWidgets(ctrl = null, check = false) {
        if (!check) this.endButtons();
        this.wid_row_size = 0;
        if (this.break_widgets) return;
        let st = (ctrl && ctrl.height) ? `style="height:${ctrl.height}px"` : '';
        this.wid_row_id = 'widgets_row#' + this.wid_row_count;
        this.wid_row_count++;
        EL('controls').innerHTML += `
  <div class="widget_row" id="${this.wid_row_id}" ${st}></div>
  `;
    }

    endWidgets() {
        this.endButtons();
        this.wid_row_id = null;
    }

    addCanvas(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        if (this.wid_row_id) {
            let inner = `
    <canvas onclick="clickCanvas('${ctrl.name}',event)" class="${ctrl.active ? 'canvas_act' : ''} canvas_t" id="#${ctrl.name}"></canvas>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="cv_block">
      <canvas onclick="clickCanvas('${ctrl.name}',event)" class="${ctrl.active ? 'canvas_act' : ''} canvas_t" id="#${ctrl.name}"></canvas>
    </div>
    `;
        }
        this.canvases[ctrl.name] = {name: ctrl.name, width: ctrl.width, height: ctrl.height, value: ctrl.value};
    }

    addGauge(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        if (this.wid_row_id) {
            let inner = `
    <canvas class="gauge_t" id="#${ctrl.name}"></canvas>
    `;
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="cv_block cv_block_back">
      <canvas class="gauge_t" id="#${ctrl.name}"></canvas>
    </div>
    `;
        }
        this.gauges[ctrl.name] = {
            perc: null,
            name: ctrl.name,
            value: Number(ctrl.value),
            min: Number(ctrl.min),
            max: Number(ctrl.max),
            step: Number(ctrl.step),
            text: ctrl.text,
            color: ctrl.color
        };
    }

    addImage(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let inner = `
    <div class="image_t" name="${ctrl.value}" id="#${ctrl.name}">${this.waiter()}</div>
    `;
        if (this.wid_row_id) {
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="cv_block cv_block_back">
    ${inner}
    </div>
    `;
        }
        this.files.push({id: '#' + ctrl.name, path: ctrl.value, type: 'img'});
    }

    waiter(size = 50, col = 'var(--prim)', block = true) {
        return `<div class="waiter ${block ? 'waiter_b' : ''}"><span style="font-size:${size}px;color:${col}" class="icon spinning"></span></div>`;
    }

    addStream(ctrl, conn, ip) {
        this.checkWidget(ctrl);
        this.endButtons();
        let inner = '<label>No connection</label>';
        if (conn === Conn.WS && ip !== 'unset') inner = `<img style="width:100%" src="http://${ip}:${ctrl.port}/">`;
        if (this.wid_row_id) {
            this.addWidget(ctrl.tab_w, '', ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="cv_block cv_block_back">
    ${inner}
    </div>
    `;
        }
    }

    addJoy(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let inner = `
    <div class="joyCont"><canvas id="#${ctrl.name}"></canvas></div>
  `;

        if (this.wid_row_id) {
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += inner;
        }
        this.joys[ctrl.name] = ctrl;
    }

    addMenu(ctrl) {
        let inner = '';
        let labels = ctrl.text.toString().split(',');
        for (let i in labels) {
            let sel = (i === ctrl.value) ? 'menu_act' : '';
            inner += `<div onclick="menuClick(${i})" class="menu_item ${sel}">${labels[i]}</div>`;
        }
        document.querySelector(':root').style.setProperty('--menu_h', ((labels.length + 2) * 35 + 10) + 'px');
        EL('menu_user').innerHTML = inner;
    }

    addTable(ctrl) {
        if (this.checkDup(ctrl)) return;
        this.checkWidget(ctrl);
        this.endButtons();
        let table = parseCSV(ctrl.value);
        let aligns = ctrl.align.split(',');
        let widths = ctrl.width.split(',');
        let inner = '<table class="c_table">';
        for (let row of table) {
            inner += '<tr>';
            for (let col in row) {
                inner += `<td width="${widths[col] ? (widths[col] + '%') : ''}" align="${aligns[col] ? aligns[col] : 'center'}">${row[col]}</td>`;
            }
            inner += '</tr>';
        }
        inner += '</table>';

        if (this.wid_row_id) {
            this.addWidget(ctrl.tab_w, ctrl.name, ctrl.wlabel, inner);
        } else {
            EL('controls').innerHTML += `
    <div class="control control_nob">
      ${inner}
    </div>
    `;
        }
    }

    checkWidget(ctrl) {
        if (ctrl.tab_w && !this.wid_row_id) this.beginWidgets(null, true);
    }


    /**
     * @param {number} width
     * @param {string} name
     * @param {string|null} label
     * @param {Node[]} inner
     * @param {number} height
     * @param {boolean} noback
     */
    addWidget(width, name, label, inner, height = 0, noback = false) {
        if (this.wid_row_id) {
            this.wid_row_size += width;
            if (this.wid_row_size > 100) {
                this.beginWidgets();
                this.wid_row_size = width;
            }

            const $inner = document.createElement('div');
            $inner.className = "widget_inner";
            if (noback) $inner.classList.add("widget_space")

            if (label && label !== '_no') {
                const $label = document.createElement('div');
                $label.className = "widget_label";
                $label.title = name;
                $label.append(label);

                const $wlabel = document.createElement('span');
                $wlabel.id = "wlabel#" + name;
                $label.append($wlabel);

                $inner.append($label);
            }

            const $block = document.createElement('div');
            $block.className = "widget_block";
            $block.append(...inner);
            $inner.append($block);

            const $widget = document.createElement('div');
            $widget.className = "widget";
            $widget.style.width = width + "%";
            if (height) $widget.style.height = height + "px";
            $widget.append($inner);

            inner = [$widget];
        }

        EL(this.wid_row_id).append(...inner);
    }


    checkDup(ctrl) {
        if (EL('#' + ctrl.name)) {
            this.dup_names.push(' ' + ctrl.name);
            return 1;
        }
        return 0;
    }

    resizeFlags() {
        let chtext = document.querySelectorAll(".chtext");
        let chtext_s = document.querySelectorAll(".chtext_s");
        chtext.forEach((ch, i) => {
            let len = chtext_s[i].innerHTML.length + 2;
            chtext[i].style.width = (len + 0.5) + 'ch';
            chtext_s[i].style.width = len + 'ch';
        });
    }

    moveSliders() {
        for (const x of document.querySelectorAll('.c_range, .c_rangeW')) {
            this.moveSlider(x, false)
        }
    }

    moveSlider(arg, sendf = true) {
        if (dis_scroll_f) {
            dis_scroll_f--;
            if (!dis_scroll_f) disableScroll();
        }
        arg.style.backgroundSize = (arg.value - arg.min) * 100 / (arg.max - arg.min) + '% 100%';
        EL('out' + arg.id).value = formatToStep(arg.value, arg.step);
        if (sendf) input_h(arg.name, arg.value);
    }

    scrollDown() {
        let logs = document.querySelectorAll(".c_log");
        logs.forEach((log) => log.scrollTop = log.scrollHeight);
    }

    resizeSpinners() {
        let spinners = document.querySelectorAll(".spinner");
        for (const sp of spinners) {
            this.resizeSpinner(sp);
        }
    }

    resizeSpinner(el) {
        el.style.width = el.value.length + 'ch';
    }

    showCanvases() {
        for (const canvas of Object.values(this.canvases)) {
            let cv = EL('#' + canvas.name);
            if (!cv || !cv.parentElement.clientWidth) continue;
            let rw = cv.parentElement.clientWidth;
            canvas.scale = rw / canvas.width;
            let rh = Math.floor(canvas.height * canvas.scale);
            cv.style.width = rw + 'px';
            cv.style.height = rh + 'px';
            cv.width = Math.floor(rw * ratio());
            cv.height = Math.floor(rh * ratio());
            canvas.scale *= ratio();
            drawCanvas(canvas);
        }
    }

    showGauges() {
        for (const gauge of Object.values(this.gauges)) {
            this.drawGauge(gauge);
        }
    }


    drawGauge(g) {
        let cv = EL('#' + g.name);
        if (!cv || !cv.parentElement.clientWidth) return;

        let perc = (g.value - g.min) * 100 / (g.max - g.min);
        if (perc < 0) perc = 0;
        if (perc > 100) perc = 100;
        if (g.perc == null) g.perc = perc; else {
            if (Math.abs(g.perc - perc) <= 0.2) g.perc = perc; else g.perc += (perc - g.perc) * 0.2;
            if (g.perc !== perc) setTimeout(() => this.drawGauge(g), 30);
        }

        let cx = cv.getContext("2d");
        let v = themes[cfg.theme];
        let col = g.color == null ? intToCol(colors[cfg.maincolor]) : intToCol(g.color);
        let rw = cv.parentElement.clientWidth;
        let rh = Math.floor(rw * 0.47);
        cv.style.width = rw + 'px';
        cv.style.height = rh + 'px';
        cv.width = Math.floor(rw * ratio());
        cv.height = Math.floor(rh * ratio());

        cx.clearRect(0, 0, cv.width, cv.height);
        cx.lineWidth = cv.width / 8;
        cx.strokeStyle = theme_cols[v][4];
        cx.beginPath();
        cx.arc(cv.width / 2, cv.height * 0.97, cv.width / 2 - cx.lineWidth, Math.PI * (1 + g.perc / 100), Math.PI * 2);
        cx.stroke();

        cx.strokeStyle = col;
        cx.beginPath();
        cx.arc(cv.width / 2, cv.height * 0.97, cv.width / 2 - cx.lineWidth, Math.PI, Math.PI * (1 + g.perc / 100));
        cx.stroke();

        let font = cfg.font;
        /*NON-ESP*/
        font = 'PTSans Narrow';
        /*/NON-ESP*/

        cx.fillStyle = col;
        cx.font = '10px ' + font;
        cx.textAlign = "center";

        let text = g.text;
        let len = Math.max((formatToStep(g.value, g.step) + text).length, (formatToStep(g.min, g.step) + text).length, (formatToStep(g.max, g.step) + text).length);
        if (len === 1) text += '  '; else if (len === 2) text += ' ';

        let w = Math.max(cx.measureText(formatToStep(g.value, g.step) + text).width, cx.measureText(formatToStep(g.min, g.step) + text).width, cx.measureText(formatToStep(g.max, g.step) + text).width);

        cx.fillStyle = theme_cols[v][3];
        cx.font = cv.width * 0.45 * 10 / w + 'px ' + font;
        cx.fillText(formatToStep(g.value, g.step) + g.text, cv.width / 2, cv.height * 0.93);

        cx.font = '10px ' + font;
        w = Math.max(cx.measureText(Math.round(g.min).toString()).width, cx.measureText(Math.round(g.max).toString()).width);
        cx.fillStyle = theme_cols[v][2];
        cx.font = cx.lineWidth * 0.55 * 10 / w + 'px ' + font;
        cx.fillText(g.min, cx.lineWidth, cv.height * 0.92);
        cx.fillText(g.max, cv.width - cx.lineWidth, cv.height * 0.92);
    }

    showPickers() {
        for (let picker in this.pickers) {
            let id = '#' + picker;
            this.pickers[picker] = Pickr.create({
                el: EL(id), theme: 'nano', default: this.pickers[picker], defaultRepresentation: 'HEXA', components: {
                    preview: true, hue: true, interaction: {
                        hex: false, input: true, save: true
                    }
                }
            }).on('save', (color) => {
                let col = color.toHEXA().toString();
                set_h(picker, colToInt(col));
                EL('color_btn' + id).style.color = col;
            });
        }
    }

    async showJoys() {
        for (let joy in this.joys) {
            let j = new Joystick(joy, this.joys[joy].type === 'dpad', intToCol(this.joys[joy].color == null ? colors[cfg.maincolor] : this.joys[joy].color), this.joys[joy].auto, this.joys[joy].exp, async data => {
                await input_h(joy, ((data.x + 255) << 16) | (data.y + 255));
            });
            await j.redraw();
            this.joys[joy].joy = j;
        }
    }

    async clickCanvas(id, e) {
        if (!(id in this.canvases)) return;
        let rect = EL('#' + id).getBoundingClientRect();
        let scale = this.canvases[id].scale;
        let x = Math.round((e.clientX - rect.left) / scale * ratio());
        if (x < 0) x = 0;
        let y = Math.round((e.clientY - rect.top) / scale * ratio());
        if (y < 0) y = 0;
        await set_h(id, (x << 16) | y);
    }
}

function menuClick(num) {
    menu_show(0);
    menuDeact();
    if (screen !== 'device') show_screen('device');
    set_h('_menu', num);
}

function menuDeact() {
    let els = document.getElementById('menu_user').children;
    for (let el in els) {
        if (els[el].tagName === 'DIV') els[el].classList.remove('menu_act');
    }
    EL('menu_info').classList.remove('menu_act');
    EL('menu_fsbr').classList.remove('menu_act');
}

async function sendInput(name) {
    let inp = EL('#' + name);
    const r = new RegExp(inp.pattern);
    if (r.test(inp.value)) await set_h(name, inp.value); else showPopupError("Wrong text!");
}

function checkLen(arg, len) {
    if (len && arg.value.length > len) arg.value = arg.value.substring(0, len);
}

async function checkEnter(arg) {
    if (event.key === 'Enter') {
        if (arg.pattern) await sendInput(arg.name); else await set_h(arg.name, arg.value);
    }
}

function togglePass(id) {
    if (EL(id).type === 'text') EL(id).type = 'password'; else EL(id).type = 'text';
}

function getUnix(arg) {
    return Math.floor(arg.valueAsNumber / 1000);
}

function openPicker(id) {
    EL('color_cont#' + id).getElementsByTagName('button')[0].click()
}

function spinSpinner(el, dir) {
    let num = (dir === 1) ? el.previousElementSibling : el.nextElementSibling;
    let val = Number(num.value) + Number(num.step) * Number(dir);
    val = Math.max(Number(num.min), val);
    val = Math.min(Number(num.max), val);
    num.value = formatToStep(val, num.step);
    resizeSpinner(num);
}

function encodeFlags(name) {
    let weeks = document.getElementsByName(name);
    let encoded = 0;
    weeks.forEach((w, i) => {
        if (w.checked) encoded |= (1 << weeks.length);
        encoded >>= 1;
    });
    return encoded;
}

function drawCanvas(canvas) {
    let ev_str = '';
    let cv = EL('#' + canvas.name);

    function cv_map(v, h) {
        v *= canvas.scale;
        return v >= 0 ? v : (h ? cv.height : cv.width) - v;
    }

    function scale() {
        return canvas.scale;
    }

    let cx = cv.getContext("2d");
    const cmd_list = ['fillStyle', 'strokeStyle', 'shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'lineWidth', 'miterLimit', 'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin', 'globalCompositeOperation', 'globalAlpha', 'scale', 'rotate', 'rect', 'fillRect', 'strokeRect', 'clearRect', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'translate', 'arcTo', 'arc', 'fillText', 'strokeText', 'drawImage', 'roundRect', 'fill', 'stroke', 'beginPath', 'closePath', 'clip', 'save', 'restore'];
    const const_list = ['butt', 'round', 'square', 'square', 'bevel', 'miter', 'start', 'end', 'center', 'left', 'right', 'alphabetic', 'top', 'hanging', 'middle', 'ideographic', 'bottom', 'source-over', 'source-atop', 'source-in', 'source-out', 'destination-over', 'destination-atop', 'destination-in', 'destination-out', 'lighter', 'copy', 'xor', 'top', 'bottom', 'middle', 'alphabetic'];

    for (d of canvas.value) {
        let div = d.indexOf(':');
        let cmd = parseInt(d, 10);

        if (!isNaN(cmd) && cmd <= 37) {
            if (div === 1 || div === 2) {
                let val = d.slice(div + 1);
                let vals = val.split(',');
                if (cmd <= 2) ev_str += ('cx.' + cmd_list[cmd] + '=\'' + intToColA(val) + '\';'); else if (cmd <= 7) ev_str += ('cx.' + cmd_list[cmd] + '=' + (val * scale()) + ';'); else if (cmd <= 13) ev_str += ('cx.' + cmd_list[cmd] + '=\'' + const_list[val] + '\';'); else if (cmd <= 14) ev_str += ('cx.' + cmd_list[cmd] + '=' + val + ';'); else if (cmd <= 16) ev_str += ('cx.' + cmd_list[cmd] + '(' + val + ');'); else if (cmd <= 26) {
                    let str = 'cx.' + cmd_list[cmd] + '(';
                    for (let i in vals) {
                        if (i > 0) str += ',';
                        str += `cv_map(${vals[i]},${(i % 2)})`;
                    }
                    ev_str += (str + ');');
                } else if (cmd === 27) {
                    ev_str += (`cx.${cmd_list[cmd]}(cv_map(${vals[0]},0),cv_map(${vals[1]},1),cv_map(${vals[2]},0),${vals[3]},${vals[4]},${vals[5]});`);
                } else if (cmd <= 29) {
                    ev_str += (`cx.${cmd_list[cmd]}(${vals[0]},cv_map(${vals[1]},0),cv_map(${vals[2]},1),${vals[3]});`);
                } else if (cmd === 30) {
                    let str = 'cx.' + cmd_list[cmd] + '(';
                    for (let i in vals) {
                        if (i > 0) {
                            str += `,cv_map(${vals[i]},${!(i % 2)})`;
                        } else str += vals[i];
                    }
                    ev_str += (str + ');');
                } else if (cmd === 31) {
                    let str = 'cx.' + cmd_list[cmd] + '(';
                    for (let i = 0; i < 4; i++) {
                        if (i > 0) str += ',';
                        str += `cv_map(${vals[i]},${(i % 2)})`;
                    }
                    if (vals.length === 5) str += `,${vals[4] * scale()}`; else {
                        str += ',[';
                        for (let i = 4; i < vals.length; i++) {
                            if (i > 4) str += ',';
                            str += `cv_map(${vals[i]},${(i % 2)})`;
                        }
                        str += ']';
                    }
                    ev_str += (str + ');');
                }
            } else {
                if (cmd >= 32) ev_str += ('cx.' + cmd_list[cmd] + '();');
            }
        } else {
            ev_str += d + ';';
        }
    }
    eval(ev_str);
    canvas.value = null;
}
