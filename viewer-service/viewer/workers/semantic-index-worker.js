import {SemanticIndexStore} from "../engines/semantic-index-core.js";

const store = new SemanticIndexStore();

self.addEventListener("message", (event) => {
    const message = event.data || {};
    const requestId = message.requestId || null;
    try {
        let result = null;
        if (message.type === "begin") {
            result = store.begin(message.modelId, message.total);
        } else if (message.type === "append") {
            result = store.append(message.modelId, message.items);
        } else if (message.type === "complete") {
            result = store.complete(message.modelId);
        } else if (message.type === "search") {
            result = {
                state: store.getState(message.modelId),
                results: store.search(message.modelId, message.query, message.limit)
            };
        } else if (message.type === "clear") {
            store.clear(message.modelId);
            result = null;
        } else if (message.type === "state") {
            result = store.getState(message.modelId);
        } else {
            throw new Error(`Unknown semantic index message: ${message.type}`);
        }
        self.postMessage({requestId, ok: true, type: message.type, result});
    } catch (error) {
        self.postMessage({
            requestId,
            ok: false,
            type: message.type,
            error: error?.message || String(error)
        });
    }
});
