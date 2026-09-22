"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const syncSource=fs.readFileSync(path.resolve(__dirname,"..","app-data-sync.js"),"utf8");
const shellSource=fs.readFileSync(path.resolve(__dirname,"..","app-shell.js"),"utf8");
const recordsSource=fs.readFileSync(path.resolve(__dirname,"..","app-records.js"),"utf8");
const behaviorSource=fs.readFileSync(path.resolve(__dirname,"..","app-behavior.js"),"utf8");
const coreSource=fs.readFileSync(path.resolve(__dirname,"..","app-core.js"),"utf8");
const gradesSource=fs.readFileSync(path.resolve(__dirname,"..","app-grades.js"),"utf8");
const settingsRecordsSource=fs.readFileSync(path.resolve(__dirname,"..","app-settings-records.js"),"utf8");
const settingsSecuritySource=fs.readFileSync(path.resolve(__dirname,"..","app-settings-security.js"),"utf8");
const dataSyncSource=fs.readFileSync(path.resolve(__dirname,"..","app-data-sync.js"),"utf8");
const seatingSource=fs.readFileSync(path.resolve(__dirname,"..","app-seating.js"),"utf8");
const classesSource=fs.readFileSync(path.resolve(__dirname,"..","app-settings-classes.js"),"utf8");

