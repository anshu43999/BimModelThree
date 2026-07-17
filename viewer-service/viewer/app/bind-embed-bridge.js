import {
    SDK_EVENT_SCHEMA_VERSION,
    createSdkCommandEvent,
    createSdkEvent
} from "../sdk/sdk-event-contract.js";

export const EMBED_PROTOCOL = "bim-viewer:v1";
export const VIEWER_TARGET = "bim-viewer";
export const VIEWER_SOURCE = "bim-viewer";

/**
 * Commands accepted by the iframe bridge.
 *
 * Keep this list aligned with:
 * - BimViewerEmbedClient public methods in viewer/sdk/embed-client.js
 * - the handler map passed to bindEmbedBridge() in viewer/main-mvp.js
 */
const SUPPORTED_COMMANDS = [
    // Model and camera.
    "openModel",
    "fitModel",
    "fitSelection",
    "setView",
    "setViewpoint",

    // Free inspect mode.
    "setFreeInspectMode",
    "toggleFreeInspectMode",
    "getFreeInspectMode",
    "setFreeInspectSpeed",

    // Path roam and custom keyframes.
    "openPathRoamPanel",
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
    "getPathRoamMode",

    // Selection and element operations.
    "selectLocalIds",
    "selectGlobalIds",
    "getItemInfo",
    "getTree",
    "hideSelected",
    "isolateSelected",
    "colorSelected",
    "resetSelectedMaterial",
    "setSelectedOpacity",
    "showAll",

    // Business overlay data.
    "createLabel",
    "createAnnotation",
    "updateAnnotation",
    "listLabels",
    "listAnnotations",
    "getAnnotationHistory",
    "removeLabel",
    "removeAnnotation",
    "clearSelection",

    // Snapshot and state.
    "snapshot",
    "getState"
];

const DEFAULT_HANDLERS = Object.freeze({});

