import * as THREE from "three";
import {createViewer, byId, setText} from "./common-viewer.js";
import {AnnotationEngine} from "../engines/annotation-engine.js";

const STORAGE_KEY = "demo:annotations";
const overlay = byId("overlay");
const noteStatus = byId("noteStatus");
const noteText = byId("noteText");
const addNoteBtn = byId("addNoteBtn");
const cancelEditBtn = byId("cancelEditBtn");
const annotationList = byId("annotationList");
const canvas = byId("viewerCanvas");
const statusFilterTabs = [...document.querySelectorAll("[data-status-filter]")];

const markerMap = new Map();
let selected = null;
let editingAnnotationId = null;
let pointerStart = null;
let activeFilterStatus = "all";

const sdk = await createViewer({
    onSelectionChanged(selection) {
        selected = selection;
        const localId = selection?.primaryLocalId;
        setText("selectedInfo", typeof localId === "number"
            ? `当前选择：localId ${localId}，数量：${selection.count || 0}`
            : "请先点击模型选择构件");
    }
});

const annotationEngine = new AnnotationEngine({
    storageKey: STORAGE_KEY,
    maxItems: 500
});
annotationEngine.setCurrentModel(sdk.currentModel?.modelId || null, sdk.currentModelName || null);

renderAnnotations();

canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
        return;
    }
    pointerStart = {
        x: event.clientX,
        y: event.clientY
    };
});

canvas.addEventListener("pointercancel", () => {
    pointerStart = null;
});

canvas.addEventListener("pointerup", async (event) => {
    if (!pointerStart || event.button !== 0) {
        pointerStart = null;
        return;
    }

    const moved = Math.abs(event.clientX - pointerStart.x) > 4
        || Math.abs(event.clientY - pointerStart.y) > 4;
    pointerStart = null;
    if (moved) {
        return;
    }

    setText("status", "正在选择构件...");
    try {
        const result = await sdk.pick(event.clientX, event.clientY, {source: "annotation-demo"});
        if (!result?.localIds?.length) {
            setText("status", "未命中构件");
            return;
        }
        setText("status", `已选择 localId ${result.localIds[0]}，可新增批注`);
    } catch (error) {
        setText("status", `选择失败：${error?.message || error}`);
    }
});

addNoteBtn.addEventListener("click", async () => {
    if (editingAnnotationId) {
        updateAnnotation();
        return;
    }
    await createAnnotation();
});

cancelEditBtn.addEventListener("click", cancelEdit);
for (const tab of statusFilterTabs) {
    tab.addEventListener("click", () => {
        setFilterStatus(tab.dataset.statusFilter || "all");
        renderAnnotations();
    });
}
annotationEngine.addEventListener("changed", renderAnnotations);
sdk.renderEngine.controls.addEventListener("change", syncMarkers);

byId("clearBtn").addEventListener("click", () => {
    const removed = annotationEngine.clear();
    cancelEdit();
    renderAnnotations();
    setText("status", removed ? `已清除 ${removed} 条批注` : "当前没有可清除的批注");
});

async function createAnnotation() {
    const localId = selected?.primaryLocalId;
    if (typeof localId !== "number") {
        setText("status", "请先点击模型选择构件");
        return null;
    }

    const content = noteText.value.trim();
    if (!content) {
        setText("status", "请输入批注内容");
        return null;
    }

    try {
        const info = await sdk.getItemInfo(localId);
        const position = await getLocalIdCenter(localId);
        const nextStatus = noteStatus.value || "open";
        ensureStatusVisible(nextStatus);
        const annotation = annotationEngine.create({
            modelId: sdk.currentModel.modelId,
            modelName: sdk.currentModelName,
            localId,
            globalId: selected.globalIds?.[0] || info?.globalId || null,
            title: info?.name || `localId ${localId}`,
            content,
            selection: selected,
            position,
            status: nextStatus,
            priority: "normal"
        });
        noteText.value = "";
        noteStatus.value = "open";
        renderAnnotations();
        setText("status", `已新增批注：localId ${annotation.localId}`);
        return annotation;
    } catch (error) {
        setText("status", `新增批注失败：${error?.message || error}`);
        return null;
    }
}

function updateAnnotation() {
    const current = annotationEngine.get(editingAnnotationId);
    if (!current) {
        cancelEdit();
        return;
    }
    const content = noteText.value.trim();
    if (!content) {
        setText("status", "请输入批注内容");
        return;
    }
    const nextStatus = noteStatus.value || current.status || "open";
    ensureStatusVisible(nextStatus);
    const updated = annotationEngine.update(current.id, {
        content,
        status: nextStatus
    });
    cancelEdit();
    renderAnnotations();
    setText("status", updated ? "批注已保存" : "批注不存在");
}

function renderAnnotations() {
    renderAnnotationList();
    renderMarkers();
}

