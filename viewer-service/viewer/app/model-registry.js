export const MODEL_ROLES = Object.freeze({
    PRIMARY: "primary",
    MANAGED: "managed",
    COMPARE: "compare"
});

export const MODEL_LIFECYCLE = Object.freeze({
    LOADED: "loaded",
    DISPOSING: "disposing",
    DISPOSED: "disposed"
});

const VALID_MODEL_ROLES = new Set(Object.values(MODEL_ROLES));
const EXCLUSIVE_MODEL_ROLES = new Set([
    MODEL_ROLES.PRIMARY,
    MODEL_ROLES.COMPARE
]);

function normalizeModelId(entry) {
    return String(entry?.modelId || entry?.model?.modelId || "").trim();
}

function normalizeRole(role, fallback = MODEL_ROLES.MANAGED) {
    return VALID_MODEL_ROLES.has(role) ? role : fallback;
}

function isUsableBounds(bounds) {
    return Boolean(bounds)
        && typeof bounds.clone === "function"
        && typeof bounds.isEmpty === "function"
        && !bounds.isEmpty();
}

function cloneBounds(bounds) {
    return isUsableBounds(bounds) ? bounds.clone() : null;
}

function serializeBounds(bounds) {
    if (!isUsableBounds(bounds) || !bounds.min || !bounds.max) {
        return null;
    }
    return [
        Number(bounds.min.x),
        Number(bounds.min.y),
        Number(bounds.min.z),
        Number(bounds.max.x),
        Number(bounds.max.y),
        Number(bounds.max.z)
    ];
}

function cloneTransform(transform) {
    if (!transform || typeof transform !== "object") {
        return null;
    }
    return {
        position: Array.isArray(transform.position) ? transform.position.map(Number) : [0, 0, 0],
        rotation: Array.isArray(transform.rotation) ? transform.rotation.map(Number) : [0, 0, 0],
        scale: Array.isArray(transform.scale) ? transform.scale.map(Number) : [1, 1, 1]
    };
}

/** Tracks every loaded model and its standardized viewer role. */
export class ModelRegistry extends EventTarget {
    constructor() {
        super();
        this.entries = new Map();
    }

    register(entry, options = {}) {
        const modelId = normalizeModelId(entry);
        if (!modelId) {
            throw new Error("ModelRegistry.register requires modelId");
        }
        const previous = this.entries.get(modelId) || null;
        const record = previous || entry;
        if (previous && previous !== entry) {
            Object.assign(record, entry);
        }
        const role = normalizeRole(options.role || entry.role || previous?.role);
        record.modelId = modelId;
        record.role = role;
        record.assembly = options.assembly ?? previous?.assembly ?? entry.assembly ?? false;
        record.lifecycle = options.lifecycle || (
            previous?.lifecycle === MODEL_LIFECYCLE.DISPOSED
                ? MODEL_LIFECYCLE.LOADED
                : previous?.lifecycle || entry.lifecycle || MODEL_LIFECYCLE.LOADED
        );
        record.registeredAt = previous?.registeredAt || entry.registeredAt || new Date().toISOString();
        record.updatedAt = new Date().toISOString();
        this.entries.set(modelId, record);
        const roleChanges = this.applyExclusiveRole(modelId, role);
        this.emitChange("register", {
            modelId,
            role,
            roleChanges,
            source: options.source || "unknown"
        }, options);
        return record;
    }

    setRole(modelId, role, options = {}) {
        const entry = this.get(modelId);
        if (!entry) {
            return null;
        }
        const nextRole = normalizeRole(role, entry.role);
        const previousRole = entry.role;
        entry.role = nextRole;
        entry.updatedAt = new Date().toISOString();
        const roleChanges = this.applyExclusiveRole(entry.modelId, nextRole);
        if (previousRole !== nextRole) {
            roleChanges.push({
                modelId: entry.modelId,
                previousRole,
                role: nextRole
            });
        }
        if (roleChanges.length) {
            this.emitChange("role", {
                modelId: entry.modelId,
                previousRole,
                role: nextRole,
                roleChanges,
                source: options.source || "unknown"
            }, options);
        }
        return entry;
    }

    setPrimary(modelId, options = {}) {
        return this.setRole(modelId, MODEL_ROLES.PRIMARY, options);
    }

