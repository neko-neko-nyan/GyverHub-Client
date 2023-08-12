"use strict";

export default class PinKeypadPage {
    constructor(targetPin) {
        this._$password = document.getElementById('pass_inp');
        this._$passwordContainer = document.getElementById('password');
        this._targetPin = targetPin;
        this._onInputChangeB = this._onInputChange.bind(this);
        this._onClickB = this._onClick.bind(this);
        this._onBackB = this._onBack.bind(this);
        this._resolve = null;
        this._finished = null;
    }

    open() {
        this._finished = new Promise(res => this._resolve = res);

        this._$password.addEventListener('input', this._onInputChangeB);
        for (const i of document.getElementsByClassName('pass_btn'))
            i.addEventListener('click', this._onClickB);

        screen = "pin";
        document.body.dataset.page = "pin";
        g_back_handler = this._onBackB;
        EL('title').innerHTML = app_title;
        this._$passwordContainer.style.display = 'block';
        this._$password.focus();
    }

    close(success = false) {
        this._$password.removeEventListener('input', this._onInputChangeB);
        for (const i of document.getElementsByClassName('pass_btn'))
            i.removeEventListener('click', this._onClickB);

        g_back_handler = null;
        this._$passwordContainer.style.display = 'none';
        this._$password.value = '';
        if (this._resolve) this._resolve(success);
    }

    /**
     * @returns {Promise<boolean>}
     */
    async show() {
        this.open();
        return this._finished;
    }

    _onInputChange() {
        let hash = PinKeypadPage.pinHash(this._$password.value);
        if (hash === this._targetPin) this.close(true);
    }

    _onBack() {
        this.close(false);
    }

    _onClick(event) {
        const key = event.currentTarget.dataset.key;
        if (key === '<') this._$password.value = this._$password.value.slice(0, -1);
        else this._$password.value += key;
        this._onInputChange();
    }

    static pinHash(str) {
        if (!str.length) return 0;
        let hash = new Uint32Array(1);
        for (let i = 0; i < str.length; i++) {
            hash[0] = ((hash[0] << 5) - hash[0]) + str.charCodeAt(i);
        }
        return hash[0];
    }
}
