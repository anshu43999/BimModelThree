import {
    getLatestPendingPathRoamKeyframe,
    getPathRoamCameraAt,
    getPathRoamTotalDuration
} from "./path-roam-core.js";

function clampSpeed(value) {
    const number = Number(value);
    return Number.isFinite(number)
        ? Math.max(0.25, Math.min(3, Number(number.toFixed(2))))
        : 1;
}

/** Shared path-roam playback clock, RAF loop, interpolation, and keyframe trigger state. */
export class PathRoamPlaybackController extends EventTarget {
    constructor(options = {}) {
        super();
        this.getPoints = options.getPoints || (() => []);
        this.getAvailable = options.getAvailable || (() => true);
        this.onFrame = typeof options.onFrame === "function" ? options.onFrame : null;
        this.onKeyframe = typeof options.onKeyframe === "function" ? options.onKeyframe : null;
        this.onKeyframeError = typeof options.onKeyframeError === "function" ? options.onKeyframeError : null;
        this.onComplete = typeof options.onComplete === "function" ? options.onComplete : null;
        this.requestFrame = options.requestFrame || globalThis.requestAnimationFrame?.bind(globalThis) || null;
        this.cancelFrame = options.cancelFrame || globalThis.cancelAnimationFrame?.bind(globalThis) || null;
        this.now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
        this.playing = false;
        this.paused = false;
        this.frame = null;
        this.startedAt = 0;
        this.elapsedMs = 0;
        this.speedMultiplier = clampSpeed(options.speedMultiplier ?? 1);
        this.appliedKeyframeIds = new Set();
        this.applyingKeyframe = false;
    }

    getTotalDuration() {
        return getPathRoamTotalDuration(this.getPoints());
    }

    getCurrentElapsed(time = this.now()) {
        if (!this.playing || this.paused) {
            return this.elapsedMs;
        }
        return Math.min(
            this.getTotalDuration(),
            this.elapsedMs + Math.max(0, time - this.startedAt) * this.speedMultiplier
        );
    }

    getState() {
        return {
            playing: this.playing && !this.paused,
            active: this.playing,
            paused: this.paused,
            elapsedMs: Math.round(this.getCurrentElapsed()),
            totalMs: this.getTotalDuration(),
            speedMultiplier: this.speedMultiplier
        };
    }

    setSpeedMultiplier(value) {
        if (this.playing && !this.paused) {
            this.elapsedMs = this.getCurrentElapsed();
            this.startedAt = this.now();
        }
        this.speedMultiplier = clampSpeed(value);
        return this.getState();
    }

    setElapsed(value) {
        this.elapsedMs = Math.max(0, Math.min(this.getTotalDuration(), Number(value) || 0));
        if (this.playing && !this.paused) {
            this.startedAt = this.now();
        }
        return this.getState();
    }

    play() {
        const totalDuration = this.getTotalDuration();
        if (!this.getAvailable() || totalDuration <= 0) {
            return false;
        }
        this.playing = true;
        this.paused = false;
        this.startedAt = this.now();
        this.appliedKeyframeIds = new Set();
        this.applyingKeyframe = false;
        this.startLoop();
        this.dispatchEvent(new CustomEvent("playbackchange", {detail: this.getState()}));
        return true;
    }

    pause() {
        if (!this.playing || this.paused) {
            return false;
        }
        this.elapsedMs = this.getCurrentElapsed();
        this.paused = true;
        this.stopLoop();
        this.dispatchEvent(new CustomEvent("playbackchange", {detail: this.getState()}));
        return true;
    }

    stop(options = {}) {
        const wasActive = this.playing || this.paused || this.elapsedMs > 0;
        this.stopLoop();
        this.playing = false;
        this.paused = false;
        this.appliedKeyframeIds = new Set();
        this.applyingKeyframe = false;
        if (options.reset !== false) {
            this.elapsedMs = 0;
        }
        if (wasActive || options.dispatch === true) {
            this.dispatchEvent(new CustomEvent("playbackchange", {detail: this.getState()}));
        }
        return wasActive;
    }

    startLoop() {
        if (this.frame !== null || typeof this.requestFrame !== "function") {
            return false;
        }
        const tick = (time) => {
            if (!this.playing || this.paused) {
                this.frame = null;
                return;
            }
            const totalDuration = this.getTotalDuration();
            const elapsed = this.getCurrentElapsed(time);
            const viewState = getPathRoamCameraAt(this.getPoints(), elapsed);
            this.onFrame?.({viewState, elapsedMs: elapsed, totalMs: totalDuration});
            this.triggerKeyframe(elapsed);
            if (elapsed >= totalDuration) {
                this.elapsedMs = totalDuration;
                this.stop({reset: true});
                this.onComplete?.({elapsedMs: totalDuration, totalMs: totalDuration});
                return;
            }
            this.frame = this.requestFrame(tick);
        };
        this.frame = this.requestFrame(tick);
        return true;
    }

    stopLoop() {
        if (this.frame !== null && typeof this.cancelFrame === "function") {
            this.cancelFrame(this.frame);
        }
        this.frame = null;
    }

    triggerKeyframe(elapsedMs) {
        if (this.applyingKeyframe || !this.onKeyframe) {
            return null;
        }
        const point = getLatestPendingPathRoamKeyframe(
            this.getPoints(),
            elapsedMs,
            this.appliedKeyframeIds
        );
        if (!point) {
            return null;
        }
        this.appliedKeyframeIds.add(point.id);
        this.applyingKeyframe = true;
        Promise.resolve(this.onKeyframe(point))
            .catch((error) => this.onKeyframeError?.(error, point))
            .finally(() => {
                this.applyingKeyframe = false;
            });
        return point;
    }

    dispose() {
        this.stop({reset: true});
    }
}

