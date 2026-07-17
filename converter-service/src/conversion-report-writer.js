import {writeFile} from "node:fs/promises";

function serializeError(error) {
    if (!error) {
        return null;
    }

    return {
        name: error.name || "Error",
        message: error.message || String(error),
        stack: error.stack || null
    };
}

export function buildConversionReport({
    inputPath,
    outputPath,
    manifestPath = null,
    inputStats = null,
    outputStats = null,
    convertSeconds = null,
    totalSeconds = null,
    status = "converted",
    error = null,
    args = {},
    converter = {},
    memory = null
}) {
    return {
        schemaVersion: "bim-conversion-report/v1",
        status,
        error: serializeError(error),
        input: {
            path: inputPath,
            fileName: inputPath ? inputPath.split(/[\\/]/).pop() : null,
            sizeBytes: inputStats?.size ?? null
        },
        output: {
            fragmentsPath: outputPath,
            manifestPath,
            sizeBytes: outputStats?.size ?? null
        },
        duration: {
            conversionSeconds: convertSeconds,
            totalSeconds
        },
        options: {
            raw: Boolean(args.raw),
            bytesMode: Boolean(args.bytesMode),
            fullProperties: Boolean(args.fullProperties)
        },
        converter: {
            name: converter.name ?? "@thatopen/fragments",
            version: converter.version ?? null,
            wasmPath: converter.wasmPath ?? null,
            mode: args.bytesMode ? "bytes" : "readCallback"
        },
        memory,
        createdAt: new Date().toISOString()
    };
}

export async function writeConversionReport(reportPath, report) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return reportPath;
}
