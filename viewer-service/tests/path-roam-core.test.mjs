import assert from "node:assert/strict";
import test from "node:test";

import {
    createPathRoamRoute,
    getLatestPendingPathRoamKeyframe,
    getPathRoamCameraAt,
    getPathRoamTotalDuration,
    normalizePathRoamCamera,
    normalizePathRoamRouteTimes
} from "../viewer/app/path-roam-core.js";

function camera(position, target = [0, 0, 0]) {
    return {position, target, near: 0.1, far: 1000, zoom: 1};
}

test("path roam core validates and normalizes camera state", () => {
    assert.equal(normalizePathRoamCamera({position: [0, 0], target: [0, 0, 0]}), null);
    assert.deepEqual(normalizePathRoamCamera({position: [1, 2, 3], target: [0, 0, 0]}, {far: 500}), {
        position: [1, 2, 3],
        target: [0, 0, 0],
        near: 0.1,
        far: 500,
        zoom: 1
    });
});

test("path roam core creates routes and drops invalid keyframes", () => {
    const route = createPathRoamRoute({
        id: "route-a",
        name: "Route A",
        now: "2026-01-01T00:00:00.000Z",
        points: [
            {id: "a", camera: camera([0, 0, 0])},
            {id: "invalid", camera: {position: []}}
        ]
    });
    assert.equal(route.id, "route-a");
    assert.equal(route.points.length, 1);
    assert.equal(route.points[0].time, 0);
});

test("path roam core enforces sorted timeline with a minimum gap", () => {
    const route = {
        points: [
            {id: "late", time: 500},
            {id: "first", time: 0},
            {id: "near", time: 20}
        ]
    };
    normalizePathRoamRouteTimes(route);
    assert.deepEqual(route.points.map((point) => point.time), [0, 500, 3000]);
});

test("path roam core interpolates camera and duration on a non-zero timeline", () => {
    const points = [
        {id: "a", time: 1000, camera: camera([0, 0, 0])},
        {id: "b", time: 3000, camera: camera([10, 0, 0])}
    ];
    assert.equal(getPathRoamTotalDuration(points), 2000);
    assert.deepEqual(getPathRoamCameraAt(points, 1000).position, [5, 0, 0]);
});

test("path roam core returns latest unapplied keyframe at elapsed time", () => {
    const points = [
        {id: "a", time: 0},
        {id: "b", time: 1000},
        {id: "c", time: 2000}
    ];
    assert.equal(getLatestPendingPathRoamKeyframe(points, 1500, new Set(["a"])).id, "b");
    assert.equal(getLatestPendingPathRoamKeyframe(points, 2500, new Set(["a", "b", "c"])), null);
});

