import {BimViewerSDK} from "../sdk/index.js";

export const DEFAULT_MANIFEST = "/converted/manifest.json";

export function byId(id) {
    return document.getElementById(id);
}

export function setText(id, text) {
    const element = byId(id);
    if (element) {
        element.textContent = text;
    }
}

export async function createViewer(options = {}) {
    const canvas = options.canvas || byId("viewerCanvas");
    const statusId = options.statusId || "status";
    setText(statusId, "初始化 Viewer...");
    const sdk = await BimViewerSDK.create({
        canvas,
        fitOnLoad: options.fitOnLoad !== false
    });
    sdk.addEventListener("progress", (event) => {
        const value = event.detail?.progress ?? event.detail?.loaded ?? "";
        setText(statusId, value === "" ? "模型加载中..." : `模型加载中 ${value}`);
    });
    sdk.addEventListener("selectionchanged", (event) => {
        options.onSelectionChanged?.(event.detail);
    });
    const manifestUrl = options.manifestUrl || new URLSearchParams(location.search).get("manifest") || DEFAULT_MANIFEST;
    if (options.autoLoad !== false) {
        try {
            await openDefaultModel(sdk, manifestUrl, statusId);
        } catch (error) {
            setText(statusId, `加载失败：${error.message || error}`);
            throw error;
        }
    } else {
        setText(statusId, "Viewer ready");
    }
    window.addEventListener("resize", () => sdk.resize());
    return sdk;
}

export async function openDefaultModel(sdk, manifestUrl = DEFAULT_MANIFEST, statusId = "status") {
    setText(statusId, `加载 ${manifestUrl}`);
    const result = await sdk.openModel({manifestUrl});
    setText(statusId, `已加载：${result.state?.modelName || result.name || result.modelId}`);
    return result;
}

export function flattenTree(root, limit = 80) {
    const result = [];
    const stack = root ? [root] : [];
    while (stack.length && result.length < limit) {
        const node = stack.shift();
        result.push(node);
        const children = Array.isArray(node.children) ? node.children : [];
        for (const child of children) {
            stack.push(child);
        }
    }
    return result;
}

export function collectLocalIds(node, limit = 200) {
    const ids = [];
    const stack = node ? [node] : [];
    while (stack.length && ids.length < limit) {
        const current = stack.pop();
        if (typeof current.localId === "number") {
            ids.push(current.localId);
        }
        if (Array.isArray(current.localIds)) {
            for (const id of current.localIds) {
                if (typeof id === "number") {
                    ids.push(id);
                }
            }
        }
        const children = Array.isArray(current.children) ? current.children : [];
        for (const child of children) {
            stack.push(child);
        }
    }
    return [...new Set(ids)];
}

export function nodeTitle(node) {
    return node?.name
        || node?.label
        || node?.entityName
        || node?.category
        || (typeof node?.localId === "number" ? `localId ${node.localId}` : "节点");
}

export function projectToOverlay(sdk, position, overlay) {
    const vector = position?.clone ? position.clone() : null;
    if (!vector || !overlay) {
        return null;
    }
    const camera = sdk.renderEngine.camera;
    const canvas = sdk.canvas;
    camera.updateMatrixWorld();
    const projected = vector.project(camera);
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1) {
        return null;
    }
    const rect = canvas.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
        x: rect.left - overlayRect.left + ((projected.x + 1) / 2) * rect.width,
        y: rect.top - overlayRect.top + ((1 - projected.y) / 2) * rect.height
    };
}
