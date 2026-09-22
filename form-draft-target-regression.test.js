"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-core.js"),"utf8");
assert.match(source,/document\.activeElement\?\.closest\?\.\('form'\)/);
assert.match(source,/state\.drafts\.forms\.has\(formDraftKey\(candidate\)\)/);
console.log("form-draft-target-regression: passed");
