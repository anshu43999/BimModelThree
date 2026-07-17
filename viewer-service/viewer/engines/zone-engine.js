import * as THREE from "three";

const DEFAULT_PALETTE = [
    0x5fb3ff,
    0xf0b85a,
    0x79c36a,
    0xef7d75,
    0xa98df0,
    0x55c7b1
];

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function uniqueNumbers(values) {
    return [...new Set((values || []).filter(isNumber))];
}

function hashText(value) {
    let hash = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
}

function cleanLabel(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
}

export class ZoneEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.model = options.model || null;
        this.semanticEngine = options.semanticEngine || null;
        this.palette = (options.palette || DEFAULT_PALETTE).map((color) => new THREE.Color(color));
        this.zoneCache = new Map();
        this.zoneMap = new Map();
        this.appliedLocalIds = new Set();
        this.materialLocalIds = new Set();
        this.colorOverrides = new Map();
        this.isolationLocalIds = new Set();
        this.isolatedZoneId = null;
    }

    updateModel(model) {
        this.model = model || null;
        this.clearCache();
        this.appliedLocalIds.clear();
        this.materialLocalIds.clear();
        this.colorOverrides.clear();
        this.clearIsolationState();
        return this;
    }

    updateSemanticEngine(semanticEngine) {
        this.semanticEngine = semanticEngine || null;
        this.clearCache();
        return this;
    }

    clearCache() {
        this.zoneCache.clear();
        this.zoneMap.clear();
    }

    async getZones(mode = "storeys") {
        const normalizedMode = mode === "classes" ? "classes" : "storeys";
        if (this.zoneCache.has(normalizedMode)) {
            return this.zoneCache.get(normalizedMode);
        }
        if (!this.model || !this.semanticEngine) {
            this.zoneCache.set(normalizedMode, []);
            return [];
        }

        const tree = await this.semanticEngine.getTree(normalizedMode);
        const zones = this.createZonesFromTree(tree, normalizedMode);
        this.zoneCache.set(normalizedMode, zones);
        for (const zone of zones) {
            this.zoneMap.set(zone.id, zone);
        }
        return zones;
    }

    createZonesFromTree(root, mode) {
        const candidates = Array.isArray(root?.children) ? root.children : [];
        const zones = [];
        for (const item of candidates) {
            const localIds = uniqueNumbers(item?.localIds || []);
            if (!localIds.length) {
                continue;
            }
            const index = zones.length;
            const label = cleanLabel(item.label || item.category, mode === "classes" ? "类型分组" : "楼层分组");
            zones.push({
                id: `${mode}:${index}:${hashText(`${label}:${localIds.length}:${localIds[0]}`)}`,
                mode,
                label,
                category: item.category || label,
                meta: item.meta || `${localIds.length} selectable`,
                localIds,
                count: localIds.length,
                color: this.palette[index % this.palette.length]
            });
        }
        return zones.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    }

    getZone(zoneId) {
        return this.zoneMap.get(zoneId) || null;
    }

    async colorZone(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone || !this.model || typeof this.model.setColor !== "function") {
            return false;
        }
        await this.model.setColor(zone.localIds, zone.color);
        this.markApplied(zone.localIds);
        this.markColorOverride(zone.localIds, zone.color);
        this.emitChanged("color", zone);
        return true;
    }

    async isolateZone(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone || !this.model || typeof this.model.setVisible !== "function") {
            return false;
        }
        const allLocalIds = this.semanticEngine?.getLocalIds
            ? uniqueNumbers(await this.semanticEngine.getLocalIds())
            : [];
        if (!allLocalIds.length) {
            return false;
        }
        const zoneLocalIds = new Set(zone.localIds);
        const others = allLocalIds.filter((localId) => !zoneLocalIds.has(localId));
        if (typeof this.model.resetVisible === "function") {
            await this.model.resetVisible();
        }
        await this.model.setVisible(allLocalIds, true);
        if (others.length) {
            await this.model.setVisible(others, false);
        }
        await this.model.setVisible(zone.localIds, true);
        this.isolationLocalIds = new Set(others);
        this.isolatedZoneId = zoneId;
        this.emitChanged("isolate", zone);
        return true;
    }

    async setZoneVisible(zoneId, visible) {
        const zone = this.getZone(zoneId);
        if (!zone || !this.model || typeof this.model.setVisible !== "function") {
            return false;
        }
        await this.model.setVisible(zone.localIds, Boolean(visible));
        this.markApplied(zone.localIds);
        this.emitChanged(Boolean(visible) ? "show" : "hide", zone);
        return true;
    }

    async resetZone(zoneId) {
        const zone = this.getZone(zoneId);
        if (!zone || !this.model) {
            return false;
        }
        if (this.isolatedZoneId === zoneId) {
            await this.restoreIsolation();
        }
        await this.resetLocalIds(zone.localIds);
        this.clearColorOverrides(zone.localIds);
        this.unmarkMaterialOverride(zone.localIds);
        this.emitChanged("reset", zone);
        return true;
    }

    async resetAll() {
        if (!this.model || (this.appliedLocalIds.size === 0 && this.isolationLocalIds.size === 0)) {
            return false;
        }
        await this.restoreIsolation();
        const localIds = [...this.appliedLocalIds];
        if (localIds.length) {
            await this.resetLocalIds(localIds);
        }
        this.appliedLocalIds.clear();
        this.materialLocalIds.clear();
        this.colorOverrides.clear();
        this.emitChanged("resetAll", {localIds, count: localIds.length});
        return true;
    }

    async restoreIsolation() {
        const localIds = [...this.isolationLocalIds];
        if (this.model && localIds.length && typeof this.model.setVisible === "function") {
            await this.model.setVisible(localIds, true);
        }
        this.clearIsolationState();
        return localIds.length > 0;
    }

    clearIsolationState() {
        this.isolationLocalIds.clear();
        this.isolatedZoneId = null;
    }

    async resetLocalIds(localIds) {
        const ids = uniqueNumbers(localIds);
        if (!ids.length || !this.model) {
            return;
        }
        if (typeof this.model.setVisible === "function") {
            await this.model.setVisible(ids, true);
        }
        if (typeof this.model.resetColor === "function") {
            await this.model.resetColor(ids);
        }
        if (typeof this.model.resetOpacity === "function") {
            await this.model.resetOpacity(ids);
        }
    }

    markApplied(localIds) {
        for (const localId of uniqueNumbers(localIds)) {
            this.appliedLocalIds.add(localId);
        }
    }

    markMaterialOverride(localIds) {
        for (const localId of uniqueNumbers(localIds)) {
            this.materialLocalIds.add(localId);
        }
    }

    markColorOverride(localIds, color) {
        const storedColor = color?.clone ? color.clone() : color;
        for (const localId of uniqueNumbers(localIds)) {
            this.colorOverrides.set(localId, storedColor);
        }
        this.markMaterialOverride(localIds);
    }

    clearColorOverrides(localIds) {
        for (const localId of uniqueNumbers(localIds)) {
            this.colorOverrides.delete(localId);
        }
    }

    async reapplyMaterialOverrides() {
        if (!this.model || typeof this.model.setColor !== "function" || this.colorOverrides.size === 0) {
            return false;
        }
        const groups = new Map();
        for (const [localId, color] of this.colorOverrides) {
            const key = color?.getHexString ? color.getHexString() : String(color);
            if (!groups.has(key)) {
                groups.set(key, {color, localIds: []});
            }
            groups.get(key).localIds.push(localId);
        }
        for (const group of groups.values()) {
            await this.model.setColor(group.localIds, group.color);
        }
        return true;
    }

    unmarkMaterialOverride(localIds) {
        for (const localId of uniqueNumbers(localIds)) {
            this.materialLocalIds.delete(localId);
        }
    }

    hasMaterialOverride(localId) {
        return this.materialLocalIds.has(localId);
    }

    filterHighlightLocalIds(localIds) {
        return uniqueNumbers(localIds).filter((localId) => !this.hasMaterialOverride(localId));
    }

    emitChanged(action, zone) {
        this.dispatchEvent(new CustomEvent("changed", {
            detail: {action, zone}
        }));
    }
}
