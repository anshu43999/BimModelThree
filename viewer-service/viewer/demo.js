const requirements = [
    {
        id: "REQ-001",
        stage: "P0",
        group: "模型基础",
        title: "模型加载与适配",
        summary: "Manifest 加载、模型适配和基础视角",
        page: "./demo-pages/model-load.html",
        status: "ready"
    },
    {
        id: "REQ-002",
        stage: "P0",
        group: "模型基础",
        title: "模型树与属性查看",
        summary: "分类树、懒加载、属性和构件定位",
        page: "./demo-pages/tree-props.html",
        status: "ready"
    },
    {
        id: "REQ-003",
        stage: "P0",
        group: "模型基础",
        title: "构件选择与基础操作",
        summary: "点选、高亮、隐藏、隔离和恢复",
        page: "./demo-pages/selection.html",
        status: "ready"
    },
    {
        id: "REQ-004",
        stage: "P1",
        group: "BIM 工具",
        title: "捕捉与距离测量",
        summary: "捕捉反馈、测量点和距离结果",
        page: "./demo-pages/measure.html",
        status: "ready"
    },
    {
        id: "REQ-008",
        stage: "P1",
        group: "BIM 工具",
        title: "基础剖切",
        summary: "剖切开启、方向切换和位置拖动",
        page: "./demo-pages/section.html",
        status: "ready"
    },
    {
        id: "REQ-005",
        stage: "P1",
        group: "业务标记",
        title: "标签编辑与持久化",
        summary: "构件标签创建、编辑和本地持久化",
        page: "./demo-pages/label.html",
        status: "ready"
    },
    {
        id: "REQ-006",
        stage: "P2",
        group: "业务标记",
        title: "批注编辑、筛选与模型气泡",
        summary: "批注状态、筛选、编辑和模型气泡",
        page: "./demo-pages/annotation.html",
        status: "ready"
    },
    {
        id: "REQ-007",
        stage: "P1",
        group: "视图管理",
        title: "视点保存、恢复与快照",
        summary: "相机视点持久化和画面快照",
        page: "./demo-pages/view-snapshot.html",
        status: "ready"
    },
    {
        id: "REQ-009",
        stage: "SDK",
        group: "系统集成",
        title: "第三方 iframe 集成",
        summary: "宿主系统通过 postMessage SDK 控制 Viewer",
        page: "./demo-pages/iframe-integration.html",
        status: "ready"
    },
    {
        id: "REQ-010",
        stage: "P2",
        group: "漫游与巡检",
        title: "自由巡检",
        summary: "WASD 移动、Shift 加速和步进控制",
        page: "./demo-pages/free-inspect.html",
        status: "ready"
    },
    {
        id: "REQ-011",
        stage: "P3",
        group: "漫游与巡检",
        title: "路径漫游与关键帧",
        summary: "多路线、关键帧、本地保存和路径播放",
        page: "./demo-pages/path-roam.html",
        status: "ready"
    },
    {
        id: "REQ-012",
        stage: "P3",
        group: "模型对比",
        title: "双视窗版本对比",
        summary: "待完成独立 SDK 接口收口",
        page: null,
        status: "pending"
    },
    {
        id: "REQ-013",
        stage: "P2",
        group: "模型管理",
        title: "模型平移与旋转",
        summary: "待完成独立 SDK 接口收口",
        page: null,
        status: "pending"
    },
    {
        id: "REQ-014",
        stage: "P2",
        group: "模型管理",
        title: "多模型管理",
        summary: "待完成独立 SDK 接口收口",
        page: null,
        status: "pending"
    },
    {
        id: "REQ-015",
        stage: "P2",
        group: "可视化增强",
        title: "分区可视化",
        summary: "待完成独立 SDK 接口收口",
        page: null,
        status: "pending"
    },
    {
        id: "REQ-016",
        stage: "P3",
        group: "可视化增强",
        title: "标签与批注聚合",
        summary: "待完成独立 SDK 接口收口",
        page: null,
        status: "pending"
    }
];

const requirementList = document.getElementById("requirementList");
const requirementSearch = document.getElementById("requirementSearch");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const stageFilters = document.getElementById("stageFilters");
const frame = document.getElementById("viewerFrame");
const frameLoading = document.getElementById("frameLoading");
const reloadDemoBtn = document.getElementById("reloadDemoBtn");
const openDemoBtn = document.getElementById("openDemoBtn");
const currentFeatureStage = document.getElementById("currentFeatureStage");
const currentFeatureTitle = document.getElementById("currentFeatureTitle");
const currentFeatureMeta = document.getElementById("currentFeatureMeta");
const demoProgress = document.getElementById("demoProgress");

const stageOrder = ["全部", "P0", "P1", "P2", "P3", "SDK"];
let activeStage = "全部";
let activeRequirement = getRequirementFromHash() || requirements[0];

function getRequirementFromHash() {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, "").trim());
    return requirements.find((item) => item.id === id && item.status === "ready") || null;
}

function normalizeSearch(value) {
    return String(value || "").trim().toLocaleLowerCase("zh-CN");
}

function getVisibleRequirements() {
    const query = normalizeSearch(requirementSearch.value);
    return requirements.filter((item) => {
        if (activeStage !== "全部" && item.stage !== activeStage) {
            return false;
        }
        if (!query) {
            return true;
        }
        return normalizeSearch([
            item.id,
            item.stage,
            item.group,
            item.title,
            item.summary
        ].join(" ")).includes(query);
    });
}

