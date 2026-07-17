import assert from "node:assert/strict";
import test from "node:test";

import {VersionCompareTaskController} from "../viewer/app/version-compare-task-controller.js";

test("version compare task tracks phases progress and completion", () => {
    let now = 1000;
    const controller = new VersionCompareTaskController({clock: () => now});
    controller.start({baseModelId: "base", compareModelId: "next"});
    now = 1250;
    controller.updatePhase("fingerprints", {
        current: 25,
        total: 100,
        changed: 4,
        message: "正在检测变更"
    });
    now = 1600;
    const state = controller.complete({changed: 7});

    assert.equal(state.status, "completed");
    assert.equal(state.changed, 7);
    assert.equal(state.elapsedMs, 600);
    assert.equal(state.phases.fingerprints.percent, 25);
});

test("version compare task records cancellation reason", () => {
    let now = 2000;
    const controller = new VersionCompareTaskController({clock: () => now});
    controller.start();
    now = 2120;
    const state = controller.cancel("model-cleared");

    assert.equal(state.status, "cancelled");
    assert.equal(state.cancelReason, "model-cleared");
    assert.equal(state.elapsedMs, 120);
});

test("version compare task ignores progress after failure", () => {
    const controller = new VersionCompareTaskController();
    controller.start();
    controller.fail(new Error("broken"));
    const state = controller.updatePhase("fingerprints", {current: 1, total: 2});

    assert.equal(state.status, "failed");
    assert.equal(state.error.message, "broken");
    assert.equal(state.phase, "failed");
});
