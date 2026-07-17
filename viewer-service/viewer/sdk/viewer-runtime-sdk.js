import {createSdkCommandEvent} from "./sdk-event-contract.js";

/**
 * Lightweight SDK facade for a Viewer runtime that already owns its render,
 * model, and interaction engines. It never creates a canvas or loads a model.
 */
export class ViewerRuntimeSDK extends EventTarget {
    constructor(options = {}) {
        super();
        this.handlers = new Map();
        this.setHandlers(options.handlers || {});
    }

    setHandlers(handlers = {}) {
        for (const [command, handler] of Object.entries(handlers)) {
            if (typeof handler === "function") {
                this.handlers.set(command, handler);
            }
        }
        return this;
    }

    getSupportedCommands() {
        return [...this.handlers.keys()].sort();
    }

    async execute(command, payload = {}, context = {}) {
        const handler = this.handlers.get(command);
        if (!handler) {
            throw new Error(`Unsupported Viewer runtime command: ${command}`);
        }
        const startedAt = Date.now();
        const startEvent = createSdkCommandEvent({
            event: "commandstart",
            command,
            commandId: context.commandId || undefined,
            status: "started",
            source: "runtime-sdk",
            timestamp: startedAt,
            startedAt,
            payload,
            legacyFields: {context}
        });
        const commandId = startEvent.commandId;
        this.dispatchEvent(new CustomEvent("commandstart", {
            detail: startEvent
        }));
        try {
            const result = await handler(payload, context);
            const finishedAt = Date.now();
            this.dispatchEvent(new CustomEvent("commandcomplete", {
                detail: createSdkCommandEvent({
                    event: "commandcomplete",
                    command,
                    commandId,
                    status: "completed",
                    source: "runtime-sdk",
                    timestamp: finishedAt,
                    startedAt,
                    finishedAt,
                    payload,
                    result,
                    legacyFields: {context}
                })
            }));
            return result;
        } catch (error) {
            const finishedAt = Date.now();
            this.dispatchEvent(new CustomEvent("commanderror", {
                detail: createSdkCommandEvent({
                    event: "commanderror",
                    command,
                    commandId,
                    status: "failed",
                    source: "runtime-sdk",
                    timestamp: finishedAt,
                    startedAt,
                    finishedAt,
                    payload,
                    error,
                    legacyFields: {context, originalError: error}
                })
            }));
            throw error;
        }
    }

    /** Load or replace a model through the active Viewer runtime lifecycle. */
    openModel(source = {}, context = {}) {
        return this.execute("openModel", source, context);
    }

    listModels(context = {}) {
        return this.execute("listModels", {}, context);
    }

    activateModel(modelId, options = {}, context = {}) {
        return this.execute("activateModel", {modelId, ...options}, context);
    }

    fitManagedModel(modelId, context = {}) {
        return this.execute("fitManagedModel", {modelId}, context);
    }

    setModelVisibility(modelId, visible, context = {}) {
        return this.execute("setModelVisibility", {modelId, visible}, context);
    }

    unloadModel(modelId, context = {}) {
        return this.execute("unloadModel", {modelId}, context);
    }

    overlayModels(context = {}) {
        return this.execute("overlayModels", {}, context);
    }

    spreadModels(context = {}) {
        return this.execute("spreadModels", {}, context);
    }

    resetModelsPlacement(context = {}) {
        return this.execute("resetModelsPlacement", {}, context);
    }

    loadCompareModel(source = {}, context = {}) {
        return this.execute("loadCompareModel", source, context);
    }

    clearCompareModel(options = {}, context = {}) {
        return this.execute("clearCompareModel", options, context);
    }

    runVersionCompare(context = {}) {
        return this.execute("runVersionCompare", {}, context);
    }

    cancelVersionCompare(context = {}) {
        return this.execute("cancelVersionCompare", {}, context);
    }

    toggleCompareViewLinked(context = {}) {
        return this.execute("toggleCompareViewLinked", {}, context);
    }

    getVersionCompareState(context = {}) {
        return this.execute("getVersionCompareState", {}, context);
    }

    snapshot(options = {}, context = {}) {
        return this.execute("snapshot", options, context);
    }

    saveCurrentView(context = {}) {
        return this.execute("saveCurrentView", {}, context);
    }

    restoreLatestView(context = {}) {
        return this.execute("restoreLatestView", {}, context);
    }

    listViews(context = {}) {
        return this.execute("listViews", {}, context);
    }

    saveStoredView(context = {}) {
        return this.execute("saveStoredView", {}, context);
    }

    updateStoredView(id, patch = {}, context = {}) {
        return this.execute("updateStoredView", {id, ...patch}, context);
    }

    restoreStoredView(id, context = {}) {
        return this.execute("restoreStoredView", {id}, context);
    }

    removeStoredView(id, context = {}) {
        return this.execute("removeStoredView", {id}, context);
    }

    fitModel(context = {}) {
        return this.execute("fitModel", {}, context);
    }

    fitSelection(context = {}) {
        return this.execute("fitSelection", {}, context);
    }

    setView(view, context = {}) {
        return this.execute("setView", {view}, context);
    }

    setViewpoint(viewpoint, context = {}) {
        return this.execute("setViewpoint", {viewpoint}, context);
    }

    selectLocalIds(localIds, options = {}, context = {}) {
        return this.execute("selectLocalIds", {localIds, ...options}, context);
    }

    selectGlobalIds(globalIds, options = {}, context = {}) {
        return this.execute("selectGlobalIds", {globalIds, ...options}, context);
    }

