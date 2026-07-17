import {createViewer, openDefaultModel, DEFAULT_MANIFEST, byId, setText} from "./common-viewer.js";

let sdk = await createViewer();

byId("reloadBtn").addEventListener("click", async () => {
    const button = byId("reloadBtn");
    button.disabled = true;
    try {
        await sdk.closeModel();
        await openDefaultModel(sdk, DEFAULT_MANIFEST);
    } catch (error) {
        setText("status", `加载失败：${error.message || error}`);
    } finally {
        button.disabled = false;
    }
});

byId("fitBtn").addEventListener("click", () => {
    sdk.fitModel();
    setText("status", "已适配模型范围");
});

byId("isoBtn").addEventListener("click", () => {
    sdk.setView("iso");
    setText("status", "已切换等轴视图");
});
