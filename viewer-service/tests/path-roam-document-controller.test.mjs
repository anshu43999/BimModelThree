import assert from "node:assert/strict";
import test from "node:test";

import {PathRoamDocumentController} from "../viewer/app/path-roam-document-controller.js";

function createStore() {
    const values = new Map();
    const storage = {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value)
    };
    const controller = new PathRoamDocumentController({
        storage,
        getModelId: () => "model-a",
        getModelName: () => "Model A",
        getStorageKey: () => "path:model-a"
    });
    return {controller, values};
}

const camera = (x) => ({position: [x, 1, 2], target: [0, 0, 0], near: 0.1, far: 1000, zoom: 1});

test("path roam document controller persists route lifecycle", () => {
    const {controller, values} = createStore();
    controller.load();
    const created = controller.createRoute({name: "Inspection"});
    assert.equal(controller.listRoutes().routes.length, 2);
    assert.equal(controller.listRoutes().activeRouteId, created.id);
    controller.updateRoute({name: "Inspection 2"});
    assert.equal(controller.getActiveRoute().name, "Inspection 2");
    controller.switchRoute(controller.document.routes[0].id);
    assert.equal(controller.deleteRoute(created.id).id, created.id);
    assert.ok(values.has("path:model-a"));
});

test("path roam document controller manages keyframe CRUD and timing", () => {
    const {controller} = createStore();
    controller.load();
    const first = controller.addPoint({camera: camera(0), name: "A"});
    const second = controller.addPoint({camera: camera(10), name: "B"});
    assert.deepEqual(controller.getPoints().map((point) => point.time), [0, 3000]);
    controller.updatePoint(second.id, {time: 50, name: "B2"});
    assert.deepEqual(controller.getPoints().map((point) => point.time), [0, 100]);
    controller.recapturePoint(first.id, camera(2), {selection: {localIds: [1]}});
    assert.deepEqual(controller.getPoints()[0].camera.position, [2, 1, 2]);
    controller.movePoint(second.id, -1);
    assert.equal(controller.getPoints()[0].id, second.id);
    assert.equal(controller.deletePoint(first.id).id, first.id);
    controller.clearPoints();
    assert.equal(controller.getPoints().length, 0);
});

test("path roam document controller migrates legacy single-route data", () => {
    const {controller, values} = createStore();
    values.set("path:model-a", JSON.stringify({
        name: "Legacy",
        points: [{id: "legacy-a", camera: camera(0)}]
    }));
    const documentState = controller.load();
    assert.equal(documentState.routes.length, 1);
    assert.equal(documentState.routes[0].name, "Legacy");
    assert.equal(documentState.routes[0].points[0].id, "legacy-a");
});

