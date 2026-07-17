import {createViewer, nodeTitle, byId, setText} from "./common-viewer.js";

const TREE_CHILD_BATCH_SIZE = 120;
const MAX_SELECT_LOCAL_IDS = 200;
const TREE_TABS = ["models", "objects", "classes", "storeys"];

const treeList = byId("treeList");
const props = byId("props");
const treeTabs = [...document.querySelectorAll("[data-tree-tab]")];
const labelCache = new Map();
let activeTab = "models";
let selectedTreeNode = null;

const sdk = await createViewer();

for (const button of treeTabs) {
    button.addEventListener("click", async () => {
        const tab = button.dataset.treeTab;
        if (!TREE_TABS.includes(tab) || tab === activeTab) {
            return;
        }
        activeTab = tab;
        await renderActiveTree();
    });
}

await renderActiveTree();

async function renderActiveTree() {
    setTreeTabActive(activeTab);
    treeList.textContent = "";
    selectedTreeNode = null;
    props.textContent = "请选择树节点";
    setText("status", `正在读取 ${activeTab} 树...`);

    try {
        const root = await sdk.getTree(activeTab);
        renderTree(root);
        const localIds = collectNodeLocalIds(root, MAX_SELECT_LOCAL_IDS);
        setText("status", `${activeTab} 树已生成，当前可定位构件 ${localIds.length}${localIds.length >= MAX_SELECT_LOCAL_IDS ? "+" : ""} 个`);
    } catch (error) {
        treeList.innerHTML = `<div class="treeEmpty">${activeTab} 树生成失败：${errorMessage(error)}</div>`;
        setText("status", "树生成失败");
    }
}

function setTreeTabActive(tab) {
    for (const button of treeTabs) {
        button.classList.toggle("active", button.dataset.treeTab === tab);
    }
}

function renderTree(root) {
    treeList.textContent = "";
    if (!root) {
        treeList.innerHTML = `<div class="treeEmpty">当前树没有可展示的数据</div>`;
        return;
    }

    const list = document.createElement("ul");
    list.className = "treeRoot";
    list.appendChild(createTreeItem(root, 0));
    treeList.appendChild(list);
    hydrateVisibleLabels();
}

function createTreeItem(item, depth) {
    const li = document.createElement("li");
    const children = Array.isArray(item?.children) ? item.children : [];
    const localIds = collectNodeLocalIds(item, MAX_SELECT_LOCAL_IDS);
    const localId = typeof item?.localId === "number" ? item.localId : localIds[0] ?? null;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "treeNode";
    row.style.paddingLeft = `${Math.min(depth * 10 + 6, 58)}px`;
    row.dataset.localId = localId === null ? "" : String(localId);
    if (localId !== null) {
        row.dataset.needsLabel = "true";
    }

    const toggle = document.createElement("span");
    toggle.className = "treeToggle";
    toggle.textContent = children.length ? ">" : "";
    toggle.title = children.length ? "展开节点" : "";

    const name = document.createElement("span");
    name.className = "treeName";
    name.textContent = getInitialLabel(item, localId, localIds);
    name.title = name.textContent;

    const meta = document.createElement("span");
    meta.className = "treeId";
    meta.textContent = getMetaLabel(item, localId, localIds);
    meta.title = meta.textContent;

    row.append(toggle, name, meta);
    row.addEventListener("click", async (event) => {
        event.stopPropagation();
        await selectTreeNode(row, item, localIds, localId);
    });
    toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleChildren(li, toggle, children, depth + 1);
    });
    li.appendChild(row);

    if (children.length) {
        const childList = document.createElement("ul");
        childList.className = "treeChildren collapsed";
        childList.dataset.lazy = "true";
        li.appendChild(childList);
    }

    return li;
}

