const DEFAULT_TREE_MODE = "models";
const NON_GEOMETRIC_CATEGORY_PATTERNS = [
    /TYPE$/i,
    /^IFCPROPERTY/i,
    /^IFCMATERIAL/i,
    /^IFC.*UNIT/i,
    /^IFCSIUNIT$/i,
    /^IFCDERIVEDUNIT$/i
];

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function uniqueNumbers(values) {
    return [...new Set((values || []).filter(isNumber))];
}

function toLocalId(value) {
    if (isNumber(value)) {
        return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mapToObject(value) {
    if (!value) {
        return {};
    }
    if (value instanceof Map) {
        return Object.fromEntries(value.entries());
    }
    return value;
}

function joinKey(prefix, key) {
    return prefix ? `${prefix}.${key}` : String(key);
}

function appendFlat(target, value, prefix, seen = new WeakSet(), depth = 0) {
    if (value === null || value === undefined || depth > 8) {
        return;
    }
    if (value instanceof Map) {
        for (const [key, child] of value.entries()) {
            appendFlat(target, child, joinKey(prefix, key), seen, depth + 1);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.slice(0, 50).forEach((child, index) => {
            appendFlat(target, child, joinKey(prefix, index), seen, depth + 1);
        });
        return;
    }
    if (typeof value === "object") {
        if (seen.has(value)) {
            return;
        }
        seen.add(value);
        if ("value" in value && Object.keys(value).length <= 3) {
            target[prefix] = value.value;
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            appendFlat(target, child, joinKey(prefix, key), seen, depth + 1);
        }
        return;
    }
    target[prefix] = value;
}

function pickValue(flat, keys) {
    for (const key of keys) {
        if (flat[key] !== undefined && flat[key] !== null && flat[key] !== "") {
            return String(flat[key]);
        }
    }
    const lowerKeys = keys.map((key) => key.toLowerCase());
    for (const [key, value] of Object.entries(flat)) {
        const last = key.split(".").pop().toLowerCase();
        if (lowerKeys.includes(last) && value !== undefined && value !== null && value !== "") {
            return String(value);
        }
    }
    return null;
}

function collectTreeLocalIds(item, result = []) {
    const localIds = new Set(result.filter(isNumber));
    const stack = item ? [item] : [];
    while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }
        if (Array.isArray(current.localIds)) {
            for (const id of current.localIds) {
                if (isNumber(id)) {
                    localIds.add(id);
                }
            }
            continue;
        }
        if (isNumber(current.localId)) {
            localIds.add(current.localId);
        }
        if (Array.isArray(current.children)) {
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
    }
    return [...localIds];
}

function getMode(mode) {
    if (typeof mode === "string") {
        return mode;
    }
    if (mode && typeof mode === "object" && typeof mode.mode === "string") {
        return mode.mode;
    }
    return DEFAULT_TREE_MODE;
}

function firstLocalIdFromResult(result, globalId) {
    if (Array.isArray(result)) {
        return result.find(isNumber) ?? null;
    }
    if (result instanceof Map) {
        return toLocalId(result.get(globalId));
    }
    if (result && typeof result === "object") {
        return toLocalId(result[globalId] ?? Object.values(result).find(isNumber));
    }
    return toLocalId(result);
}

function getCategoryMapLocalIds(categoryMap, category) {
    if (!categoryMap) {
        return [];
    }
    if (categoryMap instanceof Map) {
        return uniqueNumbers(categoryMap.get(category) || categoryMap.get(String(category).toLowerCase()) || categoryMap.get(String(category).toUpperCase()));
    }
    if (Array.isArray(categoryMap)) {
        return uniqueNumbers(categoryMap);
    }
    if (typeof categoryMap === "object") {
        if (Array.isArray(categoryMap[category])) {
            return uniqueNumbers(categoryMap[category]);
        }
        for (const [key, value] of Object.entries(categoryMap)) {
            if (String(key).toLowerCase() === String(category).toLowerCase()) {
                return uniqueNumbers(value);
            }
        }
    }
    return [];
}

function intersectNumbers(values, allowed) {
    if (!(allowed instanceof Set)) {
        return uniqueNumbers(values);
    }
    return uniqueNumbers(values).filter((id) => allowed.has(id));
}

function differenceNumbers(values, excluded) {
    if (!(excluded instanceof Set)) {
        return uniqueNumbers(values);
    }
    return uniqueNumbers(values).filter((id) => !excluded.has(id));
}

function countTreeNodes(item) {
    let count = 0;
    const stack = item ? [item] : [];
    while (stack.length) {
        const current = stack.pop();
        count++;
        if (Array.isArray(current?.children)) {
            for (const child of current.children) {
                stack.push(child);
            }
        }
    }
    return count;
}

function categoryBaseLabel(category) {
    const value = String(category || "");
    if (!value) {
        return "Group";
    }
    if (value === "ThatOpenGrid") {
        return "ThatOpenGrid";
    }
    return value;
}

function isLikelyMetadataCategory(category) {
    const value = String(category || "");
    return NON_GEOMETRIC_CATEGORY_PATTERNS.some((pattern) => pattern.test(value));
}

function asArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value instanceof Set) {
        return [...value];
    }
    if (value instanceof Map) {
        return [...value.values()];
    }
    return value === undefined || value === null ? [] : [value];
}

