import * as THREE from "three";

const DEFAULT_UNIT = "m";
const DISTANCE_DECIMALS = 3;
const AREA_DECIMALS = 3;
const ANGLE_DECIMALS = 1;
const LABEL_CLASS = "measureLabel";
export const MEASUREMENT_SNAPPING_CLASSES = Object.freeze({
    POINT: 0,
    LINE: 1,
    FACE: 2
});
export const DEFAULT_MEASUREMENT_SNAP_OPTIONS = Object.freeze({
    pointTolerancePx: 14,
    midpointTolerancePx: 12,
    edgeTolerancePx: 10,
    releaseMultiplier: 1.6
});

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function toFiniteNumber(value) {
    if (isFiniteNumber(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : null;
    }
    return null;
}

function uniqueNumbers(values) {
    const numbers = [];
    for (const value of values || []) {
        const numberValue = toFiniteNumber(value);
        if (numberValue !== null && !numbers.includes(numberValue)) {
            numbers.push(numberValue);
        }
    }
    return numbers;
}

function vectorToArray(vector) {
    return [
        Number(vector.x.toFixed(6)),
        Number(vector.y.toFixed(6)),
        Number(vector.z.toFixed(6))
    ];
}

function vectorFromValue(value) {
    if (!value) {
        return null;
    }
    if (value.isVector3 || value instanceof THREE.Vector3) {
        return value.clone();
    }
    if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length >= 3) {
        const x = toFiniteNumber(value[0]);
        const y = toFiniteNumber(value[1]);
        const z = toFiniteNumber(value[2]);
        return x === null || y === null || z === null
            ? null
            : new THREE.Vector3(x, y, z);
    }
    if (typeof value === "object") {
        const x = toFiniteNumber(value.x);
        const y = toFiniteNumber(value.y);
        const z = toFiniteNumber(value.z);
        return x === null || y === null || z === null
            ? null
            : new THREE.Vector3(x, y, z);
    }
    return null;
}

function isCoordinateArray(value) {
    return (Array.isArray(value) || ArrayBuffer.isView(value))
        && value.length >= 3
        && toFiniteNumber(value[0]) !== null
        && toFiniteNumber(value[1]) !== null
        && toFiniteNumber(value[2]) !== null;
}

function firstHit(result) {
    if (!result) {
        return null;
    }
    if (isCoordinateArray(result)) {
        return result;
    }
    if (Array.isArray(result)) {
        return result.find(Boolean) || null;
    }
    if (Array.isArray(result.hits)) {
        return result.hits.find(Boolean) || null;
    }
    if (result.hit) {
        return result.hit;
    }
    return result;
}

function snappingTypeFromHit(hit) {
    if (["point", "midpoint", "edge", "face"].includes(hit?.snapType)) {
        return hit.snapType;
    }
    if (hit?.snappingClass === MEASUREMENT_SNAPPING_CLASSES.POINT) {
        return "point";
    }
    if (hit?.snappingClass === MEASUREMENT_SNAPPING_CLASSES.LINE) {
        return "edge";
    }
    return "face";
}

function snappingHitsFromResult(result) {
    return Array.isArray(result)
        ? result.filter(Boolean)
        : Array.isArray(result?.hits)
            ? result.hits.filter(Boolean)
            : result
                ? [result.hit || result]
                : [];
}

function snapTypePriority(snapType) {
    return {
        point: 0,
        midpoint: 1,
        edge: 2,
        face: 3
    }[snapType] ?? 4;
}

function distanceToSegment2D(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= Number.EPSILON) {
        return Math.hypot(point.x - start.x, point.y - start.y);
    }
    const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const closestX = start.x + dx * ratio;
    const closestY = start.y + dy * ratio;
    return Math.hypot(point.x - closestX, point.y - closestY);
}

function formatDistance(distance, unit = DEFAULT_UNIT) {
    return `${distance.toFixed(DISTANCE_DECIMALS)} ${unit}`;
}

function formatArea(area, unit = DEFAULT_UNIT) {
    return `${area.toFixed(AREA_DECIMALS)} ${unit}^2`;
}

function formatAngle(angle) {
    return `${angle.toFixed(ANGLE_DECIMALS)}掳`;
}

function createMeasurementLabel(text) {
    const label = document.createElement("div");
    label.className = LABEL_CLASS;
    label.textContent = text;
    label.style.position = "absolute";
    label.style.pointerEvents = "none";
    label.style.transform = "translate(-50%, -100%)";
    label.style.padding = "3px 7px";
    label.style.borderRadius = "4px";
    label.style.background = "rgba(12, 15, 17, 0.82)";
    label.style.color = "#ffffff";
    label.style.font = "12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    label.style.whiteSpace = "nowrap";
    label.style.zIndex = "20";
    return label;
}

