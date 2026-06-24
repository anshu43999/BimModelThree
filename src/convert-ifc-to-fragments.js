import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {mkdir, writeFile, readFile, open} from "node:fs/promises";
import {readSync} from "node:fs";
import {IfcImporter} from "@thatopen/fragments";

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

function parseArgs(argv) {
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

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.input || args.input === "--help" || args.input === "-h") {
        usage();
        process.exit(args.input ? 0 : 1);
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

    log("Fragments conversion done", {
        seconds: seconds(convertStarted),
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
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
