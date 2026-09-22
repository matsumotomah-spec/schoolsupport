"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-shell.js"),"utf8");
const fragment=source.slice(source.indexOf("async function teacherRosterCards"),source.indexOf("function teacherOrderMode"));
const api=vm.runInNewContext(`${fragment}\n({teacherRosterCards});`,{
  state:{classes:[{id:"class-1",activeSeatCols:6}],rosterDensity:"auto"},
  rosterForClass:async()=>[{student:{id:"student-1",name:"山田 太郎"},enrollment:{number:1}}],
  ClassDB:{getAllByIndex:async()=>[]},
  normalRecord:item=>Boolean(item&&!item.deletedAt&&!item.needsReview),
  esc:value=>String(value),
  feedbackClass:()=>"",
  jpDate:()=>"",
  slashDate:()=>"",
  activeSeatGridTemplate:()=>"minmax(0,1fr)"
});

api.teacherRosterCards("class-1").then(html=>{
  assert.match(html,/class="button roster-jump" href="#teacher-roster-list"/);
  assert.match(html,/id="teacher-roster-list"/);
  assert.match(html,/山田 太郎/);
  console.log("a010-operation-regression: passed");
}).catch(error=>{console.error(error);process.exitCode=1;});
