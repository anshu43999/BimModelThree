import assert from "node:assert/strict";
import test from "node:test";

import {PathRoamPlaybackController} from "../viewer/app/path-roam-playback-controller.js";

const camera = (x) => ({position: [x, 0, 0], target: [0, 0, 0], near: 0.1, far: 1000, zoom: 1});

function createPlayback(options = {}) {
    let now = 0;
    let nextFrame = null;
    const frames = [];
    const completed = [];
    const keyframes = [];
    const points = options.points || [
        {id: "a", time: 0, camera: camera(0)},
        {id: "b", time: 1000, camera: camera(10)}
    ];
    const controller = new PathRoamPlaybackController({
        getPoints: () => points,
        getAvailable: () => options.available !== false,
        now: () => now,
        requestFrame: (callback) => {
            nextFrame = callback;
            return 1;
        },
        cancelFrame: () => {
            nextFrame = null;
        },
        onFrame: (frame) => frames.push(frame),
        onKeyframe: (point) => keyframes.push(point.id),
        onComplete: (result) => completed.push(result)
    });
    return {
        controller,
        frames,
        completed,
        keyframes,
        tick(time) {
            now = time;
            const callback = nextFrame;
            nextFrame = null;
            callback?.(time);
        },
        setNow(value) {
            now = value;
        }
    };
}

test("path playback requires an available route with duration", () => {
    assert.equal(createPlayback({available: false}).controller.play(), false);
    assert.equal(createPlayback({points: [{id: "a", time: 0, camera: camera(0)}]}).controller.play(), false);
});

test("path playback interpolates frames and completes", async () => {
    const playback = createPlayback();
    assert.equal(playback.controller.play(), true);
    playback.tick(500);
    assert.deepEqual(playback.frames[0].viewState.position, [5, 0, 0]);
    playback.tick(1000);
    await Promise.resolve();
    assert.equal(playback.completed.length, 1);
    assert.equal(playback.controller.getState().active, false);
    assert.equal(playback.controller.getState().elapsedMs, 0);
});

test("path playback pause preserves scaled elapsed time", () => {
    const playback = createPlayback();
    playback.controller.setSpeedMultiplier(2);
    playback.controller.play();
    playback.setNow(200);
    assert.equal(playback.controller.pause(), true);
    assert.equal(playback.controller.getState().elapsedMs, 400);
    assert.equal(playback.controller.getState().paused, true);
});

test("path playback applies crossed keyframes once per play", async () => {
    const playback = createPlayback();
    playback.controller.play();
    playback.tick(500);
    await Promise.resolve();
    await Promise.resolve();
    playback.controller.triggerKeyframe(500);
    assert.deepEqual(playback.keyframes, ["a"]);
});