    update(modelId, patch = {}, options = {}) {
        const entry = this.get(modelId);
        if (!entry) {
            return null;
        }
        const {modelId: ignoredModelId, role, ...values} = patch || {};
        Object.assign(entry, values);
        entry.updatedAt = new Date().toISOString();
        if (role) {
            return this.setRole(modelId, role, options);
        }
        this.emitChange("update", {
            modelId: entry.modelId,
            source: options.source || "unknown"
        }, options);
        return entry;
    }

    setBounds(modelId, bounds = {}, options = {}) {
        const entry = this.get(modelId);
        if (!entry) {
            return null;
        }
        const originalBounds = cloneBounds(bounds.originalBounds ?? bounds.originalBox);
        const localBounds = cloneBounds(bounds.localBounds ?? bounds.localBox);
        const currentBounds = cloneBounds(bounds.currentBounds ?? bounds.box);
        if (originalBounds) {
            entry.originalBounds = originalBounds;
            entry.originalBox = originalBounds.clone();
        }
        if (localBounds) {
            entry.localBounds = localBounds;
            entry.localBox = localBounds.clone();
        }
        if (currentBounds) {
            entry.currentBounds = currentBounds;
            entry.box = currentBounds.clone();
        }
        entry.updatedAt = new Date().toISOString();
        this.emitChange("bounds", {
            modelId: entry.modelId,
            source: options.source || "unknown"
        }, options);
        return entry;
    }

    setTransform(modelId, transform, options = {}) {
        const entry = this.get(modelId);
        const value = cloneTransform(transform);
        if (!entry || !value) {
            return null;
        }
        const kind = ["initial", "overlay"].includes(options.kind) ? options.kind : "current";
        entry.transforms = entry.transforms || {};
        entry.transforms[kind] = value;
        entry[`${kind}Transform`] = cloneTransform(value);
        entry.updatedAt = new Date().toISOString();
        this.emitChange("transform", {
            modelId: entry.modelId,
            kind,
            source: options.source || "unknown"
        }, options);
        return cloneTransform(value);
    }

    getTransform(modelId, kind = "current") {
        const entry = this.get(modelId);
        if (!entry) {
            return null;
        }
        const normalizedKind = ["initial", "overlay"].includes(kind) ? kind : "current";
        return cloneTransform(entry.transforms?.[normalizedKind] || entry[`${normalizedKind}Transform`]);
    }

    setLayer(modelId, layer, options = {}) {
        const entry = this.get(modelId);
        const value = Number(layer);
        if (!entry || !Number.isInteger(value) || value < 0) {
            return null;
        }
        entry.layer = value;
        entry.updatedAt = new Date().toISOString();
        this.emitChange("layer", {
            modelId: entry.modelId,
            layer: value,
            source: options.source || "unknown"
        }, options);
        return value;
    }

    beginDispose(modelId, options = {}) {
        const entry = this.get(modelId);
        if (!entry || entry.lifecycle === MODEL_LIFECYCLE.DISPOSING || entry.lifecycle === MODEL_LIFECYCLE.DISPOSED) {
            return {entry, started: false};
        }
        entry.lifecycle = MODEL_LIFECYCLE.DISPOSING;
        entry.updatedAt = new Date().toISOString();
        this.emitChange("dispose-start", {
            modelId: entry.modelId,
            role: entry.role,
            source: options.source || "unknown"
        }, options);
        return {entry, started: true};
    }

    completeDispose(modelId, options = {}) {
        const entry = this.get(modelId);
        if (!entry) {
            return null;
        }
        entry.lifecycle = MODEL_LIFECYCLE.DISPOSED;
        entry.updatedAt = new Date().toISOString();
        if (options.unregister !== false) {
            this.entries.delete(entry.modelId);
        }
        this.emitChange("dispose-complete", {
            modelId: entry.modelId,
            role: entry.role,
            unregistered: options.unregister !== false,
            source: options.source || "unknown"
        }, options);
        return entry;
    }

    failDispose(modelId, error = null, options = {}) {
        const entry = this.get(modelId);
        if (!entry) {
            return null;
        }
        entry.lifecycle = MODEL_LIFECYCLE.LOADED;
        entry.updatedAt = new Date().toISOString();
        this.emitChange("dispose-failed", {
            modelId: entry.modelId,
            role: entry.role,
            message: error?.message || String(error || ""),
            source: options.source || "unknown"
        }, options);
        return entry;
    }

