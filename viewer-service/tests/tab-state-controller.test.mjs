import assert from "node:assert/strict";
import test from "node:test";

import {TabStateController} from "../viewer/app/tab-state-controller.js";

test("tab state falls back to the first registered tab", () => {
    const controller = new TabStateController(["component", "properties", "compare"], {
        initialId: "missing"
    });

    assert.equal(controller.activeId, "component");
    assert.equal(controller.select("properties"), "properties");
    assert.equal(controller.select("unknown"), "component");
});

test("arrow keys wrap tab navigation in both directions", () => {
    const controller = new TabStateController(["component", "properties", "compare"], {
        initialId: "component"
    });

    assert.equal(controller.move("ArrowLeft"), "compare");
    assert.equal(controller.move("ArrowRight"), "component");
    assert.equal(controller.move("ArrowDown"), "properties");
    assert.equal(controller.move("ArrowUp"), "component");
});

test("home and end move to tab boundaries", () => {
    const controller = new TabStateController(["component", "properties", "compare"]);

    assert.equal(controller.move("End"), "compare");
    assert.equal(controller.move("Home"), "component");
    assert.equal(controller.move("Enter"), "component");
});
