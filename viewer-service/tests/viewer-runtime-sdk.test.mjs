import assert from "node:assert/strict";
import test from "node:test";

import {ViewerRuntimeSDK} from "../viewer/sdk/viewer-runtime-sdk.js";

test("runtime SDK routes convenience methods through registered handlers", async () => {
    const calls = [];
    const sdk = new ViewerRuntimeSDK({
        handlers: {
            setView(payload, context) {
                calls.push({payload, context});
                return {view: payload.view};
            }
        }
    });

    const result = await sdk.setView("top", {source: "test"});
    assert.deepEqual(result, {view: "top"});
    assert.deepEqual(calls, [{payload: {view: "top"}, context: {source: "test"}}]);
});

test("runtime SDK emits command lifecycle events", async () => {
    const events = [];
    const sdk = new ViewerRuntimeSDK({handlers: {fitModel: () => true}});
    sdk.addEventListener("commandstart", (event) => events.push(event.detail));
    sdk.addEventListener("commandcomplete", (event) => events.push(event.detail));

    await sdk.fitModel();
    assert.equal(events.length, 2);
    assert.equal(events[0].event, "commandstart");
    assert.equal(events[0].status, "started");
    assert.equal(events[1].event, "commandcomplete");
    assert.equal(events[1].status, "completed");
    assert.equal(events[0].command, "fitModel");
    assert.equal(events[0].commandId, events[1].commandId);
    assert.ok(events[1].durationMs >= 0);
});

test("runtime SDK rejects unsupported and failed commands", async () => {
    let failureEvent = null;
    const sdk = new ViewerRuntimeSDK({
        handlers: {
            getState() {
                throw new Error("state unavailable");
            }
        }
    });
    sdk.addEventListener("commanderror", (event) => {
        failureEvent = event.detail;
    });

    await assert.rejects(sdk.execute("missing"), /Unsupported Viewer runtime command/);
    await assert.rejects(sdk.getState(), /state unavailable/);
    assert.equal(failureEvent.status, "failed");
    assert.equal(failureEvent.error.message, "state unavailable");
    assert.equal(failureEvent.originalError.message, "state unavailable");
});

test("runtime SDK normalizes free-inspect and path-roam command payloads", async () => {
    const payloads = [];
    const sdk = new ViewerRuntimeSDK({
        handlers: {
            setFreeInspectSpeed: (payload) => payloads.push(payload),
            movePathRoamPoint: (payload) => payloads.push(payload)
        }
    });

    await sdk.setFreeInspectSpeed(0.8, {silent: true});
    await sdk.movePathRoamPoint("point-a", -1);
    assert.deepEqual(payloads, [
        {speedMultiplier: 0.8, silent: true},
        {pointId: "point-a", direction: -1}
    ]);
});

test("runtime SDK normalizes annotation update and removal payloads", async () => {
    const payloads = [];
    const sdk = new ViewerRuntimeSDK({
        handlers: {
            updateAnnotation: (payload) => payloads.push(payload),
            removeLabel: (payload) => payloads.push(payload)
        }
    });

    await sdk.updateAnnotation("annotation-a", {status: "closed"});
    await sdk.removeLabel("label-a");
    assert.deepEqual(payloads, [
        {id: "annotation-a", status: "closed"},
        {id: "label-a"}
    ]);
});

test("runtime SDK normalizes model lifecycle and compare commands", async () => {
    const calls = [];
    const sdk = new ViewerRuntimeSDK({
        handlers: {
            activateModel: (payload) => calls.push(["activate", payload]),
            setModelVisibility: (payload) => calls.push(["visibility", payload]),
            loadCompareModel: (payload) => calls.push(["compare", payload])
        }
    });

    await sdk.activateModel("model-a", {fit: false});
    await sdk.setModelVisibility("model-b", false);
    await sdk.loadCompareModel({manifestUrl: "/next/manifest.json"});
    assert.deepEqual(calls, [
        ["activate", {modelId: "model-a", fit: false}],
        ["visibility", {modelId: "model-b", visible: false}],
        ["compare", {manifestUrl: "/next/manifest.json"}]
    ]);
});

test("runtime SDK normalizes stored-view and snapshot commands", async () => {
    const calls = [];
    const sdk = new ViewerRuntimeSDK({
        handlers: {
            snapshot: (payload) => calls.push(["snapshot", payload]),
            updateStoredView: (payload) => calls.push(["update", payload]),
            restoreStoredView: (payload) => calls.push(["restore", payload])
        }
    });

    await sdk.snapshot({download: false});
    await sdk.updateStoredView("view-a", {name: "Updated"});
    await sdk.restoreStoredView("view-a");
    assert.deepEqual(calls, [
        ["snapshot", {download: false}],
        ["update", {id: "view-a", name: "Updated"}],
        ["restore", {id: "view-a"}]
    ]);
});

test("runtime SDK forwards portable tree and material operation payloads", async () => {
    const calls = [];
    const sdk = new ViewerRuntimeSDK({
        handlers: {
            getTree: (payload) => calls.push(["tree", payload]),
            isolateSelected: (payload) => calls.push(["isolate", payload]),
            colorSelected: (payload) => calls.push(["color", payload]),
            setSelectedOpacity: (payload) => calls.push(["opacity", payload])
        }
    });

    await sdk.getTree("storeys");
    await sdk.isolateSelected({mode: "dim", opacity: 0.25});
    await sdk.colorSelected("#00ff00");
    await sdk.setSelectedOpacity(0.4);

    assert.deepEqual(calls, [
        ["tree", {mode: "storeys"}],
        ["isolate", {mode: "dim", opacity: 0.25}],
        ["color", {color: "#00ff00"}],
        ["opacity", {opacity: 0.4}]
    ]);
});
