import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {FragmentsModels, RenderedFaces} from "@thatopen/fragments";
import {SemanticQueryEngine} from "./engines/semantic-query-engine.js";

const canvas = document.getElementById("viewerCanvas");
const fragFile = document.getElementById("fragFile");
const sheetFragFile = document.getElementById("sheetFragFile");
const openLoadBtn = document.getElementById("openLoadBtn");
const sheetOpenLoadBtn = document.getElementById("sheetOpenLoadBtn");
const loadSheet = document.getElementById("loadSheet");
const fragUrl = document.getElementById("fragUrl");
const loadUrlBtn = document.getElementById("loadUrlBtn");
const statusText = document.getElementById("statusText");
const modelName = document.getElementById("modelName");
const itemCount = document.getElementById("itemCount");
const selectedCount = document.getElementById("selectedCount");
const fitBtn = document.getElementById("fitBtn");
const isoBtn = document.getElementById("isoBtn");
const topBtn = document.getElementById("topBtn");
const treeBtn = document.getElementById("treeBtn");
const infoBtn = document.getElementById("infoBtn");
const bottomSheet = document.getElementById("bottomSheet");
const sheetTabs = [...document.querySelectorAll("[data-tab]")];
const sheetPanes = [...document.querySelectorAll("[data-pane]")];
const treeTabs = [...document.querySelectorAll("[data-tree-tab]")];
const treeEmpty = document.getElementById("treeEmpty");
const modelTree = document.getElementById("modelTree");
const mobileStartPanel = document.getElementById("mobileStartPanel");
const infoEmpty = document.getElementById("infoEmpty");
const basicProps = document.getElementById("basicProps");
const attributeList = document.getElementById("attributeList");
const locateBtn = document.getElementById("locateBtn");
const hideBtn = document.getElementById("hideBtn");
const isolateBtn = document.getElementById("isolateBtn");
const showAllBtn = document.getElementById("showAllBtn");
const colorBtn = document.getElementById("colorBtn");
const resetColorBtn = document.getElementById("resetColorBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const opacityInput = document.getElementById("opacityInput");
const opacityValue = document.getElementById("opacityValue");
const logEl = document.getElementById("log");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e0f);

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100000);
camera.position.set(18, 14, 18);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.screenSpacePanning = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x293034, 2.2));
const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(20, 32, 18);
scene.add(light);

const grid = new THREE.GridHelper(80, 32, 0x394349, 0x1f262a);
grid.position.y = -0.01;
scene.add(grid);

const highlightMaterial = {
    color: new THREE.Color(0x36d399),
    opacity: 1,
    transparent: false,
    renderedFaces: RenderedFaces.TWO,
    preserveOriginalMaterial: false,
    customId: "mobile-selection"
};

const colorCycle = [
    new THREE.Color(0xd8b45d),
    new THREE.Color(0x61b8ff),
    new THREE.Color(0xf07368),
    new THREE.Color(0x72d77c)
];

let fragments;
let currentModel = null;
let currentTree = null;
let semanticEngine = null;
let currentAllLocalIds = [];
let currentTreeTab = "models";
let selectedLocalIds = [];
let selectedPrimaryLocalId = null;
let currentModelLabel = null;
let updatePending = false;
let colorIndex = 0;
let pointerStart = null;

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function seconds(started) {
    return Number(((performance.now() - started) / 1000).toFixed(2));
}

function setStatus(value) {
    statusText.textContent = value;
}

function log(message, data) {
    const time = new Date().toLocaleTimeString();
    const line = data === undefined ? `[${time}] ${message}` : `[${time}] ${message} ${JSON.stringify(data)}`;
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log(message, data ?? "");
}

function errorMessage(error) {
    return String(error && error.message ? error.message : error);
}

async function ensureFragments() {
    if (fragments) {
        return fragments;
    }
    const workerURL = new URL("../node_modules/@thatopen/fragments/dist/Worker/worker.mjs", window.location.href).href;
    fragments = new FragmentsModels(workerURL, {
        maxWorkers: Math.max(2, Math.min(3, navigator.hardwareConcurrency || 3))
    });
    fragments.settings.graphicsQuality = 0.75;
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
    currentTree = null;
    semanticEngine = null;
    currentAllLocalIds = [];
    selectedLocalIds = [];
    selectedPrimaryLocalId = null;
    currentModelLabel = null;
    modelName.textContent = "未加载";
    itemCount.textContent = "-";
    selectedCount.textContent = "-";
    clearInfo();
    renderTree();
    updateButtons();
    log("Model disposed", {modelId});
}

