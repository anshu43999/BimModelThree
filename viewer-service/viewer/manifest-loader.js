export const MANIFEST_SCHEMA_VERSION = "bim-model-manifest/v1";

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, label) {
    if (!isObject(value)) {
        throw new Error(`${label} must be an object`);
    }
}

function resolveResourceUrl(value, baseUrl) {
    if (!value) {
        return "";
    }
    return new URL(value, baseUrl).href;
}

function looksLikeWindowsPath(value) {
    return /^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value);
}

export function normalizeManifestUrl(manifestUrl, baseUrl = window.location.href) {
    const value = String(manifestUrl || "").trim();
    if (!value) {
        throw new Error("manifestUrl is required");
    }
    if (looksLikeWindowsPath(value)) {
        throw new Error("Manifest path must be a browser-accessible URL, for example /converted/manifest.json");
    }
    let normalized = value.replace(/\\/g, "/");
    if (/^converted\//i.test(normalized)) {
        normalized = `/${normalized}`;
    }
    return new URL(normalized, baseUrl).href;
}

export function normalizeManifest(manifest, manifestUrl = window.location.href) {
    assertObject(manifest, "Manifest");

    if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
        throw new Error(`Unsupported manifest schema: ${manifest.schemaVersion || "(missing)"}`);
    }

    assertObject(manifest.resources, "Manifest resources");
    assertObject(manifest.resources.fragments, "Manifest resources.fragments");

    const fragmentUrl = manifest.resources.fragments.url;
    if (!fragmentUrl) {
        throw new Error("Manifest resources.fragments.url is required");
    }

    const baseUrl = new URL(manifestUrl, window.location.href).href;
    const normalized = structuredClone(manifest);
    normalized.manifestUrl = baseUrl;
    normalized.resources.fragments.url = resolveResourceUrl(fragmentUrl, baseUrl);

    for (const [key, resource] of Object.entries(normalized.resources)) {
        if (key === "fragments" || !isObject(resource) || !resource.url) {
            continue;
        }
        resource.url = resolveResourceUrl(resource.url, baseUrl);
    }

    return normalized;
}

export async function loadModelManifest(manifestUrl) {
    const normalizedUrl = normalizeManifestUrl(manifestUrl);

    const response = await fetch(normalizedUrl, {
        headers: {
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`Manifest fetch failed: HTTP ${response.status} ${response.statusText} (${normalizedUrl})`);
    }

    let manifest;
    try {
        manifest = await response.json();
    } catch (error) {
        throw new Error(`Manifest JSON parse failed: ${error.message || error} (${normalizedUrl})`);
    }
    return normalizeManifest(manifest, response.url || normalizedUrl);
}
