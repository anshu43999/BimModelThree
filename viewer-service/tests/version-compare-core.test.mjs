import assert from "node:assert/strict";
import test from "node:test";

import {
    compareFingerprintItems,
    compareGlobalIdEntries,
    diffGeometrySignatures
} from "../viewer/engines/version-compare-core.js";

test("version compare classifies common removed and added GlobalIds", () => {
    const result = compareGlobalIdEntries(
        [["A", 1], ["B", 2]],
        [["B", 20], ["C", 30]]
    );

    assert.deepEqual(result.commonItems, [{globalId: "B", localId: 2, compareLocalId: 20}]);
    assert.deepEqual(result.removedItems.map((item) => item.globalId), ["A"]);
    assert.deepEqual(result.addedItems.map((item) => item.globalId), ["C"]);
});

test("version compare detects property and geometry fingerprint changes", () => {
    const changed = compareFingerprintItems([{
        globalId: "A",
        localId: 1,
        compareLocalId: 11,
        baseProperties: {name: "Wall", properties: {Height: 3}},
        compareProperties: {name: "Wall updated", properties: {Height: 3.5}},
        baseGeometry: {center: [0, 0, 0], size: [1, 1, 1], volume: 1},
        compareGeometry: {center: [0.2, 0, 0], size: [1, 1, 1], volume: 1}
    }]);

    assert.equal(changed.length, 1);
    assert.deepEqual(changed[0].propertyDiffs.map((item) => item.field), ["name", "Height"]);
    assert.equal(changed[0].geometry.changed, true);
});

test("geometry comparison respects relative tolerance", () => {
    const delta = diffGeometrySignatures(
        {center: [0, 0, 0], size: [100, 100, 100], volume: 1000000},
        {center: [0.1, 0, 0], size: [100.1, 100, 100], volume: 1001000},
        {absoluteTolerance: 0.001, relativeTolerance: 0.005}
    );
    assert.equal(delta.changed, false);
});
