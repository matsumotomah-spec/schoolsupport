"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-grades.js"),"utf8");
const functionSource=source.match(/function isSmallTestRecord[\s\S]*?\n  }\n\n  function unconductedPaperTestIds/)[0].replace(/\n\n  function unconductedPaperTestIds[\s\S]*/,"");
const {isUnconductedPaperTest}=vm.runInNewContext(`${functionSource}\n({isUnconductedPaperTest});`,{});

const paperZeros=[
  {sourceKind:"paper",total:0,scores:[{point:0,max:20}]},
  {sourceKind:"paper",total:0,scores:[{point:0,max:30}]}
];
assert.equal(isUnconductedPaperTest(paperZeros),true);
assert.equal(isUnconductedPaperTest([{sourceKind:"paper",total:0,scores:[{point:0,max:20}]},{sourceKind:"paper",total:1,scores:[{point:1,max:20}]}]),false);
assert.equal(isUnconductedPaperTest([{sourceKind:"quiz",total:0,scores:[{point:0,max:100}]}]),false);
assert.equal(isUnconductedPaperTest([{sourceKind:"paper",total:0,scores:[]}]),false);

assert.match(source,/小テスト[\s\S]*0点も実施した得点として集計/);
assert.match(source,/欠席・未提出は平均から除外/);

console.log("gradebook-regression: passed");
