import assert from "node:assert/strict";
import test from "node:test";

import {EmbedBridge, SUPPORTED_COMMANDS} from "../viewer/app/bind-embed-bridge.js";
import {SDK_EVENT_SCHEMA_VERSION} from "../viewer/sdk/sdk-event-contract.js";

function createBridge(handlers = {}) {
    const messages = [];
    const viewerWindow = {
        addEventListener() {},
        removeEventListener() {}
    };
    const parentWindow = {
        postMessage(message, origin) {
            messages.push({message, origin});
        }
    };
    return {
        bridge: new EmbedBridge({
            window: viewerWindow,
            parentWindow,
            handlers,
            allowedOrigin: "https://host.example",
            targetOrigin: "https://host.example"
        }),
        messages
    };
}

test("iframe bridge adds the standard contract to completed commands", async () => {
    const {bridge, messages} = createBridge({fitModel: async () => ({fitted: true})});

    await bridge.dispatch("fitModel", {padding: 1}, "request-a", {});

    assert.equal(messages.length, 1);
    const response = messages[0].message;
    assert.equal(response.type, "commandCompleted");
    assert.equal(response.requestId, "request-a");
    assert.equal(response.payload.schemaVersion, SDK_EVENT_SCHEMA_VERSION);
    assert.equal(response.payload.commandId, "request-a");
    assert.equal(response.payload.command, "fitModel");
    assert.equal(response.payload.status, "completed");
    assert.deepEqual(response.payload.result, {fitted: true});
    assert.equal(response.payload.type, "fitModel");
});

test("iframe bridge serializes failed command errors", async () => {
    const {bridge, messages} = createBridge({
        fitModel() {
            const error = new Error("fit failed");
            error.code = "FIT_FAILED";
            throw error;
        }
    });

    await bridge.dispatch("fitModel", {}, "request-b", {});

    const payload = messages[0].message.payload;
    assert.equal(messages[0].message.type, "commandFailed");
    assert.equal(payload.status, "failed");
    assert.deepEqual(payload.error, {
        name: "Error",
        message: "fit failed",
        code: "FIT_FAILED"
    });
    assert.ok(payload.durationMs >= 0);
});

test("iframe bridge preserves rejection reason while adding event metadata", async () => {
    const {bridge, messages} = createBridge();

    await bridge.dispatch("unknownCommand", {value: 1}, "request-c", {});

    const payload = messages[0].message.payload;
    assert.equal(messages[0].message.type, "commandRejected");
    assert.equal(payload.type, "unknownCommand");
    assert.equal(payload.reason, "unsupported_command");
    assert.equal(payload.command, "unknownCommand");
    assert.equal(payload.status, "rejected");
    assert.equal(payload.error.code, "unsupported_command");
});

test("iframe bridge standardizes domain events without removing legacy fields", () => {
    const {bridge, messages} = createBridge();

    bridge.post("selectionChanged", {localIds: [7], count: 1});

    const payload = messages[0].message.payload;
    assert.equal(payload.event, "selectionChanged");
    assert.equal(payload.source, "iframe");
    assert.deepEqual(payload.localIds, [7]);
    assert.equal(payload.count, 1);
    assert.deepEqual(payload.payload, {localIds: [7], count: 1});
});

test("iframe bridge exposes aligned semantic and material commands", () => {
    for (const command of ["getTree", "resetSelectedMaterial", "setSelectedOpacity"]) {
        assert.ok(SUPPORTED_COMMANDS.includes(command), `${command} should be supported`);
    }
});
