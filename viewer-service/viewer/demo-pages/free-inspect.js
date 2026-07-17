import {createViewer, byId, setText} from "./common-viewer.js";

const sdk = await createViewer();

function syncInspectState(state = sdk.getFreeInspectMode()) {
    byId("toggleInspectBtn").textContent = state.enabled ? "关闭巡检" : "开启巡检";
    byId("toggleInspectBtn").classList.toggle("active", state.enabled);
    byId("speedInput").value = String(state.speedMultiplier ?? 0.2);
    byId("speedValue").textContent = `${Number(state.speedMultiplier ?? 0.2).toFixed(2).replace(/0$/, "")}x`;
    setText("status", state.enabled
        ? `巡检已开启，当前移动速度 ${Number(state.speed).toFixed(2)}`
        : "巡检已关闭");
}

byId("toggleInspectBtn").addEventListener("click", () => {
    syncInspectState(sdk.toggleFreeInspectMode());
    byId("viewerCanvas").focus();
});

byId("speedInput").addEventListener("input", (event) => {
    syncInspectState(sdk.setFreeInspectSpeedMultiplier(event.target.value));
});

byId("fitBtn").addEventListener("click", () => {
    sdk.fitModel();
    setText("status", "已适配模型范围");
});

byId("isoBtn").addEventListener("click", () => {
    sdk.setView("iso");
    setText("status", "已切换等轴视图");
});

sdk.addEventListener("freeinspectchange", (event) => {
    syncInspectState(event.detail?.freeInspect);
});

sdk.addEventListener("ctrllookchange", (event) => {
    if (event.detail?.ctrlLook?.active) {
        setText("status", "原地转向中：相机位置保持不变");
    } else {
        syncInspectState();
    }
});

syncInspectState();
