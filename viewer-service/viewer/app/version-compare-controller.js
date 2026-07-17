import {compareFingerprintItems, compareGlobalIdEntries} from "../engines/version-compare-core.js";

export class VersionCompareController {
    constructor(options = {}) {
        this.workerUrl = options.workerUrl || null;
        this.WorkerClass = options.WorkerClass || globalThis.Worker || null;
        this.worker = null;
        this.mode = "uninitialized";
        this.sequence = 0;
        this.pending = new Map();
    }

    ensureBackend() {
        if (this.mode !== "uninitialized") {
            return;
        }
        if (!this.WorkerClass || !this.workerUrl) {
            this.mode = "fallback";
            return;
        }
        try {
            this.worker = new this.WorkerClass(this.workerUrl, {type: "module"});
            this.worker.addEventListener("message", (event) => this.handleMessage(event.data));
            this.worker.addEventListener("error", (event) => this.handleFailure(event.error || new Error(event.message)));
            this.mode = "worker";
        } catch {
            this.mode = "fallback";
        }
    }

    compareIndexes(baseEntries, compareEntries) {
        return this.request("compare-index", {baseEntries, compareEntries});
    }

    compareFingerprints(items, options = {}) {
        return this.request("compare-fingerprints", {items, options});
    }

    request(type, payload) {
        this.ensureBackend();
        if (this.mode === "fallback") {
            return Promise.resolve(this.runFallback(type, payload));
        }
        const requestId = `compare-${++this.sequence}`;
        return new Promise((resolve, reject) => {
            this.pending.set(requestId, {resolve, reject, type, payload});
            this.worker.postMessage({requestId, type, ...payload});
        });
    }

    runFallback(type, payload) {
        return type === "compare-index"
            ? compareGlobalIdEntries(payload.baseEntries, payload.compareEntries)
            : compareFingerprintItems(payload.items, payload.options);
    }

    handleMessage(message = {}) {
        const pending = this.pending.get(message.requestId);
        if (!pending) {
            return;
        }
        this.pending.delete(message.requestId);
        if (message.ok) {
            pending.resolve(message.result);
        } else {
            pending.reject(new Error(message.error || "Version compare worker failed"));
        }
    }

    handleFailure(error) {
        this.worker?.terminate?.();
        this.worker = null;
        this.mode = "fallback";
        for (const pending of this.pending.values()) {
            try {
                pending.resolve(this.runFallback(pending.type, pending.payload));
            } catch (fallbackError) {
                pending.reject(fallbackError || error);
            }
        }
        this.pending.clear();
    }

    cancel() {
        const error = new Error("VERSION_COMPARE_ABORTED");
        this.worker?.terminate?.();
        this.worker = null;
        for (const pending of this.pending.values()) {
            pending.reject(error);
        }
        this.pending.clear();
        this.mode = "uninitialized";
    }

    dispose() {
        this.cancel();
        this.mode = "disposed";
    }
}
