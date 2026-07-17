import assert from "node:assert/strict";
import test from "node:test";

import {
    MODEL_LIFECYCLE,
    MODEL_ROLES,
    ModelRegistry
} from "../viewer/app/model-registry.js";

function createEntry(modelId, name = modelId) {
    return {
        modelId,
        name,
        model: {modelId},
        visible: true
    };
}

class FakeBounds {
    constructor(min, max) {
        this.min = {...min};
        this.max = {...max};
    }

    clone() {
        return new FakeBounds(this.min, this.max);
    }

    isEmpty() {
        return this.min.x > this.max.x || this.min.y > this.max.y || this.min.z > this.max.z;
    }

    union(other) {
        for (const axis of ["x", "y", "z"]) {
            this.min[axis] = Math.min(this.min[axis], other.min[axis]);
            this.max[axis] = Math.max(this.max[axis], other.max[axis]);
        }
        return this;
    }
}

test("registered model keeps the original entry reference", () => {
    const registry = new ModelRegistry();
    const entry = createEntry("model-a");

    const registered = registry.register(entry);

    assert.equal(registered, entry);
    assert.equal(entry.role, MODEL_ROLES.MANAGED);
});

test("setting a new primary demotes the previous primary to managed", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"));
    registry.register(createEntry("model-b"));

    registry.setPrimary("model-a");
    registry.setPrimary("model-b");

    assert.equal(registry.get("model-a").role, MODEL_ROLES.MANAGED);
    assert.equal(registry.getPrimary().modelId, "model-b");
});

test("compare role is exclusive without changing the primary role", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"), {role: MODEL_ROLES.PRIMARY});
    registry.register(createEntry("model-b"), {role: MODEL_ROLES.COMPARE});
    registry.register(createEntry("model-c"), {role: MODEL_ROLES.COMPARE});

    assert.equal(registry.getPrimary().modelId, "model-a");
    assert.equal(registry.get("model-b").role, MODEL_ROLES.MANAGED);
    assert.equal(registry.getCompare().modelId, "model-c");
});

test("registry state is serializable and unregister removes the model", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a", "A"), {role: MODEL_ROLES.PRIMARY});

    assert.deepEqual(registry.getState().models[0], {
        modelId: "model-a",
        role: MODEL_ROLES.PRIMARY,
        name: "A",
        visible: true,
        assembly: false,
        lifecycle: MODEL_LIFECYCLE.LOADED,
        layer: 0,
        transform: null,
        source: null,
        loadedAt: registry.get("model-a").registeredAt,
        bounds: null
    });
    registry.unregister("model-a");
    assert.equal(registry.getState().count, 0);
});

test("registry stores cloned standardized bounds and compatibility aliases", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"));
    const currentBounds = new FakeBounds(
        {x: 0, y: 1, z: 2},
        {x: 3, y: 4, z: 5}
    );

    registry.setBounds("model-a", {currentBounds});
    currentBounds.max.x = 99;

    assert.equal(registry.getBounds("model-a").max.x, 3);
    assert.equal(registry.get("model-a").box.max.x, 3);
    assert.deepEqual(registry.getState().models[0].bounds, [0, 1, 2, 3, 4, 5]);
});

test("combined bounds filters hidden models and requested ids", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"));
    registry.register(createEntry("model-b"));
    registry.register(createEntry("model-c"));
    registry.setBounds("model-a", {
        currentBounds: new FakeBounds({x: 0, y: 0, z: 0}, {x: 1, y: 1, z: 1})
    });
    registry.setBounds("model-b", {
        currentBounds: new FakeBounds({x: 2, y: 2, z: 2}, {x: 4, y: 4, z: 4})
    });
    registry.setBounds("model-c", {
        currentBounds: new FakeBounds({x: 10, y: 10, z: 10}, {x: 20, y: 20, z: 20})
    });
    registry.update("model-c", {visible: false});

    const combined = registry.getCombinedBounds({modelIds: ["model-a", "model-b", "model-c"]});

    assert.deepEqual(combined.min, {x: 0, y: 0, z: 0});
    assert.deepEqual(combined.max, {x: 4, y: 4, z: 4});
});

test("dispose lifecycle prevents duplicate disposal ownership", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"));

    const first = registry.beginDispose("model-a");
    const duplicate = registry.beginDispose("model-a");

    assert.equal(first.started, true);
    assert.equal(duplicate.started, false);
    assert.equal(registry.get("model-a").lifecycle, MODEL_LIFECYCLE.DISPOSING);
    registry.completeDispose("model-a");
    assert.equal(registry.has("model-a"), false);
});

test("failed disposal restores a model to loaded", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"));

    registry.beginDispose("model-a");
    registry.failDispose("model-a", new Error("failed"));

    assert.equal(registry.get("model-a").lifecycle, MODEL_LIFECYCLE.LOADED);
});

test("assembly membership is independent from the active compare role", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"), {
        role: MODEL_ROLES.MANAGED,
        assembly: true
    });

    registry.setRole("model-a", MODEL_ROLES.COMPARE);

    assert.equal(registry.get("model-a").assembly, true);
    assert.deepEqual(registry.list({assembly: true}).map((entry) => entry.modelId), ["model-a"]);
});

test("transform and layer metadata are cloned and exposed in state", () => {
    const registry = new ModelRegistry();
    registry.register(createEntry("model-a"));
    const transform = {
        position: [1, 2, 3],
        rotation: [0, 0.5, 0],
        scale: [1, 1, 1]
    };

    registry.setTransform("model-a", transform, {kind: "current"});
    registry.setLayer("model-a", 2);
    transform.position[0] = 99;

    assert.deepEqual(registry.getTransform("model-a"), {
        position: [1, 2, 3],
        rotation: [0, 0.5, 0],
        scale: [1, 1, 1]
    });
    assert.equal(registry.getState().models[0].layer, 2);
});
