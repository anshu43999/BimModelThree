function sanitizeSnapshotName(value, fallback = "bim-view") {
    const cleaned = String(value || "")
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    return cleaned || fallback;
}

function extensionForMimeType(mimeType) {
    if (mimeType === "image/jpeg") {
        return ".jpg";
    }
    if (mimeType === "image/webp") {
        return ".webp";
    }
    return ".png";
}

function ensureSnapshotExtension(filename, mimeType) {
    return /\.[a-z0-9]+$/i.test(filename)
        ? filename
        : `${filename}${extensionForMimeType(mimeType)}`;
}

export function defaultSnapshotName(options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const prefix = sanitizeSnapshotName(options.modelName || options.prefix || "bim-view");
    return `${prefix}-${timestamp}${extensionForMimeType(options.mimeType || "image/png")}`;
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result));
        reader.addEventListener("error", () => reject(reader.error || new Error("Snapshot read failed")));
        reader.readAsDataURL(blob);
    });
}

function canvasToBlob(canvas, mimeType) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error("Canvas snapshot failed"));
            }
        }, mimeType);
    });
}

function createThumbnailDataUrl(sourceCanvas, options = {}) {
    const maxWidth = Math.max(1, Number(options.maxWidth) || 220);
    const maxHeight = Math.max(1, Number(options.maxHeight) || 124);
    const quality = Math.min(1, Math.max(0.1, Number(options.quality) || 0.72));
    const width = sourceCanvas.width || sourceCanvas.clientWidth || maxWidth;
    const height = sourceCanvas.height || sourceCanvas.clientHeight || maxHeight;
    const scale = Math.min(maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1), 1);
    const thumbWidth = Math.max(1, Math.round(width * scale));
    const thumbHeight = Math.max(1, Math.round(height * scale));
    const target = document.createElement("canvas");
    target.width = thumbWidth;
    target.height = thumbHeight;
    const context = target.getContext("2d", {
        alpha: false
    });
    if (!context) {
        return null;
    }
    context.fillStyle = "#0c0f11";
    context.fillRect(0, 0, thumbWidth, thumbHeight);
    context.drawImage(sourceCanvas, 0, 0, thumbWidth, thumbHeight);
    return target.toDataURL("image/jpeg", quality);
}

export class SnapshotEngine {
    constructor(options = {}) {
        this.renderer = options.renderer;
        this.scene = options.scene;
        this.camera = options.camera;
        this.canvas = options.canvas || options.renderer?.domElement;
    }

    async create(options = {}) {
        if (!this.renderer || !this.scene || !this.camera || !this.canvas) {
            throw new Error("SnapshotEngine requires renderer, scene, camera, and canvas");
        }

        const mimeType = options.mimeType || "image/png";
        const filename = ensureSnapshotExtension(
            sanitizeSnapshotName(options.filename || defaultSnapshotName({
                modelName: options.modelName,
                prefix: options.prefix,
                mimeType
            })),
            mimeType
        );
        this.renderer.render(this.scene, this.camera);
        const blob = await canvasToBlob(this.canvas, mimeType);
        const result = {
            filename,
            mimeType,
            sizeBytes: blob.size
        };

        if (options.returnBlob !== false) {
            result.blob = blob;
        }
        if (options.returnDataUrl) {
            result.dataUrl = await blobToDataUrl(blob);
        }
        if (options.returnThumbnail) {
            result.thumbnail = createThumbnailDataUrl(this.canvas, options.thumbnail || {});
        }
        if (options.download) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
        }

        return result;
    }
}
