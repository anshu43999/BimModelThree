import {FragmentsModels} from "@thatopen/fragments";
import {loadModelManifest, normalizeManifest} from "./manifest-loader.js";

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function stableModelId(value) {
    return `model-${String(value || "default")
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "default"}`;
}

async function fetchArrayBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Model fetch failed: HTTP ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
}

export class BimViewerApp extends EventTarget {
    static async create(options) {
        const app = new BimViewerApp(options);
        await app.init();
        return app;
    }

    constructor(options = {}) {
        super();
        this.scene = options.scene;
        this.camera = options.camera;
        this.workerUrl = options.workerUrl;
        this.maxWorkers = options.maxWorkers || Math.max(2, Math.min(4, navigator.hardwareConcurrency || 4));
        this.fragments = null;
        this.currentModel = null;
        this.currentManifest = null;
        this.models = new Map();
        this.manifests = new Map();
    }

    async init() {
        if (!this.scene || !this.camera) {
            throw new Error("BimViewerApp requires scene and camera");
        }
        if (!this.workerUrl) {
            throw new Error("BimViewerApp requires workerUrl");
        }
        this.fragments = new FragmentsModels(this.workerUrl, {
            maxWorkers: this.maxWorkers
        });
        this.fragments.settings.graphicsQuality = 1;
        this.fragments.settings.autoCoordinate = true;
        return this;
    }

    getStableModelId(name, manifest, requestedModelId = null) {
        const baseId = requestedModelId || manifest?.modelVersionId || manifest?.modelId || stableModelId(name);
        let modelId = baseId;
        let index = 2;
        while (this.models.has(modelId)) {
            modelId = `${baseId}-${index}`;
            index += 1;
        }
        return modelId;
    }

    async openModel(options = {}) {
        const started = performance.now();
        let manifest = null;
        let buffer = null;
        let name = options.name || "model.frag";

        if (options.manifestUrl) {
            manifest = await loadModelManifest(options.manifestUrl);
        } else if (options.manifest) {
            manifest = normalizeManifest(options.manifest, options.manifestBaseUrl);
        }

        if (options.file) {
            buffer = await options.file.arrayBuffer();
            name = options.file.name;
        } else if (options.buffer) {
            buffer = options.buffer;
        } else if (manifest) {
            buffer = await fetchArrayBuffer(manifest.resources.fragments.url);
            name = manifest.displayName || manifest.resources.fragments.url.split("/").pop() || name;
        } else if (options.fragUrl) {
            buffer = await fetchArrayBuffer(options.fragUrl);
            name = options.fragUrl.split("/").pop() || name;
        } else {
            throw new Error("openModel requires manifestUrl, manifest, fragUrl, file, or buffer");
        }

        if (options.disposeExisting !== false) {
            await this.disposeModel();
        }

        const byteLength = buffer.byteLength ?? buffer.length ?? 0;
        const modelId = this.getStableModelId(name, manifest, options.modelId);
        this.dispatchEvent(new CustomEvent("loadstart", {
            detail: {name, modelId, manifest, sizeMB: mb(byteLength)}
        }));

        const model = await this.fragments.load(buffer, {
            modelId,
            camera: this.camera,
            onProgress: (event) => {
                this.dispatchEvent(new CustomEvent("progress", {detail: event}));
            }
        });

        this.models.set(modelId, model);
        this.manifests.set(modelId, manifest);
        if (options.setCurrent !== false) {
            this.currentModel = model;
            this.currentManifest = manifest;
        }
        this.scene.add(model.object);
        await this.fragments.update(true);

        this.dispatchEvent(new CustomEvent("loaded", {
            detail: {
                name,
                modelId,
                manifest,
                model,
                seconds: Number(((performance.now() - started) / 1000).toFixed(2))
            }
        }));

        return {
            model,
            manifest,
            name,
            modelId
        };
    }

    async disposeModel(modelId = null) {
        const targetModelId = modelId || this.currentModel?.modelId;
        if (!targetModelId) {
            return;
        }

        const model = this.models.get(targetModelId);
        if (!model) {
            return;
        }
        this.scene.remove(model.object);
        await this.fragments.disposeModel(targetModelId);
        this.models.delete(targetModelId);
        this.manifests.delete(targetModelId);
        if (this.currentModel?.modelId === targetModelId) {
            this.currentModel = null;
            this.currentManifest = null;
        }
        this.dispatchEvent(new CustomEvent("disposed", {
            detail: {modelId: targetModelId}
        }));
    }

    async disposeAllModels() {
        const modelIds = [...this.models.keys()];
        for (const modelId of modelIds) {
            await this.disposeModel(modelId);
        }
    }

    async update(force = false) {
        if (!this.fragments) {
            return;
        }
        await this.fragments.update(force);
    }

    getCurrentModel() {
        return this.currentModel;
    }

    getManifest() {
        return this.currentManifest;
    }
}
