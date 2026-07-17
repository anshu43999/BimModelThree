import {SUPPORTED_COMMANDS, bridgeHandled} from "./bind-embed-bridge.js";

function createRuntimeContext(context = {}) {
    return {
        source: "iframe",
        requestId: context.requestId || null
    };
}

function normalizeCommandPayload(command, payload = {}) {
    if (command === "selectLocalIds") {
        return {...payload, source: payload.source || "embed"};
    }
    if (command === "selectGlobalIds") {
        return {...payload, source: payload.source || "embed-global-id"};
    }
    if (command === "stopPathRoam") {
        return {...payload, reset: payload.reset !== false};
    }
    return payload;
}

function normalizeOpenModelPayload(payload = {}) {
    return {
        manifestUrl: payload.manifestUrl,
        manifest: payload.manifest,
        fragUrl: payload.fragUrl || payload.model || payload.modelUrl,
        name: payload.name,
        append: payload.append === true
    };
}

function normalizeSnapshotPayload(payload = {}) {
    return {
        download: payload.download !== false,
        filename: payload.filename,
        returnDataUrl: payload.returnDataUrl === true
    };
}

/** Build the iframe command map without duplicating Runtime SDK wrappers in the page. */
export function createRuntimeEmbedHandlers(options = {}) {
    const runtimeSdk = options.runtimeSdk;
    if (!runtimeSdk || typeof runtimeSdk.execute !== "function") {
        throw new Error("createRuntimeEmbedHandlers requires runtimeSdk.execute()");
    }
    const commands = options.commands || SUPPORTED_COMMANDS;
    const handledResult = options.handledResult || bridgeHandled;
    const handlers = Object.fromEntries(commands.map((command) => [
        command,
        (payload = {}, context = {}) => runtimeSdk.execute(
            command,
            normalizeCommandPayload(command, payload || {}),
            createRuntimeContext(context)
        )
    ]));

    handlers.openModel = async (payload = {}, context = {}) => {
        await runtimeSdk.execute(
            "openModel",
            normalizeOpenModelPayload(payload),
            createRuntimeContext(context)
        );
        return handledResult();
    };

    handlers.snapshot = async (payload = {}, context = {}) => {
        await runtimeSdk.execute(
            "snapshot",
            normalizeSnapshotPayload(payload),
            createRuntimeContext(context)
        );
        return handledResult();
    };

    return handlers;
}

