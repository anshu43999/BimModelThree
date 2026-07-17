import * as THREE from "../../node_modules/three/build/three.module.js";
import {SectionEngine} from "../engines/section-engine.js";
import {createViewer, byId, setText} from "./common-viewer.js";

const sdk = await createViewer();
const section = new SectionEngine({
    renderer: sdk.renderEngine.renderer,
    scene: sdk.renderEngine.scene,
    camera: sdk.renderEngine.camera
});
let enabled = false;

function step() {
    const box = sdk.currentModel?.box;
    if (!box || box.isEmpty()) {
        return 1;
    }
    const size = box.getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z, 1) / 40;
}

function update() {
    sdk.viewerApp.update(true);
    setText("status", JSON.stringify(section.getState()));
}

byId("enableBtn").addEventListener("click", () => {
    enabled = !enabled;
    section.setAxis(byId("axisSelect").value);
    section.setEnabled(enabled);
    byId("enableBtn").textContent = enabled ? "关闭剖切" : "开启剖切";
    update();
});

byId("axisSelect").addEventListener("change", () => {
    section.setAxis(byId("axisSelect").value);
    update();
});

byId("minusBtn").addEventListener("click", () => {
    section.move(-step());
    update();
});

byId("plusBtn").addEventListener("click", () => {
    section.move(step());
    update();
});

byId("clearBtn").addEventListener("click", () => {
    enabled = false;
    section.clear();
    byId("enableBtn").textContent = "开启剖切";
    update();
});
