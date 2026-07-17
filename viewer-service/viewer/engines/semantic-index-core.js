export function normalizeSemanticSearchText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizeSemanticIndexItem(item = {}) {
    const localId = Number(item.localId);
    if (!Number.isFinite(localId)) {
        return null;
    }
    const normalized = {
        localId,
        globalId: normalizeText(item.globalId),
        entityName: normalizeText(item.entityName || item.name),
        category: normalizeText(item.category),
        className: normalizeText(item.className),
        storey: normalizeText(item.storey),
        objectType: normalizeText(item.objectType),
        predefinedType: normalizeText(item.predefinedType)
    };
    normalized.searchText = normalizeSemanticSearchText([
        normalized.localId,
        normalized.globalId,
        normalized.entityName,
        normalized.category,
        normalized.className,
        normalized.storey,
        normalized.objectType,
        normalized.predefinedType
    ].join(" "));
    return normalized;
}

function getSearchScore(item, query) {
    if (String(item.localId) === query || normalizeSemanticSearchText(item.globalId) === query) {
        return 0;
    }
    const name = normalizeSemanticSearchText(item.entityName);
    if (name === query) {
        return 1;
    }
    if (name.startsWith(query)) {
        return 2;
    }
    if (name.includes(query)) {
        return 3;
    }
    return 4;
}

export class SemanticIndexStore {
    constructor() {
        this.models = new Map();
    }

    begin(modelId, total = 0) {
        const key = String(modelId || "").trim();
        if (!key) {
            throw new Error("SemanticIndexStore.begin requires modelId");
        }
        const model = {
            modelId: key,
            total: Math.max(0, Number(total) || 0),
            indexed: 0,
            ready: false,
            items: [],
            byLocalId: new Map()
        };
        this.models.set(key, model);
        return this.getState(key);
    }

    append(modelId, items = []) {
        const model = this.models.get(String(modelId || ""));
        if (!model) {
            throw new Error(`Semantic index model not initialized: ${modelId}`);
        }
        for (const value of items) {
            const item = normalizeSemanticIndexItem(value);
            if (!item) {
                continue;
            }
            const existingIndex = model.byLocalId.get(item.localId);
            if (existingIndex !== undefined) {
                model.items[existingIndex] = item;
            } else {
                model.byLocalId.set(item.localId, model.items.length);
                model.items.push(item);
            }
        }
        model.indexed = model.items.length;
        return this.getState(model.modelId);
    }

    complete(modelId) {
        const model = this.models.get(String(modelId || ""));
        if (!model) {
            return null;
        }
        model.ready = true;
        model.indexed = model.items.length;
        return this.getState(model.modelId);
    }

    search(modelId, query, limit = 80) {
        const model = this.models.get(String(modelId || ""));
        const normalizedQuery = normalizeSemanticSearchText(query);
        if (!model || !normalizedQuery) {
            return [];
        }
        const maxResults = Math.max(1, Math.min(500, Number(limit) || 80));
        const matches = [];
        for (const item of model.items) {
            if (!item.searchText.includes(normalizedQuery)) {
                continue;
            }
            matches.push({item, score: getSearchScore(item, normalizedQuery)});
        }
        matches.sort((left, right) => left.score - right.score || left.item.localId - right.item.localId);
        return matches.slice(0, maxResults).map(({item}) => ({
            localId: item.localId,
            globalId: item.globalId,
            entityName: item.entityName,
            category: item.category,
            className: item.className,
            storey: item.storey,
            objectType: item.objectType,
            predefinedType: item.predefinedType
        }));
    }

    clear(modelId = null) {
        if (modelId === null || modelId === undefined) {
            this.models.clear();
            return;
        }
        this.models.delete(String(modelId));
    }

    getState(modelId) {
        const model = this.models.get(String(modelId || ""));
        return model ? {
            modelId: model.modelId,
            total: model.total,
            indexed: model.indexed,
            ready: model.ready
        } : null;
    }
}
