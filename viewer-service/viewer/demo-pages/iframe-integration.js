import {BimViewerEmbedClient} from "../sdk/embed-client.js";

const byId = (id) => document.getElementById(id);

const frame = byId("viewerFrame");
const readyState = byId("readyState");
const modelState = byId("modelState");
const selectionState = byId("selectionState");
const eventLog = byId("eventLog");
let savedViewpoint = null;
let lastLabelId = null;
let lastAnnotationId = null;

const origin = window.location.origin;
const targetOrigin = origin && origin !== "null" ? origin : "*";
frame.src = `../index.html?chrome=0&embedOrigin=${encodeURIComponent(targetOrigin)}`;

const client = BimViewerEmbedClient.create({
    iframe: frame,
    targetOrigin,
    allowedOrigin: targetOrigin
});

function log(message, data = null) {
    const time = new Date().toLocaleTimeString();
    const line = data === null
        ? `[${time}] ${message}`
        : `[${time}] ${message} ${JSON.stringify(data)}`;
    eventLog.textContent = `${line}\n${eventLog.textContent}`.slice(0, 3200);
}

function parseLocalIds(value) {
    return String(value || "")
        .split(",")
        .map((item) => Number(item.trim()))
        .filter(Number.isFinite);
}

function parseTextIds(value) {
    return String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function setBusy(busy) {
    for (const button of document.querySelectorAll("button")) {
        button.disabled = busy;
    }
}

function syncState(state = {}) {
    modelState.textContent = state.modelName || state.modelId || (state.hasModel ? "已加载" : "-");
    const selection = state.selection || {};
    selectionState.textContent = selection.count
        ? `${selection.count} 个，主构件 ${selection.primaryLocalId ?? "-"}`
        : "-";
}

function getBusinessTargetPayload() {
    const globalIds = parseTextIds(byId("globalIdsInput").value);
    if (globalIds.length) {
        return {globalId: globalIds[0]};
    }
    const localIds = parseLocalIds(byId("localIdsInput").value);
    if (localIds.length) {
        return {localId: localIds[0]};
    }
    return {};
}

async function runCommand(label, action) {
    setBusy(true);
    try {
        const result = await action();
        log(label, result);
        if (result?.state) {
            syncState(result.state);
        } else if (result?.selection) {
            selectionState.textContent = `${result.selection.count || 0} 个，主构件 ${result.selection.primaryLocalId ?? "-"}`;
        }
        return result;
    } catch (error) {
        log(`${label} 失败`, {message: error.message || String(error)});
        return null;
    } finally {
        setBusy(false);
    }
}

client.addEventListener("ready", (event) => {
    readyState.textContent = "ready";
    log("Viewer ready", event.detail);
});

client.addEventListener("modelLoaded", (event) => {
    readyState.textContent = "modelLoaded";
    modelState.textContent = event.detail.name || event.detail.modelId || "已加载";
    log("modelLoaded", event.detail);
});

client.addEventListener("modelLoadFailed", (event) => {
    readyState.textContent = "modelLoadFailed";
    log("modelLoadFailed", event.detail);
});

client.addEventListener("selectionChanged", (event) => {
    const selection = event.detail || {};
    selectionState.textContent = selection.count
        ? `${selection.count} 个，主构件 ${selection.primaryLocalId ?? "-"}`
        : "-";
    log("selectionChanged", selection);
});

client.addEventListener("snapshotCreated", (event) => {
    log("snapshotCreated", event.detail);
});

client.waitReady()
    .then(() => {
        readyState.textContent = "ready";
        log("连接成功");
    })
    .catch((error) => {
        readyState.textContent = "ready timeout";
        log("连接超时", {message: error.message || String(error)});
    });

byId("loadBtn").addEventListener("click", () => runCommand("openModel", () => {
    const manifestUrl = byId("manifestInput").value.trim();
    return client.openModel({manifestUrl});
}));

byId("stateBtn").addEventListener("click", () => runCommand("getState", async () => {
    const state = await client.getState();
    syncState(state);
    return state;
}));

byId("snapshotBtn").addEventListener("click", () => runCommand("snapshot", () => client.snapshot({
    download: true,
    filename: "iframe-viewer-snapshot.png"
})));

byId("fitBtn").addEventListener("click", () => runCommand("fitModel", () => client.fitModel()));
byId("isoBtn").addEventListener("click", () => runCommand("setView iso", () => client.setView("iso")));
byId("topBtn").addEventListener("click", () => runCommand("setView top", () => client.setView("top")));
byId("clearBtn").addEventListener("click", () => runCommand("clearSelection", () => client.clearSelection()));

byId("saveViewBtn").addEventListener("click", () => runCommand("captureViewpoint", async () => {
    savedViewpoint = await client.captureViewpoint();
    return savedViewpoint;
}));

byId("restoreViewBtn").addEventListener("click", () => runCommand("setViewpoint", () => {
    if (!savedViewpoint) {
        throw new Error("请先点击“保存视点”");
    }
    return client.setViewpoint(savedViewpoint);
}));

byId("selectBtn").addEventListener("click", () => runCommand("selectLocalIds", () => {
    const localIds = parseLocalIds(byId("localIdsInput").value);
    if (!localIds.length) {
        throw new Error("请输入 localId，例如 123 或 123,456");
    }
    return client.selectLocalIds(localIds, {source: "demo-business-list"});
}));

byId("selectGlobalBtn").addEventListener("click", () => runCommand("selectGlobalIds", () => {
    const globalIds = parseTextIds(byId("globalIdsInput").value);
    if (!globalIds.length) {
        throw new Error("请输入 GlobalId，例如 1kTvK5... 或多个用逗号分隔");
    }
    return client.selectGlobalIds(globalIds, {source: "demo-business-global-id"});
}));

byId("itemInfoBtn").addEventListener("click", () => runCommand("getItemInfo", async () => {
    const globalIds = parseTextIds(byId("globalIdsInput").value);
    if (globalIds.length) {
        return client.getItemInfo({globalId: globalIds[0]});
    }
    const localIds = parseLocalIds(byId("localIdsInput").value);
    if (localIds.length) {
        return client.getItemInfo({localId: localIds[0]});
    }
    throw new Error("请输入 localId 或 GlobalId 后再查询构件信息");
}));

byId("hideSelectedBtn").addEventListener("click", () => runCommand("hideSelected", () => client.hideSelected()));
byId("isolateSelectedBtn").addEventListener("click", () => runCommand("isolateSelected", () => client.isolateSelected()));
byId("colorSelectedBtn").addEventListener("click", () => runCommand("colorSelected", () => client.colorSelected()));
byId("showAllBtn").addEventListener("click", () => runCommand("showAll", () => client.showAll()));

byId("createLabelBtn").addEventListener("click", () => runCommand("createLabel", async () => {
    const result = await client.createLabel({
        ...getBusinessTargetPayload(),
        title: byId("labelTitleInput").value.trim() || "业务标签"
    });
    lastLabelId = result?.label?.id || lastLabelId;
    return result;
}));

byId("createAnnotationBtn").addEventListener("click", () => runCommand("createAnnotation", async () => {
    const result = await client.createAnnotation({
        ...getBusinessTargetPayload(),
        title: "第三方批注",
        content: byId("annotationContentInput").value.trim() || "第三方系统创建的批注",
        status: "open",
        priority: "normal"
    });
    lastAnnotationId = result?.annotation?.id || lastAnnotationId;
    return result;
}));

byId("listLabelsBtn").addEventListener("click", () => runCommand("listLabels", async () => {
    const result = await client.listLabels({
        ...getBusinessTargetPayload(),
        limit: 20
    });
    lastLabelId = result?.labels?.[0]?.id || lastLabelId;
    return result;
}));

byId("listAnnotationsBtn").addEventListener("click", () => runCommand("listAnnotations", async () => {
    const result = await client.listAnnotations({
        ...getBusinessTargetPayload(),
        limit: 20
    });
    lastAnnotationId = result?.annotations?.[0]?.id || lastAnnotationId;
    return result;
}));

byId("removeLastLabelBtn").addEventListener("click", () => runCommand("removeLabel", async () => {
    if (!lastLabelId) {
        const result = await client.listLabels({limit: 1});
        lastLabelId = result?.labels?.[0]?.id || null;
    }
    if (!lastLabelId) {
        throw new Error("没有可删除的标签，请先创建或查询标签");
    }
    const result = await client.removeLabel(lastLabelId);
    if (result?.removed) {
        lastLabelId = null;
    }
    return result;
}));

byId("removeLastAnnotationBtn").addEventListener("click", () => runCommand("removeAnnotation", async () => {
    if (!lastAnnotationId) {
        const result = await client.listAnnotations({limit: 1});
        lastAnnotationId = result?.annotations?.[0]?.id || null;
    }
    if (!lastAnnotationId) {
        throw new Error("没有可删除的批注，请先创建或查询批注");
    }
    const result = await client.removeAnnotation(lastAnnotationId);
    if (result?.removed) {
        lastAnnotationId = null;
    }
    return result;
}));

byId("fitSelectionBtn").addEventListener("click", () => runCommand("fitSelection", () => client.fitSelection()));
