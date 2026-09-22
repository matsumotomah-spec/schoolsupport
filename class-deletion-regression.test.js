"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-data-migration.js"),"utf8");
const fragment=source.match(/function classTrashEntryFor[\s\S]*?\n\n  async function resetToWelcomePreservingLegacy/)[0].replace(/\n\n  async function resetToWelcomePreservingLegacy[\s\S]*/,"");
const applied=[];
const context={
  ClassDB:{now:()=>"2026-09-22T00:00:00.000Z",deviceId:()=>"device-a"},
  state:{classes:[],selectedClassId:null}
};
const {classTrashEntryFor}=vm.runInNewContext(`${fragment}\n({classTrashEntryFor});`,context);

const entry=classTrashEntryFor({id:"c1",name:"1年1組"},{enrollments:[{id:"e1"}],records:[{id:"r1"}],students:[{id:"s1"}]});
assert.equal(entry.kind,"classBundle");
assert.equal(entry.classBundle.records.length,1);
assert.match(entry.purgeAfter,/2026/);

assert.match(source,/クラスをごみ箱へ移す/);
assert.match(source,/item\.kind==='classBundle'[\s\S]*puts=\{classes:/);
assert.match(source,/puts:\{trash:\[bundle\],meta\}/);
assert.match(source,/seatingSettings=await ClassDB\.get\('meta',`seatingSettings_\$\{classItem\.id\}`\)/);
assert.match(source,/seatingSettings:seatingSettings\|\|null/);
assert.match(source,/bundle\.seatingSettings\?\[bundle\.seatingSettings\]:\[\]/);
assert.doesNotMatch(source,/if\(!state\.classes\.length\)\{await resetToWelcomePreservingLegacy\(\)/);

console.log("class-deletion-regression: passed");
