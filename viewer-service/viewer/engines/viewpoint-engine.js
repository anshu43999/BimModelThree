export class ViewpointEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.renderEngine = options.renderEngine;
        this.interactionEngine = options.interactionEngine || null;
        this.current = null;
    }

    capture(options = {}) {
        if (!this.renderEngine || typeof this.renderEngine.getViewState !== "function") {
            throw new Error("ViewpointEngine requires renderEngine.getViewState()");
        }

        const state = {
            schemaVersion: "bim-viewpoint/v1",
            createdAt: new Date().toISOString(),
            camera: this.renderEngine.getViewState()
        };

        if (options.includeSelection && this.interactionEngine?.getSelection) {
            state.selection = this.interactionEngine.getSelection();
        }

        this.current = state;
        this.dispatchEvent(new CustomEvent("captured", {
            detail: state
        }));
        return state;
    }

    restore(state = this.current) {
        if (!state) {
            return false;
        }
        if (!this.renderEngine || typeof this.renderEngine.restoreViewState !== "function") {
            throw new Error("ViewpointEngine requires renderEngine.restoreViewState()");
        }

        const viewState = state.camera || state;
        this.renderEngine.restoreViewState(viewState);
        this.current = state;
        this.dispatchEvent(new CustomEvent("restored", {
            detail: state
        }));
        return true;
    }

    hasCurrent() {
        return Boolean(this.current);
    }

    getCurrent() {
        return this.current;
    }

    clear() {
        this.current = null;
        this.dispatchEvent(new CustomEvent("cleared"));
    }
}
