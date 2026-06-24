import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {FragmentsModels, RenderedFaces} from "@thatopen/fragments";

const canvas = document.getElementById("viewerCanvas");
const fileInput = document.getElementById("fragFile");
const urlInput = document.getElementById("fragUrl");
const loadUrlBtn = document.getElementById("loadUrlBtn");
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
const clearLogBtn = document.getElementById("clearLogBtn");
const statusEl = document.getElementById("status");
const fileStat = document.getElementById("fileStat");
const loadStat = document.getElementById("loadStat");
const itemStat = document.getElementById("itemStat");
const selectedHud = document.getElementById("selectedHud");
const modeHud = document.getElementById("modeHud");
const logEl = document.getElementById("log");
const modelTree = document.getElementById("modelTree");
const treeEmpty = document.getElementById("treeEmpty");
const treeTabs = [...document.querySelectorAll("[data-tree-tab]")];
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
const refreshPropsBtn = document.getElementById("refreshPropsBtn");
const boxSelectBtn = document.getElementById("boxSelectBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const saveViewBtn = document.getElementById("saveViewBtn");
const restoreViewBtn = document.getElementById("restoreViewBtn");
const opacityInput = document.getElementById("opacityInput");
const opacityValue = document.getElementById("opacityValue");
const selectionRect = document.getElementById("selectionRect");
const contextMenu = document.getElementById("contextMenu");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0f11);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100000);
camera.position.set(18, 14, 18);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xffffff, 0x2d3438, 2.2));

const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(20, 30, 15);
scene.add(light);

const grid = new THREE.GridHelper(80, 40, 0x3b474f, 0x20272d);
grid.position.y = -0.01;
scene.add(grid);

const highlightMaterial = {
    color: new THREE.Color(0x34c38f),
    opacity: 1,
    transparent: false,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: false,
    customId: "mvp-selection"
};

const colorCycle = [
    new THREE.Color(0xd7b46a),
    new THREE.Color(0x6bbcff),
    new THREE.Color(0xef6f6c),
    new THREE.Color(0x8ad67a)
];

let fragments;
let currentModel = null;
let currentAllLocalIds = [];
let currentTree = null;
let currentTreeTab = "models";
let currentModelName = null;
let treeLabelCache = new Map();
let selectedLocalIds = [];
let selectedPrimaryLocalId = null;
let colorIndex = 0;
let updatePending = false;
let dragStart = null;
let boxSelectEnabled = false;
let boxSelectStart = null;
let savedView = null;

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function seconds(started) {
    return Number(((performance.now() - started) / 1000).toFixed(2));
}

function errorMessage(error) {
    return String(error && error.message ? error.message : error);
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
        refreshPropsBtn,
        opacityInput
    ].forEach((element) => {
        element.disabled = !enabled;
    });
}

function setBusy(busy) {
    fileInput.disabled = busy;
    loadUrlBtn.disabled = busy;
    fitBtn.disabled = busy || !currentModel;
    expandTreeBtn.disabled = busy || !currentTree;
    showAllBtn.disabled = busy || !currentModel;
    boxSelectBtn.disabled = busy || !currentModel;
    restoreViewBtn.disabled = busy || !savedView;
    setSelectionControlsEnabled(!busy && selectedLocalIds.length > 0);
}

async function ensureFragments() {
    if (fragments) {
        return fragments;
    }

    const workerURL = new URL("../node_modules/@thatopen/fragments/dist/Worker/worker.mjs", window.location.href).href;
    fragments = new FragmentsModels(workerURL, {
        maxWorkers: Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4))
    });
    fragments.settings.graphicsQuality = 1;
    fragments.settings.autoCoordinate = true;
    return fragments;
}

async function disposeCurrentModel() {
    if (!currentModel || !fragments) {
        return;
    }

    const modelId = currentModel.modelId;
    scene.remove(currentModel.object);
    await fragments.disposeModel(modelId);
    currentModel = null;
    currentAllLocalIds = [];
    currentTree = null;
    currentModelName = null;
    treeLabelCache = new Map();
    selectedLocalIds = [];
    selectedPrimaryLocalId = null;
    boxSelectEnabled = false;
    boxSelectStart = null;
    selectionRect.hidden = true;
    contextMenu.hidden = true;
    boxSelectBtn.classList.remove("active");
    canvas.parentElement.classList.remove("boxSelectMode");
    controls.enabled = true;
    itemStat.textContent = "-";
    selectedHud.textContent = "-";
    selectedCategory.textContent = "未选择构件";
    selectedId.textContent = "-";
    setBasicProps({});
    clearAttributes();
    renderTree(null);
    setSelectionControlsEnabled(false);
    showAllBtn.disabled = true;
    fitBtn.disabled = true;
    expandTreeBtn.disabled = true;
    log("Model disposed", {modelId});
}

