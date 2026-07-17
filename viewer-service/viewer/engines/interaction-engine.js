import * as THREE from "three";

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function uniqueNumbers(values) {
    return [...new Set((values || []).filter(isNumber))];
}

function vectorToArray(vector) {
    return [
        Number(vector.x.toFixed(6)),
        Number(vector.y.toFixed(6)),
        Number(vector.z.toFixed(6))
    ];
}

function colorToText(color) {
    if (!color) {
        return null;
    }
    if (typeof color.getHexString === "function") {
        return `#${color.getHexString()}`;
    }
    if (typeof color === "object") {
        const r = Math.round((color.r ?? 0) * 255);
        const g = Math.round((color.g ?? 0) * 255);
        const b = Math.round((color.b ?? 0) * 255);
        return `rgb(${r}, ${g}, ${b})`;
    }
    return String(color);
}

export class InteractionEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.model = options.model || null;
        this.camera = options.camera || null;
        this.canvas = options.canvas || null;
        this.getViewportRect = typeof options.getViewportRect === "function"
            ? options.getViewportRect
            : null;
        this.semanticEngine = options.semanticEngine || null;
        this.getHighlightLocalIds = typeof options.getHighlightLocalIds === "function"
            ? options.getHighlightLocalIds
            : (localIds) => localIds;
        this.highlightMaterial = options.highlightMaterial || {
            color: new THREE.Color(0x34c38f),
            opacity: 1,
            transparent: false,
            renderedFaces: options.renderedFaces,
            preserveOriginalMaterial: false,
            customId: "interaction-selection"
        };
        this.currentSelection = {
            modelId: this.model?.modelId || null,
            primaryLocalId: null,
            localIds: [],
            globalIds: [],
            count: 0,
            source: "unknown"
        };
        this.currentSelectionKey = "";
        this.isolationLocalIds = [];
    }

    updateModel(model) {
        this.model = model || null;
        this.isolationLocalIds = [];
        this.clearSelection();
        return this;
    }

    async selectLocalIds(localIds, options = {}) {
        if (!this.model || !Array.isArray(localIds) || localIds.length === 0) {
            return this.currentSelection;
        }

        const uniqueLocalIds = uniqueNumbers(localIds);
        if (!uniqueLocalIds.length) {
            return this.currentSelection;
        }

        const primaryLocalId = options.primaryLocalId ?? uniqueLocalIds[0];
        const selectionKey = this.getSelectionKey(uniqueLocalIds, primaryLocalId);
        if (selectionKey === this.currentSelectionKey) {
            return this.getSelection();
        }

        const maxGlobalIds = Number.isFinite(options.maxGlobalIds) ? options.maxGlobalIds : 100;
        const globalIds = options.resolveGlobalIds === false
            ? []
            : await this.resolveGlobalIds(uniqueLocalIds, maxGlobalIds);
        this.currentSelection = {
            modelId: this.model?.modelId || null,
            primaryLocalId,
            localIds: uniqueLocalIds,
            globalIds,
            count: uniqueLocalIds.length,
            source: options.source || "unknown"
        };
        this.currentSelectionKey = selectionKey;
        this.isolationLocalIds = [];

        if (typeof this.model.resetHighlight === "function") {
            await this.model.resetHighlight();
        }
        const highlightLocalIds = uniqueNumbers(this.getHighlightLocalIds(uniqueLocalIds));
        if (highlightLocalIds.length && typeof this.model.highlight === "function") {
            await this.model.highlight(highlightLocalIds, this.highlightMaterial);
        }

        this.dispatchEvent(new CustomEvent("selectionchanged", {
            detail: this.getSelection()
        }));
        return this.getSelection();
    }

    async clearSelection(options = {}) {
        if (this.model && typeof this.model.resetHighlight === "function") {
            await this.model.resetHighlight();
        }
        this.isolationLocalIds = [];
        this.currentSelection = {
            modelId: this.model?.modelId || null,
            primaryLocalId: null,
            localIds: [],
            globalIds: [],
            count: 0,
            source: options.source || "cleared"
        };
        this.currentSelectionKey = "";
        this.dispatchEvent(new CustomEvent("selectionchanged", {
            detail: this.getSelection()
        }));
        return this.getSelection();
    }

    async pick(clientX, clientY, options = {}) {
        if (!this.model || !this.camera || !this.canvas || typeof this.model.raycast !== "function") {
            return null;
        }
        const viewportRect = this.getViewportClientRect();
        if (viewportRect && (
            clientX < viewportRect.left
            || clientX > viewportRect.right
            || clientY < viewportRect.top
            || clientY > viewportRect.bottom
        )) {
            return null;
        }
        const hitResult = await this.raycastWithTolerance(clientX, clientY, options.tolerancePx);
        if (!hitResult?.hit) {
            return null;
        }
        const localIds = await this.getLocalIdsFromHit(hitResult.hit);
        if (!localIds.length) {
            return null;
        }
        await this.selectLocalIds(localIds, {
            primaryLocalId: localIds[0],
            source: options.source || "canvas"
        });
        return {
            hit: hitResult.hit,
            localIds,
            offset: hitResult.offset
        };
    }

    async raycastWithTolerance(clientX, clientY, tolerancePx = 0) {
        const tolerance = Number.isFinite(tolerancePx) ? Math.max(0, tolerancePx) : 0;
        const offsets = [
            [0, 0]
        ];
        if (tolerance > 0) {
            offsets.push(
                [tolerance, 0],
                [-tolerance, 0],
                [0, tolerance],
                [0, -tolerance],
                [tolerance, tolerance],
                [-tolerance, tolerance],
                [tolerance, -tolerance],
                [-tolerance, -tolerance]
            );
        }
        for (const [offsetX, offsetY] of offsets) {
            const hit = await this.model.raycast({
                camera: this.camera,
                mouse: new THREE.Vector2(clientX + offsetX, clientY + offsetY),
                dom: this.getRaycastDom()
            });
            if (hit) {
                return {
                    hit,
                    offset: {x: offsetX, y: offsetY}
                };
            }
        }
        return null;
    }

    async rectanglePick(rect) {
        if (!this.model || !this.camera || !this.canvas || typeof this.model.rectangleRaycast !== "function") {
            return [];
        }
        const viewportRect = this.getViewportClientRect();
        if (viewportRect && (
            rect.bottomRight.x < viewportRect.left
            || rect.topLeft.x > viewportRect.right
            || rect.bottomRight.y < viewportRect.top
            || rect.topLeft.y > viewportRect.bottom
        )) {
            return [];
        }
        const result = await this.model.rectangleRaycast({
            camera: this.camera,
            dom: this.getRaycastDom(),
            topLeft: rect.topLeft,
            bottomRight: rect.bottomRight,
            fullyIncluded: Boolean(rect.fullyIncluded)
        });
        const localIds = uniqueNumbers(result?.localIds ? [...result.localIds] : []);
        if (localIds.length) {
            await this.selectLocalIds(localIds, {
                primaryLocalId: localIds[0],
                source: "box"
            });
        }
        return localIds;
    }

    getRaycastDom() {
        if (!this.canvas || typeof this.getViewportRect !== "function") {
            return this.canvas;
        }
        const clientRect = this.getViewportClientRect();
        if (!clientRect) {
            return this.canvas;
        }
        const width = Math.max(clientRect.width, 1);
        const height = Math.max(clientRect.height, 1);
        return {
            clientWidth: width,
            clientHeight: height,
            width,
            height,
            getBoundingClientRect() {
                return {
                    x: clientRect.left,
                    y: clientRect.top,
                    left: clientRect.left,
                    top: clientRect.top,
                    right: clientRect.right,
                    bottom: clientRect.bottom,
                    width,
                    height
                };
            }
        };
    }

    getViewportClientRect() {
        if (!this.canvas || typeof this.getViewportRect !== "function") {
            return null;
        }
        const viewport = this.getViewportRect();
        if (!viewport) {
            return null;
        }
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / Math.max(this.canvas.clientWidth || rect.width || 1, 1);
        const scaleY = rect.height / Math.max(this.canvas.clientHeight || rect.height || 1, 1);
        const left = rect.left + viewport.x * scaleX;
        const top = rect.top + viewport.y * scaleY;
        const width = viewport.width * scaleX;
        const height = viewport.height * scaleY;
        return {
            x: left,
            y: top,
            left,
            top,
            right: left + width,
            bottom: top + height,
            width,
            height
        };
    }

    async fitSelection() {
        if (!this.model || !this.currentSelection.localIds.length || typeof this.model.getMergedBox !== "function") {
            return false;
        }
        const box = await this.model.getMergedBox(this.currentSelection.localIds);
        if (!box || box.isEmpty()) {
            return false;
        }
        this.dispatchEvent(new CustomEvent("fitrequested", {
            detail: {
                box,
                selection: this.getSelection()
            }
        }));
        return box;
    }

    async hideSelected() {
        if (!this.model || !this.currentSelection.localIds.length || typeof this.model.setVisible !== "function") {
            return false;
        }
        await this.model.setVisible(this.currentSelection.localIds, false);
        return true;
    }

    async isolateSelected(options = {}) {
        if (!this.model || !this.currentSelection.localIds.length || typeof this.model.setVisible !== "function") {
            return false;
        }
        const selected = new Set(this.currentSelection.localIds);
        const allLocalIds = this.semanticEngine?.getLocalIds
            ? await this.semanticEngine.getLocalIds()
            : [];
        const others = allLocalIds.filter((id) => !selected.has(id));
        const mode = options.mode || "hide";
        if (mode === "dim") {
            if (typeof this.model.highlight !== "function" && typeof this.model.setOpacity !== "function") {
                return false;
            }
            const opacity = Number.isFinite(options.opacity) ? Math.min(1, Math.max(0.05, options.opacity)) : 0.35;
            if (options.restoreVisibility !== false) {
                if (typeof this.model.resetVisible === "function") {
                    await this.model.resetVisible();
                }
                if (allLocalIds.length) {
                    await this.model.setVisible(allLocalIds, true);
                }
            }
            await this.clearIsolationHighlights(others);
            if (others.length && typeof this.model.highlight === "function") {
                await this.model.highlight(others, {
                    opacity,
                    transparent: opacity < 1,
                    renderedFaces: this.highlightMaterial?.renderedFaces,
                    customId: `interaction-isolate-dim-${Math.round(opacity * 100)}`
                });
            } else if (others.length && typeof this.model.setOpacity === "function") {
                await this.model.setOpacity(others, opacity);
            }
            this.isolationLocalIds = [...others];
            return true;
        }

        if (options.restoreVisibility !== false) {
            if (typeof this.model.resetVisible === "function") {
                await this.model.resetVisible();
            }
            if (allLocalIds.length) {
                await this.model.setVisible(allLocalIds, true);
            }
        }
        await this.clearIsolationHighlights(others);
        if (others.length) {
            await this.model.setVisible(others, false);
        }
        await this.model.setVisible(this.currentSelection.localIds, true);
        this.isolationLocalIds = [...others];
        return true;
    }

    async showAll() {
        if (!this.model) {
            return false;
        }
        if (typeof this.model.resetVisible === "function") {
            await this.model.resetVisible();
        }
        await this.clearIsolationHighlights(this.isolationLocalIds);
        this.isolationLocalIds = [];
        return true;
    }

    async clearIsolationHighlights(localIds = []) {
        const ids = uniqueNumbers(localIds);
        if (!this.model || !ids.length) {
            return;
        }
        if (typeof this.model.resetHighlight === "function") {
            await this.model.resetHighlight(ids);
            return;
        }
        if (typeof this.model.resetOpacity === "function") {
            await this.model.resetOpacity(ids);
        }
    }

    async colorSelected(color) {
        if (!this.model || !this.currentSelection.localIds.length || typeof this.model.setColor !== "function") {
            return false;
        }
        await this.model.setColor(this.currentSelection.localIds, color);
        return true;
    }

    async resetSelectedColor() {
        if (!this.model || !this.currentSelection.localIds.length) {
            return false;
        }
        if (typeof this.model.resetColor === "function") {
            await this.model.resetColor(this.currentSelection.localIds);
        }
        if (typeof this.model.resetOpacity === "function") {
            await this.model.resetOpacity(this.currentSelection.localIds);
        }
        return true;
    }

    async setSelectedOpacity(opacity) {
        if (!this.model || !this.currentSelection.localIds.length || typeof this.model.setOpacity !== "function") {
            return false;
        }
        await this.model.setOpacity(this.currentSelection.localIds, opacity);
        return true;
    }

    getSelection() {
        return {
            ...this.currentSelection,
            localIds: [...this.currentSelection.localIds],
            globalIds: [...this.currentSelection.globalIds]
        };
    }

    async resolveGlobalIds(localIds, maxCount = 100) {
        if (!this.semanticEngine || typeof this.semanticEngine.getGlobalId !== "function") {
            return [];
        }
        const globalIds = [];
        for (const localId of localIds.slice(0, Math.max(0, maxCount))) {
            try {
                const globalId = await this.semanticEngine.getGlobalId(localId);
                if (globalId) {
                    globalIds.push(String(globalId));
                }
            } catch {
                globalIds.push(null);
            }
        }
        return globalIds.filter(Boolean);
    }

    getSelectionKey(localIds, primaryLocalId) {
        if (!Array.isArray(localIds) || !localIds.length) {
            return "";
        }
        return `${primaryLocalId ?? ""}:${localIds.length}:${localIds.join(",")}`;
    }

    async getLocalIdsFromHit(hit) {
        if (!this.model) {
            return [];
        }
        if (Array.isArray(hit?.localIds)) {
            return uniqueNumbers(hit.localIds);
        }
        if (typeof hit?.itemId === "number" && typeof this.model.getLocalIdsFromItemIds === "function") {
            const result = await this.model.getLocalIdsFromItemIds([hit.itemId]);
            return uniqueNumbers(result);
        }
        return [];
    }

    getSelectionSummary() {
        const selection = this.getSelection();
        return {
            ...selection,
            color: colorToText(this.highlightMaterial?.color || null)
        };
    }
}