function getModelName(model) {
    return model?.name || model?.displayName || model?.modelId || "model";
}

export class SemanticQueryEngine extends EventTarget {
    constructor(options = {}) {
        super();
        this.model = options.model || null;
        this.spatialStructure = null;
        this.displaySpatialStructure = null;
        this.localIds = null;
        this.geometryLocalIds = null;
        this.spatialLocalIds = null;
        this.categories = null;
        this.categoryMap = null;
        this.searchCategoryByLocalId = null;
        this.searchStoreyByLocalId = null;
        this.globalIdByLocalId = new Map();
        this.localIdByGlobalId = new Map();
        this.initialized = false;
    }

    async init() {
        await Promise.all([
            this.getSpatialStructure(),
            this.getLocalIds(),
            this.getGeometryLocalIds(),
            this.getCategories()
        ]);
        this.initialized = true;
        this.dispatchEvent(new CustomEvent("ready", {
            detail: {
                localIds: this.localIds?.length || 0,
                categories: this.categories?.length || 0
            }
        }));
        return this;
    }

    async getSpatialStructure() {
        if (this.spatialStructure !== null) {
            return this.spatialStructure;
        }
        if (!this.model || typeof this.model.getSpatialStructure !== "function") {
            this.spatialStructure = null;
            return null;
        }
        try {
            this.spatialStructure = await this.model.getSpatialStructure();
        } catch {
            this.spatialStructure = null;
        }
        return this.spatialStructure;
    }

    async getLocalIds() {
        if (Array.isArray(this.localIds)) {
            return this.localIds;
        }
        if (!this.model) {
            this.localIds = [];
            return this.localIds;
        }
        try {
            if (typeof this.model.getLocalIds === "function") {
                this.localIds = uniqueNumbers(await this.model.getLocalIds());
                return this.localIds;
            }
        } catch {
            // Fall back to the spatial structure below.
        }
        this.localIds = collectTreeLocalIds(await this.getSpatialStructure());
        return this.localIds;
    }

    async getGeometryLocalIds() {
        if (Array.isArray(this.geometryLocalIds)) {
            return this.geometryLocalIds;
        }
        if (!this.model) {
            this.geometryLocalIds = [];
            return this.geometryLocalIds;
        }

        try {
            if (typeof this.model.getItemsWithGeometry === "function") {
                const result = await this.model.getItemsWithGeometry();
                const values = Array.isArray(result) ? result : asArray(result);
                if (values.every(isNumber)) {
                    this.geometryLocalIds = uniqueNumbers(values);
                    return this.geometryLocalIds;
                }
                const ids = [];
                for (const item of values) {
                    if (isNumber(item)) {
                        ids.push(item);
                    } else if (item && typeof item.getLocalId === "function") {
                        const id = await item.getLocalId();
                        if (isNumber(id)) {
                            ids.push(id);
                        }
                    } else if (isNumber(item?.localId)) {
                        ids.push(item.localId);
                    }
                }
                this.geometryLocalIds = uniqueNumbers(ids);
                return this.geometryLocalIds;
            }
        } catch {
            // Try the direct ID API below.
        }

        try {
            if (typeof this.model.getItemsIdsWithGeometry === "function") {
                this.geometryLocalIds = uniqueNumbers(await this.model.getItemsIdsWithGeometry());
                return this.geometryLocalIds;
            }
        } catch {
            // Fall back to spatial IDs below.
        }

        this.geometryLocalIds = await this.getSpatialLocalIds();
        return this.geometryLocalIds;
    }

    async getSpatialLocalIds() {
        if (Array.isArray(this.spatialLocalIds)) {
            return this.spatialLocalIds;
        }
        this.spatialLocalIds = collectTreeLocalIds(await this.getSpatialStructure());
        return this.spatialLocalIds;
    }

