import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";

function vectorToArray(vector) {
    return [
        Number(vector.x.toFixed(6)),
        Number(vector.y.toFixed(6)),
        Number(vector.z.toFixed(6))
    ];
}

function cameraSyncKey(camera) {
    if (!camera) {
        return "";
    }
    return [
        camera.position.x.toFixed(6),
        camera.position.y.toFixed(6),
        camera.position.z.toFixed(6),
        camera.quaternion.x.toFixed(6),
        camera.quaternion.y.toFixed(6),
        camera.quaternion.z.toFixed(6),
        camera.quaternion.w.toFixed(6),
        camera.near.toFixed(6),
        camera.far.toFixed(6),
        camera.zoom.toFixed(6)
    ].join(":");
}

export class RenderEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.canvas = options.canvas;
        this.container = options.container || options.canvas?.parentElement;
        this.background = options.background ?? 0x0c0f11;
        this.initialCameraPosition = options.initialCameraPosition || [18, 14, 18];
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.secondaryCamera = null;
        this.dualViewEnabled = false;
        this.dualViewLayout = "inset";
        this.dualViewInset = {
            widthRatio: 0.38,
            margin: 16
        };
        this.lastSecondarySyncKey = "";
        this.animationFrame = null;
        this.running = false;
        this.resizeObserver = null;
    }

    init() {
        if (!this.canvas) {
            throw new Error("RenderEngine requires canvas");
        }

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.background);

        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100000);
        this.camera.position.fromArray(this.initialCameraPosition);
        this.secondaryCamera = this.camera.clone();

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = false;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.addEventListener("change", () => {
            this.dispatchEvent(new CustomEvent("viewchange", {
                detail: this.getViewState()
            }));
        });

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2d3438, 2.2));

        const light = new THREE.DirectionalLight(0xffffff, 1.5);
        light.position.set(20, 30, 15);
        this.scene.add(light);

        const grid = new THREE.GridHelper(80, 40, 0x3b474f, 0x20272d);
        grid.position.y = -0.01;
        this.scene.add(grid);

        this.resize();
        return this;
    }

    start() {
        if (this.running) {
            return;
        }
        this.running = true;
        const loop = () => {
            if (!this.running) {
                return;
            }
            this.animationFrame = requestAnimationFrame(loop);
            this.controls?.update();
            this.render();
        };
        loop();
    }

    stop() {
        this.running = false;
        if (this.animationFrame !== null) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    resize() {
        if (!this.renderer || !this.camera) {
            return;
        }
        const rect = (this.container || this.canvas).getBoundingClientRect();
        const width = Math.max(rect.width, 1);
        const height = Math.max(rect.height, 1);
        this.renderer.setSize(width, height, false);
        const mainRect = this.getMainViewportRect(width, height);
        this.updateCameraAspect(this.camera, mainRect.width / Math.max(mainRect.height, 1));
        this.updateSecondaryCameraAspect(width, height);
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) {
            return;
        }
        if (this.dualViewEnabled && this.dualViewLayout === "split" && this.secondaryCamera) {
            this.renderSplitDualView();
        } else {
            this.renderer.setScissorTest(false);
            this.renderer.setViewport(0, 0, this.canvas.clientWidth || 1, this.canvas.clientHeight || 1);
            this.renderer.render(this.scene, this.camera);
        }
        if (this.dualViewEnabled && this.dualViewLayout !== "split" && this.secondaryCamera) {
            this.renderSecondaryView();
        }
    }

    addObject(object) {
        this.scene?.add(object);
    }

    removeObject(object) {
        this.scene?.remove(object);
    }

    fitBox(box, label = "box") {
        if (!box || box.isEmpty()) {
            return false;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) || 10;
        const distance = radius * 1.45;
        this.controls.target.copy(center);
        this.camera.position.set(center.x + distance, center.y + distance * 0.76, center.z + distance);
        this.camera.near = Math.max(distance / 1000, 0.1);
        this.camera.far = Math.max(distance * 12, 1000);
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.dispatchEvent(new CustomEvent("fit", {detail: {label, box}}));
        return true;
    }

    setNamedView(viewName, box) {
        if (!box || box.isEmpty()) {
            return false;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const distance = Math.max(size.x, size.y, size.z) * 1.55 || 10;
        const offsets = {
            iso: [1, 0.76, 1],
            top: [0, 1.65, 0.001],
            bottom: [0, -1.65, 0.001],
            front: [0, 0.25, 1.65],
            back: [0, 0.25, -1.65],
            left: [-1.65, 0.25, 0],
            right: [1.65, 0.25, 0]
        };
        const [x, y, z] = offsets[viewName] || offsets.iso;
        this.camera.position.set(center.x + distance * x, center.y + distance * y, center.z + distance * z);
        this.controls.target.copy(center);
        this.camera.near = Math.max(distance / 1000, 0.1);
        this.camera.far = Math.max(distance * 12, 1000);
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.dispatchEvent(new CustomEvent("viewchange", {
            detail: this.getViewState()
        }));
        return true;
    }

    setDualViewEnabled(enabled, options = {}) {
        this.dualViewEnabled = Boolean(enabled);
        if (options.layout) {
            this.dualViewLayout = options.layout;
        }
        if (this.dualViewEnabled && this.secondaryCamera && options.sync !== false) {
            this.syncSecondaryView({force: true, render: false});
        }
        if (!this.dualViewEnabled) {
            this.dualViewLayout = "inset";
            this.resize();
        }
        if (options.render !== false) {
            this.render();
        }
        this.dispatchEvent(new CustomEvent("dualviewchange", {
            detail: {
                enabled: this.dualViewEnabled,
                layout: this.dualViewLayout
            }
        }));
        return this.dualViewEnabled;
    }

    toggleDualView() {
        return this.setDualViewEnabled(!this.dualViewEnabled);
    }

    syncSecondaryView(options = {}) {
        if (!this.secondaryCamera || !this.camera) {
            return false;
        }
        const nextKey = cameraSyncKey(this.camera);
        if (!options.force && nextKey && nextKey === this.lastSecondarySyncKey) {
            return false;
        }
        this.secondaryCamera.position.copy(this.camera.position);
        this.secondaryCamera.quaternion.copy(this.camera.quaternion);
        this.secondaryCamera.near = this.camera.near;
        this.secondaryCamera.far = this.camera.far;
        this.secondaryCamera.zoom = this.camera.zoom;
        this.secondaryCamera.updateProjectionMatrix();
        this.lastSecondarySyncKey = nextKey;
        if (options.render !== false) {
            this.render();
        }
        return true;
    }

    setSecondaryNamedView(viewName, box) {
        if (!this.secondaryCamera || !box || box.isEmpty()) {
            return false;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const distance = Math.max(size.x, size.y, size.z) * 1.55 || 10;
        const offsets = {
            iso: [1, 0.76, 1],
            top: [0, 1.65, 0.001],
            bottom: [0, -1.65, 0.001],
            front: [0, 0.25, 1.65],
            back: [0, 0.25, -1.65],
            left: [-1.65, 0.25, 0],
            right: [1.65, 0.25, 0]
        };
        const [x, y, z] = offsets[viewName] || offsets.iso;
        this.secondaryCamera.position.set(center.x + distance * x, center.y + distance * y, center.z + distance * z);
        this.secondaryCamera.lookAt(center);
        this.secondaryCamera.near = Math.max(distance / 1000, 0.1);
        this.secondaryCamera.far = Math.max(distance * 12, 1000);
        this.secondaryCamera.updateProjectionMatrix();
        this.lastSecondarySyncKey = "";
        this.render();
        return true;
    }

    fitSecondaryBox(box, label = "secondary-box") {
        if (!this.secondaryCamera || !box || box.isEmpty()) {
            return false;
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z) || 10;
        const distance = radius * 1.45;
        this.secondaryCamera.position.set(center.x + distance, center.y + distance * 0.76, center.z + distance);
        this.secondaryCamera.lookAt(center);
        this.secondaryCamera.near = Math.max(distance / 1000, 0.1);
        this.secondaryCamera.far = Math.max(distance * 12, 1000);
        this.secondaryCamera.updateProjectionMatrix();
        this.lastSecondarySyncKey = "";
        this.render();
        this.dispatchEvent(new CustomEvent("fit", {detail: {label, box, secondary: true}}));
        return true;
    }

    getSecondaryViewportRect(width = this.canvas.clientWidth || 1, height = this.canvas.clientHeight || 1) {
        if (this.dualViewLayout === "split") {
            const leftWidth = Math.floor(width / 2);
            return {
                x: leftWidth,
                y: 0,
                width: Math.max(width - leftWidth, 1),
                height: Math.max(height, 1)
            };
        }
        const margin = Math.min(this.dualViewInset.margin, Math.floor(width * 0.04), Math.floor(height * 0.04));
        const insetWidth = Math.max(Math.floor(width * this.dualViewInset.widthRatio), 260);
        const availableWidth = Math.max(width - margin * 2, 1);
        const viewportWidth = Math.min(insetWidth, availableWidth);
        const viewportHeight = Math.max(height - margin * 2, 1);
        return {
            x: Math.max(width - viewportWidth - margin, 0),
            y: margin,
            width: viewportWidth,
            height: viewportHeight
        };
    }

    getMainViewportRect(width = this.canvas.clientWidth || 1, height = this.canvas.clientHeight || 1) {
        if (this.dualViewEnabled && this.dualViewLayout === "split") {
            return {
                x: 0,
                y: 0,
                width: Math.max(Math.floor(width / 2), 1),
                height: Math.max(height, 1)
            };
        }
        return {
            x: 0,
            y: 0,
            width: Math.max(width, 1),
            height: Math.max(height, 1)
        };
    }

    updateSecondaryCameraAspect(width = this.canvas.clientWidth || 1, height = this.canvas.clientHeight || 1) {
        if (!this.secondaryCamera) {
            return;
        }
        const rect = this.getSecondaryViewportRect(width, height);
        this.updateCameraAspect(this.secondaryCamera, rect.width / Math.max(rect.height, 1));
    }

    updateCameraAspect(camera, aspect) {
        if (!camera || !Number.isFinite(aspect) || aspect <= 0) {
            return;
        }
        if (Math.abs(camera.aspect - aspect) < 0.0001) {
            return;
        }
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }

    renderSecondaryView() {
        const width = this.canvas.clientWidth || 1;
        const height = this.canvas.clientHeight || 1;
        const rect = this.getSecondaryViewportRect(width, height);
        this.updateSecondaryCameraAspect(width, height);
        const y = height - rect.y - rect.height;
        this.renderer.clearDepth();
        this.renderer.setScissorTest(true);
        this.renderer.setViewport(rect.x, y, rect.width, rect.height);
        this.renderer.setScissor(rect.x, y, rect.width, rect.height);
        this.renderer.render(this.scene, this.secondaryCamera);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, width, height);
    }

    renderSplitDualView() {
        const width = this.canvas.clientWidth || 1;
        const height = this.canvas.clientHeight || 1;
        const mainRect = this.getMainViewportRect(width, height);
        const secondaryRect = this.getSecondaryViewportRect(width, height);
        this.updateCameraAspect(this.camera, mainRect.width / Math.max(mainRect.height, 1));
        this.updateCameraAspect(this.secondaryCamera, secondaryRect.width / Math.max(secondaryRect.height, 1));
        this.renderer.setScissorTest(true);
        this.renderer.setViewport(mainRect.x, 0, mainRect.width, mainRect.height);
        this.renderer.setScissor(mainRect.x, 0, mainRect.width, mainRect.height);
        this.renderer.render(this.scene, this.camera);
        this.renderer.clearDepth();
        this.renderer.setViewport(secondaryRect.x, 0, secondaryRect.width, secondaryRect.height);
        this.renderer.setScissor(secondaryRect.x, 0, secondaryRect.width, secondaryRect.height);
        this.renderer.render(this.scene, this.secondaryCamera);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, width, height);
    }

    getViewState() {
        return {
            position: vectorToArray(this.camera.position),
            quaternion: [
                Number(this.camera.quaternion.x.toFixed(6)),
                Number(this.camera.quaternion.y.toFixed(6)),
                Number(this.camera.quaternion.z.toFixed(6)),
                Number(this.camera.quaternion.w.toFixed(6))
            ],
            target: vectorToArray(this.controls.target),
            near: this.camera.near,
            far: this.camera.far,
            zoom: this.camera.zoom
        };
    }

    restoreViewState(state = {}) {
        if (Array.isArray(state.position)) {
            this.camera.position.fromArray(state.position);
        }
        if (Array.isArray(state.quaternion)) {
            this.camera.quaternion.fromArray(state.quaternion);
        }
        if (Array.isArray(state.target)) {
            this.controls.target.fromArray(state.target);
        }
        if (typeof state.near === "number") {
            this.camera.near = state.near;
        }
        if (typeof state.far === "number") {
            this.camera.far = state.far;
        }
        if (typeof state.zoom === "number") {
            this.camera.zoom = state.zoom;
        }
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.dispatchEvent(new CustomEvent("viewchange", {
            detail: this.getViewState()
        }));
    }

    dispose() {
        this.stop();
        this.controls?.dispose();
        this.renderer?.dispose();
        this.scene?.clear();
    }
}
