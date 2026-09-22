"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-core.js"),"utf8");
assert.match(source,/function lockTeacherSession\(\)\{const preserved=preserveLockedDialog\(\);state\.sessionSecret=null;state\.pendingSync=null;if\(!preserved\)clearUnsavedDrafts\(\);closeDialog\(\{keepContents:preserved\}\);if\(state\.route\.startsWith\('teacher'\)\)renderPupil\(\);\}/);
assert.match(source,/lockTeacherSession\(\);\},wait\)/);
console.log("teacher-lock-regression: passed");