function toArray(value) {
    if (value == null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function isPlainMessage(message) {
    return Boolean(message && typeof message === "object");
}

function normalizeOriginList(value) {
    const origins = toArray(value)
        .filter((origin) => typeof origin === "string")
        .map((origin) => origin.trim())
        .filter(Boolean);

    return origins.length > 0 ? origins : ["*"];
}

function createEventMessage(type, payload, requestId) {
    return {
        protocol: EMBED_PROTOCOL,
        source: VIEWER_SOURCE,
        type,
        requestId: requestId || null,
        payload: payload || {}
    };
}

/**
 * Viewer-side postMessage bridge.
 *
 * The bridge runs inside /viewer/index.html and receives commands from a host
 * page. It validates protocol, target, origin, and command support before
 * calling the handler map supplied by the viewer application.
 *
 * Outgoing events posted to the host:
 * - ready: viewer has initialized.
 * - modelLoaded/modelLoadFailed: model load lifecycle.
 * - selectionChanged: selected localIds/globalIds changed.
 * - commandCompleted/commandFailed/commandRejected: generic command response.
 * - state: getState response payload.
 */
export class EmbedBridge {
    /**
     * @param {object} options
     * @param {Window} [options.window] Current viewer window.
     * @param {Window} [options.parentWindow] Host window receiving events.
     * @param {Record<string, Function>} [options.handlers] Command handler map.
     * @param {string|string[]} [options.allowedOrigin] Allowed host origins.
     * @param {string|string[]} [options.allowedOrigins] Alias for allowedOrigin.
     * @param {string} [options.targetOrigin] Origin used when posting to host.
     */
    constructor(options = {}) {
        this.window = options.window || globalThis.window;
        this.parentWindow = options.parentWindow || this.window?.parent || null;
        this.handlers = options.handlers || DEFAULT_HANDLERS;
        this.allowedOrigins = normalizeOriginList(options.allowedOrigin ?? options.allowedOrigins ?? options.targetOrigin);
        this.targetOrigin = options.targetOrigin || this.allowedOrigins[0] || "*";
        this.onMessage = this.onMessage.bind(this);
        this.started = false;
    }

    /** Start listening for host postMessage commands. */
    start() {
        if (!this.window || this.started) {
            return this;
        }
        this.window.addEventListener("message", this.onMessage);
        this.started = true;
        return this;
    }

    /** Stop listening for host commands. Pending commands are not tracked here. */
    stop() {
        if (!this.window || !this.started) {
            return this;
        }
        this.window.removeEventListener("message", this.onMessage);
        this.started = false;
        return this;
    }

    /**
     * Send an event or command response to the host application.
     * @param {string} type Event type, for example "ready" or "commandCompleted".
     * @param {object} payload Serializable event payload.
     * @param {string|null} requestId Request id to resolve a host-side promise.
     */
    post(type, payload = {}, requestId = null) {
        const target = this.parentWindow;
        if (!target || target === this.window) {
            return false;
        }

        const eventPayload = payload?.schemaVersion === SDK_EVENT_SCHEMA_VERSION
            ? payload
            : createSdkEvent({
                event: type,
                source: "iframe",
                payload,
                legacyFields: payload
            });
        target.postMessage(createEventMessage(type, eventPayload, requestId), this.targetOrigin);
        return true;
    }

    /** Return whether an incoming host origin is allowed to control the viewer. */
    isAllowedOrigin(origin) {
        return this.allowedOrigins.includes("*") || this.allowedOrigins.includes(origin);
    }

    /** Validate and route a raw postMessage event from the host page. */
    async onMessage(event) {
        const message = event.data;
        if (!isPlainMessage(message) || message.protocol !== EMBED_PROTOCOL || message.target !== VIEWER_TARGET) {
            return;
        }

        const requestId = message.requestId || null;
        if (!this.isAllowedOrigin(event.origin)) {
            const finishedAt = Date.now();
            this.post("commandRejected", createSdkCommandEvent({
                event: "commandRejected",
                command: message.type || null,
                commandId: requestId || undefined,
                status: "rejected",
                source: "iframe",
                timestamp: finishedAt,
                startedAt: finishedAt,
                finishedAt,
                payload: message.payload || {},
                error: {name: "CommandRejectedError", message: "Host origin is not allowed", code: "origin_not_allowed"},
                legacyFields: {
                    type: message.type || null,
                    reason: "origin_not_allowed",
                    origin: event.origin
                }
            }), requestId);
            return;
        }

        await this.dispatch(message.type, message.payload || {}, requestId, event);
    }

    /** Execute a supported command through the configured handler map. */
    async dispatch(type, payload, requestId, event) {
        const startedAt = Date.now();
        const handler = this.handlers[type];
        if (!SUPPORTED_COMMANDS.includes(type) || typeof handler !== "function") {
            const finishedAt = Date.now();
            this.post("commandRejected", createSdkCommandEvent({
                event: "commandRejected",
                command: type || null,
                commandId: requestId || undefined,
                status: "rejected",
                source: "iframe",
                timestamp: finishedAt,
                startedAt,
                finishedAt,
                payload,
                error: {name: "CommandRejectedError", message: "Unsupported viewer command", code: "unsupported_command"},
                legacyFields: {
                    type: type || null,
                    reason: "unsupported_command"
                }
            }), requestId);
            return;
        }

        try {
            const result = await handler(payload, {
                requestId,
                event,
                bridge: this
            });
            this.handleCommandResult(type, result, requestId, startedAt, payload);
        } catch (error) {
            const finishedAt = Date.now();
            this.post("commandFailed", createSdkCommandEvent({
                event: "commandFailed",
                command: type,
                commandId: requestId || undefined,
                status: "failed",
                source: "iframe",
                timestamp: finishedAt,
                startedAt,
                finishedAt,
                payload,
                error,
                legacyFields: {type}
            }), requestId);
        }
    }

    /** Normalize command handler results into bridge response events. */
    handleCommandResult(type, result, requestId, startedAt = Date.now(), payload = {}) {
        if (result && typeof result === "object" && result.__bridgeHandled === true) {
            return;
        }

        const finishedAt = Date.now();

        if (type === "snapshot") {
            this.post("commandCompleted", createSdkCommandEvent({
                event: "commandCompleted",
                command: type,
                commandId: requestId || undefined,
                status: "completed",
                source: "iframe",
                timestamp: finishedAt,
                startedAt,
                finishedAt,
                payload,
                result: null,
                legacyFields: {type, snapshot: result || null}
            }), requestId);
            return;
        }

        if (type === "getState") {
            this.post("state", result || {}, requestId);
        }

        this.post("commandCompleted", createSdkCommandEvent({
            event: "commandCompleted",
            command: type,
            commandId: requestId || undefined,
            status: "completed",
            source: "iframe",
            timestamp: finishedAt,
            startedAt,
            finishedAt,
            payload,
            result: result || null,
            legacyFields: {type}
        }), requestId);
    }
}

/** Create and start a viewer-side embed bridge. */
export function bindEmbedBridge(options = {}) {
    const bridge = new EmbedBridge(options);
    bridge.start();
    return bridge;
}

/** Marker for handlers that already posted their own response. */
export function bridgeHandled() {
    return {__bridgeHandled: true};
}

export {SUPPORTED_COMMANDS};