function toggleChildren(itemElement, toggle, children, depth) {
    if (!children.length) {
        return;
    }

    const childList = itemElement.querySelector(":scope > .treeChildren");
    if (!childList) {
        return;
    }

    hydrateTreeChildren(childList, children, depth);
    const collapsed = childList.classList.toggle("collapsed");
    toggle.textContent = collapsed ? ">" : "v";
    toggle.title = collapsed ? "展开节点" : "收起节点";
    if (!collapsed) {
        hydrateVisibleLabels();
    }
}

function hydrateTreeChildren(list, children, depth) {
    if (!list || list.dataset.lazy !== "true") {
        return;
    }

    list.dataset.rendered = "0";
    const fragment = document.createDocumentFragment();
    appendTreeChildrenBatch(fragment, list, children, depth);
    list.appendChild(fragment);
    list.dataset.lazy = "false";
}

function appendTreeChildrenBatch(fragment, list, children, depth) {
    const rendered = Number(list.dataset.rendered || 0);
    const next = Math.min(rendered + TREE_CHILD_BATCH_SIZE, children.length);
    for (let index = rendered; index < next; index++) {
        fragment.appendChild(createTreeItem(children[index], depth));
    }
    list.dataset.rendered = String(next);

    const oldMore = list.querySelector(":scope > .treeLoadMoreItem");
    oldMore?.remove();
    if (next < children.length) {
        fragment.appendChild(createTreeLoadMore(list, children, depth, next));
    }
}

function createTreeLoadMore(list, children, depth, rendered) {
    const li = document.createElement("li");
    li.className = "treeLoadMoreItem";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "treeLoadMore";
    button.textContent = `加载更多 ${children.length - rendered} 个节点`;
    button.style.paddingLeft = `${Math.min(depth * 10 + 24, 72)}px`;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        const fragment = document.createDocumentFragment();
        appendTreeChildrenBatch(fragment, list, children, depth);
        list.appendChild(fragment);
        hydrateVisibleLabels();
    });
    li.appendChild(button);
    return li;
}

async function selectTreeNode(row, item, localIds, primaryLocalId) {
    if (selectedTreeNode) {
        selectedTreeNode.classList.remove("active");
    }
    selectedTreeNode = row;
    selectedTreeNode.classList.add("active");

    const uniqueLocalIds = [...new Set(localIds.filter((id) => typeof id === "number"))];
    if (!uniqueLocalIds.length) {
        props.textContent = [
            `节点：${nodeTitle(item)}`,
            "该节点没有可定位的模型构件",
            item?.meta ? `说明：${item.meta}` : ""
        ].filter(Boolean).join("\n");
        setText("status", "当前节点不可定位");
        return;
    }

    const idsForSelection = uniqueLocalIds.slice(0, MAX_SELECT_LOCAL_IDS);
    const primary = typeof primaryLocalId === "number" ? primaryLocalId : idsForSelection[0];
    setText("status", `正在定位 ${idsForSelection.length} 个构件...`);

    await sdk.selectLocalIds(idsForSelection, {
        primaryLocalId: primary,
        source: "demo-tree"
    });
    await sdk.fitSelection();
    await renderProps(primary, item, uniqueLocalIds.length);
    setText("status", `已定位 localId ${primary}${uniqueLocalIds.length > idsForSelection.length ? `，已截取前 ${idsForSelection.length} 个构件高亮` : ""}`);
}

async function renderProps(localId, item, totalCount) {
    try {
        const info = await sdk.getItemInfo(localId);
        const lines = [
            `节点：${nodeTitle(item)}`,
            `localId: ${localId}`,
            `GlobalId: ${info?.globalId || info?.guid || "-"}`,
            `Category: ${info?.category || item?.category || "-"}`,
            `Name: ${info?.name || item?.name || item?.label || "-"}`,
            `ObjectType: ${info?.objectType || "-"}`,
            `PredefinedType: ${info?.predefinedType || "-"}`,
            `节点包含构件: ${totalCount}`
        ];
        props.textContent = lines.join("\n");
    } catch (error) {
        props.textContent = `localId: ${localId}\n属性读取失败：${errorMessage(error)}`;
    }
}

