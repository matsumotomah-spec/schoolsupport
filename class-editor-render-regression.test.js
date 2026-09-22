"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-settings-classes.js"),"utf8");
assert.doesNotMatch(source,/cardifyClassEditor/);
assert.doesNotMatch(source,/form\.dataset\.cardified/);
console.log("class-editor-render-regression: passed");