    async getCategories() {
        if (Array.isArray(this.categories)) {
            return this.categories;
        }
        if (!this.model) {
            this.categories = [];
            return this.categories;
        }
        try {
            if (typeof this.model.getCategories === "function") {
                this.categories = [...new Set((await this.model.getCategories()).filter(Boolean))]
                    .sort((a, b) => String(a).localeCompare(String(b)));
                return this.categories;
            }
        } catch {
            // Fall back to categories available from the spatial structure.
        }
        const categories = new Set();
        const structure = await this.getSpatialStructure();
        const stack = structure ? [structure] : [];
        while (stack.length) {
            const current = stack.pop();
            if (current?.category) {
                categories.add(current.category);
            }
            if (Array.isArray(current?.children)) {
                for (const child of current.children) {
                    stack.push(child);
                }
            }
        }
        this.categories = [...categories].sort((a, b) => String(a).localeCompare(String(b)));
        return this.categories;
    }

    async getTree(mode = DEFAULT_TREE_MODE) {
        const normalizedMode = getMode(mode);
        if (normalizedMode === "objects") {
            return this.buildObjectsTree();
        }
        if (normalizedMode === "classes") {
            return this.buildClassesTree();
        }
        if (normalizedMode === "storeys") {
            return this.buildStoreysTree();
        }
        return this.buildModelsTree();
    }

    async getItemInfo(localId) {
        const normalizedLocalId = toLocalId(localId);
        const result = {
            localId: normalizedLocalId,
            globalId: null,
            category: null,
            name: null,
            description: null,
            objectType: null,
            predefinedType: null,
            properties: {},
            materials: [],
            raw: {
                attributes: {},
                data: null,
                item: null,
                errors: []
            }
        };
        if (!this.model || normalizedLocalId === null) {
            return result;
        }

        result.globalId = await this.readGlobalId(normalizedLocalId, result.raw.errors);

        try {
            if (typeof this.model.getItem === "function") {
                const item = this.model.getItem(normalizedLocalId);
                result.raw.item = item || null;
                if (item && typeof item.getCategory === "function") {
                    result.category = await item.getCategory();
                }
                if (item && typeof item.getAttributes === "function") {
                    const attrs = await item.getAttributes();
                    result.raw.attributes = attrs && attrs.object ? attrs.object : mapToObject(attrs);
                }
            }
        } catch (error) {
            result.raw.errors.push({scope: "item", message: this.errorMessage(error)});
        }

        try {
            if (typeof this.model.getItemsData === "function") {
                const data = await this.model.getItemsData([normalizedLocalId], {
                    attributesDefault: true,
                    relations: {
                        IsDefinedBy: {attributes: true, relations: true},
                        DefinesOccurrence: {attributes: true, relations: true},
                        HasAssociations: {attributes: true, relations: true},
                        HasAssignments: {attributes: true, relations: true},
                        IsTypedBy: {attributes: true, relations: true},
                        HasPropertySets: {attributes: true, relations: true}
                    }
                });
                result.raw.data = Array.isArray(data) ? data[0] : data;
            }
        } catch (error) {
            result.raw.errors.push({scope: "data", message: this.errorMessage(error)});
        }

        try {
            if (typeof this.model.getItemsMaterialDefinition === "function") {
                result.materials = await this.model.getItemsMaterialDefinition([normalizedLocalId]);
            }
        } catch (error) {
            result.raw.errors.push({scope: "materials", message: this.errorMessage(error)});
        }

        const flat = {};
        appendFlat(flat, result.raw.attributes, "");
        appendFlat(flat, result.raw.data, "");
        result.properties = flat;
        result.globalId = result.globalId || pickValue(flat, ["GlobalId", "GlobalID", "globalId", "guid"]);
        result.name = pickValue(flat, ["Name", "name"]);
        result.description = pickValue(flat, ["Description", "description"]);
        result.objectType = pickValue(flat, ["ObjectType", "Object Type", "objectType"]);
        result.predefinedType = pickValue(flat, ["PredefinedType", "Predefined Type", "predefinedType"]);

        if (result.globalId) {
            this.cacheIdPair(normalizedLocalId, result.globalId);
        }

        return result;
    }

