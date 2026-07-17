const DEFAULT_BASE_URL = "/api/business-data";
const ALLOWED_TYPES = new Set(["viewpoints", "labels", "annotations", "snapshots"]);

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeType(type) {
    const normalized = String(type || "").trim();
    if (!ALLOWED_TYPES.has(normalized)) {
        throw new Error(`Unsupported business data type: ${type}`);
    }
    return normalized;
}

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

function appendQuery(url, query = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(isObject(query) ? query : {})) {
        if (value === undefined || value === null || value === "") {
            continue;
        }
        params.set(key, String(value));
    }
    const text = params.toString();
    return text ? `${url}?${text}` : url;
}

async function parseResponse(response) {
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
        const message = body?.error?.message || body?.message || `Business data request failed: ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.body = body;
        throw error;
    }
    return body;
}

/**
 * Thin REST adapter used by BimViewerSDK to sync business-side data.
 *
 * Supported resource types are exported as BUSINESS_DATA_TYPES:
 * - viewpoints
 * - labels
 * - annotations
 * - snapshots
 *
 * Expected backend contract:
 * - GET    /{type}?query -> {items, count, type}
 * - GET    /{type}/{id}  -> {item}
 * - POST   /{type}       -> {item}
 * - PUT    /{type}/{id}  -> {item}
 * - DELETE /{type}/{id}  -> any JSON response
 */
export class BusinessDataApiClient {
    /**
     * @param {object} options
     * @param {string} [options.baseUrl="/api/business-data"] REST API base URL.
     * @param {Function} [options.fetchImpl=globalThis.fetch] Custom fetch for tests or auth wrappers.
     * @param {Record<string,string>} [options.headers] Headers appended to every request.
     */
    constructor(options = {}) {
        this.baseUrl = trimTrailingSlash(options.baseUrl || DEFAULT_BASE_URL);
        this.fetchImpl = options.fetchImpl || globalThis.fetch;
        this.headers = {
            ...(options.headers || {})
        };
        if (typeof this.fetchImpl !== "function") {
            throw new Error("BusinessDataApiClient requires fetch");
        }
    }

    /** Build a resource URL with optional id and query string. */
    url(type, id = null, query = null) {
        const normalizedType = normalizeType(type);
        const encodedId = id === null || id === undefined || id === ""
            ? ""
            : `/${encodeURIComponent(String(id))}`;
        return appendQuery(`${this.baseUrl}/${normalizedType}${encodedId}`, query);
    }

    /** Execute one REST request and parse the standard JSON response. */
    async request(method, type, options = {}) {
        const hasBody = options.body !== undefined;
        const response = await this.fetchImpl(this.url(type, options.id, options.query), {
            method,
            headers: {
                ...(hasBody ? {"Content-Type": "application/json"} : {}),
                ...this.headers,
                ...(options.headers || {})
            },
            body: hasBody ? JSON.stringify(options.body || {}) : undefined,
            signal: options.signal
        });
        return parseResponse(response);
    }

    /** List resource items with optional filter query. */
    async list(type, filter = {}, options = {}) {
        const result = await this.request("GET", type, {
            query: filter,
            signal: options.signal
        });
        return {
            items: Array.isArray(result.items) ? result.items : [],
            count: Number(result.count || 0),
            type: result.type || normalizeType(type)
        };
    }

    /** Get one resource item by id. */
    async get(type, id, options = {}) {
        const result = await this.request("GET", type, {
            id,
            signal: options.signal
        });
        return result.item || null;
    }

    /** Create one resource item. */
    async create(type, payload = {}, options = {}) {
        const result = await this.request("POST", type, {
            body: payload,
            signal: options.signal
        });
        return result.item || null;
    }

    /** Update one resource item by id. */
    async update(type, id, patch = {}, options = {}) {
        const result = await this.request("PUT", type, {
            id,
            body: patch,
            signal: options.signal
        });
        return result.item || null;
    }

    /** Remove one resource item by id. */
    async remove(type, id, options = {}) {
        return this.request("DELETE", type, {
            id,
            signal: options.signal
        });
    }

    /** Convenience wrapper for list("viewpoints"). */
    listViewpoints(filter = {}, options = {}) {
        return this.list("viewpoints", filter, options);
    }

    /** Convenience wrapper for create("viewpoints"). */
    createViewpoint(payload = {}, options = {}) {
        return this.create("viewpoints", payload, options);
    }

    /** Convenience wrapper for update("viewpoints"). */
    updateViewpoint(id, patch = {}, options = {}) {
        return this.update("viewpoints", id, patch, options);
    }

    /** Convenience wrapper for remove("viewpoints"). */
    removeViewpoint(id, options = {}) {
        return this.remove("viewpoints", id, options);
    }

    /** Convenience wrapper for list("labels"). */
    listLabels(filter = {}, options = {}) {
        return this.list("labels", filter, options);
    }

    /** Convenience wrapper for create("labels"). */
    createLabel(payload = {}, options = {}) {
        return this.create("labels", payload, options);
    }

    /** Convenience wrapper for update("labels"). */
    updateLabel(id, patch = {}, options = {}) {
        return this.update("labels", id, patch, options);
    }

    /** Convenience wrapper for remove("labels"). */
    removeLabel(id, options = {}) {
        return this.remove("labels", id, options);
    }

    /** Convenience wrapper for list("annotations"). */
    listAnnotations(filter = {}, options = {}) {
        return this.list("annotations", filter, options);
    }

    /** Convenience wrapper for create("annotations"). */
    createAnnotation(payload = {}, options = {}) {
        return this.create("annotations", payload, options);
    }

    /** Convenience wrapper for update("annotations"). */
    updateAnnotation(id, patch = {}, options = {}) {
        return this.update("annotations", id, patch, options);
    }

    /** Convenience wrapper for remove("annotations"). */
    removeAnnotation(id, options = {}) {
        return this.remove("annotations", id, options);
    }

    /** Convenience wrapper for list("snapshots"). */
    listSnapshots(filter = {}, options = {}) {
        return this.list("snapshots", filter, options);
    }

    /** Convenience wrapper for create("snapshots"). */
    createSnapshot(payload = {}, options = {}) {
        return this.create("snapshots", payload, options);
    }

    /** Convenience wrapper for update("snapshots"). */
    updateSnapshot(id, patch = {}, options = {}) {
        return this.update("snapshots", id, patch, options);
    }

    /** Convenience wrapper for remove("snapshots"). */
    removeSnapshot(id, options = {}) {
        return this.remove("snapshots", id, options);
    }
}

export {ALLOWED_TYPES as BUSINESS_DATA_TYPES};
