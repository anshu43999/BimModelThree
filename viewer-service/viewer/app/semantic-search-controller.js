import {normalizeSemanticSearchText} from "../engines/semantic-index-core.js";

function resultKey(item) {
    if (item?.localId !== null && item?.localId !== undefined) {
        return `id:${item.localId}`;
    }
    return `group:${item?.title || ""}:${item?.localIds?.join(",") || ""}`;
}

export class SemanticSearchController {
    constructor(options = {}) {
        this.indexController = options.indexController || null;
        this.resolveItem = options.resolveItem || null;
        this.convertIndexItem = options.convertIndexItem || ((item) => item);
        this.scanLimit = Math.max(0, Number(options.scanLimit) || 1200);
        this.resultLimit = Math.max(1, Number(options.resultLimit) || 80);
    }

    async search(options = {}) {
        const modelId = String(options.modelId || "").trim();
        const query = String(options.query || "").trim();
        const normalizedQuery = normalizeSemanticSearchText(query);
        const isCancelled = typeof options.isCancelled === "function"
            ? options.isCancelled
            : () => false;
        if (!modelId || !normalizedQuery) {
            return this.createResult(modelId, query, [], null, 0, false);
        }

        const byKey = new Map();
        const addResult = (item) => {
            if (!item || byKey.size >= this.resultLimit) {
                return;
            }
            const key = resultKey(item);
            if (!byKey.has(key)) {
                byKey.set(key, item);
            }
        };

        for (const candidate of options.treeCandidates || []) {
            if (normalizeSemanticSearchText(candidate?.searchText).includes(normalizedQuery)) {
                addResult(candidate);
            }
        }

        const numericLocalId = Number(query);
        if (Number.isInteger(numericLocalId) && numericLocalId >= 0 && this.resolveItem) {
            addResult(await this.resolveItem(numericLocalId));
        }
        if (isCancelled()) {
            return this.createResult(modelId, query, [], null, 0, true);
        }

        let indexState = this.indexController?.getState(modelId) || null;
        if (normalizedQuery.length >= 2 && indexState?.indexed && byKey.size < this.resultLimit) {
            try {
                const indexedItems = await this.indexController.search(
                    modelId,
                    query,
                    this.resultLimit - byKey.size
                );
                if (isCancelled()) {
                    return this.createResult(modelId, query, [], null, 0, true);
                }
                for (const item of indexedItems) {
                    addResult(this.convertIndexItem(item));
                }
                indexState = this.indexController.getState(modelId);
                if (indexState?.ready) {
                    return this.createResult(modelId, query, byKey, indexState, 0, false);
                }
            } catch {
                indexState = this.indexController?.getState(modelId) || null;
            }
        }

        let scanned = 0;
        if (normalizedQuery.length >= 2 && byKey.size < this.resultLimit && this.resolveItem) {
            const ids = (options.allLocalIds || []).slice(0, this.scanLimit);
            for (const localId of ids) {
                if (isCancelled()) {
                    return this.createResult(modelId, query, [], indexState, scanned, true);
                }
                const item = await this.resolveItem(localId);
                scanned += 1;
                if (normalizeSemanticSearchText(item?.searchText).includes(normalizedQuery)) {
                    addResult(item);
                }
                if (byKey.size >= this.resultLimit) {
                    break;
                }
            }
        }

        return this.createResult(modelId, query, byKey, indexState, scanned, false);
    }

    createResult(modelId, query, values, indexState, scanned, cancelled) {
        const results = values instanceof Map ? [...values.values()] : values;
        return {
            modelId,
            query,
            results: results.slice(0, this.resultLimit),
            indexState,
            scanned,
            cancelled
        };
    }
}
