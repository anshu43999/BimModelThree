import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import {
    MEASUREMENT_SNAPPING_CLASSES,
    MeasurementEngine
} from "../viewer/engines/measurement-engine.js";

function createEngine(model, options = {}) {
    return new MeasurementEngine({
        model,
        camera: options.camera || {},
        canvas: options.canvas || {},
        scene: options.scene || null,
        snapOptions: options.snapOptions
    });
}

function createProjectionFixture(model, snapOptions = undefined) {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const canvas = {
        getBoundingClientRect() {
            return {left: 0, top: 0, width: 100, height: 100};
        }
    };
    return createEngine(model, {camera, canvas, snapOptions});
}

test("measurement picking prefers a point snap over edge and face hits", async () => {
    const model = {
        async raycastWithSnapping(data) {
            assert.deepEqual(data.snappingClasses, [
                MEASUREMENT_SNAPPING_CLASSES.POINT,
                MEASUREMENT_SNAPPING_CLASSES.LINE,
                MEASUREMENT_SNAPPING_CLASSES.FACE
            ]);
            return [
                {
                    localId: 30,
                    point: new THREE.Vector3(3, 0, 0),
                    snappingClass: MEASUREMENT_SNAPPING_CLASSES.FACE,
                    rayDistance: 0
                },
                {
                    localId: 20,
                    point: new THREE.Vector3(2, 0, 0),
                    snappingClass: MEASUREMENT_SNAPPING_CLASSES.LINE,
                    rayDistance: 0
                },
                {
                    localId: 10,
                    point: new THREE.Vector3(1, 0, 0),
                    snappingClass: MEASUREMENT_SNAPPING_CLASSES.POINT,
                    rayDistance: 0.01
                }
            ];
        }
    };
    const engine = createEngine(model);

    const pick = await engine.pick(100, 120);

    assert.deepEqual(pick.point.toArray(), [1, 0, 0]);
    assert.equal(pick.snapType, "point");
    assert.deepEqual(pick.localIds, [10]);
    assert.equal(engine.serializePick(pick).snapType, "point");
});

test("measurement picking falls back to a face raycast on older models", async () => {
    const model = {
        async raycast() {
            return {
                localId: 7,
                point: new THREE.Vector3(4, 5, 6)
            };
        }
    };
    const engine = createEngine(model);

    const pick = await engine.pick(10, 20);

    assert.deepEqual(pick.point.toArray(), [4, 5, 6]);
    assert.equal(pick.snapType, "face");
    assert.deepEqual(pick.localIds, [7]);
});

test("edge snapping exposes the complete boundary segment", async () => {
    const model = {
        async raycastWithSnapping() {
            return [{
                localId: 12,
                point: new THREE.Vector3(1, 1, 0),
                snappingClass: MEASUREMENT_SNAPPING_CLASSES.LINE,
                snappedEdgeP1: new THREE.Vector3(0, 1, 0),
                snappedEdgeP2: new THREE.Vector3(2, 1, 0)
            }];
        }
    };
    const engine = createEngine(model);

    const pick = await engine.pick(30, 40);
    const serialized = engine.serializePick(pick);

    assert.equal(serialized.snapType, "edge");
    assert.deepEqual(serialized.snappedEdge, [
        [0, 1, 0],
        [2, 1, 0]
    ]);
});

test("edge snapping selects the midpoint when the pointer is within midpoint tolerance", async () => {
    const model = {
        async raycastWithSnapping() {
            return [{
                localId: 12,
                point: new THREE.Vector3(0.2, 0, 0),
                snappingClass: MEASUREMENT_SNAPPING_CLASSES.LINE,
                snappedEdgeP1: new THREE.Vector3(-1, 0, 0),
                snappedEdgeP2: new THREE.Vector3(1, 0, 0)
            }];
        }
    };
    const engine = createProjectionFixture(model);

    const pick = await engine.pick(50, 50);

    assert.equal(pick.snapType, "midpoint");
    assert.deepEqual(pick.point.toArray(), [0, 0, 0]);
});

test("point snaps outside the pixel tolerance fall back to the face hit", async () => {
    const model = {
        async raycastWithSnapping() {
            return [
                {
                    localId: 10,
                    point: new THREE.Vector3(0, 0, 0),
                    snappingClass: MEASUREMENT_SNAPPING_CLASSES.POINT
                },
                {
                    localId: 20,
                    point: new THREE.Vector3(1, -1, 0),
                    snappingClass: MEASUREMENT_SNAPPING_CLASSES.FACE
                }
            ];
        }
    };
    const engine = createProjectionFixture(model);

    const pick = await engine.pick(90, 90);

    assert.equal(pick.snapType, "face");
    assert.deepEqual(pick.localIds, [20]);
});

test("snap locking keeps a point until the pointer leaves the release tolerance", async () => {
    let callCount = 0;
    const model = {
        async raycastWithSnapping() {
            callCount += 1;
            if (callCount === 1) {
                return [{
                    localId: 10,
                    point: new THREE.Vector3(0, 0, 0),
                    snappingClass: MEASUREMENT_SNAPPING_CLASSES.POINT
                }];
            }
            return [{
                localId: 20,
                point: new THREE.Vector3(0.5, 0, 0),
                snappingClass: MEASUREMENT_SNAPPING_CLASSES.FACE
            }];
        }
    };
    const engine = createProjectionFixture(model);
    engine.setEnabled(true);

    const initial = await engine.handlePointerMove(50, 50);
    const retained = await engine.handlePointerMove(60, 50);
    const released = await engine.handlePointerMove(90, 50);

    assert.equal(initial.snapType, "point");
    assert.equal(retained.snapType, "point");
    assert.equal(released.snapType, "face");
});

test("unchanged pending previews reuse their Three.js objects", () => {
    const scene = new THREE.Scene();
    const engine = createEngine({}, {scene});
    engine.pendingPicks = [{
        point: new THREE.Vector3(0, 0, 0),
        localIds: [1]
    }];
    engine.preview = {
        point: new THREE.Vector3(1, 0, 0),
        localIds: [1]
    };

    engine.updatePendingVisuals();
    const initialObject = engine.pendingPreviewObjects[0];
    engine.updatePendingVisuals();

    assert.equal(engine.pendingPreviewObjects.length, 1);
    assert.equal(engine.pendingPreviewObjects[0], initialObject);
});
