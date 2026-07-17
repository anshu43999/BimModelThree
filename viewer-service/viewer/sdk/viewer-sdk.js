import * as THREE from "three";
import {RenderedFaces} from "@thatopen/fragments";
import {BimViewerApp} from "./bim-viewer-app.js";
import {CameraControlManager} from "../app/camera-control-manager.js";
import {FreeInspectController} from "../app/free-inspect-controller.js";
import {
    PATH_ROAM_SCHEMA_VERSION,
    getPathRoamCameraAt as getPathRoamCameraAtCore,
    getPathRoamTotalDuration as getPathRoamTotalDurationCore
} from "../app/path-roam-core.js";
import {PathRoamDocumentController} from "../app/path-roam-document-controller.js";
import {PathRoamPlaybackController} from "../app/path-roam-playback-controller.js";
import {InteractionEngine} from "../engines/interaction-engine.js";
import {RenderEngine} from "../engines/render-engine.js";
import {SemanticQueryEngine} from "../engines/semantic-query-engine.js";
import {SnapshotEngine} from "../engines/snapshot-engine.js";
import {ViewpointEngine} from "../engines/viewpoint-engine.js";
import {LabelEngine} from "../engines/label-engine.js";
import {LabelStoreEngine} from "../engines/label-store-engine.js";
import {AnnotationEngine} from "../engines/annotation-engine.js";
import {BusinessDataApiClient} from "./business-data-client.js";
import {createSdkEvent} from "./sdk-event-contract.js";
import {
    createSdkCapabilities,
    normalizeSdkItemTarget
} from "./sdk-integration-contract.js";
import {
    createAnnotationPatch,
    createBusinessAnnotationPayload,
    normalizeAnnotationPermission,
    normalizeOptionalText,
    resolveAnnotationActor
} from "./annotation-contract.js";

const defaultHighlightMaterial = {
    color: new THREE.Color(0x34c38f),
    opacity: 1,
    transparent: false,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: false,
    customId: "sdk-selection"
};

function resolveCanvas(options) {
    if (options.canvas) {
        return options.canvas;
    }
    if (options.container) {
        const canvas = document.createElement("canvas");
        canvas.className = options.canvasClassName || "bim-viewer-sdk-canvas";
        options.container.appendChild(canvas);
        return canvas;
    }
    throw new Error("BimViewerSDK requires canvas or container");
}

function getModelBox(model) {
    if (!model) {
        return null;
    }
    return model.box && !model.box.isEmpty()
        ? model.box.clone()
        : new THREE.Box3().setFromObject(model.object);
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toVector3(value) {
    if (!value) {
        return null;
    }
    if (value instanceof THREE.Vector3) {
        return value.clone();
    }
    if (Array.isArray(value) && value.length >= 3) {
        const vector = new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
        return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z) ? vector : null;
    }
    if (isObject(value)) {
        const vector = new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z));
        return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z) ? vector : null;
    }
    return null;
}

function vectorToArray(vector) {
    return [
        Number(vector.x.toFixed(6)),
        Number(vector.y.toFixed(6)),
        Number(vector.z.toFixed(6))
    ];
}

function normalizeListLimit(payload = {}, fallback = 100) {
    const limit = Number(payload.limit ?? payload.pageSize ?? fallback);
    if (!Number.isFinite(limit) || limit <= 0) {
        return fallback;
    }
    return Math.min(Math.floor(limit), 500);
}

function normalizeBusinessDataMode(value) {
    const mode = String(value || "").trim();
    return ["local", "manual", "backend"].includes(mode) ? mode : "manual";
}

const PATH_ROAM_STORAGE_PREFIX = "bim-three:sdk:path-roam:";

/**
 * Direct JavaScript SDK for embedding the BIM viewer without an iframe.
 *
 * This class owns the Three.js canvas, Fragments model lifecycle, selection,
 * labels, annotations, free inspect mode, path roam, snapshots, and optional
 * business-data synchronization.
 *
 * Public events:
 * - ready: SDK engines are initialized.
 * - progress: model loading progress forwarded from BimViewerApp.
 * - modelloaded: a model was loaded and semantic data is ready.
 * - modelclosed: the current model was disposed.
 * - selectionchanged: selected localIds/globalIds changed.
 * - ctrllookchange: Ctrl + left-drag fixed-position look state changed.
 * - freeinspectchange: WASD free inspect mode changed.
 * - pathroamchange: route, keyframe, playback, or speed changed.
 * - labelcreated / labelremoved: label store changed.
 * - annotationcreated / annotationupdated / annotationremoved: annotation store changed.
 * - businessdatasynced: a local item was pushed to the configured business API.
 */
export class BimViewerSDK extends EventTarget {
    /**
     * Create, initialize, and return a ready SDK instance.
     * @param {object} options Constructor options.
     */
    static async create(options = {}) {
        const sdk = new BimViewerSDK(options);
        await sdk.init();
        return sdk;
    }

    /**
     * @param {object} options
     * @param {HTMLCanvasElement} [options.canvas] Existing canvas to render into.
     * @param {HTMLElement} [options.container] Container used to create a canvas.
     * @param {string} [options.workerUrl] Fragments worker URL.
     * @param {string} [options.businessDataBaseUrl] Optional backend API base URL.
     * @param {"local"|"manual"|"backend"} [options.businessDataMode="manual"] Data sync mode.
     * @param {BusinessDataApiClient} [options.businessDataClient] Custom business API client.
     * @param {string} [options.projectId] Business project id added to sync payloads.
     * @param {string} [options.versionId] Business model version id added to sync payloads.
     * @param {string} [options.userId] Default actor used for annotations.
     */
    constructor(options = {}) {
        super();
        this.options = options;
        this.canvas = resolveCanvas(options);
        this.renderEngine = null;
        this.cameraControlManager = null;
        this.viewerApp = null;
        this.snapshotEngine = null;
        this.viewpointEngine = null;
        this.labelEngine = null;
        this.labelStoreEngine = null;
        this.annotationEngine = null;
        this.businessDataMode = normalizeBusinessDataMode(options.businessDataMode);
        this.businessDataClient = options.businessDataClient || (
            options.businessDataBaseUrl
                ? new BusinessDataApiClient({
                    baseUrl: options.businessDataBaseUrl,
                    headers: options.businessDataHeaders
                })
                : null
        );
        this.semanticEngine = null;
        this.interactionEngine = null;
        this.currentModel = null;
        this.currentManifest = null;
        this.currentModelName = null;
        this.ctrlLookEnabled = options.ctrlLookEnabled !== false;
        this.ctrlLookState = null;
        this.ctrlLookSuppressClick = false;
        this.ctrlLookPointerDownHandler = null;
        this.ctrlLookPointerMoveHandler = null;
        this.ctrlLookPointerUpHandler = null;
        this.ctrlLookClickHandler = null;
        this.freeInspectController = new FreeInspectController({
            getCamera: () => this.renderEngine?.camera || null,
            getControls: () => this.renderEngine?.controls || null,
            keyboardTarget: globalThis.document || null,
            getAvailable: () => Boolean(this.currentModel),
            getBaseSpeed: () => this.getFreeInspectSpeed(),
            speedMultiplier: options.freeInspectSpeedMultiplier ?? 0.2,
            speedPrecision: 2,
            onMove: () => {
                this.labelEngine?.sync();
                this.viewerApp?.update().catch(() => {});
            }
        });
        this.pathRoamDocument = null;
        this.pathRoamPlaying = false;
        this.pathRoamPaused = false;
        this.pathRoamElapsedMs = 0;
        this.pathRoamSpeedMultiplier = 1;
        this.pathRoamDocumentController = new PathRoamDocumentController({
            ...(Object.hasOwn(options, "pathRoamStorage") ? {storage: options.pathRoamStorage} : {}),
            getModelId: () => this.currentModel?.modelId || null,
            getModelName: () => this.currentModelName || this.currentModel?.modelId || "model",
            getStorageKey: () => this.getPathRoamStorageKey(),
            getCameraDefaults: () => ({
                near: this.renderEngine?.camera?.near || 0.1,
                far: this.renderEngine?.camera?.far || 100000,
                zoom: this.renderEngine?.camera?.zoom || 1
            })
        });
        this.pathRoamPlaybackController = new PathRoamPlaybackController({
            getPoints: () => this.pathRoamDocumentController.getPoints(),
            getAvailable: () => Boolean(this.currentModel),
            speedMultiplier: options.pathRoamSpeedMultiplier ?? 1,
            onFrame: ({viewState}) => {
                if (viewState) {
                    this.renderEngine?.restoreViewState(viewState);
                    this.labelEngine?.sync();
                    this.viewerApp?.update().catch(() => {});
                }
                this.syncPathRoamPlaybackState();
            },
            onKeyframe: (point) => this.applyPathRoamKeyframeState(point),
            onKeyframeError: (error) => {
                console.warn("[BimViewerSDK] Path roam keyframe restore failed", error);
            },
            onComplete: () => {
                this.syncPathRoamPlaybackState();
                this.cameraControlManager?.release("path-roam", {source: "sdk-path-roam-complete"});
                this.dispatchPathRoamChange();
            }
        });
    }

