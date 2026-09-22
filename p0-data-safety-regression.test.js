"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const core=fs.readFileSync(path.join(root,"app-core.js"),"utf8");
const sync=fs.readFileSync(path.join(root,"app-data-sync.js"),"utf8");

assert.doesNotMatch(core,/if\(!state\.classes\.length\)\{await resetToWelcomePreservingLegacy\(\);return;\}/);
assert.match(core,/state\.settingsTab='classes';[\s\S]*requireTeacher\(renderSettings\);/);

const start=sync.indexOf("  function newerThan");
const end=sync.indexOf("  async function readEncryptedImport");
const batchStart=sync.indexOf("  function syncBatchForPlan");
const batchEnd=sync.indexOf("  async function applySyncPlan");
const context={ClassDB:{getAll:async()=>[],get:async(store,id)=>store==='records'&&id==='record-1'?{id,updatedAt:"2026-09-01T00:00:00.000Z"}:null,uid:()=>"conflict-copy"},isYearSyncMeta:()=>true};
vm.createContext(context);
vm.runInContext(`${sync.slice(start,end)}${sync.slice(batchStart,batchEnd)};this.buildSyncPlan=buildSyncPlan;this.syncBatchForPlan=syncBatchForPlan;`,context);

(async()=>{
  const record={id:"record-1",updatedAt:"2026-09-03T00:00:00.000Z"};
  const trash={id:"trash-record-1",record:{id:"record-1"},deletedAt:"2026-09-02T00:00:00.000Z"};
  const plan=await context.buildSyncPlan({data:{records:[record],trash:[trash],meta:[]}});
  const batch=context.syncBatchForPlan(plan,true);
  assert.deepEqual(JSON.parse(JSON.stringify(batch.puts.records)),[record]);
  assert.deepEqual(JSON.parse(JSON.stringify(batch.deletes)),{records:[]});
  assert.deepEqual(JSON.parse(JSON.stringify(batch.puts.trash)),[]);
  console.log("p0-data-safety-regression: passed");
})().catch(error=>{console.error(error);process.exitCode=1;});
