"use strict";

const path=require("node:path");

const tests=[
  "notebook-history-regression.test.js",
  "data-format-regression.test.js",
  "settings-card-regression.test.js",
  "release-integrity.test.js",
  "daily-input-regression.test.js",
  "gradebook-regression.test.js",
  "appearance-settings-render.test.js",
  "class-deletion-regression.test.js",
  "sync-deletion-regression.test.js"
  ,"sync-conflict-regression.test.js"
  ,"sync-meta-scope-regression.test.js"
  ,"state-reload-regression.test.js"
  ,"year-restore-scope-regression.test.js"
  ,"teacher-lock-regression.test.js"
  ,"manual-quiz-change-regression.test.js"
  ,"service-worker-cache-regression.test.js"
  ,"help-render-regression.test.js"
  ,"appearance-scope-regression.test.js"
  ,"csv-import-regression.test.js"
  ,"draft-protection-regression.test.js"
  ,"information-mode-regression.test.js"
  ,"dependency-map-regression.test.js"
  ,"import-history-scope-regression.test.js"
  ,"settings-shell-regression.test.js"
  ,"class-editor-render-regression.test.js"
  ,"pupil-reward-placement-regression.test.js"
  ,"teacher-shell-regression.test.js"
  ,"footer-layout-regression.test.js"
  ,"roster-density-regression.test.js"
  ,"data-management-card-regression.test.js"
  ,"p0-data-safety-regression.test.js"
  ,"trash-year-scope-regression.test.js"
  ,"data-tab-routing-regression.test.js"
  ,"sync-class-deletion-regression.test.js"
  ,"year-trash-scope-regression.test.js"
  ,"shared-student-restore-regression.test.js"
  ,"year-meta-restore-regression.test.js"
  ,"teacher-lock-draft-regression.test.js"
  ,"sync-conflict-review-regression.test.js"
  ,"conflict-separation-regression.test.js"
  ,"form-draft-target-regression.test.js"
  ,"sync-orphan-student-regression.test.js"
  ,"trash-pagination-regression.test.js"
  ,"footer-roster-reachability-regression.test.js"
  ,"quiz-narrow-layout-regression.test.js"
  ,"settings-density-regression.test.js"
  ,"device-preflight-regression.test.js"
  ,"p0-operation-regression.test.js"
  ,"a010-operation-regression.test.js"
];

for(const test of tests)require(path.join(__dirname,test));
console.log(`${tests.length} regression tests passed`);

require("./daily-layout-regression.test.js");

require("./help-source-regression.test.js");

require("./daily-status-terminology.test.js");

require("./roster-density-scope.test.js");

require("./record-deletion-paths.test.js");

require("./settings-common-shell.test.js");

require("./class-editor-structure.test.js");