    /** Emit a direct-SDK event with standard metadata and legacy top-level fields. */
    emitSdkEvent(type, detail = {}) {
        const legacyFields = isObject(detail) ? detail : {value: detail};
        const eventDetail = createSdkEvent({
            event: type,
            source: "direct-sdk",
            payload: detail,
            legacyFields
        });
        this.dispatchEvent(new CustomEvent(type, {detail: eventDetail}));
        return eventDetail;
    }

    /** Initialize render, fragments, interaction, label, annotation, and viewpoint engines. */
    async init() {
        this.renderEngine = new RenderEngine({
            canvas: this.canvas,
            container: this.options.container,
            background: this.options.background,
            initialCameraPosition: this.options.initialCameraPosition
        }).init();
        this.cameraControlManager = new CameraControlManager({
            controls: this.renderEngine.controls,
            canvas: this.canvas
        });

        const workerUrl = this.options.workerUrl
            || new URL("../../node_modules/@thatopen/fragments/dist/Worker/worker.mjs", import.meta.url).href;

        this.viewerApp = await BimViewerApp.create({
            scene: this.renderEngine.scene,
            camera: this.renderEngine.camera,
            workerUrl,
            maxWorkers: this.options.maxWorkers
        });
        this.viewerApp.addEventListener("progress", (event) => {
            this.emitSdkEvent("progress", event.detail);
        });

        this.snapshotEngine = new SnapshotEngine({
            renderer: this.renderEngine.renderer,
            scene: this.renderEngine.scene,
            camera: this.renderEngine.camera,
            canvas: this.canvas
        });
        this.viewpointEngine = new ViewpointEngine({
            renderEngine: this.renderEngine
        });
        this.labelEngine = new LabelEngine({
            camera: this.renderEngine.camera,
            canvas: this.canvas,
            onSelect: async (label) => {
                if (typeof label.localId === "number") {
                    await this.selectLocalIds([label.localId], {
                        primaryLocalId: label.localId,
                        source: "sdk-label"
                    });
                }
            }
        });
        this.labelStoreEngine = new LabelStoreEngine({
            storageKey: this.options.labelStorageKey || "bim-three:sdk:labels",
            maxItems: this.options.maxLabels || 500
        });
        this.annotationEngine = new AnnotationEngine({
            storageKey: this.options.annotationStorageKey || "bim-three:sdk:annotations",
            maxItems: this.options.maxAnnotations || 500
        });

        this.renderEngine.controls.addEventListener("change", () => {
            this.labelEngine?.sync();
            this.viewerApp.update().catch(() => {});
        });
        this.bindCtrlLookControls();
        if (this.options.autoStart !== false) {
            this.renderEngine.start();
        }
        this.emitSdkEvent("ready", this.getState());
        return this;
    }

    /**
     * Load a model source and prepare semantic query and interaction engines.
     * @param {object} source Manifest/fragment source accepted by BimViewerApp.openModel().
     * @fires BimViewerSDK#modelloaded
     */
    async openModel(source = {}) {
        this.setFreeInspectMode(false, {dispatch: false});
        this.cancelCtrlLook();
        this.stopPathRoam({dispatch: false});
        const result = await this.viewerApp.openModel(source);
        this.currentModel = result.model;
        this.currentManifest = result.manifest || null;
        this.currentModelName = result.manifest?.displayName || result.name || result.modelId;
        this.pathRoamDocument = this.loadPathRoamDocument();
        this.pathRoamElapsedMs = 0;
        this.pathRoamPlaybackController.setElapsed(0);

        this.semanticEngine = new SemanticQueryEngine({model: this.currentModel});
        await this.semanticEngine.init();
        this.labelEngine.updateModel(this.currentModel);
        this.labelEngine.updateSemanticEngine(this.semanticEngine);
        this.labelStoreEngine.setCurrentModel(this.currentModel.modelId, this.currentModelName);
        this.annotationEngine.setCurrentModel(this.currentModel.modelId, this.currentModelName);

        this.interactionEngine = new InteractionEngine({
            model: this.currentModel,
            camera: this.renderEngine.camera,
            canvas: this.canvas,
            semanticEngine: this.semanticEngine,
            highlightMaterial: this.options.highlightMaterial || defaultHighlightMaterial
        });
        this.interactionEngine.addEventListener("selectionchanged", (event) => {
            this.emitSdkEvent("selectionchanged", event.detail);
            this.viewerApp.update().catch(() => {});
        });
        this.interactionEngine.addEventListener("fitrequested", (event) => {
            this.renderEngine.fitBox(event.detail.box, `selected:${event.detail.selection.count}`);
            this.viewerApp.update().catch(() => {});
        });
        this.viewpointEngine.interactionEngine = this.interactionEngine;

        if (this.options.fitOnLoad !== false) {
            this.fitModel();
        }

        const detail = {
            ...result,
            state: this.getState()
        };
        this.emitSdkEvent("modelloaded", detail);
        return detail;
    }

