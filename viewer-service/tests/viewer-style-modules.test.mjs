import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const viewerDir = path.resolve(testDir, "../viewer");
const modulePaths = [
    "styles/01-foundation.css",
    "styles/02-viewer-core.css",
    "styles/03-workspace-drawers.css",
    "styles/04-feature-panels.css",
    "styles/05-layout.css",
    "styles/06-right-inspector.css",
    "styles/07-responsive-overlays.css",
    "styles/08-left-sidebar.css"
];

test("viewer page loads CSS modules in the documented cascade order", () => {
    const html = fs.readFileSync(path.join(viewerDir, "index.html"), "utf8");
    const linkedStyles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/([^"]+)"/g)]
        .map((match) => match[1])
        .filter((href) => href.startsWith("styles/"));

    assert.deepEqual(linkedStyles, modulePaths);
    for (const modulePath of modulePaths) {
        const css = fs.readFileSync(path.join(viewerDir, modulePath), "utf8");
        assert.ok(css.trim().length > 0, `${modulePath} must not be empty`);
    }
});

test("legacy style.css aggregates the same ordered modules", () => {
    const aggregator = fs.readFileSync(path.join(viewerDir, "style.css"), "utf8");
    const imports = [...aggregator.matchAll(/@import\s+url\("\.\/([^"\)]+)"\);/g)]
        .map((match) => match[1]);

    assert.deepEqual(imports, modulePaths);
    assert.equal(aggregator.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]+;/g, "").trim(), "");
});