async function loadFragmentsBuffer(buffer, name) {
    setBusy(true);
    setStatus("Loading");
    logEl.textContent = "";
    fileStat.textContent = `${name} (${mb(buffer.byteLength)} MB)`;
    loadStat.textContent = "-";
    itemStat.textContent = "-";
    modeHud.textContent = "加载";
    const started = performance.now();

    try {
        await disposeCurrentModel();
        const manager = await ensureFragments();
        const modelId = stableModelId(name);
        currentModelName = name;
        log("Fragments load start", {name, sizeMB: mb(buffer.byteLength), modelId});

        currentModel = await manager.load(buffer, {
            modelId,
            camera,
            onProgress: (event) => log("Fragments load progress", event)
        });

        scene.add(currentModel.object);
        await manager.update(true);

        const dataStarted = performance.now();
        currentTree = await currentModel.getSpatialStructure();
        currentAllLocalIds = await currentModel.getLocalIds();
        await renderActiveTree();
        itemStat.textContent = `${currentAllLocalIds.length}`;
        log("Model semantic data ready", {
            seconds: seconds(dataStarted),
            localIds: currentAllLocalIds.length
        });

        fitCurrentModel();
        loadStat.textContent = `${seconds(started)}s`;
        setStatus("Loaded");
        modeHud.textContent = "浏览";
        boxSelectBtn.disabled = false;
        log("Fragments load complete", {
            seconds: seconds(started),
            box: boxToArray(currentModel.box)
        });
    } catch (error) {
        setStatus("Failed");
        modeHud.textContent = "失败";
        log("Fragments load failed", {message: errorMessage(error)});
        console.error(error);
    } finally {
        setBusy(false);
    }
}

function stableModelId(name) {
    return `mvp-${name.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "model"}`;
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
    const box = currentModel.box && !currentModel.box.isEmpty()
        ? currentModel.box.clone()
        : new THREE.Box3().setFromObject(currentModel.object);
    fitBox(box, "模型范围");
}

function fitBox(box, label = "范围") {
    if (!box || box.isEmpty()) {
        log("Fit skipped: empty box", {label});
        return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) || 10;
    const distance = radius * 1.45;
    controls.target.copy(center);
    camera.position.set(center.x + distance, center.y + distance * 0.76, center.z + distance);
    camera.near = Math.max(distance / 1000, 0.1);
    camera.far = Math.max(distance * 12, 1000);
    camera.updateProjectionMatrix();
    controls.update();
    scheduleFragmentsUpdate();
    log("Camera fit", {label, box: boxToArray(box)});
}

async function fitSelected() {
    if (!currentModel || selectedLocalIds.length === 0) {
        return;
    }
    const box = await currentModel.getMergedBox(selectedLocalIds);
    fitBox(box, `selected:${selectedLocalIds.length}`);
}

