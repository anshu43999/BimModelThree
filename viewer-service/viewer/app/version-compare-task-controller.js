const TASK_SCHEMA_VERSION = "bim-version-compare-task/v1";

function clone(value) {
    return structuredClone(value);
}

function normalizeProgress(current, total) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCurrent = Math.max(0, Math.min(Number(current) || 0, safeTotal || Number(current) || 0));
    return {
        current: safeCurrent,
        total: safeTotal,
        percent: safeTotal ? Number(((safeCurrent / safeTotal) * 100).toFixed(1)) : 0
    };
}

export class VersionCompareTaskController extends EventTarget {
    constructor(options = {}) {
        super();
        this.clock = options.clock || (() => Date.now());
        this.sequence = 0;
        this.state = this.createIdleState();
    }

    createIdleState() {
        return {
            schemaVersion: TASK_SCHEMA_VERSION,
            taskId: null,
            status: "idle",
            phase: "idle",
            message: "",
            baseModelId: null,
            compareModelId: null,
            progress: normalizeProgress(0, 0),
            phases: {},
            changed: 0,
            startedAt: null,
            finishedAt: null,
            elapsedMs: 0,
            cancelReason: null,
            error: null
        };
    }

    start(metadata = {}) {
        const now = this.clock();
        this.state = {
            ...this.createIdleState(),
            taskId: `version-compare-${++this.sequence}`,
            status: "running",
            phase: "starting",
            message: metadata.message || "版本对比准备中",
            baseModelId: metadata.baseModelId || null,
            compareModelId: metadata.compareModelId || null,
            startedAt: new Date(now).toISOString()
        };
        this.emit("start");
        return this.getState();
    }

    updatePhase(phase, update = {}) {
        if (this.state.status !== "running") {
            return this.getState();
        }
        const progress = normalizeProgress(update.current, update.total);
        this.state.phase = String(phase || "running");
        this.state.progress = progress;
        this.state.message = update.message ?? this.state.message;
        this.state.changed = Number.isFinite(Number(update.changed))
            ? Math.max(0, Number(update.changed))
            : this.state.changed;
        this.state.phases[this.state.phase] = {
            ...progress,
            message: this.state.message,
            updatedAt: new Date(this.clock()).toISOString()
        };
        this.updateElapsed();
        this.emit("progress");
        return this.getState();
    }

    complete(report = null, message = "版本对比完成") {
        if (this.state.status !== "running") {
            return this.getState();
        }
        this.state.status = "completed";
        this.state.phase = "completed";
        this.state.message = message;
        this.state.finishedAt = new Date(this.clock()).toISOString();
        this.state.changed = Number(report?.changed) || this.state.changed;
        this.state.progress = normalizeProgress(1, 1);
        this.updateElapsed();
        this.emit("complete");
        return this.getState();
    }

    cancel(reason = "user") {
        if (this.state.status !== "running") {
            return this.getState();
        }
        this.state.status = "cancelled";
        this.state.phase = "cancelled";
        this.state.cancelReason = String(reason || "user");
        this.state.message = "版本对比已取消";
        this.state.finishedAt = new Date(this.clock()).toISOString();
        this.updateElapsed();
        this.emit("cancel");
        return this.getState();
    }

    fail(error) {
        if (this.state.status !== "running") {
            return this.getState();
        }
        const message = error?.message || String(error || "版本对比失败");
        this.state.status = "failed";
        this.state.phase = "failed";
        this.state.message = `版本对比失败：${message}`;
        this.state.error = {message};
        this.state.finishedAt = new Date(this.clock()).toISOString();
        this.updateElapsed();
        this.emit("fail");
        return this.getState();
    }

    reset() {
        this.state = this.createIdleState();
        this.emit("reset");
        return this.getState();
    }

    updateElapsed() {
        if (!this.state.startedAt) {
            this.state.elapsedMs = 0;
            return;
        }
        const started = Date.parse(this.state.startedAt);
        const finished = this.state.finishedAt ? Date.parse(this.state.finishedAt) : this.clock();
        this.state.elapsedMs = Math.max(0, Math.round(finished - started));
    }

    getState() {
        return clone(this.state);
    }

    emit(reason) {
        this.dispatchEvent(new CustomEvent("statechange", {
            detail: {reason, state: this.getState()}
        }));
    }
}
