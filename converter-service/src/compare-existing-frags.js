import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {SingleThreadedFragmentsModel} from "@thatopen/fragments";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function usage() {
    console.log(`Usage:
  node src/compare-existing-frags.js --default-a=<file.frag> --default-b=<file.frag> [--full-a=<file.frag>] [--full-b=<file.frag>] [--sample-size=300] [--raw]

Examples:
  node src/compare-existing-frags.js --default-a=output/baseline/a.frag --default-b=output/baseline/b.frag --sample-size=500

What it validates:
  T004: compares two existing default .frag files for GlobalId/localId/tree stability.
  T003: if --full-a is provided, compares existing default-a vs full-a property completeness.
`);
}

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

function parseArgs(argv) {
    const options = {
        sampleSize: 300,
        raw: false
    };

    for (const arg of argv) {
        if (arg === "--help" || arg === "-h") {
            options.help = true;
        } else if (arg === "--raw") {
            options.raw = true;
        } else if (arg.startsWith("--sample-size=")) {
            options.sampleSize = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--default-a=")) {
            options.defaultA = arg.split("=").slice(1).join("=");
        } else if (arg.startsWith("--default-b=")) {
            options.defaultB = arg.split("=").slice(1).join("=");
        } else if (arg.startsWith("--full-a=")) {
            options.fullA = arg.split("=").slice(1).join("=");
        } else if (arg.startsWith("--full-b=")) {
            options.fullB = arg.split("=").slice(1).join("=");
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }

    if (!Number.isFinite(options.sampleSize) || options.sampleSize < 1) {
        throw new Error("--sample-size must be a positive number.");
    }

    return options;
}

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function seconds(started) {
    return Number(((performance.now() - started) / 1000).toFixed(2));
}

function log(message, data) {
    const line = data === undefined ? message : `${message} ${JSON.stringify(data)}`;
    console.log(`[${new Date().toISOString()}] ${line}`);
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
        const guidPairs = getGuidPairs(model, localIds);
        const sampleLocalIds = options.inspectProperties
            ? pickSampleLocalIds(localIds, geometryLocalIds, spatialTree, options.sampleSize)
            : [];
        const propertyMetrics = options.inspectProperties
            ? inspectProperties(model, sampleLocalIds, guidPairs)
            : emptyPropertyMetrics();
        const materialSummary = options.inspectProperties
            ? await inspectMaterials(model)
            : {materialCount: null};

        return {
            label,
            path: fragPath,
            fileSizeMB: mb(fs.statSync(fragPath).size),
            inspectSeconds: seconds(started),
            localIdCount: localIds.length,
            geometryLocalIdCount: geometryLocalIds.length,
            categoryCount: categories.length,
            categories: categories.slice(0, 80),
            guidCount: guidPairs.filter((pair) => pair.guid).length,
            spatialTreeSignature: hashObject(treeSignature(spatialTree)),
            spatialTreeNodeCount: countTreeNodes(spatialTree),
            sampleLocalIds,
            fieldCoverage: propertyMetrics.fieldCoverage,
            propertySetLikeKeyCount: propertyMetrics.propertySetLikeKeyCount,
            relationLikeKeyCount: propertyMetrics.relationLikeKeyCount,
            sampleItems: propertyMetrics.sampleItems,
            materialSummary,
            guidPairs
        };
    } finally {
        model.dispose();
    }
}

function emptyPropertyMetrics() {
    return {
        fieldCoverage: Object.fromEntries(
            IMPORTANT_FIELDS.map(([field]) => [field, {count: 0, ratio: 0}])
        ),
        propertySetLikeKeyCount: 0,
        relationLikeKeyCount: 0,
        sampleItems: []
    };
}

function safeCall(fn, fallback) {
    try {
        return fn();
    } catch {
        return fallback;
    }
}

async function safeAsync(fn, fallback) {
    try {
        return await fn();
    } catch {
        return fallback;
    }
}