export class MeasurementEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.model = options.model || null;
        this.camera = options.camera || null;
        this.canvas = options.canvas || null;
        this.scene = options.scene || null;
        this.overlay = options.overlay || null;
        this.onChange = typeof options.onChange === "function" ? options.onChange : null;
        this.onMeasure = typeof options.onMeasure === "function" ? options.onMeasure : null;
        this.onError = typeof options.onError === "function" ? options.onError : null;
        this.enabled = false;
        this.mode = this.normalizeMode(options.mode);
        this.unit = options.unit || DEFAULT_UNIT;
        this.measurements = [];
        this.pendingStart = null;
        this.pendingPicks = [];
        this.pendingObjects = [];
        this.pendingPreviewObjects = [];
        this.pendingPreviewLabel = null;
        this.pendingPreviewMeasurement = null;
        this.pendingPreviewKey = "";
        this.preview = null;
        this.snapLock = null;
        this.snapOptions = {
            ...DEFAULT_MEASUREMENT_SNAP_OPTIONS,
            ...(options.snapOptions || {})
        };
        this.nextId = 1;
        this.pointerMoveVersion = 0;
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: 0xffc857,
            depthTest: false,
            depthWrite: false
        });
        this.endpointGeometry = new THREE.SphereGeometry(1, 16, 8);
        this.endpointMaterial = new THREE.MeshBasicMaterial({
            color: 0xffc857,
            depthTest: false,
            depthWrite: false
        });
        this.areaMaterial = new THREE.MeshBasicMaterial({
            color: 0xffc857,
            opacity: 0.22,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide
        });
    }

    updateModel(model) {
        this.pointerMoveVersion += 1;
        this.model = model || null;
        for (const measurement of this.measurements) {
            this.removeMeasurement(measurement);
        }
        this.measurements = [];
        this.clearPending();
        this.preview = null;
        this.clearSnapLock();
        this.emitChange("model");
        return this;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) {
            this.pointerMoveVersion += 1;
            this.clearPending();
            this.preview = null;
            this.clearSnapLock();
        }
        this.emitChange("enabled");
        return this;
    }

    setMode(mode) {
        const nextMode = this.normalizeMode(mode);
        if (nextMode !== this.mode) {
            this.pointerMoveVersion += 1;
            this.mode = nextMode;
            this.clearPending();
            this.preview = null;
            this.clearSnapLock();
            this.emitChange("mode");
        }
        return this;
    }

    normalizeMode(mode) {
        if (mode === "angle" || mode === "area") {
            return mode;
        }
        return "distance";
    }

    setSnapOptions(options = {}) {
        for (const key of Object.keys(DEFAULT_MEASUREMENT_SNAP_OPTIONS)) {
            const value = Number(options[key]);
            if (Number.isFinite(value) && value > 0) {
                this.snapOptions[key] = value;
            }
        }
        this.clearSnapLock();
        return this.getSnapOptions();
    }

    getSnapOptions() {
        return {...this.snapOptions};
    }

    clearSnapLock() {
        this.snapLock = null;
    }

    clearPointerPreview(options = {}) {
        this.pointerMoveVersion += 1;
        this.preview = null;
        this.clearSnapLock();
        this.updatePendingVisuals();
        if (options.emit !== false) {
            this.emitChange("preview");
        }
    }

    clear() {
        this.pointerMoveVersion += 1;
        for (const measurement of this.measurements) {
            this.removeMeasurement(measurement);
        }
        this.measurements = [];
        this.clearPending();
        this.preview = null;
        this.clearSnapLock();
        this.emitChange("clear");
        return this.getState();
    }

    undo() {
        if (this.pendingPicks.length) {
            this.pendingPicks.pop();
            const object = this.pendingObjects.pop();
            if (object) {
                this.scene?.remove(object);
            }
            this.pendingStart = this.pendingPicks[0] || null;
            this.preview = this.pendingPicks[this.pendingPicks.length - 1] || null;
            this.updatePendingVisuals();
            this.emitChange("undo-pending");
            return this.getState();
        }

        const measurement = this.measurements.pop();
        if (measurement) {
            this.removeMeasurement(measurement);
        }
        this.emitChange("undo");
        return this.getState();
    }

    async handlePointerMove(clientX, clientY) {
        if (!this.enabled) {
            return null;
        }

        const version = ++this.pointerMoveVersion;
        try {
            const candidate = await this.pick(clientX, clientY);
            if (version !== this.pointerMoveVersion) {
                return this.preview ? this.serializePick(this.preview) : null;
            }
            const pick = this.applySnapLock(candidate, clientX, clientY);
            this.preview = pick;
            this.updatePendingVisuals();
            this.emitChange("preview");
            return pick ? this.serializePick(pick) : null;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    async handleClick(clientX, clientY) {
        if (!this.enabled) {
            return null;
        }

        try {
            const pick = this.applySnapLock(await this.pick(clientX, clientY), clientX, clientY);
            if (!pick?.point) {
                return null;
            }

            if (this.mode === "angle") {
                this.addPendingPick(pick);
                this.pendingStart = this.pendingPicks[0] || null;
                this.preview = pick;
                this.updatePendingVisuals();
                if (this.pendingPicks.length < 3) {
                    this.emitChange("start");
                    return this.serializePick(pick);
                }

                const measurement = this.createAngleMeasurement(this.pendingPicks[0], this.pendingPicks[1], this.pendingPicks[2]);
                if (!measurement) {
                    this.clearPending();
                    this.preview = null;
                    return null;
                }
                this.measurements.push(measurement);
                this.clearPending();
                this.preview = null;
                this.updateLabels();

                const detail = this.serializeMeasurement(measurement);
                this.onMeasure?.(detail);
                this.dispatchEvent(new CustomEvent("measure", {detail}));
                this.emitChange("measure");
                return detail;
            }

            if (this.mode === "area") {
                const validation = this.validateAreaPick(pick);
                if (!validation.valid) {
                    this.emitChange(validation.reason === "non-planar" ? "area-non-planar" : "area-self-intersection");
                    return {
                        type: "area-invalid",
                        reason: validation.reason,
                        point: vectorToArray(pick.point),
                        localIds: [...pick.localIds]
                    };
                }
                this.addPendingPick(pick);
                this.pendingStart = this.pendingPicks[0] || null;
                this.preview = pick;
                this.updatePendingVisuals();
                this.emitChange("start");
                return this.serializePick(pick);
            }

            if (!this.pendingStart) {
                this.addPendingPick(pick);
                this.pendingStart = pick;
                this.preview = pick;
                this.updatePendingVisuals();
                this.emitChange("start");
                return this.serializePick(pick);
            }

            const measurement = this.createMeasurement(this.pendingStart, pick);
            this.measurements.push(measurement);
            this.clearPending();
            this.preview = null;
            this.updateLabels();

            const detail = this.serializeMeasurement(measurement);
            this.onMeasure?.(detail);
            this.dispatchEvent(new CustomEvent("measure", {detail}));
            this.emitChange("measure");
            return detail;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    completeAreaMeasurement() {
        if (this.mode !== "area" || this.pendingPicks.length < 3) {
            return null;
        }
        const validation = this.validateAreaCompletion();
        if (!validation.valid) {
            this.emitChange(validation.reason === "non-planar" ? "area-non-planar" : "area-self-intersection");
            return {
                type: "area-invalid",
                reason: validation.reason,
                pendingCount: this.pendingPicks.length
            };
        }
        const measurement = this.createAreaMeasurement(this.pendingPicks);
        if (!measurement) {
            this.clearPending();
            this.preview = null;
            this.emitChange("invalid-area");
            return null;
        }
        this.measurements.push(measurement);
        this.clearPending();
        this.preview = null;
        this.updateLabels();

        const detail = this.serializeMeasurement(measurement);
        this.onMeasure?.(detail);
        this.dispatchEvent(new CustomEvent("measure", {detail}));
        this.emitChange("measure");
        return detail;
    }

    getPendingAreaDetail() {
        if (this.mode !== "area" || this.pendingPicks.length < 3) {
            return null;
        }
        const points = this.pendingPicks
            .map((pick) => pick?.point)
            .filter(Boolean);
        if (points.length < 3) {
            return null;
        }
        const polygonData = this.getProjectedPolygonData(points);
        if (!polygonData || !Number.isFinite(polygonData.area) || polygonData.area <= 0.000001) {
            return null;
        }
        return {
            type: "area-preview",
            unit: `${this.unit}^2`,
            area: Number(polygonData.area.toFixed(AREA_DECIMALS)),
            text: formatArea(polygonData.area, this.unit),
            points: points.map((point) => vectorToArray(point))
        };
    }

    getState(options = {}) {
        const includeDetails = options.includeDetails !== false;
        return {
            enabled: this.enabled,
            mode: this.mode,
            unit: this.unit,
            snapOptions: this.getSnapOptions(),
            modelId: this.model?.modelId || null,
            count: this.measurements.length,
            pendingStart: this.pendingStart ? this.serializePick(this.pendingStart) : null,
            pendingCount: this.pendingPicks.length,
            pendingPicks: includeDetails ? this.pendingPicks.map((pick) => this.serializePick(pick)) : [],
            pendingArea: includeDetails ? this.getPendingAreaDetail() : null,
            preview: this.preview ? this.serializePick(this.preview) : null,
            measurements: includeDetails ? this.measurements.map((measurement) => this.serializeMeasurement(measurement)) : []
        };
    }

    worldToClient(point) {
        if (!point || !this.camera?.isCamera || typeof this.canvas?.getBoundingClientRect !== "function") {
            return null;
        }
        const rect = this.canvas.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        const projected = point.clone().project(this.camera);
        if (![projected.x, projected.y, projected.z].every(Number.isFinite)) {
            return null;
        }
        return {
            x: rect.left + (projected.x + 1) * 0.5 * rect.width,
            y: rect.top + (1 - projected.y) * 0.5 * rect.height
        };
    }

    getPointScreenDistance(point, clientX, clientY) {
        const projected = this.worldToClient(point);
        return projected ? Math.hypot(clientX - projected.x, clientY - projected.y) : null;
    }

    getEdgeScreenDistance(start, end, clientX, clientY) {
        const projectedStart = this.worldToClient(start);
        const projectedEnd = this.worldToClient(end);
        if (!projectedStart || !projectedEnd) {
            return null;
        }
        return distanceToSegment2D({x: clientX, y: clientY}, projectedStart, projectedEnd);
    }

    getSnapTolerance(snapType) {
        if (snapType === "point") {
            return this.snapOptions.pointTolerancePx;
        }
        if (snapType === "midpoint") {
            return this.snapOptions.midpointTolerancePx;
        }
        if (snapType === "edge") {
            return this.snapOptions.edgeTolerancePx;
        }
        return 0;
    }

    prepareSnappingCandidate(hit, clientX, clientY) {
        const point = this.getPointFromHit(hit);
        if (!point) {
            return null;
        }
        const snapType = snappingTypeFromHit(hit);
        const snappedEdgeP1 = vectorFromValue(hit.snappedEdgeP1);
        const snappedEdgeP2 = vectorFromValue(hit.snappedEdgeP2);
        if (snapType === "point") {
            const screenDistance = this.getPointScreenDistance(point, clientX, clientY);
            if (screenDistance !== null && screenDistance > this.snapOptions.pointTolerancePx) {
                return null;
            }
            return {...hit, point, snapType, screenDistance};
        }
        if (snapType === "edge") {
            if (snappedEdgeP1 && snappedEdgeP2) {
                const midpoint = snappedEdgeP1.clone().add(snappedEdgeP2).multiplyScalar(0.5);
                const midpointDistance = this.getPointScreenDistance(midpoint, clientX, clientY);
                if (midpointDistance !== null && midpointDistance <= this.snapOptions.midpointTolerancePx) {
                    return {
                        ...hit,
                        point: midpoint,
                        snapType: "midpoint",
                        screenDistance: midpointDistance
                    };
                }
            }
            const screenDistance = snappedEdgeP1 && snappedEdgeP2
                ? this.getEdgeScreenDistance(snappedEdgeP1, snappedEdgeP2, clientX, clientY)
                : this.getPointScreenDistance(point, clientX, clientY);
            if (screenDistance !== null && screenDistance > this.snapOptions.edgeTolerancePx) {
                return null;
            }
            return {...hit, point, snapType, screenDistance};
        }
        return {...hit, point, snapType: "face", screenDistance: null};
    }

    selectSnappingHit(result, clientX, clientY) {
        const candidates = snappingHitsFromResult(result)
            .map((hit) => this.prepareSnappingCandidate(hit, clientX, clientY))
            .filter(Boolean);
        return candidates.sort((left, right) => {
            const typeDifference = snapTypePriority(left.snapType) - snapTypePriority(right.snapType);
            if (typeDifference !== 0) {
                return typeDifference;
            }
            const leftScreenDistance = toFiniteNumber(left.screenDistance) ?? Number.POSITIVE_INFINITY;
            const rightScreenDistance = toFiniteNumber(right.screenDistance) ?? Number.POSITIVE_INFINITY;
            if (leftScreenDistance !== rightScreenDistance) {
                return leftScreenDistance - rightScreenDistance;
            }
            const leftDistance = toFiniteNumber(left.rayDistance) ?? toFiniteNumber(left.distance) ?? Number.POSITIVE_INFINITY;
            const rightDistance = toFiniteNumber(right.rayDistance) ?? toFiniteNumber(right.distance) ?? Number.POSITIVE_INFINITY;
            return leftDistance - rightDistance;
        })[0] || null;
    }

    clonePick(pick) {
        if (!pick) {
            return null;
        }
        return {
            ...pick,
            point: pick.point.clone(),
            snappedEdgeP1: pick.snappedEdgeP1?.clone() || null,
            snappedEdgeP2: pick.snappedEdgeP2?.clone() || null,
            localIds: [...pick.localIds]
        };
    }

    isSameSnapTarget(left, right) {
        if (!left || !right || left.snapType !== right.snapType) {
            return false;
        }
        if (left.snapType === "edge" || left.snapType === "midpoint") {
            if (!left.snappedEdgeP1 || !left.snappedEdgeP2 || !right.snappedEdgeP1 || !right.snappedEdgeP2) {
                return false;
            }
            const sameDirection = left.snappedEdgeP1.distanceToSquared(right.snappedEdgeP1) < 1e-10
                && left.snappedEdgeP2.distanceToSquared(right.snappedEdgeP2) < 1e-10;
            const reverseDirection = left.snappedEdgeP1.distanceToSquared(right.snappedEdgeP2) < 1e-10
                && left.snappedEdgeP2.distanceToSquared(right.snappedEdgeP1) < 1e-10;
            return Boolean(sameDirection || reverseDirection);
        }
        return left.point.distanceToSquared(right.point) < 1e-10;
    }

    getSnapLockDistance(pick, clientX, clientY) {
        if (pick?.snapType === "edge" && pick.snappedEdgeP1 && pick.snappedEdgeP2) {
            return this.getEdgeScreenDistance(pick.snappedEdgeP1, pick.snappedEdgeP2, clientX, clientY);
        }
        return pick?.point ? this.getPointScreenDistance(pick.point, clientX, clientY) : null;
    }

    applySnapLock(candidate, clientX, clientY) {
        const candidateType = candidate?.snapType || "face";
        const candidateSpecial = candidate && candidateType !== "face";
        if (!this.snapLock) {
            if (candidateSpecial) {
                this.snapLock = this.clonePick(candidate);
            }
            return candidate;
        }

        const locked = this.snapLock;
        if (candidateSpecial && (
            snapTypePriority(candidateType) < snapTypePriority(locked.snapType)
            || this.isSameSnapTarget(candidate, locked)
        )) {
            this.snapLock = this.clonePick(candidate);
            return candidate;
        }

        const lockDistance = this.getSnapLockDistance(locked, clientX, clientY);
        const releaseDistance = this.getSnapTolerance(locked.snapType) * this.snapOptions.releaseMultiplier;
        if (lockDistance !== null && lockDistance <= releaseDistance) {
            return this.clonePick(locked);
        }

        this.snapLock = candidateSpecial ? this.clonePick(candidate) : null;
        return candidate;
    }

    async pick(clientX, clientY) {
        if (!this.model || !this.camera || !this.canvas) {
            return null;
        }

        const raycastData = {
            camera: this.camera,
            mouse: new THREE.Vector2(clientX, clientY),
            dom: this.canvas
        };
        let hit = null;
        if (typeof this.model.raycastWithSnapping === "function") {
            const result = await this.model.raycastWithSnapping({
                ...raycastData,
                snappingClasses: [
                    MEASUREMENT_SNAPPING_CLASSES.POINT,
                    MEASUREMENT_SNAPPING_CLASSES.LINE,
                    MEASUREMENT_SNAPPING_CLASSES.FACE
                ]
            });
            hit = this.selectSnappingHit(result, clientX, clientY);
        } else {
            const raycast = typeof this.model.snapRaycast === "function"
                ? this.model.snapRaycast
                : this.model.raycast;
            if (typeof raycast !== "function") {
                return null;
            }
            hit = firstHit(await raycast.call(this.model, raycastData));
        }
        if (!hit) {
            return null;
        }

        const point = this.getPointFromHit(hit);
        if (!point) {
            return null;
        }

        return {
            hit,
            point,
            snapType: snappingTypeFromHit(hit),
            snappingClass: hit.snappingClass ?? null,
            snappedEdgeP1: vectorFromValue(hit.snappedEdgeP1),
            snappedEdgeP2: vectorFromValue(hit.snappedEdgeP2),
            localIds: await this.getLocalIdsFromHit(hit)
        };
    }

    getPointFromHit(hit) {
        return vectorFromValue(hit?.point)
            || vectorFromValue(hit?.position)
            || vectorFromValue(hit?.worldPoint)
            || vectorFromValue(hit?.intersection?.point)
            || vectorFromValue(hit);
    }

    async getLocalIdsFromHit(hit) {
        if (!hit) {
            return [];
        }

        const localIds = [];
        if (Array.isArray(hit.localIds)) {
            localIds.push(...hit.localIds);
        }
        if (hit.localId !== undefined) {
            localIds.push(hit.localId);
        }
        const directLocalIds = uniqueNumbers(localIds);
        if (directLocalIds.length) {
            return directLocalIds;
        }

        if (hit.itemId !== undefined && typeof this.model?.getLocalIdsFromItemIds === "function") {
            const itemId = toFiniteNumber(hit.itemId);
            if (itemId !== null) {
                const resolved = await this.model.getLocalIdsFromItemIds([itemId]);
                return uniqueNumbers(resolved);
            }
        }

        return [];
    }

    createMeasurement(startPick, endPick) {
        const start = startPick.point.clone();
        const end = endPick.point.clone();
        const distance = start.distanceTo(end);
        const id = `measurement-${this.nextId++}`;
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(lineGeometry, this.lineMaterial);
        line.name = `${id}-line`;
        line.renderOrder = 1000;

        const radius = this.getMeasurementPointRadius(Math.max(distance * 0.003, 0.03));
        const startMesh = this.createEndpoint(`${id}-start`, start, radius);
        const endMesh = this.createEndpoint(`${id}-end`, end, radius);
        const label = this.createLabel(formatDistance(distance, this.unit));

        const measurement = {
            id,
            unit: this.unit,
            start,
            end,
            distance,
            localIds: uniqueNumbers([...startPick.localIds, ...endPick.localIds]),
            startLocalIds: [...startPick.localIds],
            endLocalIds: [...endPick.localIds],
            objects: [line, startMesh, endMesh],
            label
        };

        for (const object of measurement.objects) {
            this.scene?.add(object);
        }
        if (label) {
            this.overlay.appendChild(label);
            this.updateLabelPosition(measurement);
        }

        return measurement;
    }

    createAngleMeasurement(firstPick, vertexPick, thirdPick) {
        const first = firstPick.point.clone();
        const vertex = vertexPick.point.clone();
        const third = thirdPick.point.clone();
        const firstVector = first.clone().sub(vertex);
        const thirdVector = third.clone().sub(vertex);
        if (firstVector.lengthSq() < 0.000001 || thirdVector.lengthSq() < 0.000001) {
            return null;
        }
        const angle = THREE.MathUtils.radToDeg(firstVector.angleTo(thirdVector));
        if (!Number.isFinite(angle)) {
            return null;
        }
        const id = `angle-measurement-${this.nextId++}`;
        const firstLineGeometry = new THREE.BufferGeometry().setFromPoints([vertex, first]);
        const thirdLineGeometry = new THREE.BufferGeometry().setFromPoints([vertex, third]);
        const firstLine = new THREE.Line(firstLineGeometry, this.lineMaterial);
        const thirdLine = new THREE.Line(thirdLineGeometry, this.lineMaterial);
        firstLine.name = `${id}-line-a`;
        thirdLine.name = `${id}-line-b`;
        firstLine.renderOrder = 1000;
        thirdLine.renderOrder = 1000;

        const radius = Math.max(Math.min(firstVector.length(), thirdVector.length()) * 0.18, 0.08);
        const pointRadius = this.getMeasurementPointRadius(radius * 0.08);
        const startMesh = this.createEndpoint(`${id}-first`, first, pointRadius);
        const vertexMesh = this.createEndpoint(`${id}-vertex`, vertex, pointRadius);
        const endMesh = this.createEndpoint(`${id}-third`, third, pointRadius);
        const arc = this.createAngleArc(`${id}-arc`, vertex, firstVector, thirdVector, radius);
        const labelPosition = this.getAngleLabelPosition(vertex, firstVector, thirdVector, radius * 1.35);
        const label = this.createLabel(formatAngle(angle));

        const measurement = {
            id,
            type: "angle",
            unit: "deg",
            first,
            vertex,
            third,
            angle,
            labelPosition,
            localIds: uniqueNumbers([
                ...firstPick.localIds,
                ...vertexPick.localIds,
                ...thirdPick.localIds
            ]),
            firstLocalIds: [...firstPick.localIds],
            vertexLocalIds: [...vertexPick.localIds],
            thirdLocalIds: [...thirdPick.localIds],
            objects: [firstLine, thirdLine, startMesh, vertexMesh, endMesh, arc].filter(Boolean),
            label
        };

        for (const object of measurement.objects) {
            this.scene?.add(object);
        }
        if (label) {
            this.overlay.appendChild(label);
            this.updateLabelPosition(measurement);
        }

        return measurement;
    }

    createAreaMeasurement(picks) {
        const validPicks = (picks || []).filter((pick) => pick?.point);
        if (validPicks.length < 3) {
            return null;
        }
        const points = validPicks.map((pick) => pick.point.clone());
        const polygonData = this.getProjectedPolygonData(points);
        if (!polygonData) {
            return null;
        }
        const area = polygonData.area;
        if (!Number.isFinite(area) || area <= 0.000001) {
            return null;
        }

        const id = `area-measurement-${this.nextId++}`;
        const closedPoints = [...points, points[0].clone()];
        const outlineGeometry = new THREE.BufferGeometry().setFromPoints(closedPoints);
        const outline = new THREE.Line(outlineGeometry, this.lineMaterial);
        outline.name = `${id}-outline`;
        outline.renderOrder = 1000;

        const areaGeometry = new THREE.BufferGeometry().setFromPoints(points);
        areaGeometry.setIndex(polygonData.indices);
        areaGeometry.computeVertexNormals();
        const areaMesh = new THREE.Mesh(areaGeometry, this.areaMaterial);
        areaMesh.name = `${id}-surface`;
        areaMesh.renderOrder = 999;
        areaMesh.userData.disposeGeometry = true;

        const radius = this.getMeasurementPointRadius(Math.sqrt(area) * 0.006);
        const pointMeshes = points.map((point, index) => this.createEndpoint(`${id}-point-${index + 1}`, point, radius));
        const labelPosition = this.getAreaLabelPosition(points) || this.getCentroid(points);
        const labelText = formatArea(area, this.unit);
        const label = this.createLabel(labelText);

        const measurement = {
            id,
            type: "area",
            unit: this.unit,
            first: points[0],
            second: points[1],
            third: points[2],
            points,
            area,
            labelPosition,
            labelText,
            localIds: uniqueNumbers(validPicks.flatMap((pick) => pick.localIds)),
            pointLocalIds: validPicks.map((pick) => [...pick.localIds]),
            firstLocalIds: [...validPicks[0].localIds],
            secondLocalIds: [...validPicks[1].localIds],
            thirdLocalIds: [...validPicks[2].localIds],
            objects: [areaMesh, outline, ...pointMeshes],
            label
        };

        for (const object of measurement.objects) {
            this.scene?.add(object);
        }
        if (label) {
            this.overlay.appendChild(label);
            this.updateLabelPosition(measurement);
        }

        return measurement;
    }

    getProjectedPolygonData(points) {
        const shapePoints = this.projectAreaPoints(points);
        if (!shapePoints) {
            return null;
        }
        const triangles = THREE.ShapeUtils.triangulateShape(shapePoints, []);
        if (!triangles.length) {
            return null;
        }
        const signedArea = THREE.ShapeUtils.area(shapePoints);
        return {
            area: Math.abs(signedArea),
            indices: triangles.flat()
        };
    }

    getPolygonBasis(points) {
        if (!Array.isArray(points) || points.length < 3) {
            return null;
        }
        const origin = points[0].clone();
        let normal = new THREE.Vector3();
        for (let index = 1; index < points.length - 1; index++) {
            const a = points[index].clone().sub(origin);
            const b = points[index + 1].clone().sub(origin);
            normal = a.cross(b);
            if (normal.lengthSq() > 0.000001) {
                break;
            }
        }
        if (normal.lengthSq() <= 0.000001) {
            return null;
        }
        normal.normalize();

        let xAxis = null;
        for (let index = 1; index < points.length; index++) {
            const candidate = points[index].clone().sub(origin);
            if (candidate.lengthSq() > 0.000001) {
                xAxis = candidate.normalize();
                break;
            }
        }
        if (!xAxis) {
            return null;
        }
        const yAxis = normal.clone().cross(xAxis).normalize();
        return {origin, normal, xAxis, yAxis};
    }

    validateAreaPick(pick) {
        if (!pick?.point) {
            return {valid: false, reason: "empty"};
        }
        const currentPoints = this.pendingPicks.map((item) => item.point);
        const points = [...currentPoints, pick.point];
        if (points.length >= 4 && !this.isNearAreaPlane(points)) {
            return {valid: false, reason: "non-planar"};
        }
        if (points.length < 4) {
            return {valid: true};
        }
        const projected = this.projectAreaPoints(points);
        if (!projected) {
            return {valid: true};
        }

        const newStartIndex = projected.length - 2;
        const newEndIndex = projected.length - 1;
        for (let index = 0; index <= projected.length - 4; index++) {
            if (this.segmentsIntersect2D(
                projected[newStartIndex],
                projected[newEndIndex],
                projected[index],
                projected[index + 1]
            )) {
                return {valid: false, reason: "self-intersection"};
            }
        }
        return {valid: true};
    }

    validateAreaCompletion() {
        const points = this.pendingPicks.map((pick) => pick.point);
        if (points.length < 3) {
            return {valid: false, reason: "insufficient-points"};
        }
        if (!this.isNearAreaPlane(points)) {
            return {valid: false, reason: "non-planar"};
        }
        if (points.length < 4) {
            return {valid: true};
        }
        const projected = this.projectAreaPoints(points);
        if (!projected) {
            return {valid: true};
        }

        const lastIndex = projected.length - 1;
        for (let index = 1; index <= projected.length - 3; index++) {
            if (this.segmentsIntersect2D(
                projected[lastIndex],
                projected[0],
                projected[index],
                projected[index + 1]
            )) {
                return {valid: false, reason: "self-intersection"};
            }
        }
        return {valid: true};
    }

    projectAreaPoints(points) {
        const basis = this.getPolygonBasis(points);
        if (!basis) {
            return null;
        }
        return points.map((point) => new THREE.Vector2(
            point.clone().sub(basis.origin).dot(basis.xAxis),
            point.clone().sub(basis.origin).dot(basis.yAxis)
        ));
    }

    isNearAreaPlane(points) {
        const basis = this.getPolygonBasis(points);
        if (!basis) {
            return false;
        }
        const tolerance = this.getAreaPlaneTolerance(points);
        return points.every((point) => Math.abs(point.clone().sub(basis.origin).dot(basis.normal)) <= tolerance);
    }

    getAreaPlaneTolerance(points) {
        const box = new THREE.Box3().setFromPoints(points);
        const size = box.getSize(new THREE.Vector3());
        return Math.max(size.x, size.y, size.z, 1) * 0.015;
    }

    segmentsIntersect2D(a, b, c, d) {
        const epsilon = 1e-7;
        const orientation = (p, q, r) => (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        const onSegment = (p, q, r) => q.x <= Math.max(p.x, r.x) + epsilon
            && q.x + epsilon >= Math.min(p.x, r.x)
            && q.y <= Math.max(p.y, r.y) + epsilon
            && q.y + epsilon >= Math.min(p.y, r.y);

        const o1 = orientation(a, b, c);
        const o2 = orientation(a, b, d);
        const o3 = orientation(c, d, a);
        const o4 = orientation(c, d, b);

        if (Math.abs(o1) < epsilon && onSegment(a, c, b)) {
            return true;
        }
        if (Math.abs(o2) < epsilon && onSegment(a, d, b)) {
            return true;
        }
        if (Math.abs(o3) < epsilon && onSegment(c, a, d)) {
            return true;
        }
        if (Math.abs(o4) < epsilon && onSegment(c, b, d)) {
            return true;
        }
        return (o1 > epsilon && o2 < -epsilon || o1 < -epsilon && o2 > epsilon)
            && (o3 > epsilon && o4 < -epsilon || o3 < -epsilon && o4 > epsilon);
    }

    getCentroid(points) {
        const centroid = new THREE.Vector3();
        for (const point of points) {
            centroid.add(point);
        }
        return centroid.multiplyScalar(1 / points.length);
    }

    getAreaLabelPosition(points) {
        const basis = this.getPolygonBasis(points);
        if (!basis) {
            return null;
        }
        const projected = points.map((point) => new THREE.Vector2(
            point.clone().sub(basis.origin).dot(basis.xAxis),
            point.clone().sub(basis.origin).dot(basis.yAxis)
        ));
        const center = new THREE.Vector2();
        for (const point of projected) {
            center.add(point);
        }
        center.multiplyScalar(1 / projected.length);
        return basis.origin.clone()
            .add(basis.xAxis.clone().multiplyScalar(center.x))
            .add(basis.yAxis.clone().multiplyScalar(center.y));
    }

    createAngleArc(name, vertex, firstVector, thirdVector, radius) {
        const start = firstVector.clone().normalize();
        const end = thirdVector.clone().normalize();
        if (!Number.isFinite(radius) || radius <= 0 || start.lengthSq() === 0 || end.lengthSq() === 0) {
            return null;
        }

        const dot = THREE.MathUtils.clamp(start.dot(end), -1, 1);
        const angle = Math.acos(dot);
        if (!Number.isFinite(angle) || angle <= 0.0001) {
            return null;
        }

        const points = [];
        const steps = Math.max(8, Math.min(48, Math.ceil(THREE.MathUtils.radToDeg(angle) / 5)));
        for (let index = 0; index <= steps; index++) {
            const t = index / steps;
            const sinTotal = Math.sin(angle);
            const direction = sinTotal < 0.0001
                ? start.clone().lerp(end, t).normalize()
                : start.clone().multiplyScalar(Math.sin((1 - t) * angle) / sinTotal)
                    .add(end.clone().multiplyScalar(Math.sin(t * angle) / sinTotal))
                    .normalize();
            points.push(vertex.clone().add(direction.multiplyScalar(radius)));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const arc = new THREE.Line(geometry, this.lineMaterial);
        arc.name = name;
        arc.renderOrder = 1000;
        return arc;
    }

    getAngleLabelPosition(vertex, firstVector, thirdVector, radius) {
        const firstDirection = firstVector.clone().normalize();
        const thirdDirection = thirdVector.clone().normalize();
        const direction = firstDirection.add(thirdDirection);
        if (direction.lengthSq() < 0.0001) {
            direction.copy(firstDirection);
        }
        return vertex.clone().add(direction.normalize().multiplyScalar(radius));
    }

    createEndpoint(name, position, radius) {
        const mesh = new THREE.Mesh(this.endpointGeometry, this.endpointMaterial);
        mesh.name = name;
        mesh.position.copy(position);
        mesh.scale.setScalar(radius);
        mesh.renderOrder = 1001;
        return mesh;
    }

    addPendingPick(pick) {
        this.pendingPicks.push(pick);
        if (!pick?.point) {
            return;
        }
        const radius = this.getPendingPointRadius(pick.point);
        const marker = this.createEndpoint(`pending-measure-${this.pendingPicks.length}`, pick.point, radius);
        marker.renderOrder = 1002;
        marker.userData.pendingMeasurement = true;
        this.pendingObjects.push(marker);
        this.scene?.add(marker);
        this.updatePendingVisuals();
    }

    getPendingPointRadius(point) {
        return this.getMeasurementPointRadius(point && this.camera?.position
            ? this.camera.position.distanceTo(point) * 0.0018
            : 0.04);
    }

    getMeasurementPointRadius(preferred = 0.04) {
        const box = this.model?.box;
        const fallback = Number.isFinite(preferred) && preferred > 0 ? preferred : 0.04;
        if (box && typeof box.getSize === "function" && !box.isEmpty()) {
            const size = box.getSize(new THREE.Vector3());
            const scale = Math.max(size.x, size.y, size.z, 1);
            const min = scale * 0.00018;
            const max = scale * 0.0012;
            return THREE.MathUtils.clamp(fallback, min, max);
        }
        return Math.min(Math.max(fallback, 0.015), 0.12);
    }

    clearPending() {
        this.clearPendingPreview();
        for (const object of this.pendingObjects) {
            this.scene?.remove(object);
        }
        this.pendingObjects = [];
        this.pendingStart = null;
        this.pendingPicks = [];
    }

    updatePendingVisuals() {
        if (!this.pendingPicks.length) {
            if (this.pendingPreviewKey) {
                this.clearPendingPreview();
            }
            return;
        }
        const points = this.pendingPicks.map((pick) => pick.point).filter(Boolean);
        const previewPoint = this.preview?.point;
        if (previewPoint && (this.mode !== "area" || points.length < 3)) {
            const lastPoint = points[points.length - 1];
            if (!lastPoint || lastPoint.distanceTo(previewPoint) > 0.000001) {
                points.push(previewPoint);
            }
        }
        if (points.length < 2) {
            if (this.pendingPreviewKey) {
                this.clearPendingPreview();
            }
            return;
        }

        const linePoints = this.mode === "area" && points.length >= 3
            ? [...points, points[0]]
            : points;
        const previewKey = [
            this.mode,
            ...linePoints.flatMap((point) => [
                point.x.toFixed(5),
                point.y.toFixed(5),
                point.z.toFixed(5)
            ])
        ].join("|");
        if (previewKey === this.pendingPreviewKey) {
            if (this.pendingPreviewMeasurement) {
                this.updateLabelPosition(this.pendingPreviewMeasurement);
            }
            return;
        }
        this.clearPendingPreview();
        this.pendingPreviewKey = previewKey;
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const line = new THREE.Line(lineGeometry, this.lineMaterial);
        line.name = "pending-measure-outline";
        line.renderOrder = 1000;
        line.userData.disposeGeometry = true;
        this.pendingPreviewObjects.push(line);
        this.scene?.add(line);

        if (this.mode === "area" && points.length >= 3) {
            const polygonData = this.getProjectedPolygonData(points);
            if (polygonData) {
                const areaGeometry = new THREE.BufferGeometry().setFromPoints(points);
                areaGeometry.setIndex(polygonData.indices);
                areaGeometry.computeVertexNormals();
                const mesh = new THREE.Mesh(areaGeometry, this.areaMaterial);
                mesh.name = "pending-measure-area";
                mesh.renderOrder = 998;
                mesh.userData.disposeGeometry = true;
                this.pendingPreviewObjects.push(mesh);
                this.scene?.add(mesh);

                const labelText = formatArea(polygonData.area, this.unit);
                const labelPosition = this.getAreaLabelPosition(points) || this.getCentroid(points);
                const label = this.createLabel(labelText);
                if (label) {
                    label.classList.add("measureLabelPreview");
                    this.overlay.appendChild(label);
                    this.pendingPreviewLabel = label;
                    this.pendingPreviewMeasurement = {
                        type: "area",
                        label,
                        labelText,
                        labelPosition
                    };
                    this.updateLabelPosition(this.pendingPreviewMeasurement);
                }
            }
        }
    }

    clearPendingPreview() {
        for (const object of this.pendingPreviewObjects) {
            this.scene?.remove(object);
            if (object.userData?.disposeGeometry && object.geometry) {
                object.geometry.dispose();
            }
        }
        this.pendingPreviewObjects = [];
        this.pendingPreviewLabel?.remove();
        this.pendingPreviewLabel = null;
        this.pendingPreviewMeasurement = null;
        this.pendingPreviewKey = "";
    }

    createLabel(text) {
        if (!this.overlay || typeof document === "undefined") {
            return null;
        }
        const style = window.getComputedStyle?.(this.overlay);
        if (!style || style.position === "static") {
            this.overlay.style.position = "relative";
        }
        return createMeasurementLabel(text);
    }

    removeMeasurement(measurement) {
        for (const object of measurement.objects || []) {
            this.scene?.remove(object);
            if ((object.isLine || object.userData?.disposeGeometry) && object.geometry) {
                object.geometry.dispose();
            }
        }
        measurement.label?.remove();
    }

    updateLabels() {
        for (const measurement of this.measurements) {
            this.updateLabelPosition(measurement);
        }
        if (this.pendingPreviewMeasurement) {
            this.updateLabelPosition(this.pendingPreviewMeasurement);
        }
    }

    updateLabelPosition(measurement) {
        if (!measurement.label || !this.camera || !this.canvas || !this.overlay) {
            return;
        }
        if (measurement.labelText && measurement.label.textContent !== measurement.labelText) {
            measurement.label.textContent = measurement.labelText;
        }

        const labelPosition = measurement.labelPosition
            || measurement.start?.clone().add(measurement.end).multiplyScalar(0.5);
        if (!labelPosition) {
            measurement.label.style.display = "none";
            return;
        }
        const projected = labelPosition.clone().project(this.camera);
        if (measurement.type !== "area" && (projected.z < -1 || projected.z > 1)) {
            measurement.label.style.display = "none";
            return;
        }

        const canvasRect = this.canvas.getBoundingClientRect();
        const overlayRect = this.overlay.getBoundingClientRect();
        const rawX = ((projected.x + 1) / 2) * canvasRect.width + canvasRect.left - overlayRect.left;
        const rawY = ((-projected.y + 1) / 2) * canvasRect.height + canvasRect.top - overlayRect.top;
        const x = measurement.type === "area" ? THREE.MathUtils.clamp(rawX, 24, Math.max(24, overlayRect.width - 24)) : rawX;
        const y = measurement.type === "area" ? THREE.MathUtils.clamp(rawY, 24, Math.max(24, overlayRect.height - 24)) : rawY;
        measurement.label.style.display = "";
        measurement.label.style.left = `${x}px`;
        measurement.label.style.top = `${measurement.type === "area" ? y - 10 : y}px`;
    }

    serializePick(pick) {
        return {
            point: vectorToArray(pick.point),
            snapType: pick.snapType || "face",
            snappingClass: pick.snappingClass ?? null,
            snappedEdge: pick.snappedEdgeP1 && pick.snappedEdgeP2
                ? [vectorToArray(pick.snappedEdgeP1), vectorToArray(pick.snappedEdgeP2)]
                : null,
            localIds: [...pick.localIds]
        };
    }

    serializeMeasurement(measurement) {
        if (measurement.type === "angle") {
            return {
                id: measurement.id,
                type: "angle",
                unit: measurement.unit,
                first: vectorToArray(measurement.first),
                vertex: vectorToArray(measurement.vertex),
                third: vectorToArray(measurement.third),
                angle: Number(measurement.angle.toFixed(ANGLE_DECIMALS)),
                text: formatAngle(measurement.angle),
                localIds: [...measurement.localIds],
                firstLocalIds: [...measurement.firstLocalIds],
                vertexLocalIds: [...measurement.vertexLocalIds],
                thirdLocalIds: [...measurement.thirdLocalIds]
            };
        }
        if (measurement.type === "area") {
            return {
                id: measurement.id,
                type: "area",
                unit: `${measurement.unit}^2`,
                first: vectorToArray(measurement.first),
                second: vectorToArray(measurement.second),
                third: vectorToArray(measurement.third),
                points: measurement.points.map((point) => vectorToArray(point)),
                area: Number(measurement.area.toFixed(AREA_DECIMALS)),
                text: formatArea(measurement.area, measurement.unit),
                localIds: [...measurement.localIds],
                pointLocalIds: measurement.pointLocalIds.map((localIds) => [...localIds]),
                firstLocalIds: [...measurement.firstLocalIds],
                secondLocalIds: [...measurement.secondLocalIds],
                thirdLocalIds: [...measurement.thirdLocalIds]
            };
        }
        return {
            id: measurement.id,
            type: "distance",
            unit: measurement.unit,
            start: vectorToArray(measurement.start),
            end: vectorToArray(measurement.end),
            distance: Number(measurement.distance.toFixed(DISTANCE_DECIMALS)),
            text: formatDistance(measurement.distance, measurement.unit),
            localIds: [...measurement.localIds],
            startLocalIds: [...measurement.startLocalIds],
            endLocalIds: [...measurement.endLocalIds]
        };
    }

    emitChange(reason) {
        const state = this.getState({includeDetails: reason !== "preview"});
        this.onChange?.(state, reason);
        this.dispatchEvent(new CustomEvent("change", {
            detail: {
                reason,
                state
            }
        }));
    }

    handleError(error) {
        this.onError?.(error);
        this.dispatchEvent(new CustomEvent("error", {
            detail: {
                error
            }
        }));
    }

    dispose() {
        this.clear();
        this.lineMaterial.dispose();
        this.endpointGeometry.dispose();
        this.endpointMaterial.dispose();
        this.areaMaterial.dispose();
    }
}

export default MeasurementEngine;
