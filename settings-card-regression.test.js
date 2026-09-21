"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-settings-core.js"),"utf8");
const displaySource=fs.readFileSync(path.resolve(__dirname,"..","app-settings-display.js"),"utf8");
const components=vm.runInNewContext(`${source}\n({settingsChoiceCard,settingsActionCard,settingsStatusCard,settingsDangerCard,settingsDisclosure});`,{
  esc:value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;")
});

assert.match(components.settingsChoiceCard({id:"compact",title:"すっきり",description:"補足を減らします",selected:true}),/data-card-role="選択"/);
assert.match(components.settingsChoiceCard({id:"compact",title:"すっきり",description:"補足を減らします",selected:true}),/aria-pressed="true"/);
assert.match(components.settingsActionCard({id:"backup",title:"ファイルを作る",description:"端末に保存します",action:"保存ファイルを作る"}),/data-card-role="実行"/);
assert.match(components.settingsStatusCard({title:"保存状態",value:"保存済み"}),/data-card-role="状態"/);
assert.match(components.settingsDangerCard({id:"restore",title:"復元",description:"現在の記録を置き換えます",action:"復元を確認する"}),/data-card-role="危険操作"/);
assert.match(components.settingsDangerCard({id:"delete-class-records",title:"記録を削除",description:"記録を削除します",action:"確認する",attribute:"id"}),/id="delete-class-records"/);
assert.match(components.settingsDisclosure({title:"詳しい説明",summary:"必要なときだけ開く",content:"<p>補足</p>"}),/<details class="settings-disclosure">/);
assert.match(displaySource,/settingsChoiceCard\(\{id,title,description,current,attribute:'data-display-focus'\}\)/);
assert.doesNotMatch(displaySource,/renderAppearanceSettings[\s\S]*cardifySettingsPanels/);
assert.match(displaySource,/settings-detail-card" data-card-role="選択"><h1>表示・アイコン設定/);
assert.doesNotMatch(displaySource,/cardifyAppearanceSections/);
assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname,"..","app-settings-records.js"),"utf8"),/renderTagSettings[\s\S]*cardifySettingsPanels/);
assert.match(fs.readFileSync(path.resolve(__dirname,"..","app-settings-records.js"),"utf8"),/settingsDisclosure\(\{title:'タグの使い方'[\s\S]*open:state\.informationMode==='detailed'/);
const dataSettingsSource=fs.readFileSync(path.resolve(__dirname,"..","app-data.js"),"utf8");
assert.match(dataSettingsSource,/settingsDangerCard\(\{id:'delete-class-records'/);
assert.match(dataSettingsSource,/attribute:'id'\}\)\}\$\{settingsDangerCard\(\{id:'delete-current-class'/);
assert.match(dataSettingsSource,/settingsStatusCard\(\{title:'最終ファイル保存'/);
assert.doesNotMatch(dataSettingsSource,/renderDataExchange[\s\S]*cardifySettingsPanels/);
assert.match(dataSettingsSource,/settings-detail-card credential-status" data-card-role="状態"/);
const coreSource=fs.readFileSync(path.resolve(__dirname,"..","app-core.js"),"utf8");
const appSource=fs.readFileSync(path.resolve(__dirname,"..","app.js"),"utf8");
assert.doesNotMatch(coreSource,/\bunsavedChanges\b/);
assert.match(coreSource,/drafts:\{roster:false,forms:new Set\(\),nextFormId:0\}/);
assert.match(coreSource,/function hasUnsavedDraft\(\)/);
assert.match(appSource,/form&&!form\.matches\('\[data-auto-save\]'\)/);
assert.match(source,/function openSettingsRoute\(tab,\{classSettingsView='list'\}=\{\}\)/);
assert.match(source,/function openSettingsPage\(tab='guide'/);
assert.match(source,/navigateSafely\(\(\)=>openSettingsRoute\(button\.dataset\.settingsRoute\)\)/);
assert.match(fs.readFileSync(path.resolve(__dirname,"..","app-help.js"),"utf8"),/navigateHelpRoute[\s\S]*openSettingsPage\(settingsRoutes\[route\]\)/);
assert.match(fs.readFileSync(path.resolve(__dirname,"..","app-shell.js"),"utf8"),/home-open-roster[\s\S]*openSettingsPage\('classes'/);
assert.match(fs.readFileSync(path.resolve(__dirname,"..","app-data-migration.js"),"utf8"),/migration-no-target-classes[\s\S]*openSettingsPage\('classes'\)/);
const securitySource=fs.readFileSync(path.resolve(__dirname,"..","app-settings-security.js"),"utf8");
assert.doesNotMatch(securitySource,/renderYearSettings[\s\S]*cardifySettingsPanels/);
assert.match(securitySource,/新年度への切り替え[\s\S]*data-card-role="危険操作"|data-card-role="危険操作"[\s\S]*新年度への切り替え/);
assert.doesNotMatch(source,/cardifySettingsPanels/);
assert.doesNotMatch(source,/cardifyAppearanceSections/);
const classesSettingsSource=fs.readFileSync(path.resolve(__dirname,"..","app-settings-classes.js"),"utf8");
assert.match(classesSettingsSource,/settingsStatusCard\(\{title:'登録クラス'/);
assert.doesNotMatch(classesSettingsSource,/renderRosterSettings[\s\S]*cardifySettingsPanels/);
assert.match(classesSettingsSource,/manual-roster" data-card-role="入力"/);
assert.match(classesSettingsSource,/roster-bulk-save" data-card-role="保存"/);
const reportsSource=fs.readFileSync(path.resolve(__dirname,"..","app-reports.js"),"utf8");
assert.doesNotMatch(reportsSource,/renderPromptSettings[\s\S]*cardifySettingsPanels/);
assert.match(reportsSource,/renderPromptSettings[\s\S]*settings-detail-card/);
assert.match(reportsSource,/prompt-token-card" data-card-role="案内"/);

console.log("settings-card-regression: passed");
