import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(
    path.resolve(testDir, "../viewer/styles/08-left-sidebar.css"),
    "utf8"
);

test("left sidebar keeps model status and manager controls inside stable grids", () => {
    assert.match(css, /\.modelSummary \.stats\s*\{[^}]*repeat\(4,/s);
    assert.match(css, /\.modelManagerBlock \.blockActions\s*\{[^}]*repeat\(3,/s);
    assert.match(css, /#modelManagerEmpty:not\(\[hidden\]\)\s*\{[^}]*grid-row:\s*3;/s);
});

test("model tree owns one explicit column and four ordered rows", () => {
    assert.match(css, /\.treeBlock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    assert.match(css, /\.treeBlock\s*>\s*\.treeTabs\s*\{[^}]*grid-row:\s*2;/s);
    assert.match(css, /\.treeBlock\s*>\s*\.treeSearchPanel\s*\{[^}]*grid-row:\s*3;/s);
    assert.match(css, /\.treeBlock\s*>\s*#treeSearchResults,[\s\S]*grid-row:\s*4;/);
});