    getBounds(modelId, kind = "current") {
        const entry = this.get(modelId);
        if (!entry) {
            return null;
        }
        if (kind === "original") {
            return cloneBounds(entry.originalBounds || entry.originalBox);
        }
        if (kind === "local") {
            return cloneBounds(entry.localBounds || entry.localBox);
        }
        return cloneBounds(entry.currentBounds || entry.box || entry.model?.box);
    }

    getCombinedBounds(options = {}) {
        const modelIds = options.modelIds ? new Set(options.modelIds.map(String)) : null;
        const roles = options.roles ? new Set(options.roles) : null;
        const kind = options.kind || "current";
        let combined = null;
        for (const entry of this.entries.values()) {
            if (modelIds && !modelIds.has(entry.modelId)) {
                continue;
            }
            if (roles && !roles.has(entry.role)) {
                continue;
            }
            if (options.visibleOnly !== false && entry.visible === false) {
                continue;
            }
            const bounds = this.getBounds(entry.modelId, kind);
            if (!bounds) {
                continue;
            }
            if (!combined) {
                combined = bounds;
            } else if (typeof combined.union === "function") {
                combined.union(bounds);
            }
        }
        return combined;
    }

    unregister(modelId, options = {}) {
        const key = String(modelId || "").trim();
        const entry = this.entries.get(key) || null;
        if (!entry) {
            return null;
        }
        this.entries.delete(key);
        this.emitChange("unregister", {
            modelId: key,
            role: entry.role,
            source: options.source || "unknown"
        }, options);
        return entry;
    }

    clear(options = {}) {
        const modelIds = [...this.entries.keys()];
        if (!modelIds.length) {
            return [];
        }
        this.entries.clear();
        this.emitChange("clear", {
            modelIds,
            source: options.source || "unknown"
        }, options);
        return modelIds;
    }

    get(modelId) {
        return this.entries.get(String(modelId || "").trim()) || null;
    }

    has(modelId) {
        return this.entries.has(String(modelId || "").trim());
    }

    getByRole(role) {
        const targetRole = normalizeRole(role);
        return [...this.entries.values()].filter((entry) => entry.role === targetRole);
    }

    list(options = {}) {
        const roles = options.roles ? new Set(options.roles) : null;
        return [...this.entries.values()].filter((entry) => {
            if (options.assembly !== undefined && entry.assembly !== options.assembly) {
                return false;
            }
            if (roles && !roles.has(entry.role)) {
                return false;
            }
            if (options.includeDisposing === false && entry.lifecycle === MODEL_LIFECYCLE.DISPOSING) {
                return false;
            }
            return true;
        });
    }

    getPrimary() {
        return this.getByRole(MODEL_ROLES.PRIMARY)[0] || null;
    }

    getCompare() {
        return this.getByRole(MODEL_ROLES.COMPARE)[0] || null;
    }

    getState() {
        const models = [...this.entries.values()].map((entry) => ({
            modelId: entry.modelId,
            role: entry.role,
            name: entry.name || entry.model?.modelId || entry.modelId,
            visible: entry.visible !== false,
            assembly: entry.assembly === true,
            lifecycle: entry.lifecycle || MODEL_LIFECYCLE.LOADED,
            layer: Number.isInteger(entry.layer) ? entry.layer : 0,
            transform: this.getTransform(entry.modelId, "current"),
            source: entry.source || null,
            loadedAt: entry.loadedAt || entry.registeredAt || null,
            bounds: serializeBounds(entry.currentBounds || entry.box || entry.model?.box)
        }));
        return {
            count: models.length,
            primaryModelId: models.find((entry) => entry.role === MODEL_ROLES.PRIMARY)?.modelId || null,
            compareModelId: models.find((entry) => entry.role === MODEL_ROLES.COMPARE)?.modelId || null,
            models
        };
    }

    applyExclusiveRole(modelId, role) {
        if (!EXCLUSIVE_MODEL_ROLES.has(role)) {
            return [];
        }
        const changes = [];
        for (const entry of this.entries.values()) {
            if (entry.modelId === modelId || entry.role !== role) {
                continue;
            }
            const previousRole = entry.role;
            entry.role = MODEL_ROLES.MANAGED;
            entry.updatedAt = new Date().toISOString();
            changes.push({
                modelId: entry.modelId,
                previousRole,
                role: entry.role
            });
        }
        return changes;
    }

    emitChange(action, detail, options = {}) {
        if (options.dispatch === false) {
            return;
        }
        this.dispatchEvent(new CustomEvent("registrychange", {
            detail: {
                action,
                ...detail,
                state: this.getState()
            }
        }));
    }
}
