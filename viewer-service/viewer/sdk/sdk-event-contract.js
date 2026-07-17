export const SDK_EVENT_SCHEMA_VERSION = "bim-viewer-sdk-event/v1";

let eventSequence = 0;

function createId(prefix) {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === "function") {
        return `${prefix}-${randomUUID.call(globalThis.crypto)}`;
    }
    eventSequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${eventSequence.toString(36)}`;
}

function normalizeTime(value, fallback = null) {
    const time = Number(value);
    return Number.isFinite(time) ? time : fallback;
}

/** Convert thrown values into a stable, serializable SDK error payload. */
export function normalizeSdkError(error) {
    if (error == null) {
        return null;
    }
    const normalized = {
        name: error && error.name ? String(error.name) : "Error",
        message: String(error && error.message ? error.message : error)
    };
    if (error && error.code != null) {
        normalized.code = String(error.code);
    }
    return normalized;
}

/** Create a domain event while preserving legacy detail fields at the top level. */
export function createSdkEvent(options = {}) {
    const timestamp = normalizeTime(options.timestamp, Date.now());
    return {
        ...(options.legacyFields || {}),
        schemaVersion: SDK_EVENT_SCHEMA_VERSION,
        eventId: options.eventId || createId("event"),
        event: options.event || null,
        source: options.source || "sdk",
        timestamp,
        payload: options.payload ?? {}
    };
}

/** Create a command lifecycle event shared by Runtime SDK and iframe SDK. */
export function createSdkCommandEvent(options = {}) {
    const timestamp = normalizeTime(options.timestamp, Date.now());
    const startedAt = normalizeTime(options.startedAt, timestamp);
    const isStarted = options.status === "started";
    const finishedAt = isStarted
        ? null
        : normalizeTime(options.finishedAt, timestamp);
    const durationMs = finishedAt == null
        ? null
        : Math.max(0, finishedAt - startedAt);

    return {
        ...createSdkEvent({
            event: options.event,
            eventId: options.eventId,
            source: options.source,
            timestamp,
            payload: options.payload,
            legacyFields: options.legacyFields
        }),
        commandId: options.commandId || createId("command"),
        command: options.command || null,
        status: options.status || null,
        startedAt,
        finishedAt,
        durationMs,
        result: options.result ?? null,
        error: normalizeSdkError(options.error)
    };
}
