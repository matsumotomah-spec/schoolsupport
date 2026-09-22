"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const core=fs.readFileSync(path.join(root,"app-core.js"),"utf8");
const sync=fs.readFileSync(path.join(root,"app-data-sync.js"),"utf8");
const crypto=fs.readFileSync(path.join(root,"app-data-crypto.js"),"utf8");
assert.match(core,/async function reloadStateFromDb\(\)/);
for(const key of ["themePreference","featureIconMode","pupilOverviewVisibility","footerLayout","pcPinlessMode","activeYearId","selectedClassId","lastBackupAt","lastSyncAt"])assert.match(core,new RegExp(`getMeta\\('${key}'`));
assert.match(sync,/await reloadStateFromDb\(\);state\.pendingSync=null/);
assert.equal((crypto.match(/await ClassDB\.replaceYearRaw\(replacement,payload\.yearId\);await reloadStateFromDb\(\);/g)||[]).length,2);
assert.match(core,/await ClassDB\.replaceAllRaw\(replacement\);await reloadStateFromDb\(\);unlockTeacher/);
console.log("state-reload-regression: passed");
