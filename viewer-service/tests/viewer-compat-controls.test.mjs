import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const viewerDir = path.resolve(testDir, "../viewer");
const legacySectionControlIds = [
    "completeAreaMeasureBtn",
    "sectionAddPlaneBtn",
    "sectionNextPlaneBtn",
    "sectionBoxBtn",
    "sectionAxisXBtn",
    "sectionAxisYBtn",
    "sectionAxisZBtn",
    "sectionMinusBtn",
    "sectionPlusBtn"
];

test("viewer uses compact section controls without hidden compatibility buttons", () => {
    const html = fs.readFileSync(path.join(viewerDir, "index.html"), "utf8");
    const script = fs.readFileSync(path.join(viewerDir, "main-mvp.js"), "utf8");
    const css = fs.readdirSync(path.join(viewerDir, "styles"))
        .filter((name) => name.endsWith(".css"))
        .map((name) => fs.readFileSync(path.join(viewerDir, "styles", name), "utf8"))
        .join("\n");

    assert.doesNotMatch(html, /compatHidden/);
    assert.doesNotMatch(css, /\.compatHidden\b/);
    for (const id of legacySectionControlIds) {
        assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`));
        assert.doesNotMatch(script, new RegExp(`\\b${id}\\b`));
    }
    for (const id of ["sectionModeSelect", "sectionPlaneSelect", "sectionOffsetInput"]) {
        assert.match(html, new RegExp(`id=["']${id}["']`));
        assert.match(script, new RegExp(`\\b${id}\\b`));
    }
});
