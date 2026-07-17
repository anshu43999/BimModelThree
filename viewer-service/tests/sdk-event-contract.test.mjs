import assert from "node:assert/strict";
import test from "node:test";

import {
    SDK_EVENT_SCHEMA_VERSION,
    createSdkEvent,
    createSdkCommandEvent,
    normalizeSdkError
} from "../viewer/sdk/sdk-event-contract.js";

test("SDK domain event preserves legacy fields and exposes its original payload", () => {
    const payload = {localIds: [1, 2], count: 2};
    const event = createSdkEvent({
        event: "selectionchanged",
        source: "direct-sdk",
        timestamp: 50,
        payload,
        legacyFields: payload
    });

    assert.equal(event.schemaVersion, SDK_EVENT_SCHEMA_VERSION);
    assert.equal(event.event, "selectionchanged");
    assert.equal(event.source, "direct-sdk");
    assert.deepEqual(event.localIds, [1, 2]);
    assert.equal(event.count, 2);
    assert.equal(event.payload, payload);
});

test("SDK command event contains stable lifecycle fields", () => {
    const event = createSdkCommandEvent({
        event: "commandcomplete",
        command: "fitModel",
        commandId: "command-a",
        status: "completed",
        source: "runtime-sdk",
        timestamp: 115,
        startedAt: 100,
        finishedAt: 115,
        payload: {fit: true},
        result: {ok: true},
        legacyFields: {context: {source: "test"}}
    });

    assert.equal(event.schemaVersion, SDK_EVENT_SCHEMA_VERSION);
    assert.equal(event.commandId, "command-a");
    assert.equal(event.durationMs, 15);
    assert.deepEqual(event.payload, {fit: true});
    assert.deepEqual(event.result, {ok: true});
    assert.deepEqual(event.context, {source: "test"});
    assert.equal(event.error, null);
});

test("started SDK command event has no completion timing", () => {
    const event = createSdkCommandEvent({
        event: "commandstart",
        command: "openModel",
        status: "started",
        timestamp: 200
    });

    assert.equal(event.startedAt, 200);
    assert.equal(event.finishedAt, null);
    assert.equal(event.durationMs, null);
    assert.match(event.eventId, /^event-/);
    assert.match(event.commandId, /^command-/);
});

test("SDK errors are serializable and preserve an optional code", () => {
    const error = new Error("load failed");
    error.code = "MODEL_LOAD_FAILED";

    assert.deepEqual(normalizeSdkError(error), {
        name: "Error",
        message: "load failed",
        code: "MODEL_LOAD_FAILED"
    });

    const event = createSdkCommandEvent({
        event: "commanderror",
        command: "openModel",
        status: "failed",
        error,
        timestamp: 350,
        startedAt: 300,
        finishedAt: 350
    });
    assert.deepEqual(event.error, {
        name: "Error",
        message: "load failed",
        code: "MODEL_LOAD_FAILED"
    });
});
