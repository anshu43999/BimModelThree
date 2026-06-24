import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {mkdir, writeFile, readFile, open} from "node:fs/promises";
import {readSync} from "node:fs";
import {IfcImporter, SingleThreadedFragmentsModel} from "@thatopen/fragments";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const wasmPath = path.join(projectRoot, "node_modules", "web-ifc") + path.sep;

const IMPORTANT_FIELDS = [
    ["GlobalId", ["GlobalId", "globalId", "GUID", "guid"]],
    ["Name", ["Name", "name"]],
    ["LongName", ["LongName", "longName"]],
    ["Description", ["Description", "description"]],
    ["ObjectType", ["ObjectType", "Object Type", "objectType"]],
    ["PredefinedType", ["PredefinedType", "Predefined Type", "predefinedType"]]
];

const ITEM_DATA_CONFIG = {
    attributesDefault: true,
    relations: {
        IsDefinedBy: {attributes: true, relations: true},
        DefinesOccurrence: {attributes: true, relations: true},
        HasAssociations: {attributes: true, relations: true},
        HasAssignments: {attributes: true, relations: true},
        IsTypedBy: {attributes: true, relations: true}
    }
};

function usage() {
    console.log(`Usage:
  node src/validate-t003-t004.js <input.ifc> [--sample-size=300] [--bytes] [--raw] [--full-stability]

Examples:
  npm run validate:t003-t004 -- ..\\app\\data\\projects\\RevitSamples\\models\\Building-Architecture\\source.ifc
  npm run validate:t003-t004:8g -- ..\\app\\data\\projects\\RevitSamples\\models\\20210219Architecture\\source.ifc -- --sample-size=500

What it validates:
  T003: default .frag vs full-properties .frag property completeness.
  T004: same IFC converted twice with the same parameters, then compares GlobalId/localId/tree signatures.

Options:
  --sample-size=N   Number of items to inspect for property completeness. Default: 300.
  --bytes           Read the IFC fully into memory before conversion.
  --raw             Generate raw uncompressed .frag files.
  --full-stability  Also convert full-properties twice and compare ID stability for full mode.
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
    const positional = [];
    const options = {
        sampleSize: 300,
        bytesMode: false,
        raw: false,
        fullStability: false
    };

    for (const arg of argv) {
        if (arg === "--help" || arg === "-h") {
            options.help = true;
        } else if (arg === "--bytes") {
            options.bytesMode = true;
        } else if (arg === "--raw") {
            options.raw = true;
        } else if (arg === "--full-stability") {
            options.fullStability = true;
        } else if (arg.startsWith("--sample-size=")) {
            options.sampleSize = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        } else {
            positional.push(arg);
        }
    }

    if (!Number.isFinite(options.sampleSize) || options.sampleSize < 1) {
        throw new Error("--sample-size must be a positive number.");
    }

    return {
        input: positional[0],
        ...options
    };
}

function createImporter(fullProperties) {
    const importer = new IfcImporter();
    importer.wasm = {
        path: wasmPath,
        absolute: true
    };

    if (fullProperties) {
        importer.addAllAttributes();
        importer.addAllRelations();
    }

    return importer;
}

async function convertWithBytes(importer, inputPath, raw) {
    const inputBuffer = await readFile(inputPath);
    return importer.process({
        bytes: new Uint8Array(inputBuffer.buffer, inputBuffer.byteOffset, inputBuffer.byteLength),
        raw,
        progressCallback: (progress, data) => log("Fragments progress", {progress, data})
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
            progressCallback: (progress, data) => log("Fragments progress", {progress, data})
        });
    } finally {
        await handle.close();
    }
}

async function convertOne({inputPath, outputPath, raw, bytesMode, fullProperties, label}) {
    const inputStats = fs.statSync(inputPath);
    const importer = createImporter(fullProperties);
    const started = performance.now();
    log("Conversion start", {
        label,
        inputSizeMB: mb(inputStats.size),
        outputPath,
        raw,
        bytesMode,
        fullProperties,
        memory: memorySnapshot()
    });

    const fragments = bytesMode
        ? await convertWithBytes(importer, inputPath, raw)
        : await convertWithReadCallback(importer, inputPath, raw);

    await mkdir(path.dirname(outputPath), {recursive: true});
    await writeFile(outputPath, fragments);

    const outputStats = fs.statSync(outputPath);
    const result = {
        label,
        path: outputPath,
        fullProperties,
        raw,
        seconds: seconds(started),
        outputSizeMB: mb(outputStats.size),
        compressionRatio: Number((inputStats.size / outputStats.size).toFixed(2)),
        memory: memorySnapshot()
    };
    log("Conversion done", result);
    return result;
}

async function loadModel(fragPath, modelId, raw) {
    const buffer = await readFile(fragPath);
    return new SingleThreadedFragmentsModel(
        modelId,
        new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
        raw
    );
}

async function inspectModel(fragPath, label, options) {
    const started = performance.now();
    const model = await loadModel(fragPath, label, options.raw);

    try {
        const localIds = await model.getLocalIds();
        const spatialTree = model.getSpatialStructure();
        const categories = safeCall(() => model.getCategories(), []);
        const geometryLocalIds = safeCall(() => model.getItemsWithGeometry(), []);
        const guids = await getGuidPairs(model, localIds);
        const sampleLocalIds = pickSampleLocalIds(localIds, geometryLocalIds, spatialTree, options.sampleSize);
        const propertyMetrics = inspectProperties(model, sampleLocalIds, guids);
        const materials = await inspectMaterials(model);

        return {
            label,
            path: fragPath,
            fileSizeMB: mb(fs.statSync(fragPath).size),
            inspectSeconds: seconds(started),
            localIdCount: localIds.length,
            geometryLocalIdCount: geometryLocalIds.length,
            categoryCount: categories.length,
            categories: categories.slice(0, 80),
            guidCount: guids.filter((pair) => pair.guid).length,
            spatialTreeSignature: hashObject(treeSignature(spatialTree)),
            spatialTreeNodeCount: countTreeNodes(spatialTree),
            sampleLocalIds,
            fieldCoverage: propertyMetrics.fieldCoverage,
            propertySetLikeKeyCount: propertyMetrics.propertySetLikeKeyCount,
            relationLikeKeyCount: propertyMetrics.relationLikeKeyCount,
            sampleItems: propertyMetrics.sampleItems,
            materialSummary: materials,
            guidPairs: guids
        };
    } finally {
        model.dispose();
    }
}

function safeCall(fn, fallback) {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

async function getGuidPairs(model, localIds) {
    const pairs = [];
    const batchSize = 5000;

    for (let i = 0; i < localIds.length; i += batchSize) {
        const batch = localIds.slice(i, i + batchSize);
        const guids = model.getGuidsByLocalIds(batch);
        batch.forEach((localId, index) => {
            pairs.push({localId, guid: guids[index] || null});
        });
    }

    return pairs;
}

function pickSampleLocalIds(localIds, geometryLocalIds, spatialTree, sampleSize) {
    const result = [];
    const seen = new Set();
    const add = (id) => {
        if (typeof id !== "number" || seen.has(id) || result.length >= sampleSize) {
            return;
        }
        seen.add(id);
        result.push(id);
    };

    collectTreeLocalIds(spatialTree).forEach(add);
    geometryLocalIds.forEach(add);
    localIds.forEach(add);

    return result;
}

function inspectProperties(model, sampleLocalIds, guidPairs) {
    const guidByLocalId = new Map(guidPairs.map((pair) => [pair.localId, pair.guid]));
    const coverage = Object.fromEntries(
        IMPORTANT_FIELDS.map(([field]) => [field, {count: 0, ratio: 0}])
    );
    const sampleItems = [];
    let propertySetLikeKeyCount = 0;
    let relationLikeKeyCount = 0;

    for (const localId of sampleLocalIds) {
        const data = safeCall(() => model.getItemsData([localId], ITEM_DATA_CONFIG), []);
        const itemData = Array.isArray(data) ? data[0] : data;
        const flat = {};
        appendFlat(flat, itemData, "", new WeakSet(), 0);

        const item = {
            localId,
            guid: guidByLocalId.get(localId) || null,
            fields: {}
        };

        for (const [field, aliases] of IMPORTANT_FIELDS) {
            const value = field === "GlobalId"
                ? item.guid || pickValue(flat, aliases)
                : pickValue(flat, aliases);
            if (hasValue(value)) {
                coverage[field].count += 1;
            }
            item.fields[field] = value || null;
        }

        const keys = Object.keys(flat);
        const psetKeys = keys.filter((key) => /pset|property|properties|quantity|qto/i.test(key));
        const relationKeys = keys.filter((key) => /isdefinedby|definesoccurrence|hasassociations|isnestedby|contains|decomposes|relating|related/i.test(key));
        propertySetLikeKeyCount += psetKeys.length;
        relationLikeKeyCount += relationKeys.length;
        item.flatKeyCount = keys.length;
        item.propertySetLikeKeys = psetKeys.slice(0, 10);
        item.relationLikeKeys = relationKeys.slice(0, 10);

        if (sampleItems.length < 20) {
            sampleItems.push(item);
        }
    }

    const total = sampleLocalIds.length || 1;
    for (const value of Object.values(coverage)) {
        value.ratio = Number((value.count / total).toFixed(4));
    }

    return {
        fieldCoverage: coverage,
        propertySetLikeKeyCount,
        relationLikeKeyCount,
        sampleItems
    };
}

async function inspectMaterials(model) {
    const materialIds = await safeAsync(() => model.getMaterialsIds(), []);
    const materialCount = Array.isArray(materialIds) || materialIds instanceof Uint32Array
        ? materialIds.length
        : materialIds instanceof Set
            ? materialIds.size
            : 0;
    return {materialCount};
}

async function safeAsync(fn, fallback) {
    try {
        return await fn();
    } catch {
        return fallback;
    }
}

function appendFlat(target, value, prefix, seen = new WeakSet(), depth = 0) {
    if (value === null || value === undefined) {
        return;
    }
    if (depth > 12) {
        target[prefix || "__root__"] = "[MaxDepth]";
        return;
    }
    if (value instanceof Map) {
        if (seen.has(value)) {
            target[prefix || "__root__"] = "[Circular]";
            return;
        }
        seen.add(value);
        for (const [key, child] of value.entries()) {
            appendFlat(target, child, joinKey(prefix, key), seen, depth + 1);
        }
        return;
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) {
            target[prefix || "__root__"] = "[Circular]";
            return;
        }
        seen.add(value);
        value.slice(0, 100).forEach((child, index) => appendFlat(target, child, joinKey(prefix, index), seen, depth + 1));
        return;
    }
    if (typeof value === "object") {
        if (seen.has(value)) {
            target[prefix || "__root__"] = "[Circular]";
            return;
        }
        seen.add(value);
        if ("value" in value && Object.keys(value).length <= 3) {
            target[prefix] = value.value;
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            appendFlat(target, child, joinKey(prefix, key), seen, depth + 1);
        }
        return;
    }
    target[prefix] = value;
}

function joinKey(prefix, key) {
    return prefix ? `${prefix}.${key}` : String(key);
}

function pickValue(flat, keys) {
    for (const key of keys) {
        if (hasValue(flat[key])) {
            return String(flat[key]);
        }
    }
    const lowerKeys = keys.map((key) => key.toLowerCase());
    for (const [key, value] of Object.entries(flat)) {
        const last = key.split(".").pop().toLowerCase();
        if (lowerKeys.includes(last) && hasValue(value)) {
            return String(value);
        }
    }
    return null;
}

function hasValue(value) {
    return value !== undefined && value !== null && value !== "";
}

function collectTreeLocalIds(item) {
    const result = [];
    const seen = new Set();
    const stack = item ? [item] : [];

    while (stack.length) {
        const current = stack.pop();
        const ids = Array.isArray(current.localIds)
            ? current.localIds
            : typeof current.localId === "number"
                ? [current.localId]
                : [];

        for (const id of ids) {
            if (typeof id === "number" && !seen.has(id)) {
                seen.add(id);
                result.push(id);
            }
        }

        if (Array.isArray(current.children)) {
            for (let i = current.children.length - 1; i >= 0; i--) {
                stack.push(current.children[i]);
            }
        }
    }

    return result;
}

function treeSignature(item) {
    if (!item) {
        return null;
    }
    return {
        category: item.category || null,
        localId: typeof item.localId === "number" ? item.localId : null,
        localIds: Array.isArray(item.localIds) ? item.localIds.slice(0, 20) : [],
        children: Array.isArray(item.children) ? item.children.map(treeSignature) : []
    };
}

function countTreeNodes(item) {
    if (!item) {
        return 0;
    }
    let count = 0;
    const stack = [item];
    while (stack.length) {
        const current = stack.pop();
        count += 1;
        if (Array.isArray(current.children)) {
            current.children.forEach((child) => stack.push(child));
        }
    }
    return count;
}

function hashObject(value) {
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compareStability(a, b) {
    const mapA = new Map(a.guidPairs.filter((pair) => pair.guid).map((pair) => [pair.guid, pair.localId]));
    const mapB = new Map(b.guidPairs.filter((pair) => pair.guid).map((pair) => [pair.guid, pair.localId]));
    let commonGuidCount = 0;
    let sameLocalIdCount = 0;
    const mismatches = [];

    for (const [guid, localIdA] of mapA.entries()) {
        if (!mapB.has(guid)) {
            continue;
        }
        commonGuidCount += 1;
        const localIdB = mapB.get(guid);
        if (localIdA === localIdB) {
            sameLocalIdCount += 1;
        } else if (mismatches.length < 30) {
            mismatches.push({guid, localIdA, localIdB});
        }
    }

    return {
        localIdCountEqual: a.localIdCount === b.localIdCount,
        guidCountEqual: a.guidCount === b.guidCount,
        spatialTreeSignatureEqual: a.spatialTreeSignature === b.spatialTreeSignature,
        spatialTreeNodeCountEqual: a.spatialTreeNodeCount === b.spatialTreeNodeCount,
        commonGuidCount,
        sameLocalIdCount,
        sameLocalIdRatio: commonGuidCount ? Number((sameLocalIdCount / commonGuidCount).toFixed(4)) : 0,
        mismatchSamples: mismatches
    };
}

function compareT003(defaultModel, fullModel) {
    const fieldDiffs = {};
    for (const [field] of IMPORTANT_FIELDS) {
        const defaultValue = defaultModel.fieldCoverage[field];
        const fullValue = fullModel.fieldCoverage[field];
        fieldDiffs[field] = {
            defaultCount: defaultValue.count,
            defaultRatio: defaultValue.ratio,
            fullCount: fullValue.count,
            fullRatio: fullValue.ratio,
            deltaCount: fullValue.count - defaultValue.count,
            deltaRatio: Number((fullValue.ratio - defaultValue.ratio).toFixed(4))
        };
    }

    return {
        fieldDiffs,
        propertySetLikeKeyDelta: fullModel.propertySetLikeKeyCount - defaultModel.propertySetLikeKeyCount,
        relationLikeKeyDelta: fullModel.relationLikeKeyCount - defaultModel.relationLikeKeyCount,
        materialCountDefault: defaultModel.materialSummary.materialCount,
        materialCountFull: fullModel.materialSummary.materialCount
    };
}

async function writeReports(outputDir, report) {
    const jsonPath = path.join(outputDir, "t003-t004-report.json");
    const mdPath = path.join(outputDir, "t003-t004-report.md");
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(mdPath, renderMarkdown(report), "utf8");
    return {jsonPath, mdPath};
}

function renderMarkdown(report) {
    const lines = [];
    lines.push("# T003 / T004 Fragments 验证报告");
    lines.push("");
    lines.push(`生成时间：${report.generatedAt}`);
    lines.push("");
    lines.push("## 输入");
    lines.push("");
    lines.push(`- IFC：\`${report.input.path}\``);
    lines.push(`- IFC 大小：${report.input.sizeMB} MB`);
    lines.push(`- sampleSize：${report.options.sampleSize}`);
    lines.push(`- raw：${report.options.raw}`);
    lines.push(`- bytesMode：${report.options.bytesMode}`);
    lines.push("");
    lines.push("## 转换结果");
    lines.push("");
    lines.push("| 文件 | 完整属性 | 耗时(s) | 大小(MB) | 压缩比 |");
    lines.push("|---|---:|---:|---:|---:|");
    for (const item of report.conversions) {
        lines.push(`| ${item.label} | ${item.fullProperties ? "是" : "否"} | ${item.seconds} | ${item.outputSizeMB} | ${item.compressionRatio} |`);
    }
    lines.push("");
    lines.push("## T003 属性完整度对比");
    lines.push("");
    lines.push("| 字段 | 默认数量 | 默认比例 | 完整属性数量 | 完整属性比例 | 增量 |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const [field, diff] of Object.entries(report.t003.fieldDiffs)) {
        lines.push(`| ${field} | ${diff.defaultCount} | ${diff.defaultRatio} | ${diff.fullCount} | ${diff.fullRatio} | ${diff.deltaCount} |`);
    }
    lines.push("");
    lines.push(`- PSet/Property 相关 key 增量：${report.t003.propertySetLikeKeyDelta}`);
    lines.push(`- Relation 相关 key 增量：${report.t003.relationLikeKeyDelta}`);
    lines.push(`- 默认材质数量：${report.t003.materialCountDefault}`);
    lines.push(`- 完整属性材质数量：${report.t003.materialCountFull}`);
    lines.push("");
    lines.push("## T004 ID 稳定性");
    lines.push("");
    lines.push("### 默认转换重复验证");
    lines.push("");
    appendStability(lines, report.t004.defaultStability);
    if (report.t004.fullStability) {
        lines.push("");
        lines.push("### 完整属性转换重复验证");
        lines.push("");
        appendStability(lines, report.t004.fullStability);
    }
    lines.push("");
    lines.push("## 初步结论");
    lines.push("");
    lines.push(`- T003：${report.conclusion.t003}`);
    lines.push(`- T004：${report.conclusion.t004}`);
    lines.push("");
    lines.push("详细样本请查看同目录 JSON 报告。");
    lines.push("");
    return lines.join("\n");
}