function getInitialLabel(item, localId, localIds) {
    if (typeof item?.entityName === "string" && item.entityName) {
        return item.entityName;
    }
    if (typeof item?.name === "string" && item.name) {
        return item.name;
    }
    if (typeof item?.label === "string" && item.label) {
        return item.label;
    }
    if (typeof item?.category === "string" && item.category) {
        return item.category;
    }
    if (localId !== null) {
        return `localId ${localId}`;
    }
    return `Group (${localIds.length})`;
}

function getMetaLabel(item, localId, localIds) {
    if (typeof item?.meta === "string" && item.meta) {
        return item.meta;
    }
    if (typeof item?.category === "string" && item.category && item.category !== item.label) {
        return item.category;
    }
    if (localId !== null) {
        return `#${localId}`;
    }
    return localIds.length ? `${localIds.length} items` : "";
}

function collectNodeLocalIds(node, limit = MAX_SELECT_LOCAL_IDS) {
    const ids = [];
    const seen = new Set();
    const stack = node ? [node] : [];

    while (stack.length && ids.length < limit) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }

        if (typeof current.localId === "number" && !seen.has(current.localId)) {
            seen.add(current.localId);
            ids.push(current.localId);
            if (ids.length >= limit) {
                break;
            }
        }

        if (Array.isArray(current.localIds)) {
            for (const id of current.localIds) {
                if (ids.length >= limit) {
                    break;
                }
                if (typeof id === "number" && !seen.has(id)) {
                    seen.add(id);
                    ids.push(id);
                }
            }
        }

        if (Array.isArray(current.children)) {
            for (let index = current.children.length - 1; index >= 0; index--) {
                stack.push(current.children[index]);
            }
        }
    }

    return ids;
}

async function hydrateVisibleLabels() {
    const rows = [...treeList.querySelectorAll("[data-needs-label='true']")].slice(0, 220);
    for (const row of rows) {
        const localId = Number(row.dataset.localId);
        if (!Number.isFinite(localId)) {
            continue;
        }
        const label = await getDisplayLabel(localId);
        const name = row.querySelector(".treeName");
        const meta = row.querySelector(".treeId");
        if (name && label.name) {
            name.textContent = label.name;
            name.title = label.title;
        }
        if (meta) {
            meta.textContent = label.meta;
            meta.title = label.metaTitle;
        }
        row.dataset.needsLabel = "false";
    }
}

async function getDisplayLabel(localId) {
    if (labelCache.has(localId)) {
        return labelCache.get(localId);
    }

    const fallback = {
        name: `localId ${localId}`,
        meta: `#${localId}`,
        title: `localId ${localId}`,
        metaTitle: `localId ${localId}`
    };
    try {
        const info = await sdk.getItemInfo(localId);
        const name = pickInfoValue(info, ["entityName", "name", "Name", "LongName"]) || fallback.name;
        const label = {
            name,
            meta: info?.category || fallback.meta,
            title: `${name} | localId ${localId}`,
            metaTitle: info?.globalId ? `GlobalId ${info.globalId}` : fallback.metaTitle
        };
        labelCache.set(localId, label);
        return label;
    } catch {
        labelCache.set(localId, fallback);
        return fallback;
    }
}

function pickInfoValue(info, keys) {
    for (const key of keys) {
        const direct = info?.[key];
        if (direct !== undefined && direct !== null && direct !== "") {
            return String(direct);
        }
        const prop = info?.properties?.[key];
        if (prop !== undefined && prop !== null && prop !== "") {
            return String(prop);
        }
    }
    const lowerKeys = keys.map((key) => key.toLowerCase());
    for (const [key, value] of Object.entries(info?.properties || {})) {
        const last = key.split(".").pop().toLowerCase();
        if (lowerKeys.includes(last) && value !== undefined && value !== null && value !== "") {
            return String(value);
        }
    }
    return null;
}

function errorMessage(error) {
    return error?.message || String(error);
}