// A006: conflict copies are excluded from the behavior aggregate.
const behaviorFn=vm.runInNewContext(`(${behaviorSource.slice(behaviorSource.indexOf("function behaviorActiveRecords"),behaviorSource.indexOf("async function behaviorRecords")) .trim().replace(/;$/,"")})`,{normalRecord:item=>Boolean(item&&!item.needsReview&&!item.deletedAt)});
assert.equal(behaviorFn([{type:"behaviorMark",status:"marked",id:"normal"},{type:"behaviorMark",status:"marked",id:"conflict",needsReview:true}]).length,1);
const medalFragment=shellSource.slice(shellSource.indexOf("async function homeworkMedalData"),shellSource.indexOf("function visibleRewardMedals"));
const medalFn=vm.runInNewContext(`(${medalFragment.trim().replace(/;$/,"")})`,{
  rosterForClass:async()=>[{student:{id:"student-1"},enrollment:{}}],submissionExempt:()=>false,
  ClassDB:{getAllByIndex:async()=>[{type:"dailyHomework",studentId:"student-1",date:"2026-09-22",status:"forgotten",needsReview:true}],getMeta:async()=>0},
  recentMonthStart:()=>"2026-09-01",today:()=>"2026-09-22",normalRecord:item=>Boolean(item&&!item.needsReview&&!item.deletedAt),
  dailyForgottenWeight:()=>1,homeworkMedalEligible:()=>true
});
medalFn("class-1").then(result=>assert.equal(result.hasRecords,false));
// A004/A007: direct quiz input updates the visible progress and every async
// settings save captures its form before awaiting storage.
assert.match(gradesSource,/data-manual-quiz-score[\s\S]*?markFormDraftDirty\(document\.getElementById\('manual-quiz-form'\)\)[\s\S]*?manual-quiz-progress/);
const quizProgressSource=gradesSource.slice(gradesSource.indexOf("function manualQuizProgress"),gradesSource.indexOf("async function openManualQuizEntry"));
const quizProgressFn=vm.runInNewContext(`(${quizProgressSource.trim().replace(/;$/,"")})`,{subjectExempt:(row,subject)=>row.exempt===subject});
const quizScores=new Map([["student-1",80],["student-2",null]]);
const quizProgress=quizProgressFn(quizScores,[{student:{id:"student-1"}},{student:{id:"student-2"},exempt:"国語"}],"国語");
assert.equal(quizProgress.eligible,1);assert.equal(quizProgress.scored,1);assert.equal(quizProgress.missing,0);
assert.match(gradesSource,/function openDeleteTest[\s\S]*?sourceTestId===sourceTestId&&normalRecord\(item\)/);
assert.equal((settingsRecordsSource.match(/const form=event\.currentTarget/g)||[]).length,3);
assert.match(settingsSecuritySource,/const form=event\.currentTarget/);
assert.match(coreSource,/function completeFormDraft\(form\)\{/);
const draftFragment=coreSource.slice(coreSource.indexOf("function formDraftKey"),coreSource.indexOf("function hasUnsavedDraft"));
const draftForms=[{id:"form-a",dataset:{}},{id:"form-b",dataset:{}}];
const draftApi=vm.runInNewContext(`${draftFragment}\n({state,markFormDraftDirty,completeFormDraft});`,{
  state:{drafts:{forms:new Set(),nextFormId:0}},
  document:{activeElement:{closest:()=>draftForms[1]},querySelectorAll:()=>draftForms}
});
draftApi.markFormDraftDirty(draftForms[0]);draftApi.markFormDraftDirty(draftForms[1]);draftApi.completeFormDraft(draftForms[0]);
assert.equal(draftApi.state.drafts.forms.has("form-a"),false);
assert.equal(draftApi.state.drafts.forms.has("form-b"),true);
// A008/A009: the rerender path preserves the selected data tab and the weekly
// dialog exposes an explicit absent state.
assert.match(dataSyncSource,/state\.dataSectionTab=key/);
const tabFn=vm.runInNewContext(`(${dataSyncSource.slice(dataSyncSource.indexOf("function dataSectionTabForState"),dataSyncSource.indexOf("async function inspectSyncPracticeFile")).trim().replace(/;$/,"")})`);
assert.equal(tabFn("safety",{safety:[{}],sync:[{}]},[{dataset:{dataTab:"sync"}}]),"safety");
assert.equal(tabFn("safety",{sync:[{}]},[{dataset:{dataTab:"sync"}}]),"sync");
assert.match(shellSource,/data-daily-choice="absent"/);
assert.match(shellSource,/status==='absent'\?'欠席にしました'/);
const dailyStatusFragment=shellSource.slice(shellSource.indexOf("function dailyHistory"),shellSource.indexOf("async function renderSettings"));
const dailyWrites=[];
const dailyApi=vm.runInNewContext(`${dailyStatusFragment.trim()}\n({setDailyStatus});`,{
  selectedClass:()=>({id:"class-1"}),
  ClassDB:{now:()=>"2026-09-23T06:00:00.000Z",get:async()=>null,put:async(store,row)=>{dailyWrites.push(row);return row;}}
});
dailyApi.setDailyStatus("student-1","2026-09-23","absent").then(()=>assert.equal(dailyWrites[0].status,"absent"));
assert.match(seatingSource,/type==='seatingPlan'&&normalRecord\(item\)/);
assert.match(classesSource,/studentId===row\.studentId&&normalRecord\(item\)/);
const lockFragment=coreSource.slice(coreSource.indexOf("function preserveLockedDialog"),coreSource.indexOf("function lockTeacherSession"));
const lockForm={id:"manual-quiz-form",dataset:{}};
const lockNodes=[{name:"quiz-heading"},{name:"quiz-form",form:lockForm}];
const lockDialog={children:[...lockNodes],querySelector:()=>lockForm,removeChild(node){this.children=this.children.filter(item=>item!==node);return node;},appendChild(node){this.children.push(node);return node;},showModal(){this.opened=true;}};
Object.defineProperty(lockDialog,"firstChild",{get(){return this.children[0]||null;}});
Object.defineProperty(lockDialog,"innerHTML",{set(){this.children=[];}});
const lockApi=vm.runInNewContext(`${coreSource.slice(coreSource.indexOf("function formDraftKey"),coreSource.indexOf("function hasUnsavedDraft"))}\n${lockFragment}\n({state,preserveLockedDialog,restoreLockedDialog});`,{
  state:{drafts:{forms:new Set(["manual-quiz-form"]),nextFormId:0},lockedDialogNodes:null},dialog:lockDialog,
  sensitiveDraftForm:()=>false
});
assert.equal(lockApi.preserveLockedDialog(),true);assert.equal(lockDialog.children.length,0);assert.equal(lockApi.restoreLockedDialog(),true);assert.equal(lockDialog.children.length,2);assert.equal(lockDialog.opened,true);

// A001: deletion must consider enrollments arriving in the same sync batch.
const orphanFragment=syncSource.slice(syncSource.indexOf("async function syncOrphanStudentIds"),syncSource.indexOf("async function applySyncPlan"));
const orphanFn=vm.runInNewContext(`(${orphanFragment.match(/async function syncOrphanStudentIds[\s\S]*?\n  }/)[0]})`,{
  ClassDB:{getAll:async()=>[{id:"old-enrollment",studentId:"student-1"}]}
});
const orphanResult=orphanFn({
  classDeletes:[{enrollments:[{id:"old-enrollment",studentId:"student-1"}]}],
  writes:{enrollments:[{id:"new-enrollment",studentId:"student-1"}]}
});
orphanResult.then(result=>assert.equal(result.length,0));

// A002: adopting an incoming conflict must retain it even when the original vanished.
const conflictFragment=syncSource.slice(syncSource.indexOf("async function resolveSyncConflict"),syncSource.indexOf("function syncGuideHtml"));
const calls=[];
const conflictFn=vm.runInNewContext(`(${conflictFragment.match(/async function resolveSyncConflict[\s\S]*?\n  }/)[0]})`,{
  ClassDB:{
    get:async(store,id)=>id==="conflict-1"?{id:"conflict-1",type:"dailyHomework",status:"submitted",conflictOriginalId:"missing-1",needsReview:true}:null,
    now:()=>"2026-09-22T10:00:00.000Z",
    applyBatch:async batch=>calls.push(batch)
  },
  showToast:message=>calls.push({toast:message})
});
conflictFn("conflict-1","incoming").then(()=>{
  const batch=calls.find(item=>item.puts);
  assert.equal(batch.puts.records[0].id,"conflict-1");
  assert.equal(batch.puts.records[0].needsReview,false);
  assert.equal(Object.keys(batch.deletes).length,0);
  assert.equal(calls.at(-1).toast,"取込側の記録を採用しました");
  return conflictFn("conflict-1","local").then(()=>{
    assert.equal(calls.at(-1).toast,"元の記録が見つからないため、取込側を確認候補として残しました");
  // A003: the public tap handler queues the second operation behind the first.
  const queueFragment=shellSource.slice(shellSource.indexOf("const dailyTapQueues"),shellSource.indexOf("async function handleDailyTapUnlocked"));
  const order=[];
  const queueContext={selectedClass:()=>({id:"class-1"}),handleDailyTapUnlocked:async(student,date,mode)=>{order.push("start-"+order.length);await new Promise(resolve=>setTimeout(resolve,5));order.push("end-"+order.length);}};
  const queueApi=vm.runInNewContext(`${queueFragment}\n({handleDailyTap,dailyTapQueues});`,queueContext);
  return Promise.all([queueApi.handleDailyTap("student-1","2026-09-22","teacher"),queueApi.handleDailyTap("student-1","2026-09-22","teacher")]).then(()=>{
    assert.equal(order.join(","),"start-0,end-1,start-2,end-3");

    // A005: automatic weekly forgetting writes synchronization metadata.
    const weeklyFragment=recordsSource.slice(recordsSource.indexOf("async function applyWeeklyAutoForget"),recordsSource.indexOf("async function weeklyData"));
    const weeklyCalls=[];
    const weeklyFn=vm.runInNewContext(`(${weeklyFragment.slice(0,weeklyFragment.lastIndexOf("\n  ")+4).trim()})`,{
      ClassDB:{now:()=>"2026-09-22T10:00:00.000Z",deviceId:()=>"iPad-1",applyBatch:async batch=>weeklyCalls.push(batch)},
      nextSaturday:()=>"2026-09-26",mondayOf:()=>"2026-09-21",moveDate:(date,offset)=>offset===4?"2026-09-25":"2026-09-21",
      rosterForClass:async()=>[{student:{id:"student-1"},enrollment:{}}],submissionExempt:()=>false
    });
    return weeklyFn([{id:"occ-1",type:"weeklyOccurrence",seriesId:"series-1",autoForgetOnSaturday:true,dueDate:"2026-09-21",autoForgetDate:"2026-09-20",title:"宿題"}],"class-1","2026-09-22").then(()=>{
      const written=weeklyCalls[0].puts.records.find(item=>item.type==='weeklySubmission');
      assert.equal(written.updatedAt,"2026-09-22T10:00:00.000Z");
      assert.equal(written.deviceId,"iPad-1");
      console.log("p0-operation-regression: passed");
    });
  });
  });
});
