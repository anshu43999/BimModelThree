const ANNOTATION_PERMISSIONS = new Set(["team", "owner", "assignee"]);
const ANNOTATION_PATCH_FIELDS = ["title", "content", "status", "priority", "position", "camera", "selection"];

/** Normalize optional text fields to either trimmed text or null. */
export function normalizeOptionalText(value) {
    const text = String(value ?? "").trim();
    return text || null;
}

/** Validate annotation permission; unsupported values fall back to team. */
export function normalizeAnnotationPermission(value) {
    const permission = normalizeOptionalText(value) || "team";
    return ANNOTATION_PERMISSIONS.has(permission) ? permission : "team";
}

/** Resolve the actor used in annotation create/update/history records. */
export function resolveAnnotationActor(payload = {}, fallback = "sdk-user") {
    return normalizeOptionalText(payload.actor || payload.userId || payload.createdBy || payload.updatedBy)
        || normalizeOptionalText(fallback)
        || "sdk-user";
}

/**
 * Create an allowed annotation update patch.
 * This prevents arbitrary business payload fields from mutating viewer records.
 */
export function createAnnotationPatch(payload = {}, actor = null) {
    const patch = {};
    if (actor) {
        patch.updatedBy = actor;
    }
    for (const field of ANNOTATION_PATCH_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
            patch[field] = payload[field];
        }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "text") && !Object.prototype.hasOwnProperty.call(patch, "content")) {
        patch.content = payload.text;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "assignee")) {
        patch.assignee = normalizeOptionalText(payload.assignee);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "permission")) {
        patch.permission = normalizeAnnotationPermission(payload.permission);
    }
    return patch;
}

/**
 * Convert a viewer annotation into the backend business-data annotation shape.
 * Business systems can extend the outer payload while the nested content object
 * stays compatible with the SDK collaboration contract.
 */
export function createBusinessAnnotationPayload(annotation = {}, context = {}) {
    const createdBy = annotation.createdBy || context.createdBy || null;
    const updatedBy = annotation.updatedBy || annotation.createdBy || context.createdBy || null;
    const assignee = annotation.assignee || null;
    const permission = normalizeAnnotationPermission(annotation.permission);
    const history = Array.isArray(annotation.history) ? annotation.history : [];
    const text = annotation.content || annotation.title || "";
    return {
        ...context,
        ...annotation,
        title: annotation.title || "模型批注",
        status: annotation.status || "open",
        createdBy,
        updatedBy,
        assignee,
        permission,
        history,
        content: {
            schemaVersion: "bim-annotation/v1",
            content: text,
            text,
            priority: annotation.priority || null,
            createdBy,
            updatedBy,
            assignee,
            permission,
            history
        }
    };
}
