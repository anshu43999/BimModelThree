import assert from "node:assert/strict";
import test from "node:test";

import {
    PORTABLE_SDK_METHODS,
    SDK_INTEGRATION_SCHEMA_VERSION,
    createSdkCapabilities,
    normalizeSdkItemTarget
} from "../viewer/sdk/sdk-integration-contract.js";

test("portable SDK capabilities are serializable and grouped", () => {
    const capabilities = createSdkCapabilities("iframe", ["sendCommand", "sendCommand"]);

    assert.equal(capabilities.schemaVersion, SDK_INTEGRATION_SCHEMA_VERSION);
    assert.equal(capabilities.integration, "iframe");
    assert.deepEqual(capabilities.methods, PORTABLE_SDK_METHODS);
    assert.ok(capabilities.methodGroups.selection.includes("getSelection"));
    assert.ok(capabilities.methodGroups.snapshot.includes("takeSnapshot"));
    assert.deepEqual(capabilities.extensions, ["sendCommand"]);
    assert.doesNotThrow(() => JSON.stringify(capabilities));
});

test("item targets normalize localId and GlobalId consistently", () => {
    assert.deepEqual(normalizeSdkItemTarget(42), {localId: 42});
    assert.deepEqual(normalizeSdkItemTarget("42"), {localId: 42});
    assert.deepEqual(normalizeSdkItemTarget("global-a"), {globalId: "global-a"});
    assert.deepEqual(normalizeSdkItemTarget({guid: " global-b "}), {
        guid: " global-b ",
        globalId: "global-b"
    });
    assert.throws(() => normalizeSdkItemTarget({}), /requires localId or globalId/);
});