function renderStageFilters() {
    stageFilters.textContent = "";
    for (const stage of stageOrder) {
        const count = stage === "全部"
            ? requirements.length
            : requirements.filter((item) => item.stage === stage).length;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stageFilter";
        button.classList.toggle("active", stage === activeStage);
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", String(stage === activeStage));
        button.textContent = `${stage} ${count}`;
        button.addEventListener("click", () => {
            activeStage = stage;
            renderStageFilters();
            renderRequirements();
        });
        stageFilters.append(button);
    }
}

function createRequirementButton(requirement) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "requirementItem";
    button.classList.toggle("active", requirement.id === activeRequirement.id);
    button.classList.toggle("pending", requirement.status !== "ready");
    button.disabled = requirement.status !== "ready";
    button.dataset.requirementId = requirement.id;
    button.setAttribute("aria-current", requirement.id === activeRequirement.id ? "page" : "false");

    const stage = document.createElement("span");
    stage.className = "requirementStage";
    stage.textContent = requirement.stage;

    const content = document.createElement("span");
    content.className = "requirementContent";
    const title = document.createElement("strong");
    title.textContent = requirement.title;
    const summary = document.createElement("small");
    summary.textContent = requirement.summary;
    content.append(title, summary);

    const state = document.createElement("span");
    state.className = `requirementState ${requirement.status}`;
    state.title = requirement.status === "ready" ? "可演示" : "SDK 收口中";
    state.setAttribute("aria-label", state.title);

    button.append(stage, content, state);
    if (requirement.status === "ready") {
        button.addEventListener("click", () => selectRequirement(requirement.id));
    }
    return button;
}

function renderRequirements() {
    const visible = getVisibleRequirements();
    requirementList.textContent = "";
    if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "requirementEmpty";
        empty.textContent = "没有匹配的功能";
        requirementList.append(empty);
        return;
    }

    const groups = new Map();
    for (const requirement of visible) {
        if (!groups.has(requirement.group)) {
            groups.set(requirement.group, []);
        }
        groups.get(requirement.group).push(requirement);
    }

    for (const [group, items] of groups.entries()) {
        const section = document.createElement("section");
        section.className = "requirementGroup";
        const header = document.createElement("div");
        header.className = "requirementGroupHeader";
        const name = document.createElement("strong");
        name.textContent = group;
        const count = document.createElement("span");
        count.textContent = `${items.length}`;
        header.append(name, count);
        section.append(header);
        for (const requirement of items) {
            section.append(createRequirementButton(requirement));
        }
        requirementList.append(section);
    }
}

function updateCurrentFeature() {
    currentFeatureStage.textContent = activeRequirement.stage;
    currentFeatureStage.dataset.stage = activeRequirement.stage;
    currentFeatureTitle.textContent = activeRequirement.title;
    currentFeatureMeta.textContent = `${activeRequirement.id} · ${activeRequirement.group}`;
    frame.title = `${activeRequirement.title}演示`;
}

function loadActiveRequirement() {
    updateCurrentFeature();
    frameLoading.hidden = false;
    frame.src = activeRequirement.page;
}

function selectRequirement(id, options = {}) {
    const next = requirements.find((item) => item.id === id);
    if (!next || next.status !== "ready" || !next.page) {
        return;
    }
    const changed = activeRequirement.id !== next.id;
    activeRequirement = next;
    if (options.updateHash !== false) {
        window.history.replaceState(null, "", `#${encodeURIComponent(activeRequirement.id)}`);
    }
    renderRequirements();
    if (changed || !frame.src) {
        loadActiveRequirement();
    } else {
        updateCurrentFeature();
    }
}

function reloadActiveRequirement() {
    frameLoading.hidden = false;
    frame.src = activeRequirement.page;
}

requirementSearch.addEventListener("input", () => {
    clearSearchBtn.hidden = !requirementSearch.value;
    renderRequirements();
});

clearSearchBtn.addEventListener("click", () => {
    requirementSearch.value = "";
    clearSearchBtn.hidden = true;
    requirementSearch.focus();
    renderRequirements();
});

reloadDemoBtn.addEventListener("click", reloadActiveRequirement);
openDemoBtn.addEventListener("click", () => {
    window.open(activeRequirement.page, "_blank", "noopener");
});

frame.addEventListener("load", () => {
    frameLoading.hidden = true;
});

window.addEventListener("hashchange", () => {
    const requirement = getRequirementFromHash();
    if (requirement && requirement.id !== activeRequirement.id) {
        selectRequirement(requirement.id, {updateHash: false});
    }
});

document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
    }
    const visible = getVisibleRequirements();
    const currentIndex = visible.findIndex((item) => item.id === activeRequirement.id);
    if (currentIndex < 0 || !visible.length) {
        return;
    }
    event.preventDefault();
    const offset = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + offset + visible.length) % visible.length;
    selectRequirement(visible[nextIndex].id);
    requirementList.querySelector(`[data-requirement-id="${visible[nextIndex].id}"]`)?.focus();
});

demoProgress.textContent = `${requirements.filter((item) => item.status === "ready").length} / ${requirements.length}`;
renderStageFilters();
selectRequirement(activeRequirement.id);
