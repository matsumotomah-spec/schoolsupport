"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-shell.js"),"utf8");
assert.match(source,/function visibleRewardMedals\(medalData\)/);
assert.match(source,/rewardIconHtml\('medal-inline'\)/);
assert.match(source,/medals\.has\(row\.student\.id\)/);
console.log("pupil-reward-placement-regression: passed");
