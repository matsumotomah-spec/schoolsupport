"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const s=fs.readFileSync(path.join(__dirname,"..","app-settings-classes.js"),"utf8");
assert.doesNotMatch(s,/cardifyClassEditor/);
assert.match(s,/id=\"class-form\"/);
assert.match(s,/class-support/);
console.log("class-editor-structure: passed");
