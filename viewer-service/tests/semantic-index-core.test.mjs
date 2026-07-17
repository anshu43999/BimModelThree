import assert from "node:assert/strict";
import test from "node:test";

import {SemanticIndexStore} from "../viewer/engines/semantic-index-core.js";

test("semantic index searches all standardized BIM fields", () => {
    const store = new SemanticIndexStore();
    store.begin("model-a", 3);
    store.append("model-a", [
        {localId: 1, globalId: "GUID-WALL", entityName: "Exterior Wall", category: "IFCWALL", storey: "Level 1"},
        {localId: 2, globalId: "GUID-DOOR", entityName: "Main Door", category: "IFCDOOR", storey: "Level 1"},
        {localId: 3, entityName: "Roof Slab", objectType: "Concrete", predefinedType: "FLOOR"}
    ]);
    store.complete("model-a");

    assert.deepEqual(store.search("model-a", "guid-door").map((item) => item.localId), [2]);
    assert.deepEqual(store.search("model-a", "level 1").map((item) => item.localId), [1, 2]);
    assert.deepEqual(store.search("model-a", "concrete").map((item) => item.localId), [3]);
});

test("semantic index replaces duplicate localIds and reports progress", () => {
    const store = new SemanticIndexStore();
    store.begin("model-a", 2);
    store.append("model-a", [{localId: 1, entityName: "Old"}]);
    const state = store.append("model-a", [{localId: 1, entityName: "New"}, {localId: 2, entityName: "Door"}]);

    assert.equal(state.indexed, 2);
    assert.deepEqual(store.search("model-a", "new").map((item) => item.localId), [1]);
    assert.deepEqual(store.search("model-a", "old"), []);
});
