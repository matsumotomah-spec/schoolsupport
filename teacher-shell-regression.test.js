"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-shell.js"),"utf8");
for(const token of ["function teacherToolShell","tools-main","tools-sub","operationTipHtml"])assert.ok(source.includes(token));
console.log("teacher-shell-regression: passed");
