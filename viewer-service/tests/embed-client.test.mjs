import assert from "node:assert/strict";
import test from "node:test";

import {BimViewerEmbedClient} from "../viewer/sdk/embed-client.js";

function createClient() {
    const client = new BimViewerEmbedClient({
        contentWindow: {postMessage() {}},
        hostWindow: {
            addEventListener() {},
            removeEventListener() {}
        }
    });
    const calls = [];
    client.sendCommand = async (type, payload, options) => {
        calls.push({type, payload, options});
        if (type === "getState") {
            return {selection: {localIds: [9], count: 1}};
        }
        return {type, payload};
    };
    return {client, calls};
}

test("iframe client exposes portable viewpoint and snapshot aliases", async () => {
    const {client, calls} = createClient();

    await client.restoreViewpoint({camera: {position: [1, 2, 3]}});
    await client.takeSnapshot({download: false});

    assert.equal(calls[0].type, "setViewpoint");
    assert.equal(calls[1].type, "snapshot");
    assert.deepEqual(calls[1].payload, {download: false});
});

test("iframe client normalizes item/tree queries and current selection", async () => {
    const {client, calls} = createClient();

    await client.getItemInfo("global-a");
    const tree = await client.getTree("classes");
    const selection = await client.getSelection();

    assert.deepEqual(calls[0].payload, {globalId: "global-a"});
    assert.deepEqual(calls[1].payload, {mode: "classes"});
    assert.deepEqual(tree, {type: "getTree", payload: {mode: "classes"}});
    assert.deepEqual(selection, {localIds: [9], count: 1});
});

test("iframe client reports portable and integration-specific capabilities", () => {
    const {client} = createClient();
    const capabilities = client.getCapabilities();

    assert.equal(capabilities.integration, "iframe");
    assert.ok(capabilities.methods.includes("getTree"));
    assert.ok(capabilities.methods.includes("takeSnapshot"));
    assert.ok(capabilities.extensions.includes("sendCommand"));
});

test("iframe client forwards optional isolation and material parameters", async () => {
    const {client, calls} = createClient();

    await client.isolateSelected({mode: "dim", opacity: 0.3});
    await client.colorSelected("#ff0000");
    await client.setSelectedOpacity(0.5);
    await client.resetSelectedMaterial();

    assert.deepEqual(calls[0].payload, {mode: "dim", opacity: 0.3, restoreVisibility: undefined});
    assert.deepEqual(calls[1].payload, {color: "#ff0000"});
    assert.deepEqual(calls[2].payload, {opacity: 0.5});
    assert.equal(calls[3].type, "resetSelectedMaterial");
});
