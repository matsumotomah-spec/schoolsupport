"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","sw.js"),"utf8");
assert.match(source,/key\.startsWith\('class-support-shell-'\)&&key!==CACHE_NAME/);
assert.doesNotMatch(source,/filter\(key=>key!==CACHE_NAME\)\.map\(key=>caches\.delete\(key\)\)/);
console.log("service-worker-cache-regression: passed");
