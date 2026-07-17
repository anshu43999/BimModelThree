import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {FreeInspectController} from "../viewer/app/free-inspect-controller.js";

function createController(options = {}) {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1, 0);
    const controls = {
        target: new THREE.Vector3(0, 1, -1),
        updates: 0,
        update() {
            this.updates += 1;
        }
    };
    const controller = new FreeInspectController({
        camera,
        controls,
        getAvailable: () => options.available !== false,
        getBaseSpeed: () => 10,
        speedMultiplier: options.speedMultiplier ?? 0.2,
        requestFrame: null,
        cancelFrame: null
    });
    return {controller, camera, controls};
}

test("free inspect controller clamps speed and reports portable state", () => {
    const {controller} = createController();
    assert.equal(controller.getState().speed, 2);
    assert.equal(controller.setSpeedMultiplier(9).speedMultiplier, 3);
    assert.equal(controller.setSpeedMultiplier("bad").speedMultiplier, 0.2);
    assert.equal(controller.getState().controls.forward, "W");
});

test("free inspect controller only enables when a model is available", () => {
    const {controller} = createController({available: false});
    const state = controller.setEnabled(true);
    assert.equal(state.enabled, false);
    assert.equal(state.available, false);
});

test("free inspect controller moves camera and target with WASD", () => {
    const {controller, camera, controls} = createController({speedMultiplier: 1});
    controller.setEnabled(true);
    controller.handleKeyDown({code: "KeyW", preventDefault() {}});

    assert.equal(controller.step(0.5), true);
    assert.equal(Number(camera.position.z.toFixed(3)), -5);
    assert.equal(Number(controls.target.z.toFixed(3)), -6);
    assert.equal(controls.updates, 1);
});

test("free inspect controller ignores editable targets and releases keys", () => {
    const {controller} = createController();
    controller.setEnabled(true);
    const editable = {closest: () => ({tagName: "INPUT"})};
    assert.equal(controller.handleKeyDown({code: "KeyW", target: editable}), false);
    assert.equal(controller.pressedKeys.size, 0);

    controller.handleKeyDown({code: "KeyD", preventDefault() {}});
    assert.equal(controller.pressedKeys.has("KeyD"), true);
    controller.handleKeyUp({code: "KeyD", preventDefault() {}});
    assert.equal(controller.pressedKeys.has("KeyD"), false);
});

