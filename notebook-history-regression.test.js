"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const root=path.resolve(__dirname,"..");
const historySource=fs.readFileSync(path.join(root,"app-notebook-history.js"),"utf8");
const recordsSource=fs.readFileSync(path.join(root,"app-records.js"),"utf8");
const NotebookHistory=vm.runInNewContext(`${historySource}\nNotebookHistory;`,{
  slashDate:value=>`日付:${value}`
});

const sessionKey=record=>`${record.subject}|${record.unit}|${record.date}`;
const records=[
  {id:"a",subject:"国語",unit:"説明文",date:"2026-09-10",updatedAt:"2026-09-10T09:00:00Z",sessionKey:"current",status:"B"},
  {id:"b",subject:"国語",unit:"説明文",date:"2026-09-09",updatedAt:"2026-09-09T09:00:00Z",sessionKey:"past",status:"absent"},
  {id:"c",subject:"国語",unit:"説明文",date:"2026-09-09",updatedAt:"2026-09-09T10:00:00Z",sessionKey:"past",status:"unsubmitted"},
  {id:"d",subject:"算数",unit:"小数",date:"2026-09-08",updatedAt:"2026-09-08T09:00:00Z",status:"A"}
];

const sessions=NotebookHistory.sessions(records,sessionKey);
assert.deepEqual(Array.from(sessions,session=>session.key),["current","past","算数|小数|2026-09-08"]);
assert.deepEqual(Array.from(sessions[1].records,record=>record.id),["c","b"]);
assert.equal(NotebookHistory.label(records[0]),"国語　説明文　日付:2026-09-10");

const html=NotebookHistory.html(sessions,{escape:value=>String(value),formatDate:value=>value});
assert.match(html,/<details class="panel notebook-history">/);
assert.match(html,/3回・最新 2026-09-10/);
assert.match(html,/評価 0人・欠席／未提出 2人/);
assert.match(html,/data-notebook-session="past"/);

assert.match(recordsSource,/NotebookHistory\.label\(first\)/);
assert.doesNotMatch(recordsSource,/\bhistoryLabel\b/);

console.log("notebook-history-regression: passed");
