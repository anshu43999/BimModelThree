import path from "node:path";
import {writeFile} from "node:fs/promises";

function toPortablePath(value) {
    return value.replace(/\\/g, "/");
}

function buildModelId(inputPath) {
    return path.basename(inputPath, path.extname(inputPath))
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "model";
}

function compressionRatio(inputSizeBytes, outputSizeBytes) {
    if (!inputSizeBytes || !outputSizeBytes) {
        return null;
    }

    return Number((inputSizeBytes / outputSizeBytes).toFixed(2));
}

export function buildModelManifest({
    inputPath,
    outputPath,
    inputStats,
    outputStats,
    args = {},
    convertSeconds,
    createdAt = new Date().toISOString(),
    modelId = buildModelId(inputPath),
    modelVersionId = `${modelId}-${Date.now()}`
}) {
    const outputDir = path.dirname(outputPath);
    const fragmentRelativeUrl = toPortablePath(path.relative(outputDir, outputPath));

    return {
        schemaVersion: "bim-model-manifest/v1",
        modelId,
        modelVersionId,
        displayName: path.basename(inputPath, path.extname(inputPath)),
        source: {
            type: "ifc",
            fileName: path.basename(inputPath),
            sizeBytes: inputStats?.size ?? null
        },
        resources: {
            fragments: {
                url: fragmentRelativeUrl,
                sizeBytes: outputStats?.size ?? null,
                format: "frag"
            },
            properties: {
                url: "properties.json",
                optional: true
            },
            globalIdIndex: {
                url: "global-id-index.json",
                optional: true
            }
        },
        conversion: {
            converter: "@thatopen/fragments",
            raw: Boolean(args.raw),
            fullProperties: Boolean(args.fullProperties),
            mode: args.bytesMode ? "bytes" : "readCallback",
            seconds: convertSeconds ?? null,
            compressionRatio: compressionRatio(inputStats?.size, outputStats?.size),
            createdAt
        },
        viewer: {
            defaultTreeTabs: ["models", "objects", "classes", "storeys"],
            defaultView: null
        }
    };
}

export async function writeModelManifest(manifestPath, manifest) {
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifestPath;
}
