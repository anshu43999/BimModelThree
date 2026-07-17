import * as THREE from "three";
import {TransformControls} from "three/addons/controls/TransformControls.js";
import {RenderedFaces} from "@thatopen/fragments";
import {BimViewerApp} from "./bim-viewer-app.js";
import {EMBED_PROTOCOL, SUPPORTED_COMMANDS, bindEmbedBridge} from "./app/bind-embed-bridge.js";
import {createRuntimeEmbedHandlers} from "./app/runtime-embed-handlers.js";
import {CameraControlManager} from "./app/camera-control-manager.js";
import {FreeInspectController} from "./app/free-inspect-controller.js";
import {
    PATH_ROAM_SCHEMA_VERSION
} from "./app/path-roam-core.js";
import {PathRoamDocumentController} from "./app/path-roam-document-controller.js";
import {PathRoamPlaybackController} from "./app/path-roam-playback-controller.js";
import {MODEL_LIFECYCLE, MODEL_ROLES, ModelRegistry} from "./app/model-registry.js";
import {createSemanticIndexCache, createSemanticIndexCacheKey} from "./app/semantic-index-cache.js";
import {SemanticIndexController} from "./app/semantic-index-controller.js";
import {SemanticSearchController} from "./app/semantic-search-controller.js";
import {TabStateController} from "./app/tab-state-controller.js";
import {TOOL_MODES, ToolModeController} from "./app/tool-mode-controller.js";
import {TreeQueryPager} from "./app/tree-query-pager.js";
import {VersionCompareController} from "./app/version-compare-controller.js";
import {VersionCompareTaskController} from "./app/version-compare-task-controller.js";
import {ViewportPanelManager} from "./app/viewport-panel-manager.js";
import {RenderEngine} from "./engines/render-engine.js";
import {InteractionEngine} from "./engines/interaction-engine.js";
import {SnapshotEngine} from "./engines/snapshot-engine.js";
import {SemanticQueryEngine} from "./engines/semantic-query-engine.js";
import {TreeDialogEngine} from "./engines/tree-dialog-engine.js";
import {ViewpointEngine} from "./engines/viewpoint-engine.js";
import {MeasurementEngine} from "./engines/measurement-engine.js";
import {LabelEngine} from "./engines/label-engine.js";
import {SectionEngine} from "./engines/section-engine.js";
import {ViewStoreEngine} from "./engines/view-store-engine.js";
import {AnnotationEngine} from "./engines/annotation-engine.js";
import {LabelStoreEngine} from "./engines/label-store-engine.js";
import {ZoneEngine} from "./engines/zone-engine.js";
import {TreeVirtualListEngine} from "./engines/tree-virtual-list-engine.js";
import {BubbleClusterEngine} from "./engines/bubble-cluster-engine.js";
import {BusinessDataApiClient} from "./sdk/business-data-client.js";
import {ViewerRuntimeSDK} from "./sdk/viewer-runtime-sdk.js";
import {
    createAnnotationPatch,
    createBusinessAnnotationPayload,
    normalizeAnnotationPermission,
    normalizeOptionalText as normalizeContractOptionalText,
    resolveAnnotationActor
} from "./sdk/annotation-contract.js";

const canvas = document.getElementById("viewerCanvas");
const fileInput = document.getElementById("fragFile");
const urlInput = document.getElementById("fragUrl");
const loadUrlBtn = document.getElementById("loadUrlBtn");
const manifestUrlInput = document.getElementById("manifestUrl");
const loadManifestBtn = document.getElementById("loadManifestBtn");
const appendFragFileInput = document.getElementById("appendFragFile");
const appendModelUrlInput = document.getElementById("appendModelUrl");
const appendManifestUrlInput = document.getElementById("appendManifestUrl");
const appendModelBtn = document.getElementById("appendModelBtn");
const modelManagerList = document.getElementById("modelManagerList");
const modelManagerEmpty = document.getElementById("modelManagerEmpty");
const modelManagerCount = document.getElementById("modelManagerCount");
const overlayModelsBtn = document.getElementById("overlayModelsBtn");
const spreadModelsBtn = document.getElementById("spreadModelsBtn");
const resetModelsPlacementBtn = document.getElementById("resetModelsPlacementBtn");
const fitBtn = document.getElementById("fitBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const viewIsoBtn = document.getElementById("viewIsoBtn");
const viewTopBtn = document.getElementById("viewTopBtn");
const viewFrontBtn = document.getElementById("viewFrontBtn");
const viewBackBtn = document.getElementById("viewBackBtn");
const viewLeftBtn = document.getElementById("viewLeftBtn");
const viewRightBtn = document.getElementById("viewRightBtn");
const viewBottomBtn = document.getElementById("viewBottomBtn");
const expandTreeBtn = document.getElementById("expandTreeBtn");
const openTreeDialogBtn = document.getElementById("openTreeDialogBtn");
const clearLogBtn = document.getElementById("clearLogBtn");
const statusEl = document.getElementById("status");
const fileStat = document.getElementById("fileStat");
const loadStat = document.getElementById("loadStat");
const itemStat = document.getElementById("itemStat");
const runValidationBtn = document.getElementById("runValidationBtn");
const exportValidationBtn = document.getElementById("exportValidationBtn");
const validationList = document.getElementById("validationList");
const selectedHud = document.getElementById("selectedHud");
const modeHud = document.getElementById("modeHud");
const logEl = document.getElementById("log");
const modelTree = document.getElementById("modelTree");
const treeEmpty = document.getElementById("treeEmpty");
const treeTabs = [...document.querySelectorAll("[data-tree-tab]")];
const treeSearchInput = document.getElementById("treeSearchInput");
const treeSearchClearBtn = document.getElementById("treeSearchClearBtn");
const treeSearchStatus = document.getElementById("treeSearchStatus");
const treeSearchResults = document.getElementById("treeSearchResults");
const selectedCategory = document.getElementById("selectedCategory");
const selectedId = document.getElementById("selectedId");
const basicProps = document.getElementById("basicProps");
const attributeTable = document.getElementById("attributeTable");
const attributeEmpty = document.getElementById("attributeEmpty");
const locateBtn = document.getElementById("locateBtn");
const hideBtn = document.getElementById("hideBtn");
const isolateBtn = document.getElementById("isolateBtn");
const showAllBtn = document.getElementById("showAllBtn");
const colorBtn = document.getElementById("colorBtn");
const resetColorBtn = document.getElementById("resetColorBtn");
const isolateModeRow = document.querySelector(".isolateModeRow");
const isolateModeSelect = document.getElementById("isolateModeSelect");
const isolateOpacityRow = document.querySelector(".isolateOpacityRow");
const isolateOpacityInput = document.getElementById("isolateOpacityInput");
const isolateOpacityValue = document.getElementById("isolateOpacityValue");
const refreshPropsBtn = document.getElementById("refreshPropsBtn");
const openWorkspaceDrawerBtn = document.getElementById("openWorkspaceDrawerBtn");
const closeWorkspaceDrawerBtn = document.getElementById("closeWorkspaceDrawerBtn");
const workspaceDrawerOverlay = document.getElementById("workspaceDrawerOverlay");
const workspaceDrawer = document.getElementById("workspaceDrawer");
const workspaceDrawerTabs = [...document.querySelectorAll("[data-workspace-tab]")];
const workspacePanels = [...document.querySelectorAll("[data-workspace-panel]")];
const openSettingsDrawerBtn = document.getElementById("openSettingsDrawerBtn");
const closeSettingsDrawerBtn = document.getElementById("closeSettingsDrawerBtn");
const settingsDrawerOverlay = document.getElementById("settingsDrawerOverlay");
const settingsDrawer = document.getElementById("settingsDrawer");
const settingsDrawerTabs = [...document.querySelectorAll("[data-settings-tab]")];
const settingsPanels = [...document.querySelectorAll("[data-settings-panel]")];
const rightInspectorTabs = [...document.querySelectorAll("[data-right-inspector-tab]")];
const rightInspectorPanels = [...document.querySelectorAll("[data-right-inspector-panel]")];
const boxSelectBtn = document.getElementById("boxSelectBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const saveViewBtn = document.getElementById("saveViewBtn");
const restoreViewBtn = document.getElementById("restoreViewBtn");
const viewportToolDock = document.getElementById("viewportToolDock");
const viewportToolDockToggle = document.getElementById("viewportToolDockToggle");
const roamBtn = document.getElementById("roamBtn");
const pathRoamBtn = document.getElementById("pathRoamBtn");
const roamSpeedRow = document.getElementById("roamSpeedRow");
const roamSpeedInput = document.getElementById("roamSpeedInput");
const roamSpeedValue = document.getElementById("roamSpeedValue");
const dualViewBtn = document.getElementById("dualViewBtn");
const syncDualViewBtn = document.getElementById("syncDualViewBtn");
const dualViewIsoBtn = document.getElementById("dualViewIsoBtn");
const dualViewTopBtn = document.getElementById("dualViewTopBtn");
const dualViewGuide = document.getElementById("dualViewGuide");
const saveViewStoreBtn = document.getElementById("saveViewStoreBtn");
const modelTransformBtn = document.getElementById("modelTransformBtn");
const viewportPanelRail = document.getElementById("viewportPanelRail");
const modelAssemblyPanel = document.getElementById("modelAssemblyPanel");
const modelTransformModeSelect = document.getElementById("modelTransformModeSelect");
const resetModelTransformBtn = document.getElementById("resetModelTransformBtn");
const modelTransformStatus = document.getElementById("modelTransformStatus");
const closeModelTransformPanelBtn = document.getElementById("closeModelTransformPanelBtn");
const modelTransformPositionInputs = [...document.querySelectorAll("[data-model-transform-position]")];
const modelTransformRotationInputs = [...document.querySelectorAll("[data-model-transform-rotation]")];
const applyModelTransformValuesBtn = document.getElementById("applyModelTransformValuesBtn");
const saveModelTransformBtn = document.getElementById("saveModelTransformBtn");
const restoreModelTransformBtn = document.getElementById("restoreModelTransformBtn");
const pathRoamPanel = document.getElementById("pathRoamPanel");
const closePathRoamPanelBtn = document.getElementById("closePathRoamPanelBtn");
const pathRoamRouteSelect = document.getElementById("pathRoamRouteSelect");
const pathRoamNameInput = document.getElementById("pathRoamNameInput");
const newPathRoamRouteBtn = document.getElementById("newPathRoamRouteBtn");
const savePathRoamRouteBtn = document.getElementById("savePathRoamRouteBtn");
const deletePathRoamRouteBtn = document.getElementById("deletePathRoamRouteBtn");
const addPathPointBtn = document.getElementById("addPathPointBtn");
const playPathRoamBtn = document.getElementById("playPathRoamBtn");
const stopPathRoamBtn = document.getElementById("stopPathRoamBtn");
const clearPathRoamBtn = document.getElementById("clearPathRoamBtn");
const pathRoamSpeedInput = document.getElementById("pathRoamSpeedInput");
const pathRoamSpeedValue = document.getElementById("pathRoamSpeedValue");
const pathRoamStatus = document.getElementById("pathRoamStatus");
const pathRoamList = document.getElementById("pathRoamList");
const compareFragFileInput = document.getElementById("compareFragFile");
const compareManifestUrlInput = document.getElementById("compareManifestUrl");
const loadCompareModelBtn = document.getElementById("loadCompareModelBtn");
const clearCompareModelBtn = document.getElementById("clearCompareModelBtn");
const runVersionCompareBtn = document.getElementById("runVersionCompareBtn");
const syncCompareViewBtn = document.getElementById("syncCompareViewBtn");
const compareActionRow = document.getElementById("compareActionRow");
const versionCompareStatus = document.getElementById("versionCompareStatus");
const versionComparePanel = document.getElementById("versionComparePanel");
const versionCompareSummary = document.getElementById("versionCompareSummary");
const versionCompareList = document.getElementById("versionCompareList");
const versionCompareLimitHint = document.getElementById("versionCompareLimitHint");
const versionCompareFilterTabs = [...document.querySelectorAll("[data-version-compare-filter]")];
const viewNameInput = document.getElementById("viewNameInput");
const viewCategoryInput = document.getElementById("viewCategoryInput");
const viewCategoryFilter = document.getElementById("viewCategoryFilter");
const viewList = document.getElementById("viewList");
const businessDataModeSelect = document.getElementById("businessDataMode");
const businessDataBaseUrlInput = document.getElementById("businessDataBaseUrl");
const businessTenantIdInput = document.getElementById("businessTenantId");
const businessProjectIdInput = document.getElementById("businessProjectId");
const businessVersionIdInput = document.getElementById("businessVersionId");
const businessCreatedByInput = document.getElementById("businessCreatedBy");
const businessDataAutoSyncInput = document.getElementById("businessDataAutoSync");
const businessDataAutoPullInput = document.getElementById("businessDataAutoPull");
const pullBusinessDataBtn = document.getElementById("pullBusinessDataBtn");
const pushBusinessDataBtn = document.getElementById("pushBusinessDataBtn");
const pushSnapshotDataBtn = document.getElementById("pushSnapshotDataBtn");
const businessDataStatus = document.getElementById("businessDataStatus");
const businessSnapshotList = document.getElementById("businessSnapshotList");
const createAnnotationBtn = document.getElementById("createAnnotationBtn");
const annotationInput = document.getElementById("annotationInput");
const annotationScopeFilter = document.getElementById("annotationScopeFilter");
const annotationStatusFilter = document.getElementById("annotationStatusFilter");
const annotationStatusInput = document.getElementById("annotationStatusInput");
const annotationPriorityInput = document.getElementById("annotationPriorityInput");
const annotationAssigneeInput = document.getElementById("annotationAssigneeInput");
const annotationPermissionInput = document.getElementById("annotationPermissionInput");
const cancelAnnotationEditBtn = document.getElementById("cancelAnnotationEditBtn");
const annotationList = document.getElementById("annotationList");
const createPersistentLabelBtn = document.getElementById("createPersistentLabelBtn");
const labelTitleInput = document.getElementById("labelTitleInput");
const cancelLabelEditBtn = document.getElementById("cancelLabelEditBtn");
const labelList = document.getElementById("labelList");
const bubbleToolPanel = document.getElementById("bubbleToolPanel");
const bubbleToolToggleBtn = document.getElementById("bubbleToolToggleBtn");
const bubbleToolCollapseBtn = document.getElementById("bubbleToolCollapseBtn");
const showAllBubblesInput = document.getElementById("showAllBubblesInput");
const bubbleClusterInput = document.getElementById("bubbleClusterInput");
const bubbleClusterStatus = document.getElementById("bubbleClusterStatus");
const bubbleStylePresetSelect = document.getElementById("bubbleStylePresetSelect");
const bubbleCustomInputs = [...document.querySelectorAll("[data-bubble-custom]")];
const bubbleCustomValueEls = {
    opacity: document.getElementById("bubbleCustomOpacityValue"),
    radius: document.getElementById("bubbleCustomRadiusValue"),
    shadow: document.getElementById("bubbleCustomShadowValue"),
    fontSize: document.getElementById("bubbleCustomFontSizeValue")
};
const bubbleNudgeStepInput = document.getElementById("bubbleNudgeStepInput");
const bubbleNudgeStepValue = document.getElementById("bubbleNudgeStepValue");
const bubbleNudgeButtons = [...document.querySelectorAll("[data-bubble-nudge]")];
const zoneModeSelect = document.getElementById("zoneModeSelect");
const refreshZonesBtn = document.getElementById("refreshZonesBtn");
const resetZonesBtn = document.getElementById("resetZonesBtn");
const zoneList = document.getElementById("zoneList");
const snapBtn = document.getElementById("snapBtn");
const measureBtn = document.getElementById("measureBtn");
const angleMeasureBtn = document.getElementById("angleMeasureBtn");
const areaMeasureBtn = document.getElementById("areaMeasureBtn");
const areaMeasureHint = document.getElementById("areaMeasureHint");
const undoMeasureBtn = document.getElementById("undoMeasureBtn");
const labelBtn = document.getElementById("labelBtn");
const sectionBtn = document.getElementById("sectionBtn");
const clearSectionBtn = document.getElementById("clearSectionBtn");
const sectionOffsetInput = document.getElementById("sectionOffsetInput");
const sectionOffsetValue = document.getElementById("sectionOffsetValue");
const sectionModeSelect = document.getElementById("sectionModeSelect");
const sectionPlaneSelect = document.getElementById("sectionPlaneSelect");
const clearMeasureBtn = document.getElementById("clearMeasureBtn");
const clearLabelBtn = document.getElementById("clearLabelBtn");
const opacityInput = document.getElementById("opacityInput");
const opacityValue = document.getElementById("opacityValue");
const selectionRect = document.getElementById("selectionRect");
const contextMenu = document.getElementById("contextMenu");
const viewerOverlay = document.getElementById("viewerOverlay");
const snapTypeHint = document.getElementById("snapTypeHint");
const measureResultHud = document.getElementById("measureResultHud");
const toolHud = document.getElementById("toolHud");
const exitActiveToolBtn = document.getElementById("exitActiveToolBtn");
const treeDialog = document.getElementById("treeDialog");
const treeDialogBody = document.getElementById("treeDialogBody");
const treeDialogTitle = document.getElementById("treeDialogTitle");
const closeTreeDialogBtn = document.getElementById("closeTreeDialogBtn");

const renderEngine = new RenderEngine({canvas}).init();
const {scene, camera, renderer, controls} = renderEngine;
const cameraControlManager = new CameraControlManager({controls, canvas});
const modelRegistry = new ModelRegistry();
const semanticIndexController = new SemanticIndexController({
    workerUrl: new URL("./workers/semantic-index-worker.js", import.meta.url)
});
const semanticIndexCache = createSemanticIndexCache();
const viewportPanelManager = new ViewportPanelManager({root: viewportPanelRail});
viewportPanelManager.register("model-assembly", {
    element: modelAssemblyPanel,
    group: "primary-tool-panel",
    exclusive: true
});
viewportPanelManager.register("path-roam", {
    element: pathRoamPanel,
    trigger: pathRoamBtn,
    group: "primary-tool-panel",
    exclusive: true
});
viewportPanelManager.register("bubble-tools", {
    element: bubbleToolPanel,
    trigger: bubbleToolToggleBtn,
    mode: "collapse",
    closedClass: "collapsed"
});
const snapshotEngine = new SnapshotEngine({renderer, scene, camera, canvas});
const viewpointEngine = new ViewpointEngine({renderEngine});
const viewStoreEngine = new ViewStoreEngine({
    storageKey: "bim-three:view-store",
    maxItems: 80
});
const annotationEngine = new AnnotationEngine({
    storageKey: "bim-three:annotations",
    maxItems: 500
});
const labelStoreEngine = new LabelStoreEngine({
    storageKey: "bim-three:labels",
    maxItems: 500
});
const zoneEngine = new ZoneEngine();
const measurementEngine = new MeasurementEngine({
    camera,
    canvas,
    scene,
    overlay: viewerOverlay,
    onChange: (state, reason) => syncMeasurementState(state, reason),
    onMeasure: (measurement) => {
        scheduleFragmentsUpdate();
        log("Measurement completed", {
            type: measurement.type,
            text: measurement.text,
            localIds: measurement.localIds
        });
    },
    onError: (error) => log("Measure failed", {message: errorMessage(error)})
});
const labelEngine = new LabelEngine({
    camera,
    canvas,
    overlay: viewerOverlay,
    onSelect: async (label) => {
        await viewerRuntimeSdk.execute("locateLabel", {id: label.id}, {source: "label-bubble"});
    }
});
const bubbleClusterEngine = new BubbleClusterEngine({
    overlay: viewerOverlay,
    enabled: true,
    onActivate: (item) => activateBubbleClusterItem(item)
});
const sectionEngine = new SectionEngine({renderer, scene, camera});
sectionEngine.addEventListener("sectionchange", (event) => {
    syncSectionControls(event.detail);
    updateToolHud();
});
const treeDialogEngine = new TreeDialogEngine({
    dialog: treeDialog,
    body: treeDialogBody,
    title: treeDialogTitle,
    closeButton: closeTreeDialogBtn,
    onSelect: async (localIds, primaryLocalId) => {
        await selectLocalIds(localIds, {
            primaryLocalId,
            source: "tree-dialog"
        });
    }
});
const toolModeController = new ToolModeController();
toolModeController.addEventListener("modechange", (event) => {
    syncCameraControlFromToolModes(event.detail.state);
    cancelInactiveToolPointerWork(event.detail.state);
    updateToolHud();
    log("Tool mode changed", event.detail);
});
viewportPanelManager.addEventListener("panelchange", (event) => {
    for (const change of event.detail.changes || []) {
        if (change.open) {
            continue;
        }
        if (change.id === "path-roam" && pathRoamPanelOpen) {
            setPathRoamPanelOpen(false, {
                fromPanelManager: true,
                silent: true,
                source: "panel-conflict"
            });
        } else if (change.id === "model-assembly" && modelTransformEnabled) {
            setModelTransformEnabled(false, {
                fromPanelManager: true,
                silent: true,
                source: "panel-conflict"
            });
        } else if (change.id === "bubble-tools") {
            bubbleToolExpanded = false;
        }
    }
    updateToolHud();
    log("Viewport panel changed", event.detail);
});
modelRegistry.addEventListener("registrychange", (event) => {
    log("Model registry changed", event.detail);
});
let semanticEngine = null;
let interactionEngine = null;

const highlightMaterial = {
    color: new THREE.Color(0x34c38f),
    opacity: 1,
    transparent: false,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: false,
    customId: "mvp-selection"
};

const compareRemovedMaterial = {
    color: new THREE.Color(0xff5f56),
    opacity: 0.96,
    transparent: true,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: true,
    customId: "version-removed"
};

const compareAddedMaterial = {
    color: new THREE.Color(0x4aa8ff),
    opacity: 0.96,
    transparent: true,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: true,
    customId: "version-added"
};

const compareChangedMaterial = {
    color: new THREE.Color(0xd8b45d),
    opacity: 0.98,
    transparent: true,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: true,
    customId: "version-changed"
};

const compareFocusedMaterial = {
    color: new THREE.Color(0xffd166),
    opacity: 1,
    transparent: false,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: true,
    customId: "version-focused"
};

const colorCycle = [
    new THREE.Color(0xd7b46a),
    new THREE.Color(0x6bbcff),
    new THREE.Color(0xef6f6c),
    new THREE.Color(0x8ad67a)
];

const TREE_CHILD_BATCH_SIZE = 180;
const TREE_SEARCH_RESULT_LIMIT = 80;
const TREE_SEARCH_SCAN_LIMIT = 1200;
const TREE_GROUP_SELECT_LIMIT = 500;
const TREE_LABEL_HYDRATE_BATCH_SIZE = 24;
const TREE_VIRTUAL_NODE_THRESHOLD = 900;
const TREE_VIRTUAL_ROW_HEIGHT = 34;
const TREE_SEARCH_VIRTUAL_ROW_HEIGHT = 38;
const VERSION_COMPARE_SCAN_LIMIT = 20000;
const VERSION_COMPARE_LIST_LIMIT = 80;
const VERSION_COMPARE_SELECTION_SYNC_LIMIT = 200;
const VERSION_COMPARE_CHANGED_SCAN_LIMIT = 1200;
const VERSION_COMPARE_GEOMETRY_ABSOLUTE_TOLERANCE = 0.001;
const VERSION_COMPARE_GEOMETRY_RELATIVE_TOLERANCE = 0.005;
const VERSION_COMPARE_HIGHLIGHT_LIMIT = 5000;
const VERSION_COMPARE_FINGERPRINT_BATCH_SIZE = 20;
const VERSION_COMPARE_PROPERTY_SNAPSHOT_LIMIT = 400;
const VERSION_COMPARE_INDEX_TIME_LIMIT_MS = 10000;
const VERSION_COMPARE_CHANGE_DETECTION_TIME_LIMIT_MS = 12000;
const VERSION_COMPARE_INDEX_ITEM_TIMEOUT_MS = 600;
const VERSION_COMPARE_ITEM_TIMEOUT_MS = 900;
const TOOL_POINTER_MOVE_INTERVAL_MS = 36;
const SEMANTIC_INDEX_BATCH_SIZE = 240;
const SEMANTIC_INDEX_YIELD_BATCHES = 4;
const SEMANTIC_INDEX_CACHE_CHUNK_SIZE = 1920;
const semanticSearchController = new SemanticSearchController({
    indexController: semanticIndexController,
    resolveItem: (localId) => getTreeSearchInfo(localId),
    convertIndexItem: (item) => createTreeSearchItemFromSemanticIndex(item),
    scanLimit: TREE_SEARCH_SCAN_LIMIT,
    resultLimit: TREE_SEARCH_RESULT_LIMIT
});
const treeQueryPager = new TreeQueryPager({pageSize: TREE_CHILD_BATCH_SIZE});
const versionCompareController = new VersionCompareController({
    workerUrl: new URL("./workers/version-compare-worker.js", import.meta.url)
});
const versionCompareTaskController = new VersionCompareTaskController();
const viewerRuntimeSdk = new ViewerRuntimeSDK({
    handlers: {
        async openModel(payload = {}, context = {}) {
            await loadModelSource({
                ...payload,
                requestId: payload.requestId || context.requestId || null
            });
            return {state: getViewerState(context.source || "runtime-sdk-open-model")};
        },
        async appendModelFromInputs() {
            await appendModelFromManagerInputs();
            return {state: getViewerState("runtime-sdk-append-model")};
        },
        listModels() {
            return {models: modelRegistry.getState(), state: getViewerState("runtime-sdk-list-models")};
        },
        async activateModel(payload = {}) {
            const entry = await activateManagedModel(payload.modelId || payload.id, {
                fit: payload.fit !== false,
                clearCompare: payload.clearCompare !== false,
                autoPull: payload.autoPull !== false
            });
            return {model: entry ? {modelId: entry.modelId, name: entry.name} : null, state: getViewerState("runtime-sdk-activate-model")};
        },
        fitManagedModel(payload = {}) {
            fitManagedModel(payload.modelId || payload.id);
            return {state: getViewerState("runtime-sdk-fit-managed-model")};
        },
        async setModelVisibility(payload = {}) {
            const modelId = payload.modelId || payload.id;
            const entry = getManagedModelEntry(modelId);
            const visible = payload.visible === undefined ? !entry?.visible : payload.visible !== false;
            const changed = await setManagedModelVisible(modelId, visible);
            return {changed, modelId, visible, state: getViewerState("runtime-sdk-model-visibility")};
        },
        async unloadModel(payload = {}) {
            const modelId = payload.modelId || payload.id;
            const removed = await unloadManagedModel(modelId);
            return {removed, modelId, state: getViewerState("runtime-sdk-unload-model")};
        },
        async overlayModels() {
            await enableManagedModelsOverlay();
            return {state: getViewerState("runtime-sdk-overlay-models")};
        },
        async spreadModels() {
            await spreadManagedModelsForPreview();
            return {state: getViewerState("runtime-sdk-spread-models")};
        },
        async resetModelsPlacement() {
            await resetManagedModelsPlacement();
            return {state: getViewerState("runtime-sdk-reset-models")};
        },
        async loadCompareModel(payload = {}) {
            await loadCompareModel(payload);
            return {compare: getVersionCompareRuntimeState(), state: getViewerState("runtime-sdk-load-compare")};
        },
        async clearCompareModel(payload = {}) {
            await clearCompareModel({silent: payload.silent === true});
            return {compare: getVersionCompareRuntimeState(), state: getViewerState("runtime-sdk-clear-compare")};
        },
        async runVersionCompare() {
            await runVersionCompare();
            return {compare: getVersionCompareRuntimeState(), state: getViewerState("runtime-sdk-run-compare")};
        },
        cancelVersionCompare() {
            cancelVersionCompare();
            return {compare: getVersionCompareRuntimeState(), state: getViewerState("runtime-sdk-cancel-compare")};
        },
        toggleCompareViewLinked() {
            toggleCompareViewLinked();
            return {compare: getVersionCompareRuntimeState(), state: getViewerState("runtime-sdk-compare-link")};
        },
        getVersionCompareState() {
            return {compare: getVersionCompareRuntimeState(), state: getViewerState("runtime-sdk-compare-state")};
        },
        async snapshot(payload = {}, context = {}) {
            const snapshot = await takeSnapshot({
                ...payload,
                requestId: payload.requestId || context.requestId || null
            });
            return {snapshot, state: getViewerState("runtime-sdk-snapshot")};
        },
        async saveCurrentView() {
            await saveCurrentView();
            return {views: viewStoreEngine.list(), state: getViewerState("runtime-sdk-save-view")};
        },
        async restoreLatestView() {
            await restoreSavedView();
            return {state: getViewerState("runtime-sdk-restore-view")};
        },
        listViews() {
            return {views: viewStoreEngine.list(), state: getViewerState("runtime-sdk-list-views")};
        },
        async saveStoredView() {
            const view = await saveStoredView();
            return {view, state: getViewerState("runtime-sdk-save-stored-view")};
        },
        updateStoredView(payload = {}) {
            const view = saveStoredViewEdit(payload.id || payload.viewId, payload.name, payload.category);
            return {view, state: getViewerState("runtime-sdk-update-stored-view")};
        },
        async restoreStoredView(payload = {}) {
            const restored = await restoreStoredView(payload.id || payload.viewId);
            return {restored, state: getViewerState("runtime-sdk-restore-stored-view")};
        },
        removeStoredView(payload = {}) {
            const removed = removeStoredView(payload.id || payload.viewId);
            return {removed, state: getViewerState("runtime-sdk-remove-stored-view")};
        },
        fitModel() {
            fitCurrentModel();
            return {view: getViewState()};
        },
        async fitSelection() {
            await fitSelected();
            return {view: getViewState()};
        },
        setView(payload = {}) {
            setNamedView(payload.view || payload.name || "iso");
            return {view: getViewState()};
        },
        setViewpoint(payload = {}) {
            const viewState = payload.viewpoint || payload.view || payload.camera || payload;
            const restored = viewpointEngine.restore({camera: viewState});
            if (!restored) {
                throw new Error("setViewpoint requires view or camera state");
            }
            scheduleFragmentsUpdate();
            return {view: getViewState()};
        },
        async selectLocalIds(payload = {}) {
            const localIds = normalizeEmbedLocalIds(payload);
            if (!localIds.length) {
                throw new Error("selectLocalIds requires localIds");
            }
            const primaryLocalId = Number.isFinite(Number(payload.primaryLocalId))
                ? Number(payload.primaryLocalId)
                : localIds[0];
            const selection = await selectLocalIds(localIds, {
                primaryLocalId,
                source: payload.source || "runtime-sdk"
            });
            return {
                selection: selection || getSelectionDetail(payload.source || "runtime-sdk"),
                state: getViewerState(payload.source || "runtime-sdk")
            };
        },
        async selectGlobalIds(payload = {}) {
            const globalIds = normalizeEmbedGlobalIds(payload);
            if (!globalIds.length) {
                throw new Error("selectGlobalIds requires globalIds");
            }
            const resolved = await resolveLocalIdsByGlobalIds(globalIds);
            if (!resolved.localIds.length) {
                throw new Error(`No localIds found for GlobalId: ${resolved.missingGlobalIds.join(", ")}`);
            }
            const selection = await selectLocalIds(resolved.localIds, {
                primaryLocalId: resolved.localIds[0],
                source: payload.source || "runtime-sdk-global-id"
            });
            return {
                requestedGlobalIds: globalIds,
                missingGlobalIds: resolved.missingGlobalIds,
                selection: selection || getSelectionDetail(payload.source || "runtime-sdk-global-id"),
                state: getViewerState(payload.source || "runtime-sdk-global-id")
            };
        },
        async getItemInfo(payload = {}) {
            const target = await resolveEmbedItemLocalId(payload);
            const info = await semanticEngine?.getItemInfo(target.localId) || await fetchItemInfo(target.localId);
            return {
                localId: target.localId,
                requestedGlobalId: target.requestedGlobalId,
                globalId: info.globalId || info.guid || target.requestedGlobalId || null,
                info,
                state: getViewerState("runtime-sdk-item-info")
            };
        },
        async getTree(payload = {}) {
            const mode = String(payload.mode || "models").trim() || "models";
            const tree = await semanticEngine?.getTree(mode) || null;
            return {
                mode,
                tree,
                state: getViewerState("runtime-sdk-tree")
            };
        },
        async hideSelected() {
            await hideSelected();
            return {state: getViewerState("runtime-sdk-hide")};
        },
        async isolateSelected(payload = {}) {
            if (payload.mode === "hide" || payload.mode === "dim") {
                isolateModeSelect.value = payload.mode;
            }
            if (payload.opacity != null && Number.isFinite(Number(payload.opacity))) {
                isolateOpacityInput.value = String(Math.round(Math.max(0.05, Math.min(0.95, Number(payload.opacity))) * 100));
            }
            const changed = await isolateSelected();
            return {changed, isolation: activeIsolateMode, state: getViewerState("runtime-sdk-isolate")};
        },
        async colorSelected(payload = {}) {
            const changed = await colorSelected(payload.color ?? null);
            return {changed, color: payload.color ?? null, state: getViewerState("runtime-sdk-color")};
        },
        async resetSelectedMaterial() {
            const changed = await resetSelectedColor();
            return {changed, state: getViewerState("runtime-sdk-reset-material")};
        },
        async setSelectedOpacity(payload = {}) {
            const opacity = Number(payload.opacity);
            if (!Number.isFinite(opacity)) {
                throw new Error("setSelectedOpacity requires a numeric opacity");
            }
            const normalized = Math.max(0, Math.min(1, opacity));
            opacityInput.value = String(normalized);
            const changed = await updateSelectedOpacity();
            return {changed, opacity: normalized, state: getViewerState("runtime-sdk-opacity")};
        },
        async showAll() {
            await showAll();
            return {state: getViewerState("runtime-sdk-show-all")};
        },
        async clearSelection() {
            await clearSelection("runtime-sdk");
            return {state: getViewerState("runtime-sdk-clear-selection")};
        },
        setFreeInspectMode(payload = {}) {
            return {
                freeInspect: setFreeInspectMode(payload.enabled !== false, {silent: payload.silent === true}),
                state: getViewerState("runtime-sdk-free-inspect")
            };
        },
        toggleFreeInspectMode(payload = {}) {
            return {
                freeInspect: toggleFreeInspectMode({silent: payload.silent === true}),
                state: getViewerState("runtime-sdk-free-inspect")
            };
        },
        getFreeInspectMode() {
            return {
                freeInspect: getFreeInspectMode(),
                state: getViewerState("runtime-sdk-free-inspect")
            };
        },
        setFreeInspectSpeed(payload = {}) {
            setRoamSpeedMultiplier(payload.speedMultiplier ?? payload.value, {silent: payload.silent === true});
            return {
                freeInspect: getFreeInspectMode(),
                state: getViewerState("runtime-sdk-free-inspect")
            };
        },
        openPathRoamPanel(payload = {}) {
            setPathRoamPanelOpen(payload.open !== false, {silent: payload.silent === true});
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        listPathRoamRoutes() {
            return {
                document: listPathRoamRoutes(),
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        createPathRoamRoute(payload = {}) {
            const route = createNewPathRoamRoute({name: payload.name});
            return {
                route: route ? summarizePathRoamRoute(route) : null,
                document: listPathRoamRoutes(),
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        switchPathRoamRoute(payload = {}) {
            const route = switchPathRoamRoute(payload.routeId || payload.id);
            return {
                route: route ? summarizePathRoamRoute(route) : null,
                document: listPathRoamRoutes(),
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        savePathRoamRoute(payload = {}) {
            const route = saveActivePathRoamRoute({name: payload.name});
            return {
                route: route ? summarizePathRoamRoute(route) : null,
                document: listPathRoamRoutes(),
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        deletePathRoamRoute(payload = {}) {
            const route = deleteActivePathRoamRoute(payload.routeId || payload.id || null);
            return {
                route: route ? summarizePathRoamRoute(route) : null,
                document: listPathRoamRoutes(),
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        setPathRoamSpeed(payload = {}) {
            setPathRoamSpeedMultiplier(payload.speedMultiplier ?? payload.multiplier ?? payload.speed ?? 1, {
                silent: payload.silent === true
            });
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        listPathRoamPoints() {
            const result = listPathRoamPoints();
            return {
                route: result.route,
                points: result.points,
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        addPathRoamPoint(payload = {}) {
            const point = capturePathRoamPoint({name: payload.name, time: payload.time, states: payload.states});
            return {point, pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        async restorePathRoamPoint(payload = {}) {
            const point = await restorePathRoamPoint(payload.pointId || payload.id);
            return {
                point: point ? summarizePathRoamPoint(point) : null,
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        deletePathRoamPoint(payload = {}) {
            const point = deletePathRoamPoint(payload.pointId || payload.id);
            return {
                point: point ? summarizePathRoamPoint(point) : null,
                points: listPathRoamPoints().points,
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        updatePathRoamPoint(payload = {}) {
            const point = updatePathRoamPoint(payload.pointId || payload.id, {name: payload.name, time: payload.time});
            return {
                point: point ? summarizePathRoamPoint(point) : null,
                points: listPathRoamPoints().points,
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        recapturePathRoamPoint(payload = {}) {
            const point = recapturePathRoamPoint(payload.pointId || payload.id);
            return {
                point: point ? summarizePathRoamPoint(point) : null,
                points: listPathRoamPoints().points,
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        movePathRoamPoint(payload = {}) {
            const point = movePathRoamPoint(payload.pointId || payload.id, Number(payload.direction) || 0);
            return {
                point: point ? summarizePathRoamPoint(point) : null,
                points: listPathRoamPoints().points,
                pathRoam: getPathRoamMode(),
                state: getViewerState("runtime-sdk-path-roam")
            };
        },
        playPathRoam() {
            startPathRoamPlayback();
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        pausePathRoam() {
            pausePathRoamPlayback();
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        togglePathRoamPlayback() {
            if (!pathRoamPlaying || pathRoamPaused) {
                startPathRoamPlayback();
            } else {
                pausePathRoamPlayback();
            }
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        stopPathRoam(payload = {}) {
            stopPathRoamPlayback({reset: payload.reset !== false, silent: payload.silent === true});
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        clearPathRoam() {
            clearPathRoamPoints();
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        getPathRoamMode() {
            return {pathRoam: getPathRoamMode(), state: getViewerState("runtime-sdk-path-roam")};
        },
        createLabel(payload = {}) {
            return createEmbedLabel(payload);
        },
        async saveLabelForm(payload = {}) {
            const label = await createOrUpdateLabel({useInputTitle: payload.useInputTitle !== false});
            return {label, state: getViewerState("runtime-sdk-label-form")};
        },
        async locateLabel(payload = {}) {
            const located = await locateLabel(payload.id || payload.labelId);
            return {located, state: getViewerState("runtime-sdk-locate-label")};
        },
        listLabels(payload = {}) {
            return listEmbedLabels(payload);
        },
        removeLabel(payload = {}) {
            return removeEmbedLabel(payload);
        },
        createAnnotation(payload = {}) {
            return createEmbedAnnotation(payload);
        },
        async saveAnnotationForm() {
            const annotation = await createAnnotation();
            return {annotation, state: getViewerState("runtime-sdk-annotation-form")};
        },
        async locateAnnotation(payload = {}) {
            const located = await locateAnnotation(payload.id || payload.annotationId);
            return {located, state: getViewerState("runtime-sdk-locate-annotation")};
        },
        updateAnnotation(payload = {}) {
            return updateEmbedAnnotation(payload);
        },
        listAnnotations(payload = {}) {
            return listEmbedAnnotations(payload);
        },
        getAnnotationHistory(payload = {}) {
            return getEmbedAnnotationHistory(payload);
        },
        removeAnnotation(payload = {}) {
            return removeEmbedAnnotation(payload);
        },
        getState(_payload, context = {}) {
            return getViewerState(context.source || "runtime-sdk");
        }
    }
});

let viewerApp;
let fragments;
let currentModel = null;
let currentAllLocalIds = [];
let currentTree = null;
let currentTreeTab = "models";
let currentModelName = null;
let viewerBusy = false;
let managedModelsOverlayEnabled = true;
let managedModelsPlacementMode = "original";
let treeLabelCache = new Map();
let treeBasicInfoCache = new Map();
let treeBasicInfoInflight = new Map();
let treeLocalIdsCache = new WeakMap();
let treeSearchInfoCache = new Map();
let semanticIndexBuildVersion = 0;
let semanticIndexCacheState = {status: "idle", cacheKey: null, source: null};
let treeSearchTimer = null;
let treeSearchRequestId = 0;
let activeTreeSearchQuery = "";
let treeSearchResultItems = [];
let treeVirtualEngine = null;
let treeSearchVirtualEngine = null;
let treeVirtualMode = false;
let treeExpandedKeys = new Set(["0"]);
let treeVirtualRows = [];
let activeTreeNode = null;
let pendingTreeNode = null;
let selectionRequestId = 0;
let selectedLocalIds = [];
let selectedPrimaryLocalId = null;
let colorIndex = 0;
let updatePending = false;
let updatePendingForce = false;
let dragStart = null;
let ctrlLookState = null;
let suppressNextCanvasClick = false;
let boxSelectEnabled = false;
let boxSelectStart = null;
let lastBoxSelectSummary = null;
let snapEnabled = false;
let measureEnabled = false;
let sectionEnabled = false;
let roamEnabled = false;
let modelTransformEnabled = false;
let modelTransformControls = null;
let modelTransformHelper = null;
let modelTransformMode = "translate";
let currentModelInitialTransform = null;
let pathRoamPanelOpen = false;
let pathRoamDocument = null;
let pathRoamPlaying = false;
let pathRoamPaused = false;
let pathRoamElapsedMs = 0;
let pathRoamSpeedMultiplier = 1;
let roamSpeedMultiplier = 0.2;
let snapMarker = null;
let snapEdgeMarker = null;
let snapPointTexture = null;
let lastMeasureResult = null;
let highlightRefreshRunning = false;
let highlightRefreshQueued = false;
let highlightRefreshScheduled = false;
let toolHudUpdatePending = false;
let sectionAxisIndex = 0;
let toolPointerMoveScheduled = false;
let toolPointerMoveInFlight = false;
let toolPointerMoveSequence = 0;
let toolPointerMoveProcessedSequence = 0;
let toolPointerMoveTimer = null;
let toolPointerMoveLastStartedAt = 0;
let lastToolPointerEvent = null;
let lastCanvasPointerEvent = null;
let editingAnnotationId = null;
let expandedAnnotationHistoryIds = new Set();
let editingLabelId = null;
let editingViewId = null;
let annotationMarkerRequestId = 0;
let zoneRenderRequestId = 0;
let relocateTarget = null;
let activeTreeGroupSummary = null;
let activeTreeDataSummary = null;
let lastModelValidationReport = null;
let showAllBubbles = false;
let bubbleToolExpanded = false;
let bubbleClusterEnabled = true;
let lastBubbleClusterSummary = {
    itemCount: 0,
    clusterCount: 0,
    clusteredCount: 0
};
let bubbleClusterFrame = null;
let businessSnapshotItems = [];
let compareModel = null;
let compareModelName = null;
let compareManifest = null;
let compareSemanticEngine = null;
let lastVersionCompareReport = null;
let compareViewLinked = false;
let compareViewSyncPending = false;
let compareSelectionSyncRequestId = 0;
let compareSelectionLocalIds = [];
let focusedCompareDiff = null;
let versionCompareFilter = "all";
let versionCompareRunId = 0;
let versionCompareRunning = false;
const versionCompareHighlightState = {
    baseRemoved: [],
    baseChanged: [],
    compareAdded: [],
    compareChanged: []
};
let businessDataStatusMessage = "";
const businessDataSyncState = {
    lastPullAt: null,
    lastPushAt: null,
    lastAutoSyncAt: null,
    lastErrorAt: null
};
const annotationMarkers = new Map();
const contextMenuCommands = new Map();
let contextMenuLastPoint = null;
let contextMenuHitInfo = null;
let activeIsolateMode = null;

function measurementModeToToolMode(mode) {
    if (mode === "angle") {
        return TOOL_MODES.MEASURE_ANGLE;
    }
    if (mode === "area") {
        return TOOL_MODES.MEASURE_AREA;
    }
    return TOOL_MODES.MEASURE_DISTANCE;
}

const CAMERA_TOOL_PROFILES = Object.freeze({
    [TOOL_MODES.MEASURE_DISTANCE]: {cursor: "crosshair", priority: 60},
    [TOOL_MODES.MEASURE_ANGLE]: {cursor: "crosshair", priority: 60},
    [TOOL_MODES.MEASURE_AREA]: {cursor: "crosshair", priority: 60},
    [TOOL_MODES.FREE_INSPECT]: {blocks: false, cursor: "crosshair", priority: 20},
    [TOOL_MODES.CTRL_LOOK]: {cursor: "grabbing", priority: 90},
    [TOOL_MODES.BOX_SELECT]: {cursor: "crosshair", priority: 70},
    [TOOL_MODES.BUBBLE_RELOCATE]: {blocks: false, cursor: "cell", priority: 50},
    [TOOL_MODES.MODEL_TRANSFORM]: {blocks: false},
    [TOOL_MODES.PATH_ROAM]: {cursor: "progress", priority: 100}
});

function syncCameraControlFromToolModes(state = toolModeController.getState()) {
    const activeModes = new Set(state.activeModes || []);
    for (const mode of Object.values(TOOL_MODES)) {
        cameraControlManager.set(`tool-mode:${mode}`, activeModes.has(mode), {
            ...(CAMERA_TOOL_PROFILES[mode] || {blocks: false}),
            defer: true,
            source: "tool-mode"
        });
    }
    cameraControlManager.apply({source: "tool-mode"});
}

function requestToolMode(mode, enabled, options = {}) {
    if (!mode || options.fromController === true) {
        return {activated: enabled ? mode : null, deactivated: []};
    }
    if (!enabled) {
        return toolModeController.deactivate(mode, {
            source: options.source || "viewer"
        });
    }
    const transition = toolModeController.activate(mode, {
        source: options.source || "viewer"
    });
    for (const conflict of transition.deactivated || []) {
        deactivateToolMode(conflict, {
            fromController: true,
            silent: true,
            source: mode
        });
    }
    return transition;
}

function deactivateToolMode(mode, options = {}) {
    if (mode === TOOL_MODES.SNAP) {
        setSnapEnabled(false, options);
    } else if ([
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA
    ].includes(mode)) {
        setMeasureEnabled(false, undefined, options);
    } else if (mode === TOOL_MODES.SECTION) {
        setSectionEnabled(false, options);
    } else if (mode === TOOL_MODES.FREE_INSPECT) {
        setRoamEnabled(false, options);
    } else if (mode === TOOL_MODES.CTRL_LOOK) {
        cancelCtrlLookMode(options);
    } else if (mode === TOOL_MODES.BOX_SELECT) {
        setBoxSelectEnabled(false, options);
    } else if (mode === TOOL_MODES.BUBBLE_RELOCATE) {
        cancelRelocateTarget(options.source || "mode-conflict", options);
    } else if (mode === TOOL_MODES.MODEL_TRANSFORM) {
        setModelTransformEnabled(false, options);
    } else if (mode === TOOL_MODES.PATH_ROAM) {
        stopPathRoamPlayback({reset: true, ...options});
    }
}

const BUBBLE_STYLE_PRESETS = ["default", "blue", "warning", "light", "contrast", "custom"];
const BUBBLE_STYLE_STORAGE_KEY = "bim-three:bubble-style";
const BUBBLE_CLUSTER_STORAGE_KEY = "bim-three:bubble-cluster-enabled";
const BUSINESS_DATA_URL_STORAGE_KEY = "bim-three:business-data-base-url";
const BUSINESS_TENANT_ID_STORAGE_KEY = "bim-three:business-tenant-id";
const BUSINESS_PROJECT_ID_STORAGE_KEY = "bim-three:business-project-id";
const BUSINESS_VERSION_ID_STORAGE_KEY = "bim-three:business-version-id";
const BUSINESS_CREATED_BY_STORAGE_KEY = "bim-three:business-created-by";
const BUSINESS_DATA_MODE_STORAGE_KEY = "bim-three:business-data-mode";
const BUSINESS_DATA_AUTO_SYNC_STORAGE_KEY = "bim-three:business-data-auto-sync";
const BUSINESS_DATA_AUTO_PULL_STORAGE_KEY = "bim-three:business-data-auto-pull";
const MODEL_TRANSFORM_STORAGE_PREFIX = "bim-three:model-transform:";
const ROAM_SPEED_STORAGE_KEY = "bim-three:roam-speed-multiplier";
const VIEWPORT_TOOL_DOCK_COLLAPSED_STORAGE_KEY = "bim-three:viewport-tool-dock-collapsed";
const RIGHT_INSPECTOR_TAB_STORAGE_KEY = "bim-three:right-inspector-tab";
const WORKSPACE_TAB_STORAGE_KEY = "bim-three:workspace-tab";
const SETTINGS_TAB_STORAGE_KEY = "bim-three:settings-tab";
const PATH_ROAM_STORAGE_PREFIX = "bim-three:path-roam:";
const PATH_ROAM_SPEED_STORAGE_KEY = "bim-three:path-roam-speed-multiplier";
const DEFAULT_BUBBLE_CUSTOM_STYLE = {
    backgroundColor: "#0d1114",
    textColor: "#eef6ff",
    mutedColor: "#a5b0b8",
    borderColor: "#6bbcff",
    opacity: 90,
    radius: 6,
    shadow: 34,
    fontSize: 12
};
let bubbleStyleState = loadBubbleStyleState();
bubbleClusterEnabled = loadBubbleClusterEnabled();
roamSpeedMultiplier = loadRoamSpeedMultiplier();
const freeInspectController = new FreeInspectController({
    camera,
    controls,
    keyboardTarget: document,
    getAvailable: () => Boolean(currentModel),
    getBaseSpeed: () => getRoamBaseSpeed(),
    speedMultiplier: roamSpeedMultiplier,
    speedPrecision: 1,
    onMove: () => {
        syncOverlays();
        autoSyncCompareViewIfLinked();
        scheduleFragmentsUpdate();
    }
});
const pathRoamDocumentController = new PathRoamDocumentController({
    storage: globalThis.localStorage || null,
    getModelId: () => currentModel?.modelId || null,
    getModelName: () => currentModelName || currentModel?.modelId || "model",
    getStorageKey: () => getPathRoamStorageKey(),
    getCameraDefaults: () => ({near: camera.near, far: camera.far, zoom: camera.zoom}),
    defaultRouteName: () => "默认漫游",
    routeName: (index) => `漫游方案 ${index + 1}`,
    pointName: (index) => `路径点 ${index + 1}`,
    unnamedRouteName: "未命名漫游",
    unnamedPointName: "未命名关键帧"
});
pathRoamSpeedMultiplier = loadPathRoamSpeedMultiplier();
const pathRoamPlaybackController = new PathRoamPlaybackController({
    getPoints: () => pathRoamDocumentController.getPoints(),
    getAvailable: () => Boolean(currentModel),
    speedMultiplier: pathRoamSpeedMultiplier,
    onFrame: ({viewState, elapsedMs, totalMs}) => {
        pathRoamElapsedMs = Math.round(elapsedMs);
        if (viewState) {
            renderEngine.restoreViewState(viewState);
            syncOverlays();
            autoSyncCompareViewIfLinked();
            scheduleFragmentsUpdate();
        }
        if (pathRoamStatus) {
            pathRoamStatus.textContent = `播放中：${formatPathRoamTime(elapsedMs)} / ${formatPathRoamTime(totalMs)}`;
        }
    },
    onKeyframe: (point) => applyPathRoamKeyframeState(point),
    onKeyframeError: (error, point) => {
        log("Path roam keyframe restore failed", {
            pointId: point.id,
            error: errorMessage(error)
        });
    },
    onComplete: () => completePathRoamPlayback()
});

function getModelScaleStep() {
    const box = getCurrentModelBox();
    if (box && typeof box.getSize === "function" && !box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        return Math.max(size.x, size.y, size.z, 1) / 40;
    }
    return 1;
}

function getRoamBaseSpeed() {
    let baseSpeed = 8;
    const box = getCurrentModelBox();
    if (box && typeof box.getSize === "function" && !box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        baseSpeed = Math.max(size.x, size.y, size.z, 10) / 7;
    }
    return baseSpeed;
}

function getRoamSpeed() {
    return freeInspectController?.getState().speed ?? (getRoamBaseSpeed() * roamSpeedMultiplier);
}

function clampRoamSpeedMultiplier(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return 0.2;
    }
    return Math.max(0.2, Math.min(3, Number(number.toFixed(1))));
}

function loadRoamSpeedMultiplier() {
    try {
        return clampRoamSpeedMultiplier(localStorage.getItem(ROAM_SPEED_STORAGE_KEY) || 0.2);
    } catch {
        return 0.2;
    }
}

function syncRoamSpeedControls() {
    roamSpeedMultiplier = clampRoamSpeedMultiplier(roamSpeedMultiplier);
    if (roamSpeedRow) {
        roamSpeedRow.hidden = !roamEnabled;
    }
    if (roamSpeedInput) {
        roamSpeedInput.disabled = !currentModel || !roamEnabled;
        if (document.activeElement !== roamSpeedInput) {
            roamSpeedInput.value = String(roamSpeedMultiplier);
        }
    }
    if (roamSpeedValue) {
        roamSpeedValue.textContent = `${roamSpeedMultiplier.toFixed(1)}x`;
    }
}

function setRoamSpeedMultiplier(value, options = {}) {
    roamSpeedMultiplier = freeInspectController.setSpeedMultiplier(value).speedMultiplier;
    try {
        localStorage.setItem(ROAM_SPEED_STORAGE_KEY, String(roamSpeedMultiplier));
    } catch {
        // Local storage may be unavailable in restricted browser contexts.
    }
    syncRoamSpeedControls();
    if (!options.silent) {
        setStatus(`自由巡检步进已调整：${roamSpeedMultiplier.toFixed(1)}x`);
        log("Roam speed changed", {
            multiplier: roamSpeedMultiplier,
            speed: Number(getRoamSpeed().toFixed(4))
        });
    }
}

function clampPathRoamSpeedMultiplier(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return 1;
    }
    return Math.max(0.25, Math.min(3, Number(number.toFixed(2))));
}

function loadPathRoamSpeedMultiplier() {
    try {
        return clampPathRoamSpeedMultiplier(localStorage.getItem(PATH_ROAM_SPEED_STORAGE_KEY) || 1);
    } catch {
        return 1;
    }
}

function setPathRoamSpeedMultiplier(value, options = {}) {
    pathRoamPlaybackController.setSpeedMultiplier(value);
    pathRoamSpeedMultiplier = pathRoamPlaybackController.getState().speedMultiplier;
    try {
        localStorage.setItem(PATH_ROAM_SPEED_STORAGE_KEY, String(pathRoamSpeedMultiplier));
    } catch {
        // Local storage may be unavailable in restricted browser contexts.
    }
    syncPathRoamControls();
    if (!options.silent) {
        setStatus(`路径漫游速度已调整：${pathRoamSpeedMultiplier.toFixed(2)}x`);
        log("Path roam speed changed", {multiplier: pathRoamSpeedMultiplier});
    }
}

function getPathRoamStorageKey() {
    return currentModel?.modelId ? `${PATH_ROAM_STORAGE_PREFIX}${currentModel.modelId}` : "";
}

function loadPathRoamDocument() {
    pathRoamDocument = pathRoamDocumentController.load();
    return pathRoamDocument;
}

function ensurePathRoamDocument() {
    pathRoamDocumentController.document = pathRoamDocument;
    pathRoamDocument = pathRoamDocumentController.ensure();
    return pathRoamDocument;
}

function getActivePathRoamRoute(documentState = ensurePathRoamDocument()) {
    pathRoamDocumentController.document = documentState;
    return pathRoamDocumentController.getActiveRoute();
}

function getPathRoamPoints() {
    ensurePathRoamDocument();
    return pathRoamDocumentController.getPoints();
}

function syncPathRoamPlaybackState() {
    const playback = pathRoamPlaybackController.getState();
    pathRoamPlaying = playback.active;
    pathRoamPaused = playback.paused;
    pathRoamElapsedMs = playback.elapsedMs;
    pathRoamSpeedMultiplier = playback.speedMultiplier;
    return playback;
}

function getPathRoamMode() {
    const route = pathRoamDocument ? getActivePathRoamRoute(pathRoamDocument) : null;
    const points = route?.points || [];
    const playback = syncPathRoamPlaybackState();
    return {
        available: Boolean(currentModel),
        panelOpen: pathRoamPanelOpen,
        playing: playback.playing,
        paused: playback.paused,
        routeCount: pathRoamDocument?.routes?.length || 0,
        activeRouteId: route?.id || null,
        activeRouteName: route?.name || "",
        pointCount: points.length,
        elapsedMs: playback.elapsedMs,
        totalMs: playback.totalMs,
        speedMultiplier: playback.speedMultiplier,
        schemaVersion: PATH_ROAM_SCHEMA_VERSION
    };
}

function formatPathRoamTime(ms) {
    return `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)}s`;
}

function syncPathRoamRouteOptions(documentState = pathRoamDocument) {
    if (!pathRoamRouteSelect) {
        return;
    }
    const routes = Array.isArray(documentState?.routes) ? documentState.routes : [];
    const previousValue = pathRoamRouteSelect.value;
    pathRoamRouteSelect.replaceChildren();
    for (const route of routes) {
        const option = document.createElement("option");
        option.value = route.id;
        option.textContent = route.name || "未命名漫游";
        pathRoamRouteSelect.appendChild(option);
    }
    const activeRouteId = documentState?.activeRouteId || previousValue;
    if (routes.some((route) => route.id === activeRouteId)) {
        pathRoamRouteSelect.value = activeRouteId;
    }
}

function syncPathRoamControls() {
    const hasModel = Boolean(currentModel);
    const documentState = hasModel ? ensurePathRoamDocument() : pathRoamDocument;
    const activeRoute = documentState ? getActivePathRoamRoute(documentState) : null;
    const points = activeRoute?.points || [];
    syncPathRoamRouteOptions(documentState);
    if (pathRoamBtn) {
        pathRoamBtn.disabled = !hasModel;
        pathRoamBtn.classList.toggle("active", pathRoamPanelOpen);
    }
    if (pathRoamRouteSelect) {
        pathRoamRouteSelect.disabled = !hasModel || pathRoamPlaying;
    }
    if (pathRoamNameInput) {
        pathRoamNameInput.disabled = !hasModel || pathRoamPlaying;
        if (document.activeElement !== pathRoamNameInput) {
            pathRoamNameInput.value = activeRoute?.name || "";
        }
    }
    if (newPathRoamRouteBtn) {
        newPathRoamRouteBtn.disabled = !hasModel || pathRoamPlaying;
    }
    if (savePathRoamRouteBtn) {
        savePathRoamRouteBtn.disabled = !hasModel || pathRoamPlaying;
    }
    if (deletePathRoamRouteBtn) {
        deletePathRoamRouteBtn.disabled = !hasModel || pathRoamPlaying || (documentState?.routes?.length || 0) <= 1;
    }
    if (addPathPointBtn) {
        addPathPointBtn.disabled = !hasModel || pathRoamPlaying;
    }
    if (playPathRoamBtn) {
        playPathRoamBtn.disabled = !hasModel || points.length < 2;
        playPathRoamBtn.textContent = pathRoamPlaying && !pathRoamPaused ? "暂停" : "播放";
    }
    if (stopPathRoamBtn) {
        stopPathRoamBtn.disabled = !pathRoamPlaying && pathRoamElapsedMs <= 0;
    }
    if (clearPathRoamBtn) {
        clearPathRoamBtn.disabled = !hasModel || !points.length || pathRoamPlaying;
    }
    if (pathRoamSpeedInput) {
        pathRoamSpeedInput.disabled = !hasModel;
        if (document.activeElement !== pathRoamSpeedInput) {
            pathRoamSpeedInput.value = String(pathRoamSpeedMultiplier);
        }
    }
    if (pathRoamSpeedValue) {
        pathRoamSpeedValue.textContent = `${pathRoamSpeedMultiplier.toFixed(2)}x`;
    }
    if (pathRoamStatus) {
        if (!hasModel) {
            pathRoamStatus.textContent = "加载模型后可记录路径点";
        } else if (pathRoamPlaying && !pathRoamPaused) {
            pathRoamStatus.textContent = `播放中：${formatPathRoamTime(pathRoamElapsedMs)}`;
        } else if (pathRoamPaused) {
            pathRoamStatus.textContent = `已暂停：${formatPathRoamTime(pathRoamElapsedMs)}`;
        } else {
            pathRoamStatus.textContent = points.length
                ? `${activeRoute?.name || "当前方案"}：已记录 ${points.length} 个路径点`
                : `${activeRoute?.name || "当前方案"}：移动到目标视角后点击“添加路径点”`;
        }
    }
}

function renderPathRoamList() {
    if (!pathRoamList) {
        return;
    }
    const points = getPathRoamPoints();
    pathRoamList.replaceChildren();
    if (!points.length) {
        const empty = document.createElement("div");
        empty.className = "pathRoamEmpty";
        empty.textContent = "暂无路径点";
        pathRoamList.appendChild(empty);
        return;
    }
    points.forEach((point, index) => {
        const item = document.createElement("div");
        item.className = "pathRoamPointItem";

        const body = document.createElement("div");
        body.className = "pathRoamPointBody";
        const nameInput = document.createElement("input");
        nameInput.className = "pathRoamPointNameInput";
        nameInput.type = "text";
        nameInput.value = point.name || `路径点 ${index + 1}`;
        nameInput.disabled = pathRoamPlaying;
        nameInput.dataset.pathRoamAction = "rename";
        nameInput.dataset.pathRoamId = point.id;

        const meta = document.createElement("div");
        meta.className = "pathRoamPointMeta";
        const timeLabel = document.createElement("label");
        timeLabel.className = "pathRoamPointTime";
        const timeText = document.createElement("span");
        timeText.textContent = `#${index + 1}`;
        const timeInput = document.createElement("input");
        timeInput.type = "number";
        timeInput.min = "0";
        timeInput.step = "0.1";
        timeInput.value = (Math.max(0, Number(point.time) || 0) / 1000).toFixed(1);
        timeInput.disabled = pathRoamPlaying || index === 0;
        timeInput.dataset.pathRoamAction = "time";
        timeInput.dataset.pathRoamId = point.id;
        timeLabel.append(timeText, timeInput);

        const stateBadges = document.createElement("div");
        stateBadges.className = "pathRoamStateBadges";
        const states = point.states || {};
        for (const [key, label] of [
            ["selection", "选择"],
            ["transform", "变换"],
            ["section", "剖切"],
            ["visibility", "显隐"]
        ]) {
            const badge = document.createElement("span");
            badge.className = states[key] ? "active" : "";
            badge.textContent = label;
            stateBadges.appendChild(badge);
        }
        meta.append(timeLabel, stateBadges);
        body.append(nameInput, meta);

        const moveUp = document.createElement("button");
        moveUp.type = "button";
        moveUp.textContent = "上";
        moveUp.disabled = pathRoamPlaying || index === 0;
        moveUp.dataset.pathRoamAction = "move-up";
        moveUp.dataset.pathRoamId = point.id;

        const moveDown = document.createElement("button");
        moveDown.type = "button";
        moveDown.textContent = "下";
        moveDown.disabled = pathRoamPlaying || index === points.length - 1;
        moveDown.dataset.pathRoamAction = "move-down";
        moveDown.dataset.pathRoamId = point.id;

        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = "恢复";
        restore.disabled = pathRoamPlaying;
        restore.dataset.pathRoamAction = "restore";
        restore.dataset.pathRoamId = point.id;

        const recapture = document.createElement("button");
        recapture.type = "button";
        recapture.textContent = "更新";
        recapture.disabled = pathRoamPlaying;
        recapture.dataset.pathRoamAction = "recapture";
        recapture.dataset.pathRoamId = point.id;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.disabled = pathRoamPlaying;
        remove.dataset.pathRoamAction = "delete";
        remove.dataset.pathRoamId = point.id;

        const actions = document.createElement("div");
        actions.className = "pathRoamPointActions";
        actions.append(moveUp, moveDown, restore, recapture, remove);

        item.append(body, actions);
        pathRoamList.appendChild(item);
    });
}

function setPathRoamPanelOpen(open, options = {}) {
    pathRoamPanelOpen = Boolean(open && currentModel);
    viewportPanelManager.setOpen("path-roam", pathRoamPanelOpen, {
        dispatch: options.fromPanelManager !== true,
        source: options.source || "path-roam-panel"
    });
    ensurePathRoamDocument();
    if (!pathRoamPanelOpen && pathRoamPlaying) {
        stopPathRoamPlayback({reset: true, silent: true});
    }
    renderPathRoamList();
    syncPathRoamControls();
    if (!options.silent) {
        setStatus(pathRoamPanelOpen ? "路径漫游面板已打开" : "路径漫游面板已关闭");
    }
}

function togglePathRoamPanel() {
    setPathRoamPanelOpen(!pathRoamPanelOpen);
}

function summarizePathRoamRoute(route) {
    return pathRoamDocumentController.summarizeRoute(route);
}

function summarizePathRoamPoint(point, index = 0) {
    return pathRoamDocumentController.summarizePoint(point, index);
}

function capturePathRoamKeyframeStates(options = {}) {
    return {
        selection: options.selection ?? getSelectionDetail("path-roam"),
        section: options.section ?? null,
        transform: options.transform ?? captureModelTransform(),
        visibility: options.visibility ?? null
    };
}

function listPathRoamRoutes() {
    ensurePathRoamDocument();
    return pathRoamDocumentController.listRoutes();
}

function listPathRoamPoints() {
    ensurePathRoamDocument();
    return pathRoamDocumentController.listPoints();
}

function createNewPathRoamRoute(options = {}) {
    if (!currentModel || pathRoamPlaying) {
        return null;
    }
    ensurePathRoamDocument();
    const route = pathRoamDocumentController.createRoute(options);
    pathRoamDocument = pathRoamDocumentController.document;
    pathRoamElapsedMs = 0;
    pathRoamPlaybackController.setElapsed(0);
    renderPathRoamList();
    syncPathRoamControls();
    setStatus(`已新建${route.name}`);
    log("Path roam route created", {
        modelId: currentModel.modelId,
        routeId: route.id,
        name: route.name
    });
    return route;
}

function switchPathRoamRoute(routeId) {
    if (!currentModel || pathRoamPlaying) {
        return null;
    }
    ensurePathRoamDocument();
    const route = pathRoamDocumentController.switchRoute(routeId);
    if (!route) {
        return null;
    }
    pathRoamDocument = pathRoamDocumentController.document;
    pathRoamElapsedMs = 0;
    pathRoamPlaybackController.setElapsed(0);
    renderPathRoamList();
    syncPathRoamControls();
    setStatus(`已切换到${route.name}`);
    return route;
}

function saveActivePathRoamRoute(options = {}) {
    if (!currentModel || pathRoamPlaying) {
        return null;
    }
    ensurePathRoamDocument();
    const route = pathRoamDocumentController.updateRoute({
        ...options,
        name: options.name ?? pathRoamNameInput?.value
    });
    pathRoamDocument = pathRoamDocumentController.document;
    renderPathRoamList();
    syncPathRoamControls();
    setStatus(`已保存${route.name}`);
    log("Path roam route saved", {
        modelId: currentModel.modelId,
        routeId: route.id,
        name: route.name,
        points: route.points.length
    });
    return route;
}

function deleteActivePathRoamRoute(routeId = null) {
    if (!currentModel || pathRoamPlaying) {
        return null;
    }
    ensurePathRoamDocument();
    if (pathRoamDocument.routes.length <= 1) {
        setStatus("至少保留一个漫游方案");
        return null;
    }
    const activeRoute = pathRoamDocumentController.deleteRoute(routeId);
    if (!activeRoute) {
        return null;
    }
    pathRoamDocument = pathRoamDocumentController.document;
    pathRoamElapsedMs = 0;
    pathRoamPlaybackController.setElapsed(0);
    renderPathRoamList();
    syncPathRoamControls();
    setStatus(`已删除${activeRoute.name}`);
    log("Path roam route deleted", {
        modelId: currentModel.modelId,
        routeId: activeRoute.id,
        name: activeRoute.name
    });
    return activeRoute;
}

function updatePathRoamPoint(pointId, patch = {}) {
    if (!currentModel || pathRoamPlaying) {
        return null;
    }
    ensurePathRoamDocument();
    const point = pathRoamDocumentController.updatePoint(pointId, patch);
    if (!point) {
        return null;
    }
    pathRoamDocument = pathRoamDocumentController.document;
    renderPathRoamList();
    syncPathRoamControls();
    setStatus(`已更新${point.name}`);
    return point;
}

function recapturePathRoamPoint(pointId) {
    if (!currentModel || pathRoamPlaying) {
        return null;
    }
    ensurePathRoamDocument();
    const point = pathRoamDocumentController.recapturePoint(
        pointId,
        getViewState(),
        capturePathRoamKeyframeStates()
    );
    if (!point) {
        return null;
    }
    pathRoamDocument = pathRoamDocumentController.document;
    renderPathRoamList();
    syncPathRoamControls();
    setStatus(`已用当前视角更新${point.name}`);
    return point;
}

function movePathRoamPoint(pointId, direction) {
    if (!currentModel || pathRoamPlaying) {
        return null;
    }
    ensurePathRoamDocument();
    const point = pathRoamDocumentController.movePoint(pointId, direction);
    if (!point) {
        return null;
    }
    pathRoamDocument = pathRoamDocumentController.document;
    renderPathRoamList();
    syncPathRoamControls();
    setStatus("关键帧顺序已调整");
    return point;
}

function capturePathRoamPoint(options = {}) {
    if (!currentModel) {
        return null;
    }
    ensurePathRoamDocument();
    const point = pathRoamDocumentController.addPoint({
        ...options,
        camera: getViewState(),
        states: capturePathRoamKeyframeStates(options.states || {})
    });
    if (!point) {
        return null;
    }
    pathRoamDocument = pathRoamDocumentController.document;
    renderPathRoamList();
    syncPathRoamControls();
    setStatus(`已添加${point.name}`);
    log("Path roam point added", {
        modelId: currentModel.modelId,
        routeId: getActivePathRoamRoute().id,
        point: {
            id: point.id,
            name: point.name,
            time: point.time,
            camera: point.camera
        }
    });
    return point;
}

async function restorePathRoamPoint(pointId) {
    const point = getPathRoamPoints().find((item) => item.id === pointId);
    if (!point) {
        return null;
    }
    renderEngine.restoreViewState(point.camera);
    if (point.states?.transform && applyModelTransformState(point.states.transform)) {
        commitCurrentModelTransform("path-keyframe-restore", {persist: false});
    }
    const selection = point.states?.selection;
    if (Array.isArray(selection?.localIds) && selection.localIds.length) {
        await selectLocalIds(selection.localIds, {
            primaryLocalId: selection.primaryLocalId,
            source: "path-keyframe"
        });
    } else if (selection && selection.count === 0) {
        await clearSelection("path-keyframe");
    }
    syncOverlays();
    autoSyncCompareViewIfLinked();
    scheduleFragmentsUpdate();
    setStatus(`已恢复${point.name}`);
    return point;
}

async function applyPathRoamKeyframeState(point) {
    if (!point?.states) {
        return false;
    }
    let changed = false;
    if (point.states.transform && applyModelTransformState(point.states.transform)) {
        commitCurrentModelTransform("path-keyframe-playback", {persist: false});
        changed = true;
    }
    const selection = point.states.selection;
    if (Array.isArray(selection?.localIds) && selection.localIds.length) {
        await selectLocalIds(selection.localIds, {
            primaryLocalId: selection.primaryLocalId,
            source: "path-keyframe-playback"
        });
        changed = true;
    } else if (selection && (selection.count === 0 || Array.isArray(selection.localIds))) {
        await clearSelection("path-keyframe-playback");
        changed = true;
    }
    if (changed) {
        syncOverlays();
        autoSyncCompareViewIfLinked();
        scheduleFragmentsUpdate();
    }
    return changed;
}

function deletePathRoamPoint(pointId) {
    ensurePathRoamDocument();
    const deleted = pathRoamDocumentController.deletePoint(pointId);
    if (!deleted) {
        return null;
    }
    pathRoamDocument = pathRoamDocumentController.document;
    renderPathRoamList();
    syncPathRoamControls();
    setStatus("路径点已删除");
    return deleted;
}

function clearPathRoamPoints() {
    ensurePathRoamDocument();
    pathRoamDocumentController.clearPoints();
    pathRoamDocument = pathRoamDocumentController.document;
    pathRoamElapsedMs = 0;
    pathRoamPlaybackController.setElapsed(0);
    renderPathRoamList();
    syncPathRoamControls();
    setStatus("路径点已清空");
}

function preparePathRoamPlayback() {
    canvas.parentElement.classList.add("pathRoamMode");
    modeHud.textContent = "路径漫游";
}

function startPathRoamPlayback() {
    const totalDuration = pathRoamPlaybackController.getTotalDuration();
    if (!currentModel || totalDuration <= 0) {
        setStatus("至少需要 2 个路径点才能播放");
        return;
    }
    requestToolMode(TOOL_MODES.PATH_ROAM, true, {source: "path-roam"});
    preparePathRoamPlayback();
    if (!pathRoamPlaybackController.play()) {
        requestToolMode(TOOL_MODES.PATH_ROAM, false, {source: "path-roam-unavailable"});
        return;
    }
    syncPathRoamPlaybackState();
    syncPathRoamControls();
    updateToolHud();
    setStatus("路径漫游播放中");
}

function pausePathRoamPlayback() {
    if (!pathRoamPlaybackController.pause()) {
        return;
    }
    syncPathRoamPlaybackState();
    requestToolMode(TOOL_MODES.PATH_ROAM, false, {source: "path-roam-pause"});
    canvas.parentElement.classList.remove("pathRoamMode");
    syncPathRoamControls();
    updateToolHud();
    setStatus("路径漫游已暂停");
}

function stopPathRoamPlayback(options = {}) {
    requestToolMode(TOOL_MODES.PATH_ROAM, false, options);
    pathRoamPlaybackController.stop({reset: options.reset !== false});
    syncPathRoamPlaybackState();
    canvas.parentElement.classList.remove("pathRoamMode");
    if (modeHud.textContent === "路径漫游") {
        modeHud.textContent = "Browse";
    }
    syncPathRoamControls();
    updateToolHud();
    if (!options.silent) {
        setStatus("路径漫游已停止");
    }
}

function completePathRoamPlayback() {
    syncPathRoamPlaybackState();
    requestToolMode(TOOL_MODES.PATH_ROAM, false, {
        source: "path-roam-complete",
        silent: true
    });
    canvas.parentElement.classList.remove("pathRoamMode");
    if (modeHud.textContent === "路径漫游") {
        modeHud.textContent = "Browse";
    }
    syncPathRoamControls();
    updateToolHud();
    setStatus("路径漫游播放完成");
}

function togglePathRoamPlayback() {
    if (!pathRoamPlaying || pathRoamPaused) {
        startPathRoamPlayback();
    } else {
        pausePathRoamPlayback();
    }
}

function getSectionOffsetRange() {
    const box = currentModel?.box;
    if (box && typeof box.getSize === "function" && !box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3());
        return Math.max(size.x, size.y, size.z, 1) * 0.65;
    }
    return 20;
}

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function seconds(started) {
    return Number(((performance.now() - started) / 1000).toFixed(2));
}

function errorMessage(error) {
    return String(error && error.message ? error.message : error);
}

const embedParams = new URLSearchParams(window.location.search);
const embedTargetOrigin = embedParams.get("embedOrigin") || "*";
const chromeHidden = embedParams.get("chrome") === "0" || embedParams.get("chrome") === "false";
if (chromeHidden) {
    document.body.classList.add("viewerChromeHidden");
}
let embedBridge = null;

function normalizeBusinessDataMode(value) {
    const mode = String(value || "").trim();
    return ["local", "manual", "backend"].includes(mode) ? mode : "manual";
}

function getBusinessDataModeLabel(mode) {
    return {
        local: "本地模式",
        manual: "手动同步模式",
        backend: "后端优先模式"
    }[normalizeBusinessDataMode(mode)];
}

if (businessDataBaseUrlInput) {
    businessDataBaseUrlInput.value = embedParams.get("businessDataBaseUrl")
        || readStoredText(BUSINESS_DATA_URL_STORAGE_KEY, "/api/business-data");
}
if (businessDataModeSelect) {
    businessDataModeSelect.value = normalizeBusinessDataMode(
        embedParams.get("businessDataMode") || readStoredText(BUSINESS_DATA_MODE_STORAGE_KEY, "manual")
    );
}
if (businessTenantIdInput) {
    businessTenantIdInput.value = embedParams.get("tenantId") || readStoredText(BUSINESS_TENANT_ID_STORAGE_KEY, "");
}
if (businessProjectIdInput) {
    businessProjectIdInput.value = embedParams.get("projectId") || readStoredText(BUSINESS_PROJECT_ID_STORAGE_KEY, "");
}
if (businessVersionIdInput) {
    businessVersionIdInput.value = embedParams.get("versionId")
        || embedParams.get("modelVersionId")
        || readStoredText(BUSINESS_VERSION_ID_STORAGE_KEY, "");
}
if (businessCreatedByInput) {
    businessCreatedByInput.value = embedParams.get("userId")
        || embedParams.get("createdBy")
        || readStoredText(BUSINESS_CREATED_BY_STORAGE_KEY, "");
}
if (businessDataAutoSyncInput) {
    businessDataAutoSyncInput.checked = embedParams.get("businessDataAutoSync") === "1"
        || readStoredText(BUSINESS_DATA_AUTO_SYNC_STORAGE_KEY, "0") === "1";
}
if (businessDataAutoPullInput) {
    businessDataAutoPullInput.checked = embedParams.get("businessDataAutoPull") === "1"
        || readStoredText(BUSINESS_DATA_AUTO_PULL_STORAGE_KEY, "0") === "1";
}

function getInitialModelSourceFromUrl() {
    const manifestUrl = embedParams.get("manifest") || embedParams.get("manifestUrl");
    const fragUrl = embedParams.get("model") || embedParams.get("modelUrl") || embedParams.get("fragUrl");
    const name = embedParams.get("name") || embedParams.get("modelName") || null;
    if (manifestUrl) {
        return {
            manifestUrl,
            name: name || manifestUrl.split("/").pop() || "manifest"
        };
    }
    if (fragUrl) {
        return {
            fragUrl,
            name: name || fragUrl.split("/").pop() || "model.frag"
        };
    }
    return null;
}

function postEmbedEvent(type, payload = {}, requestId = null) {
    if (embedBridge) {
        embedBridge.post(type, payload, requestId);
        return;
    }
}

function getViewState() {
    return {
        position: vectorToArray(camera.position),
        target: vectorToArray(controls.target),
        near: camera.near,
        far: camera.far,
        zoom: camera.zoom
    };
}

function getSelectionDetail(source = "viewer") {
    if (interactionEngine) {
        const selection = interactionEngine.getSelection();
        return {
            ...selection,
            source
        };
    }
    return {
        source,
        modelId: currentModel?.modelId || null,
        primaryLocalId: selectedPrimaryLocalId,
        localIds: selectedLocalIds,
        count: selectedLocalIds.length
    };
}

function getViewerState(source = "state") {
    return {
        modelId: currentModel?.modelId || null,
        modelName: currentModelName,
        hasModel: Boolean(currentModel),
        selection: getSelectionDetail(source),
        view: getViewState(),
        toolModes: toolModeController.getState(),
        models: modelRegistry.getState(),
        semanticIndex: currentModel ? semanticIndexController.getState(currentModel.modelId) : null,
        semanticIndexCache: {...semanticIndexCacheState},
        versionCompareTask: versionCompareTaskController.getState(),
        versionCompareWorkerMode: versionCompareController.mode,
        runtimeSdk: {commands: viewerRuntimeSdk.getSupportedCommands()},
        freeInspect: getFreeInspectMode(),
        pathRoam: getPathRoamMode()
    };
}

function normalizeEmbedLocalIds(payload = {}) {
    const source = Array.isArray(payload.localIds)
        ? payload.localIds
        : Array.isArray(payload.ids)
            ? payload.ids
            : [payload.localId ?? payload.id];
    return [...new Set(source
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value)))];
}

function normalizeEmbedGlobalIds(payload = {}) {
    const source = Array.isArray(payload.globalIds)
        ? payload.globalIds
        : Array.isArray(payload.guids)
            ? payload.guids
            : [payload.globalId ?? payload.guid];
    return [...new Set(source
        .map((value) => String(value || "").trim())
        .filter(Boolean))];
}

async function resolveLocalIdsByGlobalIds(globalIds) {
    const localIds = [];
    const missingGlobalIds = [];
    if (!semanticEngine || typeof semanticEngine.getLocalIdByGlobalId !== "function") {
        throw new Error("GlobalId lookup is not available");
    }
    for (const globalId of globalIds) {
        const localId = await semanticEngine.getLocalIdByGlobalId(globalId);
        if (typeof localId === "number") {
            localIds.push(localId);
        } else {
            missingGlobalIds.push(globalId);
        }
    }
    return {
        localIds: [...new Set(localIds)],
        missingGlobalIds
    };
}

async function resolveEmbedItemLocalId(payload = {}) {
    const localIds = normalizeEmbedLocalIds(payload);
    if (localIds.length) {
        return {
            localId: localIds[0],
            requestedGlobalId: null
        };
    }
    const globalIds = normalizeEmbedGlobalIds(payload);
    if (!globalIds.length) {
        throw new Error("getItemInfo requires localId or globalId");
    }
    const resolved = await resolveLocalIdsByGlobalIds([globalIds[0]]);
    if (!resolved.localIds.length) {
        throw new Error(`No localId found for GlobalId: ${globalIds[0]}`);
    }
    return {
        localId: resolved.localIds[0],
        requestedGlobalId: globalIds[0]
    };
}

async function resolveEmbedTargetLocalId(payload = {}) {
    const hasExplicitTarget = normalizeEmbedLocalIds(payload).length > 0 || normalizeEmbedGlobalIds(payload).length > 0;
    if (hasExplicitTarget) {
        return resolveEmbedItemLocalId(payload);
    }
    if (typeof selectedPrimaryLocalId === "number") {
        const info = await fetchItemInfo(selectedPrimaryLocalId);
        return {
            localId: selectedPrimaryLocalId,
            requestedGlobalId: info.globalId || info.guid || null
        };
    }
    throw new Error("Target component is required: pass localId/globalId or select a component first");
}

function normalizeEmbedBusinessFilter(payload = {}) {
    const nestedFilter = payload && typeof payload.filter === "object" && !Array.isArray(payload.filter)
        ? payload.filter
        : {};
    const source = {
        ...nestedFilter,
        ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {})
    };
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

function normalizeOptionalText(value) {
    const text = String(value ?? "").trim();
    return text || null;
}

function readStoredText(key, fallback = "") {
    try {
        return window.localStorage.getItem(key) || fallback;
    } catch {
        return fallback;
    }
}

function writeStoredText(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage can be disabled in embedded environments.
    }
}

function getBusinessContext() {
    return {
        tenantId: normalizeOptionalText(businessTenantIdInput?.value) || normalizeOptionalText(embedParams.get("tenantId")),
        projectId: normalizeOptionalText(businessProjectIdInput?.value) || normalizeOptionalText(embedParams.get("projectId")),
        modelId: normalizeOptionalText(currentModel?.modelId),
        versionId: normalizeOptionalText(businessVersionIdInput?.value)
            || normalizeOptionalText(embedParams.get("versionId") || embedParams.get("modelVersionId")),
        modelName: normalizeOptionalText(currentModelName),
        createdBy: normalizeOptionalText(businessCreatedByInput?.value)
            || normalizeOptionalText(embedParams.get("userId") || embedParams.get("createdBy"))
    };
}

function getBusinessFilter() {
    const context = getBusinessContext();
    return Object.fromEntries(Object.entries({
        tenantId: context.tenantId,
        projectId: context.projectId,
        modelId: context.modelId,
        versionId: context.versionId
    }).filter(([, value]) => value !== null && value !== ""));
}

function getBusinessDataBaseUrl() {
    return String(businessDataBaseUrlInput?.value || "").trim();
}

function getBusinessDataMode() {
    return normalizeBusinessDataMode(businessDataModeSelect?.value || "manual");
}

function isBusinessDataBackendEnabled() {
    return getBusinessDataMode() !== "local";
}

function isBusinessDataAutoSyncEnabled() {
    return Boolean(isBusinessDataBackendEnabled() && businessDataAutoSyncInput?.checked && getBusinessDataBaseUrl());
}

function isBusinessDataAutoPullEnabled() {
    return Boolean(isBusinessDataBackendEnabled() && businessDataAutoPullInput?.checked && getBusinessDataBaseUrl());
}

function applyBusinessDataMode(mode = getBusinessDataMode(), options = {}) {
    const normalizedMode = normalizeBusinessDataMode(mode);
    if (businessDataModeSelect) {
        businessDataModeSelect.value = normalizedMode;
    }
    if (businessDataAutoSyncInput) {
        businessDataAutoSyncInput.checked = normalizedMode === "backend";
    }
    if (businessDataAutoPullInput) {
        businessDataAutoPullInput.checked = normalizedMode === "backend";
    }
    if (options.persist !== false) {
        writeStoredText(BUSINESS_DATA_MODE_STORAGE_KEY, normalizedMode);
        writeStoredText(BUSINESS_DATA_AUTO_SYNC_STORAGE_KEY, businessDataAutoSyncInput?.checked ? "1" : "0");
        writeStoredText(BUSINESS_DATA_AUTO_PULL_STORAGE_KEY, businessDataAutoPullInput?.checked ? "1" : "0");
    }
    syncBusinessDataControls();
    return normalizedMode;
}

function createBusinessDataClient() {
    const baseUrl = getBusinessDataBaseUrl();
    if (!baseUrl) {
        throw new Error("请先填写业务数据接口地址");
    }
    return new BusinessDataApiClient({baseUrl});
}

function formatBusinessDataTime(value) {
    if (!value) {
        return "-";
    }
    try {
        return new Date(value).toLocaleTimeString("zh-CN", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    } catch {
        return "-";
    }
}

function updateBusinessDataSyncState(meta = {}) {
    const now = new Date().toISOString();
    if (meta.pull) {
        businessDataSyncState.lastPullAt = now;
    }
    if (meta.push) {
        businessDataSyncState.lastPushAt = now;
    }
    if (meta.autoSync) {
        businessDataSyncState.lastAutoSyncAt = now;
    }
    if (meta.error) {
        businessDataSyncState.lastErrorAt = now;
    }
}

function renderBusinessDataStatus() {
    if (businessDataStatus) {
        const mode = getBusinessDataModeLabel(getBusinessDataMode());
        const baseUrl = getBusinessDataBaseUrl();
        const lines = [
            businessDataStatusMessage || (baseUrl ? "业务数据接口已配置" : "未配置业务数据接口"),
            `模式：${mode}｜接口：${baseUrl || "未配置"}`,
            `最近拉取：${formatBusinessDataTime(businessDataSyncState.lastPullAt)}｜最近推送：${formatBusinessDataTime(businessDataSyncState.lastPushAt)}｜自动同步：${formatBusinessDataTime(businessDataSyncState.lastAutoSyncAt)}`,
            `最近错误：${formatBusinessDataTime(businessDataSyncState.lastErrorAt)}`
        ];
        businessDataStatus.textContent = lines.join("\n");
    }
}

function setBusinessDataStatus(message, meta = {}) {
    businessDataStatusMessage = message;
    updateBusinessDataSyncState(meta);
    renderBusinessDataStatus();
}

function syncBusinessDataControls(busy = false) {
    const backendEnabled = isBusinessDataBackendEnabled();
    const disabled = busy || !currentModel || !getBusinessDataBaseUrl() || !backendEnabled;
    if (businessDataModeSelect) {
        businessDataModeSelect.disabled = busy;
    }
    if (businessDataBaseUrlInput) {
        businessDataBaseUrlInput.disabled = busy;
    }
    for (const input of [businessTenantIdInput, businessProjectIdInput, businessVersionIdInput, businessCreatedByInput]) {
        if (input) {
            input.disabled = busy;
        }
    }
    if (businessDataAutoSyncInput) {
        businessDataAutoSyncInput.disabled = true;
    }
    if (businessDataAutoPullInput) {
        businessDataAutoPullInput.disabled = true;
    }
    if (pullBusinessDataBtn) {
        pullBusinessDataBtn.disabled = disabled;
    }
    if (pushBusinessDataBtn) {
        pushBusinessDataBtn.disabled = disabled;
    }
    if (pushSnapshotDataBtn) {
        pushSnapshotDataBtn.disabled = disabled;
    }
}

function toBusinessLabel(label) {
    const context = getBusinessContext();
    return {
        ...context,
        id: label.id,
        title: label.title || "标签",
        status: "active",
        localId: label.localId,
        globalId: label.globalId,
        position: label.position,
        content: {
            schemaVersion: "bim-label/v1",
            subtitle: label.subtitle || ""
        },
        createdAt: label.createdAt,
        updatedAt: label.updatedAt
    };
}

function toBusinessAnnotation(annotation) {
    const context = getBusinessContext();
    return createBusinessAnnotationPayload(annotation, context);
}

function toBusinessViewpoint(view) {
    const context = getBusinessContext();
    return {
        ...context,
        id: view.id,
        title: view.name || "视点",
        status: "active",
        camera: view.camera,
        selection: view.selection,
        thumbnail: view.snapshot,
        tags: Array.isArray(view.tags) ? view.tags : [],
        content: {
            schemaVersion: "bim-view-store/v1",
            name: view.name || "",
            note: view.note || ""
        },
        createdAt: view.createdAt,
        updatedAt: view.updatedAt
    };
}

function toBusinessSnapshot(snapshot) {
    const context = getBusinessContext();
    const timestamp = new Date().toISOString();
    return {
        ...context,
        id: `snapshot-${currentModel?.modelId || "model"}-${Date.now().toString(36)}`,
        title: snapshot.filename || "模型快照",
        status: "active",
        camera: getViewState(),
        selection: getSelectionDetail("snapshot"),
        thumbnail: snapshot.thumbnail
            ? {
                thumbnail: snapshot.thumbnail,
                mimeType: "image/jpeg",
                createdAt: timestamp
            }
            : null,
        content: {
            schemaVersion: "bim-snapshot/v1",
            filename: snapshot.filename || "",
            mimeType: snapshot.mimeType || "image/png",
            sizeBytes: snapshot.sizeBytes || 0
        },
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function toBusinessPayload(type, item) {
    if (type === "labels") {
        return toBusinessLabel(item);
    }
    if (type === "annotations") {
        return toBusinessAnnotation(item);
    }
    if (type === "viewpoints") {
        return toBusinessViewpoint(item);
    }
    throw new Error(`Unsupported auto sync type: ${type}`);
}

async function syncBusinessDataItem(type, item, action = "save") {
    if (!item?.id) {
        return null;
    }
    const client = createBusinessDataClient();
    if (action === "remove") {
        return client.remove(type, item.id);
    }
    return client.create(type, toBusinessPayload(type, item));
}

function autoSyncBusinessDataItem(type, item, action = "save") {
    if (!isBusinessDataAutoSyncEnabled() || !item?.id) {
        return;
    }
    syncBusinessDataItem(type, item, action)
        .then(() => {
            const verb = action === "remove" ? "删除" : "保存";
            setBusinessDataStatus(`自动同步成功：${verb} ${type}/${item.id}`, {autoSync: true});
            log("Business data auto synced", {type, id: item.id, action});
        })
        .catch((error) => {
            const verb = action === "remove" ? "删除" : "保存";
            setBusinessDataStatus(`自动同步失败：${verb} ${type}/${item.id}`, {error: true});
            log("Business data auto sync failed", {
                type,
                id: item.id,
                action,
                message: errorMessage(error)
            });
        });
}

function getBusinessContentText(content, keys = ["content", "text", "note"]) {
    if (typeof content === "string") {
        return content;
    }
    if (!content || typeof content !== "object" || Array.isArray(content)) {
        return "";
    }
    for (const key of keys) {
        const value = content[key];
        if (value !== undefined && value !== null && String(value).trim()) {
            return String(value);
        }
    }
    return "";
}

function clearCurrentModelBusinessDataBeforeBackendPull() {
    if (getBusinessDataMode() !== "backend" || !currentModel?.modelId) {
        return {
            labels: 0,
            annotations: 0,
            viewpoints: 0
        };
    }
    return {
        labels: labelStoreEngine.clear({modelId: currentModel.modelId}),
        annotations: annotationEngine.clear({modelId: currentModel.modelId}),
        viewpoints: typeof viewStoreEngine.clearCurrentModel === "function"
            ? viewStoreEngine.clearCurrentModel()
            : 0
    };
}

function importBusinessLabel(item) {
    if (!item?.id || !item.position) {
        return false;
    }
    labelStoreEngine.save({
        id: item.id,
        modelId: item.modelId || currentModel?.modelId,
        modelName: item.modelName || currentModelName,
        localId: item.localId,
        globalId: item.globalId,
        position: item.position,
        title: item.title || "标签",
        subtitle: item.content?.subtitle || "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    });
    return true;
}

function importBusinessAnnotation(item) {
    if (!item?.id) {
        return false;
    }
    const annotation = {
        id: item.id,
        modelId: item.modelId || currentModel?.modelId,
        modelName: item.modelName || currentModelName,
        localId: item.localId,
        globalId: item.globalId,
        title: item.title || "模型批注",
        content: getBusinessContentText(item.content, ["content", "text"]) || item.title || "",
        camera: item.camera,
        selection: item.selection,
        position: item.position,
        status: item.status || "open",
        priority: item.priority || "normal",
        createdBy: item.createdBy || item.content?.createdBy || null,
        updatedBy: item.updatedBy || item.content?.updatedBy || item.createdBy || null,
        assignee: item.assignee || item.content?.assignee || null,
        permission: item.permission || item.content?.permission || "team",
        history: Array.isArray(item.history) ? item.history : (Array.isArray(item.content?.history) ? item.content.history : []),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    };
    if (annotationEngine.get(item.id)) {
        annotationEngine.update(item.id, annotation, {history: false});
    } else {
        annotationEngine.create(annotation);
    }
    return true;
}

function importBusinessViewpoint(item) {
    if (!item?.id || !item.camera) {
        return false;
    }
    const view = {
        id: item.id,
        name: item.content?.name || item.title || "视点",
        modelId: item.modelId || currentModel?.modelId,
        modelName: item.modelName || currentModelName,
        camera: item.camera,
        selection: item.selection,
        snapshot: item.thumbnail,
        tags: Array.isArray(item.tags) ? item.tags : [],
        note: getBusinessContentText(item.content, ["note", "content", "text"]),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
    };
    if (viewStoreEngine.get(item.id)) {
        viewStoreEngine.update(item.id, view);
    } else {
        viewStoreEngine.save(view);
    }
    return true;
}

function isRestorableBusinessSnapshot(item) {
    return Boolean(item?.id && (item.camera || item.selection || item.thumbnail));
}

function getBusinessSnapshotThumbnail(item) {
    if (typeof item?.thumbnail === "string") {
        return item.thumbnail;
    }
    return item?.thumbnail?.thumbnail || item?.thumbnail?.dataUrl || item?.content?.thumbnail || "";
}

function renderBusinessSnapshotList(items = businessSnapshotItems) {
    if (!businessSnapshotList) {
        return;
    }
    businessSnapshotList.textContent = "";
    if (!currentModel) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "加载模型后显示远端快照";
        businessSnapshotList.appendChild(empty);
        return;
    }
    if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "拉取远端后显示快照记录";
        businessSnapshotList.appendChild(empty);
        return;
    }

    for (const snapshot of items.slice(0, 12)) {
        const item = document.createElement("div");
        item.className = "miniItem businessSnapshotItem";

        const thumbnail = document.createElement("div");
        thumbnail.className = "viewThumbnail";
        const thumbnailUrl = getBusinessSnapshotThumbnail(snapshot);
        if (thumbnailUrl) {
            const image = document.createElement("img");
            image.alt = "";
            image.src = thumbnailUrl;
            thumbnail.appendChild(image);
        } else {
            thumbnail.textContent = "No preview";
        }

        const body = document.createElement("div");
        body.className = "viewItemBody";

        const title = document.createElement("div");
        title.className = "miniItemTitle";
        title.textContent = snapshot.title || snapshot.content?.filename || "远端快照";

        const meta = document.createElement("div");
        meta.className = "miniItemMeta";
        const selectionCount = snapshot.selection?.count || snapshot.selection?.localIds?.length || 0;
        meta.textContent = `${formatShortDate(snapshot.updatedAt || snapshot.createdAt)} · ${selectionCount ? `${selectionCount} 个构件` : "无选择"}`;

        const actions = document.createElement("div");
        actions.className = "miniItemActions";

        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = "恢复";
        restore.disabled = !snapshot.camera && !snapshot.selection?.localIds?.length;
        restore.addEventListener("click", () => restoreBusinessSnapshot(snapshot.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除远端";
        remove.addEventListener("click", () => removeBusinessSnapshot(snapshot.id));

        actions.append(restore, remove);
        body.append(title, meta, actions);
        item.append(thumbnail, body);
        businessSnapshotList.appendChild(item);
    }
}

async function restoreBusinessSnapshot(id) {
    const snapshot = businessSnapshotItems.find((item) => item.id === id);
    if (!snapshot) {
        setStatus("未找到远端快照");
        return false;
    }
    if (snapshot.camera) {
        viewpointEngine.restore({camera: snapshot.camera});
    }
    const localIds = Array.isArray(snapshot.selection?.localIds)
        ? snapshot.selection.localIds.map(Number).filter(Number.isFinite)
        : [];
    if (localIds.length) {
        await selectLocalIds(localIds, {
            primaryLocalId: Number.isFinite(Number(snapshot.selection?.primaryLocalId))
                ? Number(snapshot.selection.primaryLocalId)
                : localIds[0],
            source: "business-snapshot"
        });
    }
    scheduleFragmentsUpdate();
    setStatus(`已恢复远端快照：${snapshot.title || snapshot.content?.filename || snapshot.id}`);
    log("Business snapshot restored", {
        id: snapshot.id,
        selectionCount: localIds.length,
        hasCamera: Boolean(snapshot.camera)
    });
    return true;
}

async function removeBusinessSnapshot(id) {
    const snapshot = businessSnapshotItems.find((item) => item.id === id);
    if (!snapshot) {
        setStatus("未找到远端快照");
        return false;
    }
    const client = createBusinessDataClient();
    syncBusinessDataControls(true);
    setBusinessDataStatus("正在删除远端快照...");
    try {
        const result = await client.removeSnapshot(id);
        businessSnapshotItems = businessSnapshotItems.filter((item) => item.id !== id);
        renderBusinessSnapshotList();
        const removed = result?.removed !== false;
        const message = removed ? "远端快照已删除" : "远端快照未删除";
        setBusinessDataStatus(message, removed ? {push: true} : {});
        setStatus(message);
        log("Business snapshot removed", {
            id,
            removed,
            title: snapshot.title || snapshot.content?.filename || null
        });
        return removed;
    } catch (error) {
        const message = `远端快照删除失败：${errorMessage(error)}`;
        setBusinessDataStatus(message, {error: true});
        setStatus(message);
        log("Business snapshot remove failed", {
            id,
            message: errorMessage(error)
        });
        return false;
    } finally {
        syncBusinessDataControls(false);
    }
}

async function pushBusinessData() {
    if (!currentModel) {
        return;
    }
    const client = createBusinessDataClient();
    syncBusinessDataControls(true);
    setBusinessDataStatus("正在推送本地业务数据...");
    try {
        const labels = labelStoreEngine.list().map(toBusinessLabel);
        const annotations = annotationEngine.list({all: false}).map(toBusinessAnnotation);
        const viewpoints = viewStoreEngine.list().map(toBusinessViewpoint);
        for (const label of labels) {
            await client.createLabel(label);
        }
        for (const annotation of annotations) {
            await client.createAnnotation(annotation);
        }
        for (const viewpoint of viewpoints) {
            await client.createViewpoint(viewpoint);
        }
        const message = `已推送：标签 ${labels.length}，批注 ${annotations.length}，视点 ${viewpoints.length}`;
        setBusinessDataStatus(message, {push: true});
        setStatus(message);
        log("Business data pushed", {
            labels: labels.length,
            annotations: annotations.length,
            viewpoints: viewpoints.length,
            filter: getBusinessFilter()
        });
    } catch (error) {
        const message = `业务数据推送失败：${errorMessage(error)}`;
        setBusinessDataStatus(message, {error: true});
        setStatus(message);
        log("Business data push failed", {message: errorMessage(error)});
    } finally {
        syncBusinessDataControls(false);
    }
}

async function pullBusinessData() {
    if (!currentModel) {
        return;
    }
    const client = createBusinessDataClient();
    syncBusinessDataControls(true);
    setBusinessDataStatus("正在拉取远端业务数据...");
    try {
        const filter = getBusinessFilter();
        const [labelsResult, annotationsResult, viewpointsResult, snapshotsResult] = await Promise.all([
            client.listLabels(filter),
            client.listAnnotations(filter),
            client.listViewpoints(filter),
            client.listSnapshots(filter)
        ]);
        const cleared = clearCurrentModelBusinessDataBeforeBackendPull();
        const labels = labelsResult.items.filter(importBusinessLabel);
        const annotations = annotationsResult.items.filter(importBusinessAnnotation);
        const viewpoints = viewpointsResult.items.filter(importBusinessViewpoint);
        businessSnapshotItems = snapshotsResult.items.filter(isRestorableBusinessSnapshot);
        renderLabelList();
        renderLabelBubbles();
        renderAnnotationList();
        renderViewList();
        renderBusinessSnapshotList();
        syncViewControls();
        refreshBubbles();
        const clearSummary = getBusinessDataMode() === "backend"
            ? `；已按远端优先清理本地：标签 ${cleared.labels}，批注 ${cleared.annotations}，视点 ${cleared.viewpoints}`
            : "";
        const message = `已拉取：标签 ${labels.length}/${labelsResult.items.length}，批注 ${annotations.length}/${annotationsResult.items.length}，视点 ${viewpoints.length}/${viewpointsResult.items.length}，快照 ${businessSnapshotItems.length}/${snapshotsResult.items.length}${clearSummary}`;
        setBusinessDataStatus(message, {pull: true});
        setStatus(message);
        log("Business data pulled", {
            labels: labels.length,
            annotations: annotations.length,
            viewpoints: viewpoints.length,
            snapshots: businessSnapshotItems.length,
            cleared,
            filter
        });
    } catch (error) {
        const message = `业务数据拉取失败：${errorMessage(error)}`;
        setBusinessDataStatus(message, {error: true});
        setStatus(message);
        log("Business data pull failed", {message: errorMessage(error)});
    } finally {
        syncBusinessDataControls(false);
    }
}

function autoPullBusinessDataAfterModelLoad() {
    if (!isBusinessDataAutoPullEnabled() || !currentModel) {
        return;
    }
    setBusinessDataStatus("模型已加载，正在自动拉取远端业务数据...");
    pullBusinessData().catch((error) => {
        setBusinessDataStatus(`自动拉取失败：${errorMessage(error)}`, {error: true});
        log("Business data auto pull failed", {message: errorMessage(error)});
        syncBusinessDataControls(false);
    });
}

async function pushCurrentSnapshotToBusinessData() {
    if (!currentModel) {
        return;
    }
    const client = createBusinessDataClient();
    syncBusinessDataControls(true);
    setBusinessDataStatus("正在生成并推送当前快照...");
    try {
        const snapshot = await snapshotEngine.create({
            download: false,
            returnBlob: false,
            returnDataUrl: false,
            returnThumbnail: true,
            thumbnail: {
                maxWidth: 360,
                maxHeight: 220,
                quality: 0.76
            },
            modelName: currentModelName || currentModel?.modelId || "bim-view"
        });
        const item = await client.createSnapshot(toBusinessSnapshot(snapshot));
        if (item) {
            businessSnapshotItems = [item, ...businessSnapshotItems.filter((snapshotItem) => snapshotItem.id !== item.id)];
            renderBusinessSnapshotList();
        }
        const message = `快照已推送：${item?.title || snapshot.filename}`;
        setBusinessDataStatus(message, {push: true});
        setStatus(message);
        log("Business snapshot pushed", {
            id: item?.id || null,
            filename: snapshot.filename,
            sizeBytes: snapshot.sizeBytes
        });
    } catch (error) {
        const message = `快照推送失败：${errorMessage(error)}`;
        setBusinessDataStatus(message, {error: true});
        setStatus(message);
        log("Business snapshot push failed", {message: errorMessage(error)});
    } finally {
        syncBusinessDataControls(false);
    }
}

function normalizeEmbedListLimit(payload = {}, fallback = 100) {
    const limit = Number(payload.limit ?? payload.pageSize ?? fallback);
    if (!Number.isFinite(limit) || limit <= 0) {
        return fallback;
    }
    return Math.min(Math.floor(limit), 500);
}

function log(message, data) {
    const time = new Date().toLocaleTimeString();
    const line = data === undefined ? `[${time}] ${message}` : `[${time}] ${message} ${JSON.stringify(data)}`;
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log(message, data ?? "");
}

function setStatus(value) {
    statusEl.textContent = value;
}

function setSelectionControlsEnabled(enabled) {
    [
        locateBtn,
        hideBtn,
        isolateBtn,
        colorBtn,
        resetColorBtn,
        isolateModeSelect,
        isolateOpacityInput,
        refreshPropsBtn,
        opacityInput
    ].forEach((element) => {
        element.disabled = !enabled;
    });
    syncIsolateOpacityControls();
}

function setNoSelectionState() {
    selectedHud.textContent = "-";
    selectedCategory.textContent = "未选择构件";
    selectedId.textContent = "-";
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    setBasicProps({});
    clearAttributes();
    setSelectionControlsEnabled(false);
}

function resetTreeDataCaches() {
    treeLabelCache = new Map();
    treeBasicInfoCache = new Map();
    treeBasicInfoInflight = new Map();
    treeLocalIdsCache = new WeakMap();
    treeSearchInfoCache = new Map();
}

function setBusy(busy) {
    viewerBusy = Boolean(busy);
    fileInput.disabled = busy;
    loadUrlBtn.disabled = busy;
    loadManifestBtn.disabled = busy;
    syncModelManagerControls(busy);
    runValidationBtn.disabled = busy || !currentModel;
    exportValidationBtn.disabled = busy || !lastModelValidationReport;
    fitBtn.disabled = busy || !currentModel;
    expandTreeBtn.disabled = busy || !currentTree;
    showAllBtn.disabled = busy || !currentModel;
    boxSelectBtn.disabled = busy || !currentModel;
    openTreeDialogBtn.disabled = busy || !currentTree;
    saveViewStoreBtn.disabled = busy || !currentModel;
    viewNameInput.disabled = busy || !currentModel;
    viewCategoryInput.disabled = busy || !currentModel;
    viewCategoryFilter.disabled = busy || !currentModel;
    createAnnotationBtn.disabled = busy || !currentModel;
    annotationInput.disabled = busy || !currentModel;
    annotationScopeFilter.disabled = busy || !currentModel;
    annotationStatusFilter.disabled = busy || !currentModel;
    annotationStatusInput.disabled = busy || !currentModel;
    annotationPriorityInput.disabled = busy || !currentModel;
    if (annotationAssigneeInput) {
        annotationAssigneeInput.disabled = busy || !currentModel;
    }
    if (annotationPermissionInput) {
        annotationPermissionInput.disabled = busy || !currentModel;
    }
    createPersistentLabelBtn.disabled = busy || !currentModel;
    labelTitleInput.disabled = busy || !currentModel;
    showAllBubblesInput.disabled = busy || !currentModel;
    if (bubbleClusterInput) {
        bubbleClusterInput.disabled = busy || !currentModel;
    }
    syncRelocateControls();
    zoneModeSelect.disabled = busy || !currentModel;
    refreshZonesBtn.disabled = busy || !currentModel;
    resetZonesBtn.disabled = busy || !currentModel;
    treeSearchInput.disabled = busy || !currentModel;
    treeSearchClearBtn.disabled = busy || (!treeSearchInput.value && !activeTreeSearchQuery);
    setBimToolControlsEnabled(!busy && Boolean(currentModel));
    setSelectionControlsEnabled(!busy && selectedLocalIds.length > 0);
    if (roamBtn) {
        roamBtn.disabled = busy || !currentModel;
    }
    if (roamSpeedInput) {
        roamSpeedInput.disabled = busy || !currentModel;
    }
    syncRoamSpeedControls();
    syncPathRoamControls();
    syncModelTransformControls(busy);
    syncViewControls(busy);
    syncDualViewControls();
    syncCompareControls();
    syncZoneControls(busy);
    syncBusinessDataControls(busy);
}

function setBimToolControlsEnabled(enabled) {
    [
        snapBtn,
        measureBtn,
        angleMeasureBtn,
        areaMeasureBtn,
        labelBtn,
        sectionBtn,
        clearLabelBtn
    ].forEach((element) => {
        if (element) {
            element.disabled = !enabled;
        }
    });
    syncMeasurementControls();
    syncSectionControls();
}

function setViewportToolDockCollapsed(collapsed, options = {}) {
    const isCollapsed = Boolean(collapsed);
    if (!viewportToolDock || !viewportToolDockToggle) {
        return;
    }
    viewportToolDock.classList.toggle("collapsed", isCollapsed);
    viewportToolDockToggle.setAttribute("aria-expanded", String(!isCollapsed));
    viewportToolDockToggle.title = isCollapsed ? "展开工具栏" : "向右收起工具栏";
    const icon = viewportToolDockToggle.querySelector("span");
    if (icon) {
        icon.textContent = isCollapsed ? "工具" : "收起";
    }
    if (options.persist !== false) {
        writeStoredText(VIEWPORT_TOOL_DOCK_COLLAPSED_STORAGE_KEY, isCollapsed ? "1" : "0");
    }
}

function restoreViewportToolDockState() {
    setViewportToolDockCollapsed(
        readStoredText(VIEWPORT_TOOL_DOCK_COLLAPSED_STORAGE_KEY, "0") === "1",
        {persist: false}
    );
}

const rightInspectorTabController = rightInspectorTabs.length
    ? new TabStateController(rightInspectorTabs.map((button) => button.dataset.rightInspectorTab))
    : null;
const workspaceTabController = workspaceDrawerTabs.length
    ? new TabStateController(workspaceDrawerTabs.map((button) => button.dataset.workspaceTab))
    : null;
const settingsTabController = settingsDrawerTabs.length
    ? new TabStateController(settingsDrawerTabs.map((button) => button.dataset.settingsTab))
    : null;

function setRightInspectorTab(tab = "component", options = {}) {
    if (!rightInspectorTabController) {
        return;
    }
    const nextTab = rightInspectorTabController.select(tab);
    for (const button of rightInspectorTabs) {
        const active = button.dataset.rightInspectorTab === nextTab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
        if (active && options.focus === true) {
            button.focus();
        }
    }
    for (const panel of rightInspectorPanels) {
        const active = panel.dataset.rightInspectorPanel === nextTab;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
    }
    if (nextTab === "compare") {
        renderVersionCompareList().catch((error) => {
            log("Version compare panel render failed", {message: errorMessage(error)});
        });
    }
    if (options.persist !== false) {
        writeStoredText(RIGHT_INSPECTOR_TAB_STORAGE_KEY, nextTab);
    }
}

function restoreRightInspectorTabState() {
    setRightInspectorTab(readStoredText(RIGHT_INSPECTOR_TAB_STORAGE_KEY, "component"), {persist: false});
}

function setWorkspaceTab(tab = "views", options = {}) {
    if (!workspaceTabController) {
        return;
    }
    const nextTab = workspaceTabController.select(tab);
    for (const button of workspaceDrawerTabs) {
        const active = button.dataset.workspaceTab === nextTab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
        if (active && options.focus === true) {
            button.focus();
        }
    }
    for (const panel of workspacePanels) {
        const active = panel.dataset.workspacePanel === nextTab;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
    }
    if (nextTab === "views") {
        renderViewList();
    } else if (nextTab === "zones") {
        renderZoneList().catch((error) => log("Zone drawer render failed", {message: errorMessage(error)}));
    } else if (nextTab === "annotations") {
        renderAnnotationList();
    } else if (nextTab === "labels") {
        renderLabelList();
    }
    if (options.persist !== false) {
        writeStoredText(WORKSPACE_TAB_STORAGE_KEY, nextTab);
    }
}

function setWorkspaceDrawerOpen(open, options = {}) {
    if (!workspaceDrawerOverlay) {
        return;
    }
    const nextOpen = Boolean(open);
    if (nextOpen && isSettingsDrawerOpen()) {
        setSettingsDrawerOpen(false, {restoreFocus: false});
    }
    workspaceDrawerOverlay.hidden = !nextOpen;
    document.body.classList.toggle("workspaceDrawerOpen", nextOpen);
    openWorkspaceDrawerBtn?.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) {
        setWorkspaceTab(options.tab || readStoredText(WORKSPACE_TAB_STORAGE_KEY, "views"));
        requestAnimationFrame(() => closeWorkspaceDrawerBtn?.focus());
    } else if (options.restoreFocus !== false) {
        openWorkspaceDrawerBtn?.focus();
    }
}

function isWorkspaceDrawerOpen() {
    return Boolean(workspaceDrawerOverlay && !workspaceDrawerOverlay.hidden);
}

function setSettingsTab(tab = "business", options = {}) {
    if (!settingsTabController) {
        return;
    }
    const nextTab = settingsTabController.select(tab);
    for (const button of settingsDrawerTabs) {
        const active = button.dataset.settingsTab === nextTab;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
        if (active && options.focus === true) {
            button.focus();
        }
    }
    for (const panel of settingsPanels) {
        const active = panel.dataset.settingsPanel === nextTab;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
    }
    if (nextTab === "business") {
        renderBusinessSnapshotList();
        syncBusinessDataControls(viewerBusy);
    }
    if (options.persist !== false) {
        writeStoredText(SETTINGS_TAB_STORAGE_KEY, nextTab);
    }
}

function setSettingsDrawerOpen(open, options = {}) {
    if (!settingsDrawerOverlay) {
        return;
    }
    const nextOpen = Boolean(open);
    if (nextOpen && isWorkspaceDrawerOpen()) {
        setWorkspaceDrawerOpen(false, {restoreFocus: false});
    }
    settingsDrawerOverlay.hidden = !nextOpen;
    document.body.classList.toggle("settingsDrawerOpen", nextOpen);
    openSettingsDrawerBtn?.setAttribute("aria-expanded", String(nextOpen));
    if (nextOpen) {
        setSettingsTab(options.tab || readStoredText(SETTINGS_TAB_STORAGE_KEY, "business"));
        requestAnimationFrame(() => closeSettingsDrawerBtn?.focus());
    } else if (options.restoreFocus !== false) {
        openSettingsDrawerBtn?.focus();
    }
}

function isSettingsDrawerOpen() {
    return Boolean(settingsDrawerOverlay && !settingsDrawerOverlay.hidden);
}

function mountWorkspaceDrawerAtDocumentRoot() {
    if (workspaceDrawerOverlay && workspaceDrawerOverlay.parentElement !== document.body) {
        document.body.append(workspaceDrawerOverlay);
    }
    if (settingsDrawerOverlay && settingsDrawerOverlay.parentElement !== document.body) {
        document.body.append(settingsDrawerOverlay);
    }
}

function updateToolHud(options = {}) {
    if (options.immediate === true) {
        toolHudUpdatePending = false;
        renderToolHud();
        return;
    }
    if (toolHudUpdatePending) {
        return;
    }
    toolHudUpdatePending = true;
    queueMicrotask(() => {
        toolHudUpdatePending = false;
        renderToolHud();
    });
}

function renderToolHud() {
    const active = [];
    if (boxSelectEnabled) {
        active.push(lastBoxSelectSummary
            ? `框选:${lastBoxSelectSummary.count}个/${lastBoxSelectSummary.elapsedMs}ms`
            : "框选");
    }
    if (ctrlLookState) {
        active.push("原地视角");
    }
    if (relocateTarget) {
        active.push("气泡调位");
    }
    if (snapEnabled) {
        active.push("捕捉");
    }
    if (measureEnabled) {
        const state = measurementEngine.getState();
        if (state.mode === "angle") {
            active.push(state.pendingCount ? `角度: ${state.pendingCount}/3` : "角度");
        } else if (state.mode === "area") {
            active.push(state.pendingCount ? `面积: ${state.pendingCount}` : "面积");
        } else {
            active.push(state.pendingStart ? "测量: 终点" : "测量");
        }
    }
    if (sectionEnabled) {
        const state = sectionEngine.getState();
        if (state.mode === "box") {
            active.push(`剖切盒:${state.activePlaneIndex + 1}/${state.planes.length}`);
        } else if (state.planes.length > 1) {
            active.push(`多剖切:${state.activePlaneIndex + 1}/${state.planes.length}`);
        } else {
            active.push(`剖切:${state.axis.toUpperCase()}`);
        }
    }
    if (roamEnabled) {
        active.push("自由巡检");
    }
    if (pathRoamPlaying) {
        active.push(pathRoamPaused ? "路径暂停" : "路径漫游");
    } else if (pathRoamPanelOpen) {
        active.push("路径编辑");
    }
    if (modelTransformEnabled) {
        active.push(modelTransformMode === "rotate" ? "模型旋转" : "模型平移");
    }
    toolHud.textContent = active.length ? active.join(" / ") : "-";
    if (exitActiveToolBtn) {
        exitActiveToolBtn.hidden = active.length === 0;
    }
}

function syncMeasurementControls(state = measurementEngine.getState()) {
    const hasModel = Boolean(currentModel);
    const hasMeasurements = state.count > 0;
    const hasPending = Boolean(state.pendingStart);
    if (undoMeasureBtn) {
        undoMeasureBtn.disabled = !hasModel || (!hasMeasurements && !hasPending);
    }
    if (clearMeasureBtn) {
        clearMeasureBtn.disabled = !hasModel || (!hasMeasurements && !hasPending);
    }
    if (angleMeasureBtn) {
        angleMeasureBtn.disabled = !hasModel;
    }
    if (areaMeasureBtn) {
        areaMeasureBtn.disabled = !hasModel;
    }
    syncAreaMeasureHint(state);
}

function syncAreaMeasureHint(state = measurementEngine.getState(), message = "") {
    if (!areaMeasureHint) {
        return;
    }
    const isAreaActive = Boolean(currentModel && measureEnabled && state.mode === "area");
    areaMeasureHint.hidden = !isAreaActive;
    if (!isAreaActive) {
        areaMeasureHint.textContent = "";
        areaMeasureHint.classList.remove("warning");
        return;
    }
    areaMeasureHint.classList.toggle("warning", Boolean(message));
    if (message) {
        areaMeasureHint.textContent = message;
        return;
    }
    if (state.mode === "area" && state.pendingCount === 0 && lastMeasureResult?.type === "area") {
        const text = getMeasurementText(lastMeasureResult);
        if (text) {
            areaMeasureHint.textContent = `面积测量完成：${text}`;
            return;
        }
    }
    if (state.mode === "area" && state.pendingArea?.text) {
        areaMeasureHint.textContent = `已选择 ${state.pendingCount} 个点。当前面积：${state.pendingArea.text}。可继续沿同一方向选择，或双击完成面积；不能交叉选点。`;
        return;
    }
    areaMeasureHint.textContent = state.pendingCount < 3
        ? `已选择 ${state.pendingCount} 个点。请按顺时针或逆时针沿边界选择面积点，不能交叉选点。`
        : `已选择 ${state.pendingCount} 个点。可继续沿同一方向选择，或双击完成面积；不能交叉选点。`;
}

function syncSectionControls(state = sectionEngine.getState()) {
    const hasModel = Boolean(currentModel);
    const enabled = hasModel && state.enabled;
    [clearSectionBtn, sectionOffsetInput].forEach((element) => {
        if (element) {
            element.disabled = !enabled;
        }
    });
    if (sectionModeSelect) {
        sectionModeSelect.disabled = !hasModel;
    }
    if (sectionPlaneSelect) {
        sectionPlaneSelect.disabled = !enabled;
    }
    sectionBtn?.classList.toggle("active", enabled);
    syncSectionCompactControls(state);
    syncSectionOffsetInput(state);
}

function syncSectionCompactControls(state = sectionEngine.getState()) {
    if (sectionModeSelect) {
        const axisKey = getSectionAxisKey(state.axis);
        const value = state.mode === "box"
            ? "box"
            : state.mode === "multi" || (state.planes?.length || 0) > 1
                ? "multi"
                : `single-${axisKey}`;
        if (sectionModeSelect.value !== value) {
            sectionModeSelect.value = value;
        }
    }
    if (!sectionPlaneSelect) {
        return;
    }
    const planes = Array.isArray(state.planes) && state.planes.length ? state.planes : [state.plane];
    const activeValue = String(Math.max(0, state.activePlaneIndex || 0));
    const options = planes.map((_, index) => ({
        value: String(index),
        label: `切面 ${index + 1}/${planes.length}`
    }));
    if (state.mode === "multi") {
        options.push({value: "add", label: "+ 新增切面"});
    }
    const signature = options.map((option) => `${option.value}:${option.label}`).join("|");
    if (sectionPlaneSelect.dataset.signature !== signature) {
        sectionPlaneSelect.replaceChildren(...options.map((option) => {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            return element;
        }));
        sectionPlaneSelect.dataset.signature = signature;
    }
    sectionPlaneSelect.value = options.some((option) => option.value === activeValue) ? activeValue : "0";
}

function getSectionAxisKey(axis) {
    const value = String(axis || "x").toLowerCase();
    if (value.includes("y")) {
        return "y";
    }
    if (value.includes("z")) {
        return "z";
    }
    return "x";
}

async function ensureFragments() {
    if (viewerApp) {
        return viewerApp;
    }

    const workerURL = new URL("../node_modules/@thatopen/fragments/dist/Worker/worker.mjs", window.location.href).href;
    viewerApp = await BimViewerApp.create({
        scene,
        camera,
        workerUrl: workerURL,
        maxWorkers: Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4))
    });
    fragments = viewerApp.fragments;
    viewerApp.addEventListener("progress", (event) => log("Fragments load progress", event.detail));
    return viewerApp;
}

function getModelSourceLabel(source = {}, result = {}) {
    return source.name
        || source.manifestUrl
        || source.fragUrl
        || result.manifest?.resources?.fragments?.url
        || result.name
        || result.modelId
        || "model";
}

function registerManagedModel(result, source = {}) {
    result.model.object.updateMatrixWorld(true);
    const objectBox = result.model.box && !result.model.box.isEmpty()
        ? result.model.box.clone()
        : new THREE.Box3().setFromObject(result.model.object);
    const inverseInitialMatrix = result.model.object.matrixWorld.clone().invert();
    const localBox = objectBox.clone().applyMatrix4(inverseInitialMatrix);
    const initialTransform = captureModelTransform(result.model.object);
    const entry = {
        modelId: result.model.modelId,
        model: result.model,
        manifest: result.manifest || null,
        name: result.manifest?.displayName || result.name || result.model.modelId,
        source: getModelSourceLabel(source, result),
        visible: true,
        loadedAt: new Date().toISOString(),
        originalBox: objectBox.clone(),
        localBox,
        box: objectBox.clone(),
        semanticEngine: null,
        localIds: null
    };
    modelRegistry.register(entry, {
        role: MODEL_ROLES.MANAGED,
        assembly: true,
        source: "managed-load"
    });
    modelRegistry.setBounds(entry.modelId, {
        originalBounds: objectBox,
        localBounds: localBox,
        currentBounds: objectBox
    }, {
        dispatch: false,
        source: "managed-load"
    });
    modelRegistry.setTransform(entry.modelId, initialTransform, {
        kind: "initial",
        dispatch: false,
        source: "managed-load"
    });
    modelRegistry.setTransform(entry.modelId, initialTransform, {
        kind: "current",
        dispatch: false,
        source: "managed-load"
    });
    entry.model.object.visible = true;
    setRegisteredModelLayer(entry.modelId, 0, {source: "managed-load"});
    syncManagedModelsSceneState();
    renderModelManagerList();
    return entry;
}

function getManagedModelEntry(modelId = currentModel?.modelId) {
    const entry = modelId ? modelRegistry.get(modelId) : null;
    return entry?.assembly === true ? entry : null;
}

function getManagedModelEntries() {
    return modelRegistry.list({assembly: true});
}

function getManagedModelIds() {
    return getManagedModelEntries().map((entry) => entry.modelId);
}

function getManagedModelCount() {
    return getManagedModelEntries().length;
}

function syncManagedModelsSceneState() {
    for (const entry of getManagedModelEntries()) {
        if (!entry?.model?.object) {
            continue;
        }
        if (entry.model.object.parent !== scene) {
            scene.add(entry.model.object);
        }
        const isActive = entry.model.modelId === currentModel?.modelId;
        entry.model.object.visible = entry.visible !== false && (managedModelsOverlayEnabled || isActive);
        setRegisteredModelLayer(entry.modelId, 0, {
            dispatch: false,
            source: "managed-scene-sync"
        });
    }
}

async function applyManagedModelsOverlayStyle() {
    if (!getManagedModelCount()) {
        return;
    }
    const tasks = [];
    for (const entry of getManagedModelEntries()) {
        const model = entry?.model;
        if (!model) {
            continue;
        }
        if (typeof model.resetOpacity === "function") {
            tasks.push(model.resetOpacity(undefined));
        }
    }
    if (tasks.length) {
        await Promise.allSettled(tasks);
    }
}

function syncModelManagerControls(busy = viewerBusy) {
    for (const element of [appendFragFileInput, appendModelUrlInput, appendManifestUrlInput, appendModelBtn]) {
        if (element) {
            element.disabled = busy;
        }
    }
    const modelCount = getManagedModelCount();
    const canManagePlacement = modelCount > 1 && !busy;
    if (overlayModelsBtn) {
        overlayModelsBtn.disabled = modelCount < 2 || busy;
        overlayModelsBtn.classList.toggle("active", managedModelsOverlayEnabled);
        overlayModelsBtn.textContent = "叠加显示";
    }
    if (spreadModelsBtn) {
        spreadModelsBtn.disabled = !canManagePlacement;
    }
    if (resetModelsPlacementBtn) {
        resetModelsPlacementBtn.disabled = !canManagePlacement;
    }
    if (modelManagerCount) {
        modelManagerCount.textContent = `${modelCount} 个模型`;
    }
}

function getModelRoleLabel(role) {
    if (role === MODEL_ROLES.PRIMARY) {
        return "主模型";
    }
    if (role === MODEL_ROLES.COMPARE) {
        return "对比模型";
    }
    return "装配模型";
}

function renderModelManagerList() {
    syncModelManagerControls();
    if (!modelManagerList || !modelManagerEmpty) {
        return;
    }
    modelManagerList.textContent = "";
    const entries = getManagedModelEntries();
    modelManagerEmpty.hidden = entries.length > 0;
    modelManagerList.hidden = entries.length === 0;
    for (const entry of entries) {
        const item = document.createElement("div");
        item.className = "modelManagerItem";
        item.classList.toggle("active", entry.modelId === currentModel?.modelId);
        item.classList.toggle("hiddenModel", !entry.visible);
        item.dataset.modelId = entry.modelId;

        const title = document.createElement("div");
        title.className = "modelManagerTitle";
        const name = document.createElement("strong");
        name.textContent = entry.name;
        name.title = entry.name;
        const state = document.createElement("span");
        state.textContent = entry.modelId === currentModel?.modelId
            ? (entry.lifecycle === MODEL_LIFECYCLE.DISPOSING ? "卸载中" : "当前")
            : entry.lifecycle === MODEL_LIFECYCLE.DISPOSING
                ? "卸载中"
                : entry.role === MODEL_ROLES.COMPARE
                    ? "对比"
                    : (entry.visible ? "显示" : "隐藏");
        title.append(name, state);

        const meta = document.createElement("div");
        meta.className = "modelManagerMeta";
        meta.textContent = `${getModelRoleLabel(entry.role)}｜${entry.modelId}｜${entry.localIds?.length ?? "-"} 构件`;
        meta.title = entry.source;

        const actions = document.createElement("div");
        actions.className = "modelManagerActions";
        const activate = document.createElement("button");
        activate.type = "button";
        activate.textContent = "设为当前";
        activate.disabled = viewerBusy || entry.lifecycle === MODEL_LIFECYCLE.DISPOSING || entry.modelId === currentModel?.modelId;
        activate.dataset.modelAction = "activate";
        const fit = document.createElement("button");
        fit.type = "button";
        fit.textContent = "定位";
        fit.disabled = viewerBusy || entry.lifecycle === MODEL_LIFECYCLE.DISPOSING;
        fit.dataset.modelAction = "fit";
        const visible = document.createElement("button");
        visible.type = "button";
        visible.textContent = entry.visible ? "隐藏" : "显示";
        visible.disabled = viewerBusy || entry.lifecycle === MODEL_LIFECYCLE.DISPOSING;
        visible.dataset.modelAction = "visibility";
        const unload = document.createElement("button");
        unload.type = "button";
        unload.textContent = "卸载";
        unload.disabled = viewerBusy || entry.lifecycle === MODEL_LIFECYCLE.DISPOSING;
        unload.dataset.modelAction = "unload";
        actions.append(activate, fit, visible, unload);
        item.append(title, meta, actions);
        modelManagerList.append(item);
    }
}

async function clearActiveModelState(options = {}) {
    if (options.clearCompare !== false) {
        await clearCompareModel({silent: true});
    }
    setPathRoamPanelOpen(false, {silent: true});
    cancelRelocateTarget("model-clear", {silent: true, source: "model-clear"});
    if (ctrlLookState) {
        cancelCtrlLookMode({silent: true, source: "model-clear"});
    }
    pathRoamDocument = null;
    pathRoamElapsedMs = 0;
    pathRoamPlaybackController.setElapsed(0);
    setModelTransformEnabled(false, {silent: true});
    currentModel = null;
    currentAllLocalIds = [];
    currentTree = null;
    currentModelName = null;
    currentModelInitialTransform = null;
    semanticEngine = null;
    interactionEngine = null;
    businessSnapshotItems = [];
    activeIsolateMode = null;
    lastModelValidationReport = null;
    resetTreeDataCaches();
    resetTreeSearchState();
    await clearSemanticSearchIndex();
    activeTreeNode = null;
    selectedLocalIds = [];
    selectedPrimaryLocalId = null;
    refreshSelectionHighlight();
    setBoxSelectEnabled(false, {silent: true, source: "model-clear"});
    contextMenu.hidden = true;
    setRoamEnabled(false, {silent: true, source: "model-clear"});
    setSnapEnabled(false, {silent: true, source: "model-clear"});
    setMeasureEnabled(false, undefined, {silent: true, source: "model-clear"});
    setSectionEnabled(false, {silent: true, source: "model-clear"});
    toolModeController.reset({source: "model-clear"});
    measurementEngine.updateModel(null);
    syncMeasurementControls();
    hideMeasureResult();
    sectionEngine.setBounds(null);
    labelEngine.updateModel(null);
    labelEngine.updateSemanticEngine(null);
    labelEngine.clear();
    showAllBubbles = false;
    showAllBubblesInput.checked = false;
    if (bubbleClusterFrame !== null) {
        cancelAnimationFrame(bubbleClusterFrame);
        bubbleClusterFrame = null;
    }
    bubbleClusterEngine.clear();
    updateBubbleClusterStatus({
        enabled: bubbleClusterEnabled,
        itemCount: 0,
        clusterCount: 0,
        clusteredCount: 0
    });
    syncRelocateControls();
    zoneEngine.updateModel(null);
    zoneEngine.updateSemanticEngine(null);
    clearAnnotationMarkers();
    sectionEngine.clear();
    hideSnapMarker();
    viewStoreEngine.setCurrentModel(null, null);
    annotationEngine.setCurrentModel(null, null);
    labelStoreEngine.setCurrentModel(null, null);
    editingViewId = null;
    cancelAnnotationEdit();
    cancelLabelEdit();
    renderViewList();
    renderAnnotationList();
    renderLabelList();
    renderBusinessSnapshotList();
    renderZoneList();
    cameraControlManager.reset({source: "model-clear"});
    itemStat.textContent = "-";
    renderValidationEmpty();
    setNoSelectionState();
    renderTree(null);
    showAllBtn.disabled = true;
    fitBtn.disabled = true;
    if (roamBtn) {
        roamBtn.disabled = true;
    }
    syncPathRoamControls();
    syncModelTransformControls();
    expandTreeBtn.disabled = true;
    openTreeDialogBtn.disabled = true;
    setBimToolControlsEnabled(false);
    syncDualViewControls();
    renderModelManagerList();
}

async function activateManagedModel(modelId, options = {}) {
    const entry = getManagedModelEntry(modelId);
    if (!entry) {
        return null;
    }
    const changing = currentModel?.modelId !== entry.modelId;
    if (changing) {
        await clearActiveModelState({clearCompare: options.clearCompare !== false});
    }
    currentModel = entry.model;
    currentModelName = entry.name;
    modelRegistry.setPrimary(entry.modelId, {source: "managed-activate"});
    entry.visible = true;
    currentModel.object.visible = true;
    syncManagedModelsSceneState();
    currentModelInitialTransform = modelRegistry.getTransform(entry.modelId, "initial")
        || captureModelTransform(currentModel.object);
    if (viewerApp) {
        viewerApp.currentModel = currentModel;
        viewerApp.currentManifest = entry.manifest;
    }
    restoreStoredModelTransform();
    pathRoamDocument = loadPathRoamDocument();
    pathRoamElapsedMs = 0;
    pathRoamPlaybackController.setElapsed(0);
    businessSnapshotItems = [];
    lastModelValidationReport = null;
    resetTreeDataCaches();
    resetTreeSearchState();
    semanticEngine = entry.semanticEngine || new SemanticQueryEngine({model: currentModel});
    if (!entry.semanticEngine) {
        await semanticEngine.init();
        entry.semanticEngine = semanticEngine;
    }
    treeDialogEngine.updateSemanticEngine(semanticEngine);
    measurementEngine.updateModel(currentModel);
    syncMeasurementControls();
    sectionEngine.setBounds(getCurrentModelBox());
    labelEngine.updateModel(currentModel);
    labelEngine.updateSemanticEngine(semanticEngine);
    viewStoreEngine.setCurrentModel(currentModel.modelId, currentModelName);
    annotationEngine.setCurrentModel(currentModel.modelId, currentModelName);
    labelStoreEngine.setCurrentModel(currentModel.modelId, currentModelName);
    zoneEngine.updateModel(currentModel);
    zoneEngine.updateSemanticEngine(semanticEngine);
    interactionEngine = new InteractionEngine({
        model: currentModel,
        camera,
        canvas,
        semanticEngine,
        highlightMaterial,
        getHighlightLocalIds: filterSelectionHighlightLocalIds,
        getViewportRect: () => renderEngine.getMainViewportRect()
    });
    viewpointEngine.interactionEngine = interactionEngine;
    interactionEngine.addEventListener("fitrequested", (event) => {
        fitBox(event.detail.box, `selected:${event.detail.selection.count}`);
    });
    interactionEngine.addEventListener("selectionchanged", (event) => {
        syncSelectionFromEngine(event.detail).catch((error) => {
            log("Selection sync failed", {message: errorMessage(error)});
        });
    });
    currentTree = await semanticEngine.getTree(currentTreeTab);
    entry.localIds = entry.localIds || await semanticEngine.getLocalIds();
    currentAllLocalIds = entry.localIds;
    await renderActiveTree();
    renderViewList();
    renderBusinessSnapshotList();
    renderPathRoamList();
    renderLabelBubbles();
    renderLabelList();
    renderAnnotationList();
    await renderZoneList();
    openTreeDialogBtn.disabled = false;
    runValidationBtn.disabled = false;
    itemStat.textContent = `${currentAllLocalIds.length}`;
    fileStat.textContent = currentModelName;
    setStatus(options.status || `当前模型：${currentModelName}`);
    modeHud.textContent = "Browse";
    boxSelectBtn.disabled = false;
    setBimToolControlsEnabled(true);
    syncPathRoamControls();
    syncModelTransformControls();
    syncDualViewControls();
    syncCompareControls();
    renderModelManagerList();
    startSemanticSearchIndex(entry, semanticEngine).catch((error) => {
        log("Semantic index build failed", {
            modelId: entry.modelId,
            message: errorMessage(error)
        });
    });
    const managedModelCount = getManagedModelCount();
    if (options.autoAlignOverlay === true && managedModelsOverlayEnabled && managedModelCount > 1 && managedModelsPlacementMode !== "spread") {
        alignManagedModelsForOverlay({onlyWhenFar: true});
        syncManagedModelsSceneState();
    }
    await applyManagedModelsOverlayStyle();
    syncManagedModelsSceneState();
    if (options.fit !== false) {
        const box = managedModelsOverlayEnabled && managedModelCount > 1
            ? getVisibleManagedModelsBox()
            : getCurrentModelBox();
        fitBox(box, managedModelsOverlayEnabled && managedModelCount > 1 ? "多模型范围" : "模型范围");
    }
    await flushFragmentsUpdate({force: true});
    if (options.autoPull !== false) {
        autoPullBusinessDataAfterModelLoad();
    }
    return entry;
}

async function disposeRegisteredModel(modelId, options = {}) {
    if (!viewerApp || !modelId) {
        return false;
    }
    const transition = modelRegistry.beginDispose(modelId, {
        source: options.source || "dispose"
    });
    if (transition.entry && !transition.started) {
        log("Model dispose skipped", {
            modelId,
            lifecycle: transition.entry.lifecycle,
            source: options.source || "dispose"
        });
        return false;
    }
    renderModelManagerList();
    try {
        await viewerApp.disposeModel(modelId);
        if (transition.entry) {
            modelRegistry.completeDispose(modelId, {
                unregister: options.unregister !== false,
                source: options.source || "dispose"
            });
        }
        return true;
    } catch (error) {
        if (transition.entry) {
            modelRegistry.failDispose(modelId, error, {
                source: options.source || "dispose"
            });
        }
        throw error;
    } finally {
        renderModelManagerList();
    }
}

async function disposeManagedModels() {
    if (!viewerApp) {
        for (const modelId of getManagedModelIds()) {
            modelRegistry.unregister(modelId, {source: "managed-dispose"});
        }
        renderModelManagerList();
        return;
    }
    const modelIds = getManagedModelIds();
    for (const modelId of modelIds) {
        await disposeRegisteredModel(modelId, {source: "managed-dispose"});
    }
    renderModelManagerList();
}

async function disposeCurrentModel() {
    if (!currentModel || !fragments) {
        return;
    }

    const modelId = currentModel.modelId;
    await clearActiveModelState({clearCompare: true});
    await disposeManagedModels();
    renderEngine.setDualViewEnabled(false);
    syncDualViewBodyClasses();
    syncDualViewControls();
    log("Model disposed", {modelId});
}

async function loadModelSource(source) {
    setBusy(true);
    setStatus("Loading");
    logEl.textContent = "";
    const sourceName = source.name || source.manifestUrl || source.fragUrl || "model";
    fileStat.textContent = source.buffer ? `${sourceName} (${mb(source.buffer.byteLength)} MB)` : sourceName;
    loadStat.textContent = "-";
    itemStat.textContent = "-";
    modeHud.textContent = "Loading";
    const started = performance.now();

    try {
        if (!source.append) {
            await disposeCurrentModel();
        }
        const app = await ensureFragments();
        log("Model load start", {
            source: sourceName,
            type: source.manifestUrl ? "manifest" : source.fragUrl ? "url" : "buffer",
            append: source.append === true
        });

        const result = await app.openModel({
            ...source,
            disposeExisting: false,
            setCurrent: false
        });
        const entry = registerManagedModel(result, source);
        await activateManagedModel(entry.modelId, {
            fit: true,
            clearCompare: true,
            autoPull: true,
            autoAlignOverlay: source.append === true,
            status: source.append ? `已追加并切换到：${entry.name}` : "Loaded"
        });
        fileStat.textContent = source.buffer
            ? `${currentModelName} (${mb(source.buffer.byteLength)} MB)`
            : currentModelName;

        log("Model semantic data ready", {
            seconds: seconds(started),
            localIds: currentAllLocalIds.length
        });

        loadStat.textContent = `${seconds(started)}s`;
        setStatus(source.append ? "模型已追加" : "Loaded");
        modeHud.textContent = "Browse";
        log("Fragments load complete", {
            seconds: seconds(started),
            box: boxToArray(getCurrentModelBox()),
            manifest: result.manifest?.manifestUrl || null
        });
        postEmbedEvent("modelLoaded", {
            modelId: currentModel.modelId,
            name: currentModelName,
            manifestUrl: result.manifest?.manifestUrl || null,
            localIds: currentAllLocalIds.length,
            seconds: seconds(started),
            box: boxToArray(getCurrentModelBox()),
            view: getViewState()
        }, source.requestId || null);
    } catch (error) {
        setStatus(`加载失败：${errorMessage(error)}`);
        modeHud.textContent = "Failed";
        log("Fragments load failed", {message: errorMessage(error)});
        console.error(error);
        postEmbedEvent("modelLoadFailed", {
            source: sourceName,
            message: errorMessage(error)
        }, source.requestId || null);
    } finally {
        setBusy(false);
    }
}

function shouldAppendNextModel() {
    return getManagedModelCount() > 0;
}

async function appendModelFromManagerInputs() {
    const file = appendFragFileInput?.files?.[0] || null;
    const manifestUrl = String(appendManifestUrlInput?.value || "").trim();
    const fragUrl = String(appendModelUrlInput?.value || "").trim();
    if (!file && !manifestUrl && !fragUrl) {
        setStatus("请选择追加模型文件或填写 URL");
        return;
    }
    const source = file
        ? {file, name: file.name}
        : manifestUrl
            ? {manifestUrl}
            : {fragUrl};
    await loadModelSource({
        ...source,
        append: true
    });
    if (appendFragFileInput) {
        appendFragFileInput.value = "";
    }
}

function fitManagedModel(modelId) {
    const entry = getManagedModelEntry(modelId);
    if (!entry?.model) {
        return;
    }
    const box = getManagedModelBox(entry);
    fitBox(box, entry.name);
}

function getManagedModelBox(entry) {
    if (!entry?.model?.object) {
        return null;
    }
    const registeredBounds = modelRegistry.getBounds(entry.modelId, "current");
    if (registeredBounds) {
        return registeredBounds;
    }
    const localBounds = modelRegistry.getBounds(entry.modelId, "local")
        || (entry.localBox && !entry.localBox.isEmpty() ? entry.localBox.clone() : null);
    return localBounds
        ? localBounds.applyMatrix4(entry.model.object.matrixWorld)
        : new THREE.Box3().setFromObject(entry.model.object);
}

function getManagedModelOriginalBox(entry) {
    if (!entry?.model?.object) {
        return null;
    }
    const registeredBounds = modelRegistry.getBounds(entry.modelId, "original");
    if (registeredBounds) {
        return registeredBounds;
    }
    const box = getManagedModelBox(entry);
    if (box && !box.isEmpty()) {
        modelRegistry.setBounds(entry.modelId, {originalBounds: box}, {
            dispatch: false,
            source: "bounds-fallback"
        });
        return box;
    }
    return null;
}

function getVisibleManagedModelsBox() {
    return modelRegistry.getCombinedBounds({
        modelIds: getManagedModelIds(),
        visibleOnly: true,
        kind: "current"
    });
}

function getManagedModelsDistanceStats(entries = getManagedModelEntries()) {
    const boxes = entries
        .filter((entry) => entry?.model?.object && entry.visible !== false)
        .map((entry) => getManagedModelOriginalBox(entry) || getManagedModelBox(entry))
        .filter((box) => box && !box.isEmpty());
    if (boxes.length < 2) {
        return null;
    }
    const centers = boxes.map((box) => box.getCenter(new THREE.Vector3()));
    const sizes = boxes.map((box) => box.getSize(new THREE.Vector3()));
    const maxModelSize = sizes.reduce((max, size) => Math.max(max, size.x, size.y, size.z), 1);
    let maxCenterDistance = 0;
    for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
            maxCenterDistance = Math.max(maxCenterDistance, centers[i].distanceTo(centers[j]));
        }
    }
    return {
        maxModelSize,
        maxCenterDistance,
        ratio: maxCenterDistance / Math.max(maxModelSize, 1)
    };
}

function shouldAutoAlignManagedModels(entries = getManagedModelEntries()) {
    const stats = getManagedModelsDistanceStats(entries);
    return Boolean(stats && stats.ratio > 8);
}

function alignManagedModelsForOverlay(options = {}) {
    const entries = getManagedModelEntries().filter((entry) => entry?.model?.object && entry.visible !== false);
    if (entries.length < 2) {
        return false;
    }
    if (options.onlyWhenFar !== false && !shouldAutoAlignManagedModels(entries)) {
        return false;
    }
    const baseEntry = entries[0];
    const baseBox = getManagedModelOriginalBox(baseEntry) || getManagedModelBox(baseEntry);
    if (!baseBox || baseBox.isEmpty()) {
        return false;
    }
    const targetCenter = baseBox.getCenter(new THREE.Vector3());
    for (const entry of entries) {
        const base = modelRegistry.getTransform(entry.modelId, "initial") || captureModelTransform(entry.model.object) || {
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        };
        const sourceBox = getManagedModelOriginalBox(entry) || getManagedModelBox(entry);
        if (!sourceBox || sourceBox.isEmpty()) {
            continue;
        }
        const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
        const delta = targetCenter.clone().sub(sourceCenter);
        const overlayTransform = {
            ...base,
            position: [
                Number(base.position?.[0] || 0) + delta.x,
                Number(base.position?.[1] || 0) + delta.y,
                Number(base.position?.[2] || 0) + delta.z
            ]
        };
        applyManagedModelTransform(entry, overlayTransform);
        modelRegistry.setTransform(entry.modelId, captureModelTransform(entry.model.object) || overlayTransform, {
            kind: "overlay",
            dispatch: false,
            source: "overlay-align"
        });
    }
    managedModelsPlacementMode = "overlay";
    return true;
}

function getManagedModelSpreadBase(entry) {
    const overlayTransform = entry ? modelRegistry.getTransform(entry.modelId, "overlay") : null;
    if (overlayTransform && (managedModelsPlacementMode === "overlay" || managedModelsPlacementMode === "spread" || shouldAutoAlignManagedModels())) {
        return overlayTransform;
    }
    return (entry ? modelRegistry.getTransform(entry.modelId, "initial") : null) || captureModelTransform(entry?.model?.object) || {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    };
}

function refreshManagedModelBounds(entry, options = {}) {
    if (!entry?.model?.object) {
        return;
    }
    entry.model.object.updateMatrixWorld(true);
    const localBounds = modelRegistry.getBounds(entry.modelId, "local")
        || (entry.localBox && !entry.localBox.isEmpty() ? entry.localBox.clone() : null);
    const currentBounds = localBounds
        ? localBounds.applyMatrix4(entry.model.object.matrixWorld)
        : new THREE.Box3().setFromObject(entry.model.object);
    modelRegistry.setBounds(entry.modelId, {currentBounds}, {
        dispatch: false,
        source: "transform"
    });
    if (entry.model.modelId === currentModel?.modelId && options.syncActive !== false) {
        sectionEngine.setBounds(currentBounds);
        syncModelTransformControls();
    }
}

function applyManagedModelTransform(entry, state, options = {}) {
    if (!entry?.model?.object || !state) {
        return false;
    }
    const applied = applyModelTransformState(state, entry.model.object);
    if (applied) {
        modelRegistry.setTransform(entry.modelId, captureModelTransform(entry.model.object) || state, {
            kind: options.kind || "current",
            dispatch: false,
            source: options.source || "managed-transform"
        });
        refreshManagedModelBounds(entry);
    }
    return applied;
}

async function spreadManagedModelsForPreview() {
    const entries = getManagedModelEntries().filter((entry) => entry?.model?.object);
    if (entries.length < 2) {
        setStatus("至少需要两个模型才能错开展示");
        return;
    }
    if (shouldAutoAlignManagedModels(entries) && entries.some((entry) => !modelRegistry.getTransform(entry.modelId, "overlay"))) {
        alignManagedModelsForOverlay({onlyWhenFar: false});
    }
    const boxes = entries.map((entry) => getManagedModelOriginalBox(entry)).filter(Boolean);
    const maxSize = boxes.reduce((max, box) => {
        const size = box.getSize(new THREE.Vector3());
        return Math.max(max, size.x, size.y, size.z);
    }, 1);
    const spacing = Math.max(maxSize * 1.15, 1);
    const offsetStart = -((entries.length - 1) * spacing) / 2;
    entries.forEach((entry, index) => {
        entry.visible = true;
        entry.model.object.visible = true;
        const base = getManagedModelSpreadBase(entry);
        applyManagedModelTransform(entry, {
            ...base,
            position: [
                Number(base.position?.[0] || 0) + offsetStart + index * spacing,
                Number(base.position?.[1] || 0),
                Number(base.position?.[2] || 0)
            ]
        });
    });
    managedModelsPlacementMode = "spread";
    syncManagedModelsSceneState();
    renderModelManagerList();
    syncOverlays();
    scheduleFragmentsUpdate({force: true});
    await applyManagedModelsOverlayStyle();
    const allBox = getVisibleManagedModelsBox();
    if (allBox) {
        fitBox(allBox, "多模型范围");
    }
    await flushFragmentsUpdate({force: true});
    setStatus("已错开展示多模型，便于确认是否同时加载");
    log("Managed models spread for preview", {
        count: entries.length,
        spacing
    });
}

async function resetManagedModelsPlacement() {
    const entries = getManagedModelEntries().filter((entry) => entry?.model?.object);
    if (!entries.length) {
        return;
    }
    const restoreOverlay = entries.length > 1 && shouldAutoAlignManagedModels(entries);
    if (restoreOverlay) {
        const aligned = alignManagedModelsForOverlay({onlyWhenFar: false});
        if (!aligned) {
            return;
        }
    } else {
        for (const entry of entries) {
            const initial = modelRegistry.getTransform(entry.modelId, "initial") || {
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scale: [1, 1, 1]
            };
            applyManagedModelTransform(entry, initial);
            if (entry.model.modelId === currentModel?.modelId) {
                clearStoredModelTransform();
            }
        }
        managedModelsPlacementMode = "original";
    }
    syncManagedModelsSceneState();
    renderModelManagerList();
    syncOverlays();
    scheduleFragmentsUpdate({force: true});
    await applyManagedModelsOverlayStyle();
    const allBox = getVisibleManagedModelsBox();
    if (allBox) {
        fitBox(allBox, "多模型范围");
    }
    await flushFragmentsUpdate({force: true});
    setStatus(restoreOverlay ? "原始坐标距离过远，已复位到叠加对齐位置" : "多模型位置已复位到加载时状态");
    log("Managed models placement reset", {count: entries.length, restoreOverlay});
}

async function setManagedModelVisible(modelId, visible) {
    const entry = getManagedModelEntry(modelId);
    if (!entry?.model?.object) {
        return false;
    }
    entry.visible = Boolean(visible);
    modelRegistry.update(modelId, {visible: entry.visible}, {
        source: "visibility"
    });
    syncManagedModelsSceneState();
    renderModelManagerList();
    syncOverlays();
    scheduleFragmentsUpdate({force: true});
    await applyManagedModelsOverlayStyle();
    await flushFragmentsUpdate({force: true});
    setStatus(`${entry.name} 已${entry.visible ? "显示" : "隐藏"}`);
    log("Managed model visibility changed", {
        modelId,
        visible: entry.visible
    });
    return true;
}

async function enableManagedModelsOverlay() {
    managedModelsOverlayEnabled = true;
    for (const entry of getManagedModelEntries()) {
        if (entry?.model?.object) {
            entry.visible = true;
            entry.model.object.visible = true;
        }
    }
    const stats = getManagedModelsDistanceStats();
    const aligned = alignManagedModelsForOverlay({onlyWhenFar: true});
    syncManagedModelsSceneState();
    renderModelManagerList();
    await applyManagedModelsOverlayStyle();
    const box = getVisibleManagedModelsBox();
    if (box) {
        fitBox(box, "多模型范围");
    }
    await flushFragmentsUpdate({force: true});
    setStatus(aligned
        ? "模型坐标距离过远，已按中心点对齐叠加显示；可点“复位”回到真实坐标"
        : "已恢复多模型叠加显示；若模型重合，可点击“错开”查看");
    log("Managed model overlay enabled", {
        count: getManagedModelCount(),
        aligned,
        distanceRatio: stats ? Number(stats.ratio.toFixed(2)) : null
    });
}

async function unloadManagedModel(modelId) {
    const entry = getManagedModelEntry(modelId);
    if (!entry || !viewerApp) {
        return false;
    }
    const wasActive = currentModel?.modelId === modelId;
    if (wasActive) {
        await clearActiveModelState({clearCompare: true});
    }
    const disposed = await disposeRegisteredModel(modelId, {source: "managed-unload"});
    if (!disposed) {
        return false;
    }
    if (wasActive) {
        const next = getManagedModelEntries()[0] || null;
        if (next) {
            await activateManagedModel(next.modelId, {
                fit: true,
                clearCompare: false,
                autoPull: true,
                status: `已切换到：${next.name}`
            });
        }
    }
    renderModelManagerList();
    scheduleFragmentsUpdate({force: true});
    setStatus(`已卸载模型：${entry.name}`);
    log("Managed model unloaded", {modelId, wasActive});
    return true;
}

function boxToArray(box) {
    if (!box || box.isEmpty()) {
        return null;
    }
    return [
        Number(box.min.x.toFixed(3)),
        Number(box.min.y.toFixed(3)),
        Number(box.min.z.toFixed(3)),
        Number(box.max.x.toFixed(3)),
        Number(box.max.y.toFixed(3)),
        Number(box.max.z.toFixed(3))
    ];
}

function fitCurrentModel() {
    if (!currentModel) {
        return;
    }
    const box = getCurrentModelBox();
    fitBox(box, "模型范围");
}

function fitBox(box, label = "model") {
    if (!renderEngine.fitBox(box, label)) {
        log("Fit skipped: empty box", {label});
        return;
    }
    scheduleFragmentsUpdate();
    log("Camera fit", {label, box: boxToArray(box)});
}

async function fitSelected() {
    if (!interactionEngine || selectedLocalIds.length === 0) {
        return;
    }
    await interactionEngine.fitSelection();
}

function setNamedView(viewName) {
    if (!currentModel) {
        return;
    }

    const box = getCurrentModelBox();
    if (!renderEngine.setNamedView(viewName, box)) {
        return;
    }
    scheduleFragmentsUpdate();
}

function runPageRuntimeCommand(command, payload = {}) {
    return viewerRuntimeSdk.execute(command, payload, {source: "page"}).catch((error) => {
        setStatus(`操作失败：${errorMessage(error)}`);
        log("Viewer runtime SDK command failed", {command, message: errorMessage(error)});
        return null;
    });
}

function getCurrentModelBox() {
    if (!currentModel) {
        return null;
    }
    const registeredBounds = modelRegistry.getBounds(currentModel.modelId, "current");
    if (registeredBounds) {
        return registeredBounds;
    }
    return currentModel.box && !currentModel.box.isEmpty()
        ? currentModel.box.clone()
        : new THREE.Box3().setFromObject(currentModel.object);
}

function getCompareModelBox() {
    if (!compareModel) {
        return null;
    }
    const registeredBounds = modelRegistry.getBounds(compareModel.modelId, "current");
    if (registeredBounds) {
        return registeredBounds;
    }
    return compareModel.box && !compareModel.box.isEmpty()
        ? compareModel.box.clone()
        : new THREE.Box3().setFromObject(compareModel.object);
}

function syncDualViewControls() {
    const hasModel = Boolean(currentModel);
    const enabled = Boolean(renderEngine.dualViewEnabled);
    const splitMode = enabled && renderEngine.dualViewLayout === "split";
    document.body.classList.toggle("dualViewSplitMode", splitMode);
    if (dualViewBtn) {
        dualViewBtn.disabled = !hasModel;
        dualViewBtn.classList.toggle("active", enabled);
        dualViewBtn.textContent = enabled ? "关闭双视窗" : "双视窗";
    }
    for (const button of [syncDualViewBtn, dualViewIsoBtn, dualViewTopBtn]) {
        if (button) {
            button.disabled = !hasModel || !enabled;
        }
    }
    if (dualViewGuide) {
        dualViewGuide.hidden = !hasModel || !enabled;
    }
}

function syncDualViewBodyClasses() {
    const enabled = Boolean(renderEngine.dualViewEnabled);
    document.body.classList.toggle("dualViewMode", enabled);
    document.body.classList.toggle("dualViewSplitMode", enabled && renderEngine.dualViewLayout === "split");
}

function setDualViewEnabled(enabled) {
    if (!currentModel) {
        return;
    }
    const active = renderEngine.setDualViewEnabled(enabled);
    syncDualViewBodyClasses();
    if (!active && compareViewLinked) {
        compareViewLinked = false;
        syncCompareControls();
    }
    syncDualViewControls();
    scheduleFragmentsUpdate();
    setStatus(active ? "已开启双视窗" : "已关闭双视窗");
    log("Dual viewport changed", {enabled: active});
}

function toggleDualView() {
    setDualViewEnabled(!renderEngine.dualViewEnabled);
}

function syncSecondaryView(options = {}) {
    if (!renderEngine.dualViewEnabled) {
        return;
    }
    const changed = renderEngine.syncSecondaryView({
        force: options.force === true,
        render: options.render !== false
    });
    if (changed || options.force === true) {
        scheduleFragmentsUpdate();
    }
    if (!options.silent) {
        setStatus("副视窗已同步主视角");
    }
}

function setCompareViewLinked(enabled) {
    if (!compareModel || !renderEngine.dualViewEnabled) {
        compareViewLinked = false;
        syncCompareControls();
        return;
    }
    compareViewLinked = Boolean(enabled);
    if (compareViewLinked) {
        syncSecondaryView({silent: true, force: true});
        setStatus("左右视口联动已开启");
        setVersionCompareStatus("左右视口联动中：操作左侧视角，右侧自动跟随");
    } else {
        setStatus("左右视口联动已关闭");
        setVersionCompareStatus("左右视口联动已关闭，可手动重新开启");
    }
    syncCompareControls();
}

function toggleCompareViewLinked() {
    setCompareViewLinked(!compareViewLinked);
}

function autoSyncCompareViewIfLinked() {
    if (!compareViewLinked || !compareModel || !renderEngine.dualViewEnabled) {
        return;
    }
    if (compareViewSyncPending) {
        return;
    }
    compareViewSyncPending = true;
    requestAnimationFrame(() => {
        compareViewSyncPending = false;
        if (!compareViewLinked || !compareModel || !renderEngine.dualViewEnabled) {
            return;
        }
        syncSecondaryView({silent: true, render: false});
    });
}

function setSecondaryNamedView(viewName) {
    if (!renderEngine.dualViewEnabled || !currentModel) {
        return;
    }
    if (compareViewLinked) {
        compareViewLinked = false;
        syncCompareControls();
    }
    const box = compareModel ? getCompareModelBox() : getCurrentModelBox();
    if (!box || !renderEngine.setSecondaryNamedView(viewName, box)) {
        return;
    }
    scheduleFragmentsUpdate();
    setStatus(`副视窗已切换：${viewName.toUpperCase()}`);
}

function setVersionCompareStatus(message) {
    if (versionCompareStatus) {
        versionCompareStatus.textContent = message;
    }
}

function getVersionCompareRuntimeState() {
    return {
        available: hasVersionCompareTarget(),
        running: versionCompareRunning,
        workerMode: versionCompareController.mode,
        linked: compareViewLinked,
        baseModelId: currentModel?.modelId || null,
        compareModelId: compareModel?.modelId || null,
        task: versionCompareTaskController.getState(),
        report: lastVersionCompareReport
    };
}

function formatCount(value) {
    if (Number.isFinite(Number(value))) {
        return Number(value).toLocaleString("zh-CN");
    }
    return value === null || value === undefined || value === "" ? "-" : String(value);
}

function setVersionCompareSummary(values = null) {
    if (!versionCompareSummary) {
        return;
    }
    const summary = values || {
        common: "-",
        changed: "-",
        removed: "-",
        added: "-",
        missing: "-"
    };
    const fields = [
        summary.common,
        summary.changed,
        summary.removed,
        summary.added,
        summary.missing
    ];
    [...versionCompareSummary.querySelectorAll("strong")].forEach((node, index) => {
        node.textContent = formatCount(fields[index]);
    });
}

function setVersionCompareFilter(filter) {
    versionCompareFilter = filter || "all";
    versionCompareFilterTabs.forEach((button) => {
        button.classList.toggle("active", button.dataset.versionCompareFilter === versionCompareFilter);
    });
}

function uniqueNumberIds(localIds) {
    return [...new Set((localIds || []).filter((localId) => Number.isFinite(localId)))];
}

function excludeLocalIds(localIds, excludedIds = []) {
    const excluded = new Set(excludedIds);
    return uniqueNumberIds(localIds).filter((localId) => !excluded.has(localId));
}

function nextAnimationFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

function timeoutAfter(ms, message) {
    return new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error(message)), ms);
    });
}

function withTimeout(promise, ms, message) {
    return Promise.race([
        promise,
        timeoutAfter(ms, message)
    ]);
}

function assertVersionCompareRunActive(runId) {
    if (runId !== versionCompareRunId || !currentModel || !compareModel) {
        throw new Error("VERSION_COMPARE_ABORTED");
    }
}

function getFocusedCompareLocalIds() {
    if (!focusedCompareDiff) {
        return [];
    }
    if (focusedCompareDiff.kind === "added") {
        return uniqueNumberIds([focusedCompareDiff.localId]);
    }
    if (focusedCompareDiff.kind === "changed") {
        return uniqueNumberIds([focusedCompareDiff.compareLocalId]);
    }
    return [];
}

async function clearVersionCompareHighlights(options = {}) {
    const baseIds = uniqueNumberIds([
        ...versionCompareHighlightState.baseRemoved,
        ...versionCompareHighlightState.baseChanged
    ]);
    const compareIds = uniqueNumberIds([
        ...versionCompareHighlightState.compareAdded,
        ...versionCompareHighlightState.compareChanged
    ]);
    versionCompareHighlightState.baseRemoved = [];
    versionCompareHighlightState.baseChanged = [];
    versionCompareHighlightState.compareAdded = [];
    versionCompareHighlightState.compareChanged = [];
    focusedCompareDiff = null;

    if (baseIds.length && typeof currentModel?.resetHighlight === "function") {
        await currentModel.resetHighlight(baseIds);
    }
    if (compareIds.length && typeof compareModel?.resetHighlight === "function") {
        await compareModel.resetHighlight(compareIds);
    }
    if (options.keepReport !== true) {
        lastVersionCompareReport = null;
    }
}

function setVersionCompareHighlightState(report) {
    versionCompareHighlightState.baseRemoved = uniqueNumberIds(report?.removedItems?.map((item) => item.localId)).slice(0, VERSION_COMPARE_HIGHLIGHT_LIMIT);
    versionCompareHighlightState.baseChanged = uniqueNumberIds(report?.changedItems?.map((item) => item.localId)).slice(0, VERSION_COMPARE_HIGHLIGHT_LIMIT);
    versionCompareHighlightState.compareAdded = uniqueNumberIds(report?.addedItems?.map((item) => item.localId)).slice(0, VERSION_COMPARE_HIGHLIGHT_LIMIT);
    versionCompareHighlightState.compareChanged = uniqueNumberIds(report?.changedItems?.map((item) => item.compareLocalId)).slice(0, VERSION_COMPARE_HIGHLIGHT_LIMIT);
}

async function reapplyVersionCompareHighlights(scope = "all") {
    const applyBase = scope === "all" || scope === "base";
    const applyCompare = scope === "all" || scope === "compare";
    if (applyBase && typeof currentModel?.highlight === "function") {
        const selected = new Set(selectedLocalIds);
        const removed = excludeLocalIds(versionCompareHighlightState.baseRemoved, selected);
        const changed = excludeLocalIds(versionCompareHighlightState.baseChanged, selected);
        if (removed.length) {
            await currentModel.highlight(removed, compareRemovedMaterial);
        }
        if (changed.length) {
            await currentModel.highlight(changed, compareChangedMaterial);
        }
    }
    if (applyCompare && typeof compareModel?.highlight === "function") {
        const excluded = new Set([...compareSelectionLocalIds, ...getFocusedCompareLocalIds()]);
        const added = excludeLocalIds(versionCompareHighlightState.compareAdded, excluded);
        const changed = excludeLocalIds(versionCompareHighlightState.compareChanged, excluded);
        if (added.length) {
            await compareModel.highlight(added, compareAddedMaterial);
        }
        if (changed.length) {
            await compareModel.highlight(changed, compareChangedMaterial);
        }
    }
}

async function reapplyCompareSelectionHighlight() {
    if (compareSelectionLocalIds.length && typeof compareModel?.highlight === "function") {
        await compareModel.highlight(compareSelectionLocalIds, highlightMaterial);
    }
}

async function reapplyFocusedCompareHighlight() {
    if (!focusedCompareDiff || typeof compareModel?.highlight !== "function") {
        return;
    }
    const ids = getFocusedCompareLocalIds();
    if (ids.length) {
        await compareModel.highlight(ids, compareFocusedMaterial);
    }
}

function getCompareInfoLabel(info, fallbackLocalId) {
    if (!info) {
        return `localId ${fallbackLocalId}`;
    }
    return info.name
        || info.entityName
        || info.category
        || info.objectType
        || `localId ${fallbackLocalId}`;
}

function normalizeCompareValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? Number(value.toFixed(6)) : "";
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    return String(value).trim();
}

function buildComparePropertySnapshot(info) {
    const flat = flattenInfo(info || {});
    const propertySource = info?.properties && typeof info.properties === "object"
        ? info.properties
        : flat;
    const ignoredKeyPattern = /(globalid|global id|guid|localid|local id|expressid|modelid|model id)$/i;
    const properties = {};
    let propertyCount = 0;
    for (const key of Object.keys(propertySource).sort()) {
        if (propertyCount >= VERSION_COMPARE_PROPERTY_SNAPSHOT_LIMIT) {
            break;
        }
        if (ignoredKeyPattern.test(key.split(".").pop() || key)) {
            continue;
        }
        const value = normalizeCompareValue(propertySource[key]);
        if (value !== "") {
            properties[key] = value;
            propertyCount += 1;
        }
    }
    return {
        name: normalizeCompareValue(info?.name || pickValue(flat, ["entityName", "EntityName", "Name", "name", "LongName"])),
        category: normalizeCompareValue(info?.category),
        objectType: normalizeCompareValue(info?.objectType || pickValue(flat, ["ObjectType", "objectType"])),
        predefinedType: normalizeCompareValue(info?.predefinedType || pickValue(flat, ["PredefinedType", "predefinedType"])),
        tag: normalizeCompareValue(pickValue(flat, ["Tag", "tag"])),
        description: normalizeCompareValue(info?.description || pickValue(flat, ["Description", "description"])),
        properties
    };
}

function buildCompareGeometrySnapshot(box) {
    if (!box || box.isEmpty()) {
        return null;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    return {
        center: [center.x, center.y, center.z],
        size: [size.x, size.y, size.z],
        volume: Math.max(size.x, 0) * Math.max(size.y, 0) * Math.max(size.z, 0)
    };
}

async function collectCompareFingerprint(item) {
    const baseModel = currentModel;
    const nextModel = compareModel;
    const baseEngine = semanticEngine;
    const nextEngine = compareSemanticEngine;
    if (!baseModel || !nextModel || !baseEngine || !nextEngine) {
        throw new Error("VERSION_COMPARE_ABORTED");
    }
    const canReadGeometry = typeof baseModel.getMergedBox === "function"
        && typeof nextModel.getMergedBox === "function";
    const [baseInfo, compareInfo, baseBox, compareBox] = await withTimeout(Promise.all([
        baseEngine.getItemInfo(item.localId).catch(() => null),
        nextEngine.getItemInfo(item.compareLocalId).catch(() => null),
        canReadGeometry ? baseModel.getMergedBox([item.localId]).catch(() => null) : null,
        canReadGeometry ? nextModel.getMergedBox([item.compareLocalId]).catch(() => null) : null
    ]), VERSION_COMPARE_ITEM_TIMEOUT_MS, "VERSION_COMPARE_ITEM_TIMEOUT");
    return {
        ...item,
        baseProperties: buildComparePropertySnapshot(baseInfo),
        compareProperties: buildComparePropertySnapshot(compareInfo),
        baseGeometry: buildCompareGeometrySnapshot(baseBox),
        compareGeometry: buildCompareGeometrySnapshot(compareBox)
    };
}

async function enrichCompareDiffItems(items, engine, limit = VERSION_COMPARE_LIST_LIMIT) {
    const result = [];
    for (const item of items.slice(0, limit)) {
        let info = null;
        const localId = item.kind === "changed" && item.side === "compare"
            ? item.compareLocalId
            : item.localId;
        try {
            info = await engine?.getItemInfo(localId);
        } catch (error) {
            log("Version compare item info failed", {
                localId,
                message: errorMessage(error)
            });
        }
        result.push({
            ...item,
            localId,
            title: getCompareInfoLabel(info, localId),
            category: info?.category || "-",
            globalId: item.globalId || info?.globalId || info?.guid || ""
        });
    }
    return result;
}

function createCompareDiffRow(item) {
    const row = document.createElement("div");
    row.className = "miniItem compareDiffItem";
    row.dataset.compareKind = item.kind;

    const badge = document.createElement("span");
    badge.className = `compareDiffBadge ${item.kind}`;
    badge.textContent = item.kind === "removed"
        ? "左缺"
        : item.kind === "added"
            ? "右增"
            : "变更";

    const body = document.createElement("div");
    body.className = "compareDiffBody";

    const title = document.createElement("div");
    title.className = "miniItemTitle";
    title.textContent = item.title || `localId ${item.localId}`;

    const meta = document.createElement("div");
    meta.className = "miniItemMeta";
    const changedText = item.kind === "changed"
        ? `｜属性 ${item.propertyDiffs?.length || 0}｜几何 ${item.geometry?.changed ? "是" : "否"}`
        : "";
    meta.textContent = `localId ${item.localId}｜${item.category || "-"}｜${item.globalId || "无 GlobalId"}${changedText}`;

    const detail = document.createElement("div");
    detail.className = "compareDiffDetail";
    detail.hidden = true;
    if (item.kind === "changed") {
        const diffs = item.propertyDiffs || [];
        if (diffs.length) {
            for (const diff of diffs.slice(0, 4)) {
                const line = document.createElement("div");
                line.className = "compareDiffLine";
                const label = document.createElement("span");
                label.textContent = diff.field;
                const value = document.createElement("strong");
                value.title = `左：${diff.base}｜右：${diff.compare}`;
                value.textContent = `左 ${diff.base} / 右 ${diff.compare}`;
                line.append(label, value);
                detail.append(line);
            }
            if (diffs.length > 4) {
                const line = document.createElement("div");
                line.className = "compareDiffLine";
                line.innerHTML = `<span>属性</span><strong>另有 ${diffs.length - 4} 项差异</strong>`;
                detail.append(line);
            }
        }
        if (item.geometry?.changed) {
            const line = document.createElement("div");
            line.className = "compareDiffLine";
            line.innerHTML = `<span>几何</span><strong>中心 ${item.geometry.centerDelta}｜尺寸 ${item.geometry.sizeDelta}｜体积 ${item.geometry.volumeDelta}</strong>`;
            detail.append(line);
        }
        if (!detail.childElementCount) {
            const line = document.createElement("div");
            line.className = "compareDiffLine";
            line.innerHTML = "<span>明细</span><strong>未返回具体差异字段</strong>";
            detail.append(line);
        }
    }

    const action = document.createElement("button");
    action.className = "smallBtn compareDiffAction";
    action.type = "button";
    action.textContent = "定位";
    action.dataset.compareAction = "locate";
    action.dataset.compareKind = item.kind;
    action.dataset.localId = String(item.localId);
    action.dataset.compareLocalId = Number.isFinite(item.compareLocalId) ? String(item.compareLocalId) : "";
    action.dataset.globalId = item.globalId || "";

    const actions = document.createElement("div");
    actions.className = "compareDiffActions";
    actions.append(action);
    if (item.kind === "changed") {
        const detailAction = document.createElement("button");
        detailAction.className = "smallBtn compareDiffAction";
        detailAction.type = "button";
        detailAction.textContent = "详情";
        detailAction.dataset.compareAction = "toggle-detail";
        actions.append(detailAction);
    }

    body.append(title, meta, detail);
    row.append(badge, body, actions);
    return row;
}

async function renderVersionCompareList() {
    setVersionCompareSummary(lastVersionCompareReport
        ? {
            common: lastVersionCompareReport.common,
            changed: lastVersionCompareReport.changed,
            removed: lastVersionCompareReport.removed,
            added: lastVersionCompareReport.added,
            missing: `${lastVersionCompareReport.baseMissingGlobalId}/${lastVersionCompareReport.compareMissingGlobalId}`
        }
        : null);

    if (versionCompareLimitHint) {
        versionCompareLimitHint.textContent = lastVersionCompareReport
            ? lastVersionCompareReport.limited
                ? `展示前 ${VERSION_COMPARE_LIST_LIMIT} 条，扫描前 ${VERSION_COMPARE_SCAN_LIMIT} 个`
                : `展示前 ${VERSION_COMPARE_LIST_LIMIT} 条`
            : "未对比";
    }

    if (!versionCompareList) {
        return;
    }
    versionCompareList.textContent = "";
    setVersionCompareFilter(versionCompareFilter);
    if (!lastVersionCompareReport) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "加载两个版本并点击“对比”后显示差异";
        versionCompareList.append(empty);
        return;
    }

    if (versionCompareFilter === "missing") {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = `无 GlobalId 构件只纳入统计：左 ${formatCount(lastVersionCompareReport.baseMissingGlobalId)} / 右 ${formatCount(lastVersionCompareReport.compareMissingGlobalId)}，暂不支持定位`;
        versionCompareList.append(empty);
        return;
    }

    const removedItems = await enrichCompareDiffItems(
        lastVersionCompareReport.removedItems || [],
        semanticEngine
    );
    const changedItems = await enrichCompareDiffItems(
        lastVersionCompareReport.changedItems || [],
        semanticEngine
    );
    const addedItems = await enrichCompareDiffItems(
        lastVersionCompareReport.addedItems || [],
        compareSemanticEngine
    );
    const itemGroups = {
        all: [...changedItems, ...removedItems, ...addedItems],
        changed: changedItems,
        removed: removedItems,
        added: addedItems
    };
    const visibleItems = itemGroups[versionCompareFilter] || itemGroups.all;
    if (!visibleItems.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = versionCompareFilter === "all"
            ? "当前扫描范围内没有新增、缺失或变更构件"
            : "当前筛选条件下没有差异构件";
        versionCompareList.append(empty);
        return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of visibleItems) {
        fragment.append(createCompareDiffRow(item));
    }
    versionCompareList.append(fragment);
}

function hasDiffItem(kind, localId) {
    const items = kind === "added"
        ? lastVersionCompareReport?.addedItems
        : kind === "changed"
            ? lastVersionCompareReport?.changedItems
            : lastVersionCompareReport?.removedItems;
    return Array.isArray(items) && items.some((item) => item.localId === localId || item.compareLocalId === localId);
}

async function restoreFocusedCompareDiff() {
    if (!focusedCompareDiff) {
        return;
    }
    const previous = focusedCompareDiff;
    focusedCompareDiff = null;
    if (previous.kind === "removed") {
        return;
    }
    const previousIds = previous.kind === "added"
        ? uniqueNumberIds([previous.localId])
        : uniqueNumberIds([previous.compareLocalId ?? previous.localId]);
    if (previousIds.length && typeof compareModel?.resetHighlight === "function") {
        await compareModel.resetHighlight(previousIds);
    }
    if (previous.kind === "added" && compareModel && hasDiffItem("added", previous.localId)) {
        await reapplyVersionCompareHighlights("compare");
    }
    if (previous.kind === "changed" && compareModel && hasDiffItem("changed", previous.compareLocalId ?? previous.localId)) {
        await reapplyVersionCompareHighlights("compare");
    }
    await reapplyCompareSelectionHighlight();
}

async function clearCompareLinkedSelection() {
    if (!compareSelectionLocalIds.length || !compareModel) {
        compareSelectionLocalIds = [];
        return;
    }
    const previousIds = [...compareSelectionLocalIds];
    compareSelectionLocalIds = [];
    if (typeof compareModel.resetHighlight === "function") {
        await compareModel.resetHighlight(previousIds);
    }
    await reapplyVersionCompareHighlights("compare");
    await reapplyFocusedCompareHighlight();
}

async function fitCompareSelectionTarget(localId) {
    if (
        typeof localId !== "number"
        || !compareModel
        || typeof compareModel.getMergedBox !== "function"
        || typeof renderEngine.fitSecondaryBox !== "function"
    ) {
        return false;
    }
    const box = await compareModel.getMergedBox([localId]);
    if (!box || box.isEmpty()) {
        return false;
    }
    renderEngine.fitSecondaryBox(box, `compare-selection:${localId}`);
    return true;
}

async function syncCompareSelectionFromBase(localIds, primaryLocalId = null) {
    const requestId = ++compareSelectionSyncRequestId;
    await clearCompareLinkedSelection();
    if (!compareModel || !compareSemanticEngine || !semanticEngine || !Array.isArray(localIds) || !localIds.length) {
        scheduleFragmentsUpdate();
        return;
    }

    const targetLocalIds = [];
    let primaryCompareLocalId = null;
    for (const localId of localIds.slice(0, VERSION_COMPARE_SELECTION_SYNC_LIMIT)) {
        const globalId = await semanticEngine.getGlobalId(localId);
        if (!globalId) {
            continue;
        }
        const compareLocalId = await compareSemanticEngine.getLocalIdByGlobalId(globalId);
        if (typeof compareLocalId === "number") {
            targetLocalIds.push(compareLocalId);
            if (localId === primaryLocalId) {
                primaryCompareLocalId = compareLocalId;
            }
        }
    }
    if (requestId !== compareSelectionSyncRequestId) {
        return;
    }

    compareSelectionLocalIds = [...new Set(targetLocalIds)];
    if (compareSelectionLocalIds.length && typeof compareModel.highlight === "function") {
        await compareModel.highlight(compareSelectionLocalIds, highlightMaterial);
    }
    if (typeof primaryCompareLocalId === "number") {
        await fitCompareSelectionTarget(primaryCompareLocalId);
    }
    scheduleFragmentsUpdate();
}

async function locateVersionCompareItem(kind, localId, globalId = "", compareLocalId = null) {
    if (!Number.isFinite(localId)) {
        return;
    }
    await restoreFocusedCompareDiff();
    if (kind === "changed") {
        await selectLocalIds([localId], {
            primaryLocalId: localId,
            source: "version-compare"
        });
        await fitSelected();
        if (typeof compareLocalId === "number") {
            await fitCompareSelectionTarget(compareLocalId);
            if (typeof compareModel?.highlight === "function") {
                await compareModel.highlight([compareLocalId], compareFocusedMaterial);
            }
        }
        focusedCompareDiff = {kind, localId, compareLocalId};
        setStatus(`已定位变更构件：${globalId || `localId ${localId}`}`);
        return;
    }
    if (kind === "removed") {
        await selectLocalIds([localId], {
            primaryLocalId: localId,
            source: "version-compare"
        });
        await fitSelected();
        focusedCompareDiff = {kind, localId};
        setStatus(`已定位左侧缺失构件：localId ${localId}`);
        return;
    }

    if (kind !== "added" || !compareModel) {
        return;
    }
    if (compareViewLinked) {
        compareViewLinked = false;
        syncCompareControls();
        setVersionCompareStatus("已关闭联动并定位右侧新增构件");
    }
    if (typeof compareModel.highlight === "function") {
        await compareModel.highlight([localId], compareFocusedMaterial);
    }
    if (typeof compareModel.getMergedBox === "function" && typeof renderEngine.fitSecondaryBox === "function") {
        const box = await compareModel.getMergedBox([localId]);
        renderEngine.fitSecondaryBox(box, `compare:${localId}`);
    }
    focusedCompareDiff = {kind, localId};
    scheduleFragmentsUpdate();
    setStatus(`已定位右侧新增构件：${globalId || `localId ${localId}`}`);
}

function getManagedCompareCandidate() {
    const entries = getManagedModelEntries();
    if (!currentModel || entries.length < 2) {
        return null;
    }
    return entries.find((entry) => (
        entry?.model
        && entry.model.modelId !== currentModel.modelId
        && entry.visible !== false
    )) || entries.find((entry) => (
        entry?.model
        && entry.model.modelId !== currentModel.modelId
    )) || null;
}

function hasVersionCompareTarget() {
    return Boolean(compareModel || getManagedCompareCandidate());
}

async function ensureVersionCompareModel() {
    if (compareModel && compareSemanticEngine) {
        return true;
    }
    const entry = getManagedCompareCandidate();
    if (!entry?.model) {
        return false;
    }
    compareModel = entry.model;
    compareModelName = entry.name || entry.model.modelId;
    compareManifest = entry.manifest || null;
    modelRegistry.setRole(entry.modelId, MODEL_ROLES.COMPARE, {
        source: "managed-compare"
    });
    renderModelManagerList();
    compareSemanticEngine = entry.semanticEngine || new SemanticQueryEngine({model: compareModel});
    if (!entry.semanticEngine) {
        await compareSemanticEngine.init();
        entry.semanticEngine = compareSemanticEngine;
    }
    configureVersionCompareLayers();
    renderEngine.setDualViewEnabled(true, {layout: "split"});
    syncDualViewBodyClasses();
    compareViewLinked = true;
    syncDualViewControls();
    syncCompareControls();
    setVersionCompareStatus(`已使用模型列表中的 ${compareModelName} 作为右侧对比版本`);
    return true;
}

function syncCompareControls() {
    const hasBase = Boolean(currentModel);
    const hasCompare = hasVersionCompareTarget();
    const hasActiveCompare = Boolean(compareModel);
    if (compareActionRow) {
        compareActionRow.hidden = !hasCompare;
    }
    if (versionComparePanel) {
        versionComparePanel.hidden = !hasCompare;
    }
    if (compareManifestUrlInput) {
        compareManifestUrlInput.disabled = !hasBase;
    }
    if (compareFragFileInput) {
        compareFragFileInput.disabled = !hasBase;
    }
    if (loadCompareModelBtn) {
        loadCompareModelBtn.disabled = !hasBase;
    }
    if (clearCompareModelBtn) {
        clearCompareModelBtn.disabled = !hasActiveCompare;
    }
    if (runVersionCompareBtn) {
        runVersionCompareBtn.disabled = !hasBase || !hasCompare;
        runVersionCompareBtn.textContent = versionCompareRunning ? "取消" : "对比";
    }
    if (syncCompareViewBtn) {
        syncCompareViewBtn.disabled = !hasActiveCompare;
        syncCompareViewBtn.classList.toggle("active", hasActiveCompare && compareViewLinked);
        syncCompareViewBtn.textContent = compareViewLinked ? "已联动" : "联动";
    }
}

function setObjectLayer(object, layer) {
    if (!object) {
        return;
    }
    object.traverse((child) => {
        child.layers.set(layer);
    });
}

function setRegisteredModelLayer(modelId, layer, options = {}) {
    const entry = modelRegistry.get(modelId);
    if (!entry?.model?.object) {
        return false;
    }
    setObjectLayer(entry.model.object, layer);
    modelRegistry.setLayer(modelId, layer, options);
    return true;
}

function enableSceneLayer(layer) {
    scene.traverse((object) => {
        if (object !== currentModel?.object && object !== compareModel?.object) {
            object.layers.enable(layer);
        }
    });
}

function configureVersionCompareLayers() {
    camera.layers.set(0);
    renderEngine.secondaryCamera?.layers.set(1);
    if (currentModel?.object) {
        setRegisteredModelLayer(currentModel.modelId, 0, {
            dispatch: false,
            source: "compare-layers"
        });
    }
    if (compareModel?.object) {
        setRegisteredModelLayer(compareModel.modelId, 1, {
            dispatch: false,
            source: "compare-layers"
        });
    }
    enableSceneLayer(1);
}

async function loadCompareModel(options = {}) {
    if (!currentModel || !viewerApp) {
        setVersionCompareStatus("请先加载左侧主版本模型");
        return;
    }
    const file = options.file || compareFragFileInput?.files?.[0] || null;
    const manifestUrl = String(options.manifestUrl ?? compareManifestUrlInput?.value ?? "").trim();
    if (!file && !manifestUrl) {
        setVersionCompareStatus("请选择右侧 .frag 文件或填写右侧版本 manifest URL");
        return;
    }
    setBusy(true);
    setVersionCompareStatus("正在加载右侧版本模型...");
    try {
        await clearCompareModel({silent: true});
        const result = await viewerApp.openModel({
            ...(file ? {file, name: file.name} : {manifestUrl}),
            disposeExisting: false,
            setCurrent: false,
            modelId: `compare-${Date.now().toString(36)}`
        });
        compareModel = result.model;
        compareModelName = result.manifest?.displayName || result.name || result.modelId;
        compareManifest = result.manifest || null;
        compareSemanticEngine = new SemanticQueryEngine({model: compareModel});
        await compareSemanticEngine.init();
        modelRegistry.register({
            modelId: compareModel.modelId,
            model: compareModel,
            manifest: compareManifest,
            name: compareModelName,
            source: file ? file.name : manifestUrl,
            visible: true,
            loadedAt: new Date().toISOString(),
            semanticEngine: compareSemanticEngine
        }, {
            role: MODEL_ROLES.COMPARE,
            source: "compare-load"
        });
        const compareBounds = compareModel.box && !compareModel.box.isEmpty()
            ? compareModel.box.clone()
            : new THREE.Box3().setFromObject(compareModel.object);
        modelRegistry.setBounds(compareModel.modelId, {
            originalBounds: compareBounds,
            currentBounds: compareBounds
        }, {
            dispatch: false,
            source: "compare-load"
        });
        const compareTransform = captureModelTransform(compareModel.object);
        modelRegistry.setTransform(compareModel.modelId, compareTransform, {
            kind: "initial",
            dispatch: false,
            source: "compare-load"
        });
        modelRegistry.setTransform(compareModel.modelId, compareTransform, {
            kind: "current",
            dispatch: false,
            source: "compare-load"
        });
        configureVersionCompareLayers();
        renderEngine.setDualViewEnabled(true, {layout: "split"});
        syncDualViewBodyClasses();
        compareViewLinked = true;
        syncDualViewControls();
        syncCompareControls();
        await syncCompareSelectionFromBase(selectedLocalIds, selectedPrimaryLocalId);
        scheduleFragmentsUpdate();
        setVersionCompareStatus(`右侧版本已加载：${compareModelName}`);
        setStatus("已加载右侧对比版本");
        await renderVersionCompareList();
        log("Compare model loaded", {
            modelId: compareModel.modelId,
            name: compareModelName,
            source: file ? file.name : manifestUrl
        });
    } catch (error) {
        setVersionCompareStatus(`右侧版本加载失败：${errorMessage(error)}`);
        log("Compare model load failed", {message: errorMessage(error)});
    } finally {
        setBusy(false);
        syncCompareControls();
    }
}

async function clearCompareModel(options = {}) {
    versionCompareRunId += 1;
    versionCompareRunning = false;
    versionCompareController.cancel();
    if (versionCompareTaskController.getState().status === "running") {
        versionCompareTaskController.cancel("model-cleared");
    } else {
        versionCompareTaskController.reset();
    }
    await clearVersionCompareHighlights({keepReport: false});
    if (!compareModel || !viewerApp) {
        syncCompareControls();
        return;
    }
    const modelId = compareModel.modelId;
    const compareEntry = modelRegistry.get(modelId);
    if (compareEntry?.assembly === true) {
        setRegisteredModelLayer(modelId, 0, {
            dispatch: false,
            source: "compare-clear"
        });
        modelRegistry.setRole(modelId, MODEL_ROLES.MANAGED, {
            source: "compare-clear"
        });
    } else {
        await disposeRegisteredModel(modelId, {source: "compare-clear"});
    }
    renderModelManagerList();
    compareModel = null;
    compareModelName = null;
    compareManifest = null;
    compareSemanticEngine = null;
    lastVersionCompareReport = null;
    compareViewLinked = false;
    focusedCompareDiff = null;
    compareSelectionSyncRequestId += 1;
    compareSelectionLocalIds = [];
    camera.layers.set(0);
    renderEngine.secondaryCamera?.layers.set(0);
    renderEngine.setDualViewEnabled(false);
    syncDualViewBodyClasses();
    if (currentModel?.object) {
        setRegisteredModelLayer(currentModel.modelId, 0, {
            dispatch: false,
            source: "compare-clear"
        });
    }
    syncDualViewControls();
    syncCompareControls();
    await renderVersionCompareList();
    scheduleFragmentsUpdate();
    if (!options.silent) {
        setVersionCompareStatus("右侧版本已清除");
        setStatus("已清除右侧对比版本");
    }
}

async function collectGlobalIdIndex(engine, limit = VERSION_COMPARE_SCAN_LIMIT, options = {}) {
    const allLocalIds = await withTimeout(
        engine.getLocalIds(),
        VERSION_COMPARE_INDEX_TIME_LIMIT_MS,
        "VERSION_COMPARE_INDEX_TIMEOUT"
    );
    const localIds = allLocalIds.slice(0, limit);
    options.onProgress?.({current: 0, total: localIds.length});
    const byGlobalId = new Map();
    let missing = 0;
    let timedOut = false;
    let scanned = 0;
    const started = performance.now();
    for (let index = 0; index < localIds.length; index += 1) {
        if (options.runId) {
            assertVersionCompareRunActive(options.runId);
        }
        if (performance.now() - started > VERSION_COMPARE_INDEX_TIME_LIMIT_MS) {
            timedOut = true;
            break;
        }
        const localId = localIds[index];
        const globalId = await withTimeout(
            engine.getGlobalId(localId),
            VERSION_COMPARE_INDEX_ITEM_TIMEOUT_MS,
            "VERSION_COMPARE_INDEX_ITEM_TIMEOUT"
        ).catch(() => "");
        scanned = index + 1;
        if (!globalId) {
            missing += 1;
            continue;
        }
        byGlobalId.set(globalId, localId);
        if (options.label && index > 0 && index % 500 === 0) {
            options.onProgress?.({current: index, total: localIds.length});
            await nextAnimationFrame();
        }
    }
    options.onProgress?.({current: scanned, total: localIds.length});
    return {
        total: localIds.length,
        scanned,
        limited: allLocalIds.length > limit || timedOut,
        timedOut,
        missing,
        entries: [...byGlobalId.entries()]
    };
}

async function runVersionCompare() {
    await ensureVersionCompareModel();
    if (!currentModel || !semanticEngine || !compareModel || !compareSemanticEngine) {
        setVersionCompareStatus("请先加载左侧主版本和右侧对比版本");
        return;
    }
    const runId = ++versionCompareRunId;
    versionCompareRunning = true;
    versionCompareTaskController.start({
        baseModelId: currentModel.modelId,
        compareModelId: compareModel.modelId,
        message: "正在按 GlobalId 对比两个版本"
    });
    syncCompareControls();
    setVersionCompareStatus("正在按 GlobalId 对比两个版本...");
    try {
        await clearVersionCompareHighlights({keepReport: false});
        await applySelectionHighlight({reset: false});
        await clearCompareLinkedSelection();
        await renderVersionCompareList();
        const indexProgress = {
            base: {current: 0, total: 0},
            compare: {current: 0, total: 0}
        };
        const updateIndexProgress = (side, progress) => {
            indexProgress[side] = progress;
            const current = indexProgress.base.current + indexProgress.compare.current;
            const total = indexProgress.base.total + indexProgress.compare.total;
            const message = `正在建立 GlobalId 索引：${formatCount(current)} / ${formatCount(total)}`;
            versionCompareTaskController.updatePhase("global-id-index", {current, total, message});
            setVersionCompareStatus(message);
        };
        const [baseIndex, compareIndex] = await Promise.all([
            collectGlobalIdIndex(semanticEngine, VERSION_COMPARE_SCAN_LIMIT, {
                runId,
                label: "左侧",
                onProgress: (progress) => updateIndexProgress("base", progress)
            }),
            collectGlobalIdIndex(compareSemanticEngine, VERSION_COMPARE_SCAN_LIMIT, {
                runId,
                label: "右侧",
                onProgress: (progress) => updateIndexProgress("compare", progress)
            })
        ]);
        assertVersionCompareRunActive(runId);
        versionCompareTaskController.updatePhase("global-id-diff", {
            current: 0,
            total: 1,
            message: "正在计算新增、缺失和共同构件"
        });
        const indexDiff = await versionCompareController.compareIndexes(baseIndex.entries, compareIndex.entries);
        versionCompareTaskController.updatePhase("global-id-diff", {
            current: 1,
            total: 1,
            message: "GlobalId 差异分类完成"
        });
        assertVersionCompareRunActive(runId);
        const {removedItems, addedItems, commonItems} = indexDiff;
        const removed = removedItems.map((item) => item.localId);
        const added = addedItems.map((item) => item.localId);
        const common = commonItems.length;
        const changedItems = [];
        const changedScanItems = commonItems.slice(0, VERSION_COMPARE_CHANGED_SCAN_LIMIT);
        const changeDetectionStarted = performance.now();
        let changeDetectionTimedOut = false;
        let changedScannedCount = 0;
        setVersionCompareStatus(`正在检测属性与几何变更：${formatCount(changedScanItems.length)} 个共同构件...`);
        for (let offset = 0; offset < changedScanItems.length; offset += VERSION_COMPARE_FINGERPRINT_BATCH_SIZE) {
            assertVersionCompareRunActive(runId);
            if (performance.now() - changeDetectionStarted > VERSION_COMPARE_CHANGE_DETECTION_TIME_LIMIT_MS) {
                changeDetectionTimedOut = true;
                break;
            }
            const batch = changedScanItems.slice(offset, offset + VERSION_COMPARE_FINGERPRINT_BATCH_SIZE);
            const fingerprints = (await Promise.all(batch.map(async (item) => {
                try {
                    return await collectCompareFingerprint(item);
                } catch (error) {
                    if (errorMessage(error) !== "VERSION_COMPARE_ITEM_TIMEOUT") {
                        log("Version compare item skipped", {
                            localId: item.localId,
                            compareLocalId: item.compareLocalId,
                            message: errorMessage(error)
                        });
                    }
                    return null;
                }
            }))).filter(Boolean);
            assertVersionCompareRunActive(runId);
            if (fingerprints.length) {
                const batchChanges = await versionCompareController.compareFingerprints(fingerprints, {
                    absoluteTolerance: VERSION_COMPARE_GEOMETRY_ABSOLUTE_TOLERANCE,
                    relativeTolerance: VERSION_COMPARE_GEOMETRY_RELATIVE_TOLERANCE,
                    maxPropertyDiffs: 12
                });
                changedItems.push(...batchChanges);
            }
            changedScannedCount = offset + batch.length;
            const message = `正在检测属性与几何变更：${formatCount(changedScannedCount)} / ${formatCount(changedScanItems.length)}，已发现 ${formatCount(changedItems.length)} 项`;
            versionCompareTaskController.updatePhase("fingerprint-diff", {
                current: changedScannedCount,
                total: changedScanItems.length,
                changed: changedItems.length,
                message
            });
            setVersionCompareStatus(message);
            await nextAnimationFrame();
        }
        assertVersionCompareRunActive(runId);
        lastVersionCompareReport = {
            baseModelId: currentModel.modelId,
            compareModelId: compareModel.modelId,
            baseTotal: baseIndex.total,
            compareTotal: compareIndex.total,
            common: Math.max(0, common - changedItems.length),
            commonRaw: common,
            changed: changedItems.length,
            removed: removed.length,
            added: added.length,
            removedItems,
            changedItems,
            addedItems,
            baseMissingGlobalId: baseIndex.missing,
            compareMissingGlobalId: compareIndex.missing,
            changedScanned: changedScannedCount,
            changedScanTotal: changedScanItems.length,
            changeDetectionTimedOut,
            limited: baseIndex.limited
                || compareIndex.limited
                || commonItems.length > VERSION_COMPARE_CHANGED_SCAN_LIMIT
                || changeDetectionTimedOut
        };
        setVersionCompareHighlightState(lastVersionCompareReport);
        await reapplyVersionCompareHighlights("all");
        await applySelectionHighlight({reset: false});
        await syncCompareSelectionFromBase(selectedLocalIds, selectedPrimaryLocalId);
        const limitedText = lastVersionCompareReport.limited
            ? `；存在扫描限制：ID 前 ${VERSION_COMPARE_SCAN_LIMIT}，变更 ${changedScannedCount}/${changedScanItems.length}`
            : "";
        const taskState = versionCompareTaskController.complete(lastVersionCompareReport);
        setVersionCompareStatus(`相同 ${lastVersionCompareReport.common}｜变更 ${changedItems.length}｜左缺失 ${removed.length}｜右新增 ${added.length}｜无ID ${baseIndex.missing}/${compareIndex.missing}｜${(taskState.elapsedMs / 1000).toFixed(1)}s${limitedText}`);
        await renderVersionCompareList();
        scheduleFragmentsUpdate();
        log("Version compare complete", lastVersionCompareReport);
    } catch (error) {
        if (errorMessage(error) === "VERSION_COMPARE_ABORTED") {
            if (versionCompareTaskController.getState().status === "running") {
                versionCompareTaskController.cancel("aborted");
            }
            setVersionCompareStatus("版本对比已取消");
            log("Version compare aborted", {runId});
        } else {
            versionCompareTaskController.fail(error);
            setVersionCompareStatus(`版本对比失败：${errorMessage(error)}`);
            log("Version compare failed", {message: errorMessage(error)});
        }
    } finally {
        if (runId === versionCompareRunId) {
            versionCompareRunning = false;
            syncCompareControls();
        }
    }
}

function cancelVersionCompare() {
    if (!versionCompareRunning) {
        return;
    }
    versionCompareRunId += 1;
    versionCompareController.cancel();
    versionCompareTaskController.cancel("user");
    versionCompareRunning = false;
    syncCompareControls();
    setVersionCompareStatus("版本对比已取消");
    setStatus("已取消版本对比");
}

async function renderActiveTree() {
    if (!currentModel) {
        renderTree(null);
        return;
    }

    setTreeTabActive(currentTreeTab);
    treeEmpty.textContent = "正在生成树结构...";
    treeEmpty.style.display = "block";
    modelTree.textContent = "";

    try {
        const root = await semanticEngine?.getTree(currentTreeTab);
        renderTree(root);
        currentTree = root;
        log("Tree tab rendered", {
            tab: currentTreeTab,
            nodes: countTreeNodes(root),
            localIds: collectTreeLocalIds(root).length
        });
    } catch (error) {
        renderTree(null);
        treeEmpty.textContent = `${currentTreeTab} 树生成失败：${errorMessage(error)}`;
        log("Tree tab failed", {
            tab: currentTreeTab,
            message: errorMessage(error)
        });
    }
}

async function buildTreeForTab(tab) {
    if (!semanticEngine) {
        return null;
    }
    return semanticEngine.getTree(tab);
}

function openDetailedTree() {
    treeDialogEngine.open(currentTree, {
        title: `${currentTreeTab} 详细模型树`
    });
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTreeNodes(item) {
    if (!item) {
        return 0;
    }
    let count = 0;
    const stack = [item];
    while (stack.length) {
        const current = stack.pop();
        count++;
        if (Array.isArray(current.children)) {
            for (const child of current.children) {
                stack.push(child);
            }
        }
    }
    return count;
}

function setTreeTabActive(tab) {
    for (const button of treeTabs) {
        button.classList.toggle("active", button.dataset.treeTab === tab);
    }
}

function renderTree(root) {
    modelTree.textContent = "";
    treeEmpty.textContent = currentModel ? "当前 tab 没有可展示的数据" : "加载模型后展示空间结构";
    treeEmpty.style.display = root ? "none" : "block";
    modelTree.hidden = false;
    treeSearchResults.hidden = true;
    updateTreeSearchAvailability();
    treeVirtualMode = false;
    if (!root) {
        return;
    }

    const nodeCount = countTreeNodes(root);
    if (nodeCount >= TREE_VIRTUAL_NODE_THRESHOLD) {
        renderVirtualTree(root, nodeCount);
        return;
    }

    const list = document.createElement("ul");
    list.appendChild(createTreeItem(root, 0));
    modelTree.appendChild(list);
    expandTreeBtn.disabled = false;
    hydrateVisibleTreeLabels();
}

function ensureTreeVirtualEngine() {
    if (treeVirtualEngine) {
        return treeVirtualEngine;
    }
    treeVirtualEngine = new TreeVirtualListEngine({
        container: modelTree,
        rowHeight: TREE_VIRTUAL_ROW_HEIGHT,
        overscan: 12,
        viewportClassName: "treeVirtualViewport",
        spacerClassName: "treeVirtualSpacer",
        contentClassName: "treeVirtualContent",
        renderRow: renderVirtualTreeRow,
        onRender: () => hydrateVisibleTreeLabels()
    });
    return treeVirtualEngine;
}

function renderVirtualTree(root, nodeCount = countTreeNodes(root)) {
    treeVirtualMode = true;
    treeExpandedKeys = new Set(["0"]);
    treeQueryPager.reset();
    treeVirtualRows = flattenVisibleTreeRows(root, treeExpandedKeys);
    const engine = ensureTreeVirtualEngine();
    engine.mount(modelTree);
    engine.setItems(treeVirtualRows);
    expandTreeBtn.disabled = false;
    treeSearchStatus.textContent = `大模型树已启用虚拟滚动：${formatCount(nodeCount)} 个节点`;
    log("Tree virtual mode enabled", {
        tab: currentTreeTab,
        nodeCount,
        visibleRows: treeVirtualRows.length
    });
}

function refreshVirtualTreeRows() {
    if (!treeVirtualMode || !currentTree || !treeVirtualEngine) {
        return;
    }
    treeVirtualRows = flattenVisibleTreeRows(currentTree, treeExpandedKeys);
    treeVirtualEngine.setItems(treeVirtualRows);
    hydrateVisibleTreeLabels();
}

function flattenVisibleTreeRows(root, expandedKeys) {
    const rows = [];
    const visit = (item, depth, key) => {
        const children = Array.isArray(item?.children) ? item.children : [];
        const localId = typeof item?.localId === "number" ? item.localId : null;
        const nodeLocalIds = collectTreeLocalIds(item);
        const dataLocalIds = normalizeLocalIds(Array.isArray(item?.dataLocalIds) ? item.dataLocalIds : []);
        const isDataNode = dataLocalIds.length > 0 && nodeLocalIds.length === 0;
        const isGroupNode = children.length > 0 || nodeLocalIds.length > 1 || localId === null;
        rows.push({
            key,
            item,
            depth,
            children,
            localId,
            nodeLocalIds,
            dataLocalIds,
            isDataNode,
            isGroupNode,
            expanded: expandedKeys.has(key),
            hasChildren: children.length > 0
        });
        if (children.length && expandedKeys.has(key)) {
            const page = treeQueryPager.getPage(key, children);
            page.items.forEach((child, index) => visit(child, depth + 1, `${key}.${index}`));
            if (page.hasMore) {
                rows.push({
                    key: `${key}.__more`,
                    depth: depth + 1,
                    isLoadMore: true,
                    parentKey: key,
                    totalChildren: page.total,
                    visibleChildren: page.visibleCount,
                    remainingChildren: page.remaining
                });
            }
        }
    };
    if (root) {
        visit(root, 0, "0");
    }
    return rows;
}

function renderVirtualTreeRow(row) {
    if (row.isLoadMore) {
        const loadMore = document.createElement("button");
        loadMore.type = "button";
        loadMore.className = "treeLoadMore treeVirtualNode";
        loadMore.style.paddingLeft = `${Math.min(row.depth * 8 + 24, 60)}px`;
        loadMore.textContent = `加载更多节点（剩余 ${formatCount(row.remainingChildren)}）`;
        loadMore.addEventListener("click", (event) => {
            event.stopPropagation();
            treeQueryPager.loadMore(row.parentKey, row.totalChildren);
            refreshVirtualTreeRows();
        });
        return loadMore;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "treeNode treeVirtualNode";
    button.dataset.localId = row.localId === null ? "" : String(row.localId);
    button.dataset.virtualKey = row.key;
    if (row.localId !== null) {
        button.dataset.needsLabel = "true";
    }
    button.style.paddingLeft = `${Math.min(row.depth * 8 + 6, 42)}px`;

    const toggle = document.createElement("span");
    toggle.className = "treeToggle";
    toggle.textContent = row.hasChildren ? row.expanded ? "v" : ">" : "";
    const name = document.createElement("span");
    name.className = "treeName";
    name.textContent = getInitialTreeLabel(row.item, row.localId, row.nodeLocalIds);
    const id = document.createElement("span");
    id.className = "treeId";
    id.textContent = getTreeMetaLabel(row.item, row.localId, row.nodeLocalIds);

    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!row.hasChildren) {
            return;
        }
        if (treeExpandedKeys.has(row.key)) {
            treeExpandedKeys.delete(row.key);
        } else {
            treeExpandedKeys.add(row.key);
        }
        refreshVirtualTreeRows();
    });
    button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (row.isDataNode) {
            await showTreeDataSummary(row.item, {
                node: button,
                dataLocalIds: row.dataLocalIds,
                childCount: row.children.length,
                depth: row.depth,
                virtualKey: row.key
            });
            return;
        }
        if (row.isGroupNode) {
            await showTreeGroupSummary(row.item, {
                node: button,
                localIds: row.nodeLocalIds,
                localId: row.localId,
                childCount: row.children.length,
                depth: row.depth,
                virtualKey: row.key
            });
            return;
        }
        await selectLocalIds(row.nodeLocalIds, {
            primaryLocalId: row.localId ?? row.nodeLocalIds[0] ?? null,
            source: "tree",
            triggerNode: button
        });
    });

    button.append(toggle, name, id);
    return button;
}

function updateTreeSearchAvailability() {
    const hasModel = Boolean(currentModel);
    treeSearchInput.disabled = !hasModel;
    treeSearchClearBtn.disabled = !hasModel || (!treeSearchInput.value && !activeTreeSearchQuery);
    if (!hasModel) {
        treeSearchStatus.textContent = "加载模型后可搜索构件";
    } else if (!activeTreeSearchQuery && !treeSearchInput.value.trim()) {
        const indexState = semanticIndexController.getState(currentModel?.modelId);
        treeSearchStatus.textContent = indexState?.ready
            ? `完整索引已就绪：${formatCount(indexState.indexed)} 个构件`
            : indexState?.indexed
                ? `索引构建中：${formatCount(indexState.indexed)} / ${formatCount(indexState.total)}`
                : "支持 entityName / localId / GlobalId / type / storey";
    }
}

async function clearSemanticSearchIndex() {
    semanticIndexBuildVersion += 1;
    semanticIndexCacheState = {status: "idle", cacheKey: null, source: null};
    try {
        await semanticIndexController.clear();
    } catch (error) {
        log("Semantic index clear failed", {message: errorMessage(error)});
    }
}

async function startSemanticSearchIndex(entry, engine) {
    if (!entry?.modelId || !engine || !Array.isArray(entry.localIds)) {
        return null;
    }
    const modelId = entry.modelId;
    const localIds = [...entry.localIds];
    const cacheKey = createSemanticIndexCacheKey(entry.manifest);
    const buildVersion = ++semanticIndexBuildVersion;
    semanticIndexCacheState = {
        status: cacheKey ? "checking" : "disabled",
        cacheKey,
        source: cacheKey ? "manifest-version" : null
    };
    await semanticIndexController.clear();
    if (buildVersion !== semanticIndexBuildVersion || currentModel?.modelId !== modelId) {
        return null;
    }

    if (cacheKey) {
        try {
            const cachedState = await semanticIndexCache.getState(cacheKey);
            const cacheIsComplete = cachedState?.ready
                && cachedState.total === localIds.length
                && cachedState.indexed === localIds.length;
            if (cacheIsComplete) {
                semanticIndexCacheState = {...semanticIndexCacheState, status: "restoring"};
                await semanticIndexController.begin(modelId, localIds.length);
                for (let chunkIndex = 0; chunkIndex < cachedState.chunkCount; chunkIndex += 1) {
                    if (buildVersion !== semanticIndexBuildVersion || currentModel?.modelId !== modelId) {
                        return null;
                    }
                    const items = await semanticIndexCache.readChunk(cacheKey, chunkIndex);
                    if (!Array.isArray(items)) {
                        throw new Error(`Semantic index cache chunk missing: ${chunkIndex}`);
                    }
                    const state = await semanticIndexController.append(modelId, items);
                    if (!treeSearchInput.value.trim()) {
                        treeSearchStatus.textContent = `正在恢复索引缓存：${formatCount(state.indexed)} / ${formatCount(state.total)}`;
                    }
                    if (chunkIndex % 2 === 1) {
                        await nextAnimationFrame();
                    }
                }
                if (buildVersion !== semanticIndexBuildVersion || currentModel?.modelId !== modelId) {
                    return null;
                }
                const restoredState = await semanticIndexController.complete(modelId);
                semanticIndexCacheState = {...semanticIndexCacheState, status: "hit"};
                if (!treeSearchInput.value.trim()) {
                    treeSearchStatus.textContent = `完整索引已恢复：${formatCount(restoredState.indexed)} 个构件`;
                }
                log("Semantic index cache restored", {
                    modelId,
                    indexed: restoredState.indexed,
                    chunks: cachedState.chunkCount
                });
                return restoredState;
            }
            if (cachedState) {
                await semanticIndexCache.clear(cacheKey);
            }
        } catch (error) {
            semanticIndexCacheState = {...semanticIndexCacheState, status: "read-failed"};
            log("Semantic index cache restore failed", {modelId, message: errorMessage(error)});
            await semanticIndexController.clear().catch(() => {});
            await semanticIndexCache.clear(cacheKey).catch(() => {});
        }
    }

    if (buildVersion !== semanticIndexBuildVersion || currentModel?.modelId !== modelId) {
        return null;
    }
    await semanticIndexController.begin(modelId, localIds.length);
    await engine.prepareSearchIndexMetadata();
    let cacheEnabled = Boolean(cacheKey);
    let cacheItems = [];
    if (cacheEnabled) {
        try {
            await semanticIndexCache.begin(cacheKey, {
                modelId: entry.manifest.modelId,
                modelVersionId: entry.manifest.modelVersionId,
                total: localIds.length
            });
            semanticIndexCacheState = {...semanticIndexCacheState, status: "writing"};
        } catch (error) {
            cacheEnabled = false;
            semanticIndexCacheState = {...semanticIndexCacheState, status: "write-failed"};
            log("Semantic index cache init failed", {modelId, message: errorMessage(error)});
        }
    }
    const started = performance.now();
    for (let offset = 0, batchIndex = 0; offset < localIds.length; offset += SEMANTIC_INDEX_BATCH_SIZE, batchIndex += 1) {
        if (buildVersion !== semanticIndexBuildVersion || currentModel?.modelId !== modelId) {
            return null;
        }
        const ids = localIds.slice(offset, offset + SEMANTIC_INDEX_BATCH_SIZE);
        const items = await engine.getSearchIndexItems(ids);
        if (buildVersion !== semanticIndexBuildVersion || currentModel?.modelId !== modelId) {
            return null;
        }
        const state = await semanticIndexController.append(modelId, items);
        if (cacheEnabled) {
            cacheItems.push(...items);
            if (cacheItems.length >= SEMANTIC_INDEX_CACHE_CHUNK_SIZE) {
                try {
                    await semanticIndexCache.append(cacheKey, cacheItems);
                    cacheItems = [];
                } catch (error) {
                    cacheEnabled = false;
                    cacheItems = [];
                    semanticIndexCacheState = {...semanticIndexCacheState, status: "write-failed"};
                    log("Semantic index cache append failed", {modelId, message: errorMessage(error)});
                }
            }
        }
        if (!treeSearchInput.value.trim() && (batchIndex % SEMANTIC_INDEX_YIELD_BATCHES === 0 || state.indexed === localIds.length)) {
            treeSearchStatus.textContent = `索引构建中：${formatCount(state.indexed)} / ${formatCount(state.total)}`;
        }
        if (batchIndex % SEMANTIC_INDEX_YIELD_BATCHES === SEMANTIC_INDEX_YIELD_BATCHES - 1) {
            await nextAnimationFrame();
        }
    }
    if (buildVersion !== semanticIndexBuildVersion || currentModel?.modelId !== modelId) {
        return null;
    }
    const state = await semanticIndexController.complete(modelId);
    if (cacheEnabled) {
        try {
            if (cacheItems.length) {
                await semanticIndexCache.append(cacheKey, cacheItems);
            }
            await semanticIndexCache.complete(cacheKey);
            if (buildVersion === semanticIndexBuildVersion && currentModel?.modelId === modelId) {
                semanticIndexCacheState = {...semanticIndexCacheState, status: "stored"};
            }
        } catch (error) {
            if (buildVersion === semanticIndexBuildVersion && currentModel?.modelId === modelId) {
                semanticIndexCacheState = {...semanticIndexCacheState, status: "write-failed"};
            }
            log("Semantic index cache complete failed", {modelId, message: errorMessage(error)});
        }
    }
    if (!treeSearchInput.value.trim()) {
        treeSearchStatus.textContent = `完整索引已就绪：${formatCount(state.indexed)} 个构件`;
    }
    log("Semantic index ready", {
        modelId,
        indexed: state.indexed,
        total: state.total,
        mode: semanticIndexController.mode,
        seconds: seconds(started)
    });
    return state;
}

function resetTreeSearchState() {
    if (treeSearchTimer) {
        clearTimeout(treeSearchTimer);
        treeSearchTimer = null;
    }
    treeSearchRequestId++;
    activeTreeSearchQuery = "";
    treeSearchResultItems = [];
    treeSearchInput.value = "";
    treeSearchResults.textContent = "";
    treeSearchResults.hidden = true;
    modelTree.hidden = false;
    updateTreeSearchAvailability();
}

function scheduleTreeSearch(immediate = false) {
    if (treeSearchTimer) {
        clearTimeout(treeSearchTimer);
    }
    const delay = immediate ? 0 : 260;
    treeSearchTimer = setTimeout(() => {
        treeSearchTimer = null;
        runTreeSearch().catch((error) => {
            treeSearchStatus.textContent = `搜索失败：${errorMessage(error)}`;
            log("Tree search failed", {message: errorMessage(error)});
        });
    }, delay);
}

async function runTreeSearch() {
    const query = treeSearchInput.value.trim();
    activeTreeSearchQuery = query;
    treeSearchClearBtn.disabled = !currentModel || !query;

    if (!query) {
        treeSearchResultItems = [];
        treeSearchResults.textContent = "";
        treeSearchResults.hidden = true;
        modelTree.hidden = false;
        treeEmpty.style.display = currentTree ? "none" : "block";
        updateTreeSearchAvailability();
        return;
    }

    if (!currentModel || !semanticEngine) {
        treeSearchStatus.textContent = "请先加载模型";
        return;
    }

    const requestId = ++treeSearchRequestId;
    const started = performance.now();
    treeSearchResults.hidden = false;
    treeSearchResults.textContent = "";
    modelTree.hidden = true;
    treeEmpty.style.display = "none";
    treeSearchStatus.textContent = "搜索中...";

    const results = await findTreeSearchResults(query, requestId);
    if (requestId !== treeSearchRequestId) {
        return;
    }
    renderTreeSearchResults(results);
    const indexState = semanticIndexController.getState(currentModel.modelId);
    const scopeText = indexState?.ready
        ? `完整索引 ${formatCount(indexState.indexed)}`
        : indexState?.indexed
            ? `索引中 ${formatCount(indexState.indexed)}/${formatCount(indexState.total)}`
            : `基础扫描 ${Math.min(currentAllLocalIds.length, TREE_SEARCH_SCAN_LIMIT)}`;
    treeSearchStatus.textContent = results.length
        ? `找到 ${results.length} 条结果 · ${scopeText} · ${seconds(started)}s`
        : `未找到结果 · ${scopeText} · ${seconds(started)}s`;
    log("Tree search complete", {
        query,
        count: results.length,
        seconds: seconds(started)
    });
}

async function findTreeSearchResults(query, requestId) {
    const result = await semanticSearchController.search({
        modelId: currentModel.modelId,
        query,
        treeCandidates: collectTreeSearchCandidates(currentTree),
        allLocalIds: currentAllLocalIds,
        isCancelled: () => requestId !== treeSearchRequestId
    });
    return result.cancelled ? [] : result.results;
}

function createTreeSearchItemFromSemanticIndex(item) {
    const title = item.entityName || item.globalId || `localId ${item.localId}`;
    const type = item.category || item.className || item.objectType || item.predefinedType || "";
    return {
        title,
        subtitle: [type, item.storey, item.globalId ? `GUID ${item.globalId}` : ""].filter(Boolean).join(" / "),
        badge: `#${item.localId}`,
        localId: item.localId,
        localIds: [item.localId],
        searchText: normalizeSearchText([
            item.localId,
            item.globalId,
            item.entityName,
            item.category,
            item.className,
            item.storey,
            item.objectType,
            item.predefinedType
        ].join(" "))
    };
}

function collectTreeSearchCandidates(root) {
    const result = [];
    const stack = root ? [root] : [];
    while (stack.length) {
        const item = stack.pop();
        const localId = typeof item.localId === "number" ? item.localId : null;
        const localIds = normalizeLocalIds(Array.isArray(item.localIds) ? item.localIds : localId !== null ? [localId] : []);
        const title = item.label || item.category || (localId !== null ? `localId ${localId}` : "Group");
        if (localId !== null || localIds.length) {
            result.push({
                title,
                subtitle: item.category || item.meta || "",
                badge: localId !== null ? `#${localId}` : `${localIds.length}`,
                localId,
                localIds: localId !== null ? [localId] : localIds,
                searchText: normalizeSearchText([
                    title,
                    item.category,
                    item.meta,
                    localId,
                    localIds.length
                ].join(" "))
            });
        }
        if (Array.isArray(item.children)) {
            for (let index = item.children.length - 1; index >= 0; index--) {
                stack.push(item.children[index]);
            }
        }
    }
    return result;
}

async function getTreeSearchInfo(localId) {
    if (typeof localId !== "number" || !currentModel) {
        return null;
    }
    if (currentAllLocalIds.length && !currentAllLocalIds.includes(localId)) {
        return null;
    }
    if (treeSearchInfoCache.has(localId)) {
        return treeSearchInfoCache.get(localId);
    }
    try {
        const info = await fetchBasicTreeInfo(localId);
        const flat = flattenInfo(info);
        const title = pickValue(flat, ["entityName", "EntityName", "Name", "name", "LongName"]) || `localId ${localId}`;
        const objectType = pickValue(flat, ["ObjectType", "Object Type", "objectType"]);
        const predefinedType = pickValue(flat, ["PredefinedType", "Predefined Type", "predefinedType"]);
        const type = objectType || predefinedType || info.category || "";
        const item = {
            title,
            subtitle: [type, info.guid ? `GUID ${info.guid}` : ""].filter(Boolean).join(" / "),
            badge: `#${localId}`,
            localId,
            localIds: [localId],
            searchText: normalizeSearchText([
                title,
                localId,
                info.guid,
                info.category,
                objectType,
                predefinedType
            ].join(" "))
        };
        treeSearchInfoCache.set(localId, item);
        return item;
    } catch {
        const fallback = {
            title: `localId ${localId}`,
            subtitle: "",
            badge: `#${localId}`,
            localId,
            localIds: [localId],
            searchText: normalizeSearchText(`localId ${localId}`)
        };
        treeSearchInfoCache.set(localId, fallback);
        return fallback;
    }
}

function normalizeSearchText(value) {
    return String(value ?? "").trim().toLowerCase();
}

function renderTreeSearchResults(results) {
    treeSearchResultItems = results;
    treeSearchResults.textContent = "";
    if (!results.length) {
        const empty = document.createElement("div");
        empty.className = "emptyState";
        empty.textContent = "没有匹配的构件或分组";
        treeSearchResults.appendChild(empty);
        return;
    }
    const engine = ensureTreeSearchVirtualEngine();
    engine.mount(treeSearchResults);
    engine.setItems(results);
}

function ensureTreeSearchVirtualEngine() {
    if (treeSearchVirtualEngine) {
        return treeSearchVirtualEngine;
    }
    treeSearchVirtualEngine = new TreeVirtualListEngine({
        container: treeSearchResults,
        rowHeight: TREE_SEARCH_VIRTUAL_ROW_HEIGHT,
        overscan: 8,
        viewportClassName: "treeSearchVirtualViewport",
        spacerClassName: "treeSearchVirtualSpacer",
        contentClassName: "treeSearchVirtualContent",
        renderRow: renderTreeSearchVirtualRow
    });
    return treeSearchVirtualEngine;
}

function renderTreeSearchVirtualRow(item, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "treeSearchResult";
    button.dataset.index = String(index);

    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const subtitle = document.createElement("span");
    subtitle.textContent = item.subtitle || (item.localId !== null ? `localId ${item.localId}` : `${item.localIds.length} 个构件`);
    text.append(title, subtitle);

    const badge = document.createElement("span");
    badge.className = "treeSearchBadge";
    badge.textContent = item.badge;
    button.append(text, badge);
    button.addEventListener("click", () => selectTreeSearchResult(index));
    return button;
}

async function selectTreeSearchResult(index) {
    const item = treeSearchResultItems[index];
    if (!item) {
        return;
    }
    const localIds = normalizeLocalIds(item.localIds).slice(0, 500);
    if (!localIds.length) {
        setStatus("搜索结果没有可选构件");
        return;
    }
    await selectLocalIds(localIds, {
        primaryLocalId: item.localId ?? localIds[0],
        source: "tree-search"
    });
    await fitSelected();
    setStatus(localIds.length < item.localIds.length
        ? `已定位前 ${localIds.length} 个匹配构件`
        : `已定位：${item.title}`);
}

function createTreeItem(item, depth) {
    const li = document.createElement("li");
    const children = Array.isArray(item.children) ? item.children : [];
    const localId = typeof item.localId === "number" ? item.localId : null;
    const nodeLocalIds = collectTreeLocalIds(item);
    const dataLocalIds = normalizeLocalIds(Array.isArray(item.dataLocalIds) ? item.dataLocalIds : []);
    const isDataNode = dataLocalIds.length > 0 && nodeLocalIds.length === 0;
    const isGroupNode = children.length > 0 || nodeLocalIds.length > 1 || localId === null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "treeNode";
    button.dataset.localId = localId === null ? "" : String(localId);
    if (localId !== null) {
        button.dataset.needsLabel = "true";
    }
    button.style.paddingLeft = `${Math.min(depth * 8 + 6, 42)}px`;

    const toggle = document.createElement("span");
    toggle.className = "treeToggle";
    toggle.textContent = children.length ? ">" : "";
    const name = document.createElement("span");
    name.className = "treeName";
    name.textContent = getInitialTreeLabel(item, localId, nodeLocalIds);
    const id = document.createElement("span");
    id.className = "treeId";
    id.textContent = getTreeMetaLabel(item, localId, nodeLocalIds);

    button.append(toggle, name, id);
    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!children.length) {
            return;
        }
        const childList = li.querySelector(":scope > ul");
        if (!childList) {
            return;
        }
        hydrateTreeChildren(childList, children, depth + 1);
        const collapsed = childList.classList.toggle("collapsed");
        toggle.textContent = collapsed ? ">" : "v";
        if (!collapsed) {
            hydrateVisibleTreeLabels();
        }
    });
    button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (isDataNode) {
            await showTreeDataSummary(item, {
                node: button,
                dataLocalIds,
                childCount: children.length,
                depth
            });
            return;
        }
        if (isGroupNode) {
            await showTreeGroupSummary(item, {
                node: button,
                localIds: nodeLocalIds,
                localId,
                childCount: children.length,
                depth
            });
            return;
        }
        await selectLocalIds(nodeLocalIds, {
            primaryLocalId: localId ?? nodeLocalIds[0] ?? null,
            source: "tree",
            triggerNode: button
        });
    });
    li.appendChild(button);

    if (children.length) {
        const ul = document.createElement("ul");
        ul.className = "treeChildren collapsed";
        ul.dataset.lazy = "true";
        li.appendChild(ul);
    }
    return li;
}

async function showTreeGroupSummary(item, options = {}) {
    const localIds = normalizeLocalIds(options.localIds);
    if (!localIds.length) {
        return;
    }
    const isLargeGroup = localIds.length > TREE_GROUP_SELECT_LIMIT;
    await clearSelection("tree-group");
    activeTreeGroupSummary = {
        item,
        node: options.node || null,
        localIds,
        localId: options.localId ?? null,
        childCount: options.childCount || 0,
        depth: options.depth || 0,
        virtualKey: options.virtualKey || null,
        isLargeGroup,
        nodeType: getTreeGroupNodeType(options)
    };
    setSelectionControlsEnabled(false);
    renderActiveTreeGroupSummary();
    setStatus(`已选中分组摘要：${localIds.length} 个构件，未执行全量高亮`);
    log("Tree group summary", {
        count: localIds.length,
        childCount: options.childCount || 0,
        limit: TREE_GROUP_SELECT_LIMIT,
        isLargeGroup,
        nodeType: activeTreeGroupSummary.nodeType
    });
}

function getTreeGroupNodeType(options = {}) {
    if (currentTreeTab === "classes") {
        return "class-group";
    }
    if (currentTreeTab === "storeys") {
        return "storey-group";
    }
    if (currentTreeTab === "objects") {
        return "spatial-group";
    }
    if ((options.depth || 0) === 0) {
        return "model-summary";
    }
    return "group";
}

async function showTreeDataSummary(item, options = {}) {
    const dataLocalIds = normalizeLocalIds(options.dataLocalIds);
    if (!dataLocalIds.length) {
        return;
    }
    await clearSelection("tree-data");
    activeTreeGroupSummary = null;
    activeTreeDataSummary = {
        item,
        node: options.node || null,
        dataLocalIds,
        childCount: options.childCount || 0,
        depth: options.depth || 0,
        virtualKey: options.virtualKey || null,
        nodeType: getTreeDataNodeType(item, options)
    };
    setActiveTreeNode(options.node);
    selectedHud.textContent = `${dataLocalIds.length} 个数据实体`;
    selectedCategory.textContent = "数据节点摘要";
    selectedId.textContent = "不参与模型高亮";
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    setSelectionControlsEnabled(false);
    setBasicProps({
        "节点类型": activeTreeDataSummary.nodeType,
        "节点名称": item.label || item.category || item.meta || "未命名数据节点",
        "实体数量": dataLocalIds.length,
        "子节点数量": options.childCount || 0,
        "交互方式": "仅数据浏览，不参与三维高亮",
        "操作建议": "展开子类或查看下方样例实体"
    });
    await renderTreeDataSummary(activeTreeDataSummary);
    setStatus(`已打开数据节点：${dataLocalIds.length} 个实体，不参与模型高亮`);
    log("Tree data summary", {
        count: dataLocalIds.length,
        childCount: options.childCount || 0,
        nodeType: activeTreeDataSummary.nodeType
    });
}

function getTreeDataNodeType(item, options = {}) {
    const category = String(item?.category || item?.label || "").toUpperCase();
    if (category.includes("MATERIAL")) {
        return "material-data";
    }
    if (category.includes("PROPERTY")) {
        return "property-data";
    }
    if (category.includes("TYPE")) {
        return "type-data";
    }
    if ((options.depth || 0) === 0) {
        return "metadata-root";
    }
    return "metadata-group";
}

async function renderTreeDataSummary(summary) {
    attributeTable.textContent = "";
    attributeEmpty.style.display = "none";

    const panel = document.createElement("div");
    panel.className = "treeGroupActions";
    const title = document.createElement("div");
    title.className = "treeGroupActionsTitle";
    title.textContent = "数据浏览";
    const hint = document.createElement("div");
    hint.className = "treeGroupActionsHint";
    hint.textContent = "该节点包含非几何或元数据实体，不会触发构件选择、高亮、隔离。";
    const meta = document.createElement("div");
    meta.className = "treeGroupActionsMeta";
    meta.textContent = `${summary.dataLocalIds.length} 个数据实体 / ${summary.childCount} 个子节点`;
    panel.append(title, hint, meta);
    attributeTable.appendChild(panel);

    const sampleIds = summary.dataLocalIds.slice(0, 12);
    for (const localId of sampleIds) {
        const info = await fetchBasicTreeInfo(localId);
        const flat = flattenInfo(info);
        const name = pickValue(flat, ["entityName", "EntityName", "Name", "name", "LongName"]) || "-";
        appendAttributeRow(
            `#${localId}`,
            [
                info.category || "Unknown",
                info.guid ? `GUID ${info.guid}` : "",
                name !== "-" ? `Name ${name}` : ""
            ].filter(Boolean).join(" / ") || "数据实体"
        );
    }
    if (summary.dataLocalIds.length > sampleIds.length) {
        appendAttributeRow("更多", `还有 ${summary.dataLocalIds.length - sampleIds.length} 个实体未展示`);
    }
}

function renderTreeGroupActions(summary) {
    attributeTable.textContent = "";
    attributeEmpty.style.display = "none";
    const panel = document.createElement("div");
    panel.className = "treeGroupActions";

    const title = document.createElement("div");
    title.className = "treeGroupActionsTitle";
    title.textContent = "分组操作";

    const hint = document.createElement("div");
    hint.className = "treeGroupActionsHint";
    hint.textContent = "默认只选中分组摘要；需要高成本操作时，请手动触发。";

    const actions = document.createElement("div");
    actions.className = "treeGroupActionButtons";
    [
        ["highlight", "高亮全部"],
        ["isolate", "隔离全部"],
        ["expand", "展开查看"]
    ].forEach(([action, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "smallBtn";
        button.textContent = label;
        button.dataset.treeGroupAction = action;
        button.addEventListener("click", () => handleTreeGroupAction(action));
        actions.appendChild(button);
    });

    const meta = document.createElement("div");
    meta.className = "treeGroupActionsMeta";
    meta.textContent = `${summary.localIds.length} 个构件 / ${summary.childCount} 个子节点`;
    panel.append(title, hint, actions, meta);
    attributeTable.appendChild(panel);
}

function renderActiveTreeGroupSummary(selectionState = "") {
    const summary = activeTreeGroupSummary;
    if (!summary) {
        return false;
    }
    setActiveTreeNode(summary.node);
    selectedHud.textContent = `${summary.localIds.length} 个构件`;
    selectedCategory.textContent = "分组摘要";
    selectedId.textContent = selectionState || "未高亮全部";
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    setBasicProps({
        "节点类型": summary.nodeType,
        "分组名称": summary.item.label || summary.item.category || summary.item.meta || "未命名分组",
        "构件数量": summary.localIds.length,
        "子节点数量": summary.childCount || 0,
        "高亮策略": summary.isLargeGroup
            ? `超过 ${TREE_GROUP_SELECT_LIMIT} 个构件，默认跳过全量高亮`
            : "分组节点默认只显示摘要，可手动高亮全部",
        "操作建议": "点击下方按钮操作分组，或展开选择具体构件"
    });
    renderTreeGroupActions(summary);
    return true;
}

async function handleTreeGroupAction(action) {
    if (!activeTreeGroupSummary) {
        setStatus("没有可操作的大分组");
        return;
    }
    if (action === "expand") {
        expandActiveTreeGroup();
        return;
    }
    if (action === "highlight") {
        await selectActiveTreeGroup("highlight");
        return;
    }
    if (action === "isolate") {
        await selectActiveTreeGroup("isolate");
        await isolateSelected();
    }
}

async function selectActiveTreeGroup(action) {
    const summary = activeTreeGroupSummary;
    if (!summary?.localIds?.length) {
        return null;
    }
    setStatus(`${action === "isolate" ? "正在选择并隔离" : "正在高亮"} ${summary.localIds.length} 个构件`);
    const selection = await selectLocalIds(summary.localIds, {
        primaryLocalId: summary.localId ?? summary.localIds[0],
        source: "tree-group-action",
        triggerNode: summary.node,
        allowLargeSelection: true
    });
    setStatus(action === "isolate"
        ? `已选择 ${summary.localIds.length} 个构件，正在执行隔离`
        : `已高亮大分组：${summary.localIds.length} 个构件`);
    return selection;
}

function expandActiveTreeGroup() {
    if (treeVirtualMode && activeTreeGroupSummary?.virtualKey) {
        treeExpandedKeys.add(activeTreeGroupSummary.virtualKey);
        refreshVirtualTreeRows();
        setStatus("已展开大分组，可继续选择具体构件");
        return;
    }
    const node = activeTreeGroupSummary?.node;
    const toggle = node?.querySelector(".treeToggle");
    if (!toggle || !toggle.textContent) {
        setStatus("当前分组没有可展开的子节点");
        return;
    }
    const list = node.closest("li")?.querySelector(":scope > ul");
    if (list?.classList.contains("collapsed")) {
        toggle.click();
    }
    setStatus("已展开大分组，可继续选择具体构件");
}

function hydrateTreeChildren(list, children, depth) {
    if (!list || list.dataset.lazy !== "true") {
        return;
    }
    list.dataset.rendered = "0";
    const fragment = document.createDocumentFragment();
    appendTreeChildrenBatch(fragment, list, children, depth);
    list.appendChild(fragment);
    list.dataset.lazy = "false";
}

function appendTreeChildrenBatch(fragment, list, children, depth) {
    const rendered = Number(list.dataset.rendered || 0);
    const next = Math.min(rendered + TREE_CHILD_BATCH_SIZE, children.length);
    for (let index = rendered; index < next; index++) {
        fragment.appendChild(createTreeItem(children[index], depth));
    }
    list.dataset.rendered = String(next);
    const oldMore = list.querySelector(":scope > .treeLoadMoreItem");
    oldMore?.remove();
    if (next < children.length) {
        fragment.appendChild(createTreeLoadMore(list, children, depth, next));
    }
}

function createTreeLoadMore(list, children, depth, rendered) {
    const li = document.createElement("li");
    li.className = "treeLoadMoreItem";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "treeLoadMore";
    button.textContent = `加载更多 ${children.length - rendered} 个节点`;
    button.style.paddingLeft = `${Math.min(depth * 8 + 24, 60)}px`;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        const fragment = document.createDocumentFragment();
        appendTreeChildrenBatch(fragment, list, children, depth);
        list.appendChild(fragment);
        hydrateVisibleTreeLabels();
    });
    li.appendChild(button);
    return li;
}

function getInitialTreeLabel(item, localId, nodeLocalIds) {
    if (localId !== null) {
        return "正在读取名称...";
    }
    if (item.label) {
        return item.label;
    }
    return `Group (${nodeLocalIds.length})`;
}

function getTreeMetaLabel(item, localId, nodeLocalIds) {
    if (item.meta) {
        return item.meta;
    }
    if (localId !== null && item.category) {
        return "";
    }
    if (localId !== null) {
        return "";
    }
    return `${nodeLocalIds.length}`;
}

function normalizeIfcLabel(value) {
    const text = String(value || "");
    const match = text.match(/^(IFC_?[A-Z0-9]+)(.*)$/i);
    if (!match) {
        return text || "Node";
    }
    const rawType = match[1].toUpperCase().replace(/^IFC_?/, "");
    const suffix = match[2] || "";
    const mapped = IFC_LABELS[rawType] || splitIfcType(rawType);
    return `${mapped}${suffix}`;
}

const IFC_LABELS = {
    PROJECT: "Project",
    SITE: "Site",
    BUILDING: "Building",
    BUILDINGSTOREY: "Storey",
    SPACE: "Space",
    WALL: "Wall",
    WALLSTANDARDCASE: "Wall",
    SLAB: "Slab",
    DOOR: "Door",
    WINDOW: "Window",
    BEAM: "Beam",
    COLUMN: "Column",
    MEMBER: "Member",
    PLATE: "Plate",
    STAIR: "Stair",
    STAIRFLIGHT: "Stair Flight",
    RAILING: "Railing",
    ROOF: "Roof",
    CURTAINWALL: "Curtain Wall",
    FURNISHINGELEMENT: "Furniture",
    FLOWSEGMENT: "Flow Segment",
    FLOWFITTING: "Flow Fitting",
    FLOWTERMINAL: "Flow Terminal",
    DISTRIBUTIONELEMENT: "Distribution Element",
    BUILDINGELEMENTPROXY: "Element Proxy",
    OPENINGELEMENT: "Opening",
    COVERING: "Covering",
    FOOTING: "Footing",
    PILE: "Pile",
    RAMP: "Ramp",
    RAMPFLIGHT: "Ramp Flight"
};

function splitIfcType(value) {
    return String(value)
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function hydrateVisibleTreeLabels() {
    if (!currentModel) {
        return;
    }
    const nodes = [...modelTree.querySelectorAll("[data-needs-label='true']")].slice(0, 450);
    for (let index = 0; index < nodes.length; index += TREE_LABEL_HYDRATE_BATCH_SIZE) {
        const batch = nodes.slice(index, index + TREE_LABEL_HYDRATE_BATCH_SIZE);
        await Promise.all(batch.map((node) => hydrateTreeLabelNode(node)));
        await nextFrame();
    }
}

async function hydrateTreeLabelNode(node) {
    const localId = Number(node.dataset.localId);
    if (!Number.isFinite(localId)) {
        return;
    }
    const label = await getTreeNodeDisplayName(localId);
    if (!label) {
        return;
    }
    const nameEl = node.querySelector(".treeName");
    const idEl = node.querySelector(".treeId");
    if (nameEl) {
        nameEl.textContent = label.name;
        nameEl.title = label.title;
    }
    if (idEl) {
        idEl.textContent = label.meta;
        idEl.title = label.metaTitle;
    }
    node.dataset.needsLabel = "false";
}

async function getTreeNodeDisplayName(localId) {
    if (treeLabelCache.has(localId)) {
        return treeLabelCache.get(localId);
    }
    const fallback = {
        name: `Node #${localId}`,
        meta: `#${localId}`,
        title: `localId ${localId}`,
        metaTitle: `localId ${localId}`
    };
    try {
        const info = await fetchBasicTreeInfo(localId);
        const flat = flattenInfo(info);
        const name = pickValue(flat, ["entityName", "EntityName", "Name", "name", "LongName"]);
        const label = {
            name: name || fallback.name,
            meta: "",
            title: `${name || fallback.name} | localId ${localId}`,
            metaTitle: info.guid ? `GUID ${info.guid}` : `localId ${localId}`
        };
        treeLabelCache.set(localId, label);
        return label;
    } catch {
        treeLabelCache.set(localId, fallback);
        return fallback;
    }
}

async function fetchBasicTreeInfo(localId) {
    if (typeof localId !== "number" || !currentModel) {
        return {
            category: null,
            guid: null,
            attributes: {},
            data: null
        };
    }
    if (treeBasicInfoCache.has(localId)) {
        return treeBasicInfoCache.get(localId);
    }
    if (treeBasicInfoInflight.has(localId)) {
        return treeBasicInfoInflight.get(localId);
    }
    const promise = readBasicTreeInfo(localId)
        .then((info) => {
            treeBasicInfoCache.set(localId, info);
            treeBasicInfoInflight.delete(localId);
            return info;
        })
        .catch((error) => {
            treeBasicInfoInflight.delete(localId);
            throw error;
        });
    treeBasicInfoInflight.set(localId, promise);
    return promise;
}

async function readBasicTreeInfo(localId) {
    const result = {
        category: null,
        guid: null,
        attributes: {},
        data: null
    };
    const item = currentModel.getItem(localId);
    try {
        result.category = await item.getCategory();
    } catch {
        result.category = null;
    }
    try {
        const [guid] = await currentModel.getGuidsByLocalIds([localId]);
        result.guid = guid;
    } catch {
        result.guid = null;
    }
    try {
        const attrs = await item.getAttributes();
        result.attributes = attrs && attrs.object ? attrs.object : mapToObject(attrs);
    } catch {
        result.attributes = {};
    }
    try {
        const data = await currentModel.getItemsData([localId], {attributesDefault: true});
        result.data = Array.isArray(data) ? data[0] : data;
    } catch {
        result.data = null;
    }
    return result;
}

function collectTreeLocalIds(item, result = []) {
    const canUseCache = arguments.length <= 1 && item && typeof item === "object";
    if (canUseCache && treeLocalIdsCache.has(item)) {
        return treeLocalIdsCache.get(item);
    }
    const localIds = new Set(result.filter((id) => typeof id === "number"));
    const stack = item ? [item] : [];
    while (stack.length) {
        const current = stack.pop();
        if (Array.isArray(current.localIds)) {
            for (const id of current.localIds) {
                if (typeof id === "number") {
                    localIds.add(id);
                }
            }
            continue;
        }
        if (typeof current.localId === "number") {
            localIds.add(current.localId);
        }
        if (Array.isArray(current.children)) {
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
    }
    const ids = [...localIds];
    if (canUseCache) {
        treeLocalIdsCache.set(item, ids);
    }
    return ids;
}

async function selectLocalIds(localIds, options = {}) {
    if (!interactionEngine || !localIds || localIds.length === 0) {
        return;
    }

    const uniqueLocalIds = [...new Set(localIds.filter((id) => typeof id === "number"))];
    if (!uniqueLocalIds.length) {
        return;
    }
    if (options.source !== "tree-group-action") {
        activeTreeGroupSummary = null;
    }
    activeTreeDataSummary = null;

    const requestId = ++selectionRequestId;
    const started = performance.now();
    setSelectionPending(true, uniqueLocalIds.length, options);
    await nextFrame();

    try {
        const selection = await interactionEngine.selectLocalIds(uniqueLocalIds, {
            ...options,
            maxGlobalIds: options.source === "tree" ? 1 : 100
        });
        if (requestId !== selectionRequestId) {
            return;
        }
        if (options.source === "tree" && options.triggerNode) {
            setActiveTreeNode(options.triggerNode);
        }
        log("Selection updated", {
            source: options.source || "unknown",
            primaryLocalId: selection.primaryLocalId,
            count: selection.count,
            seconds: seconds(started)
        });
        return selection;
    } finally {
        if (requestId === selectionRequestId) {
            setSelectionPending(false);
        }
    }
}

function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function setSelectionPending(pending, count = 0, options = {}) {
    if (options.source === "path-keyframe-playback") {
        return;
    }
    if (pending) {
        modeHud.textContent = options.source === "tree" ? "选中中" : "拾取中";
        selectedHud.textContent = count > 1 ? `选中中 ${count} 个构件` : "选中中";
        options.triggerNode?.classList.add("pending");
        pendingTreeNode = options.triggerNode || null;
        setSelectionControlsEnabled(false);
        return;
    }

    pendingTreeNode?.classList.remove("pending");
    pendingTreeNode = null;
    modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
}

function startRelocateTarget(type, id) {
    const item = type === "label" ? labelStoreEngine.get(id) : annotationEngine.get(id);
    if (!item || typeof item.localId !== "number") {
        setStatus("该气泡未绑定构件，不能调整位置");
        return false;
    }
    if (type === "annotation" && !canEditAnnotation(item)) {
        setStatus("当前用户无权调整该批注位置");
        return false;
    }
    if (relocateTarget?.type === type && relocateTarget.id === item.id) {
        cancelRelocateTarget("toggle");
        setStatus("已关闭气泡位置调整");
        return false;
    }
    cancelActiveTool("relocate-start");
    requestToolMode(TOOL_MODES.BUBBLE_RELOCATE, true, {source: "bubble-relocate"});
    relocateTarget = {
        type,
        id: item.id,
        localId: item.localId,
        title: item.title || item.content || (type === "label" ? "标签" : "批注")
    };
    canvas.parentElement.classList.add("relocateMode");
    setBubbleToolExpanded(true);
    modeHud.textContent = "调位置";
    setStatus(`位置调整中：在原构件 localId ${item.localId} 上连续点击可调整，再次点击“调位置”关闭`);
    syncRelocateControls();
    renderAnnotationList();
    renderLabelList();
    log("Relocate mode started", {
        type,
        id: item.id,
        localId: item.localId
    });
    return true;
}

function setBubbleToolExpanded(expanded) {
    bubbleToolExpanded = Boolean(expanded);
    viewportPanelManager.setOpen("bubble-tools", bubbleToolExpanded, {
        source: "bubble-tools"
    });
}

function loadBubbleStyleState() {
    const fallback = {
        preset: "default",
        custom: {...DEFAULT_BUBBLE_CUSTOM_STYLE}
    };
    try {
        const raw = window.localStorage.getItem(BUBBLE_STYLE_STORAGE_KEY);
        if (!raw) {
            return fallback;
        }
        const parsed = JSON.parse(raw);
        const custom = normalizeBubbleCustomStyle({
            ...parsed?.custom,
            borderColor: parsed?.custom?.borderColor || parsed?.customColor
        });
        return {
            preset: BUBBLE_STYLE_PRESETS.includes(parsed?.preset) ? parsed.preset : fallback.preset,
            custom
        };
    } catch (error) {
        log("Bubble style state load failed", {message: errorMessage(error)});
        return fallback;
    }
}

function loadBubbleClusterEnabled() {
    try {
        const raw = localStorage.getItem(BUBBLE_CLUSTER_STORAGE_KEY);
        return raw === null ? true : raw === "1";
    } catch {
        return true;
    }
}

function saveBubbleClusterEnabled() {
    try {
        localStorage.setItem(BUBBLE_CLUSTER_STORAGE_KEY, bubbleClusterEnabled ? "1" : "0");
    } catch {
        // Local storage may be unavailable in embedded environments.
    }
}

function normalizeHexColor(value, fallback) {
    const color = String(value || "");
    return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, number));
}

function normalizeBubbleCustomStyle(value = {}) {
    return {
        backgroundColor: normalizeHexColor(value.backgroundColor, DEFAULT_BUBBLE_CUSTOM_STYLE.backgroundColor),
        textColor: normalizeHexColor(value.textColor, DEFAULT_BUBBLE_CUSTOM_STYLE.textColor),
        mutedColor: normalizeHexColor(value.mutedColor, DEFAULT_BUBBLE_CUSTOM_STYLE.mutedColor),
        borderColor: normalizeHexColor(value.borderColor, DEFAULT_BUBBLE_CUSTOM_STYLE.borderColor),
        opacity: clampNumber(value.opacity, 45, 100, DEFAULT_BUBBLE_CUSTOM_STYLE.opacity),
        radius: clampNumber(value.radius, 0, 18, DEFAULT_BUBBLE_CUSTOM_STYLE.radius),
        shadow: clampNumber(value.shadow, 0, 80, DEFAULT_BUBBLE_CUSTOM_STYLE.shadow),
        fontSize: clampNumber(value.fontSize, 10, 16, DEFAULT_BUBBLE_CUSTOM_STYLE.fontSize)
    };
}

function hexToRgb(value) {
    const color = normalizeHexColor(value, "#000000");
    return {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16)
    };
}

function hexToRgba(value, opacityPercent) {
    const {r, g, b} = hexToRgb(value);
    const alpha = clampNumber(opacityPercent, 45, 100, 90) / 100;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
}

function updateBubbleCustomValueLabels() {
    const custom = bubbleStyleState.custom || DEFAULT_BUBBLE_CUSTOM_STYLE;
    if (bubbleCustomValueEls.opacity) {
        bubbleCustomValueEls.opacity.textContent = `${Math.round(custom.opacity)}%`;
    }
    if (bubbleCustomValueEls.radius) {
        bubbleCustomValueEls.radius.textContent = String(Math.round(custom.radius));
    }
    if (bubbleCustomValueEls.shadow) {
        bubbleCustomValueEls.shadow.textContent = String(Math.round(custom.shadow));
    }
    if (bubbleCustomValueEls.fontSize) {
        bubbleCustomValueEls.fontSize.textContent = String(Math.round(custom.fontSize));
    }
}

function saveBubbleStyleState() {
    try {
        window.localStorage.setItem(BUBBLE_STYLE_STORAGE_KEY, JSON.stringify(bubbleStyleState));
    } catch (error) {
        log("Bubble style state save failed", {message: errorMessage(error)});
    }
}

function applyBubbleStyleState() {
    const viewport = canvas?.parentElement;
    if (viewport) {
        for (const preset of BUBBLE_STYLE_PRESETS) {
            viewport.classList.remove(`bubbleStyle-${preset}`);
        }
        viewport.classList.add(`bubbleStyle-${bubbleStyleState.preset}`);
        const custom = normalizeBubbleCustomStyle(bubbleStyleState.custom);
        viewport.style.setProperty("--bubble-custom-bg", hexToRgba(custom.backgroundColor, custom.opacity));
        viewport.style.setProperty("--bubble-custom-bg-hover", hexToRgba(custom.backgroundColor, Math.min(100, custom.opacity + 6)));
        viewport.style.setProperty("--bubble-custom-text", custom.textColor);
        viewport.style.setProperty("--bubble-custom-muted", custom.mutedColor);
        viewport.style.setProperty("--bubble-custom-border", custom.borderColor);
        viewport.style.setProperty("--bubble-custom-radius", `${custom.radius}px`);
        viewport.style.setProperty("--bubble-custom-shadow", `rgba(0, 0, 0, ${(custom.shadow / 100).toFixed(2)})`);
        viewport.style.setProperty("--bubble-custom-font-size", `${custom.fontSize}px`);
    }
    if (bubbleStylePresetSelect) {
        bubbleStylePresetSelect.value = bubbleStyleState.preset;
    }
    for (const input of bubbleCustomInputs) {
        const key = input.dataset.bubbleCustom;
        if (key && bubbleStyleState.custom?.[key] !== undefined) {
            input.value = bubbleStyleState.custom[key];
        }
        input.disabled = bubbleStyleState.preset !== "custom";
    }
    updateBubbleCustomValueLabels();
}

function applyBubbleClusterState() {
    bubbleClusterEngine.setEnabled(bubbleClusterEnabled);
    if (bubbleClusterInput) {
        bubbleClusterInput.checked = bubbleClusterEnabled;
    }
    scheduleBubbleClustering({force: true});
}

function updateBubbleClusterStatus(summary = lastBubbleClusterSummary) {
    lastBubbleClusterSummary = summary || lastBubbleClusterSummary;
    if (!bubbleClusterStatus) {
        return;
    }
    if (!bubbleClusterEnabled) {
        bubbleClusterStatus.textContent = "聚合关闭";
        return;
    }
    if (!currentModel) {
        bubbleClusterStatus.textContent = "加载模型后可聚合气泡";
        return;
    }
    if (!summary?.clusterCount) {
        bubbleClusterStatus.textContent = summary?.itemCount ? `未触发聚合 · ${summary.itemCount} 个气泡` : "暂无可聚合气泡";
        return;
    }
    bubbleClusterStatus.textContent = `已聚合 ${summary.clusteredCount} 个气泡 / ${summary.clusterCount} 组`;
}

function setBubbleClusterEnabled(enabled) {
    bubbleClusterEnabled = Boolean(enabled);
    saveBubbleClusterEnabled();
    applyBubbleClusterState();
    setStatus(bubbleClusterEnabled ? "已开启气泡聚合" : "已关闭气泡聚合");
    log("Bubble cluster changed", {
        enabled: bubbleClusterEnabled,
        ...lastBubbleClusterSummary
    });
}

function updateBubbleStylePreset(value) {
    const preset = BUBBLE_STYLE_PRESETS.includes(value) ? value : "default";
    bubbleStyleState = {
        ...bubbleStyleState,
        preset
    };
    applyBubbleStyleState();
    refreshBubbles();
    saveBubbleStyleState();
    setStatus(`气泡样式已切换为：${bubbleStylePresetSelect?.selectedOptions?.[0]?.textContent || preset}`);
    log("Bubble style preset changed", bubbleStyleState);
}

function updateBubbleCustomStyle(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_BUBBLE_CUSTOM_STYLE, key)) {
        return;
    }
    const nextCustom = normalizeBubbleCustomStyle({
        ...bubbleStyleState.custom,
        [key]: value
    });
    bubbleStyleState = {
        ...bubbleStyleState,
        preset: "custom",
        custom: nextCustom
    };
    applyBubbleStyleState();
    refreshBubbles();
    saveBubbleStyleState();
    log("Bubble custom style changed", {key, value: nextCustom[key]});
}

function cancelRelocateTarget(reason = "cancel", options = {}) {
    if (!relocateTarget) {
        requestToolMode(TOOL_MODES.BUBBLE_RELOCATE, false, options);
        return;
    }
    log("Relocate mode canceled", {
        reason,
        type: relocateTarget.type,
        id: relocateTarget.id
    });
    relocateTarget = null;
    requestToolMode(TOOL_MODES.BUBBLE_RELOCATE, false, options);
    canvas.parentElement.classList.remove("relocateMode");
    modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
    syncRelocateControls();
    renderAnnotationList();
    renderLabelList();
}

function syncRelocateControls() {
    const enabled = Boolean(currentModel && relocateTarget);
    if (bubbleNudgeStepInput) {
        bubbleNudgeStepInput.disabled = !enabled;
    }
    for (const button of bubbleNudgeButtons) {
        button.disabled = !enabled;
    }
    updateBubbleNudgeStepValue();
}

function updateBubbleNudgeStepValue() {
    if (!bubbleNudgeStepInput || !bubbleNudgeStepValue) {
        return;
    }
    bubbleNudgeStepValue.textContent = bubbleNudgeStepInput.value;
}

function getRelocateItem() {
    if (!relocateTarget) {
        return null;
    }
    return relocateTarget.type === "label"
        ? labelStoreEngine.get(relocateTarget.id)
        : annotationEngine.get(relocateTarget.id);
}

function getBubbleNudgeDistance() {
    const sliderValue = Number(bubbleNudgeStepInput?.value || 6);
    const normalized = Number.isFinite(sliderValue) ? Math.max(1, sliderValue) : 6;
    return getModelScaleStep() * normalized / 20;
}

function getCameraNudgeVector(direction) {
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward).normalize();
    if (direction === "left") {
        return right.multiplyScalar(-1);
    }
    if (direction === "right") {
        return right;
    }
    if (direction === "up") {
        return up;
    }
    if (direction === "down") {
        return up.multiplyScalar(-1);
    }
    if (direction === "forward") {
        return forward;
    }
    if (direction === "back") {
        return forward.multiplyScalar(-1);
    }
    return null;
}

function nudgeRelocateTarget(direction) {
    const item = getRelocateItem();
    if (!relocateTarget || !item) {
        setStatus("请先点击“调位置”进入位置调整");
        return;
    }
    const currentPosition = toVector3(item.position);
    if (!currentPosition) {
        setStatus("当前气泡没有可微调的位置，请先在模型上点击一个位置");
        return;
    }
    const directionVector = getCameraNudgeVector(direction);
    if (!directionVector) {
        return;
    }
    const nextPosition = currentPosition.add(directionVector.multiplyScalar(getBubbleNudgeDistance()));
    const position = vectorToArray(nextPosition);
    if (relocateTarget.type === "label") {
        const updated = labelStoreEngine.update(relocateTarget.id, {position});
        if (updated) {
            autoSyncBusinessDataItem("labels", updated, "save");
            renderLabelBubbles();
            renderLabelList();
        }
    } else {
        const actor = getCurrentAnnotationUser();
        const updated = annotationEngine.update(relocateTarget.id, {
            position,
            updatedBy: actor
        }, {actor});
        autoSyncBusinessDataItem("annotations", updated, "save");
        scheduleAnnotationMarkerUpdate();
        renderAnnotationList();
    }
    scheduleFragmentsUpdate();
    setStatus("气泡位置已微调，可继续调整或点击“关闭调位”");
    log("Relocate nudged", {
        type: relocateTarget.type,
        id: relocateTarget.id,
        direction,
        step: Number(bubbleNudgeStepInput?.value || 6),
        position
    });
}

async function handleRelocateCanvasClick(event) {
    const target = relocateTarget;
    if (!target) {
        return;
    }
    const hit = await pickLocalIdAt(event.clientX, event.clientY, `${target.type}-relocate`);
    if (!hit || !hit.point) {
        setStatus("未命中构件，请在原构件上重新选择位置");
        log("Relocate miss", {type: target.type, id: target.id});
        return;
    }
    if (!hit.localIds.includes(target.localId)) {
        setStatus(`请选择原绑定构件 localId ${target.localId} 上的位置`);
        log("Relocate rejected: different component", {
            type: target.type,
            id: target.id,
            expected: target.localId,
            actual: hit.localIds
        });
        return;
    }

    if (target.type === "label") {
        const updated = labelStoreEngine.update(target.id, {position: hit.point});
        if (updated) {
            autoSyncBusinessDataItem("labels", updated, "save");
            renderLabelBubbles();
            renderLabelList();
        }
    } else if (target.type === "annotation") {
        const actor = getCurrentAnnotationUser();
        const updated = annotationEngine.update(target.id, {
            position: hit.point,
            updatedBy: actor
        }, {actor});
        autoSyncBusinessDataItem("annotations", updated, "save");
        scheduleAnnotationMarkerUpdate();
        renderAnnotationList();
    }

    scheduleFragmentsUpdate();
    setStatus("气泡位置已更新，可继续点击调整；再次点击“调位置”关闭");
    log("Relocate complete", {
        type: target.type,
        id: target.id,
        localId: target.localId,
        point: hit.point
    });
}

async function clearSelection(source = "api") {
    if (!interactionEngine) {
        return;
    }
    if (source !== "tree-group") {
        activeTreeGroupSummary = null;
    }
    if (source !== "tree-data") {
        activeTreeDataSummary = null;
    }
    await interactionEngine.clearSelection({source});
    modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
    log("Selection cleared", {source});
}

function syncMeasurementState(state, reason) {
    updateToolHud();
    syncMeasurementControls(state);
    if (reason === "preview" && state.preview) {
        showSnapMarker(state.preview.point, state.preview.snapType, state.preview.snappedEdge);
    }
    if (reason === "preview" && !state.preview && (snapEnabled || measureEnabled)) {
        hideSnapMarker();
        refreshSelectionHighlight();
    }
    if (reason === "start") {
        if (state.mode === "angle") {
            setStatus(state.pendingCount === 1 ? "已选择第一点，请选择角度顶点" : "已选择顶点，请选择第三点");
        } else if (state.mode === "area") {
            if (state.pendingArea?.text) {
                setStatus(`面积预览：${state.pendingArea.text}，可继续选点或双击完成面积`);
                showMeasurePreviewResult("面积预览", state.pendingArea.text);
            } else {
                hideMeasureResult();
                setStatus(state.pendingCount < 3
                    ? `已选择 ${state.pendingCount} 个点，请按顺时针或逆时针继续选择面积边界点，不能交叉选点`
                    : `已选择 ${state.pendingCount} 个点，可继续沿同一方向选择或双击完成面积，不能交叉选点`);
            }
        } else {
            setStatus("已选择测量起点，请选择终点");
        }
    } else if (reason === "measure" && state.measurements.length) {
        const latest = state.measurements[state.measurements.length - 1];
        const typeText = latest.type === "angle" ? "角度测量" : latest.type === "area" ? "面积测量" : "测量";
        setStatus(`${typeText}完成：${getMeasurementText(latest)}`);
        showMeasureResult(latest);
    } else if (reason === "undo" || reason === "undo-pending") {
        setStatus(state.pendingStart ? "已撤销上一操作" : `测量剩余 ${state.count} 条`);
        if (!state.measurements.length) {
            hideMeasureResult();
        } else {
            showMeasureResult(state.measurements[state.measurements.length - 1]);
        }
    } else if (reason === "clear") {
        setStatus("测量已清空");
        hideMeasureResult();
    } else if (reason === "invalid-area") {
        setStatus("面积无法生成，请重新选择不共线的边界点");
    } else if (reason === "area-self-intersection") {
        setStatus("面积边界不能交叉，请重新选择点或撤销上一点");
        syncAreaMeasureHint(state, "面积边界不能交叉。请按顺时针或逆时针沿边界重新选择点，或撤销上一点。");
    } else if (reason === "area-non-planar") {
        setStatus("面积点不在同一平面，请选择同一平面上的边界点");
        syncAreaMeasureHint(state, "面积点不在同一平面。请选择同一平面上的边界点。");
    }
}

function showMeasureResult(measurement) {
    if (!measureResultHud || !measurement) {
        return;
    }
    const text = getMeasurementText(measurement);
    if (!text) {
        return;
    }
    lastMeasureResult = measurement;
    const typeText = measurement.type === "angle" ? "角度" : measurement.type === "area" ? "面积" : "距离";
    measureResultHud.hidden = false;
    measureResultHud.textContent = `${typeText}：${text}`;
    if (measurement.type === "area") {
        syncAreaMeasureHint(measurementEngine.getState(), `面积测量完成：${text}`);
    }
}

function showMeasurePreviewResult(typeText, text) {
    if (!measureResultHud || !text) {
        return;
    }
    measureResultHud.hidden = false;
    measureResultHud.textContent = `${typeText}：${text}`;
}

function getMeasurementText(measurement) {
    if (measurement?.text) {
        return measurement.text;
    }
    if (measurement?.type === "area" && Number.isFinite(measurement.area)) {
        return `${measurement.area.toFixed(3)} ${measurement.unit || "m^2"}`;
    }
    if (measurement?.type === "angle" && Number.isFinite(measurement.angle)) {
        return `${measurement.angle.toFixed(1)}°`;
    }
    if (Number.isFinite(measurement?.distance)) {
        return `${measurement.distance.toFixed(3)} ${measurement.unit || "m"}`;
    }
    return "";
}

function hideMeasureResult() {
    lastMeasureResult = null;
    if (!measureResultHud) {
        return;
    }
    measureResultHud.hidden = true;
    measureResultHud.textContent = "";
}

function setSnapEnabled(enabled, options = {}) {
    const nextEnabled = Boolean(enabled && currentModel);
    requestToolMode(TOOL_MODES.SNAP, nextEnabled, options);
    snapEnabled = nextEnabled;
    snapBtn?.classList.toggle("active", snapEnabled);
    measurementEngine.setEnabled(snapEnabled || measureEnabled);
    if (!snapEnabled && !measureEnabled) {
        hideSnapMarker();
        refreshSelectionHighlight();
        hideMeasureResult();
    }
    updateToolHud();
    syncMeasurementControls();
    if (snapEnabled && !options.silent) {
        setStatus("捕捉已开启，移动鼠标可显示模型捕捉点");
        refreshSnapPreviewAtLastPointer();
    } else if (!snapEnabled && !options.silent) {
        setStatus("捕捉已关闭");
    }
    log("Snap mode", {enabled: snapEnabled});
}

function setRoamEnabled(enabled, options = {}) {
    const nextEnabled = Boolean(enabled && currentModel);
    requestToolMode(TOOL_MODES.FREE_INSPECT, nextEnabled, options);
    roamEnabled = freeInspectController.setEnabled(nextEnabled).enabled;
    roamBtn?.classList.toggle("active", roamEnabled);
    canvas.parentElement.classList.toggle("roamMode", roamEnabled);
    if (roamEnabled) {
        modeHud.textContent = "自由巡检";
        syncRoamSpeedControls();
        roamSpeedRow?.scrollIntoView({block: "nearest"});
        if (!options.silent) {
            setStatus("自由巡检已开启：W/S 前后移动，A/D 左右移动，Shift 加速");
        }
    } else {
        if (modeHud.textContent === "自由巡检") {
            modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
        }
        if (!options.silent) {
            setStatus("自由巡检已关闭");
        }
    }
    syncRoamSpeedControls();
    updateToolHud();
    log("Roam mode", {enabled: roamEnabled});
}

function toggleRoam() {
    setRoamEnabled(!roamEnabled);
}

function setFreeInspectMode(enabled, options = {}) {
    setRoamEnabled(enabled, options);
    return getFreeInspectMode();
}

function toggleFreeInspectMode(options = {}) {
    setRoamEnabled(!roamEnabled, options);
    return getFreeInspectMode();
}

function getFreeInspectMode() {
    return freeInspectController.getState();
}

function ensureModelTransformControls() {
    if (modelTransformControls) {
        return modelTransformControls;
    }
    modelTransformControls = new TransformControls(camera, renderer.domElement);
    modelTransformControls.setMode(modelTransformMode);
    modelTransformControls.addEventListener("dragging-changed", (event) => {
        cameraControlManager.set("model-transform-drag", event.value, {
            cursor: event.value ? "grabbing" : "",
            priority: 80,
            source: "model-transform-drag"
        });
        if (!event.value) {
            commitCurrentModelTransform("drag-end");
        }
    });
    modelTransformControls.addEventListener("objectChange", () => {
        refreshCurrentModelBoundsAfterTransform({syncSectionBounds: false});
        updateModelTransformStatus();
        syncOverlays();
        scheduleFragmentsUpdate();
    });
    modelTransformHelper = modelTransformControls.getHelper();
    modelTransformHelper.visible = false;
    modelTransformHelper.traverse((object) => {
        object.userData.sectionHelper = true;
        object.userData.modelTransformHelper = true;
    });
    scene.add(modelTransformHelper);
    return modelTransformControls;
}

function captureModelTransform(object = currentModel?.object) {
    if (!object) {
        return null;
    }
    return {
        position: vectorToArray(object.position),
        rotation: [
            Number(object.rotation.x.toFixed(6)),
            Number(object.rotation.y.toFixed(6)),
            Number(object.rotation.z.toFixed(6))
        ],
        scale: vectorToArray(object.scale)
    };
}

function applyModelTransformState(state, object = currentModel?.object) {
    if (!object || !state) {
        return false;
    }
    if (Array.isArray(state.position)) {
        object.position.fromArray(state.position.map(Number));
    }
    if (Array.isArray(state.rotation)) {
        object.rotation.set(
            Number(state.rotation[0]) || 0,
            Number(state.rotation[1]) || 0,
            Number(state.rotation[2]) || 0
        );
    }
    if (Array.isArray(state.scale)) {
        object.scale.fromArray(state.scale.map((value) => Number(value) || 1));
    }
    object.updateMatrixWorld(true);
    return true;
}

function getModelTransformStorageKey() {
    return currentModel?.modelId ? `${MODEL_TRANSFORM_STORAGE_PREFIX}${currentModel.modelId}` : "";
}

function loadStoredModelTransform() {
    const key = getModelTransformStorageKey();
    if (!key) {
        return null;
    }
    try {
        return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
        return null;
    }
}

function saveCurrentModelTransform() {
    const key = getModelTransformStorageKey();
    const state = captureModelTransform();
    if (!key || !state) {
        return null;
    }
    localStorage.setItem(key, JSON.stringify(state));
    return state;
}

function clearStoredModelTransform() {
    const key = getModelTransformStorageKey();
    if (key) {
        localStorage.removeItem(key);
    }
}

function restoreStoredModelTransform() {
    const stored = loadStoredModelTransform();
    if (!stored || !applyModelTransformState(stored)) {
        return false;
    }
    commitCurrentModelTransform("restore", {persist: false});
    return true;
}

function formatModelTransformStatus(state = captureModelTransform()) {
    if (!state) {
        return "加载模型后可调整模型位置";
    }
    const prefix = currentModelName ? `${currentModelName}｜` : "";
    const position = state.position.map((value) => Number(value).toFixed(2)).join(", ");
    const rotation = state.rotation
        .map((value) => THREE.MathUtils.radToDeg(Number(value)).toFixed(1))
        .join("°, ");
    return `${prefix}位置 ${position}；旋转 ${rotation}°`;
}

function updateModelTransformStatus() {
    if (modelTransformStatus) {
        modelTransformStatus.textContent = formatModelTransformStatus();
    }
    syncModelTransformValueInputs();
}

function setTransformInputValue(input, value, decimals = 3) {
    if (!input || document.activeElement === input) {
        return;
    }
    input.value = Number(value).toFixed(decimals);
}

function syncModelTransformValueInputs(state = captureModelTransform()) {
    const hasState = Boolean(state);
    const position = hasState ? state.position : [0, 0, 0];
    const rotation = hasState
        ? state.rotation.map((value) => THREE.MathUtils.radToDeg(Number(value)))
        : [0, 0, 0];
    for (const input of modelTransformPositionInputs) {
        const index = {x: 0, y: 1, z: 2}[input.dataset.modelTransformPosition] ?? 0;
        input.disabled = !hasState;
        setTransformInputValue(input, position[index] || 0, 3);
    }
    for (const input of modelTransformRotationInputs) {
        const index = {x: 0, y: 1, z: 2}[input.dataset.modelTransformRotation] ?? 0;
        input.disabled = !hasState;
        setTransformInputValue(input, rotation[index] || 0, 2);
    }
}

function readTransformNumber(input, fallback = 0) {
    const value = Number(input?.value);
    return Number.isFinite(value) ? value : fallback;
}

function applyModelTransformValues() {
    if (!currentModel?.object) {
        return;
    }
    const current = captureModelTransform() || {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    };
    const position = [...current.position];
    const rotationDegrees = current.rotation.map((value) => THREE.MathUtils.radToDeg(Number(value)));
    for (const input of modelTransformPositionInputs) {
        const index = {x: 0, y: 1, z: 2}[input.dataset.modelTransformPosition] ?? 0;
        position[index] = readTransformNumber(input, position[index]);
    }
    for (const input of modelTransformRotationInputs) {
        const index = {x: 0, y: 1, z: 2}[input.dataset.modelTransformRotation] ?? 0;
        rotationDegrees[index] = readTransformNumber(input, rotationDegrees[index]);
    }
    applyModelTransformState({
        position,
        rotation: rotationDegrees.map((value) => THREE.MathUtils.degToRad(value)),
        scale: current.scale
    });
    commitCurrentModelTransform("numeric-apply");
    syncModelTransformControls();
    setStatus("模型装配数值已应用");
}

function saveModelTransformSnapshot() {
    const state = saveCurrentModelTransform();
    updateModelTransformStatus();
    setStatus(state ? "模型装配状态已保存" : "暂无模型可保存");
    log("Model transform saved", {
        modelId: currentModel?.modelId || null,
        transform: state
    });
}

function restoreModelTransformSnapshot() {
    if (!restoreStoredModelTransform()) {
        setStatus("暂无已保存的模型装配状态");
        return;
    }
    syncModelTransformControls();
    setStatus("模型装配状态已恢复");
}

function refreshCurrentModelBoundsAfterTransform(options = {}) {
    if (!currentModel?.object) {
        return;
    }
    const entry = getManagedModelEntry(currentModel.modelId);
    if (entry) {
        refreshManagedModelBounds(entry, {syncActive: false});
    } else {
        currentModel.object.updateMatrixWorld(true);
    }
    const box = entry?.box || new THREE.Box3().setFromObject(currentModel.object);
    if (options.syncSectionBounds !== false) {
        sectionEngine.setBounds(box);
    }
}

function commitCurrentModelTransform(reason = "change", options = {}) {
    if (!currentModel) {
        return null;
    }
    refreshCurrentModelBoundsAfterTransform();
    const state = options.persist === false ? captureModelTransform() : saveCurrentModelTransform();
    if (state && modelRegistry.has(currentModel.modelId)) {
        modelRegistry.setTransform(currentModel.modelId, state, {
            kind: "current",
            dispatch: false,
            source: reason
        });
    }
    updateModelTransformStatus();
    syncModelTransformControls();
    syncOverlays();
    scheduleFragmentsUpdate({force: true});
    log("Model transform updated", {
        reason,
        modelId: currentModel.modelId,
        transform: state
    });
    return state;
}

function syncModelTransformControls(busy = false) {
    const hasModel = Boolean(currentModel?.object);
    if (modelTransformBtn) {
        modelTransformBtn.disabled = busy || !hasModel;
        modelTransformBtn.classList.toggle("active", modelTransformEnabled);
        modelTransformBtn.textContent = modelTransformEnabled ? "关闭变换" : "模型变换";
    }
    if (modelTransformModeSelect) {
        modelTransformModeSelect.disabled = busy || !hasModel;
        if (modelTransformModeSelect.value !== modelTransformMode) {
            modelTransformModeSelect.value = modelTransformMode;
        }
    }
    if (resetModelTransformBtn) {
        resetModelTransformBtn.disabled = busy || !hasModel;
    }
    updateModelTransformStatus();
    for (const input of [...modelTransformPositionInputs, ...modelTransformRotationInputs]) {
        input.disabled = busy || !hasModel;
    }
    if (applyModelTransformValuesBtn) {
        applyModelTransformValuesBtn.disabled = busy || !hasModel;
    }
    if (saveModelTransformBtn) {
        saveModelTransformBtn.disabled = busy || !hasModel;
    }
    if (restoreModelTransformBtn) {
        restoreModelTransformBtn.disabled = busy || !hasModel || !loadStoredModelTransform();
    }
}

function setModelTransformEnabled(enabled, options = {}) {
    const nextEnabled = Boolean(enabled && currentModel?.object);
    requestToolMode(TOOL_MODES.MODEL_TRANSFORM, nextEnabled, options);
    modelTransformEnabled = nextEnabled;
    viewportPanelManager.setOpen("model-assembly", modelTransformEnabled, {
        dispatch: options.fromPanelManager !== true,
        source: options.source || "model-transform"
    });
    const transformControls = modelTransformEnabled
        ? ensureModelTransformControls()
        : modelTransformControls;
    if (modelTransformEnabled) {
        transformControls.attach(currentModel.object);
        transformControls.setMode(modelTransformMode);
        modelTransformHelper.visible = true;
        cameraControlManager.release("model-transform-drag", {source: "model-transform-enable"});
        modeHud.textContent = modelTransformMode === "rotate" ? "Rotate model" : "Move model";
        if (!options.silent) {
            setStatus(modelTransformMode === "rotate" ? "模型旋转已开启：拖动旋转手柄调整模型" : "模型平移已开启：拖动箭头调整模型位置");
        }
    } else {
        transformControls?.detach();
        if (modelTransformHelper) {
            modelTransformHelper.visible = false;
        }
        cameraControlManager.release("model-transform-drag", {source: "model-transform-disable"});
        if (modeHud.textContent === "Rotate model" || modeHud.textContent === "Move model") {
            modeHud.textContent = "Browse";
        }
        if (!options.silent) {
            setStatus("模型变换已关闭");
        }
    }
    syncModelTransformControls();
    updateToolHud();
    log("Model transform mode", {
        enabled: modelTransformEnabled,
        mode: modelTransformMode
    });
}

function toggleModelTransform() {
    setModelTransformEnabled(!modelTransformEnabled);
}

function setModelTransformMode(mode) {
    modelTransformMode = mode === "rotate" ? "rotate" : "translate";
    modelTransformControls?.setMode(modelTransformMode);
    if (modelTransformEnabled) {
        modeHud.textContent = modelTransformMode === "rotate" ? "Rotate model" : "Move model";
        setStatus(modelTransformMode === "rotate" ? "模型旋转模式" : "模型平移模式");
    }
    syncModelTransformControls();
    updateToolHud();
}

function resetCurrentModelTransform() {
    if (!currentModel?.object) {
        return;
    }
    applyModelTransformState(currentModelInitialTransform || {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1]
    });
    clearStoredModelTransform();
    commitCurrentModelTransform("reset", {persist: false});
    syncModelTransformControls();
    setStatus("模型变换已重置");
}

async function refreshSnapPreviewAtLastPointer() {
    if (!currentModel || (!snapEnabled && !measureEnabled) || !lastCanvasPointerEvent) {
        return null;
    }
    const result = await measurementEngine.handlePointerMove(
        lastCanvasPointerEvent.clientX,
        lastCanvasPointerEvent.clientY
    );
    if (result?.point) {
        showSnapMarker(result.point, result.snapType, result.snappedEdge);
        return result;
    }
    hideSnapMarker();
    refreshSelectionHighlight();
    return null;
}

function setMeasureEnabled(enabled, mode = measurementEngine.getState().mode || "distance", options = {}) {
    const requestedMode = mode || measurementEngine.getState().mode || "distance";
    const nextEnabled = Boolean(enabled && currentModel);
    requestToolMode(measurementModeToToolMode(requestedMode), nextEnabled, options);
    measureEnabled = nextEnabled;
    if (measureEnabled) {
        measurementEngine.setMode(requestedMode);
    }
    const activeMode = measurementEngine.getState().mode;
    measureBtn?.classList.toggle("active", measureEnabled && activeMode === "distance");
    angleMeasureBtn?.classList.toggle("active", measureEnabled && activeMode === "angle");
    areaMeasureBtn?.classList.toggle("active", measureEnabled && activeMode === "area");
    if (!measureEnabled) {
        measurementEngine.setEnabled(false);
    }
    measurementEngine.setEnabled(snapEnabled || measureEnabled);
    if (!snapEnabled && !measureEnabled) {
        hideSnapMarker();
        refreshSelectionHighlight();
    }
    updateToolHud();
    syncMeasurementControls();
    if (options.silent) {
        // Conflict-driven mode changes should not overwrite the initiating status.
    } else if (measureEnabled && activeMode === "angle") {
        setStatus("角度测量已开启，请依次选择第一点、顶点、第三点");
    } else if (measureEnabled && activeMode === "area") {
        setStatus("面积测量已开启，请按顺时针或逆时针沿边界选择面积点，不能交叉选点；至少 3 个点后双击完成面积");
    } else {
        setStatus(measureEnabled ? "测量已开启，请选择起点" : "测量已关闭");
    }
    log("Measure mode", {enabled: measureEnabled, mode: activeMode});
}

function setSectionEnabled(enabled, options = {}) {
    const nextEnabled = Boolean(enabled && currentModel);
    requestToolMode(TOOL_MODES.SECTION, nextEnabled, options);
    sectionEnabled = nextEnabled;
    sectionEngine.setEnabled(sectionEnabled);
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    if (sectionEnabled && !options.silent) {
        const state = sectionEngine.getState();
        const modeText = state.mode === "box"
            ? `剖切盒 ${state.activePlaneIndex + 1}/${state.planes.length}`
            : state.planes.length > 1
                ? `多剖切 ${state.activePlaneIndex + 1}/${state.planes.length}`
                : `${state.axis.toUpperCase()} 轴`;
        setStatus(`剖切已开启：${modeText}，黄色线框为当前剖切面`);
    } else if (!sectionEnabled && !options.silent) {
        setStatus("剖切已关闭");
    }
}

function toggleSnap() {
    setSnapEnabled(!snapEnabled);
}

function toggleMeasure() {
    const state = measurementEngine.getState();
    setMeasureEnabled(!(measureEnabled && state.mode === "distance"), "distance");
}

function toggleAngleMeasure() {
    const state = measurementEngine.getState();
    setMeasureEnabled(!(measureEnabled && state.mode === "angle"), "angle");
}

function toggleAreaMeasure() {
    const state = measurementEngine.getState();
    setMeasureEnabled(!(measureEnabled && state.mode === "area"), "area");
}

function completeAreaMeasurement() {
    const result = measurementEngine.completeAreaMeasurement();
    if (!result) {
        syncMeasurementControls();
        setStatus("至少选择 3 个不共线的点后才能完成面积");
        return;
    }
    if (result.type === "area-invalid") {
        syncMeasurementControls();
        setStatus(result.reason === "non-planar" ? "面积点不在同一平面，请调整点位后再完成" : "面积边界不能交叉，请调整点位后再完成");
        syncAreaMeasureHint(measurementEngine.getState(), result.reason === "non-planar"
            ? "面积点不在同一平面。请调整点位后再完成。"
            : "面积边界不能交叉。请调整点位后再完成。");
        log("Area measure rejected", {
            reason: result.reason,
            pendingCount: result.pendingCount
        });
        return;
    }
    showSnapMarker(result.points?.[result.points.length - 1] || result.third);
    const resultText = getMeasurementText(result);
    scheduleFragmentsUpdate();
    setStatus(`面积测量完成：${resultText}`);
    showMeasureResult(result);
    syncMeasurementControls(measurementEngine.getState());
    log("Area measure complete", {
        points: result.points?.length || 0,
        area: result.area,
        text: resultText,
        localIds: result.localIds
    });
}

async function addSelectionLabel() {
    const result = await viewerRuntimeSdk.execute("saveLabelForm", {useInputTitle: false}, {source: "page"});
    return result.label;
}

async function createOrUpdateLabel(options = {}) {
    try {
        if (editingLabelId) {
            const existing = labelStoreEngine.get(editingLabelId);
            if (!existing) {
                cancelLabelEdit();
                return null;
            }
            const title = labelTitleInput.value.trim() || existing.title;
            const updated = labelStoreEngine.update(editingLabelId, {title});
            if (updated) {
                renderLabelBubbles();
                renderLabelList();
                cancelLabelEdit();
                autoSyncBusinessDataItem("labels", updated, "save");
                log("Label updated", {
                    id: updated.id,
                    localId: updated.localId,
                    title: updated.title
                });
            }
            return updated;
        }

        if (!currentModel || !selectedLocalIds.length || typeof selectedPrimaryLocalId !== "number") {
            log("Label skipped: no selection");
            return null;
        }

        const title = options.useInputTitle === true && labelTitleInput
            ? labelTitleInput.value.trim()
            : "";
        const label = await labelEngine.addLabelForSelection({
            primaryLocalId: selectedPrimaryLocalId,
            localIds: selectedLocalIds,
            globalIds: interactionEngine?.getSelection()?.globalIds || []
        }, {
            title: title || undefined,
            id: `label-${currentModel.modelId}-${selectedPrimaryLocalId}-${Date.now().toString(36)}`
        });
        const stored = labelStoreEngine.save({
            ...label,
            modelId: currentModel.modelId,
            modelName: currentModelName
        });
        renderLabelBubbles();
        renderLabelList();
        autoSyncBusinessDataItem("labels", stored, "save");
        if (labelTitleInput) {
            labelTitleInput.value = "";
        }
        log("Label added", {
            id: stored.id,
            localId: stored.localId,
            title: stored.title
        });
        return stored;
    } catch (error) {
        log("Label failed", {message: errorMessage(error)});
        return null;
    }
}

function toggleSection() {
    if (!currentModel) {
        return;
    }
    if (!sectionEnabled) {
        const axis = getSelectedSectionSingleAxis();
        sectionEngine.setSinglePlane({axis, constant: 0});
        setSectionEnabled(true);
    } else {
        setSectionEnabled(false);
    }
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    log("Section mode", sectionEngine.getState());
}

function getSelectedSectionSingleAxis() {
    const value = sectionModeSelect?.value || "";
    if (value === "single-y") {
        return "y";
    }
    if (value === "single-z") {
        return "z";
    }
    return ["x", "y", "z"][sectionAxisIndex] || "x";
}

function setSectionModeFromSelect(value) {
    if (!currentModel) {
        return;
    }
    const currentState = sectionEngine.getState();
    const currentConstant = currentState.plane?.constant || 0;
    if (value === "box") {
        enableSectionBox();
        return;
    }
    if (value === "multi") {
        const axis = getSectionAxisKey(currentState.axis);
        if (currentState.mode !== "multi" || currentState.planes.length < 2) {
            sectionEngine.setSinglePlane({axis, constant: currentConstant});
            sectionEngine.addPlane({
                axis: axis === "x" ? "y" : "x",
                constant: currentConstant
            });
        }
        if (!sectionEnabled) {
            setSectionEnabled(true);
        }
        scheduleFragmentsUpdate();
        updateToolHud();
        syncSectionControls();
        const state = sectionEngine.getState();
        setStatus(`多剖切已开启：当前切面 ${state.activePlaneIndex + 1}/${state.planes.length}`);
        log("Section mode changed", state);
        return;
    }
    const axis = value === "single-y" ? "y" : value === "single-z" ? "z" : "x";
    sectionAxisIndex = ["x", "y", "z"].indexOf(axis);
    sectionEngine.setSinglePlane({axis, constant: currentConstant});
    if (!sectionEnabled) {
        setSectionEnabled(true);
    }
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    const state = sectionEngine.getState();
    setStatus(`单面剖切已开启：当前切面 ${state.activePlaneIndex + 1}/${state.planes.length}`);
    log("Section mode changed", state);
}

function setSectionPlaneFromSelect(value) {
    if (!currentModel || !sectionEnabled) {
        return;
    }
    if (value === "add") {
        addSectionPlane();
        return;
    }
    const index = Number(value);
    if (!Number.isFinite(index)) {
        return;
    }
    sectionEngine.setActivePlane(index);
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    const state = sectionEngine.getState();
    sectionAxisIndex = ["x", "y", "z"].indexOf(getSectionAxisKey(state.axis));
    setStatus(`当前切面：${state.activePlaneIndex + 1}/${state.planes.length}`);
    log("Section active plane changed", state);
}

function addSectionPlane() {
    if (!currentModel) {
        return;
    }
    const axis = ["x", "y", "z"][sectionAxisIndex] || getSectionAxisKey(sectionEngine.getState().axis);
    sectionEngine.addPlane({axis});
    if (!sectionEnabled) {
        setSectionEnabled(true);
    }
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    const state = sectionEngine.getState();
    setStatus(`已新增剖切面：${state.activePlaneIndex + 1}/${state.planes.length}，可用滑条调整当前面`);
    log("Section plane added", state);
}

function enableSectionBox() {
    if (!currentModel) {
        return;
    }
    sectionEngine.setBox({bounds: getCurrentModelBox()});
    if (!sectionEnabled) {
        setSectionEnabled(true);
    }
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    setStatus("剖切盒已开启：可点击“切面”选择盒面，再用滑条调整位置");
    log("Section box enabled", sectionEngine.getState());
}

function syncSectionOffsetInput(state = sectionEngine.getState()) {
    if (!sectionOffsetInput || !sectionOffsetValue) {
        return;
    }
    if (!state.enabled) {
        sectionOffsetInput.value = "0";
        sectionOffsetValue.textContent = "0";
        return;
    }
    const range = getSectionOffsetRange();
    const normalized = range > 0
        ? Math.max(-100, Math.min(100, Math.round((state.plane.constant / range) * 100)))
        : 0;
    if (document.activeElement !== sectionOffsetInput) {
        sectionOffsetInput.value = String(normalized);
    }
    sectionOffsetValue.textContent = `${normalized > 0 ? "+" : ""}${normalized}`;
}

function setSectionOffsetFromInput(value) {
    if (!currentModel) {
        return;
    }
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
        return;
    }
    if (!sectionEnabled) {
        setSectionEnabled(true);
    }
    const range = getSectionOffsetRange();
    const constant = (Math.max(-100, Math.min(100, normalized)) / 100) * range;
    sectionEngine.setPlane({constant});
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    const state = sectionEngine.getState();
    setStatus(`剖切面拖动：${state.activePlaneIndex + 1}/${state.planes.length} ${state.axis.toUpperCase()} ${Number(constant.toFixed(3))}`);
}

function clearSection() {
    sectionAxisIndex = 0;
    sectionEngine.clear();
    setSectionEnabled(false);
    scheduleFragmentsUpdate();
    updateToolHud();
    syncSectionControls();
    setStatus("剖切已清除");
    log("Section cleared");
}

function undoMeasurement() {
    const state = measurementEngine.undo();
    hideSnapMarker();
    scheduleFragmentsUpdate();
    updateToolHud();
    syncMeasurementControls(state);
    setStatus(state.pendingStart ? "已撤销测量终点" : `测量剩余 ${state.count} 条`);
    log("Measurement undo", {
        count: state.count,
        pending: Boolean(state.pendingStart)
    });
}

function clearMeasurements() {
    const state = measurementEngine.clear();
    hideSnapMarker();
    scheduleFragmentsUpdate();
    updateToolHud();
    syncMeasurementControls(state);
    setStatus("测量已清空");
    log("Measurements cleared");
}

function clearLabels() {
    labelEngine.clear();
    const removed = labelStoreEngine.clear();
    renderLabelList();
    cancelLabelEdit();
    log("Labels cleared", {removed});
}

function getSnapPointTexture() {
    if (snapPointTexture) {
        return snapPointTexture;
    }
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = 64;
    textureCanvas.height = 64;
    const context = textureCanvas.getContext("2d");
    context.clearRect(0, 0, 64, 64);
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.moveTo(32, 4);
    context.lineTo(60, 32);
    context.lineTo(32, 60);
    context.lineTo(4, 32);
    context.closePath();
    context.fill();
    snapPointTexture = new THREE.CanvasTexture(textureCanvas);
    snapPointTexture.minFilter = THREE.LinearFilter;
    snapPointTexture.magFilter = THREE.LinearFilter;
    snapPointTexture.needsUpdate = true;
    return snapPointTexture;
}

function showSnapEdgeMarker(snappedEdge) {
    if (!Array.isArray(snappedEdge) || snappedEdge.length < 2) {
        hideSnapEdgeMarker();
        return;
    }
    const start = snappedEdge[0];
    const end = snappedEdge[1];
    if (!Array.isArray(start) || !Array.isArray(end) || start.length < 3 || end.length < 3) {
        hideSnapEdgeMarker();
        return;
    }
    if (!snapEdgeMarker) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        const material = new THREE.LineBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.96,
            depthTest: false,
            depthWrite: false
        });
        snapEdgeMarker = new THREE.Line(geometry, material);
        snapEdgeMarker.name = "snap-edge-marker";
        snapEdgeMarker.renderOrder = 999;
        snapEdgeMarker.frustumCulled = false;
        snapEdgeMarker.visible = false;
        scene.add(snapEdgeMarker);
    }
    const edgeKey = [...start, ...end].map((value) => Number(value).toFixed(6)).join("|");
    if (snapEdgeMarker.userData.edgeKey === edgeKey) {
        snapEdgeMarker.visible = true;
        return;
    }
    const positions = snapEdgeMarker.geometry.getAttribute("position");
    positions.setXYZ(0, Number(start[0]), Number(start[1]), Number(start[2]));
    positions.setXYZ(1, Number(end[0]), Number(end[1]), Number(end[2]));
    positions.needsUpdate = true;
    snapEdgeMarker.geometry.computeBoundingSphere();
    snapEdgeMarker.userData.edgeKey = edgeKey;
    snapEdgeMarker.visible = true;
}

function hideSnapEdgeMarker() {
    if (snapEdgeMarker) {
        snapEdgeMarker.visible = false;
    }
}

function updateSnapTypeHint(point, snapType) {
    if (!snapTypeHint || !point || !camera?.isCamera) {
        return;
    }
    const projected = point.clone().project(camera);
    if (![projected.x, projected.y, projected.z].every(Number.isFinite) || projected.z < -1 || projected.z > 1) {
        snapTypeHint.hidden = true;
        return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const overlayRect = viewerOverlay.getBoundingClientRect();
    const label = {
        point: "端点",
        midpoint: "中点",
        edge: "边",
        face: "面"
    }[snapType] || "捕捉";
    if (snapTypeHint.dataset.snapType !== snapType) {
        snapTypeHint.textContent = label;
        snapTypeHint.dataset.snapType = snapType;
    }
    snapTypeHint.style.left = `${canvasRect.left - overlayRect.left + (projected.x + 1) * 0.5 * canvasRect.width}px`;
    snapTypeHint.style.top = `${canvasRect.top - overlayRect.top + (1 - projected.y) * 0.5 * canvasRect.height}px`;
    snapTypeHint.hidden = false;
}

function hideSnapTypeHint() {
    if (snapTypeHint) {
        snapTypeHint.hidden = true;
    }
}

function showSnapMarker(pointArray, snapType = "face", snappedEdge = null) {
    if (!Array.isArray(pointArray) || pointArray.length < 3 || !scene) {
        return;
    }
    if (!snapMarker) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
        const material = new THREE.PointsMaterial({
            color: 0xf59e0b,
            size: 7,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false
        });
        snapMarker = new THREE.Points(geometry, material);
        snapMarker.name = "snap-point-marker";
        snapMarker.renderOrder = 1000;
        snapMarker.visible = false;
        scene.add(snapMarker);
    }
    const point = new THREE.Vector3(
        Number(pointArray[0]),
        Number(pointArray[1]),
        Number(pointArray[2])
    );
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        hideSnapMarker();
        return;
    }
    snapMarker.position.copy(point);
    const markerStyle = snapType === "point"
        ? {color: 0x22d3ee, size: 9, opacity: 1}
        : snapType === "midpoint"
            ? {color: 0xa78bfa, size: 9, opacity: 1}
        : snapType === "edge"
            ? {color: 0xfbbf24, size: 8, opacity: 0.95}
            : {color: 0xf59e0b, size: 7, opacity: 0.82};
    snapMarker.material.color.setHex(markerStyle.color);
    snapMarker.material.size = markerStyle.size;
    snapMarker.material.opacity = markerStyle.opacity;
    const markerMap = snapType === "point" ? getSnapPointTexture() : null;
    const markerAlphaTest = snapType === "point" ? 0.12 : 0;
    if (snapMarker.material.map !== markerMap || snapMarker.material.alphaTest !== markerAlphaTest) {
        snapMarker.material.map = markerMap;
        snapMarker.material.alphaTest = markerAlphaTest;
        snapMarker.material.needsUpdate = true;
    }
    snapMarker.userData.snapType = snapType;
    snapMarker.visible = true;
    if (snapType === "edge" || snapType === "midpoint") {
        showSnapEdgeMarker(snappedEdge);
    } else {
        hideSnapEdgeMarker();
    }
    updateSnapTypeHint(point, snapType);
    scheduleFragmentsUpdate();
}

function hideSnapMarker() {
    if (snapMarker) {
        snapMarker.visible = false;
    }
    hideSnapEdgeMarker();
    hideSnapTypeHint();
    scheduleFragmentsUpdate();
}

function normalizeLocalIds(localIds) {
    if (!Array.isArray(localIds)) {
        return [];
    }
    return [...new Set(localIds.filter((id) => typeof id === "number"))];
}

function filterSelectionHighlightLocalIds(localIds) {
    if (!zoneEngine || typeof zoneEngine.filterHighlightLocalIds !== "function") {
        return normalizeLocalIds(localIds);
    }
    return zoneEngine.filterHighlightLocalIds(localIds);
}

function refreshSelectionHighlight() {
    requestHighlightRefresh();
}

function requestHighlightRefresh() {
    highlightRefreshQueued = true;
    if (highlightRefreshRunning || highlightRefreshScheduled) {
        return;
    }
    highlightRefreshScheduled = true;
    queueMicrotask(() => {
        highlightRefreshScheduled = false;
        if (!highlightRefreshRunning && highlightRefreshQueued) {
            runHighlightRefresh().catch((error) => {
                console.warn(error);
            });
        }
    });
}

async function runHighlightRefresh() {
    if (highlightRefreshRunning) {
        return;
    }
    highlightRefreshRunning = true;
    try {
        while (highlightRefreshQueued) {
            highlightRefreshQueued = false;
            await applySelectionHighlight();
        }
    } finally {
        highlightRefreshRunning = false;
        if (highlightRefreshQueued) {
            requestHighlightRefresh();
        }
    }
}

async function applySelectionHighlight(options = {}) {
    const model = currentModel;
    if (!model) {
        return;
    }
    const selectionLocalIds = filterSelectionHighlightLocalIds(selectedLocalIds);
    if (options.reset !== false && typeof model.resetHighlight === "function") {
        await model.resetHighlight();
        await zoneEngine.reapplyMaterialOverrides();
        await reapplyVersionCompareHighlights("base");
    }
    if (model !== currentModel) {
        return;
    }
    if (selectionLocalIds.length && typeof model.highlight === "function") {
        await model.highlight(selectionLocalIds, highlightMaterial);
    }
    if (model === currentModel) {
        scheduleFragmentsUpdate();
    }
}

function syncOverlays() {
    labelEngine.sync();
    measurementEngine.updateLabels();
    syncAnnotationMarkers();
    scheduleBubbleClustering();
    const preview = measurementEngine.getState().preview;
    if ((snapEnabled || measureEnabled) && preview?.point) {
        showSnapMarker(preview.point, preview.snapType, preview.snappedEdge);
    } else {
        hideSnapMarker();
    }
}

async function syncSelectionFromEngine(selection = null) {
    const nextSelection = selection || interactionEngine?.getSelection() || {
        primaryLocalId: null,
        localIds: [],
        count: 0,
        source: "unknown"
    };
    const previousSelectionKey = selectedLocalIds.join(",");
    selectedLocalIds = Array.isArray(nextSelection.localIds) ? [...nextSelection.localIds] : [];
    selectedPrimaryLocalId = nextSelection.primaryLocalId ?? null;
    const nextSelectionKey = selectedLocalIds.join(",");
    if (previousSelectionKey !== nextSelectionKey) {
        activeIsolateMode = null;
    }
    requestHighlightRefresh();
    syncCompareSelectionFromBase(selectedLocalIds, selectedPrimaryLocalId).catch((error) => {
        log("Compare selection sync failed", {message: errorMessage(error)});
    });
    scheduleFragmentsUpdate();
    updateTreeActiveState(selectedPrimaryLocalId);

    if (selectedLocalIds.length && nextSelection.source === "tree-group-action" && activeTreeGroupSummary) {
        renderActiveTreeGroupSummary("已高亮全部");
        setSelectionControlsEnabled(true);
        showAllBtn.disabled = false;
    } else if (selectedLocalIds.length && typeof selectedPrimaryLocalId === "number") {
        await updateSelectionPanel(selectedPrimaryLocalId, selectedLocalIds);
        setSelectionControlsEnabled(true);
        showAllBtn.disabled = false;
    } else {
        setNoSelectionState();
    }
    renderAnnotationList();
    renderLabelList();
    renderLabelBubbles();

    postEmbedEvent("selectionChanged", getSelectionDetail(nextSelection.source || "viewer"));
}

function updateTreeActiveState(localId) {
    if (activeTreeNode) {
        activeTreeNode.classList.remove("active");
        activeTreeNode = null;
    }
    if (typeof localId !== "number") {
        return;
    }
    const node = modelTree.querySelector(`.treeNode[data-local-id="${localId}"]`);
    if (node) {
        node.classList.add("active");
        activeTreeNode = node;
        node.scrollIntoView({
            block: "nearest",
            inline: "nearest"
        });
    }
}

function setActiveTreeNode(node) {
    if (activeTreeNode && activeTreeNode !== node) {
        activeTreeNode.classList.remove("active");
    }
    activeTreeNode = node || null;
    activeTreeNode?.classList.add("active");
}

async function updateSelectionPanel(localId, localIds) {
    selectedHud.textContent = localIds.length > 1 ? `${localIds.length} 个构件` : `#${localId}`;
    selectedId.textContent = localIds.length > 1 ? `${localIds.length} 个 localIds` : `localId ${localId}`;
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    const info = await semanticEngine?.getItemInfo(localId) || await fetchItemInfo(localId);
    selectedCategory.textContent = info.category || "未识别分类";
    setBasicProps({
        localId,
        GUID: info.guid || info.globalId || "-",
        Category: info.category || "-",
        Name: info.name || "-",
        Description: info.description || "-",
        ObjectType: info.objectType || "-",
        PredefinedType: info.predefinedType || "-"
    });
    renderAttributes(info);
}

async function fetchItemInfo(localId) {
    if (semanticEngine) {
        return semanticEngine.getItemInfo(localId);
    }
    const result = {
        localId,
        guid: null,
        category: null,
        name: null,
        description: null,
        objectType: null,
        predefinedType: null,
        attributes: {},
        data: null,
        materials: []
    };
    if (!currentModel || typeof localId !== "number") {
        return result;
    }

    try {
        const [guid] = await currentModel.getGuidsByLocalIds([localId]);
        result.guid = guid;
    } catch (error) {
        log("GUID lookup failed", {localId, message: errorMessage(error)});
    }

    try {
        const item = currentModel.getItem(localId);
        result.category = await item.getCategory();
        const attrs = await item.getAttributes();
        result.attributes = attrs && attrs.object ? attrs.object : mapToObject(attrs);
    } catch (error) {
        log("Item attribute lookup failed", {localId, message: errorMessage(error)});
    }

    try {
        const data = await currentModel.getItemsData([localId], {
            attributesDefault: true,
            relations: {
                IsDefinedBy: {attributes: true, relations: false},
                DefinesOccurrence: {attributes: true, relations: false},
                HasAssociations: {attributes: true, relations: false}
            }
        });
        result.data = Array.isArray(data) ? data[0] : data;
    } catch (error) {
        log("Item data lookup failed", {localId, message: errorMessage(error)});
    }

    try {
        result.materials = await currentModel.getItemsMaterialDefinition([localId]);
    } catch (error) {
        log("Material lookup failed", {localId, message: errorMessage(error)});
    }

    const flat = flattenInfo(result);
    result.name = pickValue(flat, ["Name", "name"]);
    result.description = pickValue(flat, ["Description", "description"]);
    result.objectType = pickValue(flat, ["ObjectType", "Object Type", "objectType"]);
    result.predefinedType = pickValue(flat, ["PredefinedType", "Predefined Type", "predefinedType"]);
    return result;
}

function mapToObject(value) {
    if (!value) {
        return {};
    }
    if (value instanceof Map) {
        return Object.fromEntries(value.entries());
    }
    return value;
}

function flattenInfo(info) {
    const flat = {};
    appendFlat(flat, info.attributes, "");
    appendFlat(flat, info.data, "");
    return flat;
}

function appendFlat(target, value, prefix) {
    if (value === null || value === undefined) {
        return;
    }
    if (value instanceof Map) {
        for (const [key, child] of value.entries()) {
            appendFlat(target, child, joinKey(prefix, key));
        }
        return;
    }
    if (Array.isArray(value)) {
        value.slice(0, 20).forEach((child, index) => appendFlat(target, child, joinKey(prefix, index)));
        return;
    }
    if (typeof value === "object") {
        if ("value" in value && Object.keys(value).length <= 3) {
            target[prefix] = value.value;
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            appendFlat(target, child, joinKey(prefix, key));
        }
        return;
    }
    target[prefix] = value;
}

function joinKey(prefix, key) {
    return prefix ? `${prefix}.${key}` : String(key);
}

function pickValue(flat, keys) {
    for (const key of keys) {
        if (flat[key] !== undefined && flat[key] !== null && flat[key] !== "") {
            return String(flat[key]);
        }
    }
    const lowerKeys = keys.map((key) => key.toLowerCase());
    for (const [key, value] of Object.entries(flat)) {
        const last = key.split(".").pop().toLowerCase();
        if (lowerKeys.includes(last) && value !== undefined && value !== null && value !== "") {
            return String(value);
        }
    }
    return null;
}

function setBasicProps(props) {
    const entries = Object.entries(props);
    if (!entries.length) {
        basicProps.innerHTML = "<div><dt>localId</dt><dd>-</dd></div><div><dt>GUID</dt><dd>-</dd></div><div><dt>Category</dt><dd>-</dd></div>";
        return;
    }
    basicProps.textContent = "";
    for (const [key, value] of entries) {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = key;
        dd.textContent = value === undefined || value === null || value === "" ? "-" : String(value);
        row.append(dt, dd);
        basicProps.appendChild(row);
    }
}

function clearAttributes() {
    attributeTable.textContent = "";
    attributeEmpty.style.display = "block";
}

function appendAttributeRow(key, value) {
    const row = document.createElement("div");
    row.className = "attributeRow";
    const keyEl = document.createElement("div");
    keyEl.className = "attributeKey";
    keyEl.textContent = key;
    const valueEl = document.createElement("div");
    valueEl.className = "attributeValue";
    valueEl.textContent = formatValue(value);
    row.append(keyEl, valueEl);
    attributeTable.appendChild(row);
}

function renderAttributes(info) {
    attributeTable.textContent = "";
    attributeEmpty.style.display = "none";
    const rows = [
        ["Fragments", "localId", info.localId],
        ["Fragments", "guid", info.guid || "-"],
        ["Fragments", "category", info.category || "-"]
    ];

    const flat = flattenInfo(info);
    for (const [key, value] of Object.entries(flat).slice(0, 120)) {
        if (!key || value === undefined || value === null || typeof value === "object") {
            continue;
        }
        rows.push(["Attributes", key, value]);
    }

    if (Array.isArray(info.materials) && info.materials.length) {
        info.materials.forEach((item, index) => {
            const material = item.definition || {};
            rows.push(["Materials", `material.${index}.localIds`, (item.localIds || []).join(", ")]);
            rows.push(["Materials", `material.${index}.opacity`, material.opacity ?? "-"]);
            rows.push(["Materials", `material.${index}.transparent`, material.transparent ?? "-"]);
            if (material.color) {
                rows.push(["Materials", `material.${index}.color`, colorToText(material.color)]);
            }
        });
    }

    if (rows.length === 0) {
        clearAttributes();
        return;
    }

    let activeGroup = "";
    for (const [group, key, value] of rows) {
        if (group !== activeGroup) {
            activeGroup = group;
            const title = document.createElement("div");
            title.className = "attributeGroup";
            title.textContent = group;
            attributeTable.appendChild(title);
        }
        appendAttributeRow(key, value);
    }
}

function renderValidationEmpty(message = "加载模型后可验证属性完整度与 ID 稳定性") {
    validationList.textContent = "";
    const empty = document.createElement("div");
    empty.className = "miniEmpty";
    empty.textContent = message;
    validationList.appendChild(empty);
}

function pickValidationSample(localIds, limit = 120) {
    const ids = Array.isArray(localIds)
        ? localIds.filter((id) => typeof id === "number")
        : [];
    if (ids.length <= limit) {
        return ids;
    }
    const sample = [];
    const step = ids.length / limit;
    for (let index = 0; index < limit; index++) {
        sample.push(ids[Math.floor(index * step)]);
    }
    return [...new Set(sample)];
}

function percentText(value, total) {
    if (!total) {
        return "0%";
    }
    return `${Math.round((value / total) * 100)}%`;
}

function hasReadableName(info) {
    return Boolean(info?.name && !/^Node #?\d+$/i.test(String(info.name)));
}

async function runModelValidation() {
    if (!currentModel || !semanticEngine) {
        renderValidationEmpty("请先加载模型");
        return null;
    }

    runValidationBtn.disabled = true;
    exportValidationBtn.disabled = true;
    lastModelValidationReport = null;
    validationList.textContent = "";
    renderValidationEmpty("正在抽样验证...");
    setStatus("正在验证模型属性与 ID");
    const started = performance.now();
    const previousSelectedHud = selectedHud.textContent;

    const geometryLocalIds = await semanticEngine.getGeometryLocalIds();
    const sampleLocalIds = pickValidationSample(geometryLocalIds, 120);
    const stats = {
        total: geometryLocalIds.length,
        sampled: sampleLocalIds.length,
        hasGlobalId: 0,
        hasCategory: 0,
        hasName: 0,
        hasProperties: 0,
        idRoundTripOk: 0,
        idRoundTripMismatch: 0,
        duplicateGlobalIds: 0,
        readErrors: 0
    };
    const globalIdOwners = new Map();
    const samples = [];

    for (let index = 0; index < sampleLocalIds.length; index++) {
        const localId = sampleLocalIds[index];
        try {
            const info = await semanticEngine.getItemInfo(localId);
            const globalId = info.globalId || info.guid || null;
            const propertyCount = Object.keys(info.properties || {}).length;
            let resolvedLocalId = null;
            let idRoundTrip = "not-applicable";

            if (globalId) {
                stats.hasGlobalId += 1;
                if (globalIdOwners.has(globalId) && globalIdOwners.get(globalId) !== localId) {
                    stats.duplicateGlobalIds += 1;
                } else {
                    globalIdOwners.set(globalId, localId);
                }
                resolvedLocalId = await semanticEngine.getLocalIdByGlobalId(globalId);
                if (resolvedLocalId === localId) {
                    stats.idRoundTripOk += 1;
                    idRoundTrip = "ok";
                } else {
                    stats.idRoundTripMismatch += 1;
                    idRoundTrip = "mismatch";
                }
            }
            if (info.category) {
                stats.hasCategory += 1;
            }
            if (hasReadableName(info)) {
                stats.hasName += 1;
            }
            if (propertyCount > 0) {
                stats.hasProperties += 1;
            }
            if (Array.isArray(info.raw?.errors) && info.raw.errors.length) {
                stats.readErrors += 1;
            }
            samples.push({
                localId,
                globalId,
                resolvedLocalId,
                idRoundTrip,
                category: info.category || null,
                name: info.name || null,
                description: info.description || null,
                objectType: info.objectType || null,
                predefinedType: info.predefinedType || null,
                propertyCount,
                hasReadableName: hasReadableName(info),
                readErrorCount: Array.isArray(info.raw?.errors) ? info.raw.errors.length : 0
            });
        } catch (error) {
            stats.readErrors += 1;
            samples.push({
                localId,
                error: errorMessage(error)
            });
            log("Validation item failed", {
                localId,
                message: errorMessage(error)
            });
        }

        if (index > 0 && index % 20 === 0) {
            selectedHud.textContent = `验证 ${index}/${sampleLocalIds.length}`;
            await nextFrame();
        }
    }

    lastModelValidationReport = createModelValidationReport(stats, samples, seconds(started));
    renderValidationResult(stats, seconds(started));
    setStatus(`验证完成：抽样 ${stats.sampled} / ${stats.total}`);
    log("Model validation complete", {
        ...stats,
        seconds: seconds(started)
    });
    runValidationBtn.disabled = false;
    exportValidationBtn.disabled = false;
    selectedHud.textContent = previousSelectedHud || (selectedLocalIds.length ? `${selectedLocalIds.length} 个构件` : "-");
    return lastModelValidationReport;
}

function createModelValidationReport(stats, samples, elapsedSeconds) {
    return {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        model: {
            modelId: currentModel?.modelId || null,
            name: currentModelName || null,
            localIds: currentAllLocalIds.length || stats.total
        },
        scope: {
            type: "sample",
            totalGeometryLocalIds: stats.total,
            sampledLocalIds: stats.sampled
        },
        t003: {
            globalIdCoverage: percentText(stats.hasGlobalId, stats.sampled),
            categoryCoverage: percentText(stats.hasCategory, stats.sampled),
            nameCoverage: percentText(stats.hasName, stats.sampled),
            propertyCoverage: percentText(stats.hasProperties, stats.sampled),
            readErrors: stats.readErrors
        },
        t004: {
            idRoundTripCoverage: percentText(stats.idRoundTripOk, Math.max(stats.hasGlobalId, 1)),
            duplicateGlobalIds: stats.duplicateGlobalIds,
            idRoundTripMismatch: stats.idRoundTripMismatch
        },
        stats,
        elapsedSeconds,
        samples
    };
}

function renderValidationResult(stats, elapsedSeconds) {
    validationList.textContent = "";
    const rows = [
        ["抽样范围", `${stats.sampled} / ${stats.total}`, "neutral"],
        ["GlobalId 覆盖", percentText(stats.hasGlobalId, stats.sampled), stats.hasGlobalId === stats.sampled ? "ok" : "warn"],
        ["类型覆盖", percentText(stats.hasCategory, stats.sampled), stats.hasCategory === stats.sampled ? "ok" : "warn"],
        ["名称覆盖", percentText(stats.hasName, stats.sampled), stats.hasName === stats.sampled ? "ok" : "warn"],
        ["属性覆盖", percentText(stats.hasProperties, stats.sampled), stats.hasProperties === stats.sampled ? "ok" : "warn"],
        ["ID 回查一致", percentText(stats.idRoundTripOk, Math.max(stats.hasGlobalId, 1)), stats.idRoundTripMismatch === 0 ? "ok" : "bad"],
        ["重复 GlobalId", String(stats.duplicateGlobalIds), stats.duplicateGlobalIds === 0 ? "ok" : "bad"],
        ["读取异常", String(stats.readErrors), stats.readErrors === 0 ? "ok" : "warn"],
        ["耗时", `${elapsedSeconds}s`, "neutral"]
    ];

    for (const [label, value, state] of rows) {
        const item = document.createElement("div");
        item.className = `validationItem ${state}`;

        const labelEl = document.createElement("span");
        labelEl.textContent = label;

        const valueEl = document.createElement("strong");
        valueEl.textContent = value;

        item.append(labelEl, valueEl);
        validationList.appendChild(item);
    }
}

function exportModelValidationReport() {
    if (!lastModelValidationReport) {
        setStatus("请先运行模型验证");
        return;
    }
    const baseName = sanitizeFilename(`${currentModelName || "model"}-t003-t004-${timestampForFilename()}`);
    downloadTextFile(`${baseName}.json`, JSON.stringify(lastModelValidationReport, null, 2), "application/json");
    downloadTextFile(`${baseName}.md`, formatValidationReportMarkdown(lastModelValidationReport), "text/markdown");
    setStatus("模型验证报告已导出");
    log("Model validation report exported", {
        model: lastModelValidationReport.model?.name,
        sampled: lastModelValidationReport.scope?.sampledLocalIds
    });
}

function formatValidationReportMarkdown(report) {
    const lines = [
        "# T003 / T004 模型验证报告",
        "",
        `- 生成时间：${report.generatedAt}`,
        `- 模型：${report.model?.name || "-"}`,
        `- modelId：${report.model?.modelId || "-"}`,
        `- 抽样范围：${report.scope?.sampledLocalIds || 0} / ${report.scope?.totalGeometryLocalIds || 0}`,
        `- 耗时：${report.elapsedSeconds}s`,
        "",
        "## T003 属性完整度",
        "",
        `- GlobalId 覆盖：${report.t003.globalIdCoverage}`,
        `- Category 覆盖：${report.t003.categoryCoverage}`,
        `- Name 覆盖：${report.t003.nameCoverage}`,
        `- 属性覆盖：${report.t003.propertyCoverage}`,
        `- 读取异常：${report.t003.readErrors}`,
        "",
        "## T004 ID 稳定性",
        "",
        `- ID 回查一致：${report.t004.idRoundTripCoverage}`,
        `- 重复 GlobalId：${report.t004.duplicateGlobalIds}`,
        `- 回查不一致：${report.t004.idRoundTripMismatch}`,
        "",
        "## 抽样明细",
        "",
        "| localId | GlobalId | 回查 localId | Category | Name | 属性数 | 状态 |",
        "|---:|---|---:|---|---|---:|---|"
    ];
    for (const sample of report.samples.slice(0, 200)) {
        lines.push([
            sample.localId ?? "-",
            escapeMarkdownTable(sample.globalId || "-"),
            sample.resolvedLocalId ?? "-",
            escapeMarkdownTable(sample.category || "-"),
            escapeMarkdownTable(sample.name || "-"),
            sample.propertyCount ?? "-",
            escapeMarkdownTable(sample.error ? `error: ${sample.error}` : sample.idRoundTrip || "-")
        ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
    if (report.samples.length > 200) {
        lines.push("");
        lines.push(`> 抽样明细仅展示前 200 条，完整数据见 JSON 报告。`);
    }
    return `${lines.join("\n")}\n`;
}

function escapeMarkdownTable(value) {
    return String(value ?? "-").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function timestampForFilename() {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeFilename(value) {
    return String(value || "report").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 160);
}

function downloadTextFile(filename, content, type = "text/plain") {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function colorToText(color) {
    if (typeof color.getHexString === "function") {
        return `#${color.getHexString()}`;
    }
    if (typeof color === "object" && color !== null) {
        const r = Math.round((color.r ?? 0) * 255);
        const g = Math.round((color.g ?? 0) * 255);
        const b = Math.round((color.b ?? 0) * 255);
        return `rgb(${r}, ${g}, ${b})`;
    }
    return String(color);
}

function formatValue(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(Number(value.toFixed(6))) : String(value);
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}

async function handleCanvasClick(event) {
    if (!currentModel || boxSelectEnabled || wasDrag(event)) {
        return;
    }
    if (modelTransformEnabled) {
        return;
    }
    if (relocateTarget) {
        await handleRelocateCanvasClick(event);
        return;
    }
    if (measureEnabled) {
        const state = measurementEngine.getState();
        if (state.mode === "area" && event.detail >= 2) {
            event.preventDefault();
            completeAreaMeasurement();
            return;
        }
        const result = await measurementEngine.handleClick(event.clientX, event.clientY);
        if (result) {
            if (result.type === "area-invalid") {
                hideSnapMarker();
                refreshSelectionHighlight();
                syncMeasurementControls(measurementEngine.getState());
                setStatus(result.reason === "non-planar" ? "面积点不在同一平面，请选择同一平面上的边界点" : "面积边界不能交叉，请重新选择点或撤销上一点");
                syncAreaMeasureHint(measurementEngine.getState(), result.reason === "non-planar"
                    ? "面积点不在同一平面。请选择同一平面上的边界点。"
                    : "面积边界不能交叉。请按顺时针或逆时针沿边界重新选择点，或撤销上一点。");
                log("Area point rejected", {
                    reason: result.reason,
                    point: result.point,
                    localIds: result.localIds
                });
                scheduleFragmentsUpdate();
                return;
            }
            const markerPoint = result.point || result.end || result.third;
            if (markerPoint) {
                showSnapMarker(markerPoint, result.snapType, result.snappedEdge);
            }
            if (result.type === "angle") {
                setStatus(`角度测量完成：${result.text}`);
            } else if (result.type === "area") {
                setStatus(`面积测量完成：${getMeasurementText(result)}`);
            } else if (result.distance !== undefined) {
                setStatus(`测量完成：${result.text || `${result.distance} ${result.unit || ""}`.trim()}`);
            } else if (measurementEngine.getState().mode === "angle") {
                const pendingCount = measurementEngine.getState().pendingCount;
                setStatus(pendingCount === 1 ? "已选择第一点，请选择角度顶点" : "已选择顶点，请选择第三点");
            } else if (measurementEngine.getState().mode === "area") {
                const state = measurementEngine.getState();
                if (state.pendingArea?.text) {
                    setStatus(`面积预览：${state.pendingArea.text}，可继续选点或双击完成面积`);
                    showMeasurePreviewResult("面积预览", state.pendingArea.text);
                } else {
                    const pendingCount = state.pendingCount;
                    setStatus(pendingCount < 3
                        ? `已选择 ${pendingCount} 个点，请按顺时针或逆时针继续选择面积边界点，不能交叉选点`
                        : `已选择 ${pendingCount} 个点，可继续沿同一方向选择或双击完成面积，不能交叉选点`);
                }
            } else {
                setStatus("已选择测量起点，请选择终点");
            }
            const logName = result.type === "angle"
                ? "Angle measure complete"
                : result.type === "area"
                    ? "Area measure complete"
                    : result.distance !== undefined
                    ? "Measure complete"
                    : "Measure start point";
            log(logName, {
                point: markerPoint,
                distance: result.distance,
                angle: result.angle,
                area: result.area,
                text: result.text,
                localIds: result.localIds
            });
        } else {
            hideSnapMarker();
            refreshSelectionHighlight();
            setStatus("测量未命中构件，请重新选择");
            log("Measure miss");
        }
        scheduleFragmentsUpdate();
        return;
    }
    if (snapEnabled) {
        const result = await measurementEngine.handlePointerMove(event.clientX, event.clientY);
        if (result?.point) {
            showSnapMarker(result.point, result.snapType, result.snappedEdge);
            setStatus(`捕捉命中 localIds ${result.localIds.length ? result.localIds.join(",") : "-"}`);
            log("Snap hit", {
                point: result.point,
                localIds: result.localIds
            });
        } else {
            hideSnapMarker();
            refreshSelectionHighlight();
            setStatus("捕捉未命中构件");
            log("Snap miss");
        }
        return;
    }
    const started = performance.now();
    modeHud.textContent = "拾取中";
    try {
        const hit = await pickLocalIdAt(event.clientX, event.clientY, "canvas");
        if (!hit) {
            log("Raycast miss");
            if (selectedLocalIds.length) {
                await clearSelection("canvas-miss");
                setStatus("未命中构件，已清空选择");
            } else {
                setStatus("未命中构件");
            }
            return;
        }
        setStatus(`已选中 localId ${hit.localId}`);
        log("Raycast hit", {
            localId: hit.localId,
            itemId: hit.itemId,
            offset: hit.offset,
            seconds: seconds(started)
        });
    } catch (error) {
        log("Raycast failed", {message: errorMessage(error)});
        console.error(error);
    } finally {
        if (!boxSelectEnabled && !measureEnabled) {
            modeHud.textContent = "Browse";
        }
    }
}

async function pickLocalIdAt(clientX, clientY, source = "canvas") {
    if (!interactionEngine) {
        return null;
    }
    const result = await interactionEngine.pick(clientX, clientY, {
        source,
        tolerancePx: 4
    });
    if (!result || !Array.isArray(result.localIds) || !result.localIds.length) {
        return null;
    }
    return {
        localId: result.localIds[0],
        localIds: result.localIds,
        itemId: result.hit?.itemId ?? null,
        point: result.hit?.point ? vectorToArray(result.hit.point) : null,
        hit: result.hit,
        offset: result.offset || {x: 0, y: 0}
    };
}

function wasDrag(event) {
    if (suppressNextCanvasClick) {
        suppressNextCanvasClick = false;
        return true;
    }
    if (!dragStart) {
        return false;
    }
    return Math.abs(event.clientX - dragStart.x) > 4 || Math.abs(event.clientY - dragStart.y) > 4;
}

function canStartCtrlLook(event) {
    return Boolean(
        currentModel
        && event.button === 0
        && event.ctrlKey
        && !boxSelectStart
        && !relocateTarget
        && toolModeController.getActiveConflicts(TOOL_MODES.CTRL_LOOK).length === 0
    );
}

function startCtrlLook(event) {
    if (!canStartCtrlLook(event)) {
        return false;
    }
    requestToolMode(TOOL_MODES.CTRL_LOOK, true, {source: "ctrl-look"});
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    const targetDistance = Math.max(camera.position.distanceTo(controls.target), getModelScaleStep() * 4, 1);
    ctrlLookState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        yaw: euler.y,
        pitch: euler.x,
        position: camera.position.clone(),
        targetDistance,
        moved: false
    };
    dragStart = {x: event.clientX, y: event.clientY};
    canvas.parentElement.classList.add("ctrlLookMode");
    canvas.setPointerCapture?.(event.pointerId);
    modeHud.textContent = "原地视角";
    updateToolHud();
    setStatus("原地视角：按住 Ctrl 并拖动鼠标，只改变视角不移动相机位置");
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
}

function applyCtrlLookView() {
    if (!ctrlLookState) {
        return;
    }
    const pitchLimit = Math.PI / 2 - 0.02;
    const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, ctrlLookState.pitch));
    const euler = new THREE.Euler(pitch, ctrlLookState.yaw, 0, "YXZ");
    const direction = new THREE.Vector3(0, 0, -1).applyEuler(euler).normalize();
    camera.position.copy(ctrlLookState.position);
    controls.target.copy(ctrlLookState.position.clone().addScaledVector(direction, ctrlLookState.targetDistance));
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
    syncOverlays();
    autoSyncCompareViewIfLinked();
    scheduleFragmentsUpdate();
}

function handleCtrlLookPointerMove(event) {
    if (!ctrlLookState || event.pointerId !== ctrlLookState.pointerId) {
        return;
    }
    const dx = event.clientX - ctrlLookState.lastX;
    const dy = event.clientY - ctrlLookState.lastY;
    ctrlLookState.lastX = event.clientX;
    ctrlLookState.lastY = event.clientY;
    ctrlLookState.moved = ctrlLookState.moved
        || Math.abs(event.clientX - ctrlLookState.startX) > 2
        || Math.abs(event.clientY - ctrlLookState.startY) > 2;
    const sensitivity = 0.004;
    ctrlLookState.yaw -= dx * sensitivity;
    ctrlLookState.pitch -= dy * sensitivity;
    applyCtrlLookView();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

function finishCtrlLook(event) {
    if (!ctrlLookState || event.pointerId !== ctrlLookState.pointerId) {
        return;
    }
    suppressNextCanvasClick = ctrlLookState.moved;
    cancelCtrlLookMode({source: "ctrl-look-finish", pointerId: event.pointerId});
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
}

function cancelCtrlLookMode(options = {}) {
    const pointerId = options.pointerId ?? ctrlLookState?.pointerId;
    ctrlLookState = null;
    requestToolMode(TOOL_MODES.CTRL_LOOK, false, options);
    canvas.parentElement.classList.remove("ctrlLookMode");
    if (pointerId !== undefined) {
        try {
            canvas.releasePointerCapture?.(pointerId);
        } catch {
            // Pointer capture may already be released by the browser.
        }
    }
    modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
    updateToolHud();
    syncOverlays();
    scheduleFragmentsUpdate();
}

function startBoxSelect(event) {
    if (!boxSelectEnabled || !currentModel || event.button !== 0) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    contextMenu.hidden = true;
    boxSelectStart = {x: event.clientX, y: event.clientY};
    lastBoxSelectSummary = null;
    updateToolHud();
    canvas.setPointerCapture?.(event.pointerId);
    updateSelectionRect(event.clientX, event.clientY);
    selectionRect.hidden = false;
    modeHud.textContent = "框选中";
    setStatus("正在框选构件");
    log("Box select start", {x: event.clientX, y: event.clientY});
}

function updateBoxSelect(event) {
    if (!boxSelectStart) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    updateSelectionRect(event.clientX, event.clientY);
}

function scheduleToolPointerMove() {
    if (
        toolPointerMoveScheduled
        || toolPointerMoveInFlight
        || !lastToolPointerEvent
        || toolPointerMoveProcessedSequence >= toolPointerMoveSequence
    ) {
        return;
    }
    toolPointerMoveScheduled = true;
    const elapsed = performance.now() - toolPointerMoveLastStartedAt;
    const delay = Math.max(0, TOOL_POINTER_MOVE_INTERVAL_MS - elapsed);
    toolPointerMoveTimer = window.setTimeout(() => {
        toolPointerMoveTimer = null;
        requestAnimationFrame(async () => {
            toolPointerMoveScheduled = false;
            const pointEvent = lastToolPointerEvent;
            const sequence = toolPointerMoveSequence;
            if (!pointEvent || !currentModel || boxSelectStart || (!snapEnabled && !measureEnabled)) {
                toolPointerMoveProcessedSequence = sequence;
                return;
            }
            toolPointerMoveInFlight = true;
            toolPointerMoveLastStartedAt = performance.now();
            try {
                await measurementEngine.handlePointerMove(pointEvent.clientX, pointEvent.clientY);
            } finally {
                toolPointerMoveInFlight = false;
                toolPointerMoveProcessedSequence = Math.max(toolPointerMoveProcessedSequence, sequence);
                if (toolPointerMoveProcessedSequence < toolPointerMoveSequence) {
                    scheduleToolPointerMove();
                }
            }
        });
    }, delay);
}

function cancelInactiveToolPointerWork(state = toolModeController.getState()) {
    const activeModes = new Set(state.activeModes || []);
    const pointerToolActive = activeModes.has(TOOL_MODES.SNAP)
        || activeModes.has(TOOL_MODES.MEASURE_DISTANCE)
        || activeModes.has(TOOL_MODES.MEASURE_ANGLE)
        || activeModes.has(TOOL_MODES.MEASURE_AREA);
    if (!pointerToolActive) {
        cancelToolPointerWork();
    }
}

function cancelToolPointerWork(options = {}) {
    lastToolPointerEvent = null;
    toolPointerMoveSequence += 1;
    toolPointerMoveProcessedSequence = toolPointerMoveSequence;
    if (toolPointerMoveTimer !== null) {
        clearTimeout(toolPointerMoveTimer);
        toolPointerMoveTimer = null;
    }
    toolPointerMoveScheduled = false;
    measurementEngine.clearPointerPreview({emit: false});
    hideSnapMarker();
    if (options.restoreSelection === true) {
        refreshSelectionHighlight();
    }
}

function handleToolPointerMove(event) {
    lastCanvasPointerEvent = {
        clientX: event.clientX,
        clientY: event.clientY
    };
    if (!currentModel || boxSelectStart || (!snapEnabled && !measureEnabled)) {
        return;
    }
    lastToolPointerEvent = {
        clientX: event.clientX,
        clientY: event.clientY
    };
    toolPointerMoveSequence += 1;
    scheduleToolPointerMove();
}

function handleToolPointerLeave() {
    cancelToolPointerWork({restoreSelection: snapEnabled || measureEnabled});
}

async function finishBoxSelect(event) {
    if (!boxSelectStart) {
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const start = boxSelectStart;
    boxSelectStart = null;
    canvas.releasePointerCapture?.(event.pointerId);
    selectionRect.hidden = true;

    const canvasRect = canvas.parentElement.getBoundingClientRect();
    const topLeft = {
        x: Math.min(start.x, event.clientX),
        y: Math.min(start.y, event.clientY)
    };
    const bottomRight = {
        x: Math.max(start.x, event.clientX),
        y: Math.max(start.y, event.clientY)
    };
    const relativeRect = {
        left: Math.round(topLeft.x - canvasRect.left),
        top: Math.round(topLeft.y - canvasRect.top),
        width: Math.round(bottomRight.x - topLeft.x),
        height: Math.round(bottomRight.y - topLeft.y)
    };
    const width = bottomRight.x - topLeft.x;
    const height = bottomRight.y - topLeft.y;
    log("Box select finish", relativeRect);
    if (width < 6 || height < 6) {
        lastBoxSelectSummary = null;
        updateToolHud();
        modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
        setStatus("框选范围过小");
        return;
    }

    try {
        modeHud.textContent = "框选计算中";
        const started = performance.now();
        const localIds = await interactionEngine.rectanglePick({
            topLeft: new THREE.Vector2(topLeft.x, topLeft.y),
            bottomRight: new THREE.Vector2(bottomRight.x, bottomRight.y),
            fullyIncluded: false
        });
        const elapsedMs = Math.round(performance.now() - started);
        lastBoxSelectSummary = {
            ...relativeRect,
            count: localIds.length,
            elapsedMs
        };
        updateToolHud();
        log("Box select result", {
            ...lastBoxSelectSummary,
            sampleLocalIds: localIds.slice(0, 12)
        });
        if (!localIds.length) {
            log("Box select empty");
            setStatus("框选未命中构件");
            return;
        }
        setStatus(`框选已选中 ${localIds.length} 个构件，用时 ${elapsedMs}ms`);
        log("Box select complete", lastBoxSelectSummary);
    } catch (error) {
        lastBoxSelectSummary = null;
        updateToolHud();
        setStatus(`框选失败：${errorMessage(error)}`);
        log("Box select failed", {message: errorMessage(error)});
    } finally {
        modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
    }
}

function updateSelectionRect(clientX, clientY) {
    const rect = canvas.parentElement.getBoundingClientRect();
    const left = Math.min(boxSelectStart.x, clientX) - rect.left;
    const top = Math.min(boxSelectStart.y, clientY) - rect.top;
    const width = Math.abs(clientX - boxSelectStart.x);
    const height = Math.abs(clientY - boxSelectStart.y);
    selectionRect.style.left = `${left}px`;
    selectionRect.style.top = `${top}px`;
    selectionRect.style.width = `${width}px`;
    selectionRect.style.height = `${height}px`;
}

function setBoxSelectEnabled(enabled, options = {}) {
    const nextEnabled = Boolean(enabled && currentModel);
    requestToolMode(TOOL_MODES.BOX_SELECT, nextEnabled, options);
    boxSelectEnabled = nextEnabled;
    boxSelectBtn.classList.toggle("active", boxSelectEnabled);
    canvas.parentElement.classList.toggle("boxSelectMode", boxSelectEnabled);
    modeHud.textContent = boxSelectEnabled ? "Box" : "Browse";
    updateToolHud();
    log("Box select mode", {enabled: boxSelectEnabled});
    if (!boxSelectEnabled) {
        boxSelectStart = null;
        lastBoxSelectSummary = null;
        selectionRect.hidden = true;
        updateToolHud();
    }
}

function toggleBoxSelect() {
    setBoxSelectEnabled(!boxSelectEnabled, {source: "box-select"});
}

function cancelActiveTool(reason = "keyboard") {
    let changed = false;
    if (relocateTarget) {
        cancelRelocateTarget(reason, {fromController: false, silent: true, source: reason});
        changed = true;
    }
    if (boxSelectEnabled || boxSelectStart) {
        setBoxSelectEnabled(false, {silent: true, source: reason});
        changed = true;
    }
    if (measureEnabled) {
        setMeasureEnabled(false, undefined, {silent: true, source: reason});
        changed = true;
    }
    if (snapEnabled) {
        setSnapEnabled(false, {silent: true, source: reason});
        changed = true;
    }
    if (sectionEnabled) {
        setSectionEnabled(false, {silent: true, source: reason});
        changed = true;
    }
    if (roamEnabled) {
        setRoamEnabled(false, {silent: true});
        changed = true;
    }
    if (ctrlLookState) {
        cancelCtrlLookMode({silent: true, source: reason});
        changed = true;
    }
    if (modelTransformEnabled) {
        setModelTransformEnabled(false, {silent: true});
        changed = true;
    }
    if (pathRoamPanelOpen) {
        setPathRoamPanelOpen(false, {silent: true, source: reason});
        changed = true;
    } else if (pathRoamPlaying || pathRoamPaused) {
        stopPathRoamPlayback({reset: true, silent: true});
        changed = true;
    }
    toolModeController.reset({source: reason});
    if (changed) {
        cameraControlManager.release("model-transform-drag", {source: reason});
        modeHud.textContent = "Browse";
        updateToolHud();
        setStatus("已退出当前工具");
        log("Active tool cancelled", {reason});
    }
}

async function showContextMenu(event) {
    event.preventDefault();
    contextMenu.hidden = true;
    if (!currentModel || boxSelectEnabled || modelTransformEnabled || pathRoamPlaying) {
        return;
    }
    contextMenuLastPoint = null;
    contextMenuHitInfo = null;
    const hit = await pickLocalIdAt(event.clientX, event.clientY, "context");
    if (!hit) {
        setStatus("右键未命中构件");
        renderContextMenuCommands();
        return;
    }
    contextMenuLastPoint = {
        clientX: event.clientX,
        clientY: event.clientY,
        localId: hit.localId,
        localIds: [...hit.localIds]
    };
    contextMenuHitInfo = {
        localId: hit.localId,
        globalId: null,
        category: null,
        name: null,
        loading: true
    };
    setStatus(`右键选中 localId ${hit.localId}`);
    renderContextMenuCommands();
    showContextMenuAt(event.clientX, event.clientY);
    hydrateContextMenuHitInfo(hit.localId, event.clientX, event.clientY);
}

async function hydrateContextMenuHitInfo(localId, clientX, clientY) {
    if (typeof localId !== "number" || !currentModel) {
        return;
    }
    try {
        const info = await fetchBasicTreeInfo(localId);
        if (!contextMenuLastPoint || contextMenuLastPoint.localId !== localId) {
            return;
        }
        const flat = flattenInfo(info);
        contextMenuHitInfo = {
            localId,
            globalId: info.guid || null,
            category: info.category || null,
            name: pickValue(flat, ["entityName", "EntityName", "Name", "name", "LongName"]) || null,
            loading: false
        };
    } catch {
        if (!contextMenuLastPoint || contextMenuLastPoint.localId !== localId) {
            return;
        }
        contextMenuHitInfo = {
            localId,
            globalId: null,
            category: null,
            name: null,
            loading: false
        };
    }
    renderContextMenuCommands();
    if (!contextMenu.hidden) {
        showContextMenuAt(clientX, clientY);
    }
}

function syncContextMenuState() {
    const context = getContextMenuContext();
    for (const button of contextMenu.querySelectorAll("[data-menu-action]")) {
        const command = contextMenuCommands.get(button.dataset.menuAction);
        button.disabled = !command || isContextMenuCommandDisabled(command, context);
    }
}

function getContextMenuContext() {
    return {
        model: currentModel,
        hasModel: Boolean(currentModel),
        selection: getSelectionDetail("context-menu"),
        selectedLocalIds: [...selectedLocalIds],
        selectedPrimaryLocalId,
        hit: contextMenuLastPoint ? {...contextMenuLastPoint} : null,
        view: getViewState()
    };
}

function isContextMenuCommandDisabled(command, context = getContextMenuContext()) {
    if (!context.hasModel) {
        return true;
    }
    if (command.requiresSelection !== false && !context.selectedLocalIds.length) {
        return true;
    }
    if (typeof command.disabled === "function") {
        return Boolean(command.disabled(context));
    }
    return Boolean(command.disabled);
}

function normalizeContextMenuCommand(command) {
    if (!command || typeof command !== "object") {
        throw new Error("Context menu command must be an object");
    }
    const id = String(command.id || "").trim();
    if (!id) {
        throw new Error("Context menu command requires id");
    }
    return {
        id,
        label: String(command.label || id),
        group: String(command.group || "default"),
        order: Number.isFinite(command.order) ? command.order : 100,
        requiresSelection: command.requiresSelection !== false,
        disabled: command.disabled,
        run: typeof command.run === "function" ? command.run : null
    };
}

function registerContextMenuCommand(command) {
    const normalized = normalizeContextMenuCommand(command);
    contextMenuCommands.set(normalized.id, normalized);
    renderContextMenuCommands();
    return () => unregisterContextMenuCommand(normalized.id);
}

function unregisterContextMenuCommand(id) {
    const removed = contextMenuCommands.delete(String(id));
    if (removed) {
        renderContextMenuCommands();
    }
    return removed;
}

function renderContextMenuCommands() {
    if (!contextMenu) {
        return;
    }
    const groupOrder = new Map([
        ["selection", 10],
        ["create", 20],
        ["external", 30],
        ["reset", 90]
    ]);
    const commands = [...contextMenuCommands.values()].sort((a, b) => {
        const groupDiff = (groupOrder.get(a.group) || 50) - (groupOrder.get(b.group) || 50);
        if (groupDiff !== 0) {
            return groupDiff;
        }
        return a.order - b.order;
    });
    contextMenu.textContent = "";
    renderContextMenuHitHeader();
    let lastGroup = null;
    for (const command of commands) {
        if (lastGroup !== null && command.group !== lastGroup) {
            const separator = document.createElement("div");
            separator.className = "contextMenuSeparator";
            separator.setAttribute("role", "separator");
            contextMenu.appendChild(separator);
        }
        lastGroup = command.group;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.menuAction = command.id;
        button.textContent = command.label;
        contextMenu.appendChild(button);
    }
    syncContextMenuState();
}

function renderContextMenuHitHeader() {
    if (!contextMenuHitInfo) {
        return;
    }
    const header = document.createElement("div");
    header.className = "contextMenuHit";
    const title = document.createElement("strong");
    title.textContent = contextMenuHitInfo.name
        ? truncateContextMenuText(contextMenuHitInfo.name, 34)
        : `localId ${contextMenuHitInfo.localId}`;
    header.appendChild(title);

    const localId = document.createElement("span");
    localId.textContent = `localId ${contextMenuHitInfo.localId}`;
    header.appendChild(localId);

    if (contextMenuHitInfo.loading) {
        const loading = document.createElement("span");
        loading.textContent = "读取属性中...";
        header.appendChild(loading);
    } else {
        const category = document.createElement("span");
        category.textContent = `Category ${contextMenuHitInfo.category || "-"}`;
        header.appendChild(category);

        const guid = document.createElement("span");
        guid.textContent = `GlobalId ${contextMenuHitInfo.globalId || "-"}`;
        header.appendChild(guid);
    }

    contextMenu.appendChild(header);
    const separator = document.createElement("div");
    separator.className = "contextMenuSeparator";
    separator.setAttribute("role", "separator");
    contextMenu.appendChild(separator);
}

function truncateContextMenuText(value, maxLength) {
    const text = String(value ?? "").trim();
    if (!text) {
        return "";
    }
    return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}...` : text;
}

async function ensureContextHitSelection(context) {
    const hit = context?.hit;
    if (!hit || typeof hit.localId !== "number") {
        return null;
    }
    if (selectedPrimaryLocalId === hit.localId && selectedLocalIds.includes(hit.localId)) {
        return getSelectionDetail("context-menu");
    }
    const localIds = Array.isArray(hit.localIds) && hit.localIds.length ? hit.localIds : [hit.localId];
    const selection = await selectLocalIds(localIds, {
        primaryLocalId: hit.localId,
        source: "context-menu"
    });
    if (selection) {
        await syncSelectionFromEngine(selection);
    }
    return selection || getSelectionDetail("context-menu");
}

async function getContextHitDisplayInfo(context) {
    const localId = context?.hit?.localId ?? selectedPrimaryLocalId;
    const base = {
        localId: typeof localId === "number" ? localId : null,
        globalId: contextMenuHitInfo?.globalId || null,
        category: contextMenuHitInfo?.category || null,
        name: contextMenuHitInfo?.name || null
    };
    if (typeof localId !== "number") {
        return base;
    }
    try {
        const info = await fetchBasicTreeInfo(localId);
        const flat = flattenInfo(info);
        return {
            localId,
            globalId: info.guid || base.globalId,
            category: info.category || base.category,
            name: pickValue(flat, ["entityName", "EntityName", "Name", "name", "LongName"]) || base.name
        };
    } catch {
        return base;
    }
}

function formatContextHitInfo(info) {
    return [
        `localId: ${info.localId ?? "-"}`,
        `GlobalId: ${info.globalId || "-"}`,
        `Category: ${info.category || "-"}`,
        `Name: ${info.name || "-"}`
    ].join("\n");
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand("copy");
    } finally {
        textarea.remove();
    }
}

async function copyContextComponentInfo(context) {
    const info = await getContextHitDisplayInfo(context);
    if (typeof info.localId !== "number") {
        setStatus("没有可复制的构件信息");
        return;
    }
    await copyTextToClipboard(formatContextHitInfo(info));
    setStatus(`已复制构件信息：localId ${info.localId}`);
    log("Component info copied", info);
}

async function showContextComponentProperties(context) {
    const selection = await ensureContextHitSelection(context);
    const localId = selection?.primaryLocalId ?? context?.hit?.localId ?? selectedPrimaryLocalId;
    if (typeof localId !== "number") {
        setStatus("请先选择构件");
        return;
    }
    await updateSelectionPanel(localId, selection?.localIds?.length ? selection.localIds : [localId]);
    selectedCategory?.scrollIntoView({
        block: "nearest",
        inline: "nearest"
    });
    setStatus(`已显示构件属性：localId ${localId}`);
}

async function createLabelFromContext(context) {
    await ensureContextHitSelection(context);
    const info = await getContextHitDisplayInfo(context);
    const previousTitle = labelTitleInput?.value || "";
    if (labelTitleInput && !previousTitle.trim() && info.name) {
        labelTitleInput.value = info.name;
    }
    const result = await viewerRuntimeSdk.execute("saveLabelForm", {useInputTitle: true}, {source: "context-menu"});
    const label = result.label;
    if (label) {
        setStatus(`已创建标签：${label.title || `localId ${label.localId}`}`);
    }
    if (labelTitleInput && previousTitle.trim()) {
        labelTitleInput.value = previousTitle;
    }
}

async function createAnnotationFromContext(context) {
    await ensureContextHitSelection(context);
    const info = await getContextHitDisplayInfo(context);
    const previousContent = annotationInput?.value || "";
    if (annotationInput) {
        annotationInput.value = previousContent.trim() || `模型批注：${info.name || `localId ${info.localId ?? "-"}`}`;
    }
    const result = await viewerRuntimeSdk.execute("saveAnnotationForm", {}, {source: "context-menu"});
    const annotation = result.annotation;
    if (annotation) {
        editAnnotation(annotation.id);
        setStatus("已创建批注，可在右侧编辑内容");
    }
    if (annotationInput && previousContent.trim()) {
        annotationInput.value = previousContent;
    }
}

async function createEmbedLabel(payload = {}) {
    if (!currentModel) {
        throw new Error("Model is not loaded");
    }
    const target = await resolveEmbedTargetLocalId(payload);
    const info = await fetchItemInfo(target.localId);
    const positionVector = toVector3(payload.position) || await getLocalIdsCenter([target.localId]);
    if (!positionVector) {
        throw new Error(`Cannot resolve label position for localId ${target.localId}`);
    }
    const globalId = payload.globalId || target.requestedGlobalId || info.globalId || info.guid || null;
    const label = await labelEngine.addLabelForSelection({
        primaryLocalId: target.localId,
        localIds: [target.localId],
        globalIds: globalId ? [globalId] : []
    }, {
        id: payload.id || `label-${currentModel.modelId}-${target.localId}-${Date.now().toString(36)}`,
        title: payload.title || info.name || `localId ${target.localId}`,
        subtitle: payload.subtitle || globalId || "",
        position: positionVector,
        globalId
    });
    const stored = labelStoreEngine.save({
        ...label,
        modelId: currentModel.modelId,
        modelName: currentModelName
    });
    renderLabelBubbles();
    renderLabelList();
    autoSyncBusinessDataItem("labels", stored, "save");
    setStatus(`已创建标签：${stored.title || `localId ${stored.localId}`}`);
    log("Embed label created", {
        id: stored.id,
        localId: stored.localId,
        globalId: stored.globalId
    });
    return {
        label: stored,
        state: getViewerState("embed-create-label")
    };
}

async function createEmbedAnnotation(payload = {}) {
    if (!currentModel) {
        throw new Error("Model is not loaded");
    }
    const target = await resolveEmbedTargetLocalId(payload);
    const info = await fetchItemInfo(target.localId);
    const positionVector = toVector3(payload.position) || await getLocalIdsCenter([target.localId]);
    const globalId = payload.globalId || target.requestedGlobalId || info.globalId || info.guid || null;
    const title = String(payload.title || info.name || `localId ${target.localId}`).trim();
    const content = String(payload.content || payload.text || `模型批注：${title}`).trim();
    const actor = resolveAnnotationActor(payload, getCurrentAnnotationUser());
    const annotation = annotationEngine.create({
        id: payload.id,
        modelId: currentModel.modelId,
        modelName: currentModelName,
        localId: target.localId,
        globalId,
        title,
        content,
        camera: payload.camera || getViewState(),
        selection: {
            modelId: currentModel.modelId,
            primaryLocalId: target.localId,
            localIds: [target.localId],
            globalIds: globalId ? [globalId] : [],
            count: 1,
            source: "embed-create-annotation"
        },
        position: positionVector ? vectorToArray(positionVector) : null,
        status: payload.status || "open",
        priority: payload.priority || "normal",
        createdBy: actor,
        updatedBy: actor,
        assignee: normalizeContractOptionalText(payload.assignee),
        permission: normalizeAnnotationPermission(payload.permission),
        history: Array.isArray(payload.history) ? payload.history : undefined
    });
    renderAnnotationList();
    autoSyncBusinessDataItem("annotations", annotation, "save");
    setStatus("已创建批注");
    log("Embed annotation created", {
        id: annotation.id,
        localId: annotation.localId,
        globalId: annotation.globalId
    });
    return {
        annotation,
        state: getViewerState("embed-create-annotation")
    };
}

function listEmbedLabels(payload = {}) {
    const filter = normalizeEmbedBusinessFilter(payload);
    const limit = normalizeEmbedListLimit(payload);
    const labels = labelStoreEngine.list(filter).slice(0, limit);
    return {
        labels,
        count: labels.length,
        filter,
        state: getViewerState("embed-list-labels")
    };
}

function listEmbedAnnotations(payload = {}) {
    const filter = normalizeEmbedBusinessFilter(payload);
    const limit = normalizeEmbedListLimit(payload);
    const annotations = annotationEngine.list(filter).slice(0, limit);
    return {
        annotations,
        count: annotations.length,
        filter,
        state: getViewerState("embed-list-annotations")
    };
}

function updateEmbedAnnotation(payload = {}) {
    const id = String(payload.id || payload.annotationId || "").trim();
    if (!id) {
        throw new Error("updateAnnotation requires id");
    }
    const actor = resolveAnnotationActor(payload, getCurrentAnnotationUser());
    const patch = createAnnotationPatch(payload, actor);
    const annotation = annotationEngine.update(id, patch, {actor});
    if (!annotation) {
        throw new Error("Annotation not found");
    }
    renderAnnotationList();
    scheduleAnnotationMarkerUpdate();
    autoSyncBusinessDataItem("annotations", annotation, "save");
    log("Embed annotation updated", {
        id: annotation.id,
        actor,
        status: annotation.status
    });
    return {
        annotation,
        state: getViewerState("embed-update-annotation")
    };
}

function getEmbedAnnotationHistory(payload = {}) {
    const id = String(payload.id || payload.annotationId || "").trim();
    if (!id) {
        throw new Error("getAnnotationHistory requires id");
    }
    const annotation = annotationEngine.get(id);
    if (!annotation) {
        throw new Error("Annotation not found");
    }
    return {
        annotation,
        history: Array.isArray(annotation.history) ? annotation.history : [],
        state: getViewerState("embed-annotation-history")
    };
}

function removeEmbedLabel(payload = {}) {
    const id = String(payload.id || payload.labelId || "").trim();
    if (!id) {
        throw new Error("removeLabel requires id");
    }
    const label = labelStoreEngine.get(id) || {id};
    const removed = labelStoreEngine.remove(id);
    labelEngine.removeLabel(id);
    if (removed) {
        autoSyncBusinessDataItem("labels", label, "remove");
    }
    if (editingLabelId === id) {
        cancelLabelEdit();
    }
    renderLabelBubbles();
    renderLabelList();
    setStatus(removed ? "已删除标签" : "未找到标签");
    log("Embed label removed", {id, removed});
    return {
        id,
        removed,
        state: getViewerState("embed-remove-label")
    };
}

function removeEmbedAnnotation(payload = {}) {
    const id = String(payload.id || payload.annotationId || "").trim();
    if (!id) {
        throw new Error("removeAnnotation requires id");
    }
    const annotation = annotationEngine.get(id) || {id};
    const removed = annotationEngine.remove(id);
    if (removed) {
        autoSyncBusinessDataItem("annotations", annotation, "remove");
    }
    if (editingAnnotationId === id) {
        cancelAnnotationEdit();
    }
    renderAnnotationList();
    scheduleAnnotationMarkerUpdate();
    setStatus(removed ? "已删除批注" : "未找到批注");
    log("Embed annotation removed", {id, removed});
    return {
        id,
        removed,
        state: getViewerState("embed-remove-annotation")
    };
}

function registerDefaultContextMenuCommands() {
    [
        {
            id: "showProperties",
            label: "查看属性",
            group: "selection",
            order: 5,
            run: async (context) => showContextComponentProperties(context)
        },
        {
            id: "locate",
            label: "定位",
            group: "selection",
            order: 10,
            run: async () => {
                await fitSelected();
                setStatus("已定位选中构件");
            }
        },
        {
            id: "isolate",
            label: "隔离",
            group: "selection",
            order: 20,
            run: async () => isolateSelected()
        },
        {
            id: "hide",
            label: "隐藏",
            group: "selection",
            order: 30,
            run: async () => {
                await hideSelected();
                setStatus("已隐藏选中构件");
            }
        },
        {
            id: "color",
            label: "着色",
            group: "selection",
            order: 40,
            run: async () => {
                await colorSelected();
                setStatus("已着色选中构件");
            }
        },
        {
            id: "copyInfo",
            label: "复制构件信息",
            group: "selection",
            order: 50,
            run: async (context) => copyContextComponentInfo(context)
        },
        {
            id: "createLabel",
            label: "创建标签",
            group: "create",
            order: 10,
            run: async (context) => createLabelFromContext(context)
        },
        {
            id: "createAnnotation",
            label: "创建批注",
            group: "create",
            order: 20,
            run: async (context) => createAnnotationFromContext(context)
        },
        {
            id: "showAll",
            label: "显示全部",
            group: "reset",
            order: 10,
            requiresSelection: false,
            run: async () => {
                await showAll();
                setStatus("已显示全部构件");
            }
        }
    ].forEach(registerContextMenuCommand);
}

function exposeContextMenuApi() {
    window.BimViewerContextMenu = {
        register: registerContextMenuCommand,
        unregister: unregisterContextMenuCommand,
        list: () => [...contextMenuCommands.values()].map((command) => ({
            id: command.id,
            label: command.label,
            group: command.group,
            order: command.order,
            requiresSelection: command.requiresSelection
        }))
    };
}

function showContextMenuAt(clientX, clientY) {
    const rect = canvas.parentElement.getBoundingClientRect();
    contextMenu.style.left = "0px";
    contextMenu.style.top = "0px";
    contextMenu.style.visibility = "hidden";
    contextMenu.hidden = false;
    const menuWidth = contextMenu.offsetWidth || 128;
    const menuHeight = contextMenu.offsetHeight || 170;
    const left = Math.min(
        Math.max(8, clientX - rect.left),
        Math.max(8, rect.width - menuWidth - 8)
    );
    const top = Math.min(
        Math.max(8, clientY - rect.top),
        Math.max(8, rect.height - menuHeight - 8)
    );
    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
    contextMenu.style.visibility = "";
}

async function handleContextAction(action) {
    contextMenu.hidden = true;
    const command = contextMenuCommands.get(action);
    if (!command) {
        log("Context menu command missing", {action});
        return;
    }
    const context = getContextMenuContext();
    if (isContextMenuCommandDisabled(command, context)) {
        setStatus("请先选择构件");
        return;
    }
    try {
        await command.run?.(context);
        log("Context menu command executed", {action});
    } catch (error) {
        setStatus(`右键菜单执行失败：${errorMessage(error)}`);
        log("Context menu command failed", {action, message: errorMessage(error)});
    }
}

async function hideSelected() {
    if (!interactionEngine || selectedLocalIds.length === 0) {
        return;
    }
    const hidden = await interactionEngine.hideSelected();
    if (!hidden) {
        return;
    }
    scheduleFragmentsUpdate();
    log("Selected hidden", {count: selectedLocalIds.length});
}

async function isolateSelected() {
    if (!interactionEngine || selectedLocalIds.length === 0) {
        return false;
    }
    zoneEngine.clearIsolationState();
    const mode = getIsolateMode();
    const restoreVisibility = shouldRestoreVisibilityForIsolate(mode);
    const isolated = await interactionEngine.isolateSelected({
        ...mode,
        restoreVisibility
    });
    if (!isolated) {
        return false;
    }
    activeIsolateMode = mode;
    syncIsolateOpacityControls();
    await applySelectionHighlight({reset: false});
    scheduleFragmentsUpdate();
    setStatus(`已隔离选中构件：${getIsolateModeText(mode)}`);
    log("Selected isolated", {
        selected: selectedLocalIds.length,
        mode,
        affected: Math.max(0, currentAllLocalIds.length - selectedLocalIds.length)
    });
    return true;
}

function getIsolateMode() {
    const value = isolateModeSelect?.value || "hide";
    if (value === "dim") {
        const opacityPercent = Number(isolateOpacityInput?.value);
        const opacity = Number.isFinite(opacityPercent) ? Math.min(0.95, Math.max(0.05, opacityPercent / 100)) : 0.35;
        return {
            mode: "dim",
            opacity
        };
    }
    return {
        mode: "hide",
        opacity: 0
    };
}

function syncIsolateOpacityControls() {
    const hasActiveIsolation = Boolean(activeIsolateMode && currentModel && selectedLocalIds.length);
    const isDimMode = isolateModeSelect?.value === "dim";
    if (isolateModeRow) {
        isolateModeRow.hidden = !hasActiveIsolation;
    }
    if (isolateModeSelect) {
        isolateModeSelect.disabled = !hasActiveIsolation;
    }
    if (isolateOpacityRow) {
        isolateOpacityRow.hidden = !hasActiveIsolation || !isDimMode;
    }
    if (isolateOpacityInput) {
        isolateOpacityInput.disabled = !hasActiveIsolation || !isDimMode;
    }
    if (isolateOpacityValue) {
        const value = Number(isolateOpacityInput?.value);
        isolateOpacityValue.textContent = `${Number.isFinite(value) ? value : 35}%`;
    }
}

function getIsolateModeText(mode) {
    if (mode?.mode === "dim") {
        return `其他构件透明 ${Math.round((mode.opacity || 0) * 100)}%`;
    }
    return "完全隐藏其他构件";
}

function shouldRestoreVisibilityForIsolate(nextMode) {
    if (!activeIsolateMode) {
        return true;
    }
    if (activeIsolateMode.mode === "hide" && nextMode.mode === "dim") {
        return true;
    }
    return false;
}

async function handleIsolateModeChange() {
    if (!currentModel || !selectedLocalIds.length) {
        syncIsolateOpacityControls();
        return;
    }
    syncIsolateOpacityControls();
    await isolateSelected();
    log("Isolate mode reapplied", {
        mode: getIsolateMode(),
        selected: selectedLocalIds.length
    });
}

async function handleIsolateOpacityCommit() {
    syncIsolateOpacityControls();
    if (isolateModeSelect?.value !== "dim" || !currentModel || !selectedLocalIds.length) {
        return;
    }
    await isolateSelected();
    log("Isolate opacity reapplied", {
        mode: getIsolateMode(),
        selected: selectedLocalIds.length
    });
}

async function showAll() {
    if (!interactionEngine) {
        return;
    }
    const shown = await interactionEngine.showAll();
    if (!shown) {
        return;
    }
    zoneEngine.clearIsolationState();
    activeIsolateMode = null;
    syncIsolateOpacityControls();
    await applySelectionHighlight({reset: false});
    scheduleFragmentsUpdate();
    log("All items visible");
}

async function colorSelected(colorOverride = null) {
    if (!interactionEngine || selectedLocalIds.length === 0) {
        return false;
    }
    const color = colorOverride != null
        ? new THREE.Color(colorOverride)
        : colorCycle[colorIndex % colorCycle.length];
    if (colorOverride == null) {
        colorIndex++;
    }
    const colored = await interactionEngine.colorSelected(color);
    if (!colored) {
        return false;
    }
    scheduleFragmentsUpdate();
    log("Selected colored", {count: selectedLocalIds.length, color: `#${color.getHexString()}`});
    return true;
}

async function resetSelectedColor() {
    if (!interactionEngine || selectedLocalIds.length === 0) {
        return false;
    }
    const reset = await interactionEngine.resetSelectedColor();
    if (!reset) {
        return false;
    }
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    scheduleFragmentsUpdate();
    log("Selected material reset", {count: selectedLocalIds.length});
    return true;
}

async function updateSelectedOpacity() {
    if (!interactionEngine || selectedLocalIds.length === 0) {
        return false;
    }
    const opacity = Number(opacityInput.value);
    opacityValue.textContent = `${Math.round(opacity * 100)}%`;
    const changed = await interactionEngine.setSelectedOpacity(opacity);
    scheduleFragmentsUpdate();
    return Boolean(changed);
}

function syncViewControls(busy = false) {
    const hasModel = Boolean(currentModel);
    const hasStoredViews = hasModel && viewStoreEngine.list().length > 0;
    saveViewStoreBtn.disabled = busy || !hasModel;
    viewNameInput.disabled = busy || !hasModel;
    viewCategoryInput.disabled = busy || !hasModel;
    viewCategoryFilter.disabled = busy || !hasModel;
    restoreViewBtn.disabled = busy || (!hasStoredViews && !viewpointEngine.hasCurrent());
    syncDualViewControls();
}

function renderViewList() {
    if (!viewList) {
        return;
    }
    const allViews = viewStoreEngine.list();
    renderViewCategoryFilter(allViews);
    const categoryFilter = viewCategoryFilter?.value || "";
    const views = categoryFilter
        ? allViews.filter((view) => getViewCategory(view) === categoryFilter)
        : allViews;
    viewList.textContent = "";
    if (!allViews.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = currentModel ? "暂无保存视图" : "加载模型后显示视图";
        viewList.appendChild(empty);
        syncViewControls();
        return;
    }
    if (!views.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "当前分类暂无视图";
        viewList.appendChild(empty);
        syncViewControls();
        return;
    }

    for (const view of views.slice(0, 20)) {
        const item = document.createElement("div");
        item.className = "miniItem";

        if (editingViewId === view.id) {
            item.appendChild(createViewEditForm(view));
            viewList.appendChild(item);
            continue;
        }

        const thumbnail = document.createElement("div");
        thumbnail.className = "viewThumbnail";
        const thumbnailUrl = view.snapshot?.thumbnail || view.snapshot?.dataUrl || "";
        if (thumbnailUrl) {
            const image = document.createElement("img");
            image.alt = "";
            image.src = thumbnailUrl;
            thumbnail.appendChild(image);
        } else {
            thumbnail.textContent = "No preview";
        }

        const body = document.createElement("div");
        body.className = "viewItemBody";

        const title = document.createElement("div");
        title.className = "miniItemTitle";
        title.textContent = view.name || "未命名视图";

        const meta = document.createElement("div");
        meta.className = "miniItemMeta";
        const selectionCount = view.selection?.count || view.selection?.localIds?.length || 0;
        const category = getViewCategory(view);
        meta.textContent = `${category ? `${category} · ` : ""}${formatShortDate(view.updatedAt)} · ${selectionCount ? `${selectionCount} 个构件` : "无选择"}`;

        const actions = document.createElement("div");
        actions.className = "miniItemActions";

        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = "恢复";
        restore.addEventListener("click", () => runPageRuntimeCommand("restoreStoredView", {id: view.id}));

        const rename = document.createElement("button");
        rename.type = "button";
        rename.textContent = "编辑";
        rename.addEventListener("click", () => editStoredView(view.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", () => runPageRuntimeCommand("removeStoredView", {id: view.id}));

        actions.append(restore, rename, remove);
        body.append(title, meta, actions);
        item.classList.add("viewItem");
        item.append(thumbnail, body);
        viewList.appendChild(item);
    }
    syncViewControls();
}

function renderViewCategoryFilter(views = viewStoreEngine.list()) {
    if (!viewCategoryFilter) {
        return;
    }
    const previousValue = viewCategoryFilter.value;
    const categories = [...new Set(views.map(getViewCategory).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    viewCategoryFilter.textContent = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "全部分类";
    viewCategoryFilter.appendChild(all);
    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        viewCategoryFilter.appendChild(option);
    }
    viewCategoryFilter.value = categories.includes(previousValue) ? previousValue : "";
}

function getViewCategory(view) {
    return Array.isArray(view?.tags) && view.tags.length ? String(view.tags[0] || "").trim() : "";
}

function createViewEditForm(view) {
    const form = document.createElement("div");
    form.className = "miniEditForm";

    const nameInput = document.createElement("input");
    nameInput.className = "miniInput";
    nameInput.type = "text";
    nameInput.value = view.name || "";
    nameInput.placeholder = "视图名称";

    const categoryInput = document.createElement("input");
    categoryInput.className = "miniInput";
    categoryInput.type = "text";
    categoryInput.value = getViewCategory(view);
    categoryInput.placeholder = "分类";

    const actions = document.createElement("div");
    actions.className = "miniItemActions";

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "保存";
    save.addEventListener("click", () => runPageRuntimeCommand("updateStoredView", {
        id: view.id,
        name: nameInput.value,
        category: categoryInput.value
    }));

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消";
    cancel.addEventListener("click", cancelStoredViewEdit);

    actions.append(save, cancel);
    form.append(nameInput, categoryInput, actions);
    setTimeout(() => nameInput.focus(), 0);
    return form;
}

function getCurrentAnnotationUser() {
    return normalizeOptionalText(businessCreatedByInput?.value)
        || normalizeOptionalText(embedParams.get("userId") || embedParams.get("createdBy"))
        || "local-user";
}

function isAnnotationAdmin() {
    const user = getCurrentAnnotationUser().toLowerCase();
    return user === "admin" || user === "administrator" || user === "owner";
}

function canEditAnnotation(annotation) {
    if (!annotation) {
        return false;
    }
    if (isAnnotationAdmin()) {
        return true;
    }
    const user = getCurrentAnnotationUser();
    const createdBy = normalizeOptionalText(annotation.createdBy);
    const assignee = normalizeOptionalText(annotation.assignee);
    if (!createdBy) {
        return true;
    }
    const permission = annotation.permission || "team";
    if (permission === "owner") {
        return createdBy === user;
    }
    if (permission === "assignee") {
        return createdBy === user || assignee === user;
    }
    return true;
}

function canDeleteAnnotation(annotation) {
    if (!annotation) {
        return false;
    }
    return isAnnotationAdmin() || !annotation.createdBy || annotation.createdBy === getCurrentAnnotationUser();
}

function getAnnotationPermissionText(permission) {
    return {
        owner: "仅创建人",
        assignee: "创建人/负责人",
        team: "团队可编辑"
    }[permission] || "团队可编辑";
}

function getAnnotationHistoryActionText(action) {
    return {
        created: "创建",
        updated: "更新",
        removed: "删除",
        imported: "导入"
    }[action] || action || "更新";
}

function getAnnotationHistoryText(annotation) {
    const history = Array.isArray(annotation?.history) ? annotation.history : [];
    return history.length ? `${history.length} 条历史` : "无历史";
}

function renderAnnotationHistory(annotation) {
    const history = Array.isArray(annotation.history) ? annotation.history : [];
    const panel = document.createElement("div");
    panel.className = "annotationHistory";
    if (!history.length) {
        panel.textContent = "暂无历史记录";
        return panel;
    }
    for (const entry of history.slice().reverse().slice(0, 8)) {
        const row = document.createElement("div");
        row.className = "annotationHistoryItem";
        const title = document.createElement("strong");
        title.textContent = `${getAnnotationHistoryActionText(entry.action)} · ${entry.actor || "未知用户"}`;
        const meta = document.createElement("span");
        const fields = Array.isArray(entry.detail?.fields) && entry.detail.fields.length
            ? ` · ${entry.detail.fields.join(", ")}`
            : "";
        meta.textContent = `${formatShortDate(entry.createdAt)}${fields}`;
        row.append(title, meta);
        panel.appendChild(row);
    }
    return panel;
}

function renderAnnotationList() {
    if (!annotationList) {
        return;
    }
    if (!currentModel) {
        clearAnnotationMarkers();
        annotationList.textContent = "";
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "加载模型后显示批注";
        annotationList.appendChild(empty);
        return;
    }
    scheduleAnnotationMarkerUpdate();
    const filter = getAnnotationFilter();
    const annotations = annotationEngine.list(filter);
    annotationList.textContent = "";
    if (!annotations.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = getAnnotationEmptyText(filter);
        annotationList.appendChild(empty);
        return;
    }

    for (const annotation of annotations.slice(0, 20)) {
        const item = document.createElement("div");
        item.className = "miniItem";
        item.classList.toggle("locked", !canEditAnnotation(annotation));

        const title = document.createElement("div");
        title.className = "miniItemTitle";
        title.textContent = annotation.title || annotation.content || "未命名批注";

        const meta = document.createElement("div");
        meta.className = "miniItemMeta";
        const target = annotation.globalId || (typeof annotation.localId === "number" ? `localId ${annotation.localId}` : "未绑定构件");
        const owner = annotation.createdBy || "未知创建人";
        const assignee = annotation.assignee ? `负责人 ${annotation.assignee}` : "未分配";
        meta.textContent = `${target} · ${getAnnotationStatusText(annotation.status)} · ${getPriorityText(annotation.priority)} · ${assignee} · ${getAnnotationPermissionText(annotation.permission)} · ${owner} · ${formatShortDate(annotation.updatedAt)}`;

        const content = document.createElement("div");
        content.className = "miniItemMeta";
        content.textContent = annotation.content || "-";

        const actions = document.createElement("div");
        actions.className = "miniItemActions";

        const locate = document.createElement("button");
        locate.type = "button";
        locate.textContent = "定位";
        locate.addEventListener("click", () => runPageRuntimeCommand("locateAnnotation", {id: annotation.id}));

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "编辑";
        edit.disabled = !canEditAnnotation(annotation);
        edit.title = edit.disabled ? "当前用户无编辑权限" : "";
        edit.addEventListener("click", () => editAnnotation(annotation.id));

        const move = document.createElement("button");
        move.type = "button";
        const movingThisAnnotation = relocateTarget?.type === "annotation" && relocateTarget.id === annotation.id;
        move.textContent = movingThisAnnotation ? "关闭调位" : "调位置";
        move.classList.toggle("active", movingThisAnnotation);
        move.disabled = !canEditAnnotation(annotation);
        move.title = move.disabled ? "当前用户无调位权限" : "";
        move.addEventListener("click", () => startRelocateTarget("annotation", annotation.id));

        const status = document.createElement("button");
        status.type = "button";
        status.textContent = annotation.status === "closed" ? "重开" : "关闭";
        status.disabled = !canEditAnnotation(annotation);
        status.title = status.disabled ? "当前用户无状态变更权限" : "";
        status.addEventListener("click", () => {
            runPageRuntimeCommand("updateAnnotation", {
                id: annotation.id,
                status: annotation.status === "closed" ? "open" : "closed",
                userId: getCurrentAnnotationUser()
            });
        });

        const history = document.createElement("button");
        history.type = "button";
        history.textContent = getAnnotationHistoryText(annotation);
        history.classList.toggle("active", expandedAnnotationHistoryIds.has(annotation.id));
        history.addEventListener("click", () => {
            if (expandedAnnotationHistoryIds.has(annotation.id)) {
                expandedAnnotationHistoryIds.delete(annotation.id);
            } else {
                expandedAnnotationHistoryIds.add(annotation.id);
            }
            renderAnnotationList();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.disabled = !canDeleteAnnotation(annotation);
        remove.title = remove.disabled ? "仅创建人或管理员可删除" : "";
        remove.addEventListener("click", () => {
            runPageRuntimeCommand("removeAnnotation", {id: annotation.id});
        });

        actions.append(locate, edit, move, status, history, remove);
        item.append(title, meta, content, actions);
        if (expandedAnnotationHistoryIds.has(annotation.id)) {
            item.appendChild(renderAnnotationHistory(annotation));
        }
        annotationList.appendChild(item);
    }
}

function getAnnotationFilter() {
    const filter = {};
    const scope = annotationScopeFilter?.value || "selected";
    const status = annotationStatusFilter?.value || "all";
    if (scope === "selected" && typeof selectedPrimaryLocalId === "number") {
        filter.localId = selectedPrimaryLocalId;
    }
    if (status !== "all") {
        filter.status = status;
    }
    return filter;
}

function getAnnotationEmptyText(filter) {
    if (!currentModel) {
        return "加载模型后显示批注";
    }
    if (filter.localId !== undefined) {
        return "当前构件暂无匹配批注";
    }
    return "暂无匹配批注";
}

function getAnnotationStatusText(status) {
    return {
        open: "打开",
        processing: "处理中",
        resolved: "已解决",
        closed: "已关闭"
    }[status] || status || "打开";
}

function getPriorityText(priority) {
    return {
        high: "高",
        normal: "普通",
        low: "低"
    }[priority] || String(priority || "普通");
}

function editAnnotation(id) {
    const annotation = annotationEngine.get(id);
    if (!annotation || !annotationInput) {
        return;
    }
    if (!canEditAnnotation(annotation)) {
        setStatus("当前用户无权编辑该批注");
        return;
    }
    editingAnnotationId = annotation.id;
    annotationInput.value = annotation.content || annotation.title || "";
    if (annotationPriorityInput) {
        annotationPriorityInput.value = String(annotation.priority || "normal");
    }
    if (annotationStatusInput) {
        annotationStatusInput.value = String(annotation.status || "open");
    }
    if (annotationAssigneeInput) {
        annotationAssigneeInput.value = annotation.assignee || "";
    }
    if (annotationPermissionInput) {
        annotationPermissionInput.value = annotation.permission || "team";
    }
    createAnnotationBtn.textContent = "保存";
    cancelAnnotationEditBtn.hidden = false;
    annotationInput.focus();
}

function cancelAnnotationEdit() {
    editingAnnotationId = null;
    if (annotationInput) {
        annotationInput.value = "";
    }
    if (annotationPriorityInput) {
        annotationPriorityInput.value = "normal";
    }
    if (annotationStatusInput) {
        annotationStatusInput.value = "open";
    }
    if (annotationAssigneeInput) {
        annotationAssigneeInput.value = "";
    }
    if (annotationPermissionInput) {
        annotationPermissionInput.value = "team";
    }
    if (createAnnotationBtn) {
        createAnnotationBtn.textContent = "新增";
    }
    if (cancelAnnotationEditBtn) {
        cancelAnnotationEditBtn.hidden = true;
    }
}

function scheduleAnnotationMarkerUpdate() {
    const requestId = ++annotationMarkerRequestId;
    queueMicrotask(() => {
        if (requestId !== annotationMarkerRequestId) {
            return;
        }
        renderAnnotationMarkers(requestId).catch((error) => {
            log("Annotation markers failed", {message: errorMessage(error)});
        });
    });
}

async function renderAnnotationMarkers(requestId = annotationMarkerRequestId) {
    if (!currentModel || !viewerOverlay) {
        clearAnnotationMarkers();
        return;
    }

    const markerFilter = getBubbleAnnotationFilter();
    if (!markerFilter) {
        clearAnnotationMarkers();
        return;
    }
    const annotations = annotationEngine.list(markerFilter).slice(0, showAllBubbles ? 80 : 20);
    const visibleIds = new Set();
    const batchSize = 8;
    for (let offset = 0; offset < annotations.length; offset += batchSize) {
        if (requestId !== annotationMarkerRequestId) {
            return;
        }
        const batch = annotations.slice(offset, offset + batchSize);
        const positioned = await Promise.all(batch.map(async (annotation) => {
            const positionKey = getAnnotationPositionKey(annotation);
            const existing = annotationMarkers.get(annotation.id);
            const cachedPosition = existing?.__annotationPositionKey === positionKey
                ? toVector3(existing.__annotationPosition)
                : null;
            return {
                annotation,
                positionKey,
                position: cachedPosition || await resolveAnnotationPosition(annotation)
            };
        }));
        if (requestId !== annotationMarkerRequestId) {
            return;
        }
        for (const item of positioned) {
            if (!item.position) {
                continue;
            }
            visibleIds.add(item.annotation.id);
            const marker = ensureAnnotationMarker(item.annotation);
            marker.__annotationPosition = item.position;
            marker.__annotationPositionKey = item.positionKey;
            updateAnnotationMarkerContent(marker, item.annotation);
        }
        syncAnnotationMarkers();
    }

    for (const [id, marker] of annotationMarkers) {
        if (!visibleIds.has(id)) {
            marker.remove();
            annotationMarkers.delete(id);
        }
    }
    syncAnnotationMarkers();
}

function getAnnotationPositionKey(annotation) {
    const position = Array.isArray(annotation?.position)
        ? annotation.position.join(",")
        : annotation?.position && typeof annotation.position === "object"
            ? `${annotation.position.x},${annotation.position.y},${annotation.position.z}`
            : "";
    const selectionIds = Array.isArray(annotation?.selection?.localIds)
        ? annotation.selection.localIds.join(",")
        : "";
    return `${position}|${annotation?.localId ?? ""}|${selectionIds}`;
}

function ensureAnnotationMarker(annotation) {
    const existing = annotationMarkers.get(annotation.id);
    if (existing) {
        return existing;
    }
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "annotationMarker";
    marker.dataset.annotationId = annotation.id;
    marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        runPageRuntimeCommand("locateAnnotation", {id: annotation.id});
    });
    viewerOverlay.appendChild(marker);
    annotationMarkers.set(annotation.id, marker);
    return marker;
}

function updateAnnotationMarkerContent(marker, annotation) {
    marker.textContent = "";
    marker.classList.toggle("resolved", annotation.status === "resolved" || annotation.status === "closed");
    marker.classList.toggle("bubbleSecondary", isSecondaryBubble(annotation.localId));
    const dot = document.createElement("span");
    dot.className = `annotationMarkerDot status-${annotation.status || "open"}`;
    const body = document.createElement("span");
    body.className = "annotationMarkerBody";
    const title = document.createElement("span");
    title.className = "annotationMarkerTitle";
    title.textContent = annotation.content || annotation.title || "模型批注";
    const meta = document.createElement("span");
    meta.className = "annotationMarkerMeta";
    const target = typeof annotation.localId === "number" ? `localId ${annotation.localId}` : "未绑定构件";
    meta.textContent = `${target} · ${getAnnotationStatusText(annotation.status)} · ${getPriorityText(annotation.priority)}`;
    body.append(title, meta);
    marker.append(dot, body);
    marker.title = `${annotation.title || "模型批注"}\n${annotation.content || ""}`.trim();
}

function getBubbleAnnotationFilter() {
    const filter = {};
    const status = annotationStatusFilter?.value || "all";
    if (status !== "all") {
        filter.status = status;
    }
    if (showAllBubbles) {
        return filter;
    }
    if (typeof selectedPrimaryLocalId !== "number") {
        return null;
    }
    filter.localId = selectedPrimaryLocalId;
    return filter;
}

function clearAnnotationMarkers() {
    annotationMarkerRequestId++;
    for (const marker of annotationMarkers.values()) {
        marker.remove();
    }
    annotationMarkers.clear();
}

function syncAnnotationMarkers() {
    if (!camera || !canvas || !viewerOverlay || !annotationMarkers.size) {
        scheduleBubbleClustering();
        return;
    }
    camera.updateMatrixWorld();
    const canvasRect = canvas.getBoundingClientRect();
    const overlayRect = viewerOverlay.getBoundingClientRect();
    const width = Math.max(canvasRect.width, 1);
    const height = Math.max(canvasRect.height, 1);
    for (const marker of annotationMarkers.values()) {
        const position = toVector3(marker.__annotationPosition);
        if (!position) {
            marker.hidden = true;
            continue;
        }
        const projected = position.clone().project(camera);
        const visible = Number.isFinite(projected.x)
            && Number.isFinite(projected.y)
            && Number.isFinite(projected.z)
            && projected.z >= -1
            && projected.z <= 1;
        marker.hidden = !visible;
        if (!visible) {
            continue;
        }
        const x = canvasRect.left - overlayRect.left + ((projected.x + 1) / 2) * width;
        const y = canvasRect.top - overlayRect.top + ((1 - projected.y) / 2) * height;
        marker.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -110%)`;
    }
    scheduleBubbleClustering();
}

function collectBubbleClusterItems() {
    if (!viewerOverlay) {
        return [];
    }
    const items = [];
    for (const element of viewerOverlay.querySelectorAll(".modelLabel[data-label-id]")) {
        const id = element.dataset.labelId;
        const label = labelStoreEngine.get(id);
        if (!label) {
            continue;
        }
        items.push({
            id,
            type: "label",
            element,
            localId: label.localId,
            globalId: label.globalId,
            title: label.title || "模型标签",
            subtitle: label.subtitle || label.globalId || (typeof label.localId === "number" ? `localId ${label.localId}` : "")
        });
    }
    for (const element of viewerOverlay.querySelectorAll(".annotationMarker[data-annotation-id]")) {
        const id = element.dataset.annotationId;
        const annotation = annotationEngine.get(id);
        if (!annotation) {
            continue;
        }
        items.push({
            id,
            type: "annotation",
            element,
            localId: annotation.localId,
            globalId: annotation.globalId,
            title: annotation.content || annotation.title || "模型批注",
            subtitle: `${getAnnotationStatusText(annotation.status)} · ${getPriorityText(annotation.priority)}`
        });
    }
    return items;
}

function applyBubbleClustering() {
    const summary = bubbleClusterEngine.update(collectBubbleClusterItems());
    updateBubbleClusterStatus(summary);
}

function scheduleBubbleClustering(options = {}) {
    if (options.force && bubbleClusterFrame !== null) {
        cancelAnimationFrame(bubbleClusterFrame);
        bubbleClusterFrame = null;
    }
    if (bubbleClusterFrame !== null) {
        return;
    }
    bubbleClusterFrame = requestAnimationFrame(() => {
        bubbleClusterFrame = null;
        applyBubbleClustering();
    });
}

function activateBubbleClusterItem(item) {
    if (!item) {
        return;
    }
    const action = viewerRuntimeSdk.execute(
        item.type === "annotation" ? "locateAnnotation" : "locateLabel",
        {id: item.id},
        {source: "bubble-cluster"}
    );
    Promise.resolve(action)
        .then(() => {
            setStatus(item.type === "annotation" ? "已定位聚合批注" : "已定位聚合标签");
            scheduleBubbleClustering({force: true});
        })
        .catch((error) => {
            setStatus(`定位聚合气泡失败：${errorMessage(error)}`);
            log("Bubble cluster locate failed", {
                type: item.type,
                id: item.id,
                message: errorMessage(error)
            });
        });
}

async function resolveAnnotationPosition(annotation) {
    const explicit = toVector3(annotation.position);
    if (explicit) {
        return explicit;
    }
    if (typeof annotation.localId === "number") {
        return getLocalIdsCenter([annotation.localId]);
    }
    const selectionIds = Array.isArray(annotation.selection?.localIds)
        ? annotation.selection.localIds.filter((id) => typeof id === "number")
        : [];
    if (selectionIds.length) {
        return getLocalIdsCenter(selectionIds);
    }
    return null;
}

async function getLocalIdsCenter(localIds) {
    const ids = Array.isArray(localIds) ? localIds.filter((id) => typeof id === "number") : [];
    if (!ids.length || typeof currentModel?.getMergedBox !== "function") {
        return null;
    }
    try {
        const box = await currentModel.getMergedBox(ids);
        if (box && typeof box.isEmpty === "function" && !box.isEmpty()) {
            return box.getCenter(new THREE.Vector3());
        }
    } catch (error) {
        log("Annotation position lookup failed", {message: errorMessage(error)});
    }
    return null;
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
    if (typeof value === "object") {
        const vector = new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z));
        return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z) ? vector : null;
    }
    return null;
}

function renderLabelList() {
    if (!labelList) {
        return;
    }
    if (!currentModel) {
        labelList.textContent = "";
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "加载模型后显示标签";
        labelList.appendChild(empty);
        return;
    }
    const labels = labelStoreEngine.list();
    labelList.textContent = "";
    if (!labels.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = currentModel ? "暂无标签" : "加载模型后显示标签";
        labelList.appendChild(empty);
        return;
    }

    for (const label of labels.slice(0, 20)) {
        const item = document.createElement("div");
        item.className = "miniItem";

        const title = document.createElement("div");
        title.className = "miniItemTitle";
        title.textContent = label.title || "未命名标签";

        const meta = document.createElement("div");
        meta.className = "miniItemMeta";
        const target = label.globalId || (typeof label.localId === "number" ? `localId ${label.localId}` : "未绑定构件");
        meta.textContent = `${target} · ${formatShortDate(label.updatedAt)}`;

        const actions = document.createElement("div");
        actions.className = "miniItemActions";

        const locate = document.createElement("button");
        locate.type = "button";
        locate.textContent = "定位";
        locate.addEventListener("click", () => runPageRuntimeCommand("locateLabel", {id: label.id}));

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "编辑";
        edit.addEventListener("click", () => editLabel(label.id));

        const move = document.createElement("button");
        move.type = "button";
        const movingThisLabel = relocateTarget?.type === "label" && relocateTarget.id === label.id;
        move.textContent = movingThisLabel ? "关闭调位" : "调位置";
        move.classList.toggle("active", movingThisLabel);
        move.addEventListener("click", () => startRelocateTarget("label", label.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", () => runPageRuntimeCommand("removeLabel", {id: label.id}));

        actions.append(locate, edit, move, remove);
        item.append(title, meta, actions);
        labelList.appendChild(item);
    }
}

function syncZoneControls(busy = false) {
    const disabled = busy || !currentModel;
    if (zoneModeSelect) {
        zoneModeSelect.disabled = disabled;
    }
    if (refreshZonesBtn) {
        refreshZonesBtn.disabled = disabled;
    }
    if (resetZonesBtn) {
        resetZonesBtn.disabled = disabled;
    }
}

async function renderZoneList() {
    if (!zoneList) {
        return;
    }
    const requestId = ++zoneRenderRequestId;
    zoneList.textContent = "";
    syncZoneControls();
    if (!currentModel) {
        appendZoneEmpty("加载模型后显示分区");
        return;
    }

    const loading = document.createElement("div");
    loading.className = "miniEmpty";
    loading.textContent = "正在读取分区...";
    zoneList.appendChild(loading);

    try {
        const mode = zoneModeSelect?.value || "storeys";
        let zones = await zoneEngine.getZones(mode);
        if (requestId !== zoneRenderRequestId) {
            return;
        }
        if (!zones.length && mode === "storeys") {
            zones = await zoneEngine.getZones("classes");
            if (zoneModeSelect) {
                zoneModeSelect.value = "classes";
            }
        }

        zoneList.textContent = "";
        if (!zones.length) {
            appendZoneEmpty("未读取到可视化分区");
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const zone of zones.slice(0, 24)) {
            fragment.appendChild(createZoneItem(zone));
        }
        if (zones.length > 24) {
            const more = document.createElement("div");
            more.className = "miniEmpty";
            more.textContent = `仅显示前 24 个分区，共 ${zones.length} 个`;
            fragment.appendChild(more);
        }
        zoneList.appendChild(fragment);
    } catch (error) {
        zoneList.textContent = "";
        appendZoneEmpty(`分区读取失败：${errorMessage(error)}`);
        log("Zone list failed", {message: errorMessage(error)});
    }
}

function appendZoneEmpty(text) {
    const empty = document.createElement("div");
    empty.className = "miniEmpty";
    empty.textContent = text;
    zoneList.appendChild(empty);
}

function createZoneItem(zone) {
    const item = document.createElement("div");
    item.className = "miniItem zoneItem";

    const titleRow = document.createElement("div");
    titleRow.className = "zoneTitleRow";

    const swatch = document.createElement("span");
    swatch.className = "zoneSwatch";
    swatch.style.backgroundColor = `#${zone.color.getHexString()}`;

    const title = document.createElement("div");
    title.className = "miniItemTitle";
    title.textContent = zone.label;

    titleRow.append(swatch, title);

    const meta = document.createElement("div");
    meta.className = "miniItemMeta";
    meta.textContent = `${zone.count} 个构件 · ${zone.category || zone.mode}`;

    const actions = document.createElement("div");
    actions.className = "miniItemActions zoneActions";
    const actionDefs = [
        ["select", "定位"],
        ["color", "着色"],
        ["isolate", "隔离"],
        ["hide", "隐藏"],
        ["show", "显示"],
        ["reset", "复原"]
    ];
    for (const [action, label] of actionDefs) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.zoneAction = action;
        button.dataset.zoneId = zone.id;
        actions.appendChild(button);
    }

    item.append(titleRow, meta, actions);
    return item;
}

async function handleZoneAction(action, zoneId) {
    const zone = zoneEngine.getZone(zoneId);
    if (!zone) {
        return;
    }
    let changed = false;
    if (action === "select") {
        await selectLocalIds(zone.localIds, {
            primaryLocalId: zone.localIds[0],
            source: "zone"
        });
        await fitSelected();
        setStatus(`已定位分区：${zone.label}`);
        log("Zone selected", {label: zone.label, count: zone.count});
        return;
    }
    if (action === "color") {
        changed = await zoneEngine.colorZone(zoneId);
    } else if (action === "isolate") {
        await interactionEngine?.showAll();
        activeIsolateMode = null;
        syncIsolateOpacityControls();
        changed = await zoneEngine.isolateZone(zoneId);
    } else if (action === "hide") {
        changed = await zoneEngine.setZoneVisible(zoneId, false);
    } else if (action === "show") {
        changed = await zoneEngine.setZoneVisible(zoneId, true);
    } else if (action === "reset") {
        changed = await zoneEngine.resetZone(zoneId);
    }
    if (!changed) {
        return;
    }
    if (action !== "color") {
        refreshSelectionHighlight();
    }
    scheduleFragmentsUpdate();
    setStatus(`分区已${zoneActionText(action)}：${zone.label}`);
    log("Zone action", {action, label: zone.label, count: zone.count});
}

function zoneActionText(action) {
    return {
        color: "着色",
        isolate: "隔离",
        hide: "隐藏",
        show: "显示",
        reset: "复原"
    }[action] || "更新";
}

async function resetAllZones() {
    const reset = await zoneEngine.resetAll();
    if (!reset) {
        return;
    }
    refreshSelectionHighlight();
    scheduleFragmentsUpdate();
    setStatus("分区可视化已恢复");
    log("Zones reset");
}

function renderLabelBubbles() {
    labelEngine.clear();
    if (!currentModel) {
        return;
    }
    const labels = getVisibleBubbleLabels();
    let rendered = 0;
    for (const label of labels) {
        try {
            labelEngine.addLabel({
                ...label,
                muted: isSecondaryBubble(label.localId)
            });
            rendered += 1;
        } catch (error) {
            log("Label restore skipped", {
                id: label.id,
                message: errorMessage(error)
            });
        }
    }
    labelEngine.sync();
    scheduleBubbleClustering();
    if (rendered) {
        log("Label bubbles rendered", {
            count: rendered,
            showAll: showAllBubbles
        });
    }
}

function refreshBubbles() {
    renderLabelBubbles();
    scheduleAnnotationMarkerUpdate();
}

function getVisibleBubbleLabels() {
    const labels = labelStoreEngine.list();
    if (showAllBubbles) {
        return labels.slice(0, 80);
    }
    if (typeof selectedPrimaryLocalId !== "number") {
        return [];
    }
    return labels.filter((label) => label.localId === selectedPrimaryLocalId).slice(0, 20);
}

function isSecondaryBubble(localId) {
    return showAllBubbles && typeof selectedPrimaryLocalId === "number" && localId !== selectedPrimaryLocalId;
}

async function locateLabel(id) {
    const label = labelStoreEngine.get(id);
    if (!label) {
        return false;
    }
    if (typeof label.localId === "number") {
        await selectLocalIds([label.localId], {
            primaryLocalId: label.localId,
            source: "label-store"
        });
        await fitSelected();
    }
    scheduleFragmentsUpdate();
    log("Label located", {
        id: label.id,
        localId: label.localId
    });
    return true;
}

function editLabel(id) {
    const label = labelStoreEngine.get(id);
    if (!label || !labelTitleInput) {
        return;
    }
    editingLabelId = label.id;
    labelTitleInput.value = label.title || "";
    createPersistentLabelBtn.textContent = "保存";
    cancelLabelEditBtn.hidden = false;
    labelTitleInput.focus();
}

function cancelLabelEdit() {
    editingLabelId = null;
    if (labelTitleInput) {
        labelTitleInput.value = "";
    }
    if (createPersistentLabelBtn) {
        createPersistentLabelBtn.textContent = "新增";
    }
    if (cancelLabelEditBtn) {
        cancelLabelEditBtn.hidden = true;
    }
}

function formatShortDate(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }
    return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getNextViewName() {
    const inputName = viewNameInput?.value?.trim();
    if (inputName) {
        return inputName;
    }
    const count = viewStoreEngine.list().length + 1;
    return `${currentModelName || "模型"} 视图 ${count}`;
}

function getNextViewCategory() {
    return viewCategoryInput?.value?.trim() || "";
}

async function createViewThumbnail() {
    try {
        const result = await snapshotEngine.create({
            download: false,
            returnBlob: false,
            returnDataUrl: false,
            returnThumbnail: true,
            thumbnail: {
                maxWidth: 220,
                maxHeight: 124,
                quality: 0.7
            },
            modelName: currentModelName || currentModel?.modelId || "bim-view"
        });
        return result.thumbnail
            ? {
                thumbnail: result.thumbnail,
                mimeType: "image/jpeg",
                createdAt: new Date().toISOString()
            }
            : null;
    } catch (error) {
        log("View thumbnail failed", {message: errorMessage(error)});
        return null;
    }
}

async function saveStoredView() {
    if (!currentModel) {
        return null;
    }
    saveViewStoreBtn.disabled = true;
    setStatus("正在保存视图");
    const viewpoint = viewpointEngine.capture({
        includeSelection: true
    });
    viewpoint.selection = getSelectionDetail("view-store");
    const snapshot = await createViewThumbnail();
    const stored = viewStoreEngine.save({
        name: getNextViewName(),
        modelId: currentModel.modelId,
        modelName: currentModelName,
        camera: viewpoint.camera,
        selection: viewpoint.selection,
        snapshot,
        tags: getNextViewCategory() ? [getNextViewCategory()] : [],
        note: ""
    });
    restoreViewBtn.disabled = false;
    if (viewNameInput) {
        viewNameInput.value = "";
    }
    if (viewCategoryInput) {
        viewCategoryInput.value = "";
    }
    renderViewList();
    syncViewControls();
    setStatus(`视图已保存：${stored.name}`);
    log("Stored view saved", {
        id: stored.id,
        name: stored.name,
        selection: stored.selection?.count || 0
    });
    autoSyncBusinessDataItem("viewpoints", stored, "save");
    return stored;
}

function editStoredView(id) {
    const view = viewStoreEngine.get(id);
    if (!view) {
        return null;
    }
    editingViewId = id;
    renderViewList();
    return view;
}

function saveStoredViewEdit(id, nameValue, categoryValue) {
    const name = String(nameValue || "").trim();
    if (!name) {
        setStatus("视图名称不能为空");
        return null;
    }
    const category = String(categoryValue || "").trim();
    const updated = viewStoreEngine.update(id, {
        name,
        tags: category ? [category] : []
    });
    editingViewId = null;
    renderViewList();
    setStatus(`视图已更新：${name}`);
    log("Stored view updated", {
        id,
        name: updated?.name || name,
        category
    });
    autoSyncBusinessDataItem("viewpoints", updated, "save");
    return updated;
}

function removeStoredView(id) {
    const view = viewStoreEngine.get(id);
    if (!view) {
        return false;
    }
    const removed = viewStoreEngine.remove(id);
    if (!removed) {
        return false;
    }
    autoSyncBusinessDataItem("viewpoints", view, "remove");
    if (editingViewId === id) {
        editingViewId = null;
    }
    renderViewList();
    syncViewControls();
    setStatus("视图已删除");
    log("Stored view removed", {id});
    return true;
}

function cancelStoredViewEdit() {
    editingViewId = null;
    renderViewList();
}

async function restoreStoredView(id) {
    const view = viewStoreEngine.get(id);
    if (!view) {
        return false;
    }
    viewpointEngine.restore({
        camera: view.camera,
        selection: view.selection
    });
    if (view.selection?.localIds?.length) {
        await selectLocalIds(view.selection.localIds, {
            primaryLocalId: view.selection.primaryLocalId ?? view.selection.localIds[0],
            source: "view-store"
        });
    }
    scheduleFragmentsUpdate();
    log("Stored view restored", {
        id: view.id,
        name: view.name
    });
    setStatus(`视图已恢复：${view.name || "未命名视图"}`);
    return true;
}

async function createAnnotation() {
    if (!currentModel) {
        return null;
    }
    const content = annotationInput.value.trim();
    if (!content) {
        log("Annotation skipped: empty content");
        return null;
    }
    const actor = getCurrentAnnotationUser();
    const assignee = normalizeOptionalText(annotationAssigneeInput?.value);
    const permission = annotationPermissionInput?.value || "team";
    if (editingAnnotationId) {
        const current = annotationEngine.get(editingAnnotationId);
        if (!canEditAnnotation(current)) {
            setStatus("当前用户无权编辑该批注");
            return null;
        }
        const annotation = annotationEngine.update(editingAnnotationId, {
            content,
            status: annotationStatusInput?.value || current?.status || "open",
            priority: annotationPriorityInput?.value || "normal",
            assignee,
            permission,
            updatedBy: actor
        }, {actor});
        cancelAnnotationEdit();
        renderAnnotationList();
        if (annotation) {
            autoSyncBusinessDataItem("annotations", annotation, "save");
            log("Annotation updated", {
                id: annotation.id,
                status: annotation.status,
                priority: annotation.priority
            });
        }
        return annotation;
    }
    const selection = getSelectionDetail("annotation");
    const info = typeof selectedPrimaryLocalId === "number"
        ? await fetchItemInfo(selectedPrimaryLocalId)
        : null;
    const positionVector = typeof selectedPrimaryLocalId === "number"
        ? await getLocalIdsCenter([selectedPrimaryLocalId])
        : null;
    const position = positionVector ? vectorToArray(positionVector) : null;
    const annotation = annotationEngine.create({
        modelId: currentModel.modelId,
        modelName: currentModelName,
        localId: selectedPrimaryLocalId,
        globalId: selection.globalIds?.[0] || info?.guid || info?.globalId || null,
        title: info?.name || (typeof selectedPrimaryLocalId === "number" ? `localId ${selectedPrimaryLocalId}` : "模型批注"),
        content,
        camera: getViewState(),
        selection,
        position,
        status: annotationStatusInput?.value || "open",
        priority: annotationPriorityInput?.value || "normal",
        createdBy: actor,
        updatedBy: actor,
        assignee,
        permission
    });
    cancelAnnotationEdit();
    renderAnnotationList();
    log("Annotation created", {
        id: annotation.id,
        localId: annotation.localId,
        globalId: annotation.globalId
    });
    autoSyncBusinessDataItem("annotations", annotation, "save");
    return annotation;
}

async function locateAnnotation(id) {
    const annotation = annotationEngine.get(id);
    if (!annotation) {
        return false;
    }
    if (annotation.camera) {
        viewpointEngine.restore({camera: annotation.camera});
    }
    if (typeof annotation.localId === "number") {
        await selectLocalIds([annotation.localId], {
            primaryLocalId: annotation.localId,
            source: "annotation"
        });
        await fitSelected();
    }
    scheduleFragmentsUpdate();
    log("Annotation located", {
        id: annotation.id,
        localId: annotation.localId
    });
    return true;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

async function takeSnapshot(options = {}) {
    const previousStatus = statusEl.textContent;
    if (snapshotBtn && !options.requestId) {
        snapshotBtn.disabled = true;
    }
    setStatus("正在生成快照");
    try {
        const result = await snapshotEngine.create({
            download: options.download !== false,
            filename: options.filename,
            modelName: currentModelName || currentModel?.modelId || "bim-view",
            returnBlob: false,
            returnDataUrl: options.returnDataUrl === true
        });
        setStatus(`快照已下载：${result.filename}`);
        log("Snapshot saved", {filename: result.filename});
        postEmbedEvent("snapshotCreated", result, options.requestId || null);
        return result;
    } catch (error) {
        setStatus(`快照失败：${errorMessage(error)}`);
        log("Snapshot failed", {message: errorMessage(error)});
        postEmbedEvent("snapshotFailed", {
            message: errorMessage(error)
        }, options.requestId || null);
        return null;
    } finally {
        if (snapshotBtn && !options.requestId) {
            snapshotBtn.disabled = !currentModel;
        }
        if (!currentModel && previousStatus) {
            setStatus(previousStatus);
        }
    }
}

async function saveCurrentView() {
    const stored = await saveStoredView();
    const viewpoint = viewpointEngine.getCurrent();
    restoreViewBtn.disabled = false;
    log("Viewpoint saved", {
        id: stored?.id || null,
        position: viewpoint?.camera?.position,
        target: viewpoint?.camera?.target
    });
}

async function restoreSavedView() {
    const latest = viewStoreEngine.list()[0];
    if (latest) {
        await restoreStoredView(latest.id);
        return;
    }
    if (viewpointEngine.restore()) {
        scheduleFragmentsUpdate();
        setStatus("已恢复当前内存视点");
        log("Viewpoint restored");
        return;
    }
    setStatus("暂无可恢复视点");
}

function vectorToArray(vector) {
    return [
        Number(vector.x.toFixed(3)),
        Number(vector.y.toFixed(3)),
        Number(vector.z.toFixed(3))
    ];
}

function scheduleFragmentsUpdate(options = {}) {
    const force = options === true || options.force === true;
    if (force) {
        updatePendingForce = true;
    }
    if (!fragments || updatePending) {
        return;
    }
    updatePending = true;
    requestAnimationFrame(async () => {
        updatePending = false;
        const shouldForce = updatePendingForce;
        updatePendingForce = false;
        try {
            if (shouldForce && fragments && "_lastUpdate" in fragments) {
                fragments._lastUpdate = 0;
            }
            await fragments.update(shouldForce);
            renderEngine.render();
        } catch (error) {
            console.warn(error);
        }
    });
}

async function flushFragmentsUpdate(options = {}) {
    const force = options === true || options.force === true;
    if (!fragments) {
        return;
    }
    updatePendingForce = updatePendingForce || force;
    if (force && "_lastUpdate" in fragments) {
        fragments._lastUpdate = 0;
    }
    try {
        await fragments.update(force);
        renderEngine.render();
    } catch (error) {
        console.warn(error);
    }
}

function resize() {
    renderEngine.resize();
    syncOverlays();
    scheduleFragmentsUpdate();
}

function animate() {
    renderEngine.start();
}

fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
        return;
    }
    const buffer = await file.arrayBuffer();
    await runPageRuntimeCommand("openModel", {
        buffer,
        name: file.name,
        append: shouldAppendNextModel()
    });
    fileInput.value = "";
});

loadUrlBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
        return;
    }
    setBusy(true);
    setStatus("Fetching");
    try {
        const started = performance.now();
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        log("Fragments fetch complete", {url, seconds: seconds(started), sizeMB: mb(buffer.byteLength)});
        await runPageRuntimeCommand("openModel", {
            buffer,
            name: url.split("/").pop() || "model.frag",
            append: shouldAppendNextModel()
        });
    } catch (error) {
        setStatus(`加载失败：${errorMessage(error)}`);
        log("Fragments fetch failed", {message: errorMessage(error)});
    } finally {
        setBusy(false);
    }
});

loadManifestBtn.addEventListener("click", async () => {
    const manifestUrl = manifestUrlInput.value.trim();
    if (!manifestUrl) {
        return;
    }
    try {
        await runPageRuntimeCommand("openModel", {
            manifestUrl,
            append: shouldAppendNextModel()
        });
    } catch (error) {
        setStatus(`加载失败：${errorMessage(error)}`);
        log("Manifest load failed", {message: errorMessage(error)});
    }
});

appendModelBtn?.addEventListener("click", () => {
    runPageRuntimeCommand("appendModelFromInputs");
});

overlayModelsBtn?.addEventListener("click", () => {
    runPageRuntimeCommand("overlayModels");
});

spreadModelsBtn?.addEventListener("click", () => {
    runPageRuntimeCommand("spreadModels");
});
resetModelsPlacementBtn?.addEventListener("click", () => {
    runPageRuntimeCommand("resetModelsPlacement");
});

modelManagerList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-model-action]");
    const item = event.target.closest("[data-model-id]");
    const modelId = item?.dataset.modelId;
    if (!modelId) {
        return;
    }
    if (!button) {
        runPageRuntimeCommand("activateModel", {
            modelId,
            fit: true,
            clearCompare: true,
            autoPull: true
        });
        return;
    }
    const action = button.dataset.modelAction;
    if (action === "activate") {
        runPageRuntimeCommand("activateModel", {
            modelId,
            fit: true,
            clearCompare: true,
            autoPull: true
        });
    } else if (action === "fit") {
        runPageRuntimeCommand("fitManagedModel", {modelId});
    } else if (action === "visibility") {
        const entry = getManagedModelEntry(modelId);
        runPageRuntimeCommand("setModelVisibility", {modelId, visible: !entry?.visible});
    } else if (action === "unload") {
        runPageRuntimeCommand("unloadModel", {modelId});
    }
});
businessDataBaseUrlInput?.addEventListener("change", () => {
    const baseUrl = getBusinessDataBaseUrl();
    writeStoredText(BUSINESS_DATA_URL_STORAGE_KEY, baseUrl);
    syncBusinessDataControls();
    setBusinessDataStatus(baseUrl ? `业务数据接口：${baseUrl}` : "未配置业务数据接口");
});
businessDataModeSelect?.addEventListener("change", () => {
    const mode = applyBusinessDataMode(businessDataModeSelect.value);
    setBusinessDataStatus(`已切换为${getBusinessDataModeLabel(mode)}`);
    if (mode === "backend" && currentModel) {
        autoPullBusinessDataAfterModelLoad();
    }
});
for (const [input, storageKey, label] of [
    [businessTenantIdInput, BUSINESS_TENANT_ID_STORAGE_KEY, "租户"],
    [businessProjectIdInput, BUSINESS_PROJECT_ID_STORAGE_KEY, "项目"],
    [businessVersionIdInput, BUSINESS_VERSION_ID_STORAGE_KEY, "版本"],
    [businessCreatedByInput, BUSINESS_CREATED_BY_STORAGE_KEY, "用户"]
]) {
    input?.addEventListener("change", () => {
        writeStoredText(storageKey, String(input.value || "").trim());
        setBusinessDataStatus(`${label}上下文已更新`);
    });
}
businessDataAutoSyncInput?.addEventListener("change", () => {
    writeStoredText(BUSINESS_DATA_AUTO_SYNC_STORAGE_KEY, businessDataAutoSyncInput.checked ? "1" : "0");
    syncBusinessDataControls();
    setBusinessDataStatus(businessDataAutoSyncInput.checked ? "已开启本地变更自动同步" : "已关闭本地变更自动同步");
});
businessDataAutoPullInput?.addEventListener("change", () => {
    writeStoredText(BUSINESS_DATA_AUTO_PULL_STORAGE_KEY, businessDataAutoPullInput.checked ? "1" : "0");
    syncBusinessDataControls();
    setBusinessDataStatus(businessDataAutoPullInput.checked ? "已开启加载后自动拉取" : "已关闭加载后自动拉取");
});
pullBusinessDataBtn?.addEventListener("click", () => {
    pullBusinessData().catch((error) => {
        setBusinessDataStatus(`业务数据拉取失败：${errorMessage(error)}`, {error: true});
        log("Business data pull failed", {message: errorMessage(error)});
        syncBusinessDataControls(false);
    });
});
pushBusinessDataBtn?.addEventListener("click", () => {
    pushBusinessData().catch((error) => {
        setBusinessDataStatus(`业务数据推送失败：${errorMessage(error)}`, {error: true});
        log("Business data push failed", {message: errorMessage(error)});
        syncBusinessDataControls(false);
    });
});
pushSnapshotDataBtn?.addEventListener("click", () => {
    pushCurrentSnapshotToBusinessData().catch((error) => {
        setBusinessDataStatus(`快照推送失败：${errorMessage(error)}`, {error: true});
        log("Business snapshot push failed", {message: errorMessage(error)});
        syncBusinessDataControls(false);
    });
});

registerDefaultContextMenuCommands();
exposeContextMenuApi();

openWorkspaceDrawerBtn?.addEventListener("click", () => setWorkspaceDrawerOpen(true));
closeWorkspaceDrawerBtn?.addEventListener("click", () => setWorkspaceDrawerOpen(false));
workspaceDrawer?.addEventListener("click", (event) => event.stopPropagation());
openSettingsDrawerBtn?.addEventListener("click", () => setSettingsDrawerOpen(true));
closeSettingsDrawerBtn?.addEventListener("click", () => setSettingsDrawerOpen(false));
settingsDrawer?.addEventListener("click", (event) => event.stopPropagation());
for (const button of workspaceDrawerTabs) {
    button.addEventListener("click", () => setWorkspaceTab(button.dataset.workspaceTab));
}
for (const button of rightInspectorTabs) {
    button.addEventListener("click", () => setRightInspectorTab(button.dataset.rightInspectorTab));
}
document.querySelector(".rightInspectorTabs")?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        return;
    }
    event.preventDefault();
    setRightInspectorTab(rightInspectorTabController.move(event.key), {focus: true});
});
workspaceDrawer?.querySelector(".workspaceDrawerTabs")?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        return;
    }
    event.preventDefault();
    setWorkspaceTab(workspaceTabController.move(event.key), {focus: true});
});
settingsDrawer?.querySelector(".settingsDrawerTabs")?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
        return;
    }
    event.preventDefault();
    setSettingsTab(settingsTabController.move(event.key), {focus: true});
});
for (const button of settingsDrawerTabs) {
    button.addEventListener("click", () => setSettingsTab(button.dataset.settingsTab));
}

canvas.addEventListener("pointerdown", (event) => {
    lastCanvasPointerEvent = {
        clientX: event.clientX,
        clientY: event.clientY
    };
    if (startCtrlLook(event)) {
        return;
    }
    if (boxSelectEnabled) {
        startBoxSelect(event);
        return;
    }
    dragStart = {x: event.clientX, y: event.clientY};
}, true);
canvas.addEventListener("pointermove", handleCtrlLookPointerMove, true);
canvas.addEventListener("pointermove", updateBoxSelect, true);
canvas.addEventListener("pointermove", handleToolPointerMove, true);
canvas.addEventListener("pointerleave", (event) => {
    finishCtrlLook(event);
    handleToolPointerLeave();
}, true);
canvas.addEventListener("pointerup", finishCtrlLook, true);
canvas.addEventListener("pointerup", finishBoxSelect, true);
canvas.addEventListener("pointercancel", finishCtrlLook, true);
canvas.addEventListener("pointercancel", finishBoxSelect, true);
canvas.addEventListener("pointercancel", handleToolPointerLeave, true);
canvas.addEventListener("contextmenu", showContextMenu);
canvas.addEventListener("click", handleCanvasClick);
canvas.addEventListener("dblclick", (event) => event.preventDefault());
document.addEventListener("click", (event) => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) {
        contextMenu.hidden = true;
    }
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (isSettingsDrawerOpen()) {
            setSettingsDrawerOpen(false);
            event.preventDefault();
            return;
        }
        if (isWorkspaceDrawerOpen()) {
            setWorkspaceDrawerOpen(false);
            event.preventDefault();
            return;
        }
        cancelActiveTool("escape");
    }
});
contextMenu.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-menu-action]");
    if (!button) {
        return;
    }
    await handleContextAction(button.dataset.menuAction);
});
fitBtn.addEventListener("click", () => runPageRuntimeCommand("fitModel"));
fullscreenBtn.addEventListener("click", toggleFullscreen);
viewIsoBtn.addEventListener("click", () => runPageRuntimeCommand("setView", {view: "iso"}));
viewTopBtn.addEventListener("click", () => runPageRuntimeCommand("setView", {view: "top"}));
viewFrontBtn.addEventListener("click", () => runPageRuntimeCommand("setView", {view: "front"}));
viewBackBtn.addEventListener("click", () => runPageRuntimeCommand("setView", {view: "back"}));
viewLeftBtn.addEventListener("click", () => runPageRuntimeCommand("setView", {view: "left"}));
viewRightBtn.addEventListener("click", () => runPageRuntimeCommand("setView", {view: "right"}));
viewBottomBtn.addEventListener("click", () => runPageRuntimeCommand("setView", {view: "bottom"}));
boxSelectBtn.addEventListener("click", toggleBoxSelect);
exitActiveToolBtn?.addEventListener("click", () => cancelActiveTool("quick-exit"));
roamBtn?.addEventListener("click", () => runPageRuntimeCommand("toggleFreeInspectMode"));
roamSpeedInput?.addEventListener("input", () => runPageRuntimeCommand("setFreeInspectSpeed", {
    speedMultiplier: roamSpeedInput.value
}));
pathRoamBtn?.addEventListener("click", () => runPageRuntimeCommand("openPathRoamPanel", {
    open: !pathRoamPanelOpen
}));
closePathRoamPanelBtn?.addEventListener("click", () => runPageRuntimeCommand("openPathRoamPanel", {open: false}));
pathRoamRouteSelect?.addEventListener("change", () => runPageRuntimeCommand("switchPathRoamRoute", {
    routeId: pathRoamRouteSelect.value
}));
newPathRoamRouteBtn?.addEventListener("click", () => runPageRuntimeCommand("createPathRoamRoute"));
savePathRoamRouteBtn?.addEventListener("click", () => runPageRuntimeCommand("savePathRoamRoute"));
deletePathRoamRouteBtn?.addEventListener("click", () => runPageRuntimeCommand("deletePathRoamRoute"));
pathRoamNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        runPageRuntimeCommand("savePathRoamRoute");
        pathRoamNameInput.blur();
    }
});
addPathPointBtn?.addEventListener("click", () => runPageRuntimeCommand("addPathRoamPoint"));
playPathRoamBtn?.addEventListener("click", () => runPageRuntimeCommand("togglePathRoamPlayback"));
stopPathRoamBtn?.addEventListener("click", () => runPageRuntimeCommand("stopPathRoam", {reset: true}));
clearPathRoamBtn?.addEventListener("click", () => runPageRuntimeCommand("clearPathRoam"));
pathRoamSpeedInput?.addEventListener("input", () => runPageRuntimeCommand("setPathRoamSpeed", {
    speedMultiplier: pathRoamSpeedInput.value
}));
pathRoamList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-path-roam-action]");
    if (!button) {
        return;
    }
    const pointId = button.dataset.pathRoamId;
    if (button.dataset.pathRoamAction === "restore") {
        runPageRuntimeCommand("restorePathRoamPoint", {pointId});
    } else if (button.dataset.pathRoamAction === "delete") {
        runPageRuntimeCommand("deletePathRoamPoint", {pointId});
    } else if (button.dataset.pathRoamAction === "recapture") {
        runPageRuntimeCommand("recapturePathRoamPoint", {pointId});
    } else if (button.dataset.pathRoamAction === "move-up") {
        runPageRuntimeCommand("movePathRoamPoint", {pointId, direction: -1});
    } else if (button.dataset.pathRoamAction === "move-down") {
        runPageRuntimeCommand("movePathRoamPoint", {pointId, direction: 1});
    }
});
pathRoamList?.addEventListener("change", (event) => {
    const input = event.target.closest("[data-path-roam-action]");
    if (!input) {
        return;
    }
    const pointId = input.dataset.pathRoamId;
    if (input.dataset.pathRoamAction === "rename") {
        runPageRuntimeCommand("updatePathRoamPoint", {pointId, name: input.value});
    } else if (input.dataset.pathRoamAction === "time") {
        runPageRuntimeCommand("updatePathRoamPoint", {pointId, time: Number(input.value) * 1000});
    }
});
pathRoamList?.addEventListener("keydown", (event) => {
    const input = event.target.closest("[data-path-roam-action='rename'], [data-path-roam-action='time']");
    if (!input || event.key !== "Enter") {
        return;
    }
    input.blur();
});
snapBtn.addEventListener("click", toggleSnap);
measureBtn.addEventListener("click", toggleMeasure);
angleMeasureBtn.addEventListener("click", toggleAngleMeasure);
areaMeasureBtn.addEventListener("click", toggleAreaMeasure);
undoMeasureBtn.addEventListener("click", undoMeasurement);
labelBtn.addEventListener("click", addSelectionLabel);
createPersistentLabelBtn.addEventListener("click", () => runPageRuntimeCommand("saveLabelForm", {useInputTitle: true}));
cancelLabelEditBtn.addEventListener("click", cancelLabelEdit);
sectionBtn.addEventListener("click", toggleSection);
sectionOffsetInput.addEventListener("input", () => setSectionOffsetFromInput(sectionOffsetInput.value));
sectionModeSelect?.addEventListener("change", () => setSectionModeFromSelect(sectionModeSelect.value));
sectionPlaneSelect?.addEventListener("change", () => setSectionPlaneFromSelect(sectionPlaneSelect.value));
clearSectionBtn.addEventListener("click", clearSection);
clearMeasureBtn.addEventListener("click", clearMeasurements);
clearLabelBtn.addEventListener("click", clearLabels);
snapshotBtn.addEventListener("click", () => runPageRuntimeCommand("snapshot"));
saveViewBtn.addEventListener("click", () => runPageRuntimeCommand("saveCurrentView"));
restoreViewBtn.addEventListener("click", () => runPageRuntimeCommand("restoreLatestView"));
modelTransformBtn?.addEventListener("click", toggleModelTransform);
closeModelTransformPanelBtn?.addEventListener("click", () => setModelTransformEnabled(false));
modelTransformModeSelect?.addEventListener("change", () => setModelTransformMode(modelTransformModeSelect.value));
resetModelTransformBtn?.addEventListener("click", resetCurrentModelTransform);
applyModelTransformValuesBtn?.addEventListener("click", applyModelTransformValues);
saveModelTransformBtn?.addEventListener("click", saveModelTransformSnapshot);
restoreModelTransformBtn?.addEventListener("click", restoreModelTransformSnapshot);
for (const input of [...modelTransformPositionInputs, ...modelTransformRotationInputs]) {
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            applyModelTransformValues();
            input.blur();
        }
    });
}
dualViewBtn?.addEventListener("click", toggleDualView);
syncDualViewBtn?.addEventListener("click", syncSecondaryView);
dualViewIsoBtn?.addEventListener("click", () => setSecondaryNamedView("iso"));
dualViewTopBtn?.addEventListener("click", () => setSecondaryNamedView("top"));
viewportToolDockToggle?.addEventListener("click", () => {
    setViewportToolDockCollapsed(!viewportToolDock?.classList.contains("collapsed"));
});
compareFragFileInput?.addEventListener("change", () => {
    const file = compareFragFileInput.files?.[0];
    if (file) {
        setVersionCompareStatus(`已选择右侧版本文件：${file.name}，点击“加载右版本”`);
    }
});
loadCompareModelBtn?.addEventListener("click", () => {
    runPageRuntimeCommand("loadCompareModel");
});
clearCompareModelBtn?.addEventListener("click", () => {
    runPageRuntimeCommand("clearCompareModel");
});
runVersionCompareBtn?.addEventListener("click", () => {
    if (versionCompareRunning) {
        runPageRuntimeCommand("cancelVersionCompare");
        return;
    }
    setRightInspectorTab("compare");
    runPageRuntimeCommand("runVersionCompare");
});
syncCompareViewBtn?.addEventListener("click", () => runPageRuntimeCommand("toggleCompareViewLinked"));
versionCompareFilterTabs.forEach((button) => {
    button.addEventListener("click", () => {
        setVersionCompareFilter(button.dataset.versionCompareFilter || "all");
        renderVersionCompareList().catch((error) => {
            setStatus(`筛选差异列表失败：${errorMessage(error)}`);
            log("Version compare filter failed", {message: errorMessage(error)});
        });
    });
});
versionCompareList?.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-compare-action='toggle-detail']");
    if (detailButton) {
        const row = detailButton.closest(".compareDiffItem");
        const detail = row?.querySelector(".compareDiffDetail");
        if (detail) {
            detail.hidden = !detail.hidden;
            detailButton.classList.toggle("active", !detail.hidden);
            detailButton.textContent = detail.hidden ? "详情" : "收起";
        }
        return;
    }
    const button = event.target.closest("[data-compare-action='locate']");
    if (!button) {
        return;
    }
    const localId = Number(button.dataset.localId);
    const compareLocalId = Number(button.dataset.compareLocalId);
    locateVersionCompareItem(
        button.dataset.compareKind,
        localId,
        button.dataset.globalId || "",
        Number.isFinite(compareLocalId) ? compareLocalId : null
    ).catch((error) => {
        setStatus(`定位差异构件失败：${errorMessage(error)}`);
        log("Version compare locate failed", {
            kind: button.dataset.compareKind,
            localId,
            message: errorMessage(error)
        });
    });
});
saveViewStoreBtn.addEventListener("click", () => runPageRuntimeCommand("saveStoredView"));
viewCategoryFilter.addEventListener("change", renderViewList);
createAnnotationBtn.addEventListener("click", () => runPageRuntimeCommand("saveAnnotationForm"));
cancelAnnotationEditBtn.addEventListener("click", cancelAnnotationEdit);
annotationScopeFilter.addEventListener("change", renderAnnotationList);
annotationStatusFilter.addEventListener("change", renderAnnotationList);
showAllBubblesInput.addEventListener("change", () => {
    showAllBubbles = showAllBubblesInput.checked;
    refreshBubbles();
    setStatus(showAllBubbles ? "已显示全部气泡" : "仅显示当前构件气泡");
    log("Bubble visibility mode changed", {showAll: showAllBubbles});
});
if (bubbleClusterInput) {
    bubbleClusterInput.addEventListener("change", () => setBubbleClusterEnabled(bubbleClusterInput.checked));
}
if (bubbleToolToggleBtn) {
    bubbleToolToggleBtn.addEventListener("click", () => setBubbleToolExpanded(!bubbleToolExpanded));
}
if (bubbleToolCollapseBtn) {
    bubbleToolCollapseBtn.addEventListener("click", () => setBubbleToolExpanded(false));
}
if (bubbleStylePresetSelect) {
    bubbleStylePresetSelect.addEventListener("change", () => updateBubbleStylePreset(bubbleStylePresetSelect.value));
}
for (const input of bubbleCustomInputs) {
    input.addEventListener("input", () => updateBubbleCustomStyle(input.dataset.bubbleCustom, input.value));
}
if (bubbleNudgeStepInput) {
    bubbleNudgeStepInput.addEventListener("input", updateBubbleNudgeStepValue);
}
for (const button of bubbleNudgeButtons) {
    button.addEventListener("click", () => nudgeRelocateTarget(button.dataset.bubbleNudge));
}
clearLogBtn.addEventListener("click", () => {
    logEl.textContent = "";
});
runValidationBtn.addEventListener("click", () => {
    runModelValidation().catch((error) => {
        setStatus(`验证失败：${errorMessage(error)}`);
        renderValidationEmpty(`验证失败：${errorMessage(error)}`);
        runValidationBtn.disabled = !currentModel;
        exportValidationBtn.disabled = !lastModelValidationReport;
        log("Model validation failed", {message: errorMessage(error)});
    });
});
exportValidationBtn.addEventListener("click", exportModelValidationReport);
for (const button of treeTabs) {
    button.addEventListener("click", async () => {
        const tab = button.dataset.treeTab;
        if (!tab || tab === currentTreeTab) {
            return;
        }
        currentTreeTab = tab;
        setTreeTabActive(tab);
        await renderActiveTree();
        if (treeSearchInput.value.trim()) {
            scheduleTreeSearch(true);
        }
    });
}
treeSearchInput.addEventListener("input", () => scheduleTreeSearch(false));
treeSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        scheduleTreeSearch(true);
    }
});
treeSearchClearBtn.addEventListener("click", () => {
    resetTreeSearchState();
    treeSearchInput.focus();
});
expandTreeBtn.addEventListener("click", () => {
    if (treeVirtualMode) {
        let expanded = 0;
        for (const row of treeVirtualRows) {
            if (!row.hasChildren || treeExpandedKeys.has(row.key) || expanded >= 120) {
                continue;
            }
            treeExpandedKeys.add(row.key);
            expanded++;
        }
        refreshVirtualTreeRows();
        log("Tree virtual expand batch", {expanded});
        return;
    }
    let expanded = 0;
    const toggles = [...modelTree.querySelectorAll(".treeToggle")];
    for (const toggle of toggles) {
        if (!toggle.textContent || expanded >= 120) {
            continue;
        }
        const li = toggle.closest("li");
        const list = li?.querySelector(":scope > ul");
        if (!list || !list.classList.contains("collapsed")) {
            continue;
        }
        toggle.click();
        expanded++;
    }
    hydrateVisibleTreeLabels();
    log("Tree lazy expand batch", {expanded});
});
openTreeDialogBtn.addEventListener("click", openDetailedTree);
locateBtn.addEventListener("click", () => runPageRuntimeCommand("fitSelection"));
hideBtn.addEventListener("click", () => runPageRuntimeCommand("hideSelected"));
isolateBtn.addEventListener("click", () => runPageRuntimeCommand("isolateSelected"));
isolateModeSelect.addEventListener("change", () => {
    handleIsolateModeChange().catch((error) => {
        setStatus(`切换隔离方式失败：${errorMessage(error)}`);
        log("Isolate mode change failed", {message: errorMessage(error)});
    });
});
isolateOpacityInput.addEventListener("input", syncIsolateOpacityControls);
isolateOpacityInput.addEventListener("change", () => {
    handleIsolateOpacityCommit().catch((error) => {
        setStatus(`调整隔离透明度失败：${errorMessage(error)}`);
        log("Isolate opacity change failed", {message: errorMessage(error)});
    });
});
showAllBtn.addEventListener("click", () => runPageRuntimeCommand("showAll"));
colorBtn.addEventListener("click", () => runPageRuntimeCommand("colorSelected"));
resetColorBtn.addEventListener("click", () => runPageRuntimeCommand("resetSelectedMaterial"));
refreshPropsBtn.addEventListener("click", async () => {
    if (typeof selectedPrimaryLocalId === "number") {
        await syncSelectionFromEngine();
    }
});
opacityInput.addEventListener("input", () => runPageRuntimeCommand("setSelectedOpacity", {
    opacity: Number(opacityInput.value)
}));
viewStoreEngine.addEventListener("saved", renderViewList);
viewStoreEngine.addEventListener("updated", renderViewList);
viewStoreEngine.addEventListener("removed", renderViewList);
viewStoreEngine.addEventListener("cleared", renderViewList);
viewStoreEngine.addEventListener("imported", renderViewList);
annotationEngine.addEventListener("changed", renderAnnotationList);
labelStoreEngine.addEventListener("changed", () => {
    renderLabelList();
    renderLabelBubbles();
});
zoneModeSelect.addEventListener("change", () => {
    renderZoneList().catch((error) => {
        setStatus(`刷新分区失败：${errorMessage(error)}`);
        log("Zone mode change failed", {message: errorMessage(error)});
    });
});
refreshZonesBtn.addEventListener("click", () => {
    zoneEngine.clearCache();
    renderZoneList().catch((error) => {
        setStatus(`刷新分区失败：${errorMessage(error)}`);
        log("Zone refresh failed", {message: errorMessage(error)});
    });
});
resetZonesBtn.addEventListener("click", () => {
    resetAllZones().catch((error) => {
        setStatus(`恢复分区失败：${errorMessage(error)}`);
        log("Zone reset failed", {message: errorMessage(error)});
    });
});
zoneList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-zone-action]");
    if (!button) {
        return;
    }
    handleZoneAction(button.dataset.zoneAction, button.dataset.zoneId).catch((error) => {
        setStatus(`分区操作失败：${errorMessage(error)}`);
        log("Zone action failed", {message: errorMessage(error)});
    });
});
controls.addEventListener("change", () => {
    syncOverlays();
    autoSyncCompareViewIfLinked();
    scheduleFragmentsUpdate();
});
window.addEventListener("resize", resize);

embedBridge = bindEmbedBridge({
    targetOrigin: embedTargetOrigin,
    allowedOrigin: embedTargetOrigin,
    handlers: createRuntimeEmbedHandlers({runtimeSdk: viewerRuntimeSdk})
});

resize();
animate();
setSelectionControlsEnabled(false);
setBimToolControlsEnabled(false);
updateTreeSearchAvailability();
runValidationBtn.disabled = true;
exportValidationBtn.disabled = true;
saveViewStoreBtn.disabled = true;
createAnnotationBtn.disabled = true;
annotationInput.disabled = true;
renderValidationEmpty();
renderViewList();
renderAnnotationList();
const initialBusinessDataMode = applyBusinessDataMode(getBusinessDataMode(), {persist: false});
const initialBusinessDataBaseUrl = getBusinessDataBaseUrl();
setBusinessDataStatus(initialBusinessDataBaseUrl
    ? `业务数据模式：${getBusinessDataModeLabel(initialBusinessDataMode)}，接口：${initialBusinessDataBaseUrl}`
    : "未配置业务数据接口");
applyBubbleStyleState();
applyBubbleClusterState();
mountWorkspaceDrawerAtDocumentRoot();
restoreViewportToolDockState();
restoreRightInspectorTabState();
showAllBtn.disabled = true;
boxSelectBtn.disabled = true;
if (roamBtn) {
    roamBtn.disabled = true;
}
syncRoamSpeedControls();
syncPathRoamControls();
syncModelTransformControls();
renderModelManagerList();
restoreViewBtn.disabled = true;
syncDualViewControls();
syncCompareControls();
renderVersionCompareList().catch((error) => {
    log("Version compare list init failed", {message: errorMessage(error)});
});
const initialModelSource = getInitialModelSourceFromUrl();
if (initialModelSource) {
    if (initialModelSource.manifestUrl) {
        manifestUrlInput.value = initialModelSource.manifestUrl;
    }
    if (initialModelSource.fragUrl) {
        urlInput.value = initialModelSource.fragUrl;
    }
    loadModelSource(initialModelSource).catch((error) => {
        setStatus("Failed");
        log("Initial model load failed", {message: errorMessage(error)});
    });
}
log("MVP viewer ready");
postEmbedEvent("ready", {
    protocol: EMBED_PROTOCOL,
    href: window.location.href,
    supports: [...SUPPORTED_COMMANDS]
});
