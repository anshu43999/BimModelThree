import {createViewer, byId, setText} from "./common-viewer.js";

const sdk = await createViewer();

function formatTime(ms) {
    return `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)}s`;
}

function renderRoutes() {
    const state = sdk.listPathRoamRoutes();
    const select = byId("routeSelect");
    select.textContent = "";
    for (const route of state.routes) {
        const option = document.createElement("option");
        option.value = route.id;
        option.textContent = `${route.name} (${route.pointCount})`;
        option.selected = route.id === state.activeRouteId;
        select.append(option);
    }
    const active = state.routes.find((route) => route.id === state.activeRouteId);
    byId("routeNameInput").value = active?.name || "";
    byId("deleteRouteBtn").disabled = state.routes.length <= 1;
}

function renderPoints() {
    const result = sdk.listPathRoamPoints();
    const list = byId("pointList");
    list.textContent = "";
    if (!result.points.length) {
        const empty = document.createElement("div");
        empty.className = "miniEmpty";
        empty.textContent = "暂无漫游点";
        list.append(empty);
        return;
    }
    result.points.forEach((point, index) => {
        const item = document.createElement("div");
        item.className = "miniItem";
        const title = document.createElement("div");
        title.className = "miniItemTitle";
        title.textContent = `${index + 1}. ${point.name}`;
        const meta = document.createElement("div");
        meta.className = "miniItemMeta";
        meta.textContent = `时间 ${formatTime(point.time)}`;
        const actions = document.createElement("div");
        actions.className = "miniItemActions";
        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = "定位";
        restore.addEventListener("click", () => sdk.restorePathRoamPoint(point.id));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "删除";
        remove.addEventListener("click", () => {
            sdk.deletePathRoamPoint(point.id);
            renderAll();
        });
        actions.append(restore, remove);
        item.append(title, meta, actions);
        list.append(item);
    });
}

function syncPlayback() {
    const state = sdk.getPathRoamMode();
    const ctrlLook = sdk.getCtrlLookMode();
    byId("playBtn").disabled = state.pointCount < 2 || state.playing;
    byId("pauseBtn").disabled = !state.playing;
    byId("stopBtn").disabled = !state.playing && !state.paused;
    byId("speedInput").value = String(state.speedMultiplier);
    byId("speedValue").textContent = `${state.speedMultiplier}x`;
    setText("status", ctrlLook.active
        ? "原地转向中：相机位置保持不变"
        : state.playing
        ? `正在播放 ${formatTime(state.elapsedMs)} / ${formatTime(state.totalMs)}`
        : state.paused
            ? `已暂停 ${formatTime(state.elapsedMs)} / ${formatTime(state.totalMs)}`
            : `${state.activeRouteName || "当前路线"} · ${state.pointCount} 个点位`);
}

function renderAll() {
    renderRoutes();
    renderPoints();
    syncPlayback();
}

byId("routeSelect").addEventListener("change", (event) => {
    sdk.switchPathRoamRoute(event.target.value);
    renderAll();
});

byId("newRouteBtn").addEventListener("click", () => {
    sdk.createPathRoamRoute({name: `路线 ${sdk.listPathRoamRoutes().routes.length + 1}`});
    renderAll();
});

byId("saveRouteBtn").addEventListener("click", () => {
    sdk.savePathRoamRoute({name: byId("routeNameInput").value});
    renderAll();
});

byId("deleteRouteBtn").addEventListener("click", () => {
    sdk.deletePathRoamRoute(byId("routeSelect").value);
    renderAll();
});

byId("addPointBtn").addEventListener("click", () => {
    const point = sdk.addPathRoamPoint();
    setText("status", point ? `已添加：${point.name}` : "添加点位失败");
    renderAll();
});

byId("playBtn").addEventListener("click", () => sdk.playPathRoam());
byId("pauseBtn").addEventListener("click", () => sdk.pausePathRoam());
byId("stopBtn").addEventListener("click", () => sdk.stopPathRoam());
byId("clearBtn").addEventListener("click", () => {
    sdk.clearPathRoam();
    renderAll();
});
byId("speedInput").addEventListener("input", (event) => {
    sdk.setPathRoamSpeedMultiplier(event.target.value);
    syncPlayback();
});

sdk.addEventListener("pathroamchange", renderAll);
sdk.addEventListener("ctrllookchange", (event) => {
    if (event.detail?.ctrlLook?.active) {
        setText("status", "原地转向中：相机位置保持不变");
    } else {
        syncPlayback();
    }
});
window.setInterval(syncPlayback, 250);
renderAll();
