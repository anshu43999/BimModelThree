import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";

const SCHEMA_VERSION = "bim-business-data/v1";
const ALLOWED_TYPES = new Set(["viewpoints", "labels", "annotations", "snapshots"]);
const STORAGE_BACKENDS = new Set(["json-file"]);

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
    const text = normalizeString(value).trim();
    return text || null;
}

function normalizeLocalId(value) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
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

function createId(type) {
    const random = randomUUID();
    return `${type.slice(0, -1)}-${random}`;
}

function readJsonFile(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJsonFile(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export class BusinessDataRepository {
    assertType(type) {
        const normalized = normalizeString(type).trim();
        if (!ALLOWED_TYPES.has(normalized)) {
            throw new Error(`Unsupported business data type: ${type}`);
        }
        return normalized;
    }

    info() {
        return {
            backend: "unknown",
            supportedBackends: [...STORAGE_BACKENDS],
            schemaVersion: SCHEMA_VERSION,
            types: [...ALLOWED_TYPES]
        };
    }

    list() {
        throw new Error("Business data repository list() is not implemented.");
    }

    get() {
        throw new Error("Business data repository get() is not implemented.");
    }

    create() {
        throw new Error("Business data repository create() is not implemented.");
    }

    update() {
        throw new Error("Business data repository update() is not implemented.");
    }

    remove() {
        throw new Error("Business data repository remove() is not implemented.");
    }
}

export class FileBusinessDataStore extends BusinessDataRepository {
    constructor(options = {}) {
        super();
        this.root = path.resolve(options.root || path.join(process.cwd(), "output", "business-data"));
        fs.mkdirSync(this.root, {recursive: true});
    }

    info() {
        return {
            ...super.info(),
            backend: "json-file",
            root: this.root
        };
    }

    filePath(type) {
        return path.join(this.root, `${this.assertType(type)}.json`);
    }

    readEnvelope(type) {
        const normalizedType = this.assertType(type);
        const fallback = {
            schemaVersion: SCHEMA_VERSION,
            type: normalizedType,
            updatedAt: new Date().toISOString(),
            items: []
        };
        const envelope = readJsonFile(this.filePath(normalizedType), fallback);
        return {
            ...fallback,
            ...envelope,
            type: normalizedType,
            items: Array.isArray(envelope?.items) ? envelope.items : []
        };
    }

    writeEnvelope(type, envelope) {
        const normalizedType = this.assertType(type);
        const nextEnvelope = {
            schemaVersion: SCHEMA_VERSION,
            type: normalizedType,
            updatedAt: new Date().toISOString(),
            items: Array.isArray(envelope.items) ? envelope.items : []
        };
        writeJsonFile(this.filePath(normalizedType), nextEnvelope);
        return nextEnvelope;
    }

    list(type, filter = {}) {
        const normalizedType = this.assertType(type);
        const envelope = this.readEnvelope(normalizedType);
        return envelope.items
            .filter((item) => this.matchesFilter(item, filter))
            .map((item) => cloneJson(item));
    }

    get(type, id) {
        const key = normalizeString(id).trim();
        if (!key) {
            return null;
        }
        const item = this.readEnvelope(type).items.find((entry) => entry.id === key);
        return item ? cloneJson(item) : null;
    }

    create(type, payload = {}) {
        const normalizedType = this.assertType(type);
        const envelope = this.readEnvelope(normalizedType);
        const now = new Date().toISOString();
        const item = this.normalizeItem(normalizedType, {
            ...(isObject(payload) ? payload : {}),
            id: normalizeString(payload.id).trim() || createId(normalizedType),
            createdAt: payload.createdAt || now,
            updatedAt: now
        });
        envelope.items = [item, ...envelope.items.filter((entry) => entry.id !== item.id)];
        this.writeEnvelope(normalizedType, envelope);
        return cloneJson(item);
    }

    update(type, id, patch = {}) {
        const normalizedType = this.assertType(type);
        const key = normalizeString(id).trim();
        if (!key) {
            return null;
        }
        const envelope = this.readEnvelope(normalizedType);
        const index = envelope.items.findIndex((entry) => entry.id === key);
        if (index < 0) {
            return null;
        }
        const current = envelope.items[index];
        const item = this.normalizeItem(normalizedType, {
            ...current,
            ...(isObject(patch) ? patch : {}),
            id: current.id,
            createdAt: current.createdAt,
            updatedAt: new Date().toISOString()
        });
        envelope.items[index] = item;
        this.writeEnvelope(normalizedType, envelope);
        return cloneJson(item);
    }

    remove(type, id) {
        const normalizedType = this.assertType(type);
        const key = normalizeString(id).trim();
        if (!key) {
            return false;
        }
        const envelope = this.readEnvelope(normalizedType);
        const before = envelope.items.length;
        envelope.items = envelope.items.filter((entry) => entry.id !== key);
        const removed = before !== envelope.items.length;
        if (removed) {
            this.writeEnvelope(normalizedType, envelope);
        }
        return removed;
    }

    normalizeItem(type, item = {}) {
        const source = isObject(item) ? item : {};
        const content = cloneJson(source.content ?? source.data ?? {}, {});
        return {
            id: normalizeString(source.id).trim() || createId(type),
            type,
            tenantId: normalizeOptionalString(source.tenantId),
            projectId: normalizeOptionalString(source.projectId),
            modelId: normalizeOptionalString(source.modelId),
            versionId: normalizeOptionalString(source.versionId ?? source.modelVersionId),
            modelName: normalizeOptionalString(source.modelName),
            localId: normalizeLocalId(source.localId),
            globalId: normalizeOptionalString(source.globalId ?? source.guid),
            title: normalizeString(source.title).trim(),
            status: normalizeString(source.status, "active").trim() || "active",
            priority: source.priority === undefined ? null : source.priority,
            content,
            camera: cloneJson(source.camera, null),
            selection: cloneJson(source.selection, null),
            position: cloneJson(source.position, null),
            thumbnail: cloneJson(source.thumbnail, null),
            tags: Array.isArray(source.tags) ? source.tags.map(String).filter(Boolean) : [],
            createdBy: normalizeOptionalString(source.createdBy),
            createdAt: normalizeString(source.createdAt, new Date().toISOString()),
            updatedAt: normalizeString(source.updatedAt, source.createdAt || new Date().toISOString())
        };
    }

    matchesFilter(item, filter = {}) {
        const source = isObject(filter) ? filter : {};
        const keys = ["tenantId", "projectId", "modelId", "versionId", "globalId", "status", "createdBy"];
        for (const key of keys) {
            const expected = normalizeOptionalString(source[key]);
            if (expected !== null && normalizeOptionalString(item[key]) !== expected) {
                return false;
            }
        }
        if (source.localId !== undefined && source.localId !== null && source.localId !== "") {
            const expectedLocalId = normalizeLocalId(source.localId);
            if (expectedLocalId !== item.localId) {
                return false;
            }
        }
        return true;
    }
}

export class BusinessDataStore extends FileBusinessDataStore {}

function normalizeStorageBackend(value) {
    const backend = normalizeString(value, "json-file").trim() || "json-file";
    return STORAGE_BACKENDS.has(backend) ? backend : null;
}

function createUnsupportedBackendError(backend) {
    return new Error(
        `Unsupported business data storage backend: ${backend}. ` +
        `Supported backends: ${[...STORAGE_BACKENDS].join(", ")}.`
    );
}

export function createBusinessDataStore(options = {}) {
    const requestedBackend = normalizeString(
        options.backend || process.env.BUSINESS_DATA_BACKEND || "json-file",
        "json-file"
    ).trim() || "json-file";
    const backend = normalizeStorageBackend(requestedBackend);
    if (!backend) {
        throw createUnsupportedBackendError(requestedBackend);
    }
    if (backend === "json-file") {
        return new FileBusinessDataStore(options);
    }
    throw createUnsupportedBackendError(requestedBackend);
}

export {ALLOWED_TYPES, STORAGE_BACKENDS, SCHEMA_VERSION};
