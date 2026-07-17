export const SEMANTIC_INDEX_CACHE_SCHEMA = "bim-semantic-index-cache/v1";

function normalizeText(value) {
    return String(value || "").trim();
}

export function createSemanticIndexCacheKey(manifest) {
    const modelId = normalizeText(manifest?.modelId);
    const modelVersionId = normalizeText(manifest?.modelVersionId);
    if (!modelId || !modelVersionId) {
        return null;
    }
    return [
        SEMANTIC_INDEX_CACHE_SCHEMA,
        normalizeText(manifest?.schemaVersion) || "manifest-unknown",
        modelId,
        modelVersionId
    ].map(encodeURIComponent).join("|");
}

function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

export class MemorySemanticIndexCache {
    constructor() {
        this.records = new Map();
    }

    async begin(cacheKey, metadata = {}) {
        const key = normalizeText(cacheKey);
        if (!key) {
            throw new Error("Semantic index cache key is required");
        }
        const record = {
            cacheKey: key,
            schema: SEMANTIC_INDEX_CACHE_SCHEMA,
            modelId: normalizeText(metadata.modelId),
            modelVersionId: normalizeText(metadata.modelVersionId),
            total: Math.max(0, Number(metadata.total) || 0),
            indexed: 0,
            chunkCount: 0,
            ready: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            chunks: []
        };
        this.records.set(key, record);
        return this.getState(key);
    }

    async append(cacheKey, items = []) {
        const record = this.records.get(normalizeText(cacheKey));
        if (!record) {
            throw new Error(`Semantic index cache not initialized: ${cacheKey}`);
        }
        const chunk = clone(Array.isArray(items) ? items : []);
        record.chunks.push(chunk);
        record.chunkCount = record.chunks.length;
        record.indexed += chunk.length;
        record.updatedAt = new Date().toISOString();
        return this.getState(record.cacheKey);
    }

    async complete(cacheKey) {
        const record = this.records.get(normalizeText(cacheKey));
        if (!record) {
            return null;
        }
        record.ready = true;
        record.updatedAt = new Date().toISOString();
        return this.getState(record.cacheKey);
    }

    async getState(cacheKey) {
        const record = this.records.get(normalizeText(cacheKey));
        if (!record) {
            return null;
        }
        const {chunks, ...state} = record;
        return clone(state);
    }

    async readChunk(cacheKey, chunkIndex) {
        const record = this.records.get(normalizeText(cacheKey));
        return clone(record?.chunks?.[Number(chunkIndex)] || null);
    }

    async clear(cacheKey) {
        this.records.delete(normalizeText(cacheKey));
    }
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
}

export class IndexedDbSemanticIndexCache {
    constructor(options = {}) {
        this.indexedDB = options.indexedDB || globalThis.indexedDB || null;
        this.dbName = options.dbName || "bim-viewer-semantic-index";
        this.dbVersion = 1;
        this.databasePromise = null;
    }

    async getDatabase() {
        if (!this.indexedDB) {
            throw new Error("IndexedDB unavailable");
        }
        if (!this.databasePromise) {
            this.databasePromise = new Promise((resolve, reject) => {
                const request = this.indexedDB.open(this.dbName, this.dbVersion);
                request.onupgradeneeded = () => {
                    const database = request.result;
                    if (!database.objectStoreNames.contains("metadata")) {
                        database.createObjectStore("metadata", {keyPath: "cacheKey"});
                    }
                    if (!database.objectStoreNames.contains("chunks")) {
                        database.createObjectStore("chunks", {keyPath: "id"});
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error("Semantic index cache open failed"));
            });
        }
        return this.databasePromise;
    }

    chunkId(cacheKey, chunkIndex) {
        return `${cacheKey}:${String(chunkIndex).padStart(8, "0")}`;
    }

    async begin(cacheKey, metadata = {}) {
        await this.clear(cacheKey);
        const database = await this.getDatabase();
        const transaction = database.transaction("metadata", "readwrite");
        const now = new Date().toISOString();
        transaction.objectStore("metadata").put({
            cacheKey,
            schema: SEMANTIC_INDEX_CACHE_SCHEMA,
            modelId: normalizeText(metadata.modelId),
            modelVersionId: normalizeText(metadata.modelVersionId),
            total: Math.max(0, Number(metadata.total) || 0),
            indexed: 0,
            chunkCount: 0,
            ready: false,
            createdAt: now,
            updatedAt: now
        });
        await transactionDone(transaction);
        return this.getState(cacheKey);
    }

    async append(cacheKey, items = []) {
        const state = await this.getState(cacheKey);
        if (!state) {
            throw new Error(`Semantic index cache not initialized: ${cacheKey}`);
        }
        const chunk = Array.isArray(items) ? items : [];
        const database = await this.getDatabase();
        const transaction = database.transaction(["metadata", "chunks"], "readwrite");
        transaction.objectStore("chunks").put({
            id: this.chunkId(cacheKey, state.chunkCount),
            cacheKey,
            chunkIndex: state.chunkCount,
            items: chunk
        });
        transaction.objectStore("metadata").put({
            ...state,
            indexed: state.indexed + chunk.length,
            chunkCount: state.chunkCount + 1,
            updatedAt: new Date().toISOString()
        });
        await transactionDone(transaction);
        return this.getState(cacheKey);
    }

    async complete(cacheKey) {
        const state = await this.getState(cacheKey);
        if (!state) {
            return null;
        }
        const database = await this.getDatabase();
        const transaction = database.transaction("metadata", "readwrite");
        transaction.objectStore("metadata").put({
            ...state,
            ready: true,
            updatedAt: new Date().toISOString()
        });
        await transactionDone(transaction);
        return this.getState(cacheKey);
    }

    async getState(cacheKey) {
        const database = await this.getDatabase();
        const transaction = database.transaction("metadata", "readonly");
        return requestResult(transaction.objectStore("metadata").get(cacheKey));
    }

    async readChunk(cacheKey, chunkIndex) {
        const database = await this.getDatabase();
        const transaction = database.transaction("chunks", "readonly");
        const record = await requestResult(transaction.objectStore("chunks").get(this.chunkId(cacheKey, chunkIndex)));
        return record?.items || null;
    }

    async clear(cacheKey) {
        const state = await this.getState(cacheKey).catch(() => null);
        if (!state) {
            return;
        }
        const database = await this.getDatabase();
        const transaction = database.transaction(["metadata", "chunks"], "readwrite");
        transaction.objectStore("metadata").delete(cacheKey);
        for (let index = 0; index < state.chunkCount; index += 1) {
            transaction.objectStore("chunks").delete(this.chunkId(cacheKey, index));
        }
        await transactionDone(transaction);
    }
}

export function createSemanticIndexCache(options = {}) {
    return options.indexedDB || globalThis.indexedDB
        ? new IndexedDbSemanticIndexCache(options)
        : new MemorySemanticIndexCache();
}
