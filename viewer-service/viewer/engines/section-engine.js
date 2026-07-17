import * as THREE from "three";

function toVector3(value, fallback) {
    if (value instanceof THREE.Vector3) {
        return value.clone();
    }
    if (Array.isArray(value) && value.length >= 3) {
        return new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
    }
    if (value && typeof value === "object") {
        return new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z));
    }
    return fallback.clone();
}

function axisNormal(axis) {
    switch (String(axis || "").toLowerCase()) {
        case "x":
            return new THREE.Vector3(1, 0, 0);
        case "y":
            return new THREE.Vector3(0, 1, 0);
        case "z":
            return new THREE.Vector3(0, 0, 1);
        case "-x":
            return new THREE.Vector3(-1, 0, 0);
        case "-y":
            return new THREE.Vector3(0, -1, 0);
        case "-z":
            return new THREE.Vector3(0, 0, -1);
        default:
            return new THREE.Vector3(1, 0, 0);
    }
}

function planeToState(plane) {
    return {
        normal: [
            Number(plane.normal.x.toFixed(6)),
            Number(plane.normal.y.toFixed(6)),
            Number(plane.normal.z.toFixed(6))
        ],
        constant: Number(plane.constant.toFixed(6))
    };
}

function stateToPlane(state) {
    const normal = toVector3(state?.normal, new THREE.Vector3(1, 0, 0));
    if (normal.lengthSq() <= 0) {
        normal.set(1, 0, 0);
    }
    normal.normalize();
    const constant = typeof state?.constant === "number" && Number.isFinite(state.constant)
        ? state.constant
        : 0;
    return new THREE.Plane(normal, constant);
}

