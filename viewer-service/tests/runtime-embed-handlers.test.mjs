import assert from "node:assert/strict";
import test from "node:test";

import {SUPPORTED_COMMANDS} from "../viewer/app/bind-embed-bridge.js";
import {createRuntimeEmbedHandlers} from "../viewer/app/runtime-embed-handlers.js";

function createHandlers() {
    const calls = [];
    const handled = {__handled: true};
    const handlers = createRuntimeEmbedHandlers({
        runtimeSdk: {
            async execute(command, payload, context) {
                calls.push({command, payload, context});
                return {command};
            }
        },
        handledResult: () => handled
    });
    return {handlers, calls, handled};
}

test("runtime iframe adapter covers every bridge command", () => {
    const {handlers} = createHandlers();
    assert.deepEqual(Object.keys(handlers).sort(), [...SUPPORTED_COMMANDS].sort());
    for (const command of SUPPORTED_COMMANDS) {
        assert.equal(typeof handlers[command], "function");
    }
});

test("runtime iframe adapter forwards payload and trace context", async () => {
    const {handlers, calls} = createHandlers();
    await handlers.getTree({mode: "storeys"}, {requestId: "request-a"});

    assert.deepEqual(calls, [{
        command: "getTree",
        payload: {mode: "storeys"},
        context: {source: "iframe", requestId: "request-a"}
    }]);
});

test("runtime iframe adapter normalizes selection and roam payloads", async () => {
    const {handlers, calls} = createHandlers();
    await handlers.selectLocalIds({localIds: [1]}, {});
    await handlers.selectGlobalIds({globalIds: ["g-a"], source: "host"}, {});
    await handlers.stopPathRoam({}, {});

    assert.deepEqual(calls.map((call) => call.payload), [
        {localIds: [1], source: "embed"},
        {globalIds: ["g-a"], source: "host"},
        {reset: true}
    ]);
});

test("runtime iframe adapter preserves special model and snapshot lifecycles", async () => {
    const {handlers, calls, handled} = createHandlers();
    const modelResult = await handlers.openModel({modelUrl: "/model.frag", append: true}, {requestId: "model-a"});
    const snapshotResult = await handlers.snapshot({download: false, returnDataUrl: true}, {requestId: "shot-a"});

    assert.equal(modelResult, handled);
    assert.equal(snapshotResult, handled);
    assert.deepEqual(calls[0], {
        command: "openModel",
        payload: {
            manifestUrl: undefined,
            manifest: undefined,
            fragUrl: "/model.frag",
            name: undefined,
            append: true
        },
        context: {source: "iframe", requestId: "model-a"}
    });
    assert.deepEqual(calls[1], {
        command: "snapshot",
        payload: {
            download: false,
            filename: undefined,
            returnDataUrl: true
        },
        context: {source: "iframe", requestId: "shot-a"}
    });
});

