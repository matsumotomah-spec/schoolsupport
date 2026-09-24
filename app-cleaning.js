"use strict";
const CLEANING_CONFIG_TYPE='cleaningDutyConfig';
const CLEANING_DAILY_TYPE='cleaningDutyDaily';
function cleaningConfigId(classId){return 'cleaningConfig_'+classId;}
function cleaningDailyId(classId,date){return 'cleaningDaily_'+classId+'_'+date;}
function cleaningPalette(index){return ['#397257','#4e78b8','#7651a8','#c06d31','#b04e6b','#287b83','#8c6b20','#697d32','#8d5d9d','#38735e'][index%10];}
function cleaningScore(record){
  if(!record||!['announcement','announced'].includes(record.phase))return null;
  const targets=record.groups.flatMap(g=>g.memberIds.filter(id=>!g.absentIds.includes(id)));
  const selected=new Set(record.groups.flatMap(g=>g.selectedIds||[]));
  return targets.length?{achieved:targets.filter(id=>selected.has(id)).length,target:targets.length,score:Math.round(targets.filter(id=>selected.has(id)).length/targets.length*100)}:null;
}
async function cleaningConfig(classId){
  return classId?ClassDB.get('records',cleaningConfigId(classId)):null;
}
async function cleaningDaily(classId,date){
  return classId?ClassDB.get('records',cleaningDailyId(classId,date)):null;
}
async function cleaningRoster(classId){
  return (await rosterForClass(classId,true)).filter(row=>!submissionExempt(row));
}
function cleaningH(tag,attrs,body){
  const a=Object.entries(attrs||{}).map(x=>x[1]===false?'':x[1]===true?' '+x[0]:' '+x[0]+'="'+esc(x[1])+'"').join('');
  return '<'+tag+a+'>'+body+'</'+tag+'>';
}
function cleaningDateNav(date){
  return '<div class="date-nav"><button type="button" class="button" id="cleaning-date-prev">◀</button><strong>'+esc(jpDate(date))+'の掃除</strong><button type="button" class="button" id="cleaning-date-next">▶</button></div>';
}
async function saveCleaningConfig(config){
  return ClassDB.put('records',Object.assign({},config,{id:cleaningConfigId(config.classId),type:CLEANING_CONFIG_TYPE,yearId:state.year.id,studentId:null,date:today()}));
}
async function createCleaningDaily(config,date){
  const roster=await cleaningRoster(config.classId),ids=new Set(roster.map(x=>x.student.id));
  const groups=(config.groups||[]).map(g=>({id:g.id,name:g.name,color:g.color,memberIds:(g.memberIds||[]).filter(id=>ids.has(id)),cleaningLeaderId:g.cleaningLeaderId||null,groupLeaderId:g.groupLeaderId||null,representativeId:g.cleaningLeaderId||g.groupLeaderId||null,selectedIds:[],absentIds:[],confirmed:false})).filter(g=>g.memberIds.length);
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
    const done=daily.groups.filter(g=>g.confirmed).length,score=cleaningScore(daily);
    const groupRows=daily.groups.map(g=>'<li><i style="background:'+esc(g.color)+'"></i><strong>'+esc(g.name)+'</strong><span>'+ (g.confirmed?'確認済み':'入力中')+'</span></li>').join('');
    const scoreText=score?'<strong>'+score.score+'点</strong><span>'+score.achieved+'/'+score.target+'人を確認</span>':'<span>全班の入力後に点数を計算します。</span>';
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
  document.getElementById('cleaning-start')?.addEventListener('click',async()=>{await createCleaningDaily(config,date);renderCleaning();});
  document.getElementById('cleaning-open-pupil')?.addEventListener('click',()=>renderPupil('cleaning'));
  document.getElementById('cleaning-finalize')?.addEventListener('click',async()=>{const current=await cleaningDaily(classItem.id,date);await ClassDB.put('records',Object.assign({},current,{phase:'announcement',teacherConfirmedAt:ClassDB.now()}));showToast('結果を確定しました');renderCleaning();});
  document.getElementById('cleaning-edit')?.addEventListener('click',()=>renderCleaningTeacherEdit(daily));
  document.getElementById('cleaning-reannounce')?.addEventListener('click',async()=>{await ClassDB.put('records',Object.assign({},daily,{phase:'announcement',announcementReapprovedAt:ClassDB.now()}));showToast('発表をもう一度許可しました');renderCleaning();});
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
  const byId=new Map(roster.map(row=>[row.student.id,row])),seatLayout=Array.isArray(classItem.activeSeatLayout)?classItem.activeSeatLayout:[],hasSeatLayout=seatLayout.some(id=>byId.has(id)),seatCols=Math.max(1,Number(classItem.activeSeatCols)||6),seatStudents=seatLayout.filter(id=>byId.has(id)).map(id=>studentButton(byId.get(id))),students=setupView==='seats'&&hasSeatLayout?seatStudents.join('')+roster.filter(row=>!seatLayout.includes(row.student.id)).map(studentButton).join(''):roster.map(studentButton).join(''),studentGridClass=setupView==='seats'&&hasSeatLayout?'cleaning-assignment-grid cleaning-seat-grid':'cleaning-assignment-grid',studentGridStyle=setupView==='seats'&&hasSeatLayout?' style="grid-template-columns:repeat('+seatCols+',minmax(0,1fr))"':'';
  app.innerHTML=teacherToolShell('掃除班の設定','<section class="panel"><div class="toolbar-line"><div><h2>掃除班を設定</h2><p class="muted">児童名を押すと、選んだ班へ移せます。班の代表は通常は掃除担当、欠席時は班長です。</p></div><button type="button" class="button" id="cleaning-setup-back">掃除の記録へ</button></div><div class="cleaning-group-tabs">'+tabs+'<button type="button" class="button" id="cleaning-add-group">＋ 班を追加</button></div><div class="cleaning-setup-grid"><section><h3>'+esc(group.name)+'</h3><div class="form-grid"><label class="field">班の名前<input class="input" id="cleaning-group-name" value="'+esc(group.name)+'"></label><label class="field">掃除担当<select class="select" id="cleaning-cleaner">'+options(group.cleaningLeaderId)+'</select></label><label class="field">班長<select class="select" id="cleaning-leader">'+options(group.groupLeaderId)+'</select></label></div><div class="button-row section"><button type="button" class="button" id="cleaning-remove-group" '+(config.groups.length<=1?'disabled':'')+'>この班を削除</button><button type="button" class="button primary" id="cleaning-save-config">班の設定を保存</button></div></section><section><div class="toolbar-line"><h3>児童を選ぶ</h3><div class="order-toggle"><button type="button" data-cleaning-setup-view="seats" aria-pressed="'+(setupView==='seats')+'">座席表</button><button type="button" data-cleaning-setup-view="roster" aria-pressed="'+(setupView==='roster')+'">名簿</button></div></div><div class="'+studentGridClass+'"'+studentGridStyle+'>'+students+'</div></section></div></section>');
  wireToolHome();
  document.getElementById('cleaning-setup-back').onclick=renderCleaning;
  document.querySelectorAll('[data-cleaning-setup-view]').forEach(b=>b.onclick=()=>{state.toolDraft.cleaningSetupView=b.dataset.cleaningSetupView;renderCleaningSetup();});
  document.querySelectorAll('[data-cleaning-group]').forEach(b=>b.onclick=()=>{state.toolDraft.cleaningSetupGroupId=b.dataset.cleaningGroup;renderCleaningSetup();});
  document.getElementById('cleaning-add-group').onclick=async()=>{config.groups.push({id:ClassDB.uid('cleaningGroup'),name:(config.groups.length+1)+'班',color:cleaningPalette(config.groups.length),memberIds:[],cleaningLeaderId:null,groupLeaderId:null});state.toolDraft.cleaningSetupGroupId=config.groups.at(-1).id;await saveCleaningConfig(config);renderCleaningSetup();};
  document.getElementById('cleaning-remove-group').onclick=async()=>{config.groups=config.groups.filter(g=>g.id!==groupId);state.toolDraft.cleaningSetupGroupId=config.groups[0].id;await saveCleaningConfig(config);renderCleaningSetup();};
  document.querySelectorAll('[data-cleaning-student]').forEach(b=>b.onclick=async()=>{const id=b.dataset.cleaningStudent;config.groups.forEach(g=>g.memberIds=g.memberIds.filter(x=>x!==id));if(!b.classList.contains('selected'))group.memberIds.push(id);await saveCleaningConfig(config);renderCleaningSetup();});
  document.getElementById('cleaning-save-config').onclick=async()=>{group.name=document.getElementById('cleaning-group-name').value.trim()||group.name;group.cleaningLeaderId=document.getElementById('cleaning-cleaner').value||null;group.groupLeaderId=document.getElementById('cleaning-leader').value||null;await saveCleaningConfig(config);showToast('掃除班を保存しました');renderCleaning();};
}
async function renderPupilCleaning(){
  const record=await cleaningDaily(selectedClass().id,today());
  if(!record||record.phase==='review'){document.getElementById('pupil-content').innerHTML='<section class="panel pupil-cleaning-empty"><h1>掃除の記録</h1><p>先生が入力を始めると、ここで班の代表が記録できます。</p></section>';return;}
  if(record.phase==='input'){renderPupilCleaningInput(record);return;}
  const score=cleaningScore(record),announcing=record.phase==='announcement';
  document.getElementById('pupil-content').innerHTML='<section class="pupil-cleaning-result '+(announcing?'':'shown')+'"><p>きょうのクラスのそうじ</p><h1>'+ (announcing?'発表のじゅんびができました':'きょうのけっか')+'</h1>'+ (announcing?'<button type="button" class="button primary cleaning-announce-button" id="cleaning-announce">結果を発表</button>':'<strong class="cleaning-big-score">'+(score?score.score:'--')+'点'+(score&&score.score===100?'！':'')+'</strong><p>'+(score&&score.score===100?'みんなで100点！':'明日もみんなで取り組もう。')+'</p>')+'</section>';
  document.getElementById('cleaning-announce')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;const current=await cleaningDaily(selectedClass().id,today());if(current?.phase!=='announcement')return;await ClassDB.put('records',Object.assign({},current,{phase:'announced',announcedAt:ClassDB.now()}));renderPupilCleaning();});
}
async function renderPupilCleaningInput(record){
  const roster=await cleaningRoster(record.classId),names=new Map(roster.map(row=>[row.student.id,row.student.name]));
  const pending=record.groups.filter(g=>!g.confirmed),groupId=pending.some(g=>g.id===state.toolDraft.cleaningPupilGroupId)?state.toolDraft.cleaningPupilGroupId:pending[0]?.id;
  if(!groupId){document.getElementById('pupil-content').innerHTML='<section class="pupil-cleaning-empty"><h1>入力が終わりました</h1><p>iPadを先生に渡してください。</p></section>';return;}
  state.toolDraft.cleaningPupilGroupId=groupId;const group=record.groups.find(g=>g.id===groupId),selected=new Set(group.selectedIds||[]);
  const cards=group.memberIds.map(id=>'<button type="button" class="cleaning-pupil-card '+(selected.has(id)?'selected':'')+'" data-cleaning-pupil-student="'+id+'" aria-pressed="'+selected.has(id)+'"><strong>'+esc(names.get(id)||'児童')+'</strong><span>'+(selected.has(id)?'評価する':'評価しない')+(id===group.representativeId?'・班員に確認':'')+'</span></button>').join('');
  document.getElementById('pupil-content').innerHTML='<section class="panel pupil-cleaning-input"><div class="toolbar-line"><div><p class="cleaning-kicker">掃除の記録</p><h1>'+esc(group.name)+'の班の代表</h1><p>自分の仕事をしていた人を押してください。</p></div><span class="cleaning-progress-badge">'+record.groups.filter(g=>g.confirmed).length+'/'+record.groups.length+'班</span></div><div class="cleaning-pupil-grid">'+cards+'</div><p class="muted small">押すたびに「評価する」「評価しない」が切り替わります。</p><div class="cleaning-confirm-area"><p>確定後の修正は先生に伝えてください。</p><button type="button" class="button primary" id="cleaning-group-confirm">この班を確定</button></div></section>';
  document.querySelectorAll('[data-cleaning-pupil-student]').forEach(b=>b.onclick=async()=>{const current=await cleaningDaily(record.classId,today()),target=current.groups.find(g=>g.id===groupId);if(target.confirmed)return;const values=new Set(target.selectedIds||[]),id=b.dataset.cleaningPupilStudent;values.has(id)?values.delete(id):values.add(id);target.selectedIds=[...values];await ClassDB.put('records',current);renderPupilCleaningInput(current);});
  document.getElementById('cleaning-group-confirm').onclick=async()=>{const current=await cleaningDaily(record.classId,today()),target=current.groups.find(g=>g.id===groupId);target.confirmed=true;target.confirmedAt=ClassDB.now();await ClassDB.put('records',current);state.toolDraft.cleaningPupilGroupId=null;showToast(current.groups.every(g=>g.confirmed)?'全ての班の入力が終わりました。先生に渡してください':'次の班へ進みます');renderPupilCleaning();};
}
async function renderCleaningTeacherEdit(daily){
  const roster=await cleaningRoster(daily.classId),selected=new Set(daily.groups.flatMap(g=>g.selectedIds||[])),absent=new Set(daily.groups.flatMap(g=>g.absentIds||[]));
  const cards=roster.map(row=>'<article class="cleaning-teacher-card '+(selected.has(row.student.id)?'selected':'')+'"><button type="button" data-cleaning-edit-student="'+row.student.id+'" aria-pressed="'+selected.has(row.student.id)+'"><strong>'+esc(row.student.name)+'</strong><span>'+ (selected.has(row.student.id)?'評価する':'評価しない')+'</span></button><label><input type="checkbox" data-cleaning-absent="'+row.student.id+'" '+(absent.has(row.student.id)?'checked':'')+'> 欠席</label></article>').join('');
  app.innerHTML=teacherToolShell('掃除の記録を確認','<section class="panel"><h2>'+esc(jpDate(daily.date))+'の入力を確認</h2><p class="muted">児童名を押すと評価する／しないを変更します。欠席はチェックで設定します。</p><div class="cleaning-teacher-grid">'+cards+'</div><div class="button-row section"><button type="button" class="button" id="cleaning-edit-cancel">戻る</button><button type="button" class="button primary" id="cleaning-edit-save">修正を保存</button></div></section>');
  wireToolHome();
  document.querySelectorAll('[data-cleaning-edit-student]').forEach(b=>b.onclick=()=>{const id=b.dataset.cleaningEditStudent;selected.has(id)?selected.delete(id):selected.add(id);b.closest('article').classList.toggle('selected',selected.has(id));b.querySelector('span').textContent=selected.has(id)?'評価する':'評価しない';});
  document.getElementById('cleaning-edit-cancel').onclick=renderCleaning;
  document.getElementById('cleaning-edit-save').onclick=async()=>{const latest=await cleaningDaily(daily.classId,daily.date),absentIds=new Set([...document.querySelectorAll('[data-cleaning-absent]:checked')].map(x=>x.dataset.cleaningAbsent));latest.groups.forEach(g=>{g.absentIds=g.memberIds.filter(id=>absentIds.has(id));g.selectedIds=g.memberIds.filter(id=>selected.has(id)&&!absentIds.has(id));});await ClassDB.put('records',latest);showToast('修正を保存しました');renderCleaning();};
}
async function cleaningSummary(classId){
  const items=(await ClassDB.getAllByIndex('records','classId',classId)).filter(r=>r.type===CLEANING_DAILY_TYPE&&['announcement','announced'].includes(r.phase)&&r.date>=currentWeekStart()&&r.date<=moveDate(currentWeekStart(),6)),counts=new Map();
  items.forEach(r=>r.groups.forEach(g=>{const selected=new Set(g.selectedIds||[]),absent=new Set(g.absentIds||[]);g.memberIds.forEach(id=>{if(selected.has(id)&&!absent.has(id))counts.set(id,(counts.get(id)||0)+1);});}));
  const roster=await cleaningRoster(classId);
  return '<section class="panel cleaning-week-summary"><h2>今週の掃除の記録</h2><p class="muted">勤労奉仕や責任感を考えるための補助資料です。件数だけで評価は決めません。</p><div class="cleaning-week-list">'+roster.map(row=>'<span><strong>'+esc(row.student.name)+'</strong> '+(counts.get(row.student.id)||0)+'点</span>').join('')+'</div></section>';
}
