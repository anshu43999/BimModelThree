import assert from "node:assert/strict";
import test from "node:test";

import {ViewportPanelManager} from "../viewer/app/viewport-panel-manager.js";

class FakeClassList {
    constructor(values = []) {
        this.values = new Set(values);
    }

    contains(value) {
        return this.values.has(value);
    }

    toggle(value, enabled) {
        if (enabled) {
            this.values.add(value);
        } else {
            this.values.delete(value);
        }
    }
}

function createElement(options = {}) {
    return {
        hidden: options.hidden === true,
        classList: new FakeClassList(options.classes),
        dataset: {}
    };
}

test("opening an exclusive panel closes the previous group panel", () => {
    const root = createElement();
    const path = createElement({hidden: true});
    const model = createElement({hidden: true});
    const manager = new ViewportPanelManager({root});
    manager.register("path", {element: path, group: "primary", exclusive: true});
    manager.register("model", {element: model, group: "primary", exclusive: true});

    manager.open("path");
    const transition = manager.open("model");

    assert.equal(path.hidden, true);
    assert.equal(model.hidden, false);
    assert.deepEqual(transition.changes, [
        {id: "path", open: false, reason: "exclusive"},
        {id: "model", open: true, reason: "request"}
    ]);
});

test("collapsed panels use one managed expanded state", () => {
    const root = createElement();
    const bubble = createElement({classes: ["collapsed"]});
    const trigger = {
        value: null,
        setAttribute(name, value) {
            if (name === "aria-expanded") {
                this.value = value;
            }
        }
    };
    const manager = new ViewportPanelManager({root});
    manager.register("bubble", {
        element: bubble,
        trigger,
        mode: "collapse",
        closedClass: "collapsed"
    });

    manager.open("bubble");

    assert.equal(bubble.classList.contains("collapsed"), false);
    assert.equal(trigger.value, "true");
    assert.deepEqual(manager.getState().openPanels, ["bubble"]);
});

test("root exposes whether any viewport panel is open", () => {
    const root = createElement();
    const panel = createElement({hidden: true});
    const manager = new ViewportPanelManager({root});
    manager.register("path", {element: panel});

    manager.open("path");
    assert.equal(root.classList.contains("hasOpenPanel"), true);
    assert.equal(root.dataset.openPanels, "path");
    manager.close("path");
    assert.equal(root.classList.contains("hasOpenPanel"), false);
});
