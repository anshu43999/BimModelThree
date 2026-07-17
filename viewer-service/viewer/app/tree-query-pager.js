export class TreeQueryPager {
    constructor(options = {}) {
        this.pageSize = Math.max(1, Number(options.pageSize) || 180);
        this.visibleLimits = new Map();
    }

    reset() {
        this.visibleLimits.clear();
    }

    getPage(key, items = []) {
        const values = Array.isArray(items) ? items : [];
        const normalizedKey = String(key || "root");
        const requestedLimit = this.visibleLimits.get(normalizedKey) || this.pageSize;
        const visibleCount = Math.min(requestedLimit, values.length);
        return {
            key: normalizedKey,
            items: values.slice(0, visibleCount),
            visibleCount,
            total: values.length,
            remaining: Math.max(0, values.length - visibleCount),
            hasMore: visibleCount < values.length
        };
    }

    loadMore(key, total) {
        const normalizedKey = String(key || "root");
        const safeTotal = Math.max(0, Number(total) || 0);
        const current = this.visibleLimits.get(normalizedKey) || this.pageSize;
        const next = Math.min(current + this.pageSize, safeTotal);
        this.visibleLimits.set(normalizedKey, next);
        return next;
    }
}
