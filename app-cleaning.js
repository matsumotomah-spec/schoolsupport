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
function cleaningScore(record,history=[]){
  if(!record||!['announcement','announced'].includes(record.phase))return null;
  let target=0,rawPoints=0,circle=0,double=0,triangle=0,unavailable=0,unavailableExcluded=0;const criteriaCounts=[0,0,0,0,0];
  for(const group of record.groups||[]){
    const absent=new Set(group.absentIds||[]);
    for(const id of group.memberIds||[]){if(absent.has(id))continue;const entry=cleaningStudentAssessment(group,id);if(entry.unavailable){unavailable+=1;const weight=cleaningDashWeight(cleaningDashStreakBefore(record,id,history)+1);if(weight===null){unavailableExcluded+=1;continue;}target+=1;rawPoints+=weight*100;continue;}target+=1;rawPoints+=cleaningStudentRawScore(entry);if(entry.legacyRating===CLEANING_RATING_DOUBLE)double+=1;if(entry.legacyRating===CLEANING_RATING_CIRCLE)circle+=1;if(entry.legacyRating===CLEANING_RATING_TRIANGLE)triangle+=1;if(!entry.legacyRating)criteriaCounts[Math.min(4,entry.criteria.length)]+=1;}
  }
  if(!target)return null;
  const rawScore=Math.round(rawPoints/target),adjustment=Math.max(-30,Math.min(30,Number(record.scoreAdjustment)||0)),adjustedScore=Math.max(0,Math.min(100,rawScore+adjustment)),override=record.teacherScoreOverride===''||record.teacherScoreOverride===null||record.teacherScoreOverride===undefined?null:Math.max(0,Math.min(100,Math.round(Number(record.teacherScoreOverride)||0))),score=override===null?adjustedScore:override;
  return{rawPoints,target,circle,double,triangle,dash:unavailable,dashExcluded:unavailableExcluded,unavailable,unavailableExcluded,criteriaCounts,rawScore,adjustment,teacherOverride:override,score};
}
async function cleaningConfig(classId){
  return classId?ClassDB.get('records',cleaningConfigId(classId)):null;
}
async function cleaningDaily(classId,date){
  return classId?ClassDB.get('records',cleaningDailyId(classId,date)):null;
}
async function cleaningHistory(classId){return classId?(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>item.type===CLEANING_DAILY_TYPE):[];}
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
function cleaningSeatRows(layout,roster){
  const ids=new Set(roster.map(row=>row.student.id)),placed=new Set();
  const cells=(Array.isArray(layout)?layout:[]).map(id=>{if(id&&ids.has(id)){placed.add(id);return id;}return null;});
  return{cells,unplaced:roster.map(row=>row.student.id).filter(id=>!placed.has(id))};
}
async function saveCleaningConfig(config){
  return ClassDB.put('records',Object.assign({},config,{id:cleaningConfigId(config.classId),type:CLEANING_CONFIG_TYPE,yearId:state.year.id,studentId:null,date:today()}));
}
async function createCleaningDaily(config,date){
  const roster=await cleaningRoster(config.classId),ids=new Set(roster.map(x=>x.student.id)),dailyStatuses=await dailyRecords(config.classId,date),absentIds=new Set(dailyStatuses.filter(item=>item.status==='absent').map(item=>item.studentId));
  const groups=(config.groups||[]).map(g=>({id:g.id,name:g.name,color:g.color,memberIds:(g.memberIds||[]).filter(id=>ids.has(id)),cleaningLeaderId:g.cleaningLeaderId||null,groupLeaderId:g.groupLeaderId||null,representativeId:g.cleaningLeaderId||g.groupLeaderId||null,assessments:{},ratings:{},selectedIds:[],absentIds:(g.memberIds||[]).filter(id=>absentIds.has(id)),confirmed:false})).filter(g=>g.memberIds.length);
  const assigned=new Set(groups.flatMap(g=>g.memberIds));
  if(!groups.length||roster.some(row=>!assigned.has(row.student.id))){showToast('掃除班の設定を確認してください');return null;}
  return ClassDB.put('records',{id:cleaningDailyId(config.classId,date),type:CLEANING_DAILY_TYPE,yearId:state.year.id,classId:config.classId,studentId:null,date,phase:'input',groups,startedAt:ClassDB.now()});
}
async function renderCleaning(){
  if(!teacherActive()){renderPupil('cleaning');return;}
  state.route='teacher-cleaning';state.activeTool='cleaning';applyClassTheme(selectedClass());
  const classItem=selectedClass(),config=await cleaningConfig(classItem.id);
  if(!config){renderCleaningSetup();return;}
  const date=state.toolDraft.cleaningDate||today(),daily=await cleaningDaily(classItem.id,date);
  let body='';
  if(!daily){
    body='<section class="panel"><div class="toolbar-line"><div><h2>今日の掃除</h2><p class="muted">先生が開始してから、班の代表が順に入力します。</p></div><button type="button" class="button" id="cleaning-open-setup">班を設定</button></div><p class="cleaning-status-card">'+config.groups.length+'班を設定済みです。</p><div class="button-row section"><button type="button" class="button primary" id="cleaning-start">今日の入力を開始</button></div></section>';
  }else{
    const done=daily.groups.filter(g=>g.confirmed).length,score=cleaningScore(daily,await cleaningHistory(classItem.id));
    const groupRows=daily.groups.map(g=>'<li><i style="background:'+esc(g.color)+'"></i><strong>'+esc(g.name)+'</strong><span>'+ (g.confirmed?'確認済み':'入力中')+'</span></li>').join('');
    const scoreText=score?'<strong>'+score.score+'点</strong><span>自動計算 '+score.rawScore+'点'+(score.adjustment?'・調整 '+(score.adjustment>0?'+':'')+score.adjustment+'点':'')+(score.teacherOverride!==null?'・先生の最終点 '+score.teacherOverride+'点':'')+'／4項目 '+score.criteriaCounts[4]+'人・3項目 '+score.criteriaCounts[3]+'人・2項目 '+score.criteriaCounts[2]+'人・1項目 '+score.criteriaCounts[1]+'人・0項目 '+score.criteriaCounts[0]+'人・事情 '+score.unavailable+'人（初回対象外 '+score.unavailableExcluded+'人）</span>':'<span>全班の入力後に点数を計算します。</span>';
    let actions='<button type="button" class="button primary" id="cleaning-open-pupil">児童用の掃除入力を開く</button>';
    if(daily.phase==='input'&&done===daily.groups.length)actions+='<button type="button" class="button primary" id="cleaning-finalize">結果を確定する</button>';
    if(daily.phase==='announcement')actions='<button type="button" class="button" id="cleaning-edit">先生が修正する</button><button type="button" class="button primary" id="cleaning-open-pupil">発表画面を開く</button>';
    if(daily.phase==='announced')actions='<button type="button" class="button" id="cleaning-edit">先生が修正する</button><button type="button" class="button primary" id="cleaning-reannounce">演出をもう一度許可</button>';
    body='<section class="panel"><div class="toolbar-line"><div><h2>今日の掃除</h2><p class="muted">'+(daily.phase==='input'?'全ての班が確定すると、結果を確定できます。':daily.phase==='announcement'?'日直にiPadを渡して発表します。':'今日の結果は発表済みです。')+'</p></div><button type="button" class="button" id="cleaning-open-setup">班を設定</button></div><div class="cleaning-result-summary">'+scoreText+'</div><ul class="cleaning-progress">'+groupRows+'</ul><div class="button-row section">'+actions+'</div></section>';
  }
  app.innerHTML=teacherToolShell('掃除の記録',cleaningDateNav(date)+body+await cleaningSummary(classItem.id));
  wireToolHome();
  document.getElementById('cleaning-date-prev').onclick=()=>{state.toolDraft.cleaningDate=moveDate(date,-1);renderCleaning();};
  document.getElementById('cleaning-date-next').onclick=()=>{state.toolDraft.cleaningDate=moveDate(date,1);renderCleaning();};
  document.getElementById('cleaning-open-setup').onclick=renderCleaningSetup;
  document.getElementById('cleaning-start')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{await createCleaningDaily(config,date);renderCleaning();}));
  document.getElementById('cleaning-open-pupil')?.addEventListener('click',()=>renderPupil('cleaning'));
  document.getElementById('cleaning-finalize')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{const current=await cleaningDaily(classItem.id,date);if(!current||current.phase!=='input'||!current.groups.every(group=>group.confirmed))return;await ClassDB.put('records',Object.assign({},current,{phase:'announcement',teacherConfirmedAt:ClassDB.now()}));showToast('結果を確定しました');renderCleaning();}));
  document.getElementById('cleaning-edit')?.addEventListener('click',()=>renderCleaningTeacherEdit(daily));
  document.getElementById('cleaning-reannounce')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{const current=await cleaningDaily(classItem.id,date);if(!current||current.phase!=='announced')return;await ClassDB.put('records',Object.assign({},current,{phase:'announcement',announcementReapprovedAt:ClassDB.now()}));showToast('発表をもう一度許可しました');renderCleaning();}));
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
  document.getElementById('cleaning-announce')?.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{const current=await cleaningDaily(selectedClass().id,today());if(current?.phase!=='announcement')return;await ClassDB.put('records',Object.assign({},current,{phase:'announced',announcedAt:ClassDB.now()}));renderPupilCleaning();}));
}
async function renderPupilCleaningInput(record){
  const roster=await cleaningRoster(record.classId),names=new Map(roster.map(row=>[row.student.id,row.student.name]));
  const pending=record.groups.filter(g=>!g.confirmed),groupId=pending.some(g=>g.id===state.toolDraft.cleaningPupilGroupId)?state.toolDraft.cleaningPupilGroupId:pending[0]?.id;
  if(!groupId){document.getElementById('pupil-content').innerHTML='<section class="pupil-cleaning-empty"><h1>入力が終わりました</h1><p>iPadを先生に渡してください。</p></section>';return;}
  state.toolDraft.cleaningPupilGroupId=groupId;const group=record.groups.find(g=>g.id===groupId);
  const visibleIds=group.memberIds.filter(id=>!(group.absentIds||[]).includes(id));
  const cards=visibleIds.map(id=>{const entry=cleaningStudentAssessment(group,id),selected=new Set(entry.criteria),status=entry.unavailable?'unavailable':'count-'+selected.size;return'<article class="cleaning-pupil-card assessment-'+status+'"><div class="cleaning-assessment-name"><strong>'+esc(names.get(id)||'児童')+'</strong><b>'+esc(cleaningAssessmentMark(entry))+'</b><span>'+esc(cleaningAssessmentLabel(entry))+(id===group.representativeId?'・班員に確認':'')+'</span></div><div class="cleaning-criteria-list">'+CLEANING_CRITERIA.map((item,index)=>'<button type="button" data-cleaning-criterion="'+item.id+'" data-cleaning-student="'+id+'" aria-pressed="'+(!entry.unavailable&&selected.has(item.id))+'"><b>'+(index+1)+'</b><span>'+esc(item.label)+'</span></button>').join('')+'</div><button type="button" class="cleaning-unavailable" data-cleaning-unavailable="'+id+'" aria-pressed="'+entry.unavailable+'">事情でできなかった</button></article>';}).join('');
  document.getElementById('pupil-content').innerHTML='<section class="panel pupil-cleaning-input"><div class="toolbar-line"><div><p class="cleaning-kicker">掃除の記録</p><h1>'+esc(group.name)+'の班の代表</h1><p>できていた項目を、掃除の流れに沿って選んでください。</p></div><span class="cleaning-progress-badge">'+record.groups.filter(g=>g.confirmed).length+'/'+record.groups.length+'班</span></div><div class="cleaning-score-guide"><strong>3項目で90点</strong><span>4項目できたときは、画面には100点と表示します。</span></div><div class="cleaning-pupil-grid">'+(cards||'<p class="muted">欠席者を除く入力対象者はいません。</p>')+'</div><p class="muted small">給食当番などで掃除ができなかった人は「事情でできなかった」を選びます。確定するまでは何度でも直せます。</p><div class="cleaning-confirm-area"><p>確定後の修正は先生に伝えてください。</p><button type="button" class="button primary" id="cleaning-group-confirm">この班を確定</button></div></section>';
  document.querySelectorAll('[data-cleaning-criterion]').forEach(b=>b.onclick=async()=>{const current=await cleaningDaily(record.classId,today()),target=current.groups.find(g=>g.id===groupId);if(target.confirmed)return;const id=b.dataset.cleaningStudent,entry=cleaningStudentAssessment(target,id),criteria=new Set(entry.criteria);criteria.has(b.dataset.cleaningCriterion)?criteria.delete(b.dataset.cleaningCriterion):criteria.add(b.dataset.cleaningCriterion);setCleaningStudentAssessment(target,id,{criteria:[...criteria],unavailable:false});await ClassDB.put('records',current);renderPupilCleaningInput(current);});
  document.querySelectorAll('[data-cleaning-unavailable]').forEach(b=>b.onclick=async()=>{const current=await cleaningDaily(record.classId,today()),target=current.groups.find(g=>g.id===groupId);if(target.confirmed)return;const id=b.dataset.cleaningUnavailable,entry=cleaningStudentAssessment(target,id);setCleaningStudentAssessment(target,id,{criteria:[],unavailable:!entry.unavailable});await ClassDB.put('records',current);renderPupilCleaningInput(current);});
  document.getElementById('cleaning-group-confirm').onclick=event=>runOnce(event.currentTarget,async()=>{const current=await cleaningDaily(record.classId,today()),target=current?.groups.find(g=>g.id===groupId);if(!target||target.confirmed)return;target.confirmed=true;target.confirmedAt=ClassDB.now();await ClassDB.put('records',current);state.toolDraft.cleaningPupilGroupId=null;showToast(current.groups.every(g=>g.confirmed)?'全ての班の入力が終わりました。先生に渡してください':'次の班へ進みます');renderPupilCleaning();});
}
async function renderCleaningTeacherEdit(daily,draft=null){
  const working=JSON.parse(JSON.stringify(draft||daily)),roster=await cleaningRoster(daily.classId),absent=new Set(working.groups.flatMap(g=>g.absentIds||[])),history=await cleaningHistory(daily.classId);
  const cards=roster.filter(row=>!absent.has(row.student.id)).map(row=>{const group=working.groups.find(item=>(item.memberIds||[]).includes(row.student.id)),entry=cleaningStudentAssessment(group,row.student.id),selected=new Set(entry.criteria),status=entry.unavailable?'unavailable':'count-'+selected.size;return'<article class="cleaning-teacher-card assessment-'+status+'"><div class="cleaning-assessment-name"><strong>'+esc(row.student.name)+'</strong><b>'+esc(cleaningAssessmentMark(entry))+'</b><span>'+esc(cleaningAssessmentLabel(entry))+'</span></div><div class="cleaning-criteria-list">'+CLEANING_CRITERIA.map((item,index)=>'<button type="button" data-cleaning-edit-criterion="'+item.id+'" data-cleaning-edit-student="'+row.student.id+'" aria-pressed="'+(!entry.unavailable&&selected.has(item.id))+'"><b>'+(index+1)+'</b><span>'+esc(item.label)+'</span></button>').join('')+'</div><button type="button" class="cleaning-unavailable" data-cleaning-edit-unavailable="'+row.student.id+'" aria-pressed="'+entry.unavailable+'">事情でできなかった</button></article>';}).join('');
  const preview=cleaningScore(working,history),override=working.teacherScoreOverride===null||working.teacherScoreOverride===undefined?'':working.teacherScoreOverride;
  app.innerHTML=teacherToolShell('掃除の記録を確認','<section class="panel"><h2>'+esc(jpDate(daily.date))+'の入力を確認</h2><p class="muted">項目を修正してから、必要に応じてクラス得点を調整できます。欠席者は評価対象から外れています。</p><div class="cleaning-score-guide"><strong>3項目で90点・4項目で105点</strong><span>児童への発表は100点を上限にします。</span></div><div class="cleaning-teacher-grid">'+(cards||'<p class="muted">欠席者を除く入力対象者はいません。</p>')+'</div><section class="cleaning-score-controls"><div><h3>クラス得点の調整</h3><p>自動計算は <strong id="cleaning-auto-score">'+(preview?preview.rawScore:'--')+'点</strong> です。</p></div><label>自動計算への加減<input class="input" type="number" id="cleaning-score-adjustment" min="-30" max="30" step="1" value="'+(Number(working.scoreAdjustment)||0)+'"><span>－30～＋30点</span></label><label>先生の最終点<input class="input" type="number" id="cleaning-score-override" min="0" max="100" step="1" value="'+esc(override)+'" placeholder="自動"><span>空欄なら自動計算を使用</span></label></section><div class="button-row section"><button type="button" class="button" id="cleaning-edit-cancel">戻る</button><button type="button" class="button primary" id="cleaning-edit-save">修正を保存</button></div></section>');
  wireToolHome();
  document.querySelectorAll('[data-cleaning-edit-criterion]').forEach(b=>b.onclick=()=>{const id=b.dataset.cleaningEditStudent,group=working.groups.find(item=>(item.memberIds||[]).includes(id)),entry=cleaningStudentAssessment(group,id),criteria=new Set(entry.criteria);criteria.has(b.dataset.cleaningEditCriterion)?criteria.delete(b.dataset.cleaningEditCriterion):criteria.add(b.dataset.cleaningEditCriterion);setCleaningStudentAssessment(group,id,{criteria:[...criteria],unavailable:false});renderCleaningTeacherEdit(daily,working);});
  document.querySelectorAll('[data-cleaning-edit-unavailable]').forEach(b=>b.onclick=()=>{const id=b.dataset.cleaningEditUnavailable,group=working.groups.find(item=>(item.memberIds||[]).includes(id)),entry=cleaningStudentAssessment(group,id);setCleaningStudentAssessment(group,id,{criteria:[],unavailable:!entry.unavailable});renderCleaningTeacherEdit(daily,working);});
  document.getElementById('cleaning-score-adjustment').onchange=event=>{working.scoreAdjustment=Math.max(-30,Math.min(30,Number(event.target.value)||0));renderCleaningTeacherEdit(daily,working);};
  document.getElementById('cleaning-score-override').onchange=event=>{working.teacherScoreOverride=event.target.value===''?null:Math.max(0,Math.min(100,Math.round(Number(event.target.value)||0)));renderCleaningTeacherEdit(daily,working);};
  document.getElementById('cleaning-edit-cancel').onclick=renderCleaning;
  document.getElementById('cleaning-edit-save').onclick=event=>runOnce(event.currentTarget,async()=>{const latest=await cleaningDaily(daily.classId,daily.date);if(!latest)return;latest.groups.forEach(group=>{const edited=working.groups.find(item=>item.id===group.id);if(edited)group.assessments=cleaningAssessmentMap(edited);});latest.scoreAdjustment=Math.max(-30,Math.min(30,Number(working.scoreAdjustment)||0));latest.teacherScoreOverride=working.teacherScoreOverride===null||working.teacherScoreOverride===undefined?null:Math.max(0,Math.min(100,Math.round(Number(working.teacherScoreOverride)||0)));latest.teacherEditedAt=ClassDB.now();await ClassDB.put('records',latest);showToast('修正した項目と点数を保存しました');renderCleaning();});
}
async function cleaningSummary(classId){
  const history=await cleaningHistory(classId),items=history.filter(r=>['announcement','announced'].includes(r.phase)&&r.date>=currentWeekStart()&&r.date<=moveDate(currentWeekStart(),6)),totals=new Map(),days=new Map();
  items.forEach(r=>r.groups.forEach(g=>{const absent=new Set(g.absentIds||[]);g.memberIds.forEach(id=>{if(absent.has(id))return;const entry=cleaningStudentAssessment(g,id);if(entry.unavailable){const weight=cleaningDashWeight(cleaningDashStreakBefore(r,id,history)+1);if(weight===null)return;totals.set(id,(totals.get(id)||0)+weight*100);}else totals.set(id,(totals.get(id)||0)+cleaningStudentRawScore(entry));days.set(id,(days.get(id)||0)+1);});}));
  const roster=await cleaningRoster(classId);
  return '<section class="panel cleaning-week-summary"><h2>今週の掃除の記録</h2><p class="muted">3項目で90点、4項目で105点として計算します。事情でできなかった日は、初回を対象外とし、連続時は80・60・40・20・0点として先生用集計へ反映します。勤労奉仕や責任感を考える補助資料として使い、点数だけで評価は決めません。</p><div class="cleaning-week-list">'+roster.map(row=>{const count=days.get(row.student.id)||0,average=count?Math.round((totals.get(row.student.id)||0)/count):null;return'<span><strong>'+esc(row.student.name)+'</strong> '+(average===null?'対象なし':Math.min(100,average)+'点（'+count+'日）')+'</span>';}).join('')+'</div></section>';
}
