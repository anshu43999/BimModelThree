function normalizeTabId(value) {
    return String(value || "").trim();
}

/** Maintains one active tab and resolves keyboard navigation without depending on the DOM. */
export class TabStateController {
    constructor(tabIds = [], options = {}) {
        this.tabIds = [...new Set(tabIds.map(normalizeTabId).filter(Boolean))];
        if (!this.tabIds.length) {
            throw new Error("TabStateController requires at least one tab id");
        }
        this.activeId = this.resolve(options.initialId);
    }

    resolve(tabId) {
        const normalized = normalizeTabId(tabId);
        return this.tabIds.includes(normalized) ? normalized : this.tabIds[0];
    }

    select(tabId) {
        this.activeId = this.resolve(tabId);
        return this.activeId;
    }

    move(key) {
        const currentIndex = Math.max(0, this.tabIds.indexOf(this.activeId));
        if (key === "Home") {
            return this.select(this.tabIds[0]);
        }
        if (key === "End") {
            return this.select(this.tabIds.at(-1));
        }
        const offset = key === "ArrowRight" || key === "ArrowDown"
            ? 1
            : key === "ArrowLeft" || key === "ArrowUp"
                ? -1
                : 0;
        if (!offset) {
            return this.activeId;
        }
        const nextIndex = (currentIndex + offset + this.tabIds.length) % this.tabIds.length;
        return this.select(this.tabIds[nextIndex]);
    }
}