    getItemInfo(target, context = {}) {
        const payload = target && typeof target === "object" ? target : {localId: target};
        return this.execute("getItemInfo", payload, context);
    }

    getTree(mode = "models", context = {}) {
        return this.execute("getTree", {mode}, context);
    }

    hideSelected(context = {}) {
        return this.execute("hideSelected", {}, context);
    }

    isolateSelected(options = {}, context = {}) {
        return this.execute("isolateSelected", options, context);
    }

    colorSelected(color = null, context = {}) {
        const payload = color && typeof color === "object" && !Array.isArray(color)
            ? color
            : {color};
        return this.execute("colorSelected", payload, context);
    }

    resetSelectedMaterial(context = {}) {
        return this.execute("resetSelectedMaterial", {}, context);
    }

    setSelectedOpacity(opacity, context = {}) {
        return this.execute("setSelectedOpacity", {opacity}, context);
    }

    showAll(context = {}) {
        return this.execute("showAll", {}, context);
    }

    clearSelection(context = {}) {
        return this.execute("clearSelection", {}, context);
    }

    /** Enable or disable WASD free-inspect mode. */
    setFreeInspectMode(enabled, options = {}, context = {}) {
        return this.execute("setFreeInspectMode", {enabled, ...options}, context);
    }

    /** Toggle WASD free-inspect mode. */
    toggleFreeInspectMode(options = {}, context = {}) {
        return this.execute("toggleFreeInspectMode", options, context);
    }

    /** Read free-inspect mode and movement speed state. */
    getFreeInspectMode(context = {}) {
        return this.execute("getFreeInspectMode", {}, context);
    }

    /** Set the free-inspect movement multiplier. */
    setFreeInspectSpeed(speedMultiplier, options = {}, context = {}) {
        return this.execute("setFreeInspectSpeed", {speedMultiplier, ...options}, context);
    }

    /** Open or close the path-roam viewport panel. */
    openPathRoamPanel(open, options = {}, context = {}) {
        return this.execute("openPathRoamPanel", {open, ...options}, context);
    }

    listPathRoamRoutes(context = {}) {
        return this.execute("listPathRoamRoutes", {}, context);
    }

    createPathRoamRoute(options = {}, context = {}) {
        return this.execute("createPathRoamRoute", options, context);
    }

    switchPathRoamRoute(routeId, context = {}) {
        return this.execute("switchPathRoamRoute", {routeId}, context);
    }

    savePathRoamRoute(options = {}, context = {}) {
        return this.execute("savePathRoamRoute", options, context);
    }

    deletePathRoamRoute(routeId = null, context = {}) {
        return this.execute("deletePathRoamRoute", {routeId}, context);
    }

    setPathRoamSpeed(speedMultiplier, options = {}, context = {}) {
        return this.execute("setPathRoamSpeed", {speedMultiplier, ...options}, context);
    }

    listPathRoamPoints(context = {}) {
        return this.execute("listPathRoamPoints", {}, context);
    }

    addPathRoamPoint(options = {}, context = {}) {
        return this.execute("addPathRoamPoint", options, context);
    }

    restorePathRoamPoint(pointId, context = {}) {
        return this.execute("restorePathRoamPoint", {pointId}, context);
    }

    deletePathRoamPoint(pointId, context = {}) {
        return this.execute("deletePathRoamPoint", {pointId}, context);
    }

    updatePathRoamPoint(pointId, patch = {}, context = {}) {
        return this.execute("updatePathRoamPoint", {pointId, ...patch}, context);
    }

    recapturePathRoamPoint(pointId, context = {}) {
        return this.execute("recapturePathRoamPoint", {pointId}, context);
    }

    movePathRoamPoint(pointId, direction, context = {}) {
        return this.execute("movePathRoamPoint", {pointId, direction}, context);
    }

    playPathRoam(context = {}) {
        return this.execute("playPathRoam", {}, context);
    }

    pausePathRoam(context = {}) {
        return this.execute("pausePathRoam", {}, context);
    }

    togglePathRoamPlayback(context = {}) {
        return this.execute("togglePathRoamPlayback", {}, context);
    }

    stopPathRoam(options = {}, context = {}) {
        return this.execute("stopPathRoam", options, context);
    }

    clearPathRoam(context = {}) {
        return this.execute("clearPathRoam", {}, context);
    }

    getPathRoamMode(context = {}) {
        return this.execute("getPathRoamMode", {}, context);
    }

    /** Create a model-bound label from a localId or GlobalId payload. */
    createLabel(payload = {}, context = {}) {
        return this.execute("createLabel", payload, context);
    }

    listLabels(filter = {}, context = {}) {
        return this.execute("listLabels", filter, context);
    }

    removeLabel(id, context = {}) {
        return this.execute("removeLabel", {id}, context);
    }

    /** Create a model-bound annotation from a localId or GlobalId payload. */
    createAnnotation(payload = {}, context = {}) {
        return this.execute("createAnnotation", payload, context);
    }

    updateAnnotation(id, patch = {}, context = {}) {
        return this.execute("updateAnnotation", {id, ...patch}, context);
    }

    listAnnotations(filter = {}, context = {}) {
        return this.execute("listAnnotations", filter, context);
    }

    getAnnotationHistory(id, context = {}) {
        return this.execute("getAnnotationHistory", {id}, context);
    }

    removeAnnotation(id, context = {}) {
        return this.execute("removeAnnotation", {id}, context);
    }

    getState(context = {}) {
        return this.execute("getState", {}, context);
    }
}
