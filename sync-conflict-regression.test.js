"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-data-sync.js"),"utf8");
const fragment=source.match(/function syncConflictCopy\([\s\S]*?\n  }/)[0];
const syncConflictCopy=vm.runInNewContext(`${fragment}\nsyncConflictCopy;`,{});
const local={id:"record-1",updatedAt:"2026-09-22T09:00:00.000Z",status:"submitted"};
const incoming={...local,status:"forgotten"};
const conflict=syncConflictCopy(incoming,local,"iPad",()=>"syncConflict_1");
assert.equal(conflict.id,"syncConflict_1");
assert.equal(conflict.conflictOriginalId,"record-1");
assert.equal(conflict.conflictDevice,"iPad");
assert.equal(conflict.conflictReason,"sameUpdatedAt");
assert.equal(conflict.needsReview,true);
assert.equal(syncConflictCopy({...local,updatedAt:"2026-09-22T09:00:01.000Z"},local,"PC",()=>"unused"),null);
assert.equal(syncConflictCopy({...local},local,"PC",()=>"unused"),null);
assert.match(source,/要確認 .*同じ更新時刻で内容が異なる記録/);

console.log("sync-conflict-regression: passed");