    async getGlobalId(localId) {
        const normalizedLocalId = toLocalId(localId);
        if (normalizedLocalId === null) {
            return null;
        }
        if (this.globalIdByLocalId.has(normalizedLocalId)) {
            return this.globalIdByLocalId.get(normalizedLocalId);
        }
        const globalId = await this.readGlobalId(normalizedLocalId);
        if (globalId) {
            return globalId;
        }
        const info = await this.getItemInfo(normalizedLocalId);
        return info.globalId || null;
    }

    async getLocalIdByGlobalId(globalId) {
        const normalizedGlobalId = globalId ? String(globalId) : "";
        if (!normalizedGlobalId || !this.model) {
            return null;
        }
        if (this.localIdByGlobalId.has(normalizedGlobalId)) {
            return this.localIdByGlobalId.get(normalizedGlobalId);
        }

        const directLocalId = await this.readLocalIdByGlobalId(normalizedGlobalId);
        if (directLocalId !== null) {
            return directLocalId;
        }

        for (const localId of await this.getLocalIds()) {
            const candidate = await this.getGlobalId(localId);
            if (candidate === normalizedGlobalId) {
                this.cacheIdPair(localId, normalizedGlobalId);
                return localId;
            }
        }
        return null;
    }

    async prepareSearchIndexMetadata() {
        if (this.searchCategoryByLocalId && this.searchStoreyByLocalId) {
            return {
                categories: this.searchCategoryByLocalId,
                storeys: this.searchStoreyByLocalId
            };
        }
        const categoryByLocalId = new Map();
        const categories = await this.getCategories();
        const categoryMap = await this.getCategoryMap(categories);
        if (categoryMap) {
            for (const category of categories) {
                for (const localId of getCategoryMapLocalIds(categoryMap, category)) {
                    categoryByLocalId.set(localId, String(category));
                }
            }
        }

        const storeyByLocalId = new Map();
        const storeysTree = await this.buildStoreysTree();
        for (const storey of storeysTree?.children || []) {
            let storeyName = storey.label || storey.category || "";
            if (isNumber(storey.localId)) {
                try {
                    const info = await this.getItemInfo(storey.localId);
                    storeyName = info.name || storeyName;
                } catch {
                    // Keep the spatial tree label when storey attributes are unavailable.
                }
            }
            for (const localId of storey.localIds || []) {
                storeyByLocalId.set(localId, storeyName);
            }
        }
        this.searchCategoryByLocalId = categoryByLocalId;
        this.searchStoreyByLocalId = storeyByLocalId;
        return {categories: categoryByLocalId, storeys: storeyByLocalId};
    }

    async getSearchIndexItems(localIds = []) {
        const ids = uniqueNumbers(localIds);
        if (!this.model || !ids.length) {
            return [];
        }
        const metadata = await this.prepareSearchIndexMetadata();
        let guids = [];
        let dataItems = [];
        try {
            if (typeof this.model.getGuidsByLocalIds === "function") {
                guids = asArray(await this.model.getGuidsByLocalIds(ids));
            }
        } catch {
            guids = [];
        }
        try {
            if (typeof this.model.getItemsData === "function") {
                dataItems = asArray(await this.model.getItemsData(ids, {attributesDefault: true}));
            }
        } catch {
            dataItems = [];
        }

        return ids.map((localId, index) => {
            const flat = {};
            appendFlat(flat, dataItems[index] || null, "");
            const globalId = guids[index]
                || pickValue(flat, ["GlobalId", "GlobalID", "globalId", "guid"])
                || "";
            if (globalId) {
                this.cacheIdPair(localId, globalId);
            }
            const category = metadata.categories.get(localId)
                || pickValue(flat, ["category", "Category", "className", "ClassName"])
                || "";
            return {
                localId,
                globalId,
                entityName: pickValue(flat, ["entityName", "EntityName", "Name", "name", "LongName"]) || "",
                category,
                className: pickValue(flat, ["className", "ClassName", "type", "Type"]) || category,
                storey: metadata.storeys.get(localId)
                    || pickValue(flat, ["storey", "Storey", "BuildingStorey", "Level", "Floor"])
                    || "",
                objectType: pickValue(flat, ["ObjectType", "Object Type", "objectType"]) || "",
                predefinedType: pickValue(flat, ["PredefinedType", "Predefined Type", "predefinedType"]) || ""
            };
        });
    }