function appendStability(lines, stability) {
    lines.push(`- localId 数量一致：${stability.localIdCountEqual}`);
    lines.push(`- GUID 数量一致：${stability.guidCountEqual}`);
    lines.push(`- 空间树签名一致：${stability.spatialTreeSignatureEqual}`);
    lines.push(`- 空间树节点数一致：${stability.spatialTreeNodeCountEqual}`);
    lines.push(`- 共同 GUID 数量：${stability.commonGuidCount}`);
    lines.push(`- localId 一致数量：${stability.sameLocalIdCount}`);
    lines.push(`- localId 一致比例：${stability.sameLocalIdRatio}`);
    if (stability.mismatchSamples.length) {
        lines.push("");
        lines.push("localId 不一致样本：");
        lines.push("");
        lines.push("| GUID | A localId | B localId |");
        lines.push("|---|---:|---:|");
        for (const item of stability.mismatchSamples.slice(0, 10)) {
            lines.push(`| ${item.guid} | ${item.localIdA} | ${item.localIdB} |`);
        }
    }
}

function makeConclusion(t003, defaultStability) {
    const meaningfulFields = ["Name", "Description", "ObjectType", "PredefinedType"];
    const improved = meaningfulFields.some((field) => t003.fieldDiffs[field].deltaCount > 0)
        || t003.propertySetLikeKeyDelta > 0
        || t003.relationLikeKeyDelta > 0;
    const stable = defaultStability.spatialTreeSignatureEqual
        && defaultStability.sameLocalIdRatio === 1
        && defaultStability.guidCountEqual;

    return {
        t003: improved
            ? "完整属性转换比默认转换保留了更多 BIM 语义数据，建议继续评估体积和转换耗时是否可接受。"
            : "本次样本中完整属性转换相对默认转换没有明显增加可读属性，需要换模型或检查 IFC 本身属性质量。",
        t004: stable
            ? "同一 IFC 在相同转换参数下 GlobalId/localId/空间树表现稳定，可继续用 GlobalId 做业务主键、localId 做前端交互 ID。"
            : "重复转换存在 ID 或空间树差异，业务主键必须优先依赖 IFC GlobalId，localId 只能作为当前模型版本内交互 ID。"
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || !args.input) {
        usage();
        process.exit(args.help ? 0 : 1);
    }

    const inputPath = path.resolve(args.input);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input IFC not found: ${inputPath}`);
    }

    const inputStats = fs.statSync(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(projectRoot, "output", "validation", `${baseName}-${timestamp}`);
    await mkdir(outputDir, {recursive: true});

    log("T003/T004 validation start", {
        inputPath,
        inputSizeMB: mb(inputStats.size),
        outputDir,
        sampleSize: args.sampleSize,
        raw: args.raw,
        bytesMode: args.bytesMode,
        fullStability: args.fullStability
    });

    const conversionPlans = [
        {label: "default-a", fullProperties: false},
        {label: "default-b", fullProperties: false},
        {label: "full-a", fullProperties: true}
    ];
    if (args.fullStability) {
        conversionPlans.push({label: "full-b", fullProperties: true});
    }

    const conversions = [];
    for (const plan of conversionPlans) {
        const outputPath = path.join(outputDir, `${baseName}.${plan.label}${args.raw ? ".raw" : ""}.frag`);
        conversions.push(await convertOne({
            inputPath,
            outputPath,
            raw: args.raw,
            bytesMode: args.bytesMode,
            fullProperties: plan.fullProperties,
            label: plan.label
        }));
    }

    const inspections = {};
    for (const conversion of conversions) {
        log("Inspect start", {label: conversion.label});
        inspections[conversion.label] = await inspectModel(conversion.path, conversion.label, args);
        log("Inspect done", {
            label: conversion.label,
            localIds: inspections[conversion.label].localIdCount,
            guids: inspections[conversion.label].guidCount,
            seconds: inspections[conversion.label].inspectSeconds
        });
    }

    const t003 = compareT003(inspections["default-a"], inspections["full-a"]);
    const defaultStability = compareStability(inspections["default-a"], inspections["default-b"]);
    const fullStability = args.fullStability
        ? compareStability(inspections["full-a"], inspections["full-b"])
        : null;

    const report = {
        generatedAt: new Date().toISOString(),
        input: {
            path: inputPath,
            sizeMB: mb(inputStats.size)
        },
        options: {
            sampleSize: args.sampleSize,
            raw: args.raw,
            bytesMode: args.bytesMode,
            fullStability: args.fullStability,
            wasmPath
        },
        outputDir,
        conversions,
        inspections,
        t003,
        t004: {
            defaultStability,
            fullStability
        },
        conclusion: makeConclusion(t003, defaultStability)
    };

    const reportPaths = await writeReports(outputDir, report);
    log("T003/T004 validation done", reportPaths);
    console.log("");
    console.log(`Report MD: ${reportPaths.mdPath}`);
    console.log(`Report JSON: ${reportPaths.jsonPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
