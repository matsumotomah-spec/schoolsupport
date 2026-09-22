"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-grades.js"),"utf8");
assert.match(source,/入力済みの点数は保持されます/);
assert.match(source,/種類を変更しました。入力中の点数は保持しています/);
assert.doesNotMatch(source,/kind\.addEventListener\('change',[\s\S]{0,600}?scores\.clear\(\)/);
console.log("manual-quiz-change-regression: passed");
