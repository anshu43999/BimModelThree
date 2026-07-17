const DEFAULT_STORAGE_KEY = "bim-viewer.labels.v1";
const DEFAULT_MAX_ITEMS = 1000;
const SCHEMA_VERSION = "bim-label/v1";

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value, fallback = "") {
    if (value === undefined || value === null) {
        return fallback;
    }
    return String(value);
}

function normalizeOptionalString(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    return String(value);
}

function normalizeLocalId(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }
    return null;
}

function normalizePosition(value) {
    if (Array.isArray(value) && value.length >= 3) {
        const vector = value.slice(0, 3).map(Number);
        return vector.every(Number.isFinite) ? vector : null;
    }
    if (isObject(value)) {
        const vector = [Number(value.x), Number(value.y), Number(value.z)];
        return vector.every(Number.isFinite) ? vector : null;
    }
    return null;
}

function cloneJson(value, fallback = null) {
    if (value === undefined || value === null) {
        return fallback;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return fallback;
    }
}

function createId() {
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `label-${random}`;
}

function getStorage(storageKey) {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const storage = window.localStorage;
        const testKey = `${storageKey}.test`;
        storage.setItem(testKey, "1");
        storage.removeItem(testKey);
        return storage;
    } catch {
        return null;
    }
}

function emptyEnvelope() {
    return {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        items: []
    };
}

