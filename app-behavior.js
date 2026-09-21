"use strict";

  const BEHAVIOR_CATEGORIES=Object.freeze([
    {id:'life_habits',label:'基本的な生活習慣',short:'生活習慣',criterion:'身の回り・準備など、毎日の習慣',examples:['先生、友達、地域の人、お客さんに気持ちの良いあいさつができる。','つくえの中やロッカーの中はいつもきれい。','授業がはじまる前に勉強の用意をしている。','忘れ物をしていない。忘れ物をしても、先生にきちんと伝えている。']},
    {id:'health',label:'健康・体力の向上',short:'健康',criterion:'健康を保ち、進んで体を動かす',examples:['授業以外でも校庭や体育館で元気に遊んでいる。','よい姿勢で授業を受けている。','給食のきまりを守っている（手洗い・苦手なものでも挑戦する）。']},
    {id:'autonomy',label:'自主・自律',short:'自主',criterion:'自分で目標や考えをもち、行動する',examples:['夢や目標を持って計画的に行動できる。','物事に簡単にあきらめず、ねばり強く取り組むことができる。','良いと思ったことは自分で考えて行動することができる。']},
    {id:'responsibility',label:'責任感',short:'責任',criterion:'自分の役割や決めたことを最後まで行う',examples:['給食当番や係活動などを一生懸命行うことができる。','自分で決めたことを最後まで取り組むことができる。','何事も人のせいにせず、自分の行動をふりかえることができる。']},
    {id:'creativity',label:'創意工夫',short:'創意',criterion:'新しい方法を考え、生活をよりよくする',examples:['さまざまな物事に対して、新しい考えがないか探している。','遊びや生活のルールを自分で考えて作ることができる。','クラスや学校に必要だと思うことを自分で考え、行動できる。']},
    {id:'kindness',label:'思いやり・協力',short:'思いやり',criterion:'目の前の相手を思い、助け合う',examples:['困っている人がいたら、声をかけたり助けてあげたりすることができる。','友達と仲良く遊ぶことができる。','自分と異なる意見や立場でも、相手の良さを認めることができる。']},
    {id:'life_nature',label:'生命尊重・自然愛護',short:'生命',criterion:'命や自然を大切にし、よさに気づく',examples:['虫や動物、植物の命を大切にしている。（むやみに叩いたり、抜いたりしない）','山や海、森や川、星や風など自然のすばらしさに感動することができる。']},
    {id:'service',label:'勤労奉仕',short:'勤労',criterion:'みんなのために進んで働く',examples:['進んでそうじをすることができる。','誰かの役に立つことを考え、行動することができる。','先生や友達の仕事の手伝いができる。']},
    {id:'fairness',label:'公正・公平',short:'公正',criterion:'相手によって態度を変えず、正しく関わる',examples:['悪いことに流されず、良い行いをしようとする。','友達の良いところをたくさん見つけることができる。','好きでも苦手でも仲間はずれをせずに、誰とでも接することができる。']},
    {id:'public_mind',label:'公共心・公徳心',short:'公共',criterion:'みんなの物・場所・ルールを大切にする',examples:['世の中のルールを守り、生活することができる。','みんなが使うものを大切にすることができる。','周りの人のことを考えながら行動することができる。']}
  ]);
  const behaviorTapLocks=new Set();

  function behaviorDraft(){
    const draft=state.toolDraft.behavior||(state.toolDraft.behavior={view:'input',date:today(),categoryId:null,period:'front',start:state.year.startDate,end:state.year.firstTermEnd});
    draft.date=draft.date||today();draft.view=draft.view||'input';draft.period=draft.period||'front';return draft;
  }
  function behaviorCategory(id){return BEHAVIOR_CATEGORIES.find(item=>item.id===id)||null;}
  function behaviorRecordId(classId,date,categoryId,studentId){return`behavior_${classId}_${date}_${categoryId}_${studentId}`;}
  function behaviorPeriodRange(period='front',customStart='',customEnd=''){
    const front={start:state.year.startDate,end:state.year.firstTermEnd,label:'前期'};
    if(period==='front')return front;
    if(period==='back')return{start:moveDate(state.year.firstTermEnd,1),end:state.year.endDate,label:'後期'};
    if(period==='custom'){const start=customStart||state.year.startDate,end=customEnd||state.year.endDate;return{start:start<=end?start:end,end:start<=end?end:start,label:'指定期間'};}
    return{start:state.year.startDate,end:state.year.endDate,label:'年間'};
  }
  function behaviorHeatLevel(count){return count<=0?0:count===1?1:count<=3?2:count<=5?3:4;}
  function behaviorActiveRecords(records){return records.filter(item=>item.type==='behaviorMark'&&item.status==='marked'&&!item.deletedAt);}
  async function behaviorRecords(classId,start=state.year.startDate,end=state.year.endDate){return behaviorActiveRecords(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>item.date>=start&&item.date<=end);}

  function behaviorCategoryButtons(counts=new Map(),compact=false,selectedId=null){return`<div class="behavior-category-grid ${compact?'compact':''}">${BEHAVIOR_CATEGORIES.map(item=>`<button type="button" class="behavior-category-card" data-behavior-category="${item.id}" aria-pressed="${item.id===selectedId}"><strong>${esc(item.label)}</strong><span>${esc(item.criterion)}</span>${counts.has(item.id)?`<b>今日の○ ${counts.get(item.id)}人</b>`:''}</button>`).join('')}</div>`;}

  async function renderBehavior(){
    const draft=behaviorDraft();state.route='teacher-records';state.activeTool='records';state.toolDraft.recordsMode='behavior';
    if(draft.view==='summary')await renderBehaviorHeatmap();else await renderBehaviorInput();
  }
  async function renderBehaviorInput(){
    const classItem=selectedClass(),draft=behaviorDraft(),allToday=await behaviorRecords(classItem.id,draft.date,draft.date),counts=new Map(BEHAVIOR_CATEGORIES.map(item=>[item.id,allToday.filter(record=>record.categoryId===item.id).length]));
    const category=behaviorCategory(draft.categoryId);
    if(!category){
      app.innerHTML=teacherToolShell('児童の記録',`${recordModeTabs('behavior',false)}<section class="panel behavior-category-select"><h1>記録するカテゴリーを選択</h1><p class="muted">よい姿を見つけたカテゴリーを先に選びます。○がない日は、できなかったという意味ではありません。</p>${behaviorCategoryButtons(counts)}</section>`);
      wireBehaviorCommon();document.querySelectorAll('[data-behavior-category]').forEach(button=>button.addEventListener('click',()=>{draft.categoryId=button.dataset.behaviorCategory;renderBehavior();}));return;
    }
    const current=allToday.filter(record=>record.categoryId===category.id),currentIds=new Set(current.map(record=>record.studentId));
    const rosterHtml=await behaviorRosterHtml(classItem.id,draft.date,currentIds);
    app.innerHTML=teacherToolShell('児童の記録',`${recordModeTabs('behavior',false)}${pupilDateNav(draft.date,'behavior-prev','behavior-next')}<section class="panel behavior-current"><div class="behavior-current-head"><div><span class="eyebrow">選択中のカテゴリー</span><h1 id="behavior-current-title" tabindex="-1">${esc(category.label)}</h1><p class="behavior-criterion">${esc(category.criterion)}</p></div><button type="button" class="button" id="behavior-change-category">カテゴリー変更</button></div><details class="behavior-examples" open><summary>判断の具体例</summary><ul>${category.examples.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details><div class="behavior-entry-toolbar"><p><strong>今日の○ <span id="behavior-today-count">${current.length}</span>人</strong><br><span class="muted small">児童名を押すと○。もう一度押すと解除します。</span></p>${teacherOrderControlHtml()}</div></section>${rosterHtml}`);
    wireBehaviorCommon();wireTeacherOrder(renderBehavior);document.getElementById('behavior-prev').addEventListener('click',()=>{draft.date=moveDate(draft.date,-1);renderBehavior();});document.getElementById('behavior-next').addEventListener('click',()=>{draft.date=moveDate(draft.date,1);renderBehavior();});document.getElementById('behavior-change-category').addEventListener('click',async()=>{const latest=await behaviorRecords(classItem.id,draft.date,draft.date),latestCounts=new Map(BEHAVIOR_CATEGORIES.map(item=>[item.id,latest.filter(record=>record.categoryId===item.id).length]));openBehaviorCategoryDialog(latestCounts);});
    document.querySelectorAll('[data-behavior-student]').forEach(button=>button.addEventListener('click',()=>toggleBehaviorMark(button.dataset.behaviorStudent)));
  }

  async function behaviorRosterHtml(classId,date,markedIds){
    const mode=teacherOrderMode(),roster=await rosterForClass(classId,mode==='seat',date),classItem=state.classes.find(item=>item.id===classId);
    const card=row=>{const marked=markedIds.has(row.student.id),number=mode==='number'&&row.enrollment.number!==''&&row.enrollment.number!==null?`<span class="student-number">${esc(row.enrollment.number)}</span>`:'';return`<button type="button" class="behavior-student-card${marked?' marked':''}${feedbackClass(row.student.id)}" data-behavior-student="${row.student.id}" aria-pressed="${marked}" aria-label="${esc(row.student.name)}、${marked?'○ 記録済み':'未記録'}"><strong>${number}${esc(row.student.name)}</strong><span>${marked?'○ 記録済み':'タップで○'}</span></button>`;};
    const layout=classItem?.activeSeatLayout||[],byId=new Map(roster.map(row=>[row.student.id,row])),useShape=mode==='seat'&&layout.length;let body,style='';
    if(useShape){const cols=Math.max(1,Number(classItem.activeSeatCols)||6),aisles=new Set((classItem.activeSeatAisleAfterColumns||[]).map(Number)),outside=roster.filter(row=>!layout.includes(row.student.id));body=layout.map((id,index)=>{const cell=id&&byId.has(id)?card(byId.get(id)):'<div class="behavior-student-card empty" aria-hidden="true"><span>空席</span></div>',column=index%cols+1;return cell+(column<cols&&aisles.has(column)?'<div class="teacher-seat-aisle" aria-hidden="true"></div>':'');}).join('')+outside.map(card).join('');style=` style="grid-template-columns:${activeSeatGridTemplate(classItem)}"`;}
    else body=roster.map(card).join('');
    return`<section class="behavior-student-grid ${useShape?'seat-shaped':''}"${style}>${body}</section>`;
  }

  function openBehaviorCategoryDialog(counts){
    openDialog(`<h2>カテゴリーを変更</h2><p class="muted">記録するよい姿に最も近いカテゴリーを選びます。</p>${behaviorCategoryButtons(counts,true,behaviorDraft().categoryId)}<div class="dialog-actions"><button type="button" class="button" id="behavior-category-close">閉じる</button></div>`);dialog.classList.add('behavior-category-dialog');
    document.getElementById('behavior-category-close').addEventListener('click',closeDialog);document.querySelectorAll('[data-behavior-category]').forEach(button=>button.addEventListener('click',async()=>{behaviorDraft().categoryId=button.dataset.behaviorCategory;closeDialog();await renderBehavior();document.getElementById('behavior-current-title')?.focus();}));
  }
  async function toggleBehaviorMark(studentId){
    const classItem=selectedClass(),draft=behaviorDraft(),category=behaviorCategory(draft.categoryId),id=behaviorRecordId(classItem.id,draft.date,category.id,studentId);if(behaviorTapLocks.has(id))return;behaviorTapLocks.add(id);
    try{const existing=await ClassDB.get('records',id),marked=existing?.status==='marked'&&!existing.deletedAt,nextMarked=!marked;await ClassDB.put('records',{...(existing||{}),id,type:'behaviorMark',classId:classItem.id,studentId,date:draft.date,categoryId:category.id,categoryLabel:category.label,criterion:category.criterion,criterionVersion:1,status:nextMarked?'marked':'cleared'});const button=[...document.querySelectorAll('[data-behavior-student]')].find(item=>item.dataset.behaviorStudent===studentId),count=document.getElementById('behavior-today-count');if(button){button.classList.toggle('marked',nextMarked);button.classList.add('just-updated');button.setAttribute('aria-pressed',String(nextMarked));button.setAttribute('aria-label',`${button.querySelector('strong')?.textContent||'児童'}、${nextMarked?'○ 記録済み':'未記録'}`);if(button.children[1])button.children[1].textContent=nextMarked?'○ 記録済み':'タップで○';button.focus({preventScroll:true});setTimeout(()=>button.classList.remove('just-updated'),700);}if(count)count.textContent=String(Math.max(0,Number(count.textContent||0)+(nextMarked?1:-1)));}finally{behaviorTapLocks.delete(id);}
  }

  async function renderBehaviorHeatmap(){
    const classItem=selectedClass(),draft=behaviorDraft(),range=behaviorPeriodRange(draft.period,draft.start,draft.end);draft.start=range.start;draft.end=range.end;
    const [roster,records]=await Promise.all([rosterForRange(classItem.id,range.start,range.end),behaviorRecords(classItem.id,range.start,range.end)]),counts=new Map();
    records.forEach(record=>{const key=`${record.studentId}|${record.categoryId}`;counts.set(key,(counts.get(key)||0)+1);});
    const rows=roster.map(row=>`<tr><th scope="row" class="behavior-name-cell"><span>${esc(row.enrollment.number||'—')}</span>${esc(row.student.name)}</th>${BEHAVIOR_CATEGORIES.map(category=>{const count=counts.get(`${row.student.id}|${category.id}`)||0,level=behaviorHeatLevel(count);return`<td data-level="${level}">${count?`<button type="button" data-behavior-history="${row.student.id}|${category.id}" aria-label="${esc(row.student.name)}、${esc(category.label)}、${count}件">${count}</button>`:'<span aria-label="0件">0</span>'}</td>`;}).join('')}</tr>`).join('');
    app.innerHTML=teacherToolShell('児童の記録',`${recordModeTabs('summary',isSupportClass(classItem))}<section class="panel behavior-summary-head"><div class="toolbar-line"><div><h1>期間集計</h1><p class="muted">記録した○の件数を、児童とカテゴリーごとに確認します。</p></div><div class="behavior-period-tabs" aria-label="集計期間">${[['front','前期'],['back','後期'],['year','年間'],['custom','日付指定']].map(([id,label])=>`<button type="button" data-behavior-period="${id}" aria-pressed="${draft.period===id}">${label}</button>`).join('')}</div></div>${draft.period==='custom'?`<div class="behavior-custom-range"><label>開始<input type="date" class="input" id="behavior-range-start" min="${state.year.startDate}" max="${state.year.endDate}" value="${range.start}"></label><label>終了<input type="date" class="input" id="behavior-range-end" min="${state.year.startDate}" max="${state.year.endDate}" value="${range.end}"></label><button type="button" class="button primary" id="behavior-range-apply">表示</button></div>`:''}<p class="current-item"><strong>${esc(range.label)}</strong>　${esc(jpDate(range.start))}〜${esc(jpDate(range.end))}</p><p class="behavior-assessment-note">この件数は、よい姿を見つけて記録した量です。○が少ないことを否定的に扱ったり、評価を自動決定したりしません。</p><div class="behavior-legend" aria-label="色の濃さ"><span data-level="0">0</span><span data-level="1">1</span><span data-level="2">2〜3</span><span data-level="3">4〜5</span><span data-level="4">6以上</span></div></section><section class="panel behavior-table-panel"><p class="muted small behavior-scroll-hint">表は横にスクロールできます。数字を押すと記録日を確認できます。</p><div class="behavior-table-wrap"><table class="behavior-heatmap"><caption>${esc(range.label)}の行動記録件数</caption><thead><tr><th scope="col" class="behavior-name-cell">児童</th>${BEHAVIOR_CATEGORIES.map(category=>`<th scope="col" title="${esc(category.label)}" aria-label="${esc(category.label)}"><span>${esc(category.short)}</span></th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="11">この期間に在籍した児童はいません。</td></tr>`}</tbody></table></div></section>`);
    wireBehaviorCommon();document.querySelectorAll('[data-behavior-period]').forEach(button=>button.addEventListener('click',()=>{draft.period=button.dataset.behaviorPeriod;renderBehavior();}));document.getElementById('behavior-range-apply')?.addEventListener('click',()=>{draft.start=document.getElementById('behavior-range-start').value;draft.end=document.getElementById('behavior-range-end').value;renderBehavior();});document.querySelectorAll('[data-behavior-history]').forEach(button=>button.addEventListener('click',()=>{const[studentId,categoryId]=button.dataset.behaviorHistory.split('|');openBehaviorHistory(studentId,categoryId,range,roster,records);}));
  }

  function openBehaviorHistory(studentId,categoryId,range,roster,records){
    const row=roster.find(item=>item.student.id===studentId),category=behaviorCategory(categoryId),items=records.filter(item=>item.studentId===studentId&&item.categoryId===categoryId).sort((a,b)=>b.date.localeCompare(a.date));
    openDialog(`<h2>${esc(row?.student.name||'児童')}・${esc(category.label)}</h2><p><strong>${esc(category.criterion)}</strong></p><p class="muted">${esc(jpDate(range.start))}〜${esc(jpDate(range.end))}　${items.length}件</p><div class="behavior-history-list">${items.map(item=>`<div><span>${esc(jpDate(item.date))}</span><button type="button" class="button" data-behavior-clear="${esc(item.id)}">この○を解除</button></div>`).join('')}</div><details class="behavior-examples"><summary>判断の具体例</summary><ul>${category.examples.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></details><div class="dialog-actions"><button type="button" class="button primary" id="behavior-history-close">閉じる</button></div>`);
    document.getElementById('behavior-history-close').addEventListener('click',closeDialog);document.querySelectorAll('[data-behavior-clear]').forEach(button=>button.addEventListener('click',async()=>{const record=await ClassDB.get('records',button.dataset.behaviorClear);if(!record)return;await ClassDB.put('records',{...record,status:'cleared'});closeDialog();await renderBehavior();showUndoToast('○を解除しました',async()=>{await ClassDB.put('records',{...record,status:'marked'});renderBehavior();});}));
  }
  function wireBehaviorCommon(){wireToolHome();document.querySelectorAll('[data-record-mode]').forEach(button=>button.addEventListener('click',()=>{state.toolDraft.recordsMode=button.dataset.recordMode;if(button.dataset.recordMode==='behavior')behaviorDraft().view='input';renderStudentRecords();}));document.querySelector('[data-record-summary]')?.addEventListener('click',()=>{behaviorDraft().view='summary';renderBehavior();});}