    async buildModelsTree() {
        if (!this.model) {
            return null;
        }
        const localIds = await this.getLocalIds();
        const geometryLocalIds = await this.getGeometryLocalIds();
        const spatialLocalIds = await this.getSpatialLocalIds();
        const geometrySet = new Set(geometryLocalIds);
        const spatialGeometryLocalIds = intersectNumbers(spatialLocalIds, geometrySet);
        const metadataLocalIds = differenceNumbers(localIds, new Set(spatialLocalIds));
        const modelName = getModelName(this.model);
        return {
            label: modelName,
            category: modelName,
            localId: null,
            localIds: geometryLocalIds,
            meta: "model",
            children: [
                {
                    label: "geometric elements",
                    category: "geometric elements",
                    localId: null,
                    localIds: geometryLocalIds,
                    meta: `${geometryLocalIds.length} selectable`
                },
                {
                    label: "spatial tree entities",
                    category: "spatial tree entities",
                    localId: null,
                    localIds: spatialGeometryLocalIds,
                    meta: `${spatialLocalIds.length} entities / ${spatialGeometryLocalIds.length} selectable`
                },
                {
                    label: "all IFC entities",
                    category: "all IFC entities",
                    localId: null,
                    localIds: [],
                    dataLocalIds: localIds,
                    meta: `${localIds.length} total / ${metadataLocalIds.length} metadata`
                }
            ]
        };
    }

    async buildObjectsTree() {
        if (this.displaySpatialStructure !== null) {
            return this.displaySpatialStructure;
        }
        const spatial = await this.getSpatialStructure();
        const geometrySet = new Set(await this.getGeometryLocalIds());
        const roots = this.normalizeSpatialItems([spatial], geometrySet, true);
        this.displaySpatialStructure = roots[0] || null;
        return this.displaySpatialStructure;
    }

    async buildClassesTree() {
        const categories = await this.getCategories();
        const categoryMap = await this.getCategoryMap(categories);
        const geometrySet = new Set(await this.getGeometryLocalIds());
        const geometryChildren = [];
        const metadataChildren = [];

        for (const category of categories) {
            let localIds = getCategoryMapLocalIds(categoryMap, category);
            if (!localIds.length && !categoryMap) {
                localIds = await this.getLocalIdsOfCategory(category);
            }
            if (!localIds.length) {
                continue;
            }

            const geometryLocalIds = intersectNumbers(localIds, geometrySet);
            if (geometryLocalIds.length) {
                geometryChildren.push({
                    label: categoryBaseLabel(category),
                    category,
                    meta: `${geometryLocalIds.length} selectable`,
                    localId: null,
                    localIds: geometryLocalIds
                });
                continue;
            }

            metadataChildren.push({
                label: categoryBaseLabel(category),
                category,
                meta: isLikelyMetadataCategory(category) ? `${localIds.length} metadata` : `${localIds.length} non-geometric`,
                localId: null,
                localIds: [],
                dataLocalIds: localIds
            });
        }

        geometryChildren.sort((a, b) => String(a.category).localeCompare(String(b.category)));
        metadataChildren.sort((a, b) => String(a.category).localeCompare(String(b.category)));

        const children = [...geometryChildren];
        if (metadataChildren.length) {
            children.push({
                label: "non-geometric entities",
                category: "non-geometric entities",
                meta: `${metadataChildren.length} classes`,
                localId: null,
                localIds: [],
                dataLocalIds: uniqueNumbers(metadataChildren.flatMap((item) => item.dataLocalIds || [])),
                children: metadataChildren
            });
        }

        return {
            label: "classes",
            category: `classes (${geometryChildren.length})`,
            localId: null,
            localIds: await this.getGeometryLocalIds(),
            meta: `${geometryChildren.length} geometric classes`,
            children
        };
    }

    async getCategoryMap(categories = null) {
        if (this.categoryMap !== null) {
            return this.categoryMap;
        }
        const list = categories || await this.getCategories();
        try {
            if (this.model && typeof this.model.getItemsOfCategories === "function") {
                this.categoryMap = await this.model.getItemsOfCategories(
                    list.map((category) => new RegExp(`^${escapeRegExp(category)}$`))
                );
                return this.categoryMap;
            }
        } catch {
            this.categoryMap = null;
        }
        return this.categoryMap;
    }

    async buildStoreysTree() {
        const storeys = [];
        this.collectStoreys(await this.getSpatialStructure(), storeys, new Set(await this.getGeometryLocalIds()));
        return {
            label: "storeys",
            category: `storeys (${storeys.length})`,
            localId: null,
            localIds: uniqueNumbers(storeys.flatMap((storey) => storey.localIds || [])),
            meta: `${storeys.length}`,
            children: storeys
        };
    }

