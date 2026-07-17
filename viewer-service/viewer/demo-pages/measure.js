import {createViewer, byId, setText} from "./common-viewer.js";
import {MeasurementEngine} from "../engines/measurement-engine.js";

const sdk = await createViewer();
const overlay = byId("measureOverlay");
const snapMarker = document.createElement("div");
snapMarker.className = "snapMarker";
snapMarker.hidden = true;
overlay.appendChild(snapMarker);

let pointerStart = null;

const measurementEngine = new MeasurementEngine({
    model: sdk.currentModel,
    camera: sdk.renderEngine.camera,
    canvas: sdk.canvas,
    scene: sdk.renderEngine.scene,
    overlay,
    onChange: syncMeasureInfo,
    onMeasure(measurement) {
        setText("measureInfo", `距离：${measurement.text}`);
    },
    onError(error) {
        setText("status", `测量失败：${error?.message || error}`);
    }
});
measurementEngine.setEnabled(true);

sdk.renderEngine.controls.addEventListener("change", () => {
    measurementEngine.updateLabels();
    updateSnapMarker(measurementEngine.getState().preview);
});

function clearMeasure() {
    measurementEngine.clear();
    hideSnapMarker();
    sdk.viewerApp.update(true);
    setText("measureInfo", "请选择第一个点");
}

sdk.canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
        return;
    }
    pointerStart = {
        x: event.clientX,
        y: event.clientY
    };
});

sdk.canvas.addEventListener("pointercancel", () => {
    pointerStart = null;
});

sdk.canvas.addEventListener("pointermove", async (event) => {
    const pick = await measurementEngine.handlePointerMove(event.clientX, event.clientY);
    updateSnapMarker(pick);
});

sdk.canvas.addEventListener("pointerup", async (event) => {
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

    setText("status", "正在捕捉测量点...");
    const result = await measurementEngine.handleClick(event.clientX, event.clientY);
    if (!result) {
        setText("status", "未捕捉到测量点");
        return;
    }
    setText("status", "测量点已捕捉");
    sdk.viewerApp.update(true);
});

byId("clearBtn").addEventListener("click", clearMeasure);

function syncMeasureInfo(state, reason) {
    if (reason === "measure" && state.measurements.length) {
        const latest = state.measurements[state.measurements.length - 1];
        setText("measureInfo", `距离：${latest.text}`);
        return;
    }
    if (state.pendingStart) {
        setText("measureInfo", "已选择第一个点，请选择第二个点");
        return;
    }
    if (state.count > 0) {
        setText("measureInfo", `已完成 ${state.count} 条测量，继续选择第一个点`);
        return;
    }
    setText("measureInfo", "请选择第一个点");
}

function updateSnapMarker(pick) {
    if (!pick?.point) {
        hideSnapMarker();
        return;
    }

    const [x, y, z] = pick.point;
    const projected = projectPoint({x, y, z});
    if (!projected) {
        hideSnapMarker();
        return;
    }

    snapMarker.style.left = `${projected.x}px`;
    snapMarker.style.top = `${projected.y}px`;
    snapMarker.hidden = false;
}

function hideSnapMarker() {
    snapMarker.hidden = true;
}

function projectPoint(point) {
    const vector = sdk.renderEngine.camera.position.clone();
    vector.set(point.x, point.y, point.z);
    sdk.renderEngine.camera.updateMatrixWorld();
    vector.project(sdk.renderEngine.camera);
    if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || vector.z < -1 || vector.z > 1) {
        return null;
    }
    const canvasRect = sdk.canvas.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
        x: canvasRect.left - overlayRect.left + ((vector.x + 1) / 2) * canvasRect.width,
        y: canvasRect.top - overlayRect.top + ((1 - vector.y) / 2) * canvasRect.height
    };
}
