import {createViewer, byId, setText} from "./common-viewer.js";
import {LabelEngine} from "../engines/label-engine.js";
import {LabelStoreEngine} from "../engines/label-store-engine.js";

const STORAGE_KEY = "demo:labels";
const overlay = byId("overlay");
const labelText = byId("labelText");
const addLabelBtn = byId("addLabelBtn");
const cancelEditBtn = byId("cancelEditBtn");
const labelList = byId("labelList");
const canvas = byId("viewerCanvas");

let selected = null;
let editingLabelId = null;
let pointerStart = null;

const sdk = await createViewer({
    onSelectionChanged(selection) {
        selected = selection;
        const localId = selection?.primaryLocalId;
        setText("selectedInfo", typeof localId === "number"
            ? `当前选择：localId ${localId}，数量：${selection.count || 0}`
            : "请先点击模型选择构件");
    }
});

const labelStore = new LabelStoreEngine({
    storageKey: STORAGE_KEY,
    maxItems: 300
});
labelStore.setCurrentModel(sdk.currentModel?.modelId || null, sdk.currentModelName || null);

const labelEngine = new LabelEngine({
    camera: sdk.renderEngine.camera,
    canvas: sdk.canvas,
    overlay,
    model: sdk.currentModel,
    semanticEngine: sdk.semanticEngine,
    onSelect: async (label) => {
        await locateLabel(label.id, false);
    }
});

restorePersistedLabels();
renderLabelList();

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
        const result = await sdk.pick(event.clientX, event.clientY, {source: "label-demo"});
        if (!result?.localIds?.length) {
            setText("status", "未命中构件");
            return;
        }
        setText("status", `已选择 localId ${result.localIds[0]}，可创建标签`);
    } catch (error) {
        setText("status", `选择失败：${error?.message || error}`);
    }
});

addLabelBtn.addEventListener("click", async () => {
    if (editingLabelId) {
        saveLabelEdit();
        return;
    }
    await createLabelForSelection();
});

cancelEditBtn.addEventListener("click", cancelLabelEdit);

byId("clearBtn").addEventListener("click", () => {
    labelEngine.clear();
    const removed = labelStore.clear();
    cancelLabelEdit();
    renderLabelList();
    setText("status", removed ? `已清除 ${removed} 个标签` : "当前没有可清除的标签");
});

sdk.renderEngine.controls.addEventListener("change", () => labelEngine.sync());

async function createLabelForSelection() {
    const localId = selected?.primaryLocalId;
    if (typeof localId !== "number") {
        setText("status", "请先点击模型选择构件");
        return null;
    }

    try {
        const label = await labelEngine.addLabelForSelection(selected, {
            title: labelText.value.trim() || undefined,
            id: `label-${sdk.currentModel.modelId}-${localId}-${Date.now().toString(36)}`
        });
        const stored = labelStore.save({
            ...label,
            modelId: sdk.currentModel.modelId,
            modelName: sdk.currentModelName
        });
        labelEngine.removeLabel(label.id);
        labelEngine.addLabel(stored);
        labelEngine.sync();
        labelText.value = "";
        renderLabelList();
        setText("status", `已创建标签：localId ${stored.localId}`);
        return stored;
    } catch (error) {
        setText("status", `创建标签失败：${error?.message || error}`);
        return null;
    }
}

function restorePersistedLabels() {
    labelEngine.clear();
    let count = 0;
    for (const label of labelStore.list()) {
        try {
            labelEngine.addLabel(label);
            count++;
        } catch {
            // Skip invalid persisted labels for this model.
        }
    }
    labelEngine.sync();
    setText("status", count ? `已恢复 ${count} 个标签` : "标签功能已就绪");
}

function renderLabelList() {
    labelList.textContent = "";
    const labels = labelStore.list();
    if (!labels.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "暂无标签";
        labelList.appendChild(empty);
        return;
    }

    for (const label of labels.slice(0, 30)) {
        const item = document.createElement("div");
        item.className = "miniItem";

        const title = document.createElement("div");
        title.className = "miniItemTitle";
        title.textContent = label.title || "未命名标签";

        const meta = document.createElement("div");
        meta.className = "miniItemMeta";
        meta.textContent = label.globalId || (typeof label.localId === "number" ? `localId ${label.localId}` : "未绑定构件");

        const actions = document.createElement("div");
        actions.className = "miniItemActions";

        const locate = document.createElement("button");
        locate.type = "button";
        locate.textContent = "定位";
        locate.addEventListener("click", () => locateLabel(label.id, true));

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "编辑";
        edit.addEventListener("click", () => editLabel(label.id));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", () => removeLabel(label.id));

        actions.append(locate, edit, remove);
        item.append(title, meta, actions);
        labelList.appendChild(item);
    }
}

async function locateLabel(id, fit = true) {
    const label = labelStore.get(id);
    if (!label || typeof label.localId !== "number") {
        return false;
    }
    await sdk.selectLocalIds([label.localId], {
        primaryLocalId: label.localId,
        source: "label-demo"
    });
    if (fit) {
        await sdk.fitSelection();
    }
    setText("status", `已定位标签：localId ${label.localId}`);
    return true;
}

function editLabel(id) {
    const label = labelStore.get(id);
    if (!label) {
        return;
    }
    editingLabelId = label.id;
    labelText.value = label.title || "";
    addLabelBtn.textContent = "保存标签";
    cancelEditBtn.hidden = false;
    labelText.focus();
    setText("status", `正在编辑标签：localId ${label.localId ?? "-"}`);
}

function saveLabelEdit() {
    const label = labelStore.get(editingLabelId);
    if (!label) {
        cancelLabelEdit();
        return;
    }
    const updated = labelStore.update(label.id, {
        title: labelText.value.trim() || label.title
    });
    if (updated) {
        labelEngine.addLabel(updated);
        labelEngine.sync();
        renderLabelList();
        setText("status", `已保存标签：localId ${updated.localId ?? "-"}`);
    }
    cancelLabelEdit();
}

function cancelLabelEdit() {
    editingLabelId = null;
    addLabelBtn.textContent = "创建标签";
    cancelEditBtn.hidden = true;
    labelText.value = "";
}

function removeLabel(id) {
    const removed = labelStore.remove(id);
    labelEngine.removeLabel(id);
    if (editingLabelId === id) {
        cancelLabelEdit();
    }
    renderLabelList();
    setText("status", removed ? "标签已删除" : "标签不存在");
}