function renderAnnotationList() {
    annotationList.textContent = "";
    const annotations = getFilteredAnnotations();
    if (!annotations.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "暂无匹配批注";
        annotationList.appendChild(empty);
        return;
    }

    for (const annotation of annotations.slice(0, 30)) {
        const item = document.createElement("div");
        item.className = "miniItem";

        const title = document.createElement("div");
        title.className = "miniItemTitle";
        title.textContent = annotation.title || annotation.content || "模型批注";

        const meta = document.createElement("div");
        meta.className = "miniItemMeta";
        const target = annotation.globalId || (typeof annotation.localId === "number" ? `localId ${annotation.localId}` : "未绑定构件");
        meta.textContent = `${target} · ${getStatusText(annotation.status)}`;

        const content = document.createElement("div");
        content.className = "miniItemMeta";
        content.textContent = annotation.content || "-";

        const actions = document.createElement("div");
        actions.className = "miniItemActions";

        const locate = document.createElement("button");
        locate.type = "button";
        locate.textContent = "定位";
        locate.addEventListener("click", () => locateAnnotation(annotation.id, true));

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "编辑";
        edit.addEventListener("click", () => editAnnotation(annotation.id));

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.textContent = annotation.status === "closed" ? "重开" : "关闭";
        toggle.addEventListener("click", () => {
            const nextStatus = annotation.status === "closed" ? "open" : "closed";
            ensureStatusVisible(nextStatus);
            annotationEngine.update(annotation.id, {
                status: nextStatus
            });
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", () => {
            annotationEngine.remove(annotation.id);
            if (editingAnnotationId === annotation.id) {
                cancelEdit();
            }
        });

        actions.append(locate, edit, toggle, remove);
        item.append(title, meta, content, actions);
        annotationList.appendChild(item);
    }
}

function renderMarkers() {
    const annotations = getFilteredAnnotations().slice(0, 80);
    const visibleIds = new Set();
    for (const annotation of annotations) {
        visibleIds.add(annotation.id);
        const marker = ensureMarker(annotation);
        marker.__annotationPosition = annotation.position || null;
        updateMarkerContent(marker, annotation);
        if (!marker.__annotationPosition && typeof annotation.localId === "number") {
            getLocalIdCenter(annotation.localId).then((position) => {
                const latest = markerMap.get(annotation.id);
                if (!latest || !position) {
                    return;
                }
                latest.__annotationPosition = position;
                syncMarkers();
            }).catch(() => {});
        }
    }
    for (const [id, marker] of markerMap) {
        if (!visibleIds.has(id)) {
            marker.remove();
            markerMap.delete(id);
        }
    }
    syncMarkers();
}

function ensureMarker(annotation) {
    const existing = markerMap.get(annotation.id);
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
        locateAnnotation(annotation.id, true);
    });
    overlay.appendChild(marker);
    markerMap.set(annotation.id, marker);
    return marker;
}

function updateMarkerContent(marker, annotation) {
    marker.textContent = "";
    marker.classList.toggle("resolved", annotation.status === "resolved" || annotation.status === "closed");
    const dot = document.createElement("span");
    dot.className = `annotationMarkerDot status-${annotation.status || "open"}`;
    const body = document.createElement("span");
    body.className = "annotationMarkerBody";
    const title = document.createElement("span");
    title.className = "annotationMarkerTitle";
    title.textContent = annotation.content || annotation.title || "模型批注";
    const meta = document.createElement("span");
    meta.className = "annotationMarkerMeta";
    meta.textContent = getStatusText(annotation.status);
    body.append(title, meta);
    marker.append(dot, body);
    marker.title = `${annotation.title || "模型批注"}\n${annotation.content || ""}`.trim();
}

function syncMarkers() {
    sdk.renderEngine.camera.updateMatrixWorld();
    const canvasRect = sdk.canvas.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const width = Math.max(canvasRect.width, 1);
    const height = Math.max(canvasRect.height, 1);
    for (const marker of markerMap.values()) {
        const position = toVector3(marker.__annotationPosition);
        if (!position) {
            marker.hidden = true;
            continue;
        }
        const projected = position.clone().project(sdk.renderEngine.camera);
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
}

async function locateAnnotation(id, fit) {
    const annotation = annotationEngine.get(id);
    if (!annotation) {
        return false;
    }
    if (typeof annotation.localId === "number") {
        await sdk.selectLocalIds([annotation.localId], {
            primaryLocalId: annotation.localId,
            source: "annotation-demo"
        });
        if (fit) {
            await sdk.fitSelection();
        }
    }
    setText("status", `已定位批注：localId ${annotation.localId ?? "-"}`);
    return true;
}

function editAnnotation(id) {
    const annotation = annotationEngine.get(id);
    if (!annotation) {
        return;
    }
    editingAnnotationId = annotation.id;
    noteText.value = annotation.content || annotation.title || "";
    noteStatus.value = annotation.status || "open";
    addNoteBtn.textContent = "保存批注";
    cancelEditBtn.hidden = false;
    noteText.focus();
    setText("status", `正在编辑批注：localId ${annotation.localId ?? "-"}`);
}

function cancelEdit() {
    editingAnnotationId = null;
    noteText.value = "";
    noteStatus.value = "open";
    addNoteBtn.textContent = "新增批注";
    cancelEditBtn.hidden = true;
}

function getFilteredAnnotations() {
    const filter = {};
    const status = activeFilterStatus;
    if (status !== "all") {
        filter.status = status;
    }
    return annotationEngine.list(filter);
}

function ensureStatusVisible(status) {
    if (!status || activeFilterStatus === "all" || activeFilterStatus === status) {
        return;
    }
    const hasTab = statusFilterTabs.some((tab) => tab.dataset.statusFilter === status);
    setFilterStatus(hasTab ? status : "all");
}

function setFilterStatus(status) {
    activeFilterStatus = status || "all";
    for (const tab of statusFilterTabs) {
        tab.classList.toggle("active", tab.dataset.statusFilter === activeFilterStatus);
    }
}

function getStatusText(status) {
    return {
        open: "打开",
        processing: "处理中",
        resolved: "已解决",
        closed: "已关闭"
    }[status] || status || "打开";
}

async function getLocalIdCenter(localId) {
    if (typeof localId !== "number" || typeof sdk.currentModel?.getMergedBox !== "function") {
        return null;
    }
    const box = await sdk.currentModel.getMergedBox([localId]);
    if (!box || box.isEmpty()) {
        return null;
    }
    return box.getCenter(new THREE.Vector3()).toArray();
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
