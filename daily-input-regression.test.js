"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const shellSource=fs.readFileSync(path.join(root,"app-shell.js"),"utf8");
const recordsSource=fs.readFileSync(path.join(root,"app-records.js"),"utf8");
const gradesSource=fs.readFileSync(path.join(root,"app-grades.js"),"utf8");
const dailyNextStatus=vm.runInNewContext(shellSource.match(/function dailyNextStatus\([^\n]+/)[0]+"\ndailyNextStatus;",{});

assert.equal(dailyNextStatus("unconfirmed","teacher"),"submitted");
assert.equal(dailyNextStatus("submitted","teacher"),"forgotten");
assert.equal(dailyNextStatus("forgotten","teacher"),"absent");
assert.equal(dailyNextStatus("absent","teacher"),"unconfirmed");
assert.equal(dailyNextStatus("partialForgotten","teacher"),"unconfirmed");

assert.equal(dailyNextStatus("unconfirmed","pupil"),"submitted");
assert.equal(dailyNextStatus("submitted","pupil"),"forgotten");
assert.equal(dailyNextStatus("forgotten","pupil"),"partialForgotten");
assert.equal(dailyNextStatus("partialForgotten","pupil"),"unconfirmed");

assert.match(shellSource,/showUndoToast\(message/);
assert.match(recordsSource,/function showInputUndo\(message,previous,id\)\{showUndoToast/);
assert.match(gradesSource,/showUndoToast\(`\$\{selected\.label\}/);

console.log("daily-input-regression: passed");
