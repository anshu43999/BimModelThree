export const TOOL_MODES = Object.freeze({
    SNAP: "snap",
    MEASURE_DISTANCE: "measure-distance",
    MEASURE_ANGLE: "measure-angle",
    MEASURE_AREA: "measure-area",
    SECTION: "section",
    FREE_INSPECT: "free-inspect",
    CTRL_LOOK: "ctrl-look",
    BOX_SELECT: "box-select",
    BUBBLE_RELOCATE: "bubble-relocate",
    MODEL_TRANSFORM: "model-transform",
    PATH_ROAM: "path-roam"
});

const DEFAULT_CONFLICTS = Object.freeze({
    [TOOL_MODES.SNAP]: [
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.MEASURE_DISTANCE]: [
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.FREE_INSPECT,
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.MODEL_TRANSFORM,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.MEASURE_ANGLE]: [
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.FREE_INSPECT,
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.MODEL_TRANSFORM,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.MEASURE_AREA]: [
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.FREE_INSPECT,
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.MODEL_TRANSFORM,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.SECTION]: [
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.BOX_SELECT
    ],
    [TOOL_MODES.FREE_INSPECT]: [
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.MODEL_TRANSFORM,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.CTRL_LOOK]: [
        TOOL_MODES.SNAP,
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.MODEL_TRANSFORM,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.BOX_SELECT]: [
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.SECTION,
        TOOL_MODES.FREE_INSPECT,
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.MODEL_TRANSFORM,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.BUBBLE_RELOCATE]: [
        TOOL_MODES.SNAP,
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.FREE_INSPECT,
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.MODEL_TRANSFORM,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.MODEL_TRANSFORM]: [
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.FREE_INSPECT,
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.PATH_ROAM
    ],
    [TOOL_MODES.PATH_ROAM]: [
        TOOL_MODES.SNAP,
        TOOL_MODES.MEASURE_DISTANCE,
        TOOL_MODES.MEASURE_ANGLE,
        TOOL_MODES.MEASURE_AREA,
        TOOL_MODES.FREE_INSPECT,
        TOOL_MODES.CTRL_LOOK,
        TOOL_MODES.BOX_SELECT,
        TOOL_MODES.MODEL_TRANSFORM
    ]
});

function normalizeConflictMap(conflicts = DEFAULT_CONFLICTS) {
    const result = new Map();
    for (const mode of Object.values(TOOL_MODES)) {
        result.set(mode, new Set());
    }
    for (const [mode, values] of Object.entries(conflicts || {})) {
        if (!result.has(mode)) {
            result.set(mode, new Set());
        }
        for (const conflict of values || []) {
            if (!conflict || conflict === mode) {
                continue;
            }
            if (!result.has(conflict)) {
                result.set(conflict, new Set());
            }
            result.get(mode).add(conflict);
            result.get(conflict).add(mode);
        }
    }
    return result;
}

export class ToolModeController extends EventTarget {
    constructor(options = {}) {
        super();
        this.conflicts = normalizeConflictMap(options.conflicts || DEFAULT_CONFLICTS);
        this.activeModes = new Set(options.activeModes || []);
    }

    activate(mode, options = {}) {
        if (!mode) {
            return this.getState();
        }
        const conflicts = this.getActiveConflicts(mode);
        for (const conflict of conflicts) {
            this.activeModes.delete(conflict);
        }
        const changed = !this.activeModes.has(mode) || conflicts.length > 0;
        this.activeModes.add(mode);
        const detail = {
            action: "activate",
            mode,
            activated: mode,
            deactivated: conflicts,
            source: options.source || "unknown",
            state: this.getState()
        };
        if (changed && options.dispatch !== false) {
            this.dispatchEvent(new CustomEvent("modechange", {detail}));
        }
        return detail;
    }

    deactivate(mode, options = {}) {
        if (!mode) {
            return this.getState();
        }
        const changed = this.activeModes.delete(mode);
        const detail = {
            action: "deactivate",
            mode,
            activated: null,
            deactivated: changed ? [mode] : [],
            source: options.source || "unknown",
            state: this.getState()
        };
        if (changed && options.dispatch !== false) {
            this.dispatchEvent(new CustomEvent("modechange", {detail}));
        }
        return detail;
    }

    reset(options = {}) {
        const deactivated = [...this.activeModes];
        this.activeModes.clear();
        const detail = {
            action: "reset",
            mode: null,
            activated: null,
            deactivated,
            source: options.source || "unknown",
            state: this.getState()
        };
        if (deactivated.length && options.dispatch !== false) {
            this.dispatchEvent(new CustomEvent("modechange", {detail}));
        }
        return detail;
    }

    isActive(mode) {
        return this.activeModes.has(mode);
    }

    getActiveConflicts(mode) {
        const conflicts = this.conflicts.get(mode) || new Set();
        return [...this.activeModes].filter((activeMode) => conflicts.has(activeMode));
    }

    getState() {
        return {
            activeModes: [...this.activeModes],
            count: this.activeModes.size
        };
    }
}
