"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const crypto=fs.readFileSync(path.join(root,"app-data-crypto.js"),"utf8");
const db=fs.readFileSync(path.join(root,"db.js"),"utf8");

const fragment=crypto.match(/function trashBelongsToYear\([^\n]+/)[0];
const trashBelongsToYear=vm.runInNewContext(`${fragment};trashBelongsToYear;`,{});
const classes=new Set(["class-2026"]);
assert.equal(trashBelongsToYear({record:{classId:"class-2026"}},classes,"year-2026"),true);
assert.equal(trashBelongsToYear({kind:"classBundle",classBundle:{class:{yearId:"year-2026"}}},classes,"year-2026"),true);
assert.equal(trashBelongsToYear({kind:"classBundle",classBundle:{class:{yearId:"year-2025"}}},classes,"year-2026"),false);
assert.match(db,/item\.kind==='classBundle'&&item\.classBundle\?\.class\?\.yearId===yearId/);
assert.match(db,/students:\(data\.students\|\|\[\]\)\.filter\(item=>!remainingEnrollmentStudents\.has\(item\.id\)\)/);
console.log("trash-year-scope-regression: passed");
