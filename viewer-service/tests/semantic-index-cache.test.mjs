import assert from "node:assert/strict";
import test from "node:test";

import {
    createSemanticIndexCacheKey,
    MemorySemanticIndexCache,
    SEMANTIC_INDEX_CACHE_SCHEMA
} from "../viewer/app/semantic-index-cache.js";

test("semantic index cache key requires a stable manifest model version", () => {
    assert.equal(createSemanticIndexCacheKey({modelId: "model-a"}), null);
    assert.equal(createSemanticIndexCacheKey({modelVersionId: "version-a"}), null);

    const key = createSemanticIndexCacheKey({
        schemaVersion: "bim-model-manifest/v1",
        modelId: "model-a",
        modelVersionId: "version 2"
    });
    assert.equal(key.startsWith(encodeURIComponent(SEMANTIC_INDEX_CACHE_SCHEMA)), true);
    assert.match(key, /model-a/);
    assert.match(key, /version%202/);
});

test("memory semantic index cache stores and restores ordered chunks", async () => {
    const cache = new MemorySemanticIndexCache();
    await cache.begin("cache-a", {
        modelId: "model-a",
        modelVersionId: "version-a",
        total: 3
    });
    await cache.append("cache-a", [{localId: 1}, {localId: 2}]);
    await cache.append("cache-a", [{localId: 3}]);
    const completed = await cache.complete("cache-a");

    assert.equal(completed.ready, true);
    assert.equal(completed.indexed, 3);
    assert.equal(completed.chunkCount, 2);
    assert.deepEqual(await cache.readChunk("cache-a", 0), [{localId: 1}, {localId: 2}]);
    assert.deepEqual(await cache.readChunk("cache-a", 1), [{localId: 3}]);
});

test("begin replaces incomplete cache data and clear removes it", async () => {
    const cache = new MemorySemanticIndexCache();
    await cache.begin("cache-a", {total: 2});
    await cache.append("cache-a", [{localId: 1}]);

    const replaced = await cache.begin("cache-a", {total: 1});
    assert.equal(replaced.indexed, 0);
    assert.equal(replaced.chunkCount, 0);
    assert.equal(replaced.ready, false);
    assert.equal(await cache.readChunk("cache-a", 0), null);

    await cache.clear("cache-a");
    assert.equal(await cache.getState("cache-a"), null);
});
