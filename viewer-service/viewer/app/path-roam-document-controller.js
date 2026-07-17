import {
    PATH_ROAM_SCHEMA_VERSION,
    createPathRoamRoute,
    nextPathRoamId,
    normalizePathRoamCamera,
    normalizePathRoamRoute,
    normalizePathRoamRouteTimes
} from "./path-roam-core.js";

/** Shared route/keyframe document CRUD and persistence for path roam. */
export class PathRoamDocumentController {
    constructor(options = {}) {
        if (Object.hasOwn(options, "storage")) {
            this.storage = options.storage || null;
        } else {
            try {
                this.storage = globalThis.localStorage || null;
            } catch {
                this.storage = null;
            }
        }
        this.getModelId = options.getModelId || (() => null);
        this.getModelName = options.getModelName || (() => this.getModelId() || "model");
        this.getStorageKey = options.getStorageKey || (() => "");
        this.getCameraDefaults = options.getCameraDefaults || (() => ({}));
        this.defaultRouteName = options.defaultRouteName || (() => "Default route");
        this.routeName = options.routeName || ((index) => `Route ${index + 1}`);
        this.pointName = options.pointName || ((index) => `Path point ${index + 1}`);
        this.unnamedRouteName = options.unnamedRouteName || "Unnamed route";
        this.unnamedPointName = options.unnamedPointName || "Unnamed keyframe";
        this.document = null;
    }

    getNormalizeOptions() {
        return {
            routeName: this.routeName,
            pointName: this.pointName,
            cameraDefaults: this.getCameraDefaults()
        };
    }

    createDocument(routes = null, activeRouteId = null) {
        const normalizeOptions = this.getNormalizeOptions();
        const normalizedRoutes = Array.isArray(routes) && routes.length
            ? routes.map((route, index) => normalizePathRoamRoute(route, index, normalizeOptions)).filter(Boolean)
            : [createPathRoamRoute({
                name: this.defaultRouteName(),
                ...normalizeOptions
            })];
        const activeId = normalizedRoutes.some((route) => route.id === activeRouteId)
            ? activeRouteId
            : normalizedRoutes[0]?.id || null;
        this.document = {
            schemaVersion: PATH_ROAM_SCHEMA_VERSION,
            modelId: this.getModelId() || null,
            modelName: this.getModelName() || this.getModelId() || "model",
            activeRouteId: activeId,
            updatedAt: new Date().toISOString(),
            routes: normalizedRoutes
        };
        return this.document;
    }

    load() {
        const modelId = this.getModelId();
        const key = this.getStorageKey();
        if (!modelId || !key) {
            return this.createDocument();
        }
        try {
            const parsed = JSON.parse(this.storage?.getItem(key) || "null");
            const routes = Array.isArray(parsed?.routes) && parsed.routes.length
                ? parsed.routes
                : [createPathRoamRoute({
                    name: parsed?.name || this.defaultRouteName(),
                    createdAt: parsed?.createdAt || parsed?.updatedAt || null,
                    updatedAt: parsed?.updatedAt || null,
                    points: Array.isArray(parsed?.points) ? parsed.points : [],
                    ...this.getNormalizeOptions()
                })];
            const documentState = this.createDocument(routes, parsed?.activeRouteId);
            if (parsed?.schemaVersion === PATH_ROAM_SCHEMA_VERSION) {
                documentState.createdAt = parsed.createdAt || parsed.updatedAt || null;
            }
            return documentState;
        } catch {
            return this.createDocument();
        }
    }

    save() {
        const key = this.getStorageKey();
        if (!key || !this.document || !this.getModelId()) {
            return null;
        }
        this.document.updatedAt = new Date().toISOString();
        try {
            this.storage?.setItem(key, JSON.stringify(this.document));
        } catch {
            // Persistence is optional in restricted iframe/browser contexts.
        }
        return this.document;
    }

    ensure() {
        if (!this.document || this.document.modelId !== this.getModelId()) {
            return this.load();
        }
        return this.document;
    }

    clearDocument() {
        this.document = null;
    }

    getActiveRoute() {
        const documentState = this.ensure();
        if (!Array.isArray(documentState.routes) || !documentState.routes.length) {
            documentState.routes = [createPathRoamRoute({
                name: this.defaultRouteName(),
                ...this.getNormalizeOptions()
            })];
            documentState.activeRouteId = documentState.routes[0].id;
        }
        const active = documentState.routes.find((route) => route.id === documentState.activeRouteId);
        if (active) {
            return active;
        }
        documentState.activeRouteId = documentState.routes[0].id;
        return documentState.routes[0];
    }

    getPoints() {
        return [...(this.getActiveRoute().points || [])].sort((a, b) => a.time - b.time);
    }

    summarizeRoute(route) {
        return {
            id: route.id,
            name: route.name || this.unnamedRouteName,
            pointCount: Array.isArray(route.points) ? route.points.length : 0,
            createdAt: route.createdAt || null,
            updatedAt: route.updatedAt || null
        };
    }

    summarizePoint(point, index = 0) {
        return {
            id: point.id,
            name: point.name || this.pointName(index),
            time: point.time,
            camera: point.camera,
            states: point.states || {}
        };
    }

