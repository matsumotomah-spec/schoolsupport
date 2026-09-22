"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.resolve(__dirname,"..");
const db=fs.readFileSync(path.join(root,"db.js"),"utf8");
const crypto=fs.readFileSync(path.join(root,"app-data-crypto.js"),"utf8");
assert.match(db,/async function replaceYearRaw\(data=\{\},yearId\)/);
assert.match(db,/const classes=await getAllByIndex\('classes','yearId',yearId\)/);
assert.match(db,/remainingEnrollmentStudents/);
assert.match(db,/replaceYearRaw,resetAll/);
assert.equal((crypto.match(/ClassDB\.replaceYearRaw\(replacement,payload\.yearId\)/g)||[]).length,2);
assert.doesNotMatch(crypto,/ClassDB\.replaceAllRaw\(replacement\)/);
console.log("year-restore-scope-regression: passed");
