"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-data-import.js"),"utf8");
const validators=vm.runInNewContext(`${source}\n({validateEncryptedEnvelope,validateSyncPayload});`,{});
const syncSource=fs.readFileSync(path.resolve(__dirname,"..","app-data-sync.js"),"utf8");
const {newerThan}=vm.runInNewContext(`${syncSource}\n({newerThan});`,{});

for(const version of [1,2]){
  const envelope={format:"class-support-encrypted",version,crypto:{algorithm:"AES-GCM"},ciphertext:"encrypted-data"};
  assert.equal(validators.validateEncryptedEnvelope(envelope),envelope);
}
assert.throws(()=>validators.validateEncryptedEnvelope({format:"class-support-encrypted",version:3,crypto:{},ciphertext:"data"}),/対応していない/);
assert.throws(()=>validators.validateEncryptedEnvelope({format:"class-support-encrypted",version:2,crypto:{}}),/暗号化データが不足/);

const payload={
  format:"class-support-sync-payload",
  schemaVersion:1,
  yearId:"year-2026",
  yearLabel:"2026年度",
  generatedAt:"2026-09-21T00:00:00.000Z",
  device:"iPad",
  data:{
    years:[{id:"year-2026"}],
    classes:[{id:"class-1",yearId:"year-2026"}],
    students:[{id:"student-1"}],
    enrollments:[{id:"enrollment-1",classId:"class-1",studentId:"student-1"}],
    records:[{id:"record-1",classId:"class-1",studentId:"student-1"}],
    trash:[],
    meta:[{key:"themePreference"}]
  }
};

assert.equal(validators.validateSyncPayload(payload),payload);
assert.throws(()=>validators.validateSyncPayload({...payload,yearId:"missing-year"}),/年度データが一致/);
assert.throws(()=>validators.validateSyncPayload({...payload,data:{...payload.data,records:[{id:"record-1",classId:"missing-class"}]}}),/所属クラスが不明な記録/);
assert.throws(()=>validators.validateSyncPayload({...payload,data:{...payload.data,meta:[{key:"same"},{key:"same"}]}}),/重複/);

assert.equal(newerThan({updatedAt:"2026-09-21T09:00:00Z"},{updatedAt:"2026-09-21T08:59:59Z"}),true);
assert.equal(newerThan({updatedAt:"2026-09-21T09:00:00Z"},{updatedAt:"2026-09-21T09:00:00Z"}),false);
assert.equal(newerThan({deletedAt:"2026-09-21T08:00:00Z"},{updatedAt:"2026-09-21T09:00:00Z"}),false);

console.log("data-format-regression: passed");