async function loadFragmentsBuffer(buffer, name) {
    const started = performance.now();
    setStatus("Loading");
    logEl.textContent = "";
    clearInfo();
    await disposeCurrentModel();

    try {
        const manager = await ensureFragments();
        const modelId = stableModelId(name);
        currentModelLabel = name;
        modelName.textContent = `${name} (${mb(buffer.byteLength)} MB)`;
        log("Mobile load start", {name, sizeMB: mb(buffer.byteLength), modelId});

        currentModel = await manager.load(buffer, {
            modelId,
            camera,
            onProgress: (event) => log("Fragments load progress", event)
        });

        scene.add(currentModel.object);
        await manager.update(true);
        semanticEngine = new SemanticQueryEngine({model: currentModel});
        await semanticEngine.init();
        currentTree = await semanticEngine.getTree(currentTreeTab);
        currentAllLocalIds = await currentModel.getLocalIds();
        itemCount.textContent = `${currentAllLocalIds.length}`;
        await renderTree();
        fitCurrentModel();
        setStatus(`Loaded ${seconds(started)}s`);
        log("Mobile load complete", {
            seconds: seconds(started),
            localIds: currentAllLocalIds.length
        });
    } catch (error) {
        setStatus("Failed");
        log("Mobile load failed", {message: errorMessage(error)});
        console.error(error);
    } finally {
        updateButtons();
        hideLoadSheet();
    }
}

function stableModelId(name) {
    return String(name || "mobile-model")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\w.-]+/g, "-")
        .slice(0, 80) || "mobile-model";
}

async function loadUrl() {
    const url = fragUrl.value.trim();
    if (!url) {
        return;
    }
    const started = performance.now();
    setStatus("Fetching");
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        log("URL read complete", {url, sizeMB: mb(buffer.byteLength), seconds: seconds(started)});
        await loadFragmentsBuffer(buffer, url.split("/").pop() || "remote.frag");
    } catch (error) {
        setStatus("Failed");
        log("URL load failed", {url, message: errorMessage(error)});
    }
}

async function loadFile() {
    const file = (this && this.files && this.files[0]) || (fragFile.files && fragFile.files[0]);
    if (!file) {
        return;
    }
    const started = performance.now();
    const buffer = await file.arrayBuffer();
    log("File read complete", {name: file.name, sizeMB: mb(file.size), seconds: seconds(started)});
    await loadFragmentsBuffer(buffer, file.name);
}

function fitCurrentModel() {
    if (!currentModel) {
        return;
    }
    fitBox(currentModel.box);
}

function fitSelected() {
    if (!currentModel || !selectedLocalIds.length) {
        return;
    }
    currentModel.getMergedBox(selectedLocalIds).then((box) => fitBox(box));
}

function fitBox(box) {
    if (!box || box.isEmpty()) {
        return;
    }
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 1);
    const distance = radius * 1.45;
    camera.position.set(center.x + distance, center.y + distance * 0.75, center.z + distance);
    camera.near = Math.max(radius / 1000, 0.01);
    camera.far = Math.max(radius * 20, 1000);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    scheduleFragmentsUpdate();
}

function setNamedView(type) {
    if (!currentModel || !currentModel.box) {
        return;
    }
    const box = currentModel.box;
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(size.x, size.y, size.z, 1);
    const distance = radius * 1.55;
    const offsets = {
        iso: new THREE.Vector3(distance, distance * 0.8, distance),
        top: new THREE.Vector3(0, distance * 1.35, 0.001)
    };
    const offset = offsets[type] || offsets.iso;
    camera.position.copy(center).add(offset);
    camera.near = Math.max(radius / 1000, 0.01);
    camera.far = Math.max(radius * 20, 1000);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    scheduleFragmentsUpdate();
}

async function pickAt(clientX, clientY) {
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
    return {localId, itemId: hit.itemId};
}

