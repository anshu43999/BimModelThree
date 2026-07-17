import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { SingleThreadedFragmentsModel } from "@thatopen/fragments";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function isNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
}

function uniqueNumbers(arr) {
    return [...new Set((arr || []).filter(isNumber))];
}

function collectTreeLocalIds(item) {
    const ids = new Set();
    const stack = item ? [item] : [];
    while (stack.length) {
        const cur = stack.pop();
        if (!cur || typeof cur !== "object") continue;
        if (isNumber(cur.localId)) ids.add(cur.localId);
        if (Array.isArray(cur.children)) {
            for (let i = cur.children.length - 1; i >= 0; i--) {
                stack.push(cur.children[i]);
            }
        }
    }
    return [...ids];
}

function serializeSpatialStructure(node, depth = 0, maxDepth = 20) {
    if (!node || depth > maxDepth) return null;
    return {
        category: node.category || null,
        localId: isNumber(node.localId) ? node.localId : null,
        children: Array.isArray(node.children)
            ? node.children.slice(0, 200).map(c => serializeSpatialStructure(c, depth + 1, maxDepth)).filter(Boolean)
            : []
    };
}

function extractStoreys(root) {
    const storeys = [];
    const stack = root ? [root] : [];
    while (stack.length) {
        const cur = stack.pop();
        const cat = String(cur?.category || "").toUpperCase();
        if (cat === "IFCBUILDINGSTOREY" || cat.includes("STOREY")) {
            storeys.push({
                category: cur.category,
                localId: isNumber(cur.localId) ? cur.localId : null,
                containedLocalIds: collectTreeLocalIds(cur)
            });
            continue;
        }
        if (Array.isArray(cur?.children)) {
            for (let i = cur.children.length - 1; i >= 0; i--) {
                stack.push(cur.children[i]);
            }
        }
    }
    return storeys;
}

function countDepthDistribution(root) {
    const dist = {};
    function walk(node, depth) {
        if (!node) return;
        dist[depth] = (dist[depth] || 0) + 1;
        if (Array.isArray(node.children)) {
            for (const child of node.children) {
                walk(child, depth + 1);
            }
        }
    }
    walk(root, 0);
    return dist;
}

function collectCategoriesFromTree(root) {
    const categories = new Set();
    const stack = root ? [root] : [];
    while (stack.length) {
        const cur = stack.pop();
        if (cur?.category) categories.add(cur.category);
        if (Array.isArray(cur?.children)) {
            for (let i = cur.children.length - 1; i >= 0; i--) {
                stack.push(cur.children[i]);
            }
        }
    }
    return [...categories].sort();
}

function mb(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(2));
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCategoryMapIds(categoryMap, category) {
    if (!categoryMap) return [];
    if (categoryMap instanceof Map) {
        return uniqueNumbers(
            categoryMap.get(category) ||
            categoryMap.get(String(category).toLowerCase()) ||
            categoryMap.get(String(category).toUpperCase())
        );
    }
    if (typeof categoryMap === "object") {
        for (const [key, value] of Object.entries(categoryMap)) {
            if (String(key).toLowerCase() === String(category).toLowerCase()) {
                return uniqueNumbers(value);
            }
        }
    }
    return [];
}

