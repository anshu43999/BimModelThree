function normalizePanelId(value) {
    return String(value || "").trim();
}

/** Coordinates viewport panel visibility and exclusive panel groups. */
export class ViewportPanelManager extends EventTarget {
    constructor(options = {}) {
        super();
        this.root = options.root || null;
        this.panels = new Map();
    }

    register(id, options = {}) {
        const key = normalizePanelId(id);
        if (!key || !options.element) {
            throw new Error("ViewportPanelManager.register requires id and element");
        }
        const mode = options.mode === "collapse" ? "collapse" : "hidden";
        const panel = {
            id: key,
            element: options.element,
            trigger: options.trigger || null,
            group: normalizePanelId(options.group) || null,
            exclusive: options.exclusive === true,
            mode,
            closedClass: options.closedClass || "collapsed",
            open: options.open ?? (mode === "collapse"
                ? !options.element.classList.contains(options.closedClass || "collapsed")
                : !options.element.hidden)
        };
        this.panels.set(key, panel);
        this.applyPanel(panel);
        this.applyRootState();
        return this.getPanelState(key);
    }

    setOpen(id, open, options = {}) {
        const panel = this.panels.get(normalizePanelId(id));
        if (!panel) {
            return this.getState();
        }
        const nextOpen = Boolean(open);
        const changes = [];
        if (nextOpen && panel.exclusive && panel.group) {
            for (const candidate of this.panels.values()) {
                if (candidate.id === panel.id
                    || candidate.group !== panel.group
                    || !candidate.exclusive
                    || !candidate.open) {
                    continue;
                }
                candidate.open = false;
                this.applyPanel(candidate);
                changes.push({id: candidate.id, open: false, reason: "exclusive"});
            }
        }
        if (panel.open !== nextOpen) {
            panel.open = nextOpen;
            this.applyPanel(panel);
            changes.push({id: panel.id, open: nextOpen, reason: options.reason || "request"});
        }
        this.applyRootState();
        const detail = {
            source: options.source || "unknown",
            changes,
            state: this.getState()
        };
        if (changes.length && options.dispatch !== false) {
            this.dispatchEvent(new CustomEvent("panelchange", {detail}));
        }
        return detail;
    }

    open(id, options = {}) {
        return this.setOpen(id, true, options);
    }

    close(id, options = {}) {
        return this.setOpen(id, false, options);
    }

    toggle(id, options = {}) {
        return this.setOpen(id, !this.isOpen(id), options);
    }

    isOpen(id) {
        return this.panels.get(normalizePanelId(id))?.open === true;
    }

    getPanelState(id) {
        const panel = this.panels.get(normalizePanelId(id));
        return panel ? {
            id: panel.id,
            open: panel.open,
            group: panel.group,
            exclusive: panel.exclusive,
            mode: panel.mode
        } : null;
    }

    getState() {
        const panels = [...this.panels.values()].map((panel) => this.getPanelState(panel.id));
        return {
            panels,
            openPanels: panels.filter((panel) => panel.open).map((panel) => panel.id)
        };
    }

    applyPanel(panel) {
        if (panel.mode === "collapse") {
            panel.element.classList.toggle(panel.closedClass, !panel.open);
        } else {
            panel.element.hidden = !panel.open;
        }
        panel.element.dataset.panelOpen = String(panel.open);
        panel.trigger?.setAttribute?.("aria-expanded", String(panel.open));
    }

    applyRootState() {
        if (!this.root) {
            return;
        }
        const openPanels = [...this.panels.values()].filter((panel) => panel.open).map((panel) => panel.id);
        this.root.classList.toggle("hasOpenPanel", openPanels.length > 0);
        this.root.dataset.openPanels = openPanels.join(" ");
    }
}
