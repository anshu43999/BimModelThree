const DEFAULT_STORAGE_KEY = "bim-viewer:view-store";
const DEFAULT_MAX_ITEMS = 100;
const SCHEMA_VERSION = "bim-view-store/v1";

function nowIso() {
    return new Date().toISOString();
}

function createId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneJson(value, fallback = null) {
    if (value === undefined) {
        return fallback;
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return fallback;
    }
}

function normalizeString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}

function normalizeNullableString(value) {
    return typeof value === "string" && value.length ? value : null;
}

function normalizeTags(tags) {
    if (!Array.isArray(tags)) {
        return [];
    }
    return [...new Set(tags
        .filter((tag) => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean))];
}

function normalizeMaxItems(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 1) {
        return DEFAULT_MAX_ITEMS;
    }
    return Math.floor(number);
}

function normalizeRecord(view = {}, defaults = {}) {
    const source = view && typeof view === "object" ? view : {};
    const fallback = defaults && typeof defaults === "object" ? defaults : {};
    const createdAt = normalizeString(source.createdAt, fallback.createdAt || nowIso());
    const updatedAt = normalizeString(source.updatedAt, fallback.updatedAt || createdAt);
    const id = normalizeString(source.id, fallback.id || createId());

    return {
        id,
        name: normalizeString(source.name, fallback.name || "Untitled view"),
        modelId: normalizeNullableString(source.modelId ?? fallback.modelId),
        modelName: normalizeNullableString(source.modelName ?? fallback.modelName),
        camera: cloneJson(source.camera ?? fallback.camera),
        selection: cloneJson(source.selection ?? fallback.selection),
        snapshot: cloneJson(source.snapshot ?? fallback.snapshot),
        createdAt,
        updatedAt,
        tags: normalizeTags(source.tags ?? fallback.tags),
        note: normalizeString(source.note, fallback.note || "")
    };
}

function isQuotaError(error) {
    return error?.name === "QuotaExceededError"
        || error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
        || error?.code === 22
        || error?.code === 1014;
}

function getLocalStorage() {
    try {
        const storage = globalThis.localStorage;
        const key = "__view_store_engine_test__";
        storage.setItem(key, key);
        storage.removeItem(key);
        return storage;
    } catch {
        return null;
    }
}

