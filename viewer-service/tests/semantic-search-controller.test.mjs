import assert from "node:assert/strict";
import test from "node:test";

import {SemanticSearchController} from "../viewer/app/semantic-search-controller.js";

function item(localId, name) {
    return {
        localId,
        localIds: [localId],
        title: name,
        searchText: `${localId} ${name}`.toLowerCase()
    };
}

test("semantic search combines tree candidates with a complete index", async () => {
    let resolved = 0;
    const indexController = {
        getState: () => ({modelId: "model-a", indexed: 3, total: 3, ready: true}),
        search: async () => [{localId: 2, entityName: "Indexed Door"}]
    };
    const controller = new SemanticSearchController({
        indexController,
        resolveItem: async (localId) => {
            resolved += 1;
            return item(localId, "Fallback Door");
        },
        convertIndexItem: (value) => item(value.localId, value.entityName)
    });

    const result = await controller.search({
        modelId: "model-a",
        query: "door",
        treeCandidates: [item(1, "Tree Door")],
        allLocalIds: [1, 2, 3]
    });

    assert.deepEqual(result.results.map((value) => value.localId), [1, 2]);
    assert.equal(result.indexState.ready, true);
    assert.equal(result.scanned, 0);
    assert.equal(resolved, 0);
});

test("semantic search supplements a partial index with the bounded fallback scan", async () => {
    const indexController = {
        getState: () => ({modelId: "model-a", indexed: 1, total: 4, ready: false}),
        search: async () => []
    };
    const controller = new SemanticSearchController({
        indexController,
        resolveItem: async (localId) => item(localId, localId === 3 ? "Fallback Wall" : "Other"),
        scanLimit: 3
    });

    const result = await controller.search({
        modelId: "model-a",
        query: "wall",
        allLocalIds: [1, 2, 3, 4]
    });

    assert.deepEqual(result.results.map((value) => value.localId), [3]);
    assert.equal(result.scanned, 3);
});

test("semantic search stops a stale request before fallback scanning", async () => {
    let cancelled = false;
    let resolved = 0;
    const controller = new SemanticSearchController({
        resolveItem: async () => {
            resolved += 1;
            cancelled = true;
            return item(1, "Wall");
        }
    });

    const result = await controller.search({
        modelId: "model-a",
        query: "wall",
        allLocalIds: [1, 2, 3],
        isCancelled: () => cancelled
    });

    assert.equal(result.cancelled, true);
    assert.deepEqual(result.results, []);
    assert.equal(resolved, 1);
});