export class LabelStoreEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.storageKey = normalizeString(options.storageKey, DEFAULT_STORAGE_KEY) || DEFAULT_STORAGE_KEY;
        this.maxItems = Number.isFinite(options.maxItems) && options.maxItems > 0
            ? Math.floor(options.maxItems)
            : DEFAULT_MAX_ITEMS;
        this.currentModelId = null;
        this.currentModelName = null;
        this.storage = getStorage(this.storageKey);
        this.storageFailed = false;
        this.items = [];
        this.load();
    }

    setCurrentModel(modelId, modelName = null) {
        this.currentModelId = normalizeOptionalString(modelId);
        this.currentModelName = normalizeOptionalString(modelName);
        return this;
    }

    list(filter = {}) {
        const normalizedFilter = this.normalizeFilter(filter);
        return this.items
            .filter((item) => this.matchesFilter(item, normalizedFilter))
            .map((item) => this.toPublicLabel(item));
    }

    get(id) {
        const key = normalizeString(id).trim();
        const item = this.items.find((label) => label.id === key);
        return item ? this.toPublicLabel(item) : null;
    }

    save(label = {}) {
        const source = isObject(label) ? label : {};
        const now = new Date().toISOString();
        const item = this.normalizeLabel({
            ...source,
            id: source.id || createId(),
            modelId: source.modelId ?? this.currentModelId,
            modelName: source.modelName ?? this.currentModelName,
            createdAt: source.createdAt || now,
            updatedAt: now
        });
        this.items = [item, ...this.items.filter((existing) => existing.id !== item.id)];
        this.trimToLimit();
        this.persist("saved", item);
        return this.toPublicLabel(item);
    }

    update(id, patch = {}) {
        const key = normalizeString(id).trim();
        const index = this.items.findIndex((item) => item.id === key);
        if (index < 0) {
            return null;
        }
        const current = this.items[index];
        const candidate = this.normalizeLabel({
            ...current,
            ...(isObject(patch) ? patch : {}),
            id: current.id,
            createdAt: current.createdAt,
            updatedAt: new Date().toISOString()
        });
        this.items[index] = candidate;
        this.persist("updated", candidate);
        return this.toPublicLabel(candidate);
    }

    remove(id) {
        const key = normalizeString(id).trim();
        const before = this.items.length;
        this.items = this.items.filter((item) => item.id !== key);
        const removed = this.items.length !== before;
        if (removed) {
            this.persist("removed", {id: key});
        }
        return removed;
    }

    clear(filter = {}) {
        const normalizedFilter = this.normalizeFilter(filter);
        const before = this.items.length;
        this.items = this.items.filter((item) => !this.matchesFilter(item, normalizedFilter));
        const removed = before - this.items.length;
        if (removed) {
            this.persist("cleared", {count: removed, filter: normalizedFilter});
        }
        return removed;
    }

    load() {
        if (!this.storage) {
            this.items = [];
            return;
        }
        try {
            const raw = this.storage.getItem(this.storageKey);
            if (!raw) {
                this.items = [];
                return;
            }
            const data = JSON.parse(raw);
            const rawItems = Array.isArray(data) ? data : data?.items;
            this.items = Array.isArray(rawItems)
                ? rawItems.map((item) => {
                    try {
                        return this.normalizeLabel(item);
                    } catch {
                        return null;
                    }
                }).filter(Boolean)
                : [];
            this.trimToLimit();
        } catch {
            this.items = [];
            this.storageFailed = true;
        }
    }

    persist(type, detail = {}) {
        const payload = emptyEnvelope();
        payload.items = this.items.map((item) => this.toPublicLabel(item));
        this.write(payload);
        this.dispatchEvent(new CustomEvent("changed", {
            detail: {
                type,
                storageFailed: this.storageFailed,
                ...detail
            }
        }));
    }

    write(payload) {
        if (!this.storage) {
            this.storageFailed = true;
            return false;
        }
        try {
            this.storage.setItem(this.storageKey, JSON.stringify(payload));
            this.storageFailed = false;
            return true;
        } catch {
            this.storageFailed = true;
            this.trimToLimit(Math.max(1, Math.floor(this.items.length / 2)));
            try {
                const fallbackPayload = emptyEnvelope();
                fallbackPayload.items = this.items.map((item) => this.toPublicLabel(item));
                this.storage.setItem(this.storageKey, JSON.stringify(fallbackPayload));
                this.storageFailed = false;
                return true;
            } catch {
                return false;
            }
        }
    }

    normalizeFilter(filter = {}) {
        const source = isObject(filter) ? filter : {};
        const hasExplicitModel = Object.prototype.hasOwnProperty.call(source, "modelId");
        return {
            all: source.all === true,
            modelId: hasExplicitModel ? normalizeOptionalString(source.modelId) : this.currentModelId,
            localId: source.localId === undefined ? undefined : normalizeLocalId(source.localId),
            globalId: source.globalId === undefined ? undefined : normalizeOptionalString(source.globalId)
        };
    }

    matchesFilter(item, filter) {
        if (!filter.all && filter.modelId !== null && item.modelId !== filter.modelId) {
            return false;
        }
        if (filter.localId !== undefined && item.localId !== filter.localId) {
            return false;
        }
        if (filter.globalId !== undefined && item.globalId !== filter.globalId) {
            return false;
        }
        return true;
    }

    normalizeLabel(label = {}) {
        const source = isObject(label) ? label : {};
        const position = normalizePosition(source.position);
        if (!position) {
            throw new Error("LabelStoreEngine requires position");
        }
        const createdAt = normalizeString(source.createdAt, new Date().toISOString());
        const title = normalizeString(source.title).trim();
        const localId = normalizeLocalId(source.localId);
        return {
            id: normalizeString(source.id).trim() || createId(),
            modelId: normalizeOptionalString(source.modelId),
            modelName: normalizeOptionalString(source.modelName),
            localId,
            globalId: normalizeOptionalString(source.globalId),
            position,
            title: title || (localId !== null ? `localId ${localId}` : "标签"),
            subtitle: normalizeString(source.subtitle).trim(),
            createdAt,
            updatedAt: normalizeString(source.updatedAt, createdAt)
        };
    }

    trimToLimit(limit = this.maxItems) {
        if (this.items.length <= limit) {
            return;
        }
        this.items = [...this.items]
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
            .slice(0, limit);
    }

    toPublicLabel(item) {
        return cloneJson(item, {
            id: item.id,
            modelId: item.modelId,
            modelName: item.modelName,
            localId: item.localId,
            globalId: item.globalId,
            position: item.position,
            title: item.title,
            subtitle: item.subtitle,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        });
    }
}
