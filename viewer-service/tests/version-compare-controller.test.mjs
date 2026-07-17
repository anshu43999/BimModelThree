import assert from "node:assert/strict";
import test from "node:test";

import {VersionCompareController} from "../viewer/app/version-compare-controller.js";

test("version compare controller uses the main-thread fallback without Worker", async () => {
    const controller = new VersionCompareController({WorkerClass: null});
    const result = await controller.compareIndexes([["A", 1]], [["B", 2]]);

    assert.equal(controller.mode, "fallback");
    assert.equal(result.removedItems[0].globalId, "A");
    assert.equal(result.addedItems[0].globalId, "B");
});

test("version compare controller cancellation rejects pending work", async () => {
    class WaitingWorker extends EventTarget {
        postMessage() {}
        terminate() {}
    }
    const controller = new VersionCompareController({
        WorkerClass: WaitingWorker,
        workerUrl: "version-compare-worker.js"
    });
    const request = controller.compareIndexes([["A", 1]], [["A", 2]]);
    controller.cancel();

    await assert.rejects(request, /VERSION_COMPARE_ABORTED/);
    assert.equal(controller.mode, "uninitialized");
});