export class ViewStoreEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.storageKey = normalizeString(options.storageKey, DEFAULT_STORAGE_KEY);
        this.maxItems = normalizeMaxItems(options.maxItems);
        this.currentModelId = null;
        this.currentModelName = null;
        this.storage = getLocalStorage();
        this.items = this.readItems();
    }

    list() {
        const items = this.currentModelId
            ? this.items.filter((item) => item.modelId === this.currentModelId)
            : this.items;
        return items.map((item) => cloneJson(item, normalizeRecord(item)));
    }

    save(view = {}) {
        const timestamp = nowIso();
        const record = normalizeRecord(view, {
            modelId: this.currentModelId,
            modelName: this.currentModelName,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        const existingIndex = this.items.findIndex((item) => item.id === record.id);
        if (existingIndex >= 0) {
            record.id = createId();
        }

        this.items = [record, ...this.items];
        this.trimItems();
        this.persist();
        this.emit("saved", record);
        return cloneJson(record, normalizeRecord(record));
    }

    update(id, patch = {}) {
        const viewId = normalizeString(id, "");
        if (!viewId || !patch || typeof patch !== "object") {
            return null;
        }

        const index = this.items.findIndex((item) => item.id === viewId);
        if (index < 0) {
            return null;
        }

        const current = this.items[index];
        const next = normalizeRecord({
            ...current,
            ...patch,
            id: current.id,
            createdAt: current.createdAt,
            updatedAt: nowIso()
        }, current);

        this.items = [
            next,
            ...this.items.slice(0, index),
            ...this.items.slice(index + 1)
        ];
        this.trimItems();
        this.persist();
        this.emit("updated", next);
        return cloneJson(next, normalizeRecord(next));
    }

    remove(id) {
        const viewId = normalizeString(id, "");
        const before = this.items.length;
        this.items = this.items.filter((item) => item.id !== viewId);
        const removed = this.items.length !== before;
        if (removed) {
            this.persist();
            this.emit("removed", {id: viewId});
        }
        return removed;
    }

    clear() {
        const previousCount = this.items.length;
        this.items = [];
        this.persist();
        this.emit("cleared", {count: previousCount});
        return previousCount;
    }

    clearCurrentModel() {
        const modelId = this.currentModelId;
        if (!modelId) {
            return 0;
        }
        const previousCount = this.items.length;
        this.items = this.items.filter((item) => item.modelId !== modelId);
        const removed = previousCount - this.items.length;
        if (removed) {
            this.persist();
            this.emit("cleared", {count: removed, modelId});
        }
        return removed;
    }

    get(id) {
        const viewId = normalizeString(id, "");
        const item = this.items.find((entry) => entry.id === viewId);
        return item ? cloneJson(item, normalizeRecord(item)) : null;
    }

    setCurrentModel(modelId, modelName = null) {
        this.currentModelId = normalizeNullableString(modelId);
        this.currentModelName = normalizeNullableString(modelName);
        this.emit("modelChanged", {
            modelId: this.currentModelId,
            modelName: this.currentModelName
        });
        return {
            modelId: this.currentModelId,
            modelName: this.currentModelName
        };
    }

    exportJson() {
        return JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            exportedAt: nowIso(),
            items: this.items.map((item) => normalizeRecord(item))
        });
    }

    importJson(json) {
        const parsed = this.parseImport(json);
        if (!parsed) {
            return {
                imported: 0,
                skipped: 0,
                total: this.items.length
            };
        }

        const incoming = parsed
            .map((item) => normalizeRecord(item, {
                modelId: this.currentModelId,
                modelName: this.currentModelName
            }))
            .filter((item) => item.camera || item.selection || item.snapshot);

        const existingIds = new Set(this.items.map((item) => item.id));
        const uniqueIncoming = incoming.map((item) => {
            if (existingIds.has(item.id)) {
                item.id = createId();
            }
            existingIds.add(item.id);
            return item;
        });

        this.items = [...uniqueIncoming, ...this.items];
        this.trimItems();
        this.persist();
        this.emit("imported", {
            imported: uniqueIncoming.length,
            skipped: parsed.length - incoming.length,
            total: this.items.length
        });
        return {
            imported: uniqueIncoming.length,
            skipped: parsed.length - incoming.length,
            total: this.items.length
        };
    }

    readItems() {
        if (!this.storage) {
            return [];
        }

        try {
            const raw = this.storage.getItem(this.storageKey);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw);
            const records = Array.isArray(parsed) ? parsed : parsed?.items;
            if (!Array.isArray(records)) {
                return [];
            }
            return records.map((record) => normalizeRecord(record)).slice(0, this.maxItems);
        } catch {
            return [];
        }
    }

    persist() {
        if (!this.storage) {
            return false;
        }

        let items = this.items;
        while (items.length >= 0) {
            try {
                this.storage.setItem(this.storageKey, JSON.stringify({
                    schemaVersion: SCHEMA_VERSION,
                    updatedAt: nowIso(),
                    items
                }));
                this.items = items;
                return true;
            } catch (error) {
                if (!isQuotaError(error) || items.length === 0) {
                    return false;
                }
                items = items.slice(0, -1);
            }
        }
        return false;
    }

    trimItems() {
        this.items = this.items
            .slice()
            .sort((a, b) => normalizeString(b.updatedAt).localeCompare(normalizeString(a.updatedAt)))
            .slice(0, this.maxItems);
    }

    parseImport(json) {
        try {
            const parsed = typeof json === "string" ? JSON.parse(json) : json;
            const records = Array.isArray(parsed) ? parsed : parsed?.items;
            return Array.isArray(records) ? records : null;
        } catch {
            return null;
        }
    }

    emit(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, {
            detail
        }));
    }
}
