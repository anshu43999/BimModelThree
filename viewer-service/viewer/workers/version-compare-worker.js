import {compareFingerprintItems, compareGlobalIdEntries} from "../engines/version-compare-core.js";

self.addEventListener("message", (event) => {
    const message = event.data || {};
    try {
        let result;
        if (message.type === "compare-index") {
            result = compareGlobalIdEntries(message.baseEntries, message.compareEntries);
        } else if (message.type === "compare-fingerprints") {
            result = compareFingerprintItems(message.items, message.options);
        } else {
            throw new Error(`Unknown version compare message: ${message.type}`);
        }
        self.postMessage({requestId: message.requestId, ok: true, result});
    } catch (error) {
        self.postMessage({
            requestId: message.requestId,
            ok: false,
            error: error?.message || String(error)
        });
    }
});
