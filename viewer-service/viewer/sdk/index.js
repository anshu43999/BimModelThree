// Stable SDK entrypoint for third-party systems.
// Prefer BimViewerEmbedClient for iframe integration and BimViewerSDK for
// direct in-page integration. Engine exports are kept for advanced extension
// scenarios and should be treated as lower-level building blocks.
export {BimViewerApp} from "./bim-viewer-app.js";
export {BimViewerEmbedClient} from "./embed-client.js";
export {BimViewerSDK} from "./viewer-sdk.js";
export {ViewerRuntimeSDK} from "./viewer-runtime-sdk.js";
export {
    SDK_EVENT_SCHEMA_VERSION,
    createSdkEvent,
    createSdkCommandEvent,
    normalizeSdkError
} from "./sdk-event-contract.js";
export {
    SDK_INTEGRATION_SCHEMA_VERSION,
    PORTABLE_SDK_METHOD_GROUPS,
    PORTABLE_SDK_METHODS,
    createSdkCapabilities,
    normalizeSdkItemTarget
} from "./sdk-integration-contract.js";
export {BusinessDataApiClient, BUSINESS_DATA_TYPES} from "./business-data-client.js";
export {InteractionEngine} from "../engines/interaction-engine.js";
export {RenderEngine} from "../engines/render-engine.js";
export {SemanticQueryEngine} from "../engines/semantic-query-engine.js";
export {SnapshotEngine} from "../engines/snapshot-engine.js";
export {ViewpointEngine} from "../engines/viewpoint-engine.js";
export {LabelEngine} from "../engines/label-engine.js";
export {LabelStoreEngine} from "../engines/label-store-engine.js";
export {AnnotationEngine} from "../engines/annotation-engine.js";
export {
    MANIFEST_SCHEMA_VERSION,
    loadModelManifest,
    normalizeManifest
} from "./manifest-loader.js";
