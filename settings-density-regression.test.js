"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const css=fs.readFileSync(path.resolve(__dirname,"..","styles.css"),"utf8");
assert.match(css,/@media\(max-width:820px\)\{[^}]*settings-start/s);
assert.match(css,/\.settings-category-card,\.settings-route-card\{min-height:136px/);
assert.match(css,/\.settings-card-grid,\.settings-route-grid\{gap:8px/);
console.log("settings-density-regression: passed");
