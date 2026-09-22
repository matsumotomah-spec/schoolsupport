"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const app=fs.readFileSync(path.resolve(__dirname,"..","app.js"),"utf8");
assert.doesNotMatch(app,/MutationObserver/);
assert.doesNotMatch(app,/applyFriendlyTerms/);
console.log("help-render-regression: passed");
