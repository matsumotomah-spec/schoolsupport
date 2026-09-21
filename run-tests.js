"use strict";

const path=require("node:path");

const tests=[
  "notebook-history-regression.test.js",
  "data-format-regression.test.js",
  "settings-card-regression.test.js",
  "release-integrity.test.js",
  "daily-input-regression.test.js",
  "gradebook-regression.test.js"
];

for(const test of tests)require(path.join(__dirname,test));
console.log(`${tests.length} regression tests passed`);