async function selectLocalIds(localIds, source = "unknown") {
    if (!currentModel || !localIds || !localIds.length) {
        return;
    }
    const unique = [...new Set(localIds.filter((id) => typeof id === "number"))];
    if (!unique.length) {
        return;
    }
    selectedLocalIds = unique;
    selectedPrimaryLocalId = unique[0];
    selectedCount.textContent = unique.length > 1 ? `${unique.length}` : `#${selectedPrimaryLocalId}`;
    await currentModel.resetHighlight();
    await currentModel.highlight(unique, highlightMaterial);
    scheduleFragmentsUpdate();
    updateTreeActiveState(selectedPrimaryLocalId);
    await renderInfo(selectedPrimaryLocalId);
    setActivePane("info", true);
    updateButtons();
    log("Selection updated", {source, primaryLocalId: selectedPrimaryLocalId, count: unique.length});
}

async function renderInfo(localId) {
    const info = await fetchItemInfo(localId);
    infoEmpty.style.display = "none";
    renderBasicProps({
        localId,
        GUID: info.guid || "-",
        Category: info.category || "-",
        Name: info.name || "-",
        Description: info.description || "-",
        ObjectType: info.objectType || "-",
        PredefinedType: info.predefinedType || "-"
    });
    renderAttributes(info.flat);
}

async function fetchItemInfo(localId) {
    const result = {
        guid: null,
        category: null,
        name: null,
        description: null,
        objectType: null,
        predefinedType: null,
        flat: {}
    };
    try {
        const [guid] = await currentModel.getGuidsByLocalIds([localId]);
        result.guid = guid;
    } catch {
        result.guid = null;
    }
    try {
        const item = currentModel.getItem(localId);
        result.category = await item.getCategory();
        const attrs = await item.getAttributes();
        appendFlat(result.flat, attrs && attrs.object ? attrs.object : attrs, "");
    } catch {
        result.category = null;
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
        appendFlat(result.flat, Array.isArray(data) ? data[0] : data, "");
    } catch {
        // Attribute completeness is validated separately by T003.
    }

    result.name = pickValue(result.flat, ["Name", "name"]);
    result.description = pickValue(result.flat, ["Description", "description"]);
    result.objectType = pickValue(result.flat, ["ObjectType", "Object Type", "objectType"]);
    result.predefinedType = pickValue(result.flat, ["PredefinedType", "Predefined Type", "predefinedType"]);
    return result;
}

function renderBasicProps(props) {
    basicProps.textContent = "";
    for (const [key, value] of Object.entries(props)) {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = key;
        dd.textContent = value === undefined || value === null || value === "" ? "-" : String(value);
        row.append(dt, dd);
        basicProps.appendChild(row);
    }
}

function renderAttributes(flat) {
    attributeList.textContent = "";
    const entries = Object.entries(flat || {})
        .filter(([, value]) => value !== undefined && value !== null && value !== "")
        .slice(0, 80);
    for (const [key, value] of entries) {
        const row = document.createElement("div");
        row.className = "attributeRow";
        const keyEl = document.createElement("div");
        keyEl.className = "attributeKey";
        keyEl.textContent = key;
        const valueEl = document.createElement("div");
        valueEl.className = "attributeValue";
        valueEl.textContent = formatValue(value);
        row.append(keyEl, valueEl);
        attributeList.appendChild(row);
    }
}

function clearInfo() {
    mobileStartPanel.hidden = !!currentModel;
    infoEmpty.style.display = "block";
    basicProps.textContent = "";
    attributeList.textContent = "";
}