function setNamedView(viewName) {
    if (!currentModel) {
        return;
    }

    const box = currentModel.box && !currentModel.box.isEmpty()
        ? currentModel.box.clone()
        : new THREE.Box3().setFromObject(currentModel.object);
    if (!box || box.isEmpty()) {
        return;
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
    camera.position.set(center.x + distance * x, center.y + distance * y, center.z + distance * z);
    controls.target.copy(center);
    camera.near = Math.max(distance / 1000, 0.1);
    camera.far = Math.max(distance * 12, 1000);
    camera.updateProjectionMatrix();
    controls.update();
    scheduleFragmentsUpdate();
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
        const root = await buildTreeForTab(currentTreeTab);
        renderTree(root);
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
    if (tab === "objects") {
        return currentTree;
    }
    if (tab === "classes") {
        return buildClassesTree();
    }
    if (tab === "storeys") {
        return buildStoreysTree();
    }
    return buildModelsTree();
}

function buildModelsTree() {
    if (!currentModel) {
        return null;
    }
    return {
        category: currentModelName || currentModel.modelId,
        localId: null,
        localIds: currentAllLocalIds,
        meta: "model",
        children: [
            {
                category: `modelId: ${currentModel.modelId}`,
                localId: null,
                localIds: currentAllLocalIds
            },
            {
                category: `all objects (${currentAllLocalIds.length})`,
                localId: null,
                localIds: currentAllLocalIds
            }
        ]
    };
}

async function buildClassesTree() {
    const categories = (await currentModel.getCategories())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    const categoryMap = await currentModel.getItemsOfCategories(
        categories.map((category) => new RegExp(`^${escapeRegExp(category)}$`))
    );
    const children = categories.map((category) => {
        const localIds = categoryMap[category] || [];
        return {
            category: `${category} (${localIds.length})`,
            meta: "class",
            localId: null,
            localIds
        };
    }).filter((item) => item.localIds.length > 0);

    return {
        category: `classes (${children.length})`,
        localId: null,
        localIds: currentAllLocalIds,
        children
    };
}

function buildStoreysTree() {
    const storeys = [];
    collectStoreys(currentTree, storeys);
    return {
        category: `storeys (${storeys.length})`,
        localId: null,
        localIds: [...new Set(storeys.flatMap((storey) => storey.localIds || []))],
        children: storeys
    };
}

function collectStoreys(item, result) {
    const stack = item ? [item] : [];
    while (stack.length) {
        const current = stack.pop();
        const category = String(current.category || "").toUpperCase();
        if (category === "IFCBUILDINGSTOREY" || category.includes("STOREY")) {
            const localIds = collectTreeLocalIds(current);
            result.push({
                category: `${current.category || "IFCBUILDINGSTOREY"} (${localIds.length})`,
                meta: "storey",
                localId: typeof current.localId === "number" ? current.localId : null,
                localIds
            });
            continue;
        }
        if (Array.isArray(current.children)) {
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
    }
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
    if (!root) {
        return;
    }

    const list = document.createElement("ul");
    list.appendChild(createTreeItem(root, 0));
    modelTree.appendChild(list);
    expandTreeBtn.disabled = false;
    hydrateVisibleTreeLabels();
}

function createTreeItem(item, depth) {
    const li = document.createElement("li");
    const children = Array.isArray(item.children) ? item.children : [];
    const localId = typeof item.localId === "number" ? item.localId : null;
    const nodeLocalIds = collectTreeLocalIds(item);
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
    const expanded = depth === 0;
    toggle.textContent = children.length ? (expanded ? "▾" : "▸") : "";
    const name = document.createElement("span");
    name.className = "treeName";
    name.textContent = getInitialTreeLabel(item, localId, nodeLocalIds);
    const id = document.createElement("span");
    id.className = "treeId";
    id.textContent = getTreeMetaLabel(item, localId, nodeLocalIds);

    button.append(toggle, name, id);
    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const childList = li.querySelector(":scope > ul");
        if (!childList) {
            return;
        }
        const collapsed = childList.classList.toggle("collapsed");
        toggle.textContent = collapsed ? "▸" : "▾";
        if (!collapsed) {
            hydrateVisibleTreeLabels();
        }
    });
    button.addEventListener("click", async (event) => {
        event.stopPropagation();
        await selectLocalIds(nodeLocalIds, {
            primaryLocalId: localId ?? nodeLocalIds[0] ?? null,
            source: "tree"
        });
    });
    li.appendChild(button);

    if (children.length) {
        const ul = document.createElement("ul");
        ul.className = expanded ? "treeChildren" : "treeChildren collapsed";
        for (const child of children) {
            ul.appendChild(createTreeItem(child, depth + 1));
        }
        li.appendChild(ul);
    }
    return li;
}

function getInitialTreeLabel(item, localId, nodeLocalIds) {
    if (item.label) {
        return item.label;
    }
    if (item.category) {
        return normalizeIfcLabel(item.category);
    }
    if (localId !== null) {
        return `Node #${localId}`;
    }
    return `Group (${nodeLocalIds.length})`;
}

