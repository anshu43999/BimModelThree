import assert from "node:assert/strict";
import test from "node:test";

import {SemanticIndexController} from "../viewer/app/semantic-index-controller.js";

class FailingWorker extends EventTarget {
    constructor() {
        super();
        this.terminated = false;
    }

    postMessage() {
        queueMicrotask(() => {
            const event = new Event("error");
            Object.defineProperties(event, {
                error: {value: new Error("worker crashed")},
                message: {value: "worker crashed"}
            });
            this.dispatchEvent(event);
        });
    }

    terminate() {
        this.terminated = true;
    }
}

test("semantic index controller supports the in-memory fallback lifecycle", async () => {
    const controller = new SemanticIndexController({WorkerClass: null});

    assert.equal(controller.mode, "uninitialized");
    await controller.clear();
    assert.equal(controller.mode, "uninitialized");

    await controller.begin("model-a", 2);
    await controller.append("model-a", [
        {localId: 1, entityName: "Exterior Wall"},
        {localId: 2, globalId: "GUID-DOOR", entityName: "Main Door"}
    ]);
    await controller.complete("model-a");

    assert.equal(controller.mode, "fallback");
    assert.deepEqual((await controller.search("model-a", "door")).map((item) => item.localId), [2]);
    assert.deepEqual(controller.getState("model-a"), {
        modelId: "model-a",
        total: 2,
        indexed: 2,
        ready: true
    });

    await controller.clear("model-a");
    assert.equal(controller.getState("model-a"), null);
    assert.deepEqual(await controller.search("model-a", "door"), []);
});

test("semantic index controller falls back cleanly after a worker failure", async () => {
    const controller = new SemanticIndexController({
        WorkerClass: FailingWorker,
        workerUrl: "semantic-index-worker.js"
    });

    await assert.rejects(controller.begin("model-a", 1), /worker crashed/);

    assert.equal(controller.mode, "fallback");
    assert.equal(controller.worker, null);
    assert.equal(controller.getState("model-a"), null);

    await controller.begin("model-a", 1);
    await controller.append("model-a", [{localId: 7, entityName: "Recovered Wall"}]);
    await controller.complete("model-a");
    assert.deepEqual((await controller.search("model-a", "recovered")).map((item) => item.localId), [7]);
});
