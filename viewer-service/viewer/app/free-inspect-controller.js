import * as THREE from "three";

export const FREE_INSPECT_KEYS = Object.freeze([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ShiftLeft",
    "ShiftRight"
]);

function clampSpeedMultiplier(value, precision = 2) {
    const number = Number(value);
    const fallback = 0.2;
    if (!Number.isFinite(number)) {
        return fallback;
    }
    return Math.max(0.2, Math.min(3, Number(number.toFixed(precision))));
}

function isEditableTarget(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

/** Shared WASD free-inspect state, keyboard, animation, and camera movement. */
export class FreeInspectController extends EventTarget {
    constructor(options = {}) {
        super();
        this.getCamera = options.getCamera || (() => options.camera || null);
        this.getControls = options.getControls || (() => options.controls || null);
        this.getAvailable = options.getAvailable || (() => true);
        this.getBaseSpeed = options.getBaseSpeed || (() => 8);
        this.onMove = typeof options.onMove === "function" ? options.onMove : null;
        this.keyboardTarget = options.keyboardTarget || null;
        this.requestFrame = options.requestFrame || globalThis.requestAnimationFrame?.bind(globalThis) || null;
        this.cancelFrame = options.cancelFrame || globalThis.cancelAnimationFrame?.bind(globalThis) || null;
        this.now = options.now || (() => globalThis.performance?.now?.() ?? Date.now());
        this.speedPrecision = Number.isInteger(options.speedPrecision) ? options.speedPrecision : 2;
        this.boostMultiplier = Number.isFinite(options.boostMultiplier) ? options.boostMultiplier : 2.6;
        this.maxDeltaSeconds = Number.isFinite(options.maxDeltaSeconds) ? options.maxDeltaSeconds : 0.08;
        this.enabled = false;
        this.speedMultiplier = clampSpeedMultiplier(options.speedMultiplier ?? 0.2, this.speedPrecision);
        this.pressedKeys = new Set();
        this.frame = null;
        this.lastTime = 0;
        this.keyboardBound = false;
        this.onKeyDown = (event) => this.handleKeyDown(event);
        this.onKeyUp = (event) => this.handleKeyUp(event);
    }

    getState() {
        const baseSpeed = Math.max(0, Number(this.getBaseSpeed()) || 0);
        return {
            enabled: this.enabled,
            available: Boolean(this.getAvailable()),
            baseSpeed,
            speedMultiplier: this.speedMultiplier,
            speed: baseSpeed * this.speedMultiplier,
            controls: {
                forward: "W",
                backward: "S",
                left: "A",
                right: "D",
                boost: "Shift"
            }
        };
    }

    setSpeedMultiplier(value) {
        this.speedMultiplier = clampSpeedMultiplier(value, this.speedPrecision);
        const state = this.getState();
        this.dispatchEvent(new CustomEvent("speedchange", {detail: state}));
        return state;
    }

    setEnabled(enabled) {
        const nextEnabled = Boolean(enabled && this.getAvailable());
        if (this.enabled === nextEnabled) {
            this.pressedKeys.clear();
            return this.getState();
        }
        this.enabled = nextEnabled;
        this.pressedKeys.clear();
        if (this.enabled) {
            this.bindKeyboard();
            this.start();
        } else {
            this.stop();
            this.unbindKeyboard();
        }
        const state = this.getState();
        this.dispatchEvent(new CustomEvent("modechange", {detail: state}));
        return state;
    }

    toggle() {
        return this.setEnabled(!this.enabled);
    }

    bindKeyboard() {
        if (this.keyboardBound || !this.keyboardTarget?.addEventListener) {
            return false;
        }
        this.keyboardTarget.addEventListener("keydown", this.onKeyDown);
        this.keyboardTarget.addEventListener("keyup", this.onKeyUp);
        this.keyboardBound = true;
        return true;
    }

    unbindKeyboard() {
        if (!this.keyboardBound || !this.keyboardTarget?.removeEventListener) {
            return false;
        }
        this.keyboardTarget.removeEventListener("keydown", this.onKeyDown);
        this.keyboardTarget.removeEventListener("keyup", this.onKeyUp);
        this.keyboardBound = false;
        return true;
    }

    handleKeyDown(event) {
        if (!this.enabled || isEditableTarget(event?.target) || !FREE_INSPECT_KEYS.includes(event?.code)) {
            return false;
        }
        this.pressedKeys.add(event.code);
        event.preventDefault?.();
        return true;
    }

    handleKeyUp(event) {
        if (!FREE_INSPECT_KEYS.includes(event?.code)) {
            return false;
        }
        this.pressedKeys.delete(event.code);
        if (this.enabled) {
            event.preventDefault?.();
        }
        return true;
    }

    start() {
        if (this.frame !== null || typeof this.requestFrame !== "function") {
            return false;
        }
        this.lastTime = this.now();
        const tick = (time) => {
            if (!this.enabled) {
                this.frame = null;
                return;
            }
            this.frame = this.requestFrame(tick);
            const deltaSeconds = Math.min(
                Math.max((time - this.lastTime) / 1000, 0),
                this.maxDeltaSeconds
            );
            this.lastTime = time;
            this.step(deltaSeconds);
        };
        this.frame = this.requestFrame(tick);
        return true;
    }

    stop() {
        if (this.frame !== null && typeof this.cancelFrame === "function") {
            this.cancelFrame(this.frame);
        }
        this.frame = null;
        return true;
    }

    step(deltaSeconds) {
        if (!this.enabled || !this.getAvailable() || !deltaSeconds || !this.pressedKeys.size) {
            return false;
        }
        const camera = this.getCamera();
        const controls = this.getControls();
        if (!camera || !controls?.target) {
            return false;
        }
        const forwardInput = (this.pressedKeys.has("KeyW") ? 1 : 0) - (this.pressedKeys.has("KeyS") ? 1 : 0);
        const rightInput = (this.pressedKeys.has("KeyD") ? 1 : 0) - (this.pressedKeys.has("KeyA") ? 1 : 0);
        if (!forwardInput && !rightInput) {
            return false;
        }

        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        if (forward.lengthSq() < 0.0001) {
            forward.subVectors(controls.target, camera.position);
            forward.y = 0;
        }
        if (forward.lengthSq() < 0.0001) {
            forward.set(0, 0, -1);
        }
        forward.normalize();

        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const direction = new THREE.Vector3()
            .addScaledVector(forward, forwardInput)
            .addScaledVector(right, rightInput);
        if (direction.lengthSq() < 0.0001) {
            return false;
        }
        const boost = this.pressedKeys.has("ShiftLeft") || this.pressedKeys.has("ShiftRight")
            ? this.boostMultiplier
            : 1;
        const movement = direction.normalize().multiplyScalar(this.getState().speed * boost * deltaSeconds);
        camera.position.add(movement);
        controls.target.add(movement);
        controls.update?.();
        this.onMove?.({movement, deltaSeconds, state: this.getState()});
        this.dispatchEvent(new CustomEvent("move", {
            detail: {movement: movement.clone(), deltaSeconds, state: this.getState()}
        }));
        return true;
    }

    dispose() {
        this.enabled = false;
        this.pressedKeys.clear();
        this.stop();
        this.unbindKeyboard();
    }
}

