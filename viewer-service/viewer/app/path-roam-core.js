export const PATH_ROAM_SCHEMA_VERSION = "bim-path-roam/v1";

export function nextPathRoamId(prefix = "path-roam") {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

export function normalizePathRoamCamera(cameraState = {}, defaults = {}) {
    if (!Array.isArray(cameraState.position) || !Array.isArray(cameraState.target)) {
        return null;
    }
    const position = cameraState.position.map(Number);
    const target = cameraState.target.map(Number);
    if (position.length < 3 || target.length < 3 || [...position, ...target].some((value) => !Number.isFinite(value))) {
        return null;
    }
    return {
        position,
        target,
        near: Number(cameraState.near) || Number(defaults.near) || 0.1,
        far: Number(cameraState.far) || Number(defaults.far) || 100000,
        zoom: Number(cameraState.zoom) || Number(defaults.zoom) || 1
    };
}

export function normalizePathRoamPoint(point, index = 0, options = {}) {
    const camera = normalizePathRoamCamera(point?.camera, options.cameraDefaults);
    if (!camera) {
        return null;
    }
    const defaultName = typeof options.pointName === "function"
        ? options.pointName(index)
        : `Path point ${index + 1}`;
    return {
        id: String(point.id || nextPathRoamId("path-point")),
        name: String(point.name || defaultName),
        time: Math.max(0, Number(point.time) || index * 3000),
        camera,
        states: {
            selection: point.states?.selection || null,
            section: point.states?.section || null,
            transform: point.states?.transform || null,
            visibility: point.states?.visibility || null
        }
    };
}

export function createPathRoamRoute(options = {}) {
    const now = options.now || new Date().toISOString();
    const defaultName = typeof options.routeName === "function"
        ? options.routeName(Number(options.index) || 0)
        : "Default route";
    return {
        id: String(options.id || nextPathRoamId("path-route")),
        name: String(options.name || defaultName),
        createdAt: options.createdAt || now,
        updatedAt: options.updatedAt || now,
        points: Array.isArray(options.points)
            ? options.points
                .map((point, index) => normalizePathRoamPoint(point, index, options))
                .filter(Boolean)
            : []
    };
}

export function normalizePathRoamRoute(route, index = 0, options = {}) {
    const defaultName = typeof options.routeName === "function"
        ? options.routeName(index)
        : `Route ${index + 1}`;
    return createPathRoamRoute({
        ...options,
        id: route?.id || `path-route-${index + 1}`,
        name: route?.name || defaultName,
        createdAt: route?.createdAt || route?.updatedAt || null,
        updatedAt: route?.updatedAt || null,
        points: Array.isArray(route?.points) ? route.points : []
    });
}

export function normalizePathRoamRouteTimes(route, options = {}) {
    const intervalMs = Math.max(1, Number(options.intervalMs) || 3000);
    const minimumGapMs = Math.max(1, Number(options.minimumGapMs) || 100);
    const sorted = [...(route?.points || [])]
        .map((point, index) => ({
            ...point,
            time: Math.max(0, Number(point.time) || index * intervalMs)
        }))
        .sort((a, b) => a.time - b.time);
    let previousTime = 0;
    route.points = sorted.map((point, index) => {
        if (index === 0) {
            previousTime = 0;
            return {...point, time: 0};
        }
        const time = Math.max(point.time, previousTime + minimumGapMs);
        previousTime = time;
        return {...point, time};
    });
    return route.points;
}

function interpolateNumber(a, b, t) {
    return Number(a || 0) + (Number(b || 0) - Number(a || 0)) * t;
}

function interpolateArray(a = [], b = [], t) {
    return [0, 1, 2].map((index) => interpolateNumber(a[index], b[index], t));
}

export function interpolatePathRoamCamera(from, to, t) {
    return {
        position: interpolateArray(from.position, to.position, t),
        target: interpolateArray(from.target, to.target, t),
        near: interpolateNumber(from.near, to.near, t),
        far: interpolateNumber(from.far, to.far, t),
        zoom: interpolateNumber(from.zoom, to.zoom, t)
    };
}

export function getPathRoamTotalDuration(points = []) {
    if (points.length < 2) {
        return 0;
    }
    return Math.max(Number(points.at(-1).time) - Number(points[0].time), 0);
}

export function getPathRoamCameraAt(points = [], timelineElapsedMs = 0) {
    if (!points.length) {
        return null;
    }
    if (points.length === 1) {
        return points[0].camera;
    }
    const firstTime = Number(points[0].time) || 0;
    const lastTime = Number(points.at(-1).time) || firstTime;
    const timelineTime = Math.min(firstTime + Math.max(0, Number(timelineElapsedMs) || 0), lastTime);
    for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        if (timelineTime <= to.time || index === points.length - 2) {
            const span = Math.max(to.time - from.time, 1);
            const t = Math.max(0, Math.min(1, (timelineTime - from.time) / span));
            return interpolatePathRoamCamera(from.camera, to.camera, t);
        }
    }
    return points.at(-1).camera;
}

export function getLatestPendingPathRoamKeyframe(points = [], elapsedMs = 0, appliedIds = new Set(), toleranceMs = 40) {
    if (!points.length) {
        return null;
    }
    const firstTime = Number(points[0].time) || 0;
    const timelineTime = firstTime + Math.max(0, Number(elapsedMs) || 0);
    let latest = null;
    for (const point of points) {
        if (appliedIds.has(point.id)) {
            continue;
        }
        if ((Number(point.time) || 0) <= timelineTime + toleranceMs) {
            latest = point;
        }
    }
    return latest;
}