function getTreeMetaLabel(item, localId, nodeLocalIds) {
    if (item.meta) {
        return item.meta;
    }
    if (localId !== null && item.category) {
        return `#${localId}`;
    }
    if (localId !== null) {
        return "node";
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
    for (const node of nodes) {
        const localId = Number(node.dataset.localId);
        if (!Number.isFinite(localId)) {
            continue;
        }
        const label = await getTreeNodeDisplayName(localId);
        if (!label) {
            continue;
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
        const name = pickValue(flat, ["Name", "LongName", "ObjectType", "Tag", "Description"]);
        const category = info.category ? normalizeIfcLabel(info.category) : "Node";
        const label = {
            name: name || category || fallback.name,
            meta: `${info.category || "node"} #${localId}`,
            title: `${name || category || fallback.name} | localId ${localId}`,
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
    return [...localIds];
}

async function selectLocalIds(localIds, options = {}) {
    if (!currentModel || !localIds || localIds.length === 0) {
        return;
    }

    const uniqueLocalIds = [...new Set(localIds.filter((id) => typeof id === "number"))];
    if (!uniqueLocalIds.length) {
        return;
    }

    const started = performance.now();
    selectedLocalIds = uniqueLocalIds;
    selectedPrimaryLocalId = options.primaryLocalId ?? uniqueLocalIds[0];
    modeHud.textContent = options.source === "tree" ? "树选择" : "拾取";
    await currentModel.resetHighlight();
    await currentModel.highlight(uniqueLocalIds, highlightMaterial);
    scheduleFragmentsUpdate();
    updateTreeActiveState(selectedPrimaryLocalId);
    await updateSelectionPanel(selectedPrimaryLocalId, uniqueLocalIds);
    setSelectionControlsEnabled(true);
    showAllBtn.disabled = false;
    log("Selection updated", {
        source: options.source || "unknown",
        primaryLocalId: selectedPrimaryLocalId,
        count: uniqueLocalIds.length,
        seconds: seconds(started)
    });
}

function updateTreeActiveState(localId) {
    const nodes = modelTree.querySelectorAll(".treeNode");
    for (const node of nodes) {
        node.classList.toggle("active", node.dataset.localId === String(localId));
    }
}

async function updateSelectionPanel(localId, localIds) {
    selectedHud.textContent = localIds.length > 1 ? `${localIds.length} 个构件` : `#${localId}`;
    selectedId.textContent = localIds.length > 1 ? `${localIds.length} 个 localIds` : `localId ${localId}`;
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    const info = await fetchItemInfo(localId);
    selectedCategory.textContent = info.category || "未识别分类";
    setBasicProps({
        localId,
        GUID: info.guid || "-",
        Category: info.category || "-",
        Name: info.name || "-",
        Description: info.description || "-",
        ObjectType: info.objectType || "-",
        PredefinedType: info.predefinedType || "-"
    });
    renderAttributes(info);
}

async function fetchItemInfo(localId) {
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
    const started = performance.now();
    try {
        const hit = await pickLocalIdAt(event.clientX, event.clientY);
        if (!hit) {
            log("Raycast miss");
            return;
        }
        await selectLocalIds([hit.localId], {primaryLocalId: hit.localId, source: "canvas"});
        log("Raycast hit", {localId: hit.localId, itemId: hit.itemId, seconds: seconds(started)});
    } catch (error) {
        log("Raycast failed", {message: errorMessage(error)});
        console.error(error);
    }
}

async function pickLocalIdAt(clientX, clientY) {
    if (!currentModel) {
        return null;
    }
    const hit = await currentModel.raycast({
        camera,
        mouse: new THREE.Vector2(clientX, clientY),
        dom: canvas
    });
    if (!hit) {
        return null;
    }
    const [localId] = await currentModel.getLocalIdsFromItemIds([hit.itemId]);
    if (typeof localId !== "number") {
        return null;
    }
    return {localId, itemId: hit.itemId, hit};
}

function wasDrag(event) {
    if (!dragStart) {
        return false;
    }
    return Math.abs(event.clientX - dragStart.x) > 4 || Math.abs(event.clientY - dragStart.y) > 4;
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
    canvas.setPointerCapture?.(event.pointerId);
    updateSelectionRect(event.clientX, event.clientY);
    selectionRect.hidden = false;
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

    const width = Math.abs(event.clientX - start.x);
    const height = Math.abs(event.clientY - start.y);
    log("Box select finish", {width, height});
    if (width < 6 || height < 6) {
        return;
    }

    try {
        const result = await currentModel.rectangleRaycast({
            camera,
            dom: canvas,
            topLeft: new THREE.Vector2(Math.min(start.x, event.clientX), Math.min(start.y, event.clientY)),
            bottomRight: new THREE.Vector2(Math.max(start.x, event.clientX), Math.max(start.y, event.clientY)),
            fullyIncluded: false
        });
        const localIds = result && result.localIds ? Array.from(result.localIds) : [];
        log("Box select result", {
            count: localIds.length,
            keys: result ? Object.keys(result) : []
        });
        if (!localIds.length) {
            log("Box select empty");
            return;
        }
        await selectLocalIds(localIds, {
            primaryLocalId: localIds[0],
            source: "box"
        });
        log("Box select complete", {count: localIds.length});
    } catch (error) {
        log("Box select failed", {message: errorMessage(error)});
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

function toggleBoxSelect() {
    boxSelectEnabled = !boxSelectEnabled;
    boxSelectBtn.classList.toggle("active", boxSelectEnabled);
    canvas.parentElement.classList.toggle("boxSelectMode", boxSelectEnabled);
    modeHud.textContent = boxSelectEnabled ? "框选" : "浏览";
    controls.enabled = !boxSelectEnabled;
    log("Box select mode", {enabled: boxSelectEnabled});
    if (!boxSelectEnabled) {
        boxSelectStart = null;
        selectionRect.hidden = true;
    }
}

async function showContextMenu(event) {
    event.preventDefault();
    contextMenu.hidden = true;
    if (!currentModel || boxSelectEnabled) {
        return;
    }
    const hit = await pickLocalIdAt(event.clientX, event.clientY);
    if (hit) {
        await selectLocalIds([hit.localId], {primaryLocalId: hit.localId, source: "context"});
    }
    const rect = canvas.parentElement.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, event.clientX - rect.left)}px`;
    contextMenu.style.top = `${Math.max(8, event.clientY - rect.top)}px`;
    contextMenu.hidden = false;
}

async function handleContextAction(action) {
    contextMenu.hidden = true;
    if (action === "locate") {
        await fitSelected();
    } else if (action === "isolate") {
        await isolateSelected();
    } else if (action === "hide") {
        await hideSelected();
    } else if (action === "color") {
        await colorSelected();
    } else if (action === "showAll") {
        await showAll();
    }
}

async function hideSelected() {
    if (!currentModel || selectedLocalIds.length === 0) {
        return;
    }
    await currentModel.setVisible(selectedLocalIds, false);
    scheduleFragmentsUpdate();
    log("Selected hidden", {count: selectedLocalIds.length});
}

async function isolateSelected() {
    if (!currentModel || selectedLocalIds.length === 0) {
        return;
    }
    const selected = new Set(selectedLocalIds);
    const others = currentAllLocalIds.filter((id) => !selected.has(id));
    await currentModel.setVisible(others, false);
    await currentModel.setVisible(selectedLocalIds, true);
    scheduleFragmentsUpdate();
    log("Selected isolated", {selected: selectedLocalIds.length, hidden: others.length});
}

async function showAll() {
    if (!currentModel) {
        return;
    }
    await currentModel.resetVisible();
    await currentModel.resetOpacity(undefined);
    scheduleFragmentsUpdate();
    log("All items visible");
}

async function colorSelected() {
    if (!currentModel || selectedLocalIds.length === 0) {
        return;
    }
    const color = colorCycle[colorIndex % colorCycle.length];
    colorIndex++;
    await currentModel.setColor(selectedLocalIds, color);
    scheduleFragmentsUpdate();
    log("Selected colored", {count: selectedLocalIds.length, color: `#${color.getHexString()}`});
}

async function resetSelectedColor() {
    if (!currentModel || selectedLocalIds.length === 0) {
        return;
    }
    await currentModel.resetColor(selectedLocalIds);
    await currentModel.resetOpacity(selectedLocalIds);
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    scheduleFragmentsUpdate();
    log("Selected material reset", {count: selectedLocalIds.length});
}

async function updateSelectedOpacity() {
    if (!currentModel || selectedLocalIds.length === 0) {
        return;
    }
    const opacity = Number(opacityInput.value);
    opacityValue.textContent = `${Math.round(opacity * 100)}%`;
    await currentModel.setOpacity(selectedLocalIds, opacity);
    scheduleFragmentsUpdate();
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

function takeSnapshot() {
    renderer.render(scene, camera);
    const filename = `bim-view-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    canvas.toBlob((blob) => {
        if (!blob) {
            log("Snapshot failed");
            return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        log("Snapshot saved", {filename});
    }, "image/png");
}

function saveCurrentView() {
    savedView = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        target: controls.target.clone(),
        near: camera.near,
        far: camera.far,
        zoom: camera.zoom
    };
    restoreViewBtn.disabled = false;
    log("Viewpoint saved", {
        position: vectorToArray(savedView.position),
        target: vectorToArray(savedView.target)
    });
}

function restoreSavedView() {
    if (!savedView) {
        return;
    }
    camera.position.copy(savedView.position);
    camera.quaternion.copy(savedView.quaternion);
    camera.near = savedView.near;
    camera.far = savedView.far;
    camera.zoom = savedView.zoom;
    camera.updateProjectionMatrix();
    controls.target.copy(savedView.target);
    controls.update();
    scheduleFragmentsUpdate();
    log("Viewpoint restored");
}

function vectorToArray(vector) {
    return [
        Number(vector.x.toFixed(3)),
        Number(vector.y.toFixed(3)),
        Number(vector.z.toFixed(3))
    ];
}

function scheduleFragmentsUpdate() {
    if (!fragments || updatePending) {
        return;
    }
    updatePending = true;
    requestAnimationFrame(async () => {
        updatePending = false;
        try {
            await fragments.update();
        } catch (error) {
            console.warn(error);
        }
    });
}

function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    scheduleFragmentsUpdate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
        return;
    }
    const buffer = await file.arrayBuffer();
    await loadFragmentsBuffer(buffer, file.name);
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
        await loadFragmentsBuffer(buffer, url.split("/").pop() || "model.frag");
    } catch (error) {
        setStatus("Failed");
        log("Fragments fetch failed", {message: errorMessage(error)});
    } finally {
        setBusy(false);
    }
});

canvas.addEventListener("pointerdown", (event) => {
    if (boxSelectEnabled) {
        startBoxSelect(event);
        return;
    }
    dragStart = {x: event.clientX, y: event.clientY};
}, true);
canvas.addEventListener("pointermove", updateBoxSelect, true);
canvas.addEventListener("pointerup", finishBoxSelect, true);
canvas.addEventListener("pointercancel", finishBoxSelect, true);
canvas.addEventListener("contextmenu", showContextMenu);
canvas.addEventListener("click", handleCanvasClick);
document.addEventListener("click", (event) => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) {
        contextMenu.hidden = true;
    }
});
contextMenu.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-menu-action]");
    if (!button) {
        return;
    }
    await handleContextAction(button.dataset.menuAction);
});
fitBtn.addEventListener("click", fitCurrentModel);
fullscreenBtn.addEventListener("click", toggleFullscreen);
viewIsoBtn.addEventListener("click", () => setNamedView("iso"));
viewTopBtn.addEventListener("click", () => setNamedView("top"));
viewFrontBtn.addEventListener("click", () => setNamedView("front"));
viewBackBtn.addEventListener("click", () => setNamedView("back"));
viewLeftBtn.addEventListener("click", () => setNamedView("left"));
viewRightBtn.addEventListener("click", () => setNamedView("right"));
viewBottomBtn.addEventListener("click", () => setNamedView("bottom"));
boxSelectBtn.addEventListener("click", toggleBoxSelect);
snapshotBtn.addEventListener("click", takeSnapshot);
saveViewBtn.addEventListener("click", saveCurrentView);
restoreViewBtn.addEventListener("click", restoreSavedView);
clearLogBtn.addEventListener("click", () => {
    logEl.textContent = "";
});
for (const button of treeTabs) {
    button.addEventListener("click", async () => {
        const tab = button.dataset.treeTab;
        if (!tab || tab === currentTreeTab) {
            return;
        }
        currentTreeTab = tab;
        setTreeTabActive(tab);
        await renderActiveTree();
    });
}
expandTreeBtn.addEventListener("click", () => {
    modelTree.querySelectorAll("ul").forEach((list) => {
        list.classList.remove("collapsed");
    });
    modelTree.querySelectorAll(".treeToggle").forEach((toggle) => {
        if (toggle.textContent) {
            toggle.textContent = "▾";
        }
    });
    hydrateVisibleTreeLabels();
});
locateBtn.addEventListener("click", fitSelected);
hideBtn.addEventListener("click", hideSelected);
isolateBtn.addEventListener("click", isolateSelected);
showAllBtn.addEventListener("click", showAll);
colorBtn.addEventListener("click", colorSelected);
resetColorBtn.addEventListener("click", resetSelectedColor);
refreshPropsBtn.addEventListener("click", async () => {
    if (typeof selectedPrimaryLocalId === "number") {
        await updateSelectionPanel(selectedPrimaryLocalId, selectedLocalIds);
    }
});
opacityInput.addEventListener("input", updateSelectedOpacity);
controls.addEventListener("change", scheduleFragmentsUpdate);
window.addEventListener("resize", resize);

resize();
animate();
setSelectionControlsEnabled(false);
showAllBtn.disabled = true;
boxSelectBtn.disabled = true;
restoreViewBtn.disabled = true;
log("MVP viewer ready");
