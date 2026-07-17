function normalizeValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? Number(value.toFixed(6)) : "";
    }
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    return String(value).trim();
}

export function compareGlobalIdEntries(baseEntries = [], compareEntries = []) {
    const base = new Map(baseEntries);
    const compare = new Map(compareEntries);
    const commonItems = [];
    const removedItems = [];
    const addedItems = [];

    for (const [globalId, localId] of base.entries()) {
        const compareLocalId = compare.get(globalId);
        if (typeof compareLocalId === "number") {
            commonItems.push({globalId, localId, compareLocalId});
        } else {
            removedItems.push({kind: "removed", side: "base", globalId, localId});
        }
    }
    for (const [globalId, localId] of compare.entries()) {
        if (!base.has(globalId)) {
            addedItems.push({kind: "added", side: "compare", globalId, localId});
        }
    }
    return {
        commonItems,
        removedItems,
        addedItems
    };
}

export function diffPropertySnapshots(base = {}, compare = {}, maxDiffs = 12) {
    const diffs = [];
    const fields = ["name", "category", "objectType", "predefinedType", "tag", "description"];
    for (const field of fields) {
        const baseValue = normalizeValue(base[field]);
        const compareValue = normalizeValue(compare[field]);
        if (baseValue !== compareValue) {
            diffs.push({field, base: baseValue || "-", compare: compareValue || "-"});
        }
    }

    const baseProperties = base.properties || {};
    const compareProperties = compare.properties || {};
    const ignoredKeyPattern = /(globalid|global id|guid|localid|local id|expressid|modelid|model id)$/i;
    const keys = [...new Set([...Object.keys(baseProperties), ...Object.keys(compareProperties)])]
        .filter((key) => !ignoredKeyPattern.test(key.split(".").pop() || key))
        .sort();
    for (const key of keys) {
        if (diffs.length >= maxDiffs) {
            break;
        }
        const baseValue = normalizeValue(baseProperties[key]);
        const compareValue = normalizeValue(compareProperties[key]);
        if (baseValue !== compareValue) {
            diffs.push({field: key, base: baseValue || "-", compare: compareValue || "-"});
        }
    }
    return diffs.slice(0, maxDiffs);
}

function distance(left = [], right = []) {
    const dx = Number(left[0] || 0) - Number(right[0] || 0);
    const dy = Number(left[1] || 0) - Number(right[1] || 0);
    const dz = Number(left[2] || 0) - Number(right[2] || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function vectorLength(value = []) {
    return Math.sqrt(
        Number(value[0] || 0) ** 2
        + Number(value[1] || 0) ** 2
        + Number(value[2] || 0) ** 2
    );
}

export function diffGeometrySignatures(base, compare, options = {}) {
    if (!base || !compare) {
        return null;
    }
    const absoluteTolerance = Math.max(0, Number(options.absoluteTolerance) || 0.001);
    const relativeTolerance = Math.max(0, Number(options.relativeTolerance) || 0.005);
    const centerDelta = distance(base.center, compare.center);
    const sizeDelta = distance(base.size, compare.size);
    const volumeDelta = Math.abs(Number(base.volume || 0) - Number(compare.volume || 0));
    const reference = Math.max(vectorLength(base.size), vectorLength(compare.size), 1);
    const volumeReference = Math.max(Number(base.volume || 0), Number(compare.volume || 0), 1);
    return {
        changed: centerDelta > Math.max(absoluteTolerance, reference * relativeTolerance)
            || sizeDelta > Math.max(absoluteTolerance, reference * relativeTolerance)
            || volumeDelta > volumeReference * relativeTolerance,
        centerDelta: Number(centerDelta.toFixed(4)),
        sizeDelta: Number(sizeDelta.toFixed(4)),
        volumeDelta: Number(volumeDelta.toFixed(4))
    };
}

export function compareFingerprintItems(items = [], options = {}) {
    const changedItems = [];
    for (const item of items) {
        const propertyDiffs = diffPropertySnapshots(item.baseProperties, item.compareProperties, options.maxPropertyDiffs || 12);
        const geometry = diffGeometrySignatures(item.baseGeometry, item.compareGeometry, options);
        if (!propertyDiffs.length && !geometry?.changed) {
            continue;
        }
        changedItems.push({
            kind: "changed",
            side: "both",
            globalId: item.globalId,
            localId: item.localId,
            compareLocalId: item.compareLocalId,
            propertyDiffs,
            geometry
        });
    }
    return changedItems;
}
