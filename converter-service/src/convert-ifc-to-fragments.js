import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {mkdir, writeFile, readFile, open} from "node:fs/promises";
import {readSync} from "node:fs";
import {IfcImporter} from "@thatopen/fragments";
import {buildModelManifest, writeModelManifest} from "./manifest-writer.js";
import {buildConversionReport, writeConversionReport} from "./conversion-report-writer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function usage() {
    console.log(`Usage:
  node src/convert-ifc-to-fragments.js <input.ifc> [output.frag] [--raw] [--bytes] [--full-properties]

Examples:
  npm run convert -- input.ifc output/model.frag
  npm run convert:8g -- input.ifc output/model.frag
  npm run convert:full -- input.ifc output/model.full.frag

Options:
  --raw              Output raw uncompressed fragments data.
  --bytes            Read the full IFC into memory before conversion. Default uses readCallback streaming.
  --full-properties  Include all IFC attributes and relations in the generated fragments file.
`);
}

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function seconds(started) {
    return Number(((performance.now() - started) / 1000).toFixed(2));
}

function memorySnapshot() {
    const memory = process.memoryUsage();
    return {
        rssMB: mb(memory.rss),
        heapUsedMB: mb(memory.heapUsed),
        heapTotalMB: mb(memory.heapTotal),
        externalMB: mb(memory.external),
        arrayBuffersMB: mb(memory.arrayBuffers)
    };
}

function log(message, data) {
    const line = data === undefined ? message : `${message} ${JSON.stringify(data)}`;
    console.log(`[${new Date().toISOString()}] ${line}`);
}

export function parseArgs(argv) {
    const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
    const positional = argv.filter((arg) => !arg.startsWith("--"));
    return {
        input: positional[0],
        output: positional[1],
        raw: flags.has("--raw"),
        bytesMode: flags.has("--bytes"),
        fullProperties: flags.has("--full-properties")
    };
}

export async function writeConversionFailureReport(error, args) {
    if (!args.input) {
        return null;
    }

    const inputPath = path.resolve(args.input);
    const inputStats = fs.existsSync(inputPath) ? fs.statSync(inputPath) : null;
    const outputPath = path.resolve(args.output || path.join(
        projectRoot,
        "output",
        `${path.basename(inputPath, path.extname(inputPath))}.frag`
    ));
    const reportPath = path.join(path.dirname(outputPath), "conversion-report.json");
    await mkdir(path.dirname(reportPath), {recursive: true});
    const report = buildConversionReport({
        inputPath,
        outputPath,
        inputStats,
        status: "failed",
        error,
        args,
        converter: {
            name: "@thatopen/fragments"
        },
        memory: memorySnapshot()
    });
    await writeConversionReport(reportPath, report);
    log("Conversion failure report write done", {report: reportPath});
    return {
        report,
        reportPath,
        outputPath
    };
}

async function convertWithBytes(importer, inputPath, raw) {
    const readStarted = performance.now();
    const inputBuffer = await readFile(inputPath);
    log("IFC read complete", {
        seconds: seconds(readStarted),
        sizeMB: mb(inputBuffer.byteLength),
        memory: memorySnapshot()
    });

    return importer.process({
        bytes: new Uint8Array(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength),
        raw,
        progressCallback: (progress, data) => {
            log("Fragments progress", {progress, data});
        }
    });
}

async function convertWithReadCallback(importer, inputPath, raw) {
    const handle = await open(inputPath, "r");
    const chunkSize = 1024 * 1024;
    const buffer = new Uint8Array(chunkSize);

    try {
        return await importer.process({
            readFromCallback: true,
            raw,
            readCallback: (offset) => {
                const bytesRead = readSync(handle.fd, buffer, 0, chunkSize, offset);
                return buffer.slice(0, bytesRead);
            },
            progressCallback: (progress, data) => {
                log("Fragments progress", {progress, data});
            }
        });
    } finally {
        await handle.close();
    }
}

export async function convertIfcToFragments(options = {}) {
    const totalStarted = performance.now();
    const args = {
        input: options.input,
        output: options.output,
        raw: Boolean(options.raw),
        bytesMode: Boolean(options.bytesMode),
        fullProperties: Boolean(options.fullProperties)
    };

    if (!args.input || args.input === "--help" || args.input === "-h") {
        throw new Error("Input IFC path is required.");
    }

    const inputPath = path.resolve(args.input);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input IFC not found: ${inputPath}`);
    }

    const inputStats = fs.statSync(inputPath);
    const outputPath = path.resolve(args.output || path.join(
        projectRoot,
        "output",
        `${path.basename(inputPath, path.extname(inputPath))}.frag`
    ));

    const wasmPath = path.join(projectRoot, "node_modules", "web-ifc") + path.sep;
    const importer = new IfcImporter();
    importer.wasm = {
        path: wasmPath,
        absolute: true
    };

    if (args.fullProperties) {
        importer.addAllAttributes();
        importer.addAllRelations();
    }

    log("Fragments conversion start", {
        input: inputPath,
        output: outputPath,
        inputSizeMB: mb(inputStats.size),
        raw: args.raw,
        mode: args.bytesMode ? "bytes" : "readCallback",
        fullProperties: args.fullProperties,
        wasmPath,
        memory: memorySnapshot()
    });

    const convertStarted = performance.now();
    const fragments = args.bytesMode
        ? await convertWithBytes(importer, inputPath, args.raw)
        : await convertWithReadCallback(importer, inputPath, args.raw);
    const convertSeconds = seconds(convertStarted);

    log("Fragments conversion done", {
        seconds: convertSeconds,
        outputSizeMB: mb(fragments.byteLength),
        compressionRatio: Number((inputStats.size / fragments.byteLength).toFixed(2)),
        memory: memorySnapshot()
    });

    await mkdir(path.dirname(outputPath), {recursive: true});
    const writeStarted = performance.now();
    await writeFile(outputPath, fragments);

    log("Fragments write done", {
        seconds: seconds(writeStarted),
        output: outputPath,
        outputSizeMB: mb(fragments.byteLength),
        memory: memorySnapshot()
    });

    const outputStats = fs.statSync(outputPath);
    const manifest = buildModelManifest({
        inputPath,
        outputPath,
        inputStats,
        outputStats,
        args,
        convertSeconds
    });
    const manifestPath = path.join(path.dirname(outputPath), "manifest.json");
    const reportPath = path.join(path.dirname(outputPath), "conversion-report.json");
    const report = buildConversionReport({
        inputPath,
        outputPath,
        manifestPath,
        inputStats,
        outputStats,
        convertSeconds,
        totalSeconds: seconds(totalStarted),
        status: "converted",
        args,
        converter: {
            name: "@thatopen/fragments",
            wasmPath
        },
        memory: memorySnapshot()
    });

    await writeModelManifest(manifestPath, manifest);
    await writeConversionReport(reportPath, report);

    log("Manifest write done", {
        manifest: manifestPath,
        report: reportPath
    });

    return {
        inputPath,
        outputPath,
        manifestPath,
        reportPath,
        manifest,
        report
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.input || args.input === "--help" || args.input === "-h") {
        usage();
        process.exit(args.input ? 0 : 1);
    }

    await convertIfcToFragments(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(async (error) => {
        console.error(error);
        try {
            const args = parseArgs(process.argv.slice(2));
            await writeConversionFailureReport(error, args);
        } catch (reportError) {
            console.error("Failed to write conversion failure report", reportError);
        }
        process.exit(1);
    });
}
