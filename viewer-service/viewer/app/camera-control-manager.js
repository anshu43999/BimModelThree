function normalizePriority(value) {
    const priority = Number(value);
    return Number.isFinite(priority) ? priority : 0;
}

/**
 * Resolves camera input and cursor state from all active tool owners.
 * A control owner must release only its own claim; another active blocker
 * continues to keep OrbitControls disabled.
 */
export class CameraControlManager extends EventTarget {
    constructor(options = {}) {
        super();
        if (!options.controls) {
            throw new Error("CameraControlManager requires controls");
        }
        this.controls = options.controls;
        this.canvas = options.canvas || null;
        this.defaultCursor = options.defaultCursor ?? this.canvas?.style?.cursor ?? "";
        this.claims = new Map();
        this.lastStateKey = "";
        this.apply({dispatch: false});
    }

    set(owner, active, options = {}) {
        const key = String(owner || "").trim();
        if (!key) {
            return this.getState();
        }
        if (!active) {
            return this.release(key, options);
        }
        this.claims.set(key, {
            owner: key,
            blocks: options.blocks !== false,
            cursor: String(options.cursor || ""),
            priority: normalizePriority(options.priority)
        });
        if (options.defer === true) {
            return this.getState();
        }
        return this.apply(options);
    }

    acquire(owner, options = {}) {
        return this.set(owner, true, options);
    }

    release(owner, options = {}) {
        const key = String(owner || "").trim();
        if (key) {
            this.claims.delete(key);
        }
        if (options.defer === true) {
            return this.getState();
        }
        return this.apply(options);
    }

    reset(options = {}) {
        this.claims.clear();
        return this.apply(options);
    }

    getState() {
        const claims = [...this.claims.values()];
        const blockers = claims.filter((claim) => claim.blocks).map((claim) => claim.owner);
        const cursorClaim = claims
            .filter((claim) => claim.cursor)
            .sort((left, right) => right.priority - left.priority)[0] || null;
        return {
            enabled: blockers.length === 0,
            blockers,
            cursor: cursorClaim?.cursor || this.defaultCursor,
            cursorOwner: cursorClaim?.owner || null,
            claims: claims.map((claim) => ({...claim}))
        };
    }

    apply(options = {}) {
        const state = this.getState();
        this.controls.enabled = state.enabled;
        if (this.canvas?.style) {
            this.canvas.style.cursor = state.cursor;
        }
        const stateKey = JSON.stringify({
            enabled: state.enabled,
            blockers: state.blockers,
            cursor: state.cursor,
            cursorOwner: state.cursorOwner
        });
        if (stateKey !== this.lastStateKey) {
            this.lastStateKey = stateKey;
            if (options.dispatch !== false) {
                this.dispatchEvent(new CustomEvent("controlchange", {
                    detail: {
                        source: options.source || "unknown",
                        state
                    }
                }));
            }
        }
        return state;
    }

    dispose() {
        this.reset({dispatch: false});
        this.controls = null;
        this.canvas = null;
    }
}
