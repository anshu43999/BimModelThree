import assert from "node:assert/strict";
import test from "node:test";

import {
    TOOL_MODES,
    ToolModeController
} from "../viewer/app/tool-mode-controller.js";

test("snap can coexist with one measurement mode", () => {
    const controller = new ToolModeController();

    controller.activate(TOOL_MODES.SNAP);
    controller.activate(TOOL_MODES.MEASURE_DISTANCE);

    assert.deepEqual(controller.getState().activeModes, [
        TOOL_MODES.SNAP,
        TOOL_MODES.MEASURE_DISTANCE
    ]);
});

test("measurement modes replace each other without disabling snap", () => {
    const controller = new ToolModeController();

    controller.activate(TOOL_MODES.SNAP);
    controller.activate(TOOL_MODES.MEASURE_DISTANCE);
    const transition = controller.activate(TOOL_MODES.MEASURE_AREA);

    assert.deepEqual(transition.deactivated, [TOOL_MODES.MEASURE_DISTANCE]);
    assert.deepEqual(controller.getState().activeModes, [
        TOOL_MODES.SNAP,
        TOOL_MODES.MEASURE_AREA
    ]);
});

test("box selection exits section and free inspect modes", () => {
    const controller = new ToolModeController();

    controller.activate(TOOL_MODES.SECTION);
    controller.activate(TOOL_MODES.FREE_INSPECT);
    const transition = controller.activate(TOOL_MODES.BOX_SELECT);

    assert.deepEqual(new Set(transition.deactivated), new Set([
        TOOL_MODES.SECTION,
        TOOL_MODES.FREE_INSPECT
    ]));
    assert.deepEqual(controller.getState().activeModes, [TOOL_MODES.BOX_SELECT]);
});

test("conflicts are symmetric", () => {
    const controller = new ToolModeController();

    controller.activate(TOOL_MODES.PATH_ROAM);
    const transition = controller.activate(TOOL_MODES.SNAP);

    assert.deepEqual(transition.deactivated, [TOOL_MODES.PATH_ROAM]);
    assert.deepEqual(controller.getState().activeModes, [TOOL_MODES.SNAP]);
});

test("path roam takes exclusive ownership from interactive tools", () => {
    const controller = new ToolModeController();

    controller.activate(TOOL_MODES.SNAP);
    controller.activate(TOOL_MODES.FREE_INSPECT);
    const transition = controller.activate(TOOL_MODES.PATH_ROAM);

    assert.deepEqual(new Set(transition.deactivated), new Set([
        TOOL_MODES.SNAP,
        TOOL_MODES.FREE_INSPECT
    ]));
    assert.deepEqual(controller.getState().activeModes, [TOOL_MODES.PATH_ROAM]);
});

test("reset clears all active modes and reports the transition", () => {
    const controller = new ToolModeController();

    controller.activate(TOOL_MODES.SNAP);
    controller.activate(TOOL_MODES.SECTION);
    const transition = controller.reset({dispatch: false, source: "test"});

    assert.equal(transition.source, "test");
    assert.deepEqual(new Set(transition.deactivated), new Set([
        TOOL_MODES.SNAP,
        TOOL_MODES.SECTION
    ]));
    assert.deepEqual(controller.getState(), {activeModes: [], count: 0});
});

test("modechange exposes the activated and deactivated modes", () => {
    const controller = new ToolModeController();
    const changes = [];
    controller.addEventListener("modechange", (event) => changes.push(event.detail));

    controller.activate(TOOL_MODES.MEASURE_DISTANCE, {source: "test-distance"});
    controller.activate(TOOL_MODES.MEASURE_ANGLE, {source: "test-angle"});

    assert.equal(changes.length, 2);
    assert.equal(changes[1].activated, TOOL_MODES.MEASURE_ANGLE);
    assert.deepEqual(changes[1].deactivated, [TOOL_MODES.MEASURE_DISTANCE]);
    assert.equal(changes[1].source, "test-angle");
});