async function analyzeFrag(inputPath, outputPath) {
    console.log(`\n=== FRAG Analysis: ${path.basename(inputPath)} ===\n`);

    console.log("1. Reading .frag file...");
    const buffer = fs.readFileSync(inputPath);
    console.log(`   File size: ${mb(buffer.byteLength)} MB`);

    console.log("2. Loading via SingleThreadedFragmentsModel...");
    const modelId = path.basename(inputPath, ".frag");
    const loadStart = performance.now();
    const model = new SingleThreadedFragmentsModel(modelId, buffer);
    const loadSeconds = Number(((performance.now() - loadStart) / 1000).toFixed(2));
    console.log(`   Loaded in ${loadSeconds}s`);

    try {
        console.log("3. Extracting spatial structure...");
        const spatialRaw = model.getSpatialStructure();
        const spatialStructure = serializeSpatialStructure(spatialRaw);
        const treeDepthDist = countDepthDistribution(spatialRaw);
        const treeCategories = collectCategoriesFromTree(spatialRaw);
        const storeys = extractStoreys(spatialRaw);
        const treeTotalIds = collectTreeLocalIds(spatialRaw);
        console.log(`   Root category: ${spatialRaw?.category || "(none)"}`);
        console.log(`   Tree node depth distribution: ${JSON.stringify(treeDepthDist)}`);
        console.log(`   Storeys found: ${storeys.length}`);
        console.log(`   Unique categories in tree: ${treeCategories.length}`);
        console.log(`   Total localIds in tree: ${treeTotalIds.length}`);

        console.log("4. Extracting model-level categories...");
        const categories = [...(model.getCategories() || [])].filter(Boolean).sort();
        console.log(`   Model categories: ${categories.length}`);

        console.log("5. Getting all local IDs...");
        let localIds = [];
        try {
            localIds = uniqueNumbers(await model.getLocalIds());
        } catch (e) {
            console.log(`   getLocalIds() failed: ${e.message}, falling back to tree extraction`);
            localIds = treeTotalIds;
        }
        console.log(`   Total local IDs: ${localIds.length}`);

        console.log("6. Getting items with geometry...");
        let geometryIds = [];
        try {
            geometryIds = uniqueNumbers(model.getItemsWithGeometry());
        } catch (e) {
            console.log(`   getItemsWithGeometry() failed: ${e.message}`);
        }
        console.log(`   Items with geometry: ${geometryIds.length}`);

        console.log("7. Getting category distribution...");
        const catPatterns = categories.map(c => new RegExp(`^${escapeRegExp(c)}$`));
        let categoryMap = null;
        try {
            categoryMap = model.getItemsOfCategories(catPatterns);
        } catch (e) {
            console.log(`   getItemsOfCategories() failed: ${e.message}`);
        }

        const categoryDistribution = {};
        for (const cat of categories) {
            const ids = getCategoryMapIds(categoryMap, cat);
            if (ids.length) {
                categoryDistribution[cat] = {
                    count: ids.length,
                    sampleIds: ids.slice(0, 10)
                };
            }
        }
        console.log(`   Non-empty categories: ${Object.keys(categoryDistribution).length}`);

        console.log("8. Sampling GUID mappings...");
        const guidSampleIds = localIds.slice(0, 100);
        let guidMappingSamples = [];
        try {
            const guids = model.getGuidsByLocalIds(guidSampleIds);
            if (Array.isArray(guids)) {
                for (let i = 0; i < guidSampleIds.length; i++) {
                    if (guids[i]) {
                        guidMappingSamples.push({ localId: guidSampleIds[i], globalId: String(guids[i]) });
                    }
                }
            }
        } catch (e) {
            console.log(`   getGuidsByLocalIds() failed: ${e.message}`);
        }
        console.log(`   GUIDs resolved (sample of 100): ${guidMappingSamples.length}`);

        console.log("9. Extracting sample item attributes...");
        const dataSampleIds = localIds.slice(0, 20);
        let sampleItemsData = [];
        try {
            const raw = model.getItemsData(dataSampleIds);
            if (Array.isArray(raw)) {
                sampleItemsData = raw.slice(0, 5).map(item => {
                    const flat = {};
                    if (item && typeof item === "object") {
                        for (const [k, v] of Object.entries(item)) {
                            if (v && typeof v === "object" && "value" in v) {
                                flat[k] = String(v.value);
                            } else if (v !== null && v !== undefined) {
                                flat[k] = typeof v === "object" ? "(object)" : String(v);
                            }
                        }
                    }
                    return flat;
                });
            }
        } catch (e) {
            console.log(`   getItemsData() failed: ${e.message}`);
        }

        console.log("10. Analyzing top-level structure...");
        const topLevel = spatialRaw?.children || [];
        const topLevelSummary = topLevel.slice(0, 100).map(c => ({
            category: c?.category || null,
            localId: isNumber(c?.localId) ? c.localId : null,
            childCount: Array.isArray(c?.children) ? c.children.length : 0
        }));

        const modelOnlyCategories = categories.filter(c => !treeCategories.includes(c));
        const treeOnlyCategories = treeCategories.filter(c => !categories.includes(c));

        const storeyDetails = storeys.map(s => ({
            category: s.category,
            localId: s.localId,
            containedCount: s.containedLocalIds.length,
            sampleContainedIds: s.containedLocalIds.slice(0, 10)
        }));

        const analysis = {
            meta: {
                sourceFile: inputPath,
                sourceFileSizeMB: mb(buffer.byteLength),
                modelId,
                analyzedAt: new Date().toISOString(),
                loadSeconds
            },
            summary: {
                totalLocalIds: localIds.length,
                totalItemsWithGeometry: geometryIds.length,
                geometryCoveragePercent: localIds.length
                    ? Number(((geometryIds.length / localIds.length) * 100).toFixed(1))
                    : 0,
                totalCategories: categories.length,
                treeNodeDepthDistribution: treeDepthDist,
                treeMaxDepth: Math.max(...Object.keys(treeDepthDist).map(Number), 0),
                storeyCount: storeys.length,
                treeLocalIdCount: treeTotalIds.length,
                idsInTreeButNotInList: treeTotalIds.filter(id => !localIds.includes(id)).length,
                idsInListButNotInTree: localIds.filter(id => !treeTotalIds.includes(id)).length,
                idsMatch: treeTotalIds.length === localIds.length &&
                    treeTotalIds.every(id => localIds.includes(id))
            },
            spatialStructure: {
                root: spatialStructure,
                topLevelChildren: topLevelSummary,
                storeys: storeyDetails,
                categoryDiscrepancy: {
                    inModelButNotInTree: modelOnlyCategories,
                    inTreeButNotInModel: treeOnlyCategories
                }
            },
            categoryDistribution,
            guidSample: guidMappingSamples,
            itemDataSample: sampleItemsData,
            allModelCategories: categories,
            allTreeCategories: treeCategories
        };

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, JSON.stringify(analysis, null, 2));
        console.log(`\nAnalysis written to: ${outputPath}`);
        console.log(`\n=== Summary ===`);
        console.log(JSON.stringify(analysis.summary, null, 2));

        return analysis;
    } finally {
        model.dispose();
    }
}

const inputPath = process.argv[2] || path.join(projectRoot, "output", "西单商场_AS.frag");
const outputPath = process.argv[3] || path.join(projectRoot, "output", "frag-analysis.json");

if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
}

analyzeFrag(inputPath, outputPath)
    .then(() => {
        console.log("\nDone.");
        process.exit(0);
    })
    .catch(err => {
        console.error("Analysis failed:", err);
        process.exit(1);
    });
