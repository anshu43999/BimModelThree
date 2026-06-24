import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {FragmentsModels} from "@thatopen/fragments";

const canvas = document.getElementById("viewerCanvas");
const fileInput = document.getElementById("fragFile");
const urlInput = document.getElementById("fragUrl");
const loadUrlBtn = document.getElementById("loadUrlBtn");
const fitBtn = document.getElementById("fitBtn");
const disposeBtn = document.getElementById("disposeBtn");
const statusEl = document.getElementById("status");
const fileStat = document.getElementById("fileStat");
const loadStat = document.getElementById("loadStat");
const modelStat = document.getElementById("modelStat");
const logEl = document.getElementById("log");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0f11);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100000);
camera.position.set(18, 14, 18);

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const ambient = new THREE.HemisphereLight(0xffffff, 0x2d3438, 2.2);
scene.add(ambient);

const light = new THREE.DirectionalLight(0xffffff, 1.5);
light.position.set(20, 30, 15);
scene.add(light);

const grid = new THREE.GridHelper(80, 40, 0x3b474f, 0x20272d);
grid.position.y = -0.01;
scene.add(grid);

let fragments;
let currentModel = null;
let updatePending = false;

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function seconds(started) {
    return Number(((performance.now() - started) / 1000).toFixed(2));
}

function log(message, data) {
    const time = new Date().toLocaleTimeString();
    const line = data === undefined ? `[${time}] ${message}` : `[${time}] ${message} ${JSON.stringify(data)}`;
    logEl.textContent += `${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log(message, data ?? "");
}

function setStatus(value) {
    statusEl.textContent = value;
}

function setBusy(busy) {
    fileInput.disabled = busy;
    loadUrlBtn.disabled = busy;
    fitBtn.disabled = busy || !currentModel;
    disposeBtn.disabled = busy || !currentModel;
}

async function ensureFragments() {
    if (fragments) {
        return fragments;
    }

    const workerURL = new URL("../node_modules/@thatopen/fragments/dist/Worker/worker.mjs", window.location.href).href;
    fragments = new FragmentsModels(workerURL, {
        maxWorkers: Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4))
    });
    fragments.settings.graphicsQuality = 1;
    fragments.settings.autoCoordinate = true;
    return fragments;
}

async function disposeCurrentModel() {
    if (!currentModel || !fragments) {
        return;
    }

    const modelId = currentModel.modelId;
    await fragments.disposeModel(modelId);
    currentModel = null;
    modelStat.textContent = "-";
    fitBtn.disabled = true;
    disposeBtn.disabled = true;
    log("Model disposed", {modelId});
}

async function loadFragmentsBuffer(buffer, name) {
    setBusy(true);
    setStatus("Loading");
    logEl.textContent = "";
    fileStat.textContent = `${name} (${mb(buffer.byteLength)} MB)`;
    loadStat.textContent = "-";
    modelStat.textContent = "-";

    const started = performance.now();

    try {
        await disposeCurrentModel();
        const manager = await ensureFragments();
        const modelId = `model-${Date.now()}`;

        log("Fragments load start", {
            name,
            sizeMB: mb(buffer.byteLength),
            modelId
        });

        currentModel = await manager.load(buffer, {
            modelId,
            camera,
            onProgress: (event) => {
                log("Fragments load progress", event);
            }
        });

        scene.add(currentModel.object);
        await manager.update(true);
        fitCurrentModel();

        loadStat.textContent = `${seconds(started)}s`;
        modelStat.textContent = currentModel.modelId;
        setStatus("Loaded");
        log("Fragments load complete", {
            seconds: seconds(started),
            box: boxToArray(currentModel.box)
        });
    } catch (error) {
        setStatus("Failed");
        log("Fragments load failed", {
            message: String(error && error.message ? error.message : error)
        });
        console.error(error);
    } finally {
        setBusy(false);
    }
}

function boxToArray(box) {
    if (!box || box.isEmpty()) {
        return null;
    }
    return [
        Number(box.min.x.toFixed(3)),
        Number(box.min.y.toFixed(3)),
        Number(box.min.z.toFixed(3)),
        Number(box.max.x.toFixed(3)),
        Number(box.max.y.toFixed(3)),
        Number(box.max.z.toFixed(3))
    ];
}

function fitCurrentModel() {
    if (!currentModel) {
        return;
    }

    const box = currentModel.box && !currentModel.box.isEmpty()
        ? currentModel.box.clone()
        : new THREE.Box3().setFromObject(currentModel.object);

    if (!box || box.isEmpty()) {
        log("Fit skipped: empty model box");
        return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) || 10;
    const distance = radius * 1.4;

    controls.target.copy(center);
    camera.position.set(
        center.x + distance,
        center.y + distance * 0.75,
        center.z + distance
    );
    camera.near = Math.max(distance / 1000, 0.1);
    camera.far = Math.max(distance * 10, 1000);
    camera.updateProjectionMatrix();
    controls.update();
    scheduleFragmentsUpdate();
}

function scheduleFragmentsUpdate() {
    if (!fragments || updatePending) {
        return;
    }
    updatePending = true;
    requestAnimationFrame(async () => {
        updatePending = false;
        try {
            await fragments.update();
        } catch (error) {
            console.warn(error);
        }
    });
}

function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    scheduleFragmentsUpdate();
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
        return;
    }
    const buffer = await file.arrayBuffer();
    await loadFragmentsBuffer(buffer, file.name);
});

loadUrlBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) {
        return;
    }

    setBusy(true);
    setStatus("Fetching");
    try {
        const started = performance.now();
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        log("Fragments fetch complete", {
            url,
            seconds: seconds(started),
            sizeMB: mb(buffer.byteLength)
        });
        await loadFragmentsBuffer(buffer, url.split("/").pop() || "model.frag");
    } catch (error) {
        setStatus("Failed");
        log("Fragments fetch failed", {
            message: String(error && error.message ? error.message : error)
        });
    } finally {
        setBusy(false);
    }
});

fitBtn.addEventListener("click", fitCurrentModel);
disposeBtn.addEventListener("click", disposeCurrentModel);
controls.addEventListener("change", scheduleFragmentsUpdate);
window.addEventListener("resize", resize);

resize();
animate();
log("Viewer ready");
