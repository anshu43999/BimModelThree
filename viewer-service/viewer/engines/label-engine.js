import * as THREE from "three";

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function toVector3(value) {
    if (!value) {
        return null;
    }
    if (value instanceof THREE.Vector3) {
        return value.clone();
    }
    if (Array.isArray(value) && value.length >= 3) {
        return new THREE.Vector3(Number(value[0]), Number(value[1]), Number(value[2]));
    }
    if (typeof value === "object") {
        return new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z));
    }
    return null;
}

function vectorToArray(vector) {
    return [
        Number(vector.x.toFixed(6)),
        Number(vector.y.toFixed(6)),
        Number(vector.z.toFixed(6))
    ];
}

function firstNumber(values) {
    return (values || []).find(isNumber) ?? null;
}

function textOrFallback(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    return String(value);
}

export class LabelEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.camera = options.camera || null;
        this.canvas = options.canvas || null;
        this.overlay = options.overlay || this.createOverlay();
        this.semanticEngine = options.semanticEngine || null;
        this.onSelect = typeof options.onSelect === "function" ? options.onSelect : null;
        this.model = options.model || null;
        this.labels = new Map();
        this.nextId = 1;
        this.ensureOverlay();
    }

    updateModel(model) {
        this.model = model || null;
        this.sync();
        return this;
    }

    updateSemanticEngine(engine) {
        this.semanticEngine = engine || null;
        return this;
    }

    addLabel(options = {}) {
        const position = toVector3(options.position);
        if (!position) {
            throw new Error("LabelEngine.addLabel requires position");
        }

        const id = options.id ? String(options.id) : `label-${this.nextId++}`;
        if (this.labels.has(id)) {
            this.removeLabel(id);
        }

        const label = {
            id,
            localId: isNumber(options.localId) ? options.localId : null,
            globalId: options.globalId ? String(options.globalId) : null,
            position,
            title: textOrFallback(options.title, options.localId !== undefined ? `localId ${options.localId}` : "Label"),
            subtitle: textOrFallback(options.subtitle, ""),
            element: this.createElement(id),
            muted: options.muted === true,
            visible: true
        };

        this.renderElement(label);
        this.overlay?.appendChild(label.element);
        this.labels.set(id, label);
        this.sync();
        return this.toPublicLabel(label);
    }

    async addLabelForSelection(selection = {}, options = {}) {
        const localIds = Array.isArray(selection.localIds) ? selection.localIds.filter(isNumber) : [];
        const localId = isNumber(options.localId)
            ? options.localId
            : isNumber(selection.primaryLocalId)
                ? selection.primaryLocalId
                : firstNumber(localIds);
        const position = toVector3(options.position || selection.position || selection.hit?.point)
            || await this.getSelectionCenter(localIds, localId);
        const globalId = options.globalId
            || selection.globalId
            || selection.globalIds?.[0]
            || await this.resolveGlobalId(localId);
        const info = await this.resolveItemInfo(localId);
        const title = options.title
            || selection.title
            || selection.label
            || info?.name
            || (localId !== null ? `localId ${localId}` : "Selection");
        const subtitle = options.subtitle
            || selection.subtitle
            || globalId
            || (localIds.length > 1 ? `${localIds.length} elements` : "");

        if (!position) {
            throw new Error("LabelEngine.addLabelForSelection could not resolve selection position");
        }

        return this.addLabel({
            ...options,
            localId,
            position,
            title,
            subtitle,
            globalId
        });
    }

    removeLabel(id) {
        const key = String(id);
        const label = this.labels.get(key);
        if (!label) {
            return false;
        }
        label.element?.remove();
        this.labels.delete(key);
        return true;
    }

    clear() {
        for (const label of this.labels.values()) {
            label.element?.remove();
        }
        this.labels.clear();
        return this;
    }

    sync() {
        if (!this.camera || !this.canvas || !this.overlay) {
            return this;
        }

        this.camera.updateMatrixWorld();
        const canvasRect = this.canvas.getBoundingClientRect();
        const overlayRect = this.overlay.getBoundingClientRect();
        const width = Math.max(canvasRect.width, 1);
        const height = Math.max(canvasRect.height, 1);

        for (const label of this.labels.values()) {
            const projected = label.position.clone().project(this.camera);
            const visible = Number.isFinite(projected.x)
                && Number.isFinite(projected.y)
                && Number.isFinite(projected.z)
                && projected.z >= -1
                && projected.z <= 1;

            label.visible = visible;
            if (!visible) {
                label.element.style.display = "none";
                continue;
            }

            const x = canvasRect.left - overlayRect.left + ((projected.x + 1) / 2) * width;
            const y = canvasRect.top - overlayRect.top + ((1 - projected.y) / 2) * height;
            const labelX = x + 14;
            const labelY = y - 14;
            label.element.style.display = "";
            label.element.style.transform = `translate3d(${labelX}px, ${labelY}px, 0) translate(0, -100%)`;
        }
        return this;
    }

    getLabels() {
        return [...this.labels.values()].map((label) => this.toPublicLabel(label));
    }

    createOverlay() {
        if (!this.canvas?.parentElement || typeof document === "undefined") {
            return null;
        }
        const overlay = document.createElement("div");
        overlay.className = "viewer-label-overlay";
        this.canvas.parentElement.appendChild(overlay);
        return overlay;
    }

    ensureOverlay() {
        if (!this.overlay) {
            return;
        }
        const style = this.overlay.style;
        if (!style.position) {
            style.position = "absolute";
        }
        if (!style.inset) {
            style.inset = "0";
        }
        style.pointerEvents = "none";
        style.overflow = style.overflow || "hidden";
    }

    createElement(id) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "modelLabel";
        element.dataset.labelId = id;
        element.style.position = "absolute";
        element.style.left = "0";
        element.style.top = "0";
        element.style.maxWidth = "220px";
        element.style.padding = "6px 8px";
        element.style.border = "1px solid var(--bubble-border)";
        element.style.borderRadius = "var(--bubble-radius)";
        element.style.background = "var(--bubble-bg)";
        element.style.color = "var(--bubble-text)";
        element.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
        element.style.fontSize = "var(--bubble-font-size)";
        element.style.lineHeight = "1.35";
        element.style.textAlign = "left";
        element.style.boxShadow = "0 6px 18px var(--bubble-shadow)";
        element.style.cursor = "pointer";
        element.style.pointerEvents = "auto";
        element.style.zIndex = "2";
        element.addEventListener("click", (event) => this.handleClick(id, event));
        return element;
    }

    renderElement(label) {
        label.element.textContent = "";
        const title = document.createElement("div");
        title.className = "modelLabelTitle";
        title.textContent = label.title;
        title.style.fontWeight = "700";
        title.style.whiteSpace = "nowrap";
        title.style.overflow = "hidden";
        title.style.textOverflow = "ellipsis";
        label.element.appendChild(title);

        if (label.subtitle) {
            const subtitle = document.createElement("div");
            subtitle.className = "modelLabelSub";
            subtitle.textContent = label.subtitle;
            subtitle.style.marginTop = "2px";
            subtitle.style.color = "var(--bubble-muted)";
            subtitle.style.whiteSpace = "nowrap";
            subtitle.style.overflow = "hidden";
            subtitle.style.textOverflow = "ellipsis";
            label.element.appendChild(subtitle);
        }
        const meta = document.createElement("div");
        meta.className = "modelLabelSub";
        meta.textContent = label.localId !== null ? `localId ${label.localId}` : "未绑定构件";
        meta.style.marginTop = "2px";
        meta.style.color = "var(--bubble-muted)";
        meta.style.whiteSpace = "nowrap";
        meta.style.overflow = "hidden";
        meta.style.textOverflow = "ellipsis";
        label.element.appendChild(meta);
        label.element.classList.toggle("bubbleSecondary", label.muted);
    }

    handleClick(id, event) {
        event.preventDefault();
        event.stopPropagation();
        const label = this.labels.get(id);
        if (!label) {
            return;
        }
        const detail = this.toPublicLabel(label);
        this.dispatchEvent(new CustomEvent("labelselect", {detail}));
        this.onSelect?.(detail, event);
    }

    async getSelectionCenter(localIds, localId) {
        const ids = localIds.length ? localIds : isNumber(localId) ? [localId] : [];
        if (ids.length && typeof this.model?.getMergedBox === "function") {
            const box = await this.model.getMergedBox(ids);
            if (box && typeof box.isEmpty === "function" && !box.isEmpty()) {
                return box.getCenter(new THREE.Vector3());
            }
        }
        if (this.model?.box && typeof this.model.box.isEmpty === "function" && !this.model.box.isEmpty()) {
            return this.model.box.getCenter(new THREE.Vector3());
        }
        return null;
    }

    async resolveGlobalId(localId) {
        if (!isNumber(localId) || typeof this.semanticEngine?.getGlobalId !== "function") {
            return null;
        }
        try {
            const globalId = await this.semanticEngine.getGlobalId(localId);
            return globalId ? String(globalId) : null;
        } catch {
            return null;
        }
    }

    async resolveItemInfo(localId) {
        if (!isNumber(localId) || typeof this.semanticEngine?.getItemInfo !== "function") {
            return null;
        }
        try {
            return await this.semanticEngine.getItemInfo(localId);
        } catch {
            return null;
        }
    }

    toPublicLabel(label) {
        return {
            id: label.id,
            localId: label.localId,
            globalId: label.globalId,
            position: vectorToArray(label.position),
            title: label.title,
            subtitle: label.subtitle,
            visible: label.visible
        };
    }
}
