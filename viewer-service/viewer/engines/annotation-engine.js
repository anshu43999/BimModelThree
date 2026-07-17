const DEFAULT_STORAGE_KEY = "bim-viewer.annotations.v1";
const DEFAULT_MAX_ITEMS = 1000;
const SCHEMA_VERSION = "bim-annotation/v1";

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
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
    if (isFiniteNumber(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }
    return null;
}

function normalizeStatus(value) {
    return normalizeString(value, "open").trim() || "open";
}

function normalizePriority(value) {
    if (isFiniteNumber(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const number = Number(value);
        return Number.isFinite(number) ? number : value.trim();
    }
    return "normal";
}

function normalizePermission(value) {
    const text = normalizeString(value, "team").trim();
    return ["team", "owner", "assignee"].includes(text) ? text : "team";
}

function normalizeUser(value, fallback = null) {
    const text = normalizeString(value, fallback || "").trim();
    return text || fallback;
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

function createId() {
    const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `annotation-${random}`;
}

function createHistoryEntry(action, actor = null, detail = null) {
    return {
        id: `history-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        action: normalizeString(action, "updated").trim() || "updated",
        actor: normalizeUser(actor, null),
        detail: cloneJson(detail, null),
        createdAt: new Date().toISOString()
    };
}

function normalizeHistory(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(isObject)
        .map((entry) => ({
            id: normalizeString(entry.id).trim() || createId(),
            action: normalizeString(entry.action, "updated").trim() || "updated",
            actor: normalizeUser(entry.actor, null),
            detail: cloneJson(entry.detail, null),
            createdAt: normalizeString(entry.createdAt, new Date().toISOString())
        }));
}

function getChangedFields(before = {}, after = {}) {
    const fields = ["content", "status", "priority", "assignee", "permission", "position"];
    return fields.filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

function getStorage(storageKey) {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const storage = window.localStorage;
        if (!storage) {
            return null;
        }
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

export class AnnotationEngine extends EventTarget {
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
            .map((item) => this.toPublicAnnotation(item));
    }

    create(annotation = {}) {
        const source = isObject(annotation) ? annotation : {};
        const title = normalizeString(source.title).trim();
        const content = normalizeString(source.content).trim();
        if (!title && !content) {
            throw new Error("AnnotationEngine.create requires title or content");
        }

        const now = new Date().toISOString();
        const item = this.normalizeAnnotation({
            ...source,
            id: source.id || createId(),
            modelId: source.modelId ?? this.currentModelId,
            modelName: source.modelName ?? this.currentModelName,
            title,
            content,
            createdAt: source.createdAt || now,
            updatedAt: now
        });

        this.items = [item, ...this.items.filter((existing) => existing.id !== item.id)];
        this.trimToLimit();
        this.persist("created", item);
        return this.toPublicAnnotation(item);
    }

    update(id, patch = {}, options = {}) {
        const key = normalizeString(id).trim();
        if (!key) {
            return null;
        }

        const index = this.items.findIndex((item) => item.id === key);
        if (index < 0) {
            return null;
        }

        const current = this.items[index];
        const sourcePatch = isObject(patch) ? patch : {};
        const candidate = this.normalizeAnnotation({
            ...current,
            ...sourcePatch,
            id: current.id,
            createdAt: current.createdAt,
            createdBy: current.createdBy || sourcePatch.createdBy,
            updatedAt: new Date().toISOString()
        });

        if (!candidate.title && !candidate.content) {
            throw new Error("AnnotationEngine.update requires title or content");
        }

        const actor = normalizeUser(sourcePatch.updatedBy || options.actor, null);
        if (actor) {
            candidate.updatedBy = actor;
        }
        const changedFields = getChangedFields(current, candidate);
        if (options.history !== false && changedFields.length) {
            candidate.history = [
                ...normalizeHistory(current.history),
                createHistoryEntry("updated", actor, {fields: changedFields})
            ];
        }
        this.items[index] = candidate;
        this.persist("updated", candidate);
        return this.toPublicAnnotation(candidate);
    }

    remove(id) {
        const key = normalizeString(id).trim();
        if (!key) {
            return false;
        }
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
        if (removed > 0) {
            this.persist("cleared", {count: removed, filter: normalizedFilter});
        }
        return removed;
    }

    get(id) {
        const key = normalizeString(id).trim();
        const item = this.items.find((annotation) => annotation.id === key);
        return item ? this.toPublicAnnotation(item) : null;
    }

    exportJson() {
        return JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            items: this.items.map((item) => this.toPublicAnnotation(item))
        }, null, 2);
    }

    importJson(json) {
        const parsed = this.parseImport(json);
        if (!parsed.ok) {
            return {
                ok: false,
                imported: 0,
                skipped: 0,
                error: parsed.error
            };
        }

        const now = new Date().toISOString();
        const existingById = new Map(this.items.map((item) => [item.id, item]));
        let imported = 0;
        let skipped = 0;

        for (const entry of parsed.items) {
            try {
                const source = isObject(entry) ? entry : {};
                const title = normalizeString(source.title).trim();
                const content = normalizeString(source.content).trim();
                if (!title && !content) {
                    skipped += 1;
                    continue;
                }
                const id = normalizeString(source.id).trim() || createId();
                const previous = existingById.get(id);
                const item = this.normalizeAnnotation({
                    ...previous,
                    ...source,
                    id,
                    title,
                    content,
                    createdAt: source.createdAt || previous?.createdAt || now,
                    updatedAt: source.updatedAt || now
                });
                existingById.set(id, item);
                imported += 1;
            } catch {
                skipped += 1;
            }
        }

        this.items = [...existingById.values()]
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        this.trimToLimit();
        this.persist("imported", {imported, skipped});
        return {
            ok: true,
            imported,
            skipped,
            total: this.items.length
        };
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
            if (!Array.isArray(rawItems)) {
                this.items = [];
                return;
            }
            this.items = rawItems
                .map((item) => {
                    try {
                        return this.normalizeAnnotation(item);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean)
                .filter((item) => item.title || item.content);
            this.trimToLimit();
        } catch {
            this.items = [];
            this.storageFailed = true;
        }
    }

    persist(type, detail = {}) {
        const payload = emptyEnvelope();
        payload.items = this.items.map((item) => this.toPublicAnnotation(item));
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
                fallbackPayload.items = this.items.map((item) => this.toPublicAnnotation(item));
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
            globalId: source.globalId === undefined ? undefined : normalizeOptionalString(source.globalId),
            status: source.status === undefined ? undefined : normalizeStatus(source.status)
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
        if (filter.status !== undefined && item.status !== filter.status) {
            return false;
        }
        return true;
    }

    normalizeAnnotation(annotation = {}) {
        const source = isObject(annotation) ? annotation : {};
        const createdAt = normalizeString(source.createdAt, new Date().toISOString());
        const updatedAt = normalizeString(source.updatedAt, createdAt);
        const createdBy = normalizeUser(source.createdBy, null);
        const updatedBy = normalizeUser(source.updatedBy, createdBy);
        const history = normalizeHistory(source.history);
        if (!history.length && createdBy) {
            history.push(createHistoryEntry("created", createdBy, null));
            history[0].createdAt = createdAt;
        }
        return {
            id: normalizeString(source.id).trim() || createId(),
            modelId: normalizeOptionalString(source.modelId),
            modelName: normalizeOptionalString(source.modelName),
            localId: normalizeLocalId(source.localId),
            globalId: normalizeOptionalString(source.globalId),
            title: normalizeString(source.title).trim(),
            content: normalizeString(source.content).trim(),
            camera: cloneJson(source.camera, null),
            selection: cloneJson(source.selection, null),
            position: normalizePosition(source.position),
            status: normalizeStatus(source.status),
            priority: normalizePriority(source.priority),
            createdBy,
            updatedBy,
            assignee: normalizeUser(source.assignee, null),
            permission: normalizePermission(source.permission),
            history,
            createdAt,
            updatedAt
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

    parseImport(json) {
        try {
            const data = typeof json === "string" ? JSON.parse(json) : json;
            const items = Array.isArray(data) ? data : data?.items;
            if (!Array.isArray(items)) {
                return {
                    ok: false,
                    error: "Annotation import requires an array or an object with items"
                };
            }
            return {
                ok: true,
                items
            };
        } catch (error) {
            return {
                ok: false,
                error: String(error?.message || error)
            };
        }
    }

    toPublicAnnotation(item) {
        return cloneJson(item, {
            id: item.id,
            modelId: item.modelId,
            modelName: item.modelName,
            localId: item.localId,
            globalId: item.globalId,
            title: item.title,
            content: item.content,
            camera: null,
            selection: null,
            position: null,
            status: item.status,
            priority: item.priority,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        });
    }
}