    /** Close the current model and reset model-bound engines. */
    async closeModel() {
        this.setFreeInspectMode(false, {dispatch: false});
        this.stopPathRoam({dispatch: false});
        this.cancelCtrlLook();
        await this.viewerApp.disposeModel();
        this.labelEngine?.clear();
        this.labelEngine?.updateModel(null);
        this.labelEngine?.updateSemanticEngine(null);
        this.labelStoreEngine?.setCurrentModel(null, null);
        this.annotationEngine?.setCurrentModel(null, null);
        this.currentModel = null;
        this.currentManifest = null;
        this.currentModelName = null;
        this.semanticEngine = null;
        this.interactionEngine = null;
        this.emitSdkEvent("modelclosed", this.getState());
    }

    /** Fit the whole model into the active camera view. */
    fitModel() {
        const box = getModelBox(this.currentModel);
        const fitted = this.renderEngine.fitBox(box, "model");
        this.viewerApp.update().catch(() => {});
        return fitted;
    }

    /** Switch camera to a named view such as iso/top/front/left/right. */
    setView(name = "iso") {
        const box = getModelBox(this.currentModel);
        const changed = this.renderEngine.setNamedView(name, box);
        this.viewerApp.update().catch(() => {});
        return changed;
    }

    /** Restore a viewpoint using the method name shared with iframe SDK. */
    setViewpoint(viewpoint) {
        const restored = this.restoreViewpoint(viewpoint);
        if (!restored) {
            throw new Error("setViewpoint requires view or camera state");
        }
        return restored;
    }

    /** Read Ctrl + left-drag fixed-position look availability and active state. */
    getCtrlLookMode() {
        return {
            enabled: this.ctrlLookEnabled,
            active: Boolean(this.ctrlLookState),
            available: Boolean(this.currentModel),
            controls: {
                modifier: "Ctrl",
                pointerButton: 0
            }
        };
    }

    /** Enable or disable Ctrl + left-drag fixed-position camera rotation. */
    setCtrlLookEnabled(enabled = true, options = {}) {
        this.ctrlLookEnabled = Boolean(enabled);
        if (!this.ctrlLookEnabled) {
            this.cancelCtrlLook();
        }
        const ctrlLook = this.getCtrlLookMode();
        if (options.dispatch !== false) {
            this.emitSdkEvent("ctrllookchange", {ctrlLook});
        }
        return ctrlLook;
    }

    bindCtrlLookControls() {
        if (!this.canvas || this.ctrlLookPointerDownHandler) {
            return;
        }
        this.ctrlLookPointerDownHandler = (event) => this.startCtrlLook(event);
        this.ctrlLookPointerMoveHandler = (event) => this.updateCtrlLook(event);
        this.ctrlLookPointerUpHandler = (event) => this.finishCtrlLook(event);
        this.ctrlLookClickHandler = (event) => {
            if (!this.ctrlLookSuppressClick) {
                return;
            }
            this.ctrlLookSuppressClick = false;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };
        this.canvas.addEventListener("pointerdown", this.ctrlLookPointerDownHandler, true);
        this.canvas.addEventListener("pointermove", this.ctrlLookPointerMoveHandler, true);
        this.canvas.addEventListener("pointerup", this.ctrlLookPointerUpHandler, true);
        this.canvas.addEventListener("pointercancel", this.ctrlLookPointerUpHandler, true);
        this.canvas.addEventListener("click", this.ctrlLookClickHandler, true);
    }

    unbindCtrlLookControls() {
        if (!this.canvas || !this.ctrlLookPointerDownHandler) {
            return;
        }
        this.cancelCtrlLook();
        this.canvas.removeEventListener("pointerdown", this.ctrlLookPointerDownHandler, true);
        this.canvas.removeEventListener("pointermove", this.ctrlLookPointerMoveHandler, true);
        this.canvas.removeEventListener("pointerup", this.ctrlLookPointerUpHandler, true);
        this.canvas.removeEventListener("pointercancel", this.ctrlLookPointerUpHandler, true);
        this.canvas.removeEventListener("click", this.ctrlLookClickHandler, true);
        this.ctrlLookPointerDownHandler = null;
        this.ctrlLookPointerMoveHandler = null;
        this.ctrlLookPointerUpHandler = null;
        this.ctrlLookClickHandler = null;
    }