    collectStoreys(item, result, geometrySet = null) {
        const stack = item ? [item] : [];
        while (stack.length) {
            const current = stack.pop();
            const category = String(current?.category || "").toUpperCase();
            if (category === "IFCBUILDINGSTOREY" || category.includes("STOREY")) {
                const localIds = intersectNumbers(collectTreeLocalIds(current), geometrySet);
                const normalizedChildren = this.normalizeSpatialItems(
                    Array.isArray(current.children) ? current.children : [],
                    geometrySet,
                    false
                );
                result.push({
                    label: current.category || "IFCBUILDINGSTOREY",
                    category: current.category || "IFCBUILDINGSTOREY",
                    meta: `${localIds.length} selectable`,
                    localId: isNumber(current.localId) ? current.localId : null,
                    localIds,
                    children: normalizedChildren
                });
                continue;
            }
            if (Array.isArray(current?.children)) {
                for (let i = current.children.length - 1; i >= 0; i--) {
                    stack.push(current.children[i]);
                }
            }
        }
    }

    normalizeSpatialItems(items, geometrySet, keepRoot) {
        const result = [];
        for (const item of items || []) {
            if (!item || typeof item !== "object") {
                continue;
            }

            const rawChildren = Array.isArray(item.children) ? item.children : [];
            const children = this.normalizeSpatialItems(rawChildren, geometrySet, false);
            const localId = isNumber(item.localId) ? item.localId : null;
            const category = item.category || null;
            const rawLocalIds = collectTreeLocalIds(item);
            const selectableLocalIds = intersectNumbers(rawLocalIds, geometrySet);
            const isBridge = !category;

            if (isBridge && !keepRoot && children.length) {
                result.push(...children);
                continue;
            }

            if (!category && children.length === 1 && !keepRoot) {
                result.push(children[0]);
                continue;
            }

            const label = category ? categoryBaseLabel(category) : "Group";

            result.push({
                label,
                category: category || label,
                meta: selectableLocalIds.length
                    ? `${selectableLocalIds.length} selectable`
                    : `${rawLocalIds.length} entities`,
                localId,
                localIds: selectableLocalIds,
                children
            });
        }

        return result;
    }

    async getLocalIdsOfCategory(category) {
        const result = [];
        for (const localId of await this.getLocalIds()) {
            try {
                const item = typeof this.model.getItem === "function" ? this.model.getItem(localId) : null;
                const itemCategory = item && typeof item.getCategory === "function"
                    ? await item.getCategory()
                    : null;
                if (itemCategory === category) {
                    result.push(localId);
                }
            } catch {
                // Skip items that cannot be queried by this Fragments build.
            }
        }
        return result;
    }

    async readGlobalId(localId, errors = null) {
        if (!this.model || localId === null) {
            return null;
        }
        if (this.globalIdByLocalId.has(localId)) {
            return this.globalIdByLocalId.get(localId);
        }
        try {
            if (typeof this.model.getGuidsByLocalIds === "function") {
                const result = await this.model.getGuidsByLocalIds([localId]);
                const globalId = Array.isArray(result)
                    ? result[0]
                    : result instanceof Map
                        ? result.get(localId)
                        : result?.[localId];
                if (globalId) {
                    this.cacheIdPair(localId, globalId);
                    return String(globalId);
                }
            }
        } catch (error) {
            errors?.push({scope: "globalId", message: this.errorMessage(error)});
        }
        return null;
    }

    async readLocalIdByGlobalId(globalId) {
        const calls = [
            ["getLocalIdsByGuids", [globalId]],
            ["getLocalIdsByGlobalIds", [globalId]],
            ["getLocalIdByGuid", globalId],
            ["getLocalIdByGlobalId", globalId]
        ];
        for (const [method, arg] of calls) {
            try {
                if (typeof this.model[method] !== "function") {
                    continue;
                }
                const result = await this.model[method](arg);
                const localId = firstLocalIdFromResult(result, globalId);
                if (localId !== null) {
                    this.cacheIdPair(localId, globalId);
                    return localId;
                }
            } catch {
                // Try the next known API shape.
            }
        }
        return null;
    }

    cacheIdPair(localId, globalId) {
        if (!isNumber(localId) || !globalId) {
            return;
        }
        const normalizedGlobalId = String(globalId);
        this.globalIdByLocalId.set(localId, normalizedGlobalId);
        this.localIdByGlobalId.set(normalizedGlobalId, localId);
    }

    errorMessage(error) {
        return String(error && error.message ? error.message : error);
    }
}
