"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-data-import.js"),"utf8");
assert.match(source,/sourceKey=importHash\(`\$\{selectedClass\(\)\.id\}\|\$\{actualType\}\|\$\{JSON\.stringify\(rows\)\}`\)/);
console.log("import-history-scope-regression: passed");