function createOutlineGeometry(size) {
    const half = size / 2;
    const points = [
        -half, -half, 0,
        half, -half, 0,
        half, -half, 0,
        half, half, 0,
        half, half, 0,
        -half, half, 0,
        -half, half, 0,
        -half, -half, 0
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geometry;
}

export class SectionEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.renderer = options.renderer || null;
        this.scene = options.scene || null;
        this.camera = options.camera || null;
        this.helperColor = options.helperColor || 0xd7b46a;
        this.helperSize = 10;
        this.helper = null;
        this.enabled = false;
        this.axis = "x";
        this.mode = "single";
        this.activePlaneIndex = 0;
        this.plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        this.planes = [this.plane];
        this.bounds = null;
        this.originalLocalClippingEnabled = this.renderer?.localClippingEnabled ?? false;
        this.materialStates = new Map();
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (this.renderer) {
            this.renderer.localClippingEnabled = this.enabled || this.originalLocalClippingEnabled;
        }
        this.applyToScene();
        this.updateHelper();
        this.dispatchChange();
        return this;
    }

    setBounds(bounds) {
        if (!bounds) {
            this.bounds = null;
            this.helperSize = 10;
            this.removeHelper();
            return this;
        }
        const box = bounds instanceof THREE.Box3
            ? bounds.clone()
            : new THREE.Box3(
                toVector3(bounds.min, new THREE.Vector3()),
                toVector3(bounds.max, new THREE.Vector3(10, 10, 10))
            );
        this.bounds = box;
        if (!box || box.isEmpty()) {
            this.bounds = null;
            this.helperSize = 10;
            this.removeHelper();
            return this;
        }
        const size = box.getSize(new THREE.Vector3());
        this.helperSize = Math.max(size.x, size.y, size.z, 1) * 1.18;
        this.removeHelper();
        this.updateHelper();
        return this;
    }

    setPlane(options = {}) {
        const activePlane = this.getActivePlane();
        const normal = toVector3(options.normal, activePlane.normal);
        if (normal.lengthSq() > 0) {
            normal.normalize();
            activePlane.normal.copy(normal);
        }
        if (typeof options.constant === "number" && Number.isFinite(options.constant)) {
            activePlane.constant = options.constant;
        }
        this.syncLegacyPlane();
        this.applyToScene();
        this.updateHelper();
        this.dispatchChange();
        return this;
    }

    setAxis(axis) {
        this.axis = String(axis || "x").toLowerCase();
        const activePlane = this.getActivePlane();
        activePlane.normal.copy(axisNormal(this.axis));
        this.syncLegacyPlane();
        this.applyToScene();
        this.updateHelper();
        this.dispatchChange();
        return this;
    }

    setSinglePlane(options = {}) {
        const axis = String(options.axis || this.axis || "x").toLowerCase();
        const currentPlane = this.getActivePlane();
        const constant = typeof options.constant === "number" && Number.isFinite(options.constant)
            ? options.constant
            : currentPlane.constant || 0;
        this.mode = "single";
        this.axis = axis;
        this.activePlaneIndex = 0;
        this.plane = stateToPlane({
            normal: options.normal || axisNormal(axis).toArray(),
            constant
        });
        this.planes = [this.plane];
        this.syncLegacyPlane();
        this.applyToScene();
        this.updateHelper();
        this.dispatchChange();
        return this;
    }

    move(delta) {
        if (typeof delta === "number" && Number.isFinite(delta)) {
            this.getActivePlane().constant += delta;
            this.syncLegacyPlane();
            this.applyToScene();
            this.updateHelper();
            this.dispatchChange();
        }
        return this;
    }

    addPlane(options = {}) {
        const axis = options.axis || this.axis || "x";
        const plane = stateToPlane({
            normal: options.normal || axisNormal(axis).toArray(),
            constant: typeof options.constant === "number" ? options.constant : this.getActivePlane().constant || 0
        });
        this.mode = "multi";
        this.planes.push(plane);
        this.activePlaneIndex = this.planes.length - 1;
        this.axis = String(axis).toLowerCase();
        this.syncLegacyPlane();
        this.applyToScene();
        this.updateHelper();
        this.dispatchChange();
        return this;
    }

    setActivePlane(index) {
        const nextIndex = Math.max(0, Math.min(Number(index) || 0, this.planes.length - 1));
        this.activePlaneIndex = nextIndex;
        this.syncLegacyPlane();
        this.dispatchChange();
        return this;
    }

    setBox(options = {}) {
        const box = options.bounds instanceof THREE.Box3
            ? options.bounds.clone()
            : this.bounds?.clone();
        if (!box || box.isEmpty()) {
            return this;
        }
        const min = box.min;
        const max = box.max;
        this.mode = "box";
        this.planes = [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), -min.x),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x),
            new THREE.Plane(new THREE.Vector3(0, 1, 0), -min.y),
            new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y),
            new THREE.Plane(new THREE.Vector3(0, 0, 1), -min.z),
            new THREE.Plane(new THREE.Vector3(0, 0, -1), max.z)
        ];
        this.activePlaneIndex = 0;
        this.axis = "x";
        this.syncLegacyPlane();
        this.applyToScene();
        this.updateHelper();
        this.dispatchChange();
        return this;
    }

    clear() {
        this.enabled = false;
        this.axis = "x";
        this.mode = "single";
        this.activePlaneIndex = 0;
        this.plane.normal.set(1, 0, 0);
        this.plane.constant = 0;
        this.planes = [this.plane];
        this.restoreMaterials();
        if (this.renderer) {
            this.renderer.localClippingEnabled = this.originalLocalClippingEnabled;
        }
        this.updateHelper();
        this.dispatchChange();
        return this;
    }

    getState() {
        return {
            enabled: this.enabled,
            axis: this.axis,
            mode: this.mode,
            activePlaneIndex: this.activePlaneIndex,
            plane: planeToState(this.getActivePlane()),
            planes: this.planes.map((plane) => planeToState(plane))
        };
    }

    applyToScene() {
        if (!this.scene) {
            return;
        }
        this.scene.traverse((object) => {
            if (object?.userData?.sectionHelper) {
                return;
            }
            this.applyToMaterialSet(object.material);
        });
    }

    updateHelper() {
        if (!this.scene) {
            return;
        }
        this.removeHelper();
        this.helper = new THREE.Group();
        this.helper.name = "section-plane-helpers";
        this.helper.userData.sectionHelper = true;
        this.helper.renderOrder = 999;
        this.planes.forEach((plane, index) => {
            const helper = this.createHelper(plane, index === this.activePlaneIndex);
            helper.name = `section-plane-helper-${index}`;
            helper.userData.sectionHelper = true;
            helper.renderOrder = 999;
            this.helper.add(helper);
        });
        this.scene.add(this.helper);
        this.helper.visible = this.enabled;
    }

    createHelper(plane = this.getActivePlane(), active = true) {
        const group = new THREE.Group();
        const planeGeometry = new THREE.PlaneGeometry(this.helperSize, this.helperSize);
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: this.helperColor,
            opacity: active ? 0.1 : 0.045,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
        planeMesh.name = "section-plane-fill";
        planeMesh.renderOrder = 998;

        const outlineGeometry = createOutlineGeometry(this.helperSize);
        const outlineMaterial = new THREE.LineBasicMaterial({
            color: this.helperColor,
            opacity: active ? 0.92 : 0.38,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
        outline.name = "section-plane-outline";
        outline.renderOrder = 999;

        group.add(planeMesh, outline);
        group.traverse((object) => {
            object.userData.sectionHelper = true;
        });
        this.syncHelperTransform(group, plane);
        return group;
    }

    syncHelperTransform(helper = this.helper, plane = this.getActivePlane()) {
        if (!helper || !plane) {
            return;
        }
        const coplanarPoint = plane.coplanarPoint(new THREE.Vector3());
        helper.position.copy(coplanarPoint);
        helper.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            plane.normal.clone().normalize()
        );
    }

    removeHelper() {
        if (!this.helper) {
            return;
        }
        this.scene?.remove(this.helper);
        this.helper.traverse((object) => {
            object.geometry?.dispose?.();
            if (Array.isArray(object.material)) {
                object.material.forEach((material) => material.dispose?.());
            } else {
                object.material?.dispose?.();
            }
        });
        this.helper = null;
    }

    applyToMaterialSet(material) {
        if (Array.isArray(material)) {
            material.forEach((item) => this.applyToMaterial(item));
            return;
        }
        this.applyToMaterial(material);
    }

    applyToMaterial(material) {
        if (!material) {
            return;
        }
        if (!this.materialStates.has(material)) {
            this.materialStates.set(material, {
                clippingPlanes: Array.isArray(material.clippingPlanes)
                    ? [...material.clippingPlanes]
                    : material.clippingPlanes ?? null,
                clipIntersection: material.clipIntersection,
                needsUpdate: material.needsUpdate
            });
        }
        material.clippingPlanes = this.enabled ? [...this.planes] : this.getOriginalClippingPlanes(material);
        material.clipIntersection = false;
        material.needsUpdate = true;
    }

    restoreMaterials() {
        for (const [material, state] of this.materialStates.entries()) {
            material.clippingPlanes = Array.isArray(state.clippingPlanes)
                ? [...state.clippingPlanes]
                : state.clippingPlanes;
            material.clipIntersection = state.clipIntersection;
            material.needsUpdate = true;
        }
        this.materialStates.clear();
    }

    getOriginalClippingPlanes(material) {
        const state = this.materialStates.get(material);
        if (!state) {
            return null;
        }
        return Array.isArray(state.clippingPlanes)
            ? [...state.clippingPlanes]
            : state.clippingPlanes;
    }

    getActivePlane() {
        if (!this.planes.length) {
            this.planes = [this.plane];
            this.activePlaneIndex = 0;
        }
        return this.planes[this.activePlaneIndex] || this.planes[0];
    }

    syncLegacyPlane() {
        const activePlane = this.getActivePlane();
        this.plane = activePlane;
        const normal = activePlane.normal;
        if (Math.abs(normal.x) >= Math.abs(normal.y) && Math.abs(normal.x) >= Math.abs(normal.z)) {
            this.axis = normal.x >= 0 ? "x" : "-x";
        } else if (Math.abs(normal.y) >= Math.abs(normal.z)) {
            this.axis = normal.y >= 0 ? "y" : "-y";
        } else {
            this.axis = normal.z >= 0 ? "z" : "-z";
        }
    }

    dispatchChange() {
        this.dispatchEvent(new CustomEvent("sectionchange", {
            detail: this.getState()
        }));
    }
}
