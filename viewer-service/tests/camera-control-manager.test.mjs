import assert from "node:assert/strict";
import test from "node:test";

import {CameraControlManager} from "../viewer/app/camera-control-manager.js";

function createManager() {
    const controls = {enabled: true};
    const canvas = {style: {cursor: ""}};
    return {
        controls,
        canvas,
        manager: new CameraControlManager({controls, canvas})
    };
}

test("one owner cannot release another owner's camera lock", () => {
    const {controls, manager} = createManager();

    manager.acquire("measure");
    manager.acquire("box-select");
    manager.release("measure");

    assert.equal(controls.enabled, false);
    assert.deepEqual(manager.getState().blockers, ["box-select"]);
    manager.release("box-select");
    assert.equal(controls.enabled, true);
});

test("non-blocking owner can control the cursor", () => {
    const {controls, canvas, manager} = createManager();

    manager.acquire("free-inspect", {
        blocks: false,
        cursor: "crosshair",
        priority: 10
    });

    assert.equal(controls.enabled, true);
    assert.equal(canvas.style.cursor, "crosshair");
});

test("highest-priority active cursor wins and restores previous cursor", () => {
    const {canvas, manager} = createManager();

    manager.acquire("free-inspect", {
        blocks: false,
        cursor: "crosshair",
        priority: 10
    });
    manager.acquire("ctrl-look", {
        cursor: "grabbing",
        priority: 90
    });

    assert.equal(canvas.style.cursor, "grabbing");
    assert.equal(manager.getState().cursorOwner, "ctrl-look");
    manager.release("ctrl-look");
    assert.equal(canvas.style.cursor, "crosshair");
});

test("reset clears locks and restores the default cursor", () => {
    const controls = {enabled: true};
    const canvas = {style: {cursor: "grab"}};
    const manager = new CameraControlManager({controls, canvas});

    manager.acquire("path-roam", {cursor: "progress"});
    manager.reset();

    assert.equal(controls.enabled, true);
    assert.equal(canvas.style.cursor, "grab");
    assert.deepEqual(manager.getState().claims, []);
});
