"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const core=fs.readFileSync(path.join(root,"app-core.js"),"utf8");
const version=core.match(/APP_VERSION='(\d+)'/)?.[1];
assert.ok(version,"アプリ内バージョンが必要です");

const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const worker=fs.readFileSync(path.join(root,"sw.js"),"utf8");
assert.doesNotMatch(index,new RegExp(`(?:styles|[\\w-]+\\.js)\\?v=(?!${version}\\b)\\d+`));
assert.match(app,new RegExp(`register\\('./sw\\.js\\?v=${version}'`));
assert.match(worker,new RegExp(`CACHE_NAME='class-support-shell-v${version}'`));
assert.doesNotMatch(worker,new RegExp(`\\?v=(?!${version}\\b)\\d+`));

console.log("release-integrity: passed");
