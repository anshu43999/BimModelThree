import {EMBED_PROTOCOL, SUPPORTED_COMMANDS, VIEWER_TARGET} from "../app/bind-embed-bridge.js";
import {
    createSdkCapabilities,
    normalizeSdkItemTarget
} from "./sdk-integration-contract.js";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TARGET_ORIGIN = "*";

const RESOLVE_EVENT_BY_COMMAND = {
    openModel: "modelLoaded",
    snapshot: "snapshotCreated",
    getState: "state"
};

const REJECT_EVENT_BY_COMMAND = {
    openModel: "modelLoadFailed",
    snapshot: "snapshotFailed"
};

function createRequestId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `embed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFrame(frameOrWindow) {
    if (!frameOrWindow) {
        throw new Error("BimViewerEmbedClient requires iframe or contentWindow");
    }
    if (frameOrWindow.contentWindow) {
        return {
            frame: frameOrWindow,
            window: frameOrWindow.contentWindow
        };
    }
    return {
        frame: null,
        window: frameOrWindow
    };
}

function errorFromPayload(payload, fallback = "BIM Viewer command failed") {
    const message = payload?.error?.message || payload?.message || payload?.reason || fallback;
    const error = new Error(String(message));
    error.payload = payload || {};
    return error;
}

function isViewerMessage(message) {
    return Boolean(
        message
        && typeof message === "object"
        && message.protocol === EMBED_PROTOCOL
        && message.source === "bim-viewer"
    );
}

/**
 * Host-side iframe SDK client.
 *
 * Use this class from a business system page that embeds /viewer/index.html in
 * an iframe. Public methods send postMessage commands to the viewer and return
 * promises resolved by bridge response events.
 *
 * Events forwarded from the viewer:
 * - ready
 * - modelLoaded / modelLoadFailed
 * - selectionChanged
 * - commandCompleted / commandFailed / commandRejected
 * - state
 */
export class BimViewerEmbedClient extends EventTarget {
    /**
     * Create and start a client in one call.
     * @param {object} options Same options accepted by the constructor.
     * @returns {BimViewerEmbedClient}
     */
    static create(options = {}) {
        return new BimViewerEmbedClient(options).start();
    }

    /**
     * @param {object} options
     * @param {HTMLIFrameElement} [options.iframe] Viewer iframe element.
     * @param {HTMLIFrameElement} [options.frame] Alias for iframe.
     * @param {Window} [options.contentWindow] Viewer window when iframe is not available.
     * @param {Window} [options.window] Alias for contentWindow.
     * @param {Window} [options.hostWindow] Window receiving viewer events.
     * @param {string} [options.targetOrigin="*"] Origin used when posting commands.
     * @param {string} [options.allowedOrigin] Origin accepted for viewer events.
     * @param {number} [options.timeoutMs=30000] Default command timeout.
     */
    constructor(options = {}) {
        super();
        const target = normalizeFrame(options.iframe || options.frame || options.contentWindow || options.window);
        this.frame = target.frame;
        this.viewerWindow = target.window;
        this.hostWindow = options.hostWindow || globalThis.window;
        this.targetOrigin = options.targetOrigin || DEFAULT_TARGET_ORIGIN;
        this.allowedOrigin = options.allowedOrigin || options.targetOrigin || DEFAULT_TARGET_ORIGIN;
        this.defaultTimeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
        this.pending = new Map();
        this.started = false;
        this.ready = false;
        this.onMessage = this.onMessage.bind(this);
    }

    /** Start listening for viewer postMessage events. */
    start() {
        if (!this.hostWindow || this.started) {
            return this;
        }
        this.hostWindow.addEventListener("message", this.onMessage);
        this.started = true;
        return this;
    }

    /** Stop listening for viewer events and reject all pending commands. */
    stop() {
        if (!this.hostWindow || !this.started) {
            return this;
        }
        this.hostWindow.removeEventListener("message", this.onMessage);
        this.started = false;
        for (const [requestId, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`BIM Viewer request cancelled: ${requestId}`));
        }
        this.pending.clear();
        return this;
    }

    /** Return whether a viewer event origin is accepted by this client. */
    isAllowedOrigin(origin) {
        return this.allowedOrigin === "*" || origin === this.allowedOrigin;
    }

    /**
     * Wait until the embedded viewer sends ready or responds to getState().
     * @param {object} [options]
     * @param {number} [options.timeoutMs] Override wait timeout.
     */
    waitReady(options = {}) {
        if (this.ready) {
            return Promise.resolve(true);
        }
        return new Promise((resolve, reject) => {
            const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : this.defaultTimeoutMs;
            let settled = false;
            let probing = false;
            let probeTimer = null;
            const finish = (callback, value) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                clearInterval(probeTimer);
                this.removeEventListener("ready", onReady);
                callback(value);
            };
            const onReady = () => {
                finish(resolve, true);
            };
            const timer = setTimeout(() => {
                finish(reject, new Error("BIM Viewer ready timeout"));
            }, timeoutMs);
            this.addEventListener("ready", onReady);
            const probeReady = () => {
                if (settled || probing) {
                    return;
                }
                probing = true;
                this.getState({timeoutMs: 1200})
                    .then(() => {
                        this.ready = true;
                        finish(resolve, true);
                    })
                    .catch(() => {})
                    .finally(() => {
                        probing = false;
                    });
            };
            probeTimer = setInterval(probeReady, 600);
            probeReady();
        });
    }

    /**
     * Low-level command sender used by all convenience methods.
     * Prefer the typed methods below unless adding a new bridge command.
     *
     * @param {string} type One of SUPPORTED_COMMANDS.
     * @param {object} payload Serializable command payload.
     * @param {object} [options]
     * @param {string} [options.requestId] Custom request id for tracing.
     * @param {number} [options.timeoutMs] Command timeout override.
     */
    sendCommand(type, payload = {}, options = {}) {
        if (!SUPPORTED_COMMANDS.includes(type)) {
            return Promise.reject(new Error(`Unsupported BIM Viewer command: ${type}`));
        }
        const requestId = options.requestId || createRequestId();
        const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : this.defaultTimeoutMs;
        const resolveType = RESOLVE_EVENT_BY_COMMAND[type] || "commandCompleted";
        const rejectType = REJECT_EVENT_BY_COMMAND[type] || "commandFailed";

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error(`BIM Viewer command timeout: ${type}`));
            }, timeoutMs);
            this.pending.set(requestId, {
                type,
                resolveType,
                rejectType,
                resolve,
                reject,
                timer
            });
            this.viewerWindow.postMessage({
                protocol: EMBED_PROTOCOL,
                target: VIEWER_TARGET,
                type,
                requestId,
                payload: payload || {}
            }, this.targetOrigin);
        });
    }

    /** Load a model by manifestUrl, fragUrl, or manifest payload. */
    openModel(payload = {}, options = {}) {
        return this.sendCommand("openModel", payload, options);
    }

    /** Fit the current model bounds into the viewer camera. */
    fitModel(options = {}) {
        return this.sendCommand("fitModel", {}, options);
    }

    /** Fit the current selection into the viewer camera. */
    fitSelection(options = {}) {
        return this.sendCommand("fitSelection", {}, options);
    }

    /** Switch to a named view such as iso/top/front/left/right. */
    setView(view, options = {}) {
        const payload = typeof view === "string" ? {view} : (view || {});
        return this.sendCommand("setView", payload, options);
    }

    /** Restore a captured camera/viewpoint object. */
    setViewpoint(viewpoint, options = {}) {
        const payload = viewpoint?.camera || viewpoint?.view
            ? viewpoint
            : {view: viewpoint};
        return this.sendCommand("setViewpoint", payload, options);
    }

    /** Alias matching the direct SDK viewpoint restore method. */
    async restoreViewpoint(viewpoint, options = {}) {
        await this.setViewpoint(viewpoint, options);
        return true;
    }

    /** Enable or disable WASD free inspect mode in the viewer. */
    setFreeInspectMode(enabled = true, options = {}) {
        return this.sendCommand("setFreeInspectMode", {
            enabled: Boolean(enabled),
            silent: options.silent === true
        }, options);
    }

    /** Toggle WASD free inspect mode and return its current state. */
    toggleFreeInspectMode(options = {}) {
        return this.sendCommand("toggleFreeInspectMode", {
            silent: options.silent === true
        }, options);
    }

    /** Read current free inspect availability, enabled state, and controls. */
    getFreeInspectMode(options = {}) {
        return this.sendCommand("getFreeInspectMode", {}, options);
    }

    /** Set the iframe viewer WASD movement speed multiplier. */
    setFreeInspectSpeed(speedMultiplier = 0.2, options = {}) {
        return this.sendCommand("setFreeInspectSpeed", {
            speedMultiplier,
            silent: options.silent === true
        }, options);
    }

    /** Open or close the viewer path roam panel. */
    openPathRoamPanel(open = true, options = {}) {
        return this.sendCommand("openPathRoamPanel", {
            open: open !== false,
            silent: options.silent === true
        }, options);
    }

    /** List saved path roam routes for the current model. */
    listPathRoamRoutes(options = {}) {
        return this.sendCommand("listPathRoamRoutes", {}, options);
    }

    /** Create a new path roam route and make it active. */
    createPathRoamRoute(payload = {}, options = {}) {
        return this.sendCommand("createPathRoamRoute", {
            name: payload.name
        }, options);
    }

    /** Switch the active path roam route by route id. */
    switchPathRoamRoute(routeId, options = {}) {
        return this.sendCommand("switchPathRoamRoute", {
            routeId
        }, options);
    }

    /** Rename/save the active path roam route metadata. */
    savePathRoamRoute(payload = {}, options = {}) {
        return this.sendCommand("savePathRoamRoute", {
            name: payload.name
        }, options);
    }

    /** Delete a route; null deletes the active route when allowed. */
    deletePathRoamRoute(routeId = null, options = {}) {
        return this.sendCommand("deletePathRoamRoute", {
            routeId
        }, options);
    }

    /** Set path roam playback speed multiplier. */
    setPathRoamSpeed(speedMultiplier = 1, options = {}) {
        return this.sendCommand("setPathRoamSpeed", {
            speedMultiplier,
            silent: options.silent === true
        }, options);
    }

    /** List keyframes/points in the active path roam route. */
    listPathRoamPoints(options = {}) {
        return this.sendCommand("listPathRoamPoints", {}, options);
    }

    /** Add the current viewer camera as a path roam keyframe. */
    addPathRoamPoint(options = {}) {
        return this.sendCommand("addPathRoamPoint", {
            name: options.name,
            time: options.time,
            states: options.states
        }, options);
    }

    /** Restore the viewer to a path roam keyframe. */
    restorePathRoamPoint(pointId, options = {}) {
        return this.sendCommand("restorePathRoamPoint", {
            pointId
        }, options);
    }

    /** Delete a path roam keyframe from the active route. */
    deletePathRoamPoint(pointId, options = {}) {
        return this.sendCommand("deletePathRoamPoint", {
            pointId
        }, options);
    }

    /** Update path roam keyframe name or timeline time. */
    updatePathRoamPoint(pointId, patch = {}, options = {}) {
        return this.sendCommand("updatePathRoamPoint", {
            pointId,
            name: patch.name,
            time: patch.time
        }, options);
    }

    /** Replace a keyframe camera with the current viewer camera. */
    recapturePathRoamPoint(pointId, options = {}) {
        return this.sendCommand("recapturePathRoamPoint", {
            pointId
        }, options);
    }

    /** Move a keyframe by direction: -1 moves up, 1 moves down. */
    movePathRoamPoint(pointId, direction, options = {}) {
        return this.sendCommand("movePathRoamPoint", {
            pointId,
            direction
        }, options);
    }

    /** Start path roam playback. */
    playPathRoam(options = {}) {
        return this.sendCommand("playPathRoam", {}, options);
    }

    /** Pause path roam playback and keep the elapsed position. */
    pausePathRoam(options = {}) {
        return this.sendCommand("pausePathRoam", {}, options);
    }

    /** Stop path roam playback. */
    stopPathRoam(options = {}) {
        return this.sendCommand("stopPathRoam", {}, options);
    }

    /** Clear all keyframes from the active route. */
    clearPathRoam(options = {}) {
        return this.sendCommand("clearPathRoam", {}, options);
    }

    /** Read current path roam playback and route state. */
    getPathRoamMode(options = {}) {
        return this.sendCommand("getPathRoamMode", {}, options);
    }

    /** Capture the current iframe viewer state as a viewpoint object. */
    async captureViewpoint(options = {}) {
        const state = await this.getState(options);
        return {
            schemaVersion: "bim-viewpoint/v1",
            createdAt: new Date().toISOString(),
            camera: state.view || null,
            selection: state.selection || null
        };
    }

    /** Select components by Fragments localId. */
    selectLocalIds(localIds, options = {}) {
        const ids = Array.isArray(localIds) ? localIds : [localIds];
        return this.sendCommand("selectLocalIds", {
            localIds: ids,
            primaryLocalId: options.primaryLocalId,
            source: options.source || "embed-client"
        }, options);
    }

    /** Select components by IFC GlobalId; unresolved ids are returned by viewer. */
    selectGlobalIds(globalIds, options = {}) {
        const ids = Array.isArray(globalIds) ? globalIds : [globalIds];
        return this.sendCommand("selectGlobalIds", {
            globalIds: ids,
            source: options.source || "embed-client"
        }, options);
    }

    /** Query semantic/properties data by localId or globalId. */
    getItemInfo(target, options = {}) {
        return this.sendCommand("getItemInfo", normalizeSdkItemTarget(target), options);
    }

    /** Read a semantic tree by models/classes/storeys mode. */
    async getTree(mode = "models", options = {}) {
        const result = await this.sendCommand("getTree", {mode}, options);
        return result?.tree ?? result;
    }

    /** Read only the current selection using the portable SDK shape. */
    async getSelection(options = {}) {
        const state = await this.getState(options);
        return state?.selection || null;
    }

    /** Hide currently selected components. */
    hideSelected(options = {}) {
        return this.sendCommand("hideSelected", {}, options);
    }

    /** Isolate selected components; mode supports hide or dim with opacity. */
    isolateSelected(isolation = {}, options = {}) {
        const hasIsolationOptions = isolation?.mode != null
            || isolation?.opacity != null
            || isolation?.restoreVisibility != null;
        const payload = hasIsolationOptions ? {
            mode: isolation.mode,
            opacity: isolation.opacity,
            restoreVisibility: isolation.restoreVisibility
        } : {};
        return this.sendCommand("isolateSelected", payload, hasIsolationOptions ? options : isolation);
    }

    /** Apply a color override; omit color to use the viewer color cycle. */
    colorSelected(colorOrOptions = {}, options = {}) {
        const hasColor = typeof colorOrOptions === "string"
            || typeof colorOrOptions === "number"
            || colorOrOptions?.color != null;
        const color = colorOrOptions?.color ?? colorOrOptions;
        return this.sendCommand("colorSelected", hasColor ? {color} : {}, hasColor ? options : colorOrOptions);
    }

    /** Reset selected component color and opacity overrides. */
    resetSelectedMaterial(options = {}) {
        return this.sendCommand("resetSelectedMaterial", {}, options);
    }

    /** Set selected component opacity, clamped by the viewer to 0..1. */
    setSelectedOpacity(opacity, options = {}) {
        return this.sendCommand("setSelectedOpacity", {opacity}, options);
    }

    /** Reset visibility/material overrides for all components. */
    showAll(options = {}) {
        return this.sendCommand("showAll", {}, options);
    }

    /** Create a model-bound label in the viewer. */
    createLabel(payload = {}, options = {}) {
        return this.sendCommand("createLabel", payload, options);
    }

    /** Create a model-bound annotation in the viewer. */
    createAnnotation(payload = {}, options = {}) {
        return this.sendCommand("createAnnotation", payload, options);
    }

    /** Update an annotation by id or by a payload containing id/annotationId. */
    updateAnnotation(idOrPayload, patch = {}, options = {}) {
        const payload = idOrPayload && typeof idOrPayload === "object" && !Array.isArray(idOrPayload)
            ? idOrPayload
            : {id: idOrPayload, ...patch};
        return this.sendCommand("updateAnnotation", payload, options);
    }

    /** List labels, optionally filtered by localId/globalId/status/modelId. */
    listLabels(filter = {}, options = {}) {
        return this.sendCommand("listLabels", filter, options);
    }

    /** List annotations, optionally filtered by localId/globalId/status/modelId. */
    listAnnotations(filter = {}, options = {}) {
        return this.sendCommand("listAnnotations", filter, options);
    }

    /** Read annotation history records kept by the viewer-side annotation store. */
    getAnnotationHistory(id, options = {}) {
        const payload = id && typeof id === "object" && !Array.isArray(id)
            ? id
            : {id};
        return this.sendCommand("getAnnotationHistory", payload, options);
    }

    /** Remove a label by id or payload containing id/labelId. */
    removeLabel(id, options = {}) {
        const payload = id && typeof id === "object" && !Array.isArray(id)
            ? id
            : {id};
        return this.sendCommand("removeLabel", payload, options);
    }

    /** Remove an annotation by id or payload containing id/annotationId. */
    removeAnnotation(id, options = {}) {
        const payload = id && typeof id === "object" && !Array.isArray(id)
            ? id
            : {id};
        return this.sendCommand("removeAnnotation", payload, options);
    }

    /** Clear the current viewer selection. */
    clearSelection(options = {}) {
        return this.sendCommand("clearSelection", {}, options);
    }

    /** Capture a viewer snapshot; payload may include download/filename. */
    snapshot(payload = {}, options = {}) {
        return this.sendCommand("snapshot", payload, options);
    }

    /** Alias matching the direct SDK snapshot method. */
    async takeSnapshot(payload = {}, options = {}) {
        const result = await this.snapshot(payload, options);
        return result?.snapshot ?? result;
    }

    /** Read locally guaranteed portable methods and iframe-only extensions. */
    getCapabilities() {
        return createSdkCapabilities("iframe", ["openPathRoamPanel", "waitReady", "sendCommand"]);
    }

    /** Read the viewer aggregate state: model, selection, camera, modes. */
    getState(options = {}) {
        return this.sendCommand("getState", {}, options);
    }

    /** Handle and re-emit viewer postMessage events. */
    onMessage(event) {
        const message = event.data;
        if (!isViewerMessage(message) || !this.isAllowedOrigin(event.origin)) {
            return;
        }
        const requestId = message.requestId || null;
        const payload = message.payload || {};
        this.dispatchEvent(new CustomEvent(message.type, {detail: payload}));

        if (message.type === "ready") {
            this.ready = true;
            return;
        }

        if (!requestId || !this.pending.has(requestId)) {
            return;
        }

        const pending = this.pending.get(requestId);
        if (message.type === pending.rejectType || message.type === "commandFailed" || message.type === "commandRejected") {
            this.completeRequest(requestId, () => pending.reject(errorFromPayload(payload)));
            return;
        }
        if (message.type === pending.resolveType || (message.type === "commandCompleted" && pending.resolveType === "commandCompleted")) {
            const result = message.type === "commandCompleted"
                ? payload.result ?? payload
                : payload;
            this.completeRequest(requestId, () => pending.resolve(result));
        }
    }

    /** Resolve or reject a pending command promise and clear its timeout. */
    completeRequest(requestId, complete) {
        const pending = this.pending.get(requestId);
        if (!pending) {
            return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        complete();
    }
}
