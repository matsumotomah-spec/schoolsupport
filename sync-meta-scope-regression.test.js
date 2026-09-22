"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-data-crypto.js"),"utf8");
const fragment=source.match(/const YEAR_SYNC_META_KEYS[\s\S]*?function isYearSyncMeta\([^\n]+/)[0];
const isYearSyncMeta=vm.runInNewContext(`${fragment}\nisYearSyncMeta;`,{});
assert.equal(isYearSyncMeta("testGradeThresholds"),true);
assert.equal(isYearSyncMeta("memoTags"),true);
assert.equal(isYearSyncMeta("themePreference"),false);
assert.equal(isYearSyncMeta("pcPinlessMode"),false);
assert.equal(isYearSyncMeta("syncDeviceName"),false);
assert.equal(isYearSyncMeta("selectedClassId"),false);
console.log("sync-meta-scope-regression: passed");
