import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {ConversionTaskService} from "../src/conversion-task-service.js";
import {ALLOWED_TYPES, createBusinessDataStore} from "../src/business-data-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5180);
const host = process.env.HOST || "127.0.0.1";
const taskService = new ConversionTaskService({
    outputRoot: process.env.CONVERTER_OUTPUT_ROOT || path.join(serviceRoot, "output", "tasks")
});
const businessDataStore = createBusinessDataStore({
    backend: process.env.BUSINESS_DATA_BACKEND || "json-file",
    root: process.env.BUSINESS_DATA_ROOT || path.join(serviceRoot, "output", "business-data")
});

const mimeTypes = {
    ".json": "application/json; charset=utf-8",
    ".frag": "application/octet-stream",
    ".ifc": "application/octet-stream"
};

function sendJson(response, statusCode, body) {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    });
    response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendError(response, statusCode, message) {
    sendJson(response, statusCode, {
        error: {
            message
        }
    });
}

async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(chunk);
    }
    if (!chunks.length) {
        return {};
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendFile(response, filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        sendError(response, 404, "File not found.");
        return;
    }
    const resolved = path.resolve(filePath);
    const allowedRoot = path.resolve(taskService.outputRoot);
    if (!resolved.startsWith(`${allowedRoot}${path.sep}`) && resolved !== allowedRoot) {
        sendError(response, 403, "File is outside converter output root.");
        return;
    }
    const ext = path.extname(resolved).toLowerCase();
    response.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(resolved).pipe(response);
}

function queryFilter(url) {
    const filter = {};
    const supported = ["tenantId", "projectId", "modelId", "versionId", "globalId", "status", "createdBy", "localId"];
    for (const key of supported) {
        const value = url.searchParams.get(key);
        if (value !== null && value !== "") {
            filter[key] = value;
        }
    }
    return filter;
}

function parseBusinessDataPath(pathname) {
    const match = pathname.match(/^\/api\/business-data\/([^/]+)(?:\/([^/]+))?$/);
    if (!match) {
        return null;
    }
    return {
        type: match[1],
        id: match[2] || null
    };
}

export async function route(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (request.method === "OPTIONS") {
        sendJson(response, 204, {});
        return;
    }

    if (request.method === "GET" && pathname === "/health") {
        sendJson(response, 200, {
            status: "ok",
            service: "converter-service",
            businessDataTypes: [...ALLOWED_TYPES],
            businessDataStore: businessDataStore.info()
        });
        return;
    }

    if (request.method === "GET" && pathname === "/api/business-data") {
        sendJson(response, 200, {
            businessDataStore: businessDataStore.info()
        });
        return;
    }

    const businessDataPath = parseBusinessDataPath(pathname);
    if (businessDataPath) {
        const {type, id} = businessDataPath;
        if (!ALLOWED_TYPES.has(type)) {
            sendError(response, 400, `Unsupported business data type: ${type}`);
            return;
        }
        if (request.method === "GET" && !id) {
            const items = businessDataStore.list(type, queryFilter(url));
            sendJson(response, 200, {
                type,
                count: items.length,
                items
            });
            return;
        }
        if (request.method === "POST" && !id) {
            const payload = await readJsonBody(request);
            const item = businessDataStore.create(type, payload);
            sendJson(response, 201, {item});
            return;
        }
        if (request.method === "GET" && id) {
            const item = businessDataStore.get(type, id);
            if (!item) {
                sendError(response, 404, "Business data item not found.");
                return;
            }
            sendJson(response, 200, {item});
            return;
        }
        if (request.method === "PUT" && id) {
            const payload = await readJsonBody(request);
            const item = businessDataStore.update(type, id, payload);
            if (!item) {
                sendError(response, 404, "Business data item not found.");
                return;
            }
            sendJson(response, 200, {item});
            return;
        }
        if (request.method === "DELETE" && id) {
            const removed = businessDataStore.remove(type, id);
            sendJson(response, removed ? 200 : 404, {
                id,
                removed
            });
            return;
        }
        sendError(response, 405, "Method not allowed for business data endpoint.");
        return;
    }

    if (request.method === "GET" && pathname === "/api/conversions") {
        sendJson(response, 200, {
            tasks: taskService.listTasks()
        });
        return;
    }

    if (request.method === "POST" && pathname === "/api/conversions") {
        const payload = await readJsonBody(request);
        const task = taskService.createTask(payload);
        sendJson(response, 202, {task});
        return;
    }

    const taskMatch = pathname.match(/^\/api\/conversions\/([^/]+)(?:\/([^/]+))?$/);
    if (taskMatch && request.method === "GET") {
        const [, taskId, action] = taskMatch;
        const task = taskService.getTask(taskId);
        if (!task) {
            sendError(response, 404, "Conversion task not found.");
            return;
        }
        if (!action) {
            sendJson(response, 200, {task});
            return;
        }
        if (action === "manifest") {
            const manifest = await taskService.getManifest(taskId);
            if (!manifest) {
                sendError(response, 404, "Manifest is not ready.");
                return;
            }
            sendJson(response, 200, {manifest});
            return;
        }
        if (action === "report") {
            const report = await taskService.getReport(taskId);
            if (!report) {
                sendError(response, 404, "Conversion report is not ready.");
                return;
            }
            sendJson(response, 200, {report});
            return;
        }
        if (action === "fragments") {
            sendFile(response, task.outputPath);
            return;
        }
    }

    const modelManifestMatch = pathname.match(/^\/api\/models\/([^/]+)\/manifest$/);
    if (modelManifestMatch && request.method === "GET") {
        const [, modelVersionId] = modelManifestMatch;
        const manifest = await taskService.getManifestByModelVersionId(modelVersionId);
        if (!manifest) {
            sendError(response, 404, "Model manifest not found.");
            return;
        }
        sendJson(response, 200, {manifest});
        return;
    }

    const modelReportMatch = pathname.match(/^\/api\/models\/([^/]+)\/report$/);
    if (modelReportMatch && request.method === "GET") {
        const [, modelVersionId] = modelReportMatch;
        const report = await taskService.getReportByModelVersionId(modelVersionId);
        if (!report) {
            sendError(response, 404, "Model conversion report not found.");
            return;
        }
        sendJson(response, 200, {report});
        return;
    }

    sendError(response, 404, "Not found.");
}

export function createApiServer() {
    return http.createServer((request, response) => {
        route(request, response).catch((error) => {
            sendError(response, 500, error.message || String(error));
        });
    });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const server = createApiServer();
    server.listen(port, host, () => {
        console.log(`Converter API: http://${host}:${port}`);
        console.log(`Health check: http://${host}:${port}/health`);
    });
}