    listRoutes() {
        const documentState = this.ensure();
        return {
            schemaVersion: documentState.schemaVersion,
            modelId: documentState.modelId,
            modelName: documentState.modelName,
            activeRouteId: documentState.activeRouteId,
            routes: documentState.routes.map((route) => this.summarizeRoute(route))
        };
    }

    listPoints() {
        return {
            route: this.summarizeRoute(this.getActiveRoute()),
            points: this.getPoints().map((point, index) => this.summarizePoint(point, index))
        };
    }

    createRoute(payload = {}) {
        const documentState = this.ensure();
        const route = createPathRoamRoute({
            name: payload.name || this.routeName(documentState.routes.length),
            ...this.getNormalizeOptions()
        });
        documentState.routes.push(route);
        documentState.activeRouteId = route.id;
        this.save();
        return route;
    }

    switchRoute(routeId) {
        const documentState = this.ensure();
        const route = documentState.routes.find((item) => item.id === routeId);
        if (!route) {
            return null;
        }
        documentState.activeRouteId = route.id;
        this.save();
        return route;
    }

    updateRoute(payload = {}) {
        const route = this.getActiveRoute();
        const name = String(payload.name ?? route.name ?? "").trim();
        route.name = name || route.name || this.unnamedRouteName;
        route.updatedAt = new Date().toISOString();
        this.save();
        return route;
    }

    deleteRoute(routeId = null) {
        const documentState = this.ensure();
        if (documentState.routes.length <= 1) {
            return null;
        }
        const route = routeId
            ? documentState.routes.find((item) => item.id === routeId)
            : this.getActiveRoute();
        if (!route) {
            return null;
        }
        documentState.routes = documentState.routes.filter((item) => item.id !== route.id);
        documentState.activeRouteId = documentState.routes[0]?.id || null;
        this.save();
        return route;
    }

    updatePoint(pointId, patch = {}) {
        const route = this.getActiveRoute();
        const point = route.points.find((item) => item.id === pointId);
        if (!point) {
            return null;
        }
        if (Object.hasOwn(patch, "name")) {
            point.name = String(patch.name || "").trim() || point.name || this.unnamedPointName;
        }
        if (Object.hasOwn(patch, "time")) {
            point.time = Math.max(0, Number(patch.time) || 0);
            normalizePathRoamRouteTimes(route);
        }
        route.updatedAt = new Date().toISOString();
        this.save();
        return point;
    }

    recapturePoint(pointId, camera, states = {}) {
        const route = this.getActiveRoute();
        const point = route.points.find((item) => item.id === pointId);
        const cameraState = normalizePathRoamCamera(camera, this.getCameraDefaults());
        if (!point || !cameraState) {
            return null;
        }
        point.camera = cameraState;
        point.states = {
            selection: states.selection || null,
            section: states.section || null,
            transform: states.transform || null,
            visibility: states.visibility || null
        };
        route.updatedAt = new Date().toISOString();
        this.save();
        return point;
    }

    movePoint(pointId, direction) {
        const route = this.getActiveRoute();
        const points = route.points;
        const index = points.findIndex((point) => point.id === pointId);
        const nextIndex = index + Number(direction);
        if (index < 0 || nextIndex < 0 || nextIndex >= points.length) {
            return null;
        }
        const currentTime = points[index].time;
        points[index].time = points[nextIndex].time;
        points[nextIndex].time = currentTime;
        [points[index], points[nextIndex]] = [points[nextIndex], points[index]];
        normalizePathRoamRouteTimes(route);
        route.updatedAt = new Date().toISOString();
        this.save();
        return points[nextIndex];
    }

    addPoint(options = {}) {
        const camera = normalizePathRoamCamera(options.camera, this.getCameraDefaults());
        if (!camera) {
            return null;
        }
        const route = this.getActiveRoute();
        const last = route.points.at(-1);
        const point = {
            id: options.id || nextPathRoamId("path-point"),
            name: options.name || this.pointName(route.points.length),
            time: Number.isFinite(Number(options.time))
                ? Math.max(0, Number(options.time))
                : (last ? last.time + 3000 : 0),
            camera,
            states: {
                selection: options.states?.selection || null,
                section: options.states?.section || null,
                transform: options.states?.transform || null,
                visibility: options.states?.visibility || null
            }
        };
        route.points.push(point);
        route.points.sort((a, b) => a.time - b.time);
        route.updatedAt = new Date().toISOString();
        this.save();
        return point;
    }

    deletePoint(pointId) {
        const route = this.getActiveRoute();
        const deleted = route.points.find((point) => point.id === pointId) || null;
        if (!deleted) {
            return null;
        }
        route.points = route.points
            .filter((point) => point.id !== pointId)
            .map((point, index) => ({...point, time: index * 3000}));
        route.updatedAt = new Date().toISOString();
        this.save();
        return deleted;
    }

    clearPoints() {
        const route = this.getActiveRoute();
        route.points = [];
        route.updatedAt = new Date().toISOString();
        this.save();
        return route;
    }
}
