const DETAIL_FIELD_KEYS = [
    ["name", "构件名称", "identity"],
    ["category", "构件类型", "identity"],
    ["localId", "localId", "identity"],
    ["globalId", "globalId", "identity"],
    ["storey", "楼层", "location"],
    ["parentGlobalId", "父级GlobalId", "location"],
    ["count", "关联构件数", "stats"],
    ["childrenCount", "子节点数", "stats"],
    ["tag", "Tag", "property"],
    ["objectType", "ObjectType", "property"],
    ["predefinedType", "PredefinedType", "property"]
];

const DETAIL_TREE_CHILD_BATCH_SIZE = 120;
const DETAIL_GROUP_LABELS = {
    identity: "身份",
    location: "定位",
    stats: "统计",
    property: "属性"
};

function isNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function collectLocalIds(item, result = []) {
    const localIds = new Set(result.filter(isNumber));
    const stack = item ? [item] : [];
    while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }
        if (Array.isArray(current.localIds)) {
            current.localIds.filter(isNumber).forEach((id) => localIds.add(id));
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

function flattenValue(value, prefix = "", target = {}, depth = 0) {
    if (value === null || value === undefined || depth > 8) {
        return target;
    }
    if (Array.isArray(value)) {
        value.slice(0, 30).forEach((item, index) => flattenValue(item, `${prefix}.${index}`, target, depth + 1));
        return target;
    }
    if (value instanceof Map) {
        for (const [key, child] of value.entries()) {
            flattenValue(child, prefix ? `${prefix}.${key}` : String(key), target, depth + 1);
        }
        return target;
    }
    if (typeof value === "object") {
        if ("value" in value && Object.keys(value).length <= 3) {
            target[prefix] = value.value;
            return target;
        }
        for (const [key, child] of Object.entries(value)) {
            flattenValue(child, prefix ? `${prefix}.${key}` : key, target, depth + 1);
        }
        return target;
    }
    target[prefix] = value;
    return target;
}

function pickValue(flat, keys) {
    const lowerKeys = keys.map((key) => key.toLowerCase());
    for (const [key, value] of Object.entries(flat)) {
        if (value === null || value === undefined || value === "") {
            continue;
        }
        const last = key.split(".").pop().toLowerCase();
        if (lowerKeys.includes(last)) {
            return typeof value === "object" ? JSON.stringify(value) : String(value);
        }
    }
    return null;
}

function formatValue(value) {
    if (value === null || value === undefined || value === "") {
        return "-";
    }
    if (typeof value === "object") {
        if ("value" in value) {
            return formatValue(value.value);
        }
        return JSON.stringify(value);
    }
    return String(value);
}

function getDisplayEntityType(item) {
    const category = item?.category ? String(item.category) : "";
    if (/^IFC[A-Z0-9_]+$/.test(category) || /^ThatOpen[A-Za-z0-9_]+$/.test(category)) {
        return category;
    }
    return null;
}

function getTitleText(item, primaryLocalId, localIds, info = null) {
    return info?.name
        || item?.entityName
        || item?.name
        || item?.label
        || item?.category
        || (primaryLocalId !== null ? `localId ${primaryLocalId}` : `Group (${localIds.length})`);
}

function countDescendants(item) {
    if (!item) {
        return 0;
    }
    let count = 0;
    const stack = Array.isArray(item.children) ? [...item.children] : [];
    while (stack.length) {
        const current = stack.pop();
        count++;
        if (Array.isArray(current?.children)) {
            stack.push(...current.children);
        }
    }
    return count;
}

export class TreeDialogEngine {
    constructor(options = {}) {
        this.dialog = options.dialog;
        this.body = options.body;
        this.title = options.title;
        this.closeButton = options.closeButton;
        this.semanticEngine = options.semanticEngine || null;
        this.onSelect = options.onSelect || null;
        this.infoCache = new Map();
        this.activeNode = null;
        this.closeButton?.addEventListener("click", () => this.close());
        this.dialog?.addEventListener("click", (event) => {
            if (event.target === this.dialog) {
                this.close();
            }
        });
    }

    updateSemanticEngine(semanticEngine) {
        this.semanticEngine = semanticEngine || null;
        this.infoCache.clear();
    }

    open(root, options = {}) {
        if (!this.dialog || !this.body) {
            return;
        }
        this.body.textContent = "";
        this.title.textContent = options.title || "详细模型树";
        if (!root) {
            const empty = document.createElement("div");
            empty.className = "detailTreeEmpty";
            empty.textContent = "加载模型后展示详细模型树";
            this.body.appendChild(empty);
        } else {
            this.body.appendChild(this.createSummary(root));
            const list = document.createElement("ul");
            list.className = "detailTreeList";
            list.appendChild(this.createItem(root, 0));
            this.body.appendChild(list);
        }
        this.dialog.hidden = false;
    }

    close() {
        if (this.dialog) {
            this.dialog.hidden = true;
        }
    }

    createSummary(root) {
        const localIds = collectLocalIds(root);
        const childrenCount = Array.isArray(root?.children) ? root.children.length : 0;
        const summary = document.createElement("div");
        summary.className = "detailTreeSummary";

        const items = [
            ["当前层级", childrenCount],
            ["关联构件", localIds.length],
            ["全部节点", countDescendants(root) + 1],
            ["加载方式", "懒加载"]
        ];
        for (const [label, value] of items) {
            const item = document.createElement("div");
            item.className = "detailTreeSummaryItem";
            const labelEl = document.createElement("span");
            labelEl.textContent = label;
            const valueEl = document.createElement("strong");
            valueEl.textContent = formatValue(value);
            item.append(labelEl, valueEl);
            summary.appendChild(item);
        }
        return summary;
    }

    createItem(item, depth) {
        const localIds = collectLocalIds(item);
        const primaryLocalId = isNumber(item?.localId) ? item.localId : localIds[0] ?? null;
        const children = Array.isArray(item?.children) ? item.children : [];
        const li = document.createElement("li");
        li.className = "detailTreeItem";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "detailTreeNode";
        button.style.paddingLeft = `${Math.min(depth * 18 + 12, 72)}px`;
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            this.setActiveNode(button);
            if (localIds.length && this.onSelect) {
                await this.onSelect(localIds, primaryLocalId);
            }
        });

        const titleRow = document.createElement("div");
        titleRow.className = "detailTreeTitleRow";

        const toggle = document.createElement("span");
        toggle.className = "detailTreeToggle";
        toggle.textContent = children.length ? ">" : "";

        const title = document.createElement("span");
        title.className = "detailTreeTitle";
        title.textContent = getTitleText(item, primaryLocalId, localIds);

        titleRow.append(toggle, title);

        const meta = document.createElement("div");
        meta.className = "detailTreeMeta";
        this.renderNodeMeta(meta, item, primaryLocalId, localIds, null, children.length);

        button.append(titleRow, meta);
        li.appendChild(button);

        if (primaryLocalId !== null) {
            this.hydrateMeta(meta, primaryLocalId, item, localIds, title, children.length);
        }

        if (children.length) {
            const childList = document.createElement("ul");
            childList.className = "detailTreeList detailTreeChildren collapsed";
            childList.dataset.lazy = "true";
            toggle.addEventListener("click", (event) => {
                event.stopPropagation();
                this.hydrateChildren(childList, children, depth + 1);
                const collapsed = childList.classList.toggle("collapsed");
                toggle.textContent = collapsed ? ">" : "v";
            });
            li.appendChild(childList);
        }

        return li;
    }

    setActiveNode(button) {
        if (this.activeNode && this.activeNode !== button) {
            this.activeNode.classList.remove("active");
        }
        this.activeNode = button;
        this.activeNode.classList.add("active");
    }

    hydrateChildren(list, children, depth) {
        if (!list || list.dataset.lazy !== "true") {
            return;
        }
        list.dataset.rendered = "0";
        const fragment = document.createDocumentFragment();
        this.appendChildrenBatch(fragment, list, children, depth);
        list.appendChild(fragment);
        list.dataset.lazy = "false";
    }

    appendChildrenBatch(fragment, list, children, depth) {
        const rendered = Number(list.dataset.rendered || 0);
        const next = Math.min(rendered + DETAIL_TREE_CHILD_BATCH_SIZE, children.length);
        for (let index = rendered; index < next; index++) {
            fragment.appendChild(this.createItem(children[index], depth));
        }
        list.dataset.rendered = String(next);
        list.querySelector(":scope > .detailTreeLoadMoreItem")?.remove();
        if (next < children.length) {
            fragment.appendChild(this.createLoadMore(list, children, depth, next));
        }
    }

    createLoadMore(list, children, depth, rendered) {
        const li = document.createElement("li");
        li.className = "detailTreeLoadMoreItem";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "detailTreeLoadMore";
        button.textContent = `加载更多 ${children.length - rendered} 个节点`;
        button.style.paddingLeft = `${Math.min(depth * 18 + 30, 90)}px`;
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const fragment = document.createDocumentFragment();
            this.appendChildrenBatch(fragment, list, children, depth);
            list.appendChild(fragment);
        });
        li.appendChild(button);
        return li;
    }

    renderNodeMeta(container, item, localId, localIds, info = null, childrenCount = 0) {
        container.textContent = "";
        const fields = this.buildFields(item, localId, localIds, info, childrenCount);
        const grouped = new Map();
        for (const field of fields) {
            if (!grouped.has(field.group)) {
                grouped.set(field.group, []);
            }
            grouped.get(field.group).push(field);
        }
        for (const [group, groupFields] of grouped.entries()) {
            const section = document.createElement("div");
            section.className = "detailFieldGroup";

            const groupTitle = document.createElement("div");
            groupTitle.className = "detailFieldGroupTitle";
            groupTitle.textContent = DETAIL_GROUP_LABELS[group] || group;
            section.appendChild(groupTitle);

            const grid = document.createElement("div");
            grid.className = "detailFieldGrid";
            for (const field of groupFields) {
                const row = document.createElement("div");
                row.className = `detailField detailField-${field.key}`;

                const label = document.createElement("span");
                label.className = "detailFieldLabel";
                label.textContent = field.label;

                const value = document.createElement("strong");
                value.className = "detailFieldValue";
                value.textContent = formatValue(field.value);
                value.title = value.textContent;

                row.append(label, value);
                grid.appendChild(row);
            }
            section.appendChild(grid);
            container.appendChild(section);
        }
    }

    buildFields(item, localId, localIds, info = null, childrenCount = 0) {
        const raw = {
            localId,
            count: localIds.length,
            childrenCount,
            category: info?.category || getDisplayEntityType(item),
            name: info?.name || item?.entityName || item?.name || item?.label,
            globalId: info?.globalId || info?.guid,
            storey: info?.storey,
            parentGlobalId: info?.parentGlobalId,
            tag: info?.tag,
            objectType: info?.objectType,
            predefinedType: info?.predefinedType
        };

        const fields = DETAIL_FIELD_KEYS
            .map(([key, label, group]) => ({
                key,
                label,
                group,
                value: raw[key]
            }))
            .filter(({value}) => value !== null && value !== undefined && value !== "");
        return fields.length ? fields : [{
            key: "empty",
            label: "节点信息",
            group: "stats",
            value: localIds.length || childrenCount || "-"
        }];
    }

    async hydrateMeta(container, localId, item, localIds, title = null, childrenCount = 0) {
        if (!this.semanticEngine || this.infoCache.has(localId)) {
            const cached = this.infoCache.get(localId);
            if (cached) {
                if (title) {
                    title.textContent = getTitleText(item, localId, localIds, cached);
                }
                this.renderNodeMeta(container, item, localId, localIds, cached, childrenCount);
            }
            return;
        }
        try {
            const info = await this.semanticEngine.getItemInfo(localId);
            const flat = {};
            flattenValue(info, "", flat);
            const richInfo = {
                ...info,
                globalId: info.globalId || pickValue(flat, ["GlobalId", "GlobalID", "guid"]),
                name: info.name || pickValue(flat, ["Name", "LongName"]),
                category: info.category,
                storey: pickValue(flat, ["storey", "BuildingStorey", "Level", "楼层"]),
                parentGlobalId: pickValue(flat, ["parentGlobalId", "ParentGlobalId", "parentGuid"]),
                tag: pickValue(flat, ["Tag", "tag"]),
                objectType: info.objectType || pickValue(flat, ["ObjectType", "objectType"]),
                predefinedType: info.predefinedType || pickValue(flat, ["PredefinedType", "predefinedType"])
            };
            this.infoCache.set(localId, richInfo);
            if (title) {
                title.textContent = getTitleText(item, localId, localIds, richInfo);
            }
            this.renderNodeMeta(container, item, localId, localIds, richInfo, childrenCount);
        } catch {
            this.infoCache.set(localId, null);
        }
    }
}
