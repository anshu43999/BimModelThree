import {SemanticIndexStore} from "../engines/semantic-index-core.js";

export class SemanticIndexController extends EventTarget {
    constructor(options = {}) {
        super();
        this.workerUrl = options.workerUrl || null;
        this.WorkerClass = options.WorkerClass || globalThis.Worker || null;
        this.worker = null;
        this.mode = "uninitialized";
        this.requestSequence = 0;
        this.pending = new Map();
        this.states = new Map();
        this.fallbackStore = new SemanticIndexStore();
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
            this.worker.addEventListener("message", (event) => this.handleWorkerMessage(event.data));
            this.worker.addEventListener("error", (event) => this.handleWorkerFailure(event.error || new Error(event.message)));
            this.mode = "worker";
        } catch {
            this.mode = "fallback";
        }
    }

    async begin(modelId, total) {
        const state = await this.request("begin", {modelId, total});
        this.setState(modelId, state, "begin");
        return state;
    }

    async append(modelId, items) {
        const state = await this.request("append", {modelId, items});
        this.setState(modelId, state, "progress");
        return state;
    }

    async complete(modelId) {
        const state = await this.request("complete", {modelId});
        this.setState(modelId, state, "ready");
        return state;
    }

    async search(modelId, query, limit = 80) {
        const payload = await this.request("search", {modelId, query, limit});
        if (payload?.state) {
            this.states.set(String(modelId), payload.state);
        }
        return payload?.results || [];
    }

    async clear(modelId = null) {
        if (this.mode === "uninitialized") {
            if (modelId === null || modelId === undefined) {
                this.states.clear();
                this.fallbackStore.clear();
            } else {
                this.states.delete(String(modelId));
                this.fallbackStore.clear(modelId);
            }
            return;
        }
        await this.request("clear", {modelId});
        if (modelId === null || modelId === undefined) {
            this.states.clear();
        } else {
            this.states.delete(String(modelId));
        }
    }

    getState(modelId) {
        return this.states.get(String(modelId || "")) || null;
    }

    request(type, payload = {}) {
        this.ensureBackend();
        if (this.mode === "fallback") {
            return Promise.resolve(this.runFallback(type, payload));
        }
        if (this.mode !== "worker" || !this.worker) {
            return Promise.reject(new Error("Semantic index worker unavailable"));
        }
        const requestId = `semantic-${++this.requestSequence}`;
        return new Promise((resolve, reject) => {
            this.pending.set(requestId, {resolve, reject});
            this.worker.postMessage({type, requestId, ...payload});
        });
    }

    runFallback(type, payload) {
        if (type === "begin") {
            return this.fallbackStore.begin(payload.modelId, payload.total);
        }
        if (type === "append") {
            return this.fallbackStore.append(payload.modelId, payload.items);
        }
        if (type === "complete") {
            return this.fallbackStore.complete(payload.modelId);
        }
        if (type === "search") {
            return {
                state: this.fallbackStore.getState(payload.modelId),
                results: this.fallbackStore.search(payload.modelId, payload.query, payload.limit)
            };
        }
        if (type === "clear") {
            this.fallbackStore.clear(payload.modelId);
            return null;
        }
        return this.fallbackStore.getState(payload.modelId);
    }

    handleWorkerMessage(message = {}) {
        const pending = this.pending.get(message.requestId);
        if (!pending) {
            return;
        }
        this.pending.delete(message.requestId);
        if (message.ok) {
            pending.resolve(message.result);
        } else {
            pending.reject(new Error(message.error || "Semantic index worker failed"));
        }
    }

    handleWorkerFailure(error) {
        this.worker?.terminate?.();
        this.worker = null;
        this.mode = "fallback";
        this.states.clear();
        this.fallbackStore.clear();
        for (const pending of this.pending.values()) {
            pending.reject(error || new Error("Semantic index worker failed"));
        }
        this.pending.clear();
        this.dispatchEvent(new CustomEvent("error", {detail: {error}}));
    }

    setState(modelId, state, reason) {
        if (!state) {
            return;
        }
        this.states.set(String(modelId), state);
        this.dispatchEvent(new CustomEvent("statechange", {
            detail: {reason, state, mode: this.mode}
        }));
    }

    dispose() {
        this.worker?.terminate?.();
        this.worker = null;
        this.pending.clear();
        this.states.clear();
        this.fallbackStore.clear();
        this.mode = "disposed";
    }
}
