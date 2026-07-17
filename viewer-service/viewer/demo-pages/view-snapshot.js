import {createViewer, byId, setText} from "./common-viewer.js";

const sdk = await createViewer();
let savedView = null;

byId("saveViewBtn").addEventListener("click", () => {
    savedView = sdk.captureViewpoint({includeSelection: true});
    setText("status", "视点已保存");
});

byId("restoreViewBtn").addEventListener("click", () => {
    if (!savedView) {
        setText("status", "还没有保存视点");
        return;
    }
    sdk.restoreViewpoint(savedView);
    setText("status", "视点已恢复");
});

byId("snapshotBtn").addEventListener("click", async () => {
    const button = byId("snapshotBtn");
    button.disabled = true;
    setText("status", "正在生成快照");
    try {
        const result = await sdk.takeSnapshot({download: true});
        setText("status", `快照已下载：${result.filename}`);
    } catch (error) {
        setText("status", `快照失败：${error.message || error}`);
    } finally {
        button.disabled = false;
    }
});