    startCtrlLook(event) {
        if (!this.ctrlLookEnabled
            || !this.currentModel
            || this.pathRoamPlaying
            || event.button !== 0
            || !event.ctrlKey) {
            return false;
        }
        const camera = this.renderEngine.camera;
        const controls = this.renderEngine.controls;
        const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
        this.ctrlLookState = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            yaw: euler.y,
            pitch: euler.x,
            position: camera.position.clone(),
            targetDistance: Math.max(camera.position.distanceTo(controls.target), 1),
            moved: false
        };
        this.cameraControlManager.acquire("ctrl-look", {
            cursor: "grabbing",
            priority: 90,
            source: "sdk-ctrl-look"
        });
        this.canvas.setPointerCapture?.(event.pointerId);
        this.emitSdkEvent("ctrllookchange", {ctrlLook: this.getCtrlLookMode()});
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return true;
    }

    updateCtrlLook(event) {
        const state = this.ctrlLookState;
        if (!state || event.pointerId !== state.pointerId) {
            return;
        }
        const dx = event.clientX - state.lastX;
        const dy = event.clientY - state.lastY;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        state.moved = state.moved
            || Math.abs(event.clientX - state.startX) > 2
            || Math.abs(event.clientY - state.startY) > 2;
        state.yaw -= dx * 0.004;
        state.pitch -= dy * 0.004;
        const pitchLimit = Math.PI / 2 - 0.02;
        const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, state.pitch));
        const direction = new THREE.Vector3(0, 0, -1)
            .applyEuler(new THREE.Euler(pitch, state.yaw, 0, "YXZ"))
            .normalize();
        const camera = this.renderEngine.camera;
        const controls = this.renderEngine.controls;
        camera.position.copy(state.position);
        controls.target.copy(state.position).addScaledVector(direction, state.targetDistance);
        camera.lookAt(controls.target);
        camera.updateMatrixWorld(true);
        this.labelEngine?.sync();
        this.viewerApp.update().catch(() => {});
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    finishCtrlLook(event) {
        if (!this.ctrlLookState || event.pointerId !== this.ctrlLookState.pointerId) {
            return;
        }
        this.ctrlLookSuppressClick = this.ctrlLookState.moved;
        const pointerId = this.ctrlLookState.pointerId;
        this.ctrlLookState = null;
        this.cameraControlManager.release("ctrl-look", {source: "sdk-ctrl-look-finish"});
        try {
            this.canvas.releasePointerCapture?.(pointerId);
        } catch {
            // Pointer capture may already be released.
        }
        this.emitSdkEvent("ctrllookchange", {ctrlLook: this.getCtrlLookMode()});
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    cancelCtrlLook() {
        if (!this.ctrlLookState) {
            return;
        }
        const pointerId = this.ctrlLookState.pointerId;
        this.ctrlLookState = null;
        this.cameraControlManager?.release("ctrl-look", {source: "sdk-ctrl-look-cancel"});
        if (this.canvas) {
            try {
                this.canvas.releasePointerCapture?.(pointerId);
            } catch {
                // Pointer capture may already be released.
            }
        }
    }

    /** Calculate the default WASD movement speed from current model size. */
    getFreeInspectSpeed() {
        const box = getModelBox(this.currentModel);
        if (box && !box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            return Math.max(size.x, size.y, size.z, 10) / 7;
        }
        return 8;
    }

    /** Read current free inspect mode state and keyboard mapping. */
    getFreeInspectMode() {
        return this.freeInspectController.getState();
    }

    /** Set the WASD movement speed multiplier; values are clamped to 0.2-3. */
    setFreeInspectSpeedMultiplier(value = 0.2, options = {}) {
        const freeInspect = this.freeInspectController.setSpeedMultiplier(value);
        if (options.dispatch !== false) {
            this.emitSdkEvent("freeinspectchange", {
                freeInspect,
                state: this.getState()
            });
        }
        return freeInspect;
    }

    /** Alias for setFreeInspectSpeedMultiplier(). */
    setFreeInspectSpeed(value = 0.2, options = {}) {
        return this.setFreeInspectSpeedMultiplier(value, options);
    }

    /**
     * Enable or disable WASD free inspect mode.
     * @param {boolean} enabled True to enable first-person style movement.
     * @param {object} [options]
     * @param {boolean} [options.dispatch=true] Set false to suppress freeinspectchange.
     */
    setFreeInspectMode(enabled = true, options = {}) {
        const freeInspect = this.freeInspectController.setEnabled(enabled);
        const detail = {
            freeInspect,
            state: this.getState()
        };
        if (options.dispatch !== false) {
            this.emitSdkEvent("freeinspectchange", detail);
        }
        return detail.freeInspect;
    }

    /** Toggle WASD free inspect mode. */
    toggleFreeInspectMode(options = {}) {
        return this.setFreeInspectMode(!this.freeInspectController.enabled, options);
    }

    /** Return the localStorage key used for the current model path roam document. */
    getPathRoamStorageKey() {
        const modelId = this.currentModel?.modelId || "unloaded";
        return this.options.pathRoamStorageKey || `${PATH_ROAM_STORAGE_PREFIX}${modelId}`;
    }

    /** Build a normalized path roam document for routes and keyframes. */
    createPathRoamDocument(routes = null, activeRouteId = null) {
        this.pathRoamDocument = this.pathRoamDocumentController.createDocument(routes, activeRouteId);
        return this.pathRoamDocument;
    }

    /** Load path roam routes/keyframes from localStorage for the current model. */
    loadPathRoamDocument() {
        this.pathRoamDocument = this.pathRoamDocumentController.load();
        return this.pathRoamDocument;
    }

    /** Persist the current path roam document to localStorage. */
    savePathRoamDocument() {
        this.pathRoamDocumentController.document = this.pathRoamDocument;
        this.pathRoamDocument = this.pathRoamDocumentController.save();
        return this.pathRoamDocument;
    }

    /** Ensure the path roam document belongs to the currently loaded model. */
    ensurePathRoamDocument() {
        this.pathRoamDocumentController.document = this.pathRoamDocument;
        this.pathRoamDocument = this.pathRoamDocumentController.ensure();
        return this.pathRoamDocument;
    }

    /** Return the active route, creating a default route when needed. */
    getActivePathRoamRoute() {
        this.ensurePathRoamDocument();
        return this.pathRoamDocumentController.getActiveRoute();
    }

    getPathRoamPoints() {
        this.ensurePathRoamDocument();
        return this.pathRoamDocumentController.getPoints();
    }

    summarizePathRoamRoute(route) {
        return this.pathRoamDocumentController.summarizeRoute(route);
    }

    listPathRoamRoutes() {
        this.ensurePathRoamDocument();
        return this.pathRoamDocumentController.listRoutes();
    }

    /** Create a route and make it active; returns null while playing or without a model. */
    createPathRoamRoute(payload = {}, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const route = this.pathRoamDocumentController.createRoute(payload);
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.pathRoamElapsedMs = 0;
        this.pathRoamPlaybackController.setElapsed(0);
        this.dispatchPathRoamChange({route: this.summarizePathRoamRoute(route)}, options);
        return route;
    }

    /** Switch active route by id; returns null when the route cannot be found. */
    switchPathRoamRoute(routeId, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const route = this.pathRoamDocumentController.switchRoute(routeId);
        if (!route) {
            return null;
        }
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.pathRoamElapsedMs = 0;
        this.pathRoamPlaybackController.setElapsed(0);
        this.dispatchPathRoamChange({route: this.summarizePathRoamRoute(route)}, options);
        return route;
    }

    /** Rename/save the active route metadata. */
    savePathRoamRoute(payload = {}, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const route = this.pathRoamDocumentController.updateRoute(payload);
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.dispatchPathRoamChange({route: this.summarizePathRoamRoute(route)}, options);
        return route;
    }

    /** Delete a route; at least one route is kept in the document. */
    deletePathRoamRoute(routeId = null, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const route = this.pathRoamDocumentController.deleteRoute(routeId);
        if (!route) {
            return null;
        }
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.pathRoamElapsedMs = 0;
        this.pathRoamPlaybackController.setElapsed(0);
        this.dispatchPathRoamChange({route: this.summarizePathRoamRoute(route), deleted: true}, options);
        return route;
    }

    /**
     * Dispatch pathroamchange with route, point, playback, and aggregate state.
     * Internal helpers call this after every path roam mutation.
     */
    dispatchPathRoamChange(extra = {}, options = {}) {
        const detail = {
            ...extra,
            pathRoam: this.getPathRoamMode(),
            document: this.listPathRoamRoutes(),
            state: this.getState()
        };
        if (options.dispatch !== false) {
            this.emitSdkEvent("pathroamchange", detail);
        }
        return detail;
    }

    syncPathRoamPlaybackState() {
        const playback = this.pathRoamPlaybackController.getState();
        this.pathRoamPlaying = playback.active;
        this.pathRoamPaused = playback.paused;
        this.pathRoamElapsedMs = playback.elapsedMs;
        this.pathRoamSpeedMultiplier = playback.speedMultiplier;
        return playback;
    }

    /** Read current path roam availability, route, point count, elapsed time, and speed. */
    getPathRoamMode() {
        const route = this.pathRoamDocument ? this.getActivePathRoamRoute() : null;
        const points = route?.points || [];
        const playback = this.syncPathRoamPlaybackState();
        return {
            available: Boolean(this.currentModel),
            playing: playback.playing,
            paused: playback.paused,
            routeCount: this.pathRoamDocument?.routes?.length || 0,
            activeRouteId: route?.id || null,
            activeRouteName: route?.name || "",
            pointCount: points.length,
            elapsedMs: playback.elapsedMs,
            totalMs: playback.totalMs,
            speedMultiplier: playback.speedMultiplier,
            schemaVersion: PATH_ROAM_SCHEMA_VERSION
        };
    }

    /** Set playback speed multiplier; value is clamped to a small safe range. */
    setPathRoamSpeedMultiplier(value = 1, options = {}) {
        this.pathRoamPlaybackController.setSpeedMultiplier(value);
        this.syncPathRoamPlaybackState();
        return this.dispatchPathRoamChange({}, options).pathRoam;
    }

    /** Alias for setPathRoamSpeedMultiplier(). */
    setPathRoamSpeed(value = 1, options = {}) {
        return this.setPathRoamSpeedMultiplier(value, options);
    }

    /** Convert an internal keyframe into a stable public payload. */
    summarizePathRoamPoint(point, index = 0) {
        return this.pathRoamDocumentController.summarizePoint(point, index);
    }

    /** List keyframes in the active route. */
    listPathRoamPoints() {
        this.ensurePathRoamDocument();
        return this.pathRoamDocumentController.listPoints();
    }

    /** Update keyframe name and/or timeline time. */
    updatePathRoamPoint(pointId, patch = {}, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const point = this.pathRoamDocumentController.updatePoint(pointId, patch);
        if (!point) {
            return null;
        }
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.dispatchPathRoamChange({point}, options);
        return point;
    }

    /** Replace a keyframe camera/states with the current viewer camera/states. */
    recapturePathRoamPoint(pointId, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const point = this.pathRoamDocumentController.recapturePoint(
            pointId,
            this.renderEngine.getViewState(),
            {
            selection: this.getSelection(),
            section: null,
            transform: null,
            visibility: null,
            ...(options.states || {})
            }
        );
        if (!point) {
            return null;
        }
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.dispatchPathRoamChange({point}, options);
        return point;
    }

    /** Reorder a keyframe; direction -1 moves up, 1 moves down. */
    movePathRoamPoint(pointId, direction, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const point = this.pathRoamDocumentController.movePoint(pointId, direction);
        if (!point) {
            return null;
        }
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.dispatchPathRoamChange({point}, options);
        return point;
    }

    /** Add the current camera and selection state as a route keyframe. */
    addPathRoamPoint(options = {}) {
        if (!this.currentModel || !this.renderEngine) {
            return null;
        }
        this.ensurePathRoamDocument();
        const point = this.pathRoamDocumentController.addPoint({
            ...options,
            camera: this.renderEngine.getViewState(),
            states: {
                selection: this.getSelection(),
                section: null,
                transform: null,
                visibility: null,
                ...(options.states || {})
            }
        });
        if (!point) {
            return null;
        }
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.dispatchPathRoamChange({point}, options);
        return point;
    }

    /** Restore camera and optional selection state from a keyframe. */
    async restorePathRoamPoint(pointId, options = {}) {
        const point = this.getPathRoamPoints().find((item) => item.id === pointId);
        if (!point) {
            return null;
        }
        this.renderEngine.restoreViewState(point.camera);
        const selection = point.states?.selection;
        if (Array.isArray(selection?.localIds) && selection.localIds.length) {
            await this.selectLocalIds(selection.localIds, {
                primaryLocalId: selection.primaryLocalId,
                source: "path-keyframe"
            });
        } else if (selection && selection.count === 0) {
            await this.clearSelection("path-keyframe");
        }
        this.labelEngine?.sync();
        this.viewerApp.update().catch(() => {});
        this.dispatchPathRoamChange({point}, options);
        return point;
    }

    /** Apply keyframe non-camera state while path roam playback crosses the keyframe. */
    async applyPathRoamKeyframeState(point) {
        if (!point?.states) {
            return false;
        }
        const selection = point.states.selection;
        let changed = false;
        if (Array.isArray(selection?.localIds) && selection.localIds.length) {
            await this.selectLocalIds(selection.localIds, {
                primaryLocalId: selection.primaryLocalId,
                source: "path-keyframe-playback"
            });
            changed = true;
        } else if (selection && (selection.count === 0 || Array.isArray(selection.localIds))) {
            await this.clearSelection("path-keyframe-playback");
            changed = true;
        }
        if (changed) {
            this.labelEngine?.sync();
            this.viewerApp.update().catch(() => {});
        }
        return changed;
    }

    /** Delete a keyframe and renormalize keyframe times. */
    deletePathRoamPoint(pointId, options = {}) {
        if (!this.currentModel || this.pathRoamPlaying) {
            return null;
        }
        this.ensurePathRoamDocument();
        const deleted = this.pathRoamDocumentController.deletePoint(pointId);
        if (!deleted) {
            return null;
        }
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.dispatchPathRoamChange({point: deleted, deleted: true}, options);
        return deleted;
    }

    /** Clear all keyframes from the active route and stop playback. */
    clearPathRoam(options = {}) {
        this.stopPathRoam({dispatch: false});
        this.ensurePathRoamDocument();
        this.pathRoamDocumentController.clearPoints();
        this.pathRoamDocument = this.pathRoamDocumentController.document;
        this.pathRoamPlaybackController.setElapsed(0);
        this.syncPathRoamPlaybackState();
        return this.dispatchPathRoamChange({}, options).pathRoam;
    }

    /** Return total playback duration in milliseconds for the active route. */
    getPathRoamTotalDuration() {
        return getPathRoamTotalDurationCore(this.getPathRoamPoints());
    }

    /** Interpolate camera state for a playback timestamp. */
    getPathRoamCameraAt(timelineElapsedMs) {
        return getPathRoamCameraAtCore(this.getPathRoamPoints(), timelineElapsedMs);
    }

    /** Start path roam playback and disable orbit controls while playing. */
    playPathRoam(options = {}) {
        const totalDuration = this.getPathRoamTotalDuration();
        if (!this.currentModel || totalDuration <= 0) {
            return this.getPathRoamMode();
        }
        this.setFreeInspectMode(false, {dispatch: false});
        if (!this.pathRoamPlaybackController.play()) {
            return this.getPathRoamMode();
        }
        this.syncPathRoamPlaybackState();
        this.cameraControlManager.acquire("path-roam", {
            cursor: "progress",
            priority: 100,
            source: "sdk-path-roam"
        });
        return this.dispatchPathRoamChange({}, options).pathRoam;
    }

    /** Pause playback and keep current elapsed time. */
    pausePathRoam(options = {}) {
        if (!this.pathRoamPlaybackController.pause()) {
            return this.getPathRoamMode();
        }
        this.syncPathRoamPlaybackState();
        this.cameraControlManager.release("path-roam", {source: "sdk-path-roam-pause"});
        return this.dispatchPathRoamChange({}, options).pathRoam;
    }

    /** Stop playback; reset elapsed time unless options.reset is false. */
    stopPathRoam(options = {}) {
        this.pathRoamPlaybackController.stop({reset: options.reset !== false});
        this.syncPathRoamPlaybackState();
        this.cameraControlManager?.release("path-roam", {source: "sdk-path-roam-stop"});
        return this.dispatchPathRoamChange({}, options).pathRoam;
    }

    /** Select components by Fragments localId. */
    async selectLocalIds(localIds, options = {}) {
        return this.interactionEngine?.selectLocalIds(localIds, options) || null;
    }

    /** Resolve one IFC GlobalId to a Fragments localId. */
    async getLocalIdByGlobalId(globalId) {
        return this.semanticEngine?.getLocalIdByGlobalId(globalId) ?? null;
    }

    /** Select components by IFC GlobalId and report unresolved ids. */
    async selectGlobalIds(globalIds, options = {}) {
        const ids = (Array.isArray(globalIds) ? globalIds : [globalIds])
            .map((value) => String(value || "").trim())
            .filter(Boolean);
        if (!ids.length || !this.semanticEngine || !this.interactionEngine) {
            return {
                requestedGlobalIds: ids,
                missingGlobalIds: ids,
                selection: null
            };
        }
        const localIds = [];
        const missingGlobalIds = [];
        for (const globalId of ids) {
            const localId = await this.semanticEngine.getLocalIdByGlobalId(globalId);
            if (typeof localId === "number") {
                localIds.push(localId);
            } else {
                missingGlobalIds.push(globalId);
            }
        }
        const uniqueLocalIds = [...new Set(localIds)];
        const selection = uniqueLocalIds.length
            ? await this.interactionEngine.selectLocalIds(uniqueLocalIds, {
                primaryLocalId: options.primaryLocalId ?? uniqueLocalIds[0],
                source: options.source || "global-id"
            })
            : null;
        return {
            requestedGlobalIds: ids,
            missingGlobalIds,
            localIds: uniqueLocalIds,
            selection
        };
    }

    /**
     * Resolve a business payload into one target localId.
     * Falls back to the current primary selection when no localId/globalId is passed.
     */
    async resolveBusinessTarget(payload = {}) {
        const localId = Number(payload.localId ?? payload.id);
        if (Number.isFinite(localId)) {
            return {
                localId,
                requestedGlobalId: null
            };
        }
        const globalId = String(payload.globalId ?? payload.guid ?? "").trim();
        if (globalId) {
            const resolvedLocalId = await this.getLocalIdByGlobalId(globalId);
            if (typeof resolvedLocalId !== "number") {
                throw new Error(`No localId found for GlobalId: ${globalId}`);
            }
            return {
                localId: resolvedLocalId,
                requestedGlobalId: globalId
            };
        }
        const selection = this.getSelection();
        if (typeof selection.primaryLocalId === "number") {
            return {
                localId: selection.primaryLocalId,
                requestedGlobalId: selection.globalIds?.[0] || null
            };
        }
        throw new Error("Target component is required: pass localId/globalId or select a component first");
    }

    /** Normalize common list filters used by label and annotation stores. */
    normalizeBusinessFilter(payload = {}) {
        const nestedFilter = isObject(payload.filter) ? payload.filter : {};
        const source = isObject(payload)
            ? {
                ...nestedFilter,
                ...payload
            }
            : {};
        const filter = {};
        if (source.all === true) {
            filter.all = true;
        }
        if (Object.prototype.hasOwnProperty.call(source, "modelId")) {
            filter.modelId = source.modelId;
        }
        const localId = Number(source.localId ?? source.targetLocalId);
        if (Number.isFinite(localId)) {
            filter.localId = localId;
        }
        const globalId = String(source.globalId ?? source.guid ?? "").trim();
        if (globalId) {
            filter.globalId = globalId;
        }
        const status = String(source.status ?? "").trim();
        if (status && status !== "all") {
            filter.status = status;
        }
        return filter;
    }

    /** Return the configured business API client or throw a clear integration error. */
    requireBusinessDataClient() {
        if (!this.businessDataClient) {
            throw new Error("Business data API client is not configured");
        }
        return this.businessDataClient;
    }

    /** Replace the business API client at runtime. */
    setBusinessDataClient(client) {
        this.businessDataClient = client || null;
        return this;
    }

    /** Set business data mode: local, manual, or backend. */
    setBusinessDataMode(mode) {
        this.businessDataMode = normalizeBusinessDataMode(mode);
        return this;
    }

    /** Read current business data mode. */
    getBusinessDataMode() {
        return this.businessDataMode;
    }

    /** True when a backend client exists and mode is not local. */
    isBusinessDataBackendEnabled() {
        return this.businessDataMode !== "local" && Boolean(this.businessDataClient);
    }

    /** True when local changes should be automatically synced to backend. */
    isBusinessDataAutoSyncEnabled() {
        return this.businessDataMode === "backend" && Boolean(this.businessDataClient);
    }

    /** List backend business data for viewpoints, labels, annotations, or snapshots. */
    listBusinessData(type, filter = {}, options = {}) {
        return this.requireBusinessDataClient().list(type, filter, options);
    }

    /** Create backend business data for viewpoints, labels, annotations, or snapshots. */
    createBusinessData(type, payload = {}, options = {}) {
        return this.requireBusinessDataClient().create(type, payload, options);
    }

    /** Update backend business data by type and id. */
    updateBusinessData(type, id, patch = {}, options = {}) {
        return this.requireBusinessDataClient().update(type, id, patch, options);
    }

    /** Remove backend business data by type and id. */
    removeBusinessData(type, id, options = {}) {
        return this.requireBusinessDataClient().remove(type, id, options);
    }

    /** Add tenant/project/model/version context to a business payload. */
    withBusinessContext(payload = {}) {
        return {
            tenantId: this.options.tenantId || null,
            projectId: this.options.projectId || null,
            modelId: this.currentModel?.modelId || payload.modelId || null,
            versionId: this.options.versionId || this.currentManifest?.versionId || null,
            modelName: this.currentModelName || null,
            ...payload
        };
    }

    /** Resolve the annotation actor from payload or SDK options. */
    getCurrentAnnotationUser(payload = {}) {
        return resolveAnnotationActor(payload, this.options.userId || this.options.createdBy || "sdk-user");
    }

    /** Convert a viewer annotation into the backend annotation contract. */
    toBusinessAnnotationPayload(annotation = {}) {
        return createBusinessAnnotationPayload(annotation, this.withBusinessContext());
    }

    /** Resolve the center point of one or more localIds for bubble placement. */
    async getLocalIdsCenter(localIds) {
        const ids = (Array.isArray(localIds) ? localIds : [localIds])
            .map(Number)
            .filter(Number.isFinite);
        if (!ids.length || typeof this.currentModel?.getMergedBox !== "function") {
            return null;
        }
        const box = await this.currentModel.getMergedBox(ids);
        if (box && typeof box.isEmpty === "function" && !box.isEmpty()) {
            return box.getCenter(new THREE.Vector3());
        }
        return null;
    }

    /**
     * Create a model-bound label.
     * Accepts localId/globalId; when omitted it uses the current primary selection.
     */
    async createLabel(payload = {}) {
        if (!this.currentModel) {
            throw new Error("Model is not loaded");
        }
        const target = await this.resolveBusinessTarget(payload);
        const info = await this.getItemInfo(target.localId) || {};
        const position = toVector3(payload.position) || await this.getLocalIdsCenter([target.localId]);
        if (!position) {
            throw new Error(`Cannot resolve label position for localId ${target.localId}`);
        }
        const globalId = payload.globalId || target.requestedGlobalId || info.globalId || info.guid || null;
        const label = await this.labelEngine.addLabelForSelection({
            primaryLocalId: target.localId,
            localIds: [target.localId],
            globalIds: globalId ? [globalId] : []
        }, {
            id: payload.id || `label-${this.currentModel.modelId}-${target.localId}-${Date.now().toString(36)}`,
            title: payload.title || info.name || `localId ${target.localId}`,
            subtitle: payload.subtitle || globalId || "",
            position,
            globalId
        });
        const stored = this.labelStoreEngine.save({
            ...label,
            modelId: this.currentModel.modelId,
            modelName: this.currentModelName
        });
        this.emitSdkEvent("labelcreated", stored);
        this.viewerApp.update().catch(() => {});
        return {
            label: stored,
            state: this.getState()
        };
    }

    /** List labels from the local label store with optional model/localId/globalId filters. */
    listLabels(filter = {}) {
        const normalizedFilter = this.normalizeBusinessFilter(filter);
        const labels = this.labelStoreEngine.list(normalizedFilter).slice(0, normalizeListLimit(filter));
        return {
            labels,
            count: labels.length,
            filter: normalizedFilter
        };
    }

    /** Remove a model-bound label from store and overlay. */
    removeLabel(id) {
        const payload = isObject(id) ? id : {id};
        const key = String(payload.id || payload.labelId || "").trim();
        if (!key) {
            throw new Error("removeLabel requires id");
        }
        const removed = this.labelStoreEngine.remove(key);
        this.labelEngine.removeLabel(key);
        this.emitSdkEvent("labelremoved", {
            id: key,
            removed
        });
        this.viewerApp.update().catch(() => {});
        return {
            id: key,
            removed,
            state: this.getState()
        };
    }

    /** Push a local label into the configured business data backend. */
    async syncLabelToBusinessData(idOrLabel, options = {}) {
        const label = isObject(idOrLabel)
            ? idOrLabel
            : this.labelStoreEngine.get(idOrLabel);
        if (!label) {
            throw new Error("Label not found");
        }
        const payload = this.withBusinessContext({
            ...label,
            content: {
                subtitle: label.subtitle || ""
            }
        });
        const item = await this.createBusinessData("labels", payload, options);
        this.emitSdkEvent("businessdatasynced", {
            type: "labels",
            localId: label.id,
            item
        });
        return item;
    }

    /**
     * Create a model-bound annotation.
     * Accepts localId/globalId; when omitted it uses the current primary selection.
     */
    async createAnnotation(payload = {}) {
        if (!this.currentModel) {
            throw new Error("Model is not loaded");
        }
        const target = await this.resolveBusinessTarget(payload);
        const info = await this.getItemInfo(target.localId) || {};
        const position = toVector3(payload.position) || await this.getLocalIdsCenter([target.localId]);
        const globalId = payload.globalId || target.requestedGlobalId || info.globalId || info.guid || null;
        const title = String(payload.title || info.name || `localId ${target.localId}`).trim();
        const content = String(payload.content || payload.text || `模型批注：${title}`).trim();
        const actor = this.getCurrentAnnotationUser(payload);
        const annotation = this.annotationEngine.create({
            id: payload.id,
            modelId: this.currentModel.modelId,
            modelName: this.currentModelName,
            localId: target.localId,
            globalId,
            title,
            content,
            camera: payload.camera || this.renderEngine.getViewState(),
            selection: {
                modelId: this.currentModel.modelId,
                primaryLocalId: target.localId,
                localIds: [target.localId],
                globalIds: globalId ? [globalId] : [],
                count: 1,
                source: "sdk-create-annotation"
            },
            position: position ? vectorToArray(position) : null,
            status: payload.status || "open",
            priority: payload.priority || "normal",
            createdBy: actor,
            updatedBy: actor,
            assignee: normalizeOptionalText(payload.assignee),
            permission: normalizeAnnotationPermission(payload.permission),
            history: Array.isArray(payload.history) ? payload.history : undefined
        });
        this.emitSdkEvent("annotationcreated", annotation);
        return {
            annotation,
            state: this.getState()
        };
    }

    /** List annotations from the local annotation store with optional filters. */
    listAnnotations(filter = {}) {
        const normalizedFilter = this.normalizeBusinessFilter(filter);
        const annotations = this.annotationEngine.list(normalizedFilter).slice(0, normalizeListLimit(filter));
        return {
            annotations,
            count: annotations.length,
            filter: normalizedFilter
        };
    }

    /** Get one annotation by id or payload containing id/annotationId. */
    getAnnotation(idOrPayload) {
        const payload = isObject(idOrPayload) ? idOrPayload : {id: idOrPayload};
        const key = String(payload.id || payload.annotationId || "").trim();
        return key ? this.annotationEngine.get(key) : null;
    }

    /** Return annotation plus history array; missing annotations return an empty history. */
    getAnnotationHistory(idOrPayload) {
        const annotation = this.getAnnotation(idOrPayload);
        return {
            annotation,
            history: Array.isArray(annotation?.history) ? annotation.history : []
        };
    }

    /** Update annotation fields and append viewer-side history through AnnotationEngine. */
    updateAnnotation(idOrPayload, patch = {}, options = {}) {
        const payload = isObject(idOrPayload)
            ? idOrPayload
            : {id: idOrPayload, ...patch};
        const key = String(payload.id || payload.annotationId || "").trim();
        if (!key) {
            throw new Error("updateAnnotation requires id");
        }
        const actor = this.getCurrentAnnotationUser({
            ...payload,
            ...options
        });
        const update = createAnnotationPatch(payload, actor);
        const annotation = this.annotationEngine.update(key, update, {actor});
        if (!annotation) {
            throw new Error("Annotation not found");
        }
        this.emitSdkEvent("annotationupdated", annotation);
        return {
            annotation,
            state: this.getState()
        };
    }

    /** Remove an annotation from the local annotation store. */
    removeAnnotation(id) {
        const payload = isObject(id) ? id : {id};
        const key = String(payload.id || payload.annotationId || "").trim();
        if (!key) {
            throw new Error("removeAnnotation requires id");
        }
        const removed = this.annotationEngine.remove(key);
        this.emitSdkEvent("annotationremoved", {
            id: key,
            removed
        });
        return {
            id: key,
            removed,
            state: this.getState()
        };
    }

    /** Push a local annotation into the configured business data backend. */
    async syncAnnotationToBusinessData(idOrAnnotation, options = {}) {
        const annotation = isObject(idOrAnnotation)
            ? idOrAnnotation
            : this.annotationEngine.get(idOrAnnotation);
        if (!annotation) {
            throw new Error("Annotation not found");
        }
        const item = await this.createBusinessData("annotations", this.toBusinessAnnotationPayload(annotation), options);
        this.emitSdkEvent("businessdatasynced", {
            type: "annotations",
            localId: annotation.id,
            item
        });
        return item;
    }

    /** Hide currently selected components. */
    async hideSelected() {
        const changed = await this.interactionEngine?.hideSelected();
        if (changed) {
            this.viewerApp.update().catch(() => {});
        }
        return Boolean(changed);
    }

    /** Isolate selected components; options can choose hidden/dim modes when supported. */
    async isolateSelected(options = {}) {
        const changed = await this.interactionEngine?.isolateSelected(options);
        if (changed) {
            this.viewerApp.update().catch(() => {});
        }
        return Boolean(changed);
    }

    /** Reset hidden/isolated state for model components. */
    async showAll() {
        const changed = await this.interactionEngine?.showAll();
        if (changed) {
            this.viewerApp.update().catch(() => {});
        }
        return Boolean(changed);
    }

    /** Apply a material color override to selected components. */
    async colorSelected(color = new THREE.Color(0x6bbcff)) {
        const colorValue = isObject(color) && color.color != null && !color.isColor
            ? color.color
            : color;
        const resolvedColor = typeof colorValue === "string" || typeof colorValue === "number"
            ? new THREE.Color(colorValue)
            : colorValue;
        const changed = await this.interactionEngine?.colorSelected(resolvedColor);
        if (changed) {
            this.viewerApp.update().catch(() => {});
        }
        return Boolean(changed);
    }

    /** Clear material override on selected components. */
    async resetSelectedMaterial() {
        const changed = await this.interactionEngine?.resetSelectedColor();
        if (changed) {
            this.viewerApp.update().catch(() => {});
        }
        return Boolean(changed);
    }

    /** Set selected component opacity, clamped to 0..1. */
    async setSelectedOpacity(opacity) {
        const value = Number(opacity);
        if (!Number.isFinite(value)) {
            return false;
        }
        const changed = await this.interactionEngine?.setSelectedOpacity(Math.max(0, Math.min(1, value)));
        if (changed) {
            this.viewerApp.update().catch(() => {});
        }
        return Boolean(changed);
    }

    /** Clear current selection and emit selectionchanged through InteractionEngine. */
    async clearSelection(source = "api") {
        return this.interactionEngine?.clearSelection({source}) || null;
    }

    /** Fit the current selection into camera view. */
    async fitSelection() {
        return this.interactionEngine?.fitSelection() || false;
    }

    /** Pick one component by canvas client coordinates. */
    async pick(clientX, clientY, options = {}) {
        return this.interactionEngine?.pick(clientX, clientY, options) || null;
    }

    /** Rectangle pick components using a client-space rectangle. */
    async rectanglePick(rect) {
        return this.interactionEngine?.rectanglePick(rect) || [];
    }

    /** Create a snapshot from the current viewer canvas. */
    async takeSnapshot(options = {}) {
        return this.snapshotEngine.create({
            modelName: this.currentModelName || this.currentModel?.modelId || "bim-view",
            ...options
        });
    }

    /** Alias matching the iframe SDK snapshot method. */
    snapshot(options = {}) {
        return this.takeSnapshot(options);
    }

    /** Capture current camera and optional selection through ViewpointEngine. */
    captureViewpoint(options = {}) {
        return this.viewpointEngine.capture(options);
    }

    /** Push a captured viewpoint into the configured business data backend. */
    async syncViewpointToBusinessData(viewpoint = this.captureViewpoint({includeSelection: true}), options = {}) {
        const item = await this.createBusinessData("viewpoints", this.withBusinessContext({
            title: options.title || viewpoint?.name || "视点",
            camera: viewpoint?.camera || viewpoint?.view || viewpoint,
            selection: viewpoint?.selection || this.getSelection(),
            thumbnail: viewpoint?.thumbnail || null,
            tags: options.tags || viewpoint?.tags || [],
            content: {
                source: "sdk",
                viewpoint
            }
        }), options);
        this.emitSdkEvent("businessdatasynced", {
            type: "viewpoints",
            item
        });
        return item;
    }

    /** Restore a viewpoint/camera state captured by captureViewpoint() or getState(). */
    restoreViewpoint(state) {
        return this.viewpointEngine.restore(state);
    }

    /** Push a snapshot metadata object into the configured business data backend. */
    async syncSnapshotToBusinessData(snapshot = {}, options = {}) {
        const item = await this.createBusinessData("snapshots", this.withBusinessContext({
            title: options.title || snapshot.filename || "快照",
            camera: snapshot.camera || this.renderEngine?.getViewState() || null,
            selection: snapshot.selection || this.getSelection(),
            thumbnail: snapshot.thumbnail || snapshot.dataUrl || null,
            content: {
                source: "sdk",
                snapshot
            }
        }), options);
        this.emitSdkEvent("businessdatasynced", {
            type: "snapshots",
            item
        });
        return item;
    }

    /** Read semantic tree data by mode, for example models/classes/storeys. */
    async getTree(mode = "models") {
        return this.semanticEngine?.getTree(mode) || null;
    }

    /** Read semantic/properties information for one localId. */
    async getItemInfo(target) {
        const normalized = normalizeSdkItemTarget(target);
        let localId = normalized.localId;
        if (!Number.isFinite(localId) && normalized.globalId) {
            localId = await this.getLocalIdByGlobalId(normalized.globalId);
        }
        if (!Number.isFinite(localId)) {
            throw new Error(`No localId found for GlobalId: ${normalized.globalId}`);
        }
        return this.semanticEngine?.getItemInfo(localId) || null;
    }

    /** Read current selection summary. */
    getSelection() {
        return this.interactionEngine?.getSelection() || {
            modelId: this.currentModel?.modelId || null,
            primaryLocalId: null,
            localIds: [],
            globalIds: [],
            count: 0,
            source: "none"
        };
    }

    /** Read guaranteed portable methods and direct-rendering extensions. */
    getCapabilities() {
        return createSdkCapabilities("direct", [
            "closeModel",
            "resize",
            "dispose",
            "pick",
            "rectanglePick",
            "setCtrlLookEnabled",
            "getCtrlLookMode"
        ]);
    }

    /** Read aggregate SDK state for host persistence or diagnostics. */
    getState() {
        return {
            hasModel: Boolean(this.currentModel),
            modelId: this.currentModel?.modelId || null,
            modelName: this.currentModelName,
            manifest: this.currentManifest,
            selection: this.getSelection(),
            view: this.renderEngine?.getViewState() || null,
            ctrlLook: this.getCtrlLookMode(),
            freeInspect: this.getFreeInspectMode(),
            pathRoam: this.getPathRoamMode()
        };
    }

    /** Resize renderer and cameras after container layout changes. */
    resize() {
        this.renderEngine?.resize();
    }

    /** Dispose active loops and renderer resources. Do not reuse after dispose(). */
    dispose() {
        this.setFreeInspectMode(false, {dispatch: false});
        this.stopPathRoam({dispatch: false});
        this.unbindCtrlLookControls();
        this.cameraControlManager?.dispose();
        this.renderEngine?.dispose();
        this.currentModel = null;
        this.currentManifest = null;
        this.currentModelName = null;
        this.semanticEngine = null;
        this.interactionEngine = null;
    }
}
