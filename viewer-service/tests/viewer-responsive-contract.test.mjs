import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const viewerDir = path.resolve(testDir, "../viewer");
const css = fs.readFileSync(path.join(viewerDir, "styles/07-responsive-overlays.css"), "utf8");

test("responsive CSS defines standard, compact and single-column viewer ranges", () => {
    assert.match(css, /min-width:\s*1021px[^}]*max-width:\s*1280px/);
    assert.match(css, /@media\s*\(max-width:\s*1020px\)/);
    assert.match(css, /@media\s*\(max-width:\s*760px\)/);
    assert.match(css, /@media\s*\(max-width:\s*520px\)/);
    assert.match(css, /\.twoColumnApp\s*>\s*\.viewport\s*\{[^}]*grid-row:\s*3;/s);
    assert.match(css, /\.rightInspectorDock\s*\{[^}]*grid-row:\s*7;/s);
});

test("open viewport panels reserve the interaction surface", () => {
    assert.match(css, /\.viewport:has\(\.viewportPanelRail\.hasOpenPanel\)\s+\.viewportHud/);
    assert.match(css, /\.viewportHud\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
    assert.match(css, /\.viewportToolButtons,[\s\S]*grid-template-columns:\s*repeat\(3,/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