function getGuidPairs(model, localIds) {
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

function makeConclusion(report) {
    const defaultStability = report.t004.defaultStability;
    const stable = defaultStability.spatialTreeSignatureEqual
        && defaultStability.sameLocalIdRatio === 1
        && defaultStability.guidCountEqual;
    const conclusion = {
        t004: stable
            ? "默认转换重复产物的 GlobalId/localId/空间树表现稳定。"
            : "默认转换重复产物存在 ID 或空间树差异，业务主键必须优先依赖 IFC GlobalId。"
    };

    if (report.t003) {
        const meaningfulFields = ["Name", "Description", "ObjectType", "PredefinedType"];
        const improved = meaningfulFields.some((field) => report.t003.fieldDiffs[field].deltaCount > 0)
            || report.t003.propertySetLikeKeyDelta > 0
            || report.t003.relationLikeKeyDelta > 0;
        conclusion.t003 = improved
            ? "完整属性转换比默认转换保留了更多 BIM 语义数据。"
            : "本次样本中完整属性转换相对默认转换没有明显增加可读属性。";
    } else {
        conclusion.t003 = "未提供 full-a.frag，本次未执行 T003 默认/完整属性对比。";
    }

    return conclusion;
}

async function writeReports(outputDir, report) {
    const jsonPath = path.join(outputDir, "existing-frag-compare-report.json");
    const mdPath = path.join(outputDir, "existing-frag-compare-report.md");
    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
    await writeFile(mdPath, renderMarkdown(report), "utf8");
    return {jsonPath, mdPath};
}

function renderMarkdown(report) {
    const lines = [];
    lines.push("# Existing Fragments 对比报告");
    lines.push("");
    lines.push(`生成时间：${report.generatedAt}`);
    lines.push("");
    lines.push("## 输入文件");
    lines.push("");
    for (const item of report.files) {
        lines.push(`- ${item.label}: \`${item.path}\` (${item.sizeMB} MB)`);
    }
    lines.push("");
    lines.push("## 模型检查摘要");
    lines.push("");
    lines.push("| 文件 | localId | GUID | 几何 localId | 空间树节点 | 检查耗时(s) |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const item of Object.values(report.inspections)) {
        lines.push(`| ${item.label} | ${item.localIdCount} | ${item.guidCount} | ${item.geometryLocalIdCount} | ${item.spatialTreeNodeCount} | ${item.inspectSeconds} |`);
    }
    lines.push("");
    lines.push("## T004 默认转换稳定性");
    lines.push("");
    appendStability(lines, report.t004.defaultStability);
    if (report.t004.fullStability) {
        lines.push("");
        lines.push("## T004 完整属性转换稳定性");
        lines.push("");
        appendStability(lines, report.t004.fullStability);
    }
    if (report.t003) {
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
    }
    lines.push("");
    lines.push("## 初步结论");
    lines.push("");
    lines.push(`- T004：${report.conclusion.t004}`);
    lines.push(`- T003：${report.conclusion.t003}`);
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

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        usage();
        process.exit(0);
    }
    if (!options.defaultA || !options.defaultB) {
        usage();
        process.exit(1);
    }
    options.inspectProperties = !!options.fullA;

    const inputFiles = [
        ["default-a", options.defaultA],
        ["default-b", options.defaultB],
        options.fullA ? ["full-a", options.fullA] : null,
        options.fullB ? ["full-b", options.fullB] : null
    ].filter(Boolean).map(([label, file]) => {
        const resolved = path.resolve(file);
        if (!fs.existsSync(resolved)) {
            throw new Error(`File not found: ${resolved}`);
        }
        return {
            label,
            path: resolved,
            sizeMB: mb(fs.statSync(resolved).size)
        };
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(projectRoot, "output", "validation", `existing-frags-${timestamp}`);
    await mkdir(outputDir, {recursive: true});

    log("Existing .frag comparison start", {
        files: inputFiles,
        sampleSize: options.sampleSize,
        inspectProperties: options.inspectProperties,
        outputDir
    });

    const inspections = {};
    for (const file of inputFiles) {
        log("Inspect start", {label: file.label, path: file.path});
        inspections[file.label] = await inspectModel(file.path, file.label, options);
        log("Inspect done", {
            label: file.label,
            localIds: inspections[file.label].localIdCount,
            guids: inspections[file.label].guidCount,
            seconds: inspections[file.label].inspectSeconds
        });
    }

    const report = {
        generatedAt: new Date().toISOString(),
        options: {
            sampleSize: options.sampleSize,
            raw: options.raw
        },
        outputDir,
        files: inputFiles,
        inspections,
        t004: {
            defaultStability: compareStability(inspections["default-a"], inspections["default-b"]),
            fullStability: inspections["full-a"] && inspections["full-b"]
                ? compareStability(inspections["full-a"], inspections["full-b"])
                : null
        },
        t003: inspections["full-a"] ? compareT003(inspections["default-a"], inspections["full-a"]) : null
    };
    report.conclusion = makeConclusion(report);

    const reportPaths = await writeReports(outputDir, report);
    log("Existing .frag comparison done", reportPaths);
    console.log("");
    console.log(`Report MD: ${reportPaths.mdPath}`);
    console.log(`Report JSON: ${reportPaths.jsonPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
