"use strict";
const CLEANING_CONFIG_TYPE='cleaningDutyConfig';
const CLEANING_DAILY_TYPE='cleaningDutyDaily';
const CLEANING_RATING_CIRCLE='circle';
const CLEANING_RATING_DOUBLE='double';
const CLEANING_RATING_TRIANGLE='triangle';
const CLEANING_RATING_DASH='dash';
const CLEANING_CRITERIA=[
  {id:'startedPromptly',label:'給食後（給食当番後）、すぐに掃除を始めた'},
  {id:'stayedOnTask',label:'途中で遊んだり人任せにしたりしなかった'},
  {id:'finishedAssigned',label:'決められた仕事を終えた'},
  {id:'helpedOthers',label:'自分の担当が終わった後、他の人を助けた'}
];
function cleaningConfigId(classId){return 'cleaningConfig_'+classId;}
function cleaningDailyId(classId,date){return 'cleaningDaily_'+classId+'_'+date;}
function cleaningPalette(index){return ['#397257','#4e78b8','#7651a8','#c06d31','#b04e6b','#287b83','#8c6b20','#697d32','#8d5d9d','#38735e'][index%10];}
function cleaningRatingValue(rating){return rating===CLEANING_RATING_DOUBLE?1:rating===CLEANING_RATING_CIRCLE?0.9:rating===CLEANING_RATING_TRIANGLE?0.5:0;}
function cleaningRatingLabel(rating){return rating===CLEANING_RATING_DOUBLE?'◎ 最初から最後まで掃除に集中していた':rating===CLEANING_RATING_CIRCLE?'○ よく掃除できた':rating===CLEANING_RATING_TRIANGLE?'△ やれていなかった':rating===CLEANING_RATING_DASH?'－ 他の事情で参加できなかった':'未評価';}
function cleaningRatingMap(group){
  if(group?.ratings&&typeof group.ratings==='object'&&!Array.isArray(group.ratings))return Object.fromEntries(Object.entries(group.ratings).filter(([,rating])=>[CLEANING_RATING_CIRCLE,CLEANING_RATING_DOUBLE,CLEANING_RATING_TRIANGLE,CLEANING_RATING_DASH].includes(rating)));
  // v148以前の「評価する」は1人分として集計されていたため、過去の点数を変えず◎として読む。
  return Object.fromEntries((group?.selectedIds||[]).map(id=>[id,CLEANING_RATING_DOUBLE]));
}
function cleaningNextRating(rating){return rating===null||rating===undefined||rating===''?CLEANING_RATING_DOUBLE:rating===CLEANING_RATING_DOUBLE?CLEANING_RATING_CIRCLE:rating===CLEANING_RATING_CIRCLE?CLEANING_RATING_TRIANGLE:rating===CLEANING_RATING_TRIANGLE?CLEANING_RATING_DASH:null;}
function cleaningStudentRating(record,studentId){
  const group=(record?.groups||[]).find(item=>(item.memberIds||[]).includes(studentId));
  if(!group||(group.absentIds||[]).includes(studentId))return null;
  return cleaningRatingMap(group)[studentId]||null;
}
function setCleaningGroupRatings(group,ratings){
  group.ratings=Object.fromEntries([...ratings].filter(([,rating])=>[CLEANING_RATING_CIRCLE,CLEANING_RATING_DOUBLE,CLEANING_RATING_TRIANGLE,CLEANING_RATING_DASH].includes(rating)));
  group.selectedIds=Object.keys(group.ratings);
}
function cleaningAssessmentMap(group){
  const valid=new Set(CLEANING_CRITERIA.map(item=>item.id)),source=group?.assessments&&typeof group.assessments==='object'&&!Array.isArray(group.assessments)?group.assessments:{};
  return Object.fromEntries(Object.entries(source).map(([id,value])=>[id,{criteria:[...new Set(Array.isArray(value?.criteria)?value.criteria.filter(key=>valid.has(key)):[])],unavailable:Boolean(value?.unavailable)}]));
}
function cleaningStudentAssessment(group,studentId){
  const current=cleaningAssessmentMap(group)[studentId];
  if(current)return current;
  const legacy=cleaningRatingMap(group)[studentId];
  return legacy?{criteria:[],unavailable:legacy===CLEANING_RATING_DASH,legacyRating:legacy}:{criteria:[],unavailable:false};
}
function setCleaningStudentAssessment(group,studentId,value){
  const assessments=cleaningAssessmentMap(group),valid=new Set(CLEANING_CRITERIA.map(item=>item.id));
  assessments[studentId]={criteria:[...new Set(Array.isArray(value?.criteria)?value.criteria.filter(key=>valid.has(key)):[])],unavailable:Boolean(value?.unavailable)};
  group.assessments=assessments;
}
function cleaningCriteriaScore(count){return count>=4?105:Math.max(0,Math.min(3,Number(count)||0))*30;}
function cleaningStudentRawScore(entry){return entry?.legacyRating?cleaningRatingValue(entry.legacyRating)*100:cleaningCriteriaScore(entry?.criteria?.length||0);}
function cleaningAssessmentLabel(entry){if(entry?.unavailable)return'事情でできなかった';const count=entry?.criteria?.length||0;return count+'/4項目・'+Math.min(100,cleaningCriteriaScore(count))+'点';}
function cleaningAssessmentMark(entry){return entry?.unavailable?'事情':String(entry?.criteria?.length||0);}
function cleaningCriteriaGuideHtml(){return'<section class="cleaning-criteria-guide" aria-label="掃除で確認する4項目"><div><strong>4つの確認項目</strong><span>児童カードの①〜④と対応しています。</span></div><ol>'+CLEANING_CRITERIA.map((item,index)=>'<li><b>'+(index+1)+'</b><span>'+esc(item.label)+'</span></li>').join('')+'</ol></section>';}
function cleaningAssessmentCardHtml({studentId,name,entry,cardClass,criterionAttribute,studentAttribute,unavailableAttribute,leader=false,compactCriteria=false}){
  const selected=new Set(entry.criteria),status=entry.unavailable?'unavailable':'count-'+selected.size;
  return'<article class="'+cardClass+' assessment-'+status+'"><div class="cleaning-assessment-name"><strong>'+esc(name||'児童')+'</strong><b>'+esc(cleaningAssessmentMark(entry))+'</b><span>'+esc(cleaningAssessmentLabel(entry))+(leader?'・班員に確認':'')+'</span></div><div class="cleaning-criteria-list">'+CLEANING_CRITERIA.map((item,index)=>'<button type="button" '+criterionAttribute+'="'+item.id+'" '+studentAttribute+'="'+studentId+'" aria-pressed="'+(!entry.unavailable&&selected.has(item.id))+'" aria-label="'+esc((index+1)+' '+item.label)+'"'+(compactCriteria?' title="'+esc(item.label)+'"':'')+'><b>'+(index+1)+'</b><span>'+esc(compactCriteria?'できた':item.label)+'</span></button>').join('')+'</div><button type="button" class="cleaning-unavailable" '+unavailableAttribute+'="'+studentId+'" aria-pressed="'+entry.unavailable+'">事情でできなかった</button></article>';
}
function cleaningControlForStudent(attribute,studentId,root=document){return [...root.querySelectorAll('['+attribute+']')].find(node=>node.getAttribute(attribute)===studentId)||null;}
function replaceCleaningAssessmentCard({studentId,name,entry,cardClass,criterionAttribute,studentAttribute,unavailableAttribute,leader=false,compactCriteria=false,focusAttribute='',focusValue='',root=document}){
  const control=cleaningControlForStudent(studentAttribute,studentId,root),card=control?.closest('.'+cardClass);if(!card)return null;
  card.outerHTML=cleaningAssessmentCardHtml({studentId,name,entry,cardClass,criterionAttribute,studentAttribute,unavailableAttribute,leader,compactCriteria});
  const replacement=cleaningControlForStudent(studentAttribute,studentId,root)?.closest('.'+cardClass);if(focusAttribute&&replacement){const focusTarget=[...replacement.querySelectorAll('['+focusAttribute+']')].find(node=>node.getAttribute(focusAttribute)===focusValue);focusTarget?.focus({preventScroll:true});}
  return replacement;
}
function cleaningFinalized(record){return Boolean(record&&['announcement','announced'].includes(record.phase));}
function cleaningStudentRatingInRecord(record,studentId){const group=(record?.groups||[]).find(item=>(item.memberIds||[]).includes(studentId));if(!group||(group.absentIds||[]).includes(studentId))return null;return cleaningRatingMap(group)[studentId]||null;}
function cleaningStudentUnavailableInRecord(record,studentId){const group=(record?.groups||[]).find(item=>(item.memberIds||[]).includes(studentId));if(!group||(group.absentIds||[]).includes(studentId))return false;return cleaningStudentAssessment(group,studentId).unavailable;}
function cleaningDashStreakBefore(record,studentId,history=[]){
  let streak=0;
  for(const item of history.filter(item=>cleaningFinalized(item)&&item.id!==record?.id&&item.date<record.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)))){
    const group=(item.groups||[]).find(group=>(group.memberIds||[]).includes(studentId));
    if(!group||(group.absentIds||[]).includes(studentId))continue;
    streak=cleaningStudentUnavailableInRecord(item,studentId)?streak+1:0;
  }
  return streak;
}
function cleaningDashWeight(streak){return streak<=1?null:Math.max(0,Math.round((1-0.2*(streak-1))*10)/10);}
function cleaningRatingMark(rating){return rating===CLEANING_RATING_DOUBLE?'◎':rating===CLEANING_RATING_CIRCLE?'○':rating===CLEANING_RATING_TRIANGLE?'△':rating===CLEANING_RATING_DASH?'－':'—';}
function cleaningStudentDayKey(record,studentId){return String(record?.id||record?.date||'')+'|'+studentId;}
function cleaningHistoryModel(history=[]){
  const days=new Map(),streaks=new Map(),ordered=[...history].filter(cleaningFinalized).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id||'').localeCompare(String(b.id||'')));
  for(const record of ordered)for(const group of record.groups||[]){const absent=new Set(group.absentIds||[]);for(const studentId of group.memberIds||[]){const key=cleaningStudentDayKey(record,studentId);if(absent.has(studentId)){days.set(key,{status:'absent',target:0,points:0,criteriaCount:null,entry:null});continue;}const entry=cleaningStudentAssessment(group,studentId);if(entry.unavailable){const streak=(streaks.get(studentId)||0)+1,weight=cleaningDashWeight(streak);streaks.set(studentId,streak);days.set(key,{status:'unavailable',target:weight===null?0:1,points:weight===null?0:weight*100,criteriaCount:null,entry,streak,weight});continue;}streaks.set(studentId,0);days.set(key,{status:'assessed',target:1,points:cleaningStudentRawScore(entry),criteriaCount:entry.legacyRating?null:Math.min(4,entry.criteria.length),entry});}}
  return days;
}
function cleaningStudentDayResult(record,studentId,model){
  if(model?.has(cleaningStudentDayKey(record,studentId)))return model.get(cleaningStudentDayKey(record,studentId));
  const group=(record?.groups||[]).find(item=>(item.memberIds||[]).includes(studentId));if(!group)return null;if((group.absentIds||[]).includes(studentId))return{status:'absent',target:0,points:0,criteriaCount:null,entry:null};const entry=cleaningStudentAssessment(group,studentId);if(entry.unavailable)return{status:'unavailable',target:0,points:0,criteriaCount:null,entry,streak:1,weight:null};return{status:'assessed',target:1,points:cleaningStudentRawScore(entry),criteriaCount:entry.legacyRating?null:Math.min(4,entry.criteria.length),entry};
}
function cleaningScore(record,history=[],historyModel=null){
  if(!record||!['announcement','announced'].includes(record.phase))return null;
  const model=historyModel||cleaningHistoryModel([...history.filter(item=>item.id!==record.id),record]);
  let target=0,rawPoints=0,circle=0,double=0,triangle=0,unavailable=0,unavailableExcluded=0;const criteriaCounts=[0,0,0,0,0];
  for(const group of record.groups||[]){
    for(const id of group.memberIds||[]){const day=cleaningStudentDayResult(record,id,model);if(!day||day.status==='absent')continue;const entry=day.entry;if(day.status==='unavailable'){unavailable+=1;if(!day.target){unavailableExcluded+=1;continue;}target+=day.target;rawPoints+=day.points;continue;}target+=day.target;rawPoints+=day.points;if(entry.legacyRating===CLEANING_RATING_DOUBLE)double+=1;if(entry.legacyRating===CLEANING_RATING_CIRCLE)circle+=1;if(entry.legacyRating===CLEANING_RATING_TRIANGLE)triangle+=1;if(day.criteriaCount!==null)criteriaCounts[day.criteriaCount]+=1;}
  }
  const override=record.teacherScoreOverride===''||record.teacherScoreOverride===null||record.teacherScoreOverride===undefined?null:Math.max(0,Math.min(100,Math.round(Number(record.teacherScoreOverride)||0)));
  if(!target)return override===null?null:{rawPoints,target,circle,double,triangle,dash:unavailable,dashExcluded:unavailableExcluded,unavailable,unavailableExcluded,criteriaCounts,rawScore:null,adjustment:0,teacherOverride:override,score:override};
  const rawScore=Math.round(rawPoints/target),adjustment=Math.max(-30,Math.min(30,Number(record.scoreAdjustment)||0)),adjustedScore=Math.max(0,Math.min(100,rawScore+adjustment)),score=override===null?adjustedScore:override;
  return{rawPoints,target,circle,double,triangle,dash:unavailable,dashExcluded:unavailableExcluded,unavailable,unavailableExcluded,criteriaCounts,rawScore,adjustment,teacherOverride:override,score};
}
function cleaningClassScoreSummary(records,history=[],historyModel=null){
  const model=historyModel||cleaningHistoryModel(history),scores=records.map(record=>cleaningScore(record,history,model)).filter(result=>result&&Number.isFinite(result.score)).map(result=>result.score);
  return{days:scores.length,average:scores.length?Math.round(scores.reduce((sum,value)=>sum+value,0)/scores.length):null,scores};
}
function cleaningScoreSummaryHtml(score){
  if(!score)return'<div class="cleaning-score-empty">対象となる記録がありません。</div>';
  const automatic=score.target?'自動計算 '+score.rawScore+'点'+(score.adjustment?'（調整 '+(score.adjustment>0?'+':'')+score.adjustment+'点）':''):'自動計算は対象なし',finalPoint=score.teacherOverride!==null?'先生の最終点 '+score.teacherOverride+'点':'最終点は自動計算';
  return'<div class="cleaning-current-score"><span>クラス最終点</span><strong>'+score.score+'点</strong></div><div class="cleaning-score-detail"><p>'+automatic+'・'+finalPoint+'</p><p>4項目 '+score.criteriaCounts[4]+'人／3項目 '+score.criteriaCounts[3]+'人／2項目 '+score.criteriaCounts[2]+'人／1項目 '+score.criteriaCounts[1]+'人／0項目 '+score.criteriaCounts[0]+'人</p><p>事情でできなかった '+score.unavailable+'人（初回対象外 '+score.unavailableExcluded+'人）</p></div>';
}
async function cleaningConfig(classId){
  return classId?ClassDB.get('records',cleaningConfigId(classId)):null;
}
async function cleaningDaily(classId,date){
  return classId?ClassDB.get('records',cleaningDailyId(classId,date)):null;
}
const cleaningWriteQueues=new Map();
function cleaningHistoryCache(){return typeof state==='undefined'?null:state.cleaningHistoryCache;}
async function updateCleaningDaily(classId,date,change){
  const key=cleaningDailyId(classId,date),previous=cleaningWriteQueues.get(key)||Promise.resolve();
  const current=previous.catch(()=>{}).then(async()=>{
    const record=await cleaningDaily(classId,date);if(!record)return null;
    const changed=await change(record);if(changed===false)return record;
    const saved=await ClassDB.put('records',record);cleaningHistoryCache()?.delete(classId);return saved;
  });
  cleaningWriteQueues.set(key,current);
  try{return await current;}finally{if(cleaningWriteQueues.get(key)===current)cleaningWriteQueues.delete(key);}
}
async function cleaningHistory(classId){
  if(!classId)return[];
  const cached=cleaningHistoryCache()?.get(classId);if(cached)return cached;
  const load=ClassDB.getAllByIndex('records','classId',classId).then(records=>records.filter(item=>item.type===CLEANING_DAILY_TYPE));
  cleaningHistoryCache()?.set(classId,load);try{return await load;}catch(error){cleaningHistoryCache()?.delete(classId);throw error;}
}
async function cleaningRoster(classId){
  // 班設定の「名簿」表示と日々の班入力は、座席順ではなく出席番号順を基準にする。
  return (await rosterForClass(classId,false)).filter(row=>!submissionExempt(row));
}
function cleaningH(tag,attrs,body){
  const a=Object.entries(attrs||{}).map(x=>x[1]===false?'':x[1]===true?' '+x[0]:' '+x[0]+'="'+esc(x[1])+'"').join('');
  return '<'+tag+a+'>'+body+'</'+tag+'>';
}
function cleaningDateNav(date){
  return '<div class="date-nav"><button type="button" class="button" id="cleaning-date-prev">◀</button><strong>'+esc(jpDate(date))+'の掃除</strong><button type="button" class="button" id="cleaning-date-next">▶</button></div>';
}
function cleaningWorkflowHtml(stage='start'){
  const current={start:1,input:2,review:3,announcement:4,announced:4}[stage]||1,steps=['先生が開始','班で入力','先生が確認','結果を発表'];
  return '<ol class="cleaning-workflow" aria-label="掃除の進め方">'+steps.map((label,index)=>'<li class="'+(index+1===current?'current':index+1<current?'complete':'')+'"><b>'+String(index+1)+'</b><span>'+label+'</span></li>').join('')+'</ol>';
}
function cleaningSeatRows(layout,roster){
  const ids=new Set(roster.map(row=>row.student.id)),placed=new Set();
  const cells=(Array.isArray(layout)?layout:[]).map(id=>{if(id&&ids.has(id)){placed.add(id);return id;}return null;});
  return{cells,unplaced:roster.map(row=>row.student.id).filter(id=>!placed.has(id))};
}
async function saveCleaningConfig(config){
  return ClassDB.put('records',Object.assign({},config,{id:cleaningConfigId(config.classId),type:CLEANING_CONFIG_TYPE,yearId:state.year.id,studentId:null,date:today()}));
}
async function createCleaningDaily(config,date){
  const roster=await cleaningRoster(config.classId),ids=new Set(roster.map(x=>x.student.id)),attendance=await attendanceRecords(config.classId,date),absentIds=new Set(attendance.map(item=>item.studentId));
  const groups=(config.groups||[]).map(g=>({id:g.id,name:g.name,color:g.color,memberIds:(g.memberIds||[]).filter(id=>ids.has(id)),cleaningLeaderId:g.cleaningLeaderId||null,groupLeaderId:g.groupLeaderId||null,representativeId:g.cleaningLeaderId||g.groupLeaderId||null,assessments:{},ratings:{},selectedIds:[],absentIds:(g.memberIds||[]).filter(id=>absentIds.has(id)),confirmed:false})).filter(g=>g.memberIds.length);
  const assigned=new Set(groups.flatMap(g=>g.memberIds));
  if(!groups.length||roster.some(row=>!assigned.has(row.student.id))){showToast('掃除班の設定を確認してください');return null;}
  const saved=await ClassDB.put('records',{id:cleaningDailyId(config.classId,date),type:CLEANING_DAILY_TYPE,yearId:state.year.id,classId:config.classId,studentId:null,date,phase:'input',groups,startedAt:ClassDB.now()});cleaningHistoryCache()?.delete(config.classId);return saved;
}
async function renderCleaning(){
  if(!teacherActive()){renderPupil('cleaning');return;}
  state.route='teacher-cleaning';state.activeTool='cleaning';applyClassTheme(selectedClass());
  const classItem=selectedClass(),config=await cleaningConfig(classItem.id);
  if(!config){renderCleaningSetup();return;}
  const date=state.toolDraft.cleaningDate||today(),daily=await cleaningDaily(classItem.id,date);
  if(daily&&state.toolDraft.cleaningTeacherEdit?.id===daily.id){await renderCleaningTeacherEdit(daily,state.toolDraft.cleaningTeacherEdit,Boolean(state.toolDraft.cleaningTeacherEditDirty));return;}
  let body='';
  if(!daily){
    body='<section class="panel"><div class="toolbar-line"><div><h2>今日の掃除</h2><p class="muted">先生が開始してから、班の代表が順に入力します。</p></div><button type="button" class="button" id="cleaning-open-setup">班を設定</button></div>'+cleaningWorkflowHtml('start')+'<p class="cleaning-status-card">'+config.groups.length+'班を設定済みです。</p><div class="button-row section"><button type="button" class="button primary" id="cleaning-start">今日の入力を開始</button></div></section>';
  }else{
    const done=daily.groups.filter(g=>g.confirmed).length,score=cleaningScore(daily,await cleaningHistory(classItem.id));
    const groupRows=daily.groups.map(g=>'<li><i style="background:'+esc(g.color)+'"></i><strong>'+esc(g.name)+'</strong><span>'+ (g.confirmed?'確認済み':'入力中')+'</span></li>').join('');
    const scoreText=cleaningScoreSummaryHtml(score);
    let actions='<button type="button" class="button primary" id="cleaning-open-pupil">児童用の掃除入力を開く</button>';
    if(daily.phase==='input'&&done===daily.groups.length)actions+='<button type="button" class="button primary" id="cleaning-finalize">結果を確定する</button>';
    if(daily.phase==='announcement')actions='<button type="button" class="button" id="cleaning-edit">先生が修正する</button><button type="button" class="button primary" id="cleaning-open-pupil">発表画面を開く</button>';
    if(daily.phase==='announced')actions='<button type="button" class="button" id="cleaning-edit">先生が修正する</button><button type="button" class="button primary" id="cleaning-reannounce">演出をもう一度許可</button>';
    body='<section class="panel"><div class="toolbar-line"><div><h2>今日の掃除</h2><p class="muted">'+(daily.phase==='input'?'全ての班が確定すると、結果を確定できます。':daily.phase==='announcement'?'日直にiPadを渡して発表します。':'今日の結果は発表済みです。')+'</p></div><button type="button" class="button" id="cleaning-open-setup">班を設定</button></div>'+cleaningWorkflowHtml(daily.phase==='input'?'input':daily.phase)+'<div class="cleaning-result-summary">'+scoreText+'</div><ul class="cleaning-progress">'+groupRows+'</ul><div class="button-row section">'+actions+'</div></section>';
  }
  app.innerHTML=teacherToolShell('掃除の記録',cleaningDateNav(date)+body+await cleaningSummary(classItem.id));
  wireToolHome();
  document.getElementById('cleaning-date-prev').onclick=()=>{state.toolDraft.cleaningDate=moveDate(date,-1);renderCleaning();};
  document.getElementById('cleaning-date-next').onclick=()=>{state.toolDraft.cleaningDate=moveDate(date,1);renderCleaning();};
  document.getElementById('cleaning-open-setup').onclick=renderCleaningSetup;
  document.getElementById('cleaning-start')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{await createCleaningDaily(config,date);renderCleaning();}));
  document.getElementById('cleaning-open-pupil')?.addEventListener('click',()=>renderPupil('cleaning'));
  document.getElementById('cleaning-finalize')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{const saved=await updateCleaningDaily(classItem.id,date,current=>{if(current.phase!=='input'||!current.groups.every(group=>group.confirmed))return false;current.phase='announcement';current.teacherConfirmedAt=ClassDB.now();});if(saved?.phase!=='announcement')return;showToast('結果を確定しました');renderCleaning();}));
  document.getElementById('cleaning-edit')?.addEventListener('click',()=>renderCleaningTeacherEdit(daily));
  document.getElementById('cleaning-reannounce')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{const saved=await updateCleaningDaily(classItem.id,date,current=>{if(current.phase!=='announced')return false;current.phase='announcement';current.announcementReapprovedAt=ClassDB.now();});if(saved?.phase!=='announcement')return;showToast('発表をもう一度許可しました');renderCleaning();}));
}
async function renderCleaningSetup(){
  if(!teacherActive()){renderPupil();return;}
  state.route='teacher-cleaning';state.activeTool='cleaning';
  const classItem=selectedClass(),roster=await cleaningRoster(classItem.id);
  let config=await cleaningConfig(classItem.id);
  if(!config)config={yearId:state.year.id,classId:classItem.id,groups:Array.from({length:8},(_,i)=>({id:ClassDB.uid('cleaningGroup'),name:(i+1)+'班',color:cleaningPalette(i),memberIds:[],cleaningLeaderId:null,groupLeaderId:null}))};
  const groupId=config.groups.some(g=>g.id===state.toolDraft.cleaningSetupGroupId)?state.toolDraft.cleaningSetupGroupId:config.groups[0].id;
  state.toolDraft.cleaningSetupGroupId=groupId;
  const group=config.groups.find(g=>g.id===groupId),assigned=new Map(config.groups.flatMap(g=>g.memberIds.map(id=>[id,g.id]))),setupView=state.toolDraft.cleaningSetupView==='roster'?'roster':'seats';
  const options=(selected)=>'<option value="">未設定</option>'+roster.filter(row=>group.memberIds.includes(row.student.id)).map(row=>'<option value="'+row.student.id+'" '+(selected===row.student.id?'selected':'')+'>'+esc(row.student.name)+'</option>').join('');
  const tabs=config.groups.map(g=>'<button type="button" data-cleaning-group="'+g.id+'" aria-pressed="'+(g.id===groupId)+'" style="--cleaning-color:'+esc(g.color)+'">'+esc(g.name)+'<small>'+g.memberIds.length+'人</small></button>').join('');
  const studentButton=row=>{const here=assigned.get(row.student.id)===groupId;return '<button type="button" class="cleaning-assignment '+(here?'selected':'')+'" data-cleaning-student="'+row.student.id+'" aria-pressed="'+here+'"><strong>'+esc(row.student.name)+'</strong><span>'+ (here?'この班':assigned.has(row.student.id)?'他の班':'未設定')+'</span></button>';};
  const byId=new Map(roster.map(row=>[row.student.id,row])),seatLayout=Array.isArray(classItem.activeSeatLayout)?classItem.activeSeatLayout:[],hasSeatLayout=seatLayout.some(id=>byId.has(id)),seatCols=Math.max(1,Number(classItem.activeSeatCols)||6);
  // 座席表では空席・掃除対象外児童を詰めず、配列上の位置を維持する。
  // 空セルは見た目を表示せず、CSSグリッドの1セル分だけを占める。
  const seatRows=cleaningSeatRows(seatLayout,roster),seatStudents=seatRows.cells.map(id=>id?studentButton(byId.get(id)):'<span class="cleaning-seat-placeholder" aria-hidden="true"></span>');
  const unplaced=seatRows.unplaced.map(id=>studentButton(byId.get(id)));
  const students=setupView==='seats'&&hasSeatLayout?seatStudents.join('')+unplaced.join(''):roster.map(studentButton).join(''),studentGridClass=setupView==='seats'&&hasSeatLayout?'cleaning-assignment-grid cleaning-seat-grid':'cleaning-assignment-grid',studentGridStyle=setupView==='seats'&&hasSeatLayout?' style="grid-template-columns:repeat('+seatCols+',minmax(0,1fr))"':'';
  app.innerHTML=teacherToolShell('掃除班の設定','<section class="panel"><div class="toolbar-line"><div><h2>掃除班を設定</h2><p class="muted">児童名を押すと、選んだ班へ移せます。班の代表は通常は掃除担当、欠席時は班長です。</p></div><button type="button" class="button" id="cleaning-setup-back">掃除の記録へ</button></div><div class="cleaning-group-tabs">'+tabs+'<button type="button" class="button" id="cleaning-add-group">＋ 班を追加</button></div><div class="cleaning-setup-grid"><section><h3>'+esc(group.name)+'</h3><div class="form-grid"><label class="field">班の名前<input class="input" id="cleaning-group-name" value="'+esc(group.name)+'"></label><label class="field">掃除担当<select class="select" id="cleaning-cleaner">'+options(group.cleaningLeaderId)+'</select></label><label class="field">班長<select class="select" id="cleaning-leader">'+options(group.groupLeaderId)+'</select></label></div><div class="button-row section"><button type="button" class="button" id="cleaning-remove-group" '+(config.groups.length<=1?'disabled':'')+'>この班を削除</button><button type="button" class="button primary" id="cleaning-save-config">班の設定を保存</button></div></section><section><div class="toolbar-line"><h3>児童を選ぶ</h3><div class="order-toggle"><button type="button" data-cleaning-setup-view="seats" aria-pressed="'+(setupView==='seats')+'">座席表</button><button type="button" data-cleaning-setup-view="roster" aria-pressed="'+(setupView==='roster')+'">名簿</button></div></div><div class="'+studentGridClass+'"'+studentGridStyle+'>'+students+'</div></section></div></section>');
  wireToolHome();
  document.getElementById('cleaning-setup-back').onclick=renderCleaning;
  document.querySelectorAll('[data-cleaning-setup-view]').forEach(b=>b.onclick=()=>{state.toolDraft.cleaningSetupView=b.dataset.cleaningSetupView;renderCleaningSetup();});
  document.querySelectorAll('[data-cleaning-group]').forEach(b=>b.onclick=()=>{state.toolDraft.cleaningSetupGroupId=b.dataset.cleaningGroup;renderCleaningSetup();});
  document.getElementById('cleaning-add-group').onclick=event=>runOnce(event.currentTarget,async()=>{config.groups.push({id:ClassDB.uid('cleaningGroup'),name:(config.groups.length+1)+'班',color:cleaningPalette(config.groups.length),memberIds:[],cleaningLeaderId:null,groupLeaderId:null});state.toolDraft.cleaningSetupGroupId=config.groups.at(-1).id;await saveCleaningConfig(config);renderCleaningSetup();});
  document.getElementById('cleaning-remove-group').onclick=event=>runOnce(event.currentTarget,async()=>{config.groups=config.groups.filter(g=>g.id!==groupId);state.toolDraft.cleaningSetupGroupId=config.groups[0].id;await saveCleaningConfig(config);renderCleaningSetup();});
  document.querySelectorAll('[data-cleaning-student]').forEach(b=>b.onclick=event=>runOnce(event.currentTarget,async()=>{const id=b.dataset.cleaningStudent;config.groups.forEach(g=>g.memberIds=g.memberIds.filter(x=>x!==id));if(!b.classList.contains('selected'))group.memberIds.push(id);await saveCleaningConfig(config);renderCleaningSetup();}));
  document.getElementById('cleaning-save-config').onclick=event=>runOnce(event.currentTarget,async()=>{group.name=document.getElementById('cleaning-group-name').value.trim()||group.name;group.cleaningLeaderId=document.getElementById('cleaning-cleaner').value||null;group.groupLeaderId=document.getElementById('cleaning-leader').value||null;await saveCleaningConfig(config);showToast('掃除班を保存しました');renderCleaning();});
}
async function renderPupilCleaning(){
  const record=await cleaningDaily(selectedClass().id,today());
  if(!record||record.phase==='review'){document.getElementById('pupil-content').innerHTML='<section class="panel pupil-cleaning-empty"><h1>掃除の記録</h1><p>先生が入力を始めると、ここで班の代表が記録できます。</p></section>';return;}
  if(record.phase==='input'){renderPupilCleaningInput(record);return;}
  const score=cleaningScore(record,await cleaningHistory(record.classId)),announcing=record.phase==='announcement';
  document.getElementById('pupil-content').innerHTML='<section class="pupil-cleaning-result '+(announcing?'':'shown')+'"><p>きょうのクラスのそうじ</p><h1>'+ (announcing?'発表のじゅんびができました':'きょうのけっか')+'</h1>'+ (announcing?'<button type="button" class="button primary cleaning-announce-button" id="cleaning-announce">結果を発表</button>':'<strong class="cleaning-big-score">'+(score?score.score:'--')+'点'+(score&&score.score===100?'！':'')+'</strong><p>'+(score&&score.score===100?'みんなで100点！':'明日もみんなで取り組もう。')+'</p>')+'</section>';
  document.getElementById('cleaning-announce')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{const classId=selectedClass().id,date=today(),saved=await updateCleaningDaily(classId,date,current=>{if(current.phase!=='announcement')return false;current.phase='announced';current.announcedAt=ClassDB.now();});if(saved?.phase==='announced')renderPupilCleaning();}));
}
async function renderPupilCleaningInput(record){
  const roster=await cleaningRoster(record.classId),names=new Map(roster.map(row=>[row.student.id,row.student.name]));
  const pending=record.groups.filter(g=>!g.confirmed),groupId=pending.some(g=>g.id===state.toolDraft.cleaningPupilGroupId)?state.toolDraft.cleaningPupilGroupId:pending[0]?.id;
  if(!groupId){document.getElementById('pupil-content').innerHTML='<section class="pupil-cleaning-empty"><h1>入力が終わりました</h1><p>iPadを先生に渡してください。</p></section>';return;}
  state.toolDraft.cleaningPupilGroupId=groupId;const group=record.groups.find(g=>g.id===groupId);
  const visibleIds=group.memberIds.filter(id=>!(group.absentIds||[]).includes(id));
  const cards=visibleIds.map(id=>cleaningAssessmentCardHtml({studentId:id,name:names.get(id),entry:cleaningStudentAssessment(group,id),cardClass:'cleaning-pupil-card',criterionAttribute:'data-cleaning-criterion',studentAttribute:'data-cleaning-student',unavailableAttribute:'data-cleaning-unavailable',leader:id===group.representativeId})).join('');
  document.getElementById('pupil-content').innerHTML='<section class="panel pupil-cleaning-input"><div class="toolbar-line"><div><p class="cleaning-kicker">掃除の記録</p><h1>'+esc(group.name)+'の班の代表</h1><p>できていた項目を、掃除の流れに沿って選んでください。</p></div><span class="cleaning-progress-badge">'+record.groups.filter(g=>g.confirmed).length+'/'+record.groups.length+'班</span></div><div class="cleaning-score-guide"><strong>3項目で90点</strong><span>4項目できたときは、画面には100点と表示します。</span></div><div class="cleaning-pupil-grid">'+(cards||'<p class="muted">欠席者を除く入力対象者はいません。</p>')+'</div><p class="muted small">給食当番などで掃除ができなかった人は「事情でできなかった」を選びます。確定するまでは何度でも直せます。</p><div class="cleaning-confirm-area"><p>確定後の修正は先生に伝えてください。</p><button type="button" class="button primary" id="cleaning-group-confirm">この班を確定</button></div></section>';
  const pupilGrid=document.querySelector('.cleaning-pupil-grid');pupilGrid.onclick=async event=>{const button=event.target.closest('[data-cleaning-criterion],[data-cleaning-unavailable]');if(!button||!pupilGrid.contains(button))return;const studentId=button.dataset.cleaningStudent||button.dataset.cleaningUnavailable,criterionId=button.dataset.cleaningCriterion||'',unavailable=Boolean(button.dataset.cleaningUnavailable);const current=await updateCleaningDaily(record.classId,record.date,daily=>{const target=daily.groups.find(g=>g.id===groupId);if(!target||target.confirmed)return false;const entry=cleaningStudentAssessment(target,studentId);if(unavailable)setCleaningStudentAssessment(target,studentId,{criteria:[],unavailable:!entry.unavailable});else{const criteria=new Set(entry.criteria);criteria.has(criterionId)?criteria.delete(criterionId):criteria.add(criterionId);setCleaningStudentAssessment(target,studentId,{criteria:[...criteria],unavailable:false});}});if(!current)return;const target=current.groups.find(item=>item.id===groupId),entry=cleaningStudentAssessment(target,studentId);replaceCleaningAssessmentCard({studentId,name:names.get(studentId),entry,cardClass:'cleaning-pupil-card',criterionAttribute:'data-cleaning-criterion',studentAttribute:'data-cleaning-student',unavailableAttribute:'data-cleaning-unavailable',leader:studentId===target.representativeId,focusAttribute:unavailable?'data-cleaning-unavailable':'data-cleaning-criterion',focusValue:unavailable?studentId:criterionId,root:pupilGrid});};
  document.getElementById('cleaning-group-confirm').onclick=event=>runOnce(event.currentTarget,async()=>{const current=await updateCleaningDaily(record.classId,record.date,daily=>{const target=daily.groups.find(g=>g.id===groupId);if(!target||target.confirmed)return false;target.confirmed=true;target.confirmedAt=ClassDB.now();});if(!current)return;state.toolDraft.cleaningPupilGroupId=null;showToast(current.groups.every(g=>g.confirmed)?'全ての班の入力が終わりました。先生に渡してください':'次の班へ進みます');renderPupilCleaning();});
}
function wireCleaningTeacherGroupFolders(working){
  const grid=document.querySelector('.cleaning-teacher-grid');
  if(!grid)return;
  const cards=[...grid.children].filter(node=>node.matches('.cleaning-teacher-card'));
  if(!cards.length)return;
  const groups=new Map((working.groups||[]).map(group=>[group.id,group]));
  const folders=new Map();
  cards.forEach(card=>card.remove());
  cards.forEach(card=>{
    const studentId=card.querySelector('[data-cleaning-edit-student],[data-cleaning-edit-unavailable]')?.dataset.cleaningEditStudent||card.querySelector('[data-cleaning-edit-unavailable]')?.dataset.cleaningEditUnavailable;
    const group=(working.groups||[]).find(item=>(item.memberIds||[]).includes(studentId));
    if(!group)return;
    let folder=folders.get(group.id);
    if(!folder){folder=document.createElement('details');folder.className='cleaning-teacher-group-folder';folder.open=true;folder.innerHTML='<summary><span>'+esc(group.name)+'</span><small></small></summary><div class="cleaning-teacher-group-cards"></div>';folders.set(group.id,folder);grid.append(folder);}
    folder.querySelector('.cleaning-teacher-group-cards').append(card);
  });
  folders.forEach(folder=>{const count=folder.querySelectorAll('.cleaning-teacher-card').length;folder.querySelector('summary small').textContent=count+'人';});
}
async function renderCleaningTeacherEdit(daily,draft=null,dirty=false){
  const working=JSON.parse(JSON.stringify(draft||daily)),roster=await cleaningRoster(daily.classId),absent=new Set(working.groups.flatMap(g=>g.absentIds||[])),history=await cleaningHistory(daily.classId),groupFilter=state.toolDraft.cleaningTeacherGroupFilter||'all',visibleRoster=groupFilter==='all'?roster:roster.filter(row=>working.groups.find(group=>group.id===groupFilter)?.memberIds?.includes(row.student.id));
  state.toolDraft.cleaningTeacherEdit=working;
  state.toolDraft.cleaningTeacherEditDirty=Boolean(dirty);
  const cards=visibleRoster.filter(row=>!absent.has(row.student.id)).map(row=>{const group=working.groups.find(item=>(item.memberIds||[]).includes(row.student.id));return cleaningAssessmentCardHtml({studentId:row.student.id,name:row.student.name,entry:cleaningStudentAssessment(group,row.student.id),cardClass:'cleaning-teacher-card',criterionAttribute:'data-cleaning-edit-criterion',studentAttribute:'data-cleaning-edit-student',unavailableAttribute:'data-cleaning-edit-unavailable',compactCriteria:true});}).join(''),groupOptions=working.groups.map(group=>'<option value="'+esc(group.id)+'" '+(group.id===groupFilter?'selected':'')+'>'+esc(group.name)+'（'+(group.memberIds||[]).length+'人）</option>').join('');
  const preview=cleaningScore(working,history),override=working.teacherScoreOverride===null||working.teacherScoreOverride===undefined?'':working.teacherScoreOverride;
  app.innerHTML=teacherToolShell('掃除の記録を確認','<form id="cleaning-edit-form"><section class="panel"><p class="screen-context-title">'+esc(jpDate(daily.date))+'の入力を確認</p><p class="muted">項目を修正してから、必要に応じてクラス得点を調整できます。欠席者は評価対象から外れています。</p><div class="cleaning-score-guide"><strong>3項目で90点・4項目で105点</strong><span>児童への発表は100点を上限にします。</span></div>'+cleaningCriteriaGuideHtml()+'<div class="operation-save-bar cleaning-save-bar"><label class="cleaning-group-filter">表示する班<select class="select" id="cleaning-edit-group-filter"><option value="all">全員（'+roster.length+'人）</option>'+groupOptions+'</select></label>'+saveOperationStatusHtml('cleaning-edit-save-status',dirty?'dirty':'saved')+'<div class="button-row"><button type="button" class="button" id="cleaning-edit-cancel">戻る</button><button type="button" class="button primary" id="cleaning-edit-save">修正を保存</button></div></div><div class="cleaning-teacher-grid">'+(cards||'<p class="muted">この班に、欠席者を除く入力対象者はいません。</p>')+'</div><section class="cleaning-score-controls"><div><h3>クラス得点の調整</h3><p>自動計算は <strong id="cleaning-auto-score">'+(preview&&preview.target?preview.rawScore+'点':'対象なし')+'</strong> です。</p></div><label>自動計算への加減<input class="input" type="number" id="cleaning-score-adjustment" min="-30" max="30" step="1" value="'+(Number(working.scoreAdjustment)||0)+'"><span>－30～＋30点</span></label><label>先生の最終点<input class="input" type="number" id="cleaning-score-override" min="0" max="100" step="1" value="'+esc(override)+'" placeholder="自動"><span>空欄なら自動計算を使用</span></label></section></section></form>');
  wireToolHome();
  wireCleaningTeacherGroupFolders(working);
  const editForm=document.getElementById('cleaning-edit-form');
  if(dirty)markFormDraftDirty(editForm);
  document.getElementById('cleaning-edit-group-filter').onchange=event=>{state.toolDraft.cleaningTeacherGroupFilter=event.target.value;renderCleaningTeacherEdit(daily,working,dirty);};
  const teacherGrid=document.querySelector('.cleaning-teacher-grid'),refreshPreview=()=>{const next=cleaningScore(working,history);document.getElementById('cleaning-auto-score').textContent=next&&next.target?next.rawScore+'点':'対象なし';};
  const rememberDraft=()=>{state.toolDraft.cleaningTeacherEditDirty=true;persistRecoverableCleaningDraft(working);markFormDraftDirty(editForm);setSaveOperationStatus('cleaning-edit-save-status','dirty');};
  teacherGrid.onclick=event=>{const button=event.target.closest('[data-cleaning-edit-criterion],[data-cleaning-edit-unavailable]');if(!button||!teacherGrid.contains(button))return;const studentId=button.dataset.cleaningEditStudent||button.dataset.cleaningEditUnavailable,criterionId=button.dataset.cleaningEditCriterion||'',unavailable=Boolean(button.dataset.cleaningEditUnavailable),group=working.groups.find(item=>(item.memberIds||[]).includes(studentId)),entry=cleaningStudentAssessment(group,studentId);if(unavailable)setCleaningStudentAssessment(group,studentId,{criteria:[],unavailable:!entry.unavailable});else{const criteria=new Set(entry.criteria);criteria.has(criterionId)?criteria.delete(criterionId):criteria.add(criterionId);setCleaningStudentAssessment(group,studentId,{criteria:[...criteria],unavailable:false});}rememberDraft();replaceCleaningAssessmentCard({studentId,name:roster.find(row=>row.student.id===studentId)?.student.name,entry:cleaningStudentAssessment(group,studentId),cardClass:'cleaning-teacher-card',criterionAttribute:'data-cleaning-edit-criterion',studentAttribute:'data-cleaning-edit-student',unavailableAttribute:'data-cleaning-edit-unavailable',compactCriteria:true,focusAttribute:unavailable?'data-cleaning-edit-unavailable':'data-cleaning-edit-criterion',focusValue:unavailable?studentId:criterionId,root:teacherGrid});refreshPreview();};
  document.getElementById('cleaning-score-adjustment').oninput=event=>{working.scoreAdjustment=Math.max(-30,Math.min(30,Number(event.target.value)||0));rememberDraft();refreshPreview();};
  document.getElementById('cleaning-score-override').oninput=event=>{working.teacherScoreOverride=event.target.value===''?null:Math.max(0,Math.min(100,Math.round(Number(event.target.value)||0)));rememberDraft();refreshPreview();};
  document.getElementById('cleaning-edit-cancel').onclick=()=>navigateSafely(()=>{clearRecoverableCleaningDraft();state.toolDraft.cleaningTeacherEdit=null;state.toolDraft.cleaningTeacherEditDirty=false;state.toolDraft.cleaningTeacherGroupFilter=null;renderCleaning();});
  document.getElementById('cleaning-edit-save').onclick=event=>runOnce(event.currentTarget,async()=>{setSaveOperationStatus('cleaning-edit-save-status','saving');try{const latest=await updateCleaningDaily(daily.classId,daily.date,current=>{current.groups.forEach(group=>{const edited=working.groups.find(item=>item.id===group.id);if(edited)group.assessments=cleaningAssessmentMap(edited);});current.scoreAdjustment=Math.max(-30,Math.min(30,Number(working.scoreAdjustment)||0));current.teacherScoreOverride=working.teacherScoreOverride===null||working.teacherScoreOverride===undefined?null:Math.max(0,Math.min(100,Math.round(Number(working.teacherScoreOverride)||0)));current.teacherEditedAt=ClassDB.now();});if(!latest)throw new Error('掃除記録の保存対象が見つかりません');completeFormDraft(editForm);setSaveOperationStatus('cleaning-edit-save-status','saved');clearRecoverableCleaningDraft();state.toolDraft.cleaningTeacherEdit=null;state.toolDraft.cleaningTeacherEditDirty=false;state.toolDraft.cleaningTeacherGroupFilter=null;showToast('修正した項目と点数を保存しました');renderCleaning();}catch(error){setSaveOperationStatus('cleaning-edit-save-status','failed');persistRecoverableCleaningDraft(working);throw error;}});
}
async function cleaningSummary(classId){
  const history=await cleaningHistory(classId),model=cleaningHistoryModel(history),items=history.filter(r=>['announcement','announced'].includes(r.phase)&&r.date>=currentWeekStart()&&r.date<=moveDate(currentWeekStart(),6)),totals=new Map(),days=new Map();
  items.forEach(r=>r.groups.forEach(g=>g.memberIds.forEach(id=>{const day=cleaningStudentDayResult(r,id,model);if(!day?.target)return;totals.set(id,(totals.get(id)||0)+day.points);days.set(id,(days.get(id)||0)+day.target);}))); 
  const roster=await cleaningRoster(classId),classResult=cleaningClassScoreSummary(items,history,model);
  return '<section class="panel cleaning-week-summary"><h2>今週の掃除の記録</h2><p class="cleaning-class-score"><strong>今週のクラス最終点：</strong>'+(classResult.average===null?'対象なし':Math.min(100,classResult.average)+'点（'+classResult.days+'日）')+'</p><p class="muted">3項目で90点、4項目で105点として計算します。事情でできなかった日は、初回を対象外とし、連続時は80・60・40・20・0点として先生用集計へ反映します。先生が最終点を指定した日は、その点をクラス最終点へ反映します。勤労奉仕や責任感を考える補助資料として使い、点数だけで評価は決めません。</p><div class="cleaning-week-list">'+roster.map(row=>{const count=days.get(row.student.id)||0,average=count?Math.round((totals.get(row.student.id)||0)/count):null;return'<span><strong>'+esc(row.student.name)+'</strong> '+(average===null?'対象なし':Math.min(100,average)+'点（'+count+'日）')+'</span>';}).join('')+'</div></section>';
}
