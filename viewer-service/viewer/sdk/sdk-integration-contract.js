export const SDK_INTEGRATION_SCHEMA_VERSION = "bim-viewer-sdk-integration/v1";

export const PORTABLE_SDK_METHOD_GROUPS = Object.freeze({
    model: Object.freeze([
        "openModel",
        "fitModel",
        "fitSelection",
        "getTree"
    ]),
    camera: Object.freeze([
        "setView",
        "setViewpoint",
        "restoreViewpoint",
        "captureViewpoint"
    ]),
    selection: Object.freeze([
        "selectLocalIds",
        "selectGlobalIds",
        "getItemInfo",
        "getSelection",
        "hideSelected",
        "isolateSelected",
        "colorSelected",
        "resetSelectedMaterial",
        "setSelectedOpacity",
        "showAll",
        "clearSelection"
    ]),
    freeInspect: Object.freeze([
        "setFreeInspectMode",
        "toggleFreeInspectMode",
        "getFreeInspectMode",
        "setFreeInspectSpeed"
    ]),
    pathRoam: Object.freeze([
        "listPathRoamRoutes",
        "createPathRoamRoute",
        "switchPathRoamRoute",
        "savePathRoamRoute",
        "deletePathRoamRoute",
        "setPathRoamSpeed",
        "listPathRoamPoints",
        "addPathRoamPoint",
        "restorePathRoamPoint",
        "deletePathRoamPoint",
        "updatePathRoamPoint",
        "recapturePathRoamPoint",
        "movePathRoamPoint",
        "playPathRoam",
        "pausePathRoam",
        "stopPathRoam",
        "clearPathRoam",
        "getPathRoamMode"
    ]),
    businessData: Object.freeze([
        "createLabel",
        "listLabels",
        "removeLabel",
        "createAnnotation",
        "updateAnnotation",
        "listAnnotations",
        "getAnnotationHistory",
        "removeAnnotation"
    ]),
    snapshot: Object.freeze([
        "snapshot",
        "takeSnapshot"
    ]),
    state: Object.freeze([
        "getState",
        "getCapabilities"
    ])
});

export const PORTABLE_SDK_METHODS = Object.freeze([
    ...new Set(Object.values(PORTABLE_SDK_METHOD_GROUPS).flat())
]);

/** Return serializable capability metadata for one SDK integration entry. */
export function createSdkCapabilities(integration, extensions = []) {
    return {
        schemaVersion: SDK_INTEGRATION_SCHEMA_VERSION,
        integration: String(integration || "unknown"),
        methods: [...PORTABLE_SDK_METHODS],
        methodGroups: Object.fromEntries(
            Object.entries(PORTABLE_SDK_METHOD_GROUPS)
                .map(([group, methods]) => [group, [...methods]])
        ),
        extensions: [...new Set((extensions || []).map(String).filter(Boolean))]
    };
}

/** Normalize a localId/globalId item target shared by iframe and direct SDKs. */
export function normalizeSdkItemTarget(target) {
    if (target && typeof target === "object" && !Array.isArray(target)) {
        const payload = {...target};
        const localId = Number(payload.localId ?? payload.id);
        if (Number.isFinite(localId)) {
            payload.localId = localId;
            return payload;
        }
        const globalId = String(payload.globalId ?? payload.guid ?? "").trim();
        if (globalId) {
            payload.globalId = globalId;
            return payload;
        }
    } else {
        const numeric = Number(target);
        if (Number.isFinite(numeric) && String(target).trim() !== "") {
            return {localId: numeric};
        }
        const globalId = String(target ?? "").trim();
        if (globalId) {
            return {globalId};
        }
    }
    throw new Error("Item target requires localId or globalId");
}
