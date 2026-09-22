"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-data-sync.js"),"utf8");
const fragment=source.match(/function syncDeletionCandidate\([^\n]+/)[0];
const syncDeletionCandidate=vm.runInNewContext(`${fragment}\nsyncDeletionCandidate;`,{});
const tombstone={id:"trash_record-1",record:{id:"record-1",updatedAt:"2026-09-01T00:00:00.000Z"},deletedAt:"2026-09-02T00:00:00.000Z"};
const localRecord={id:"record-1",updatedAt:"2026-09-01T00:00:00.000Z"};
const candidate=syncDeletionCandidate(tombstone,localRecord,null);
assert.equal(candidate.record.id,"record-1");
assert.equal(candidate.trash.id,"trash_record-1");
assert.equal(syncDeletionCandidate(tombstone,{...localRecord,updatedAt:"2026-09-03T00:00:00.000Z"},null),null);
assert.equal(syncDeletionCandidate(tombstone,null,{...tombstone,deletedAt:"2026-09-03T00:00:00.000Z"}),null);
assert.equal(syncDeletionCandidate({...tombstone,record:null},localRecord,null),null);
assert.doesNotMatch(source,/stores=\[[^\]]*'trash'/);
const batchFragment=source.match(/function syncBatchForPlan[\s\S]*?\n  }\n\n  async function applySyncPlan/)[0].replace(/\n\n  async function applySyncPlan$/,"");
const syncBatchForPlan=vm.runInNewContext(`${batchFragment}\nsyncBatchForPlan;`,{});
const plan={writes:{records:[{id:"new-record"}]},meta:{lastSyncAt:"2026-09-02"},deletes:[candidate,{record:null,trash:{id:"trash_missing"}}]};
const unapproved=syncBatchForPlan(plan,false);
assert.equal(unapproved.puts.trash,undefined);
assert.equal(JSON.stringify(unapproved.deletes),"{}");
const approved=syncBatchForPlan(plan,true);
assert.equal(JSON.stringify(approved.puts.trash),JSON.stringify([tombstone,{id:"trash_missing"}]));
assert.equal(JSON.stringify(approved.deletes),JSON.stringify({records:["record-1"]}));

console.log("sync-deletion-regression: passed");
