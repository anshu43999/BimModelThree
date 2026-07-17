import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {mkdir, readFile} from "node:fs/promises";
import {convertIfcToFragments, writeConversionFailureReport} from "./convert-ifc-to-fragments.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, "..");
const defaultOutputRoot = path.join(serviceRoot, "output", "tasks");
const taskStatuses = new Set([
    "uploaded",
    "queued",
    "converting",
    "converted",
    "failed",
    "cancelled"
]);

function now() {
    return new Date().toISOString();
}

function sanitizeName(value) {
    return String(value || "model")
        .replace(/\.[^.]+$/g, "")
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase() || "model";
}

function createTaskId() {
    return `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeBool(value) {
    return value === true || value === "true" || value === 1 || value === "1";
}

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

export class ConversionTaskService {
    constructor(options = {}) {
        this.outputRoot = path.resolve(options.outputRoot || defaultOutputRoot);
        this.tasks = new Map();
        this.activeTaskId = null;
    }

    createTask(payload = {}) {
        const inputPath = path.resolve(payload.inputPath || payload.input || "");
        if (!inputPath || !fs.existsSync(inputPath)) {
            throw new Error(`Input IFC not found: ${inputPath}`);
        }

        const inputStats = fs.statSync(inputPath);
        if (!inputStats.isFile()) {
            throw new Error(`Input IFC is not a file: ${inputPath}`);
        }

        const taskId = payload.taskId || createTaskId();
        const modelName = sanitizeName(payload.modelName || path.basename(inputPath));
        const taskOutputDir = path.join(this.outputRoot, taskId);
        const outputPath = path.resolve(payload.outputPath || path.join(taskOutputDir, `${modelName}.frag`));
        const task = {
            taskId,
            status: "uploaded",
            inputPath,
            outputPath,
            manifestPath: path.join(path.dirname(outputPath), "manifest.json"),
            reportPath: path.join(path.dirname(outputPath), "conversion-report.json"),
            options: {
                raw: normalizeBool(payload.raw),
                bytesMode: normalizeBool(payload.bytesMode),
                fullProperties: normalizeBool(payload.fullProperties)
            },
            createdAt: now(),
            startedAt: null,
            finishedAt: null,
            error: null,
            result: null,
            history: [{
                status: "uploaded",
                at: now()
            }]
        };

        this.tasks.set(taskId, task);
        this.transitionTask(task, "queued");
        this.scheduleNext();
        return this.getTask(taskId);
    }

    getTask(taskId) {
        const task = this.tasks.get(taskId);
        return task ? this.serializeTask(task) : null;
    }

    listTasks() {
        return [...this.tasks.values()].map((task) => this.serializeTask(task));
    }

    getTaskByModelVersionId(modelVersionId) {
        const task = [...this.tasks.values()].find((item) => {
            return item.result?.modelVersionId === modelVersionId;
        });
        return task ? this.serializeTask(task) : null;
    }

    async getManifest(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || !task.manifestPath || !fs.existsSync(task.manifestPath)) {
            return null;
        }
        return JSON.parse(await readFile(task.manifestPath, "utf8"));
    }

    async getManifestByModelVersionId(modelVersionId) {
        const task = [...this.tasks.values()].find((item) => {
            return item.result?.modelVersionId === modelVersionId;
        });
        if (!task) {
            return null;
        }
        return this.getManifest(task.taskId);
    }

    async getReport(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || !task.reportPath || !fs.existsSync(task.reportPath)) {
            return null;
        }
        return JSON.parse(await readFile(task.reportPath, "utf8"));
    }

    async getReportByModelVersionId(modelVersionId) {
        const task = [...this.tasks.values()].find((item) => {
            return item.result?.modelVersionId === modelVersionId;
        });
        if (!task) {
            return null;
        }
        return this.getReport(task.taskId);
    }

    cancelTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return null;
        }
        if (task.status === "queued" || task.status === "uploaded") {
            this.transitionTask(task, "cancelled");
            task.finishedAt = now();
        }
        return this.getTask(taskId);
    }

    transitionTask(task, status) {
        if (!taskStatuses.has(status)) {
            throw new Error(`Unsupported conversion task status: ${status}`);
        }
        task.status = status;
        task.history.push({
            status,
            at: now()
        });
    }

    scheduleNext() {
        if (this.activeTaskId) {
            return;
        }
        const nextTask = [...this.tasks.values()].find((task) => task.status === "queued");
        if (!nextTask) {
            return;
        }
        setImmediate(() => {
            this.runTask(nextTask.taskId).catch(() => {});
        });
    }

    async runTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || task.status !== "queued" || this.activeTaskId) {
            return;
        }

        this.activeTaskId = taskId;

        this.transitionTask(task, "converting");
        task.startedAt = now();
        await mkdir(path.dirname(task.outputPath), {recursive: true});

        try {
            const result = await convertIfcToFragments({
                input: task.inputPath,
                output: task.outputPath,
                ...task.options
            });
            task.manifestPath = result.manifestPath;
            task.reportPath = result.reportPath;
            task.result = {
                outputPath: result.outputPath,
                manifestPath: result.manifestPath,
                reportPath: result.reportPath,
                modelId: result.manifest?.modelId || null,
                modelVersionId: result.manifest?.modelVersionId || null
            };
            this.transitionTask(task, "converted");
            task.finishedAt = now();
        } catch (error) {
            this.transitionTask(task, "failed");
            task.finishedAt = now();
            task.error = serializeError(error);
            const failureResult = await writeConversionFailureReport(error, {
                input: task.inputPath,
                output: task.outputPath,
                ...task.options
            });
            if (failureResult) {
                task.reportPath = failureResult.reportPath;
                task.result = {
                    outputPath: failureResult.outputPath,
                    manifestPath: null,
                    reportPath: failureResult.reportPath,
                    modelId: null,
                    modelVersionId: null
                };
            }
        } finally {
            this.activeTaskId = null;
            this.scheduleNext();
        }
    }

    serializeTask(task) {
        return {
            taskId: task.taskId,
            status: task.status,
            inputPath: task.inputPath,
            outputPath: task.outputPath,
            manifestPath: task.manifestPath,
            reportPath: task.reportPath,
            options: {...task.options},
            createdAt: task.createdAt,
            startedAt: task.startedAt,
            finishedAt: task.finishedAt,
            error: task.error,
            result: task.result,
            history: [...task.history]
        };
    }
}
