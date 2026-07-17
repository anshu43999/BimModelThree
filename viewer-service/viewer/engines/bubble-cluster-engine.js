const DEFAULT_CELL_WIDTH = 88;
const DEFAULT_CELL_HEIGHT = 60;
const DEFAULT_MIN_CLUSTER_SIZE = 3;
const DEFAULT_MAX_EXPANDED_ITEMS = 20;
const DEFAULT_OVERLAP_PADDING = 8;

function numberOrFallback(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clampPositive(value, fallback) {
    const number = numberOrFallback(value, fallback);
    return Math.max(1, number);
}

export class BubbleClusterEngine {
    constructor(options = {}) {
        this.overlay = options.overlay || null;
        this.onActivate = typeof options.onActivate === "function" ? options.onActivate : null;
        this.enabled = options.enabled !== false;
        this.cellWidth = clampPositive(options.cellWidth, DEFAULT_CELL_WIDTH);
        this.cellHeight = clampPositive(options.cellHeight, DEFAULT_CELL_HEIGHT);
        this.minClusterSize = Math.max(2, Math.floor(numberOrFallback(options.minClusterSize, DEFAULT_MIN_CLUSTER_SIZE)));
        this.maxExpandedItems = Math.max(1, Math.floor(numberOrFallback(options.maxExpandedItems, DEFAULT_MAX_EXPANDED_ITEMS)));
        this.overlapPadding = Math.max(0, numberOrFallback(options.overlapPadding, DEFAULT_OVERLAP_PADDING));
        this.clusters = [];
        this.expandedClusterKey = null;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (!this.enabled) {
            this.clear();
        }
        return this;
    }

    configure(options = {}) {
        if (Object.prototype.hasOwnProperty.call(options, "cellWidth")) {
            this.cellWidth = clampPositive(options.cellWidth, DEFAULT_CELL_WIDTH);
        }
        if (Object.prototype.hasOwnProperty.call(options, "cellHeight")) {
            this.cellHeight = clampPositive(options.cellHeight, DEFAULT_CELL_HEIGHT);
        }
        if (Object.prototype.hasOwnProperty.call(options, "minClusterSize")) {
            this.minClusterSize = Math.max(2, Math.floor(numberOrFallback(options.minClusterSize, DEFAULT_MIN_CLUSTER_SIZE)));
        }
        if (Object.prototype.hasOwnProperty.call(options, "overlapPadding")) {
            this.overlapPadding = Math.max(0, numberOrFallback(options.overlapPadding, DEFAULT_OVERLAP_PADDING));
        }
        return this;
    }

    clear() {
        this.restoreItems();
        for (const cluster of this.clusters) {
            cluster.remove();
        }
        this.clusters = [];
        this.expandedClusterKey = null;
        return this;
    }

    restoreItems() {
        if (!this.overlay) {
            return;
        }
        for (const element of this.overlay.querySelectorAll(".bubbleClusterMember")) {
            element.classList.remove("bubbleClusterMember");
            element.style.visibility = "";
        }
    }

    update(items = []) {
        this.clear();
        if (!this.enabled || !this.overlay || items.length < this.minClusterSize) {
            return {
                enabled: this.enabled,
                itemCount: items.length,
                clusterCount: 0,
                clusteredCount: 0
            };
        }

        const overlayRect = this.overlay.getBoundingClientRect();
        const visibleItems = items
            .map((item) => this.toVisibleItem(item, overlayRect))
            .filter(Boolean);

        const groups = this.groupVisibleItems(visibleItems);

        let clusteredCount = 0;
        for (const groupItems of groups) {
            if (groupItems.length < this.minClusterSize) {
                continue;
            }
            clusteredCount += groupItems.length;
            for (const item of groupItems) {
                item.element.classList.add("bubbleClusterMember");
                item.element.style.visibility = "hidden";
            }
            const key = groupItems.map((item) => `${item.type}:${item.id}`).sort().join("|");
            this.createCluster(key, groupItems);
        }

        return {
            enabled: this.enabled,
            itemCount: visibleItems.length,
            clusterCount: this.clusters.length,
            clusteredCount
        };
    }

    toVisibleItem(item, overlayRect) {
        if (!item?.element || item.element.hidden || item.element.style.display === "none") {
            return null;
        }
        const rect = item.element.getBoundingClientRect();
        if (!rect.width || !rect.height) {
            return null;
        }
        const x = rect.left - overlayRect.left + rect.width / 2;
        const y = rect.top - overlayRect.top + rect.height / 2;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }
        return {
            ...item,
            x,
            y,
            left: rect.left - overlayRect.left,
            right: rect.right - overlayRect.left,
            top: rect.top - overlayRect.top,
            bottom: rect.bottom - overlayRect.top
        };
    }

    groupVisibleItems(items) {
        const parents = items.map((_, index) => index);
        const find = (index) => {
            while (parents[index] !== index) {
                parents[index] = parents[parents[index]];
                index = parents[index];
            }
            return index;
        };
        const union = (leftIndex, rightIndex) => {
            const leftRoot = find(leftIndex);
            const rightRoot = find(rightIndex);
            if (leftRoot !== rightRoot) {
                parents[rightRoot] = leftRoot;
            }
        };

        for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
                if (this.shouldClusterTogether(items[leftIndex], items[rightIndex])) {
                    union(leftIndex, rightIndex);
                }
            }
        }

        const groups = new Map();
        items.forEach((item, index) => {
            const root = find(index);
            if (!groups.has(root)) {
                groups.set(root, []);
            }
            groups.get(root).push(item);
        });
        return [...groups.values()];
    }

    shouldClusterTogether(left, right) {
        const padding = this.overlapPadding;
        const overlaps = left.left <= right.right + padding
            && left.right + padding >= right.left
            && left.top <= right.bottom + padding
            && left.bottom + padding >= right.top;
        if (overlaps) {
            return true;
        }
        return Math.abs(left.x - right.x) <= this.cellWidth * 0.5
            && Math.abs(left.y - right.y) <= this.cellHeight * 0.5;
    }

    createCluster(key, items) {
        const x = items.reduce((sum, item) => sum + item.x, 0) / items.length;
        const y = items.reduce((sum, item) => sum + item.y, 0) / items.length;
        const cluster = document.createElement("div");
        cluster.className = "bubbleCluster";
        cluster.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        cluster.dataset.clusterKey = key;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "bubbleClusterButton";
        button.textContent = String(items.length);
        button.title = `展开 ${items.length} 个气泡`;
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleCluster(cluster, key, items);
        });
        cluster.appendChild(button);

        this.overlay.appendChild(cluster);
        this.clusters.push(cluster);
    }

    toggleCluster(cluster, key, items) {
        const existing = cluster.querySelector(".bubbleClusterPanel");
        if (existing) {
            existing.remove();
            this.expandedClusterKey = null;
            return;
        }
        for (const current of this.clusters) {
            current.querySelector(".bubbleClusterPanel")?.remove();
        }
        this.expandedClusterKey = key;
        cluster.appendChild(this.createClusterPanel(items));
    }

    createClusterPanel(items) {
        const panel = document.createElement("div");
        panel.className = "bubbleClusterPanel";
        const limitedItems = items.slice(0, this.maxExpandedItems);
        for (const item of limitedItems) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "bubbleClusterItem";
            button.textContent = item.title || (item.type === "annotation" ? "模型批注" : "模型标签");
            button.title = item.subtitle || item.globalId || (typeof item.localId === "number" ? `localId ${item.localId}` : "");
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.onActivate?.(item);
            });
            panel.appendChild(button);
        }
        if (items.length > limitedItems.length) {
            const more = document.createElement("div");
            more.className = "bubbleClusterMore";
            more.textContent = `还有 ${items.length - limitedItems.length} 个`;
            panel.appendChild(more);
        }
        return panel;
    }
}
