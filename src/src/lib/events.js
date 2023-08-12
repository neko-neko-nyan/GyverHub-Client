
export default class EventEmitter {
    /**
     * @type DocumentFragment
     */
    #delegate;

    constructor() {
        this.#delegate = document.createDocumentFragment();
    }

    /**
     * @param {string} type
     * @param {EventListener | null} listener
     * @param {boolean | {once?: boolean, passive?: boolean, signal?: AbortSignal} | undefined} options
     */
    addEventListener(type, listener = null, options = undefined) {
        return this.#delegate.addEventListener(type, listener, options);
    }

    /**
     * @param {string} type
     * @param {EventListener | null} listener
     * @param {boolean | undefined} options
     */
    removeEventListener(type, listener, options = undefined) {
        return this.#delegate.removeEventListener(type, listener, options);
    }

    /**
     * @param {Event} event
     * @returns {boolean}
     */
    dispatchEvent(event) {
        return this.#delegate.dispatchEvent(event);
    }
}