function appendFlat(target, value, prefix, seen = new WeakSet(), depth = 0) {
    if (value === null || value === undefined || depth > 8) {
        return;
    }
    if (value instanceof Map) {
        if (seen.has(value)) {
            return;
        }
        seen.add(value);
        for (const [key, child] of value.entries()) {
            appendFlat(target, child, joinKey(prefix, key), seen, depth + 1);
        }
        return;
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) {
            return;
        }
        seen.add(value);
        value.slice(0, 40).forEach((child, index) => appendFlat(target, child, joinKey(prefix, index), seen, depth + 1));
        return;
    }
    if (typeof value === "object") {
        if (seen.has(value)) {
            return;
        }
        seen.add(value);
        if ("value" in value && Object.keys(value).length <= 3) {
            target[prefix] = value.value;
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            appendFlat(target, child, joinKey(prefix, key), seen, depth + 1);
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

function formatValue(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(Number(value.toFixed(6))) : String(value);
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

async function hideSelected() {
    if (!currentModel || !selectedLocalIds.length) {
        return;
    }
    await currentModel.setVisible(selectedLocalIds, false);
    scheduleFragmentsUpdate();
    log("Selected hidden", {count: selectedLocalIds.length});
}

async function isolateSelected() {
    if (!currentModel || !selectedLocalIds.length) {
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
    if (!currentModel || !selectedLocalIds.length) {
        return;
    }
    const color = colorCycle[colorIndex % colorCycle.length];
    colorIndex++;
    await currentModel.setColor(selectedLocalIds, color);
    scheduleFragmentsUpdate();
    log("Selected colored", {count: selectedLocalIds.length, color: `#${color.getHexString()}`});
}

async function resetSelectedColor() {
    if (!currentModel || !selectedLocalIds.length) {
        return;
    }
    await currentModel.resetColor(selectedLocalIds);
    await currentModel.resetOpacity(selectedLocalIds);
    opacityInput.value = "1";
    opacityValue.textContent = "100%";
    scheduleFragmentsUpdate();
}

async function updateOpacity() {
    if (!currentModel || !selectedLocalIds.length) {
        return;
    }
    const opacity = Number(opacityInput.value);
    opacityValue.textContent = `${Math.round(opacity * 100)}%`;
    await currentModel.setOpacity(selectedLocalIds, opacity);
    scheduleFragmentsUpdate();
}

async function renderTree() {
    modelTree.textContent = "";
    if (!currentModel) {
        treeEmpty.style.display = "block";
        return;
    }
    treeEmpty.style.display = "none";
    try {
        if (semanticEngine) {
            currentTree = await semanticEngine.getTree(currentTreeTab);
        }
    } catch (error) {
        treeEmpty.style.display = "block";
        treeEmpty.textContent = `${currentTreeTab} tree failed: ${errorMessage(error)}`;
        log("Mobile tree render failed", {tab: currentTreeTab, message: errorMessage(error)});
        return;
    }
    const nodes = getTreeNodes(currentTreeTab).slice(0, 320);
    for (const node of nodes) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "treeNode";
        button.dataset.localId = node.primaryLocalId ?? "";
        const name = document.createElement("span");
        name.textContent = node.label;
        const meta = document.createElement("small");
        meta.textContent = node.meta;
        button.append(name, meta);
        button.addEventListener("click", () => selectLocalIds(node.localIds, "tree"));
        modelTree.appendChild(button);
    }
    if (!nodes.length) {
        treeEmpty.style.display = "block";
        treeEmpty.textContent = "当前模型没有可展示节点";
    }
}

function getTreeNodes(tab) {
    if (!currentModel || !currentTree) {
        return [];
    }
    return getObjectNodes();
}

function getObjectNodes() {
    const result = [];
    const stack = currentTree ? [{item: currentTree, depth: 0}] : [];
    while (stack.length && result.length < 320) {
        const {item, depth} = stack.shift();
        const localIds = collectTreeLocalIds(item);
        const primaryLocalId = typeof item.localId === "number" ? item.localId : localIds[0];
        result.push({
            label: `${"  ".repeat(Math.min(depth, 4))}${item.label || normalizeIfcLabel(item.category || "Node")}`,
            meta: item.meta || (primaryLocalId ? `#${primaryLocalId}` : `${localIds.length}`),
            localIds,
            primaryLocalId
        });
        if (Array.isArray(item.children) && depth < 5) {
            for (const child of item.children) {
                stack.push({item: child, depth: depth + 1});
            }
        }
    }
    return result;
}

function collectTreeLocalIds(item) {
    const result = [];
    const seen = new Set();
    const stack = item ? [item] : [];
    while (stack.length) {
        const current = stack.pop();
        const ids = Array.isArray(current.localIds)
            ? current.localIds
            : typeof current.localId === "number"
                ? [current.localId]
                : [];
        for (const id of ids) {
            if (typeof id === "number" && !seen.has(id)) {
                seen.add(id);
                result.push(id);
            }
        }
        if (Array.isArray(current.children)) {
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
    }
    return result;
}

function updateTreeActiveState(localId) {
    modelTree.querySelectorAll(".treeNode").forEach((node) => {
        node.classList.toggle("active", node.dataset.localId === String(localId));
    });
}

function normalizeIfcLabel(value) {
    const text = String(value || "");
    const rawType = text.toUpperCase().replace(/^IFC_?/, "");
    const labels = {
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
        ROOF: "Roof",
        CURTAINWALL: "Curtain Wall",
        FURNISHINGELEMENT: "Furniture",
        BUILDINGELEMENTPROXY: "Element Proxy"
    };
    return labels[rawType] || rawType
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase()) || "Node";
}

function setActivePane(tab, expand = true) {
    sheetTabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    sheetPanes.forEach((pane) => pane.classList.toggle("active", pane.dataset.pane === tab));
    bottomSheet.classList.toggle("expanded", expand);
}

function showLoadSheet() {
    loadSheet.hidden = false;
    requestAnimationFrame(() => fragUrl.focus());
}

function hideLoadSheet() {
    loadSheet.hidden = true;
}

function updateButtons() {
    const hasModel = !!currentModel;
    const hasSelection = selectedLocalIds.length > 0;
    [fitBtn, isoBtn, topBtn, treeBtn, showAllBtn, snapshotBtn].forEach((button) => {
        button.disabled = !hasModel;
    });
    [locateBtn, hideBtn, isolateBtn, colorBtn, resetColorBtn, opacityInput].forEach((button) => {
        button.disabled = !hasSelection;
    });
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
    const filename = `bim-mobile-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    canvas.toBlob((blob) => {
        if (!blob) {
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

canvas.addEventListener("pointerdown", (event) => {
    pointerStart = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now()
    };
});

canvas.addEventListener("pointerup", async (event) => {
    if (!currentModel || !pointerStart) {
        return;
    }
    const dx = Math.abs(event.clientX - pointerStart.x);
    const dy = Math.abs(event.clientY - pointerStart.y);
    const dt = performance.now() - pointerStart.time;
    pointerStart = null;
    if (dx > 8 || dy > 8 || dt > 420) {
        return;
    }
    try {
        const hit = await pickAt(event.clientX, event.clientY);
        if (!hit) {
            log("Raycast miss");
            return;
        }
        await selectLocalIds([hit.localId], "tap");
    } catch (error) {
        log("Raycast failed", {message: errorMessage(error)});
    }
});

fragFile.addEventListener("change", loadFile);
sheetFragFile.addEventListener("change", loadFile);
openLoadBtn.addEventListener("click", showLoadSheet);
sheetOpenLoadBtn.addEventListener("click", showLoadSheet);
loadUrlBtn.addEventListener("click", loadUrl);
loadSheet.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-load]")) {
        hideLoadSheet();
    }
});
fitBtn.addEventListener("click", fitCurrentModel);
isoBtn.addEventListener("click", () => setNamedView("iso"));
topBtn.addEventListener("click", () => setNamedView("top"));
treeBtn.addEventListener("click", () => setActivePane("tree", true));
infoBtn.addEventListener("click", () => setActivePane("info", true));
locateBtn.addEventListener("click", fitSelected);
hideBtn.addEventListener("click", hideSelected);
isolateBtn.addEventListener("click", isolateSelected);
showAllBtn.addEventListener("click", showAll);
colorBtn.addEventListener("click", colorSelected);
resetColorBtn.addEventListener("click", resetSelectedColor);
snapshotBtn.addEventListener("click", takeSnapshot);
fullscreenBtn.addEventListener("click", toggleFullscreen);
opacityInput.addEventListener("input", updateOpacity);
controls.addEventListener("change", scheduleFragmentsUpdate);
window.addEventListener("resize", resize);

sheetTabs.forEach((button) => {
    button.addEventListener("click", () => setActivePane(button.dataset.tab, true));
});

treeTabs.forEach((button) => {
    button.addEventListener("click", async () => {
        currentTreeTab = button.dataset.treeTab;
        treeTabs.forEach((tab) => tab.classList.toggle("active", tab === button));
        await renderTree();
    });
});

bottomSheet.addEventListener("dblclick", () => {
    bottomSheet.classList.toggle("expanded");
});

resize();
updateButtons();
setTimeout(showLoadSheet, 250);
animate();
