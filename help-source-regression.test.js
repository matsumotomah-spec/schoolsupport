"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const help=fs.readFileSync(path.join(__dirname,"..","app-help.js"),"utf8");
assert.doesNotMatch(help,/function normalizeHelpText/);
assert.doesNotMatch(help,/function normalizeVisibleTerms/);
assert.match(help,/提出 → 忘れた → 欠席 → 未提出/);
console.log("help-source-regression: passed");
