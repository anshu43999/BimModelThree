export class TreeVirtualListEngine {
    constructor(options = {}) {
        this.container = options.container || null;
        this.rowHeight = Number.isFinite(options.rowHeight) ? options.rowHeight : 34;
        this.overscan = Number.isFinite(options.overscan) ? options.overscan : 8;
        this.renderRow = typeof options.renderRow === "function" ? options.renderRow : null;
        this.items = [];
        this.scrollTop = 0;
        this.onRender = typeof options.onRender === "function" ? options.onRender : null;
        this.viewport = document.createElement("div");
        this.viewport.className = options.viewportClassName || "virtualListViewport";
        this.spacer = document.createElement("div");
        this.spacer.className = options.spacerClassName || "virtualListSpacer";
        this.content = document.createElement("div");
        this.content.className = options.contentClassName || "virtualListContent";
        this.viewport.append(this.spacer, this.content);
        this.boundScroll = () => this.render();
        this.viewport.addEventListener("scroll", this.boundScroll, {passive: true});
    }

    mount(container = this.container) {
        if (!container) {
            return;
        }
        this.container = container;
        this.container.textContent = "";
        this.container.appendChild(this.viewport);
        this.render();
    }

    unmount() {
        this.viewport.removeEventListener("scroll", this.boundScroll);
        this.viewport.remove();
    }

    setItems(items = []) {
        this.items = Array.isArray(items) ? items : [];
        this.spacer.style.height = `${this.items.length * this.rowHeight}px`;
        this.render();
    }

    scrollToIndex(index) {
        const safeIndex = Math.max(0, Math.min(Number(index) || 0, this.items.length - 1));
        this.viewport.scrollTop = safeIndex * this.rowHeight;
        this.render();
    }

    render() {
        if (!this.renderRow) {
            return;
        }
        const viewportHeight = Math.max(this.viewport.clientHeight || this.container?.clientHeight || 1, 1);
        const scrollTop = Math.max(this.viewport.scrollTop || 0, 0);
        const visibleCount = Math.ceil(viewportHeight / this.rowHeight);
        const start = Math.max(Math.floor(scrollTop / this.rowHeight) - this.overscan, 0);
        const end = Math.min(start + visibleCount + this.overscan * 2, this.items.length);
        const fragment = document.createDocumentFragment();
        for (let index = start; index < end; index++) {
            const item = this.items[index];
            const row = this.renderRow(item, index);
            if (!row) {
                continue;
            }
            row.classList?.add("virtualListRow");
            row.style.position = "absolute";
            row.style.top = `${index * this.rowHeight}px`;
            row.style.left = "0";
            row.style.right = "0";
            row.style.height = `${this.rowHeight}px`;
            row.dataset.virtualIndex = String(index);
            fragment.appendChild(row);
        }
        this.content.textContent = "";
        this.content.appendChild(fragment);
        this.onRender?.({start, end, count: this.items.length});
    }
}
