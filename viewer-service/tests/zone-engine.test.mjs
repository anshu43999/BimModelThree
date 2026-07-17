import assert from "node:assert/strict";
import test from "node:test";

import {ZoneEngine} from "../viewer/engines/zone-engine.js";

function createFixture() {
    const colorCalls = [];
    const visible = new Map([
        [1, true],
        [2, true],
        [3, true],
        [4, true]
    ]);
    const model = {
        async resetVisible() {
            for (const localId of visible.keys()) {
                visible.set(localId, true);
            }
        },
        async setVisible(localIds, value) {
            for (const localId of localIds) {
                visible.set(localId, Boolean(value));
            }
        },
        async setColor(localIds, color) {
            colorCalls.push({
                localIds: [...localIds],
                color: color?.getHexString ? color.getHexString() : String(color)
            });
        },
        async resetColor() {},
        async resetOpacity() {}
    };
    const semanticEngine = {
        async getLocalIds() {
            return [1, 2, 3, 4];
        },
        async getTree() {
            return {
                children: [
                    {label: "一层", category: "storey", localIds: [1, 2]},
                    {label: "二层", category: "storey", localIds: [3, 4]}
                ]
            };
        }
    };
    return {
        engine: new ZoneEngine({model, semanticEngine}),
        visible,
        colorCalls
    };
}

test("isolating a zone hides every component outside the zone", async () => {
    const {engine, visible} = createFixture();
    const [zone] = await engine.getZones("storeys");

    const changed = await engine.isolateZone(zone.id);

    assert.equal(changed, true);
    for (const localId of zone.localIds) {
        assert.equal(visible.get(localId), true);
    }
    for (const localId of [1, 2, 3, 4].filter((id) => !zone.localIds.includes(id))) {
        assert.equal(visible.get(localId), false);
    }
});

test("resetting an isolated zone restores the other components", async () => {
    const {engine, visible} = createFixture();
    const [zone] = await engine.getZones("storeys");

    await engine.isolateZone(zone.id);
    await engine.resetZone(zone.id);

    assert.deepEqual([...visible.values()], [true, true, true, true]);
    assert.equal(engine.isolatedZoneId, null);
});

test("reset all restores a zone-only isolation", async () => {
    const {engine, visible} = createFixture();
    const [zone] = await engine.getZones("storeys");

    await engine.isolateZone(zone.id);
    const changed = await engine.resetAll();

    assert.equal(changed, true);
    assert.deepEqual([...visible.values()], [true, true, true, true]);
});

test("zone colors are reapplied after a selection highlight reset", async () => {
    const {engine, colorCalls} = createFixture();
    const [zone] = await engine.getZones("storeys");

    await engine.colorZone(zone.id);
    await engine.reapplyMaterialOverrides();

    assert.equal(colorCalls.length, 2);
    assert.deepEqual(colorCalls[1].localIds, zone.localIds);
    assert.equal(colorCalls[1].color, zone.color.getHexString());

    await engine.resetZone(zone.id);
    await engine.reapplyMaterialOverrides();
    assert.equal(colorCalls.length, 2);
});
