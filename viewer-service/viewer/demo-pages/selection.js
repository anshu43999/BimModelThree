import {createViewer, byId, setText} from "./common-viewer.js";

const canvas = byId("viewerCanvas");
let pointerStart = null;

const sdk = await createViewer({
    onSelectionChanged(selection) {
        const localId = selection?.primaryLocalId ?? "-";
        setText("selectionInfo", `已选择：${localId}，数量：${selection?.count || 0}`);
    }
});

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

    setText("status", "正在拾取构件...");
    try {
        const result = await sdk.pick(event.clientX, event.clientY, {source: "demo-canvas"});
        if (!result?.localIds?.length) {
            setText("status", "未命中构件");
            return;
        }
        setText("status", `已选中 localId ${result.localIds[0]}`);
    } catch (error) {
        setText("status", `拾取失败：${error?.message || error}`);
    }
});

byId("fitSelectionBtn").addEventListener("click", async () => {
    await sdk.fitSelection();
    setText("status", "已定位当前选择");
});

byId("clearSelectionBtn").addEventListener("click", async () => {
    await sdk.clearSelection("demo");
    setText("selectionInfo", "尚未选择构件");
    setText("status", "选择已清除");
});
