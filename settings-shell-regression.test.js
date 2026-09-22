"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"..","app-settings-core.js"),"utf8");
for(const item of ["function settingsCategoryFor","function settingsPageLead","function wireSettingsHome","function renderSettingsContent"])assert.ok(source.includes(item));
assert.match(source,/settings-level-nav/);
assert.match(source,/settings-page-status/);
console.log("settings-shell-regression: passed");
