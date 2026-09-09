"use strict";

  async function renderMemos(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-memo';state.activeTool='memo';
    const classItem=selectedClass();applyClassTheme(classItem);const date=state.toolDraft.memoDate||today();state.toolDraft.memoDate=date;
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='memo'&&item.date===date&&!item.deletedAt);
    const shortages=await memoShortages(classItem);
    const latest=new Map();records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).forEach(item=>{if(!latest.has(item.studentId))latest.set(item.studentId,item);});
    const cards=await teacherRosterCards(classItem.id,[...latest.values()],{orderMode:teacherOrderMode(),atDate:date,status:record=>record?(record.tags?.join('・')||record.viewpoint||'記録あり'):'記録を追加'});
    const shortageHtml=isSupportClass(classItem)?`<section class="panel memo-shortage"><h2>メモが不足　${shortages.length}人</h2>${shortages.length?`<div class="list">${shortages.map(item=>`<div class="shortage-row"><strong>${esc(item.student.name)}</strong><div class="shortage-subjects">${item.subjects.map(subject=>`<button type="button" data-shortage-student="${item.student.id}" data-shortage-subject="${esc(subject)}">${esc(subject)}</button>`).join('')}</div></div>`).join('')}</div>`:'<p class="muted">設定したすべての教科にメモがあります。</p>'}</section>`:'';
    app.innerHTML=teacherToolShell('児童メモ',`${pupilDateNav(date,'memo-prev','memo-next')}<section class="panel"><div class="toolbar-line"><div><h1>${esc(classItem.name)}の児童メモ</h1><p class="muted">教科とタグを選ぶだけでも保存できます。必要なときだけ自由記述を加えます。</p></div>${teacherOrderControlHtml()}</div></section>${shortageHtml}${cards}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderMemos);
    document.getElementById('memo-prev').addEventListener('click',()=>{state.toolDraft.memoDate=moveDate(date,-1);renderMemos();});document.getElementById('memo-next').addEventListener('click',()=>{state.toolDraft.memoDate=moveDate(date,1);renderMemos();});
    document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>openMemoEditor(button.dataset.toolStudent)));
    document.querySelectorAll('[data-shortage-student]').forEach(button=>button.addEventListener('click',()=>openMemoEditor(button.dataset.shortageStudent,button.dataset.shortageSubject)));
  }

  async function openMemoEditor(studentId,defaultSubject=''){
    const student=await ClassDB.get('students',studentId);const classItem=selectedClass();
    const memoTags=await ClassDB.getMeta('memoTags',MEMO_TAGS);
    openDialog(`<h2>${esc(student.name)}のメモ</h2><form id="memo-form"><div class="form-grid"><div class="field"><label for="memo-date">日付</label><input class="input" id="memo-date" type="date" value="${state.toolDraft.memoDate||today()}" required></div><div class="field"><label for="memo-subject">教科</label><select class="select" id="memo-subject"><option value="">教科なし</option>${classSubjects(classItem).map(subject=>`<option ${subject===defaultSubject?'selected':''}>${esc(subject)}</option>`).join('')}</select></div><div class="field full"><span class="field-label">プラス評価タグ（複数選択可）</span><div class="tag-list" id="memo-tags">${memoTags.map(tag=>`<button type="button" class="tag-chip" data-memo-tag="${esc(tag)}" aria-pressed="false">${esc(tag)}</button>`).join('')}</div></div><div class="field full"><label for="memo-text">自由記述（任意）</label><textarea class="textarea" id="memo-text"></textarea></div></div><div class="dialog-actions"><button type="button" class="button" id="memo-cancel">キャンセル</button><button type="submit" class="button primary">保存</button></div></form>`);
    document.querySelectorAll('[data-memo-tag]').forEach(button=>button.addEventListener('click',()=>button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'))));
    document.getElementById('memo-cancel').addEventListener('click',closeDialog);
    document.getElementById('memo-form').addEventListener('submit',async event=>{event.preventDefault();const tags=[...document.querySelectorAll('#memo-tags [aria-pressed="true"]')].map(button=>button.dataset.memoTag);await ClassDB.put('records',{id:ClassDB.uid('memo'),type:'memo',classId:classItem.id,studentId,date:document.getElementById('memo-date').value,subject:document.getElementById('memo-subject').value,tags,text:document.getElementById('memo-text').value.trim()});closeDialog();showToast('児童メモを保存しました');renderMemos();});
  }

  async function renderCertificates(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-certificate';state.activeTool='certificate';
    const classItem=selectedClass();applyClassTheme(classItem);const date=state.toolDraft.certificateDate||today();state.toolDraft.certificateDate=date;
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='certificate'&&item.date===date&&!item.deletedAt);
    const allCertificates=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='certificate'&&item.date<=date&&!item.deletedAt);const certificateSummary=new Map();for(const item of allCertificates.sort((a,b)=>a.date.localeCompare(b.date))){const summary=certificateSummary.get(item.studentId)||{count:0,dates:[]};summary.count++;summary.dates.push(item.date);certificateSummary.set(item.studentId,summary);}const cards=await teacherRosterCards(classItem.id,records,{orderMode:teacherOrderMode(),atDate:date,status:(record,row)=>{const summary=certificateSummary.get(row.student.id)||{count:0,dates:[]},prior=summary.dates.filter(value=>value<date).at(-1),days=prior?Math.max(0,Math.round((new Date(`${date}T00:00:00`)-new Date(`${prior}T00:00:00`))/86400000)):null;if(record)return`本日配付・今年度${summary.count}回${days!==null?`・前回から${days}日`:''}`;if(!summary.count)return'今年度0回・未配付';const last=summary.dates.at(-1),since=Math.max(0,Math.round((new Date(`${date}T00:00:00`)-new Date(`${last}T00:00:00`))/86400000));return`今年度${summary.count}回・前回から${since}日`;},statusClass:record=>record?'good':''});
    app.innerHTML=teacherToolShell('ミニ賞状',`${pupilDateNav(date,'certificate-prev','certificate-next')}<section class="panel"><div class="toolbar-line"><div><h1>${esc(classItem.name)}のミニ賞状</h1><p class="muted">児童名を押して、渡したことを記録します。</p></div>${teacherOrderControlHtml()}</div>${operationTipHtml('押し方を見る','1回目で「渡した」と記録します。同じ名前をもう一度押すと、理由タグの追加や配付取消ができます。')}</section>${cards}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderCertificates);
    document.getElementById('certificate-prev').addEventListener('click',()=>{state.toolDraft.certificateDate=moveDate(date,-1);renderCertificates();});document.getElementById('certificate-next').addEventListener('click',()=>{state.toolDraft.certificateDate=moveDate(date,1);renderCertificates();});
    document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>handleCertificateTap(button.dataset.toolStudent)));
  }

  async function handleCertificateTap(studentId){
    const classItem=selectedClass();const date=state.toolDraft.certificateDate||today();const id=`certificate_${classItem.id}_${date}_${studentId}`;const record=await ClassDB.get('records',id);
    if(!record){await ClassDB.put('records',{id,type:'certificate',classId:classItem.id,studentId,date,tags:[],text:''});showToast('渡したとして記録しました');renderCertificates();return;}
    const student=await ClassDB.get('students',studentId);
    const tags=await ClassDB.getMeta('certificateTags',['最後まで取り組んだ','工夫した','友達を助けた','よく発表した','丁寧に仕上げた','成長が見られた']);
    openDialog(`<h2>${esc(student.name)}のミニ賞状</h2><p class="muted">渡した理由を選び、必要ならメモを加えます。</p><form id="certificate-form"><div class="tag-list" id="certificate-tags">${tags.map(tag=>`<button type="button" class="tag-chip" data-tag="${esc(tag)}" aria-pressed="${record.tags?.includes(tag)||false}">${esc(tag)}</button>`).join('')}</div><div class="field section"><label for="certificate-text">メモ（任意）</label><textarea class="textarea" id="certificate-text">${esc(record.text||'')}</textarea></div><div class="dialog-actions"><button type="button" class="button danger" id="certificate-delete">渡すのを取り消す</button><button type="button" class="button" id="certificate-close">閉じる</button><button type="submit" class="button primary">保存</button></div></form>`);
    document.querySelectorAll('#certificate-tags [data-tag]').forEach(button=>button.addEventListener('click',()=>button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'))));
    document.getElementById('certificate-close').addEventListener('click',closeDialog);
    document.getElementById('certificate-delete').addEventListener('click',async()=>{await moveToTrash(record);closeDialog();showToast('配付を取り消しました');renderCertificates();});
    document.getElementById('certificate-form').addEventListener('submit',async event=>{event.preventDefault();const selected=[...document.querySelectorAll('#certificate-tags [aria-pressed="true"]')].map(item=>item.dataset.tag);await ClassDB.put('records',{...record,tags:selected,text:document.getElementById('certificate-text').value.trim()});closeDialog();showToast('理由メモを保存しました');renderCertificates();});
  }

  function simpleHash(value){let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return(hash>>>0).toString(36);}
  function notebookDraft(){return state.toolDraft.notebook||(state.toolDraft.notebook={date:today(),subject:'国語',unit:'',title:''});}
  function notebookSessionKey(draft){return simpleHash([draft.date,draft.subject,draft.unit,draft.title].join('|'));}

  async function renderNotebook(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-assessment';state.activeTool='assessment';
    const classItem=selectedClass();applyClassTheme(classItem);const draft=notebookDraft();const subjects=classSubjects(classItem);if(!subjects.includes(draft.subject))draft.subject=subjects[0];const sessionKey=notebookSessionKey(draft);
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='notebookAssessment'&&item.sessionKey===sessionKey&&!item.deletedAt);
    const cards=await teacherRosterCards(classItem.id,records,{orderMode:teacherOrderMode(),atDate:draft.date,status:record=>record?(record.status==='absent'?'欠席':record.status==='unsubmitted'?'未提出':record.grade):'未評価',statusClass:record=>record?(record.grade?`grade-${record.grade.toLowerCase().replace('+','plus').replace('-','minus')}`:record.status==='unsubmitted'?'alert':'warn'):''});
    app.innerHTML=teacherToolShell('ノート評価',`${pupilDateNav(draft.date,'notebook-prev','notebook-next')}<section class="panel"><div class="toolbar-line"><div><h1>${esc(classItem.name)}のノート評価</h1><p class="muted">児童名を押すと、まずBで記録します。</p></div>${teacherOrderControlHtml()}</div><div class="tool-controls"><div class="field"><label for="notebook-subject">教科</label><select class="select" id="notebook-subject">${subjects.map(subject=>`<option ${subject===draft.subject?'selected':''}>${subject}</option>`).join('')}</select></div><div class="field"><label for="notebook-unit">単元</label><input class="input" id="notebook-unit" value="${esc(draft.unit)}"></div><div class="field wide"><label for="notebook-title">題名（任意）</label><input class="input" id="notebook-title" value="${esc(draft.title)}" placeholder="空欄なら ${esc(slashDate(draft.date))}"></div></div><div class="button-row end"><button type="button" class="button primary" id="notebook-apply">この内容で表示</button></div>${operationTipHtml('評価の変え方を見る','同じ名前をもう一度押すと、A・B＋・B・B－・C・欠席・未提出から選び直せます。')}<p class="muted small">題名が空欄の場合は「${esc(draft.subject)}　${esc(draft.unit||'単元')}　${esc(slashDate(draft.date))}」と表示します。</p></section>${cards}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderNotebook);
    document.getElementById('notebook-prev').addEventListener('click',()=>{state.toolDraft.notebook={...draft,date:moveDate(draft.date,-1)};renderNotebook();});document.getElementById('notebook-next').addEventListener('click',()=>{state.toolDraft.notebook={...draft,date:moveDate(draft.date,1)};renderNotebook();});
    document.getElementById('notebook-apply').addEventListener('click',()=>{state.toolDraft.notebook={date:draft.date,subject:document.getElementById('notebook-subject').value.trim(),unit:document.getElementById('notebook-unit').value.trim(),title:document.getElementById('notebook-title').value.trim()};renderNotebook();});
    document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>handleNotebookTap(button.dataset.toolStudent)));
  }

  async function handleNotebookTap(studentId){
    const classItem=selectedClass();const draft=notebookDraft();
    if(!draft.date||!draft.subject){showToast('日付と教科を選んでください');return;}
    const sessionKey=notebookSessionKey(draft);const id=`notebook_${classItem.id}_${sessionKey}_${studentId}`;const current=await ClassDB.get('records',id);
    if(!current){await saveNotebookGrade(studentId,'B');showToast('Bで記録しました');renderNotebook();return;}
    const student=await ClassDB.get('students',studentId);
    openDialog(`<h2>${esc(student.name)}の評価</h2><div class="grade-picker"><button class="grade-button grade-a" data-grade="A">A</button><button class="grade-button grade-bplus" data-grade="B+">B＋</button><button class="grade-button grade-b large" data-grade="B">B</button><button class="grade-button grade-bminus" data-grade="B-">B－</button><button class="grade-button grade-c" data-grade="C">C</button><button class="grade-button small" data-status="absent">欠席</button><button class="grade-button small" data-status="unsubmitted">未提出</button></div><div class="dialog-actions"><button type="button" class="button" id="grade-close">閉じる</button></div>`);
    document.getElementById('grade-close').addEventListener('click',closeDialog);
    document.querySelectorAll('[data-grade]').forEach(button=>button.addEventListener('click',async()=>{await saveNotebookGrade(studentId,button.dataset.grade);closeDialog();renderNotebook();}));
    document.querySelectorAll('[data-status]').forEach(button=>button.addEventListener('click',async()=>{await saveNotebookGrade(studentId,null,button.dataset.status);closeDialog();renderNotebook();}));
  }

  async function saveNotebookGrade(studentId,grade,status='evaluated'){
    const classItem=selectedClass();const draft=notebookDraft();const sessionKey=notebookSessionKey(draft);const id=`notebook_${classItem.id}_${sessionKey}_${studentId}`;const current=await ClassDB.get('records',id);
    await ClassDB.put('records',{...(current||{}),id,type:'notebookAssessment',classId:classItem.id,studentId,date:draft.date,subject:draft.subject,unit:draft.unit,title:draft.title||slashDate(draft.date),sessionKey,grade,status});
  }

  async function weeklyData(classId){
    let records=(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>!item.deletedAt);
    const allOccurrences=records.filter(item=>item.type==='weeklyOccurrence'),allSubmissions=records.filter(item=>item.type==='weeklySubmission'),weekEnd=moveDate(currentWeekStart(),6);
    const series=new Map();
    allOccurrences.filter(item=>item.recurring&&item.seriesId).forEach(item=>{if(!series.has(item.seriesId))series.set(item.seriesId,[]);series.get(item.seriesId).push(item);});
    let pruned=false;
    for(const items of series.values()){
      const hasStarted=items.some(item=>item.dueDate<=weekEnd);if(!hasStarted)continue;
      for(const item of items.filter(row=>row.dueDate>weekEnd&&!allSubmissions.some(submission=>submission.occurrenceId===row.id))){await ClassDB.remove('records',item.id);pruned=true;}
    }
    if(pruned)records=(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>!item.deletedAt);
    const occurrences=records.filter(item=>item.type==='weeklyOccurrence'&&item.dueDate<=moveDate(currentWeekStart(),6)).sort((a,b)=>b.dueDate.localeCompare(a.dueDate));
    const submissions=records.filter(item=>item.type==='weeklySubmission');
    return{occurrences,submissions};
  }

  function missingRecurringWeeks(data){
    const week=currentWeekStart(),latestBySeries=new Map();
    data.occurrences.filter(item=>item.recurring&&item.seriesId).forEach(item=>{const current=latestBySeries.get(item.seriesId);if(!current||item.dueDate>current.dueDate)latestBySeries.set(item.seriesId,item);});
    return[...latestBySeries.values()].filter(item=>!data.occurrences.some(row=>row.seriesId===item.seriesId&&mondayOf(row.dueDate)===week));
  }

  async function createCurrentWeeklyOccurrences(items){
    const week=currentWeekStart();let first=null;
    for(const source of items){const offset=Math.max(0,Math.min(6,daysBetween(source.dueDate,source.weekStart||mondayOf(source.dueDate))));const dueDate=moveDate(week,offset);const saved=await ClassDB.put('records',{id:ClassDB.uid('weeklyOccurrence'),type:'weeklyOccurrence',classId:selectedClass().id,studentId:null,date:dueDate,dueDate,weekStart:week,title:source.title,seriesId:source.seriesId,recurring:true});if(!first)first=saved;}
    if(first)state.toolDraft.weekly={occurrenceId:first.id,dueDate:first.dueDate,title:first.title};
    return first;
  }

  function weeklyRenewalNotice(items,mode){if(!items.length)return'';return`<div class="notice weekly-renewal"><div><strong>今週分がまだ作成されていません</strong><div class="row-meta">${esc(items.map(item=>item.title).join('・'))}を今週も使う場合は作成してください。</div></div><button type="button" class="button primary" data-create-current-week data-create-mode="${mode}">今週分を作る</button></div>`;}

  function wireWeeklyRenewal(items,mode,afterCreate){document.querySelector('[data-create-current-week]')?.addEventListener('click',()=>{const create=async()=>{await createCurrentWeeklyOccurrences(items);showToast('今週分の宿題を作成しました');afterCreate();};if(mode==='pupil')requireTeacher(create);else create();});}

  async function maybePromptWeeklyCreation(mode='teacher'){
    const classItem=selectedClass();if(!classItem)return;const data=await weeklyData(classItem.id),missing=missingRecurringWeeks(data);if(!missing.length)return;
    const key=`${classItem.id}|${currentWeekStart()}|${mode}`;if(state.weeklyPromptShown.has(key))return;state.weeklyPromptShown.add(key);
    openDialog(`<h2>今週の新しい宿題を作りますか？</h2><p>${esc(missing.map(item=>item.title).join('・'))}が「毎週」に設定されています。</p><p class="muted">作成すると、今週の提出状況を新しく記録できます。今は閉じても、週宿題画面から作成できます。</p><div class="dialog-actions"><button type="button" class="button" id="weekly-renew-later">今は作らない</button><button type="button" class="button primary" id="weekly-renew-create">今週分を作る</button></div>`);
    document.getElementById('weekly-renew-later').addEventListener('click',closeDialog);
    document.getElementById('weekly-renew-create').addEventListener('click',()=>{const create=async()=>{await createCurrentWeeklyOccurrences(missing);closeDialog();showToast('今週分の宿題を作成しました');if(mode==='pupil')renderPupil('all');else renderHome();};if(mode==='pupil'){closeDialog();requireTeacher(create);}else create();});
  }

  async function renderWeekly(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-weekly';state.activeTool='weekly';
    const classItem=selectedClass();applyClassTheme(classItem);const data=await weeklyData(classItem.id);const missingRecurring=missingRecurringWeeks(data);
    let draft=state.toolDraft.weekly;
    if(!draft){const latest=data.occurrences[0];draft=state.toolDraft.weekly={occurrenceId:latest?.id||null,dueDate:latest?.dueDate||today(),title:latest?.title||'自主学習'};}
    let occurrence=data.occurrences.find(item=>item.id===draft.occurrenceId)||null;
    if(!occurrence&&data.occurrences.length){occurrence=data.occurrences[0];draft.occurrenceId=occurrence.id;draft.dueDate=occurrence.dueDate;draft.title=occurrence.title;}
    const currentSubmissions=occurrence?data.submissions.filter(item=>item.occurrenceId===occurrence.id):[];
    const missingByStudent=new Map();
    const dueOccurrences=data.occurrences.filter(item=>mondayOf(item.dueDate)===currentWeekStart()&&item.dueDate<=today());
    const roster=await rosterForClass(classItem.id,false,occurrence?.dueDate||today());
    roster.forEach(row=>{const missing=dueOccurrences.filter(week=>!data.submissions.some(item=>item.studentId===row.student.id&&item.occurrenceId===week.id&&item.status==='submitted'));missingByStudent.set(row.student.id,missing);});
    const cards=await teacherRosterCards(classItem.id,currentSubmissions,{orderMode:teacherOrderMode(),preserveSeatShape:true,atDate:occurrence?.dueDate||today(),status:(record,row)=>{const missing=missingByStudent.get(row.student.id);const missed=missing.length;const maxAge=missing.length?Math.max(...missing.map(item=>Math.floor((new Date(today())-new Date(item.dueDate))/86400000))):0;if(record?.status==='submitted')return missed?`提出済み・過去未提出 ${missed}週`:'提出済み';if(record?.status==='forgotten')return'忘れた';if(missed>=2)return`${missed}週未提出`;if(maxAge>=7)return'7日以上未提出';if(maxAge>=5)return'5日以上未提出';if(occurrence?.dueDate<today())return'未提出';return missed?'過去分未提出':'未提出';},statusClass:(record,row)=>{const missing=missingByStudent.get(row.student.id);const maxAge=missing.length?Math.max(...missing.map(item=>Math.floor((new Date(today())-new Date(item.dueDate))/86400000))):0;if(record?.status==='forgotten'||missing.length>=2||maxAge>=7)return'alert';if(maxAge>=5)return'warn';return record?.status==='submitted'?'good':'';}});
    app.innerHTML=teacherToolShell('週宿題',`${weeklyRenewalNotice(missingRecurring,'teacher')}<section class="panel"><div class="toolbar-line"><div><h1>${esc(classItem.name)}の週宿題</h1><p class="muted">今週の宿題を選び、児童名を押して記録します。</p></div>${teacherOrderControlHtml()}</div>${operationTipHtml('押し方と週の扱いを見る','押すたびに、提出 → 忘れた → 未提出の順で変わります。毎週の宿題は、月曜日以降に今週分だけ作成します。')}<div class="weekly-heading"><div class="field"><label for="weekly-select">表示する宿題・週</label><select class="select" id="weekly-select">${data.occurrences.map(item=>`<option value="${item.id}" ${item.id===occurrence?.id?'selected':''}>${esc(shortJpDate(item.dueDate))}　${esc(item.title)}</option>`).join('')}</select></div><button type="button" class="button primary" id="weekly-create">＋ 新しい宿題を作る</button></div>${occurrence?`<p class="current-item"><strong>${esc(occurrence.title)}</strong>　提出予定 ${esc(jpDate(occurrence.dueDate))}${occurrence.recurring?'　・毎週繰り返し':''}</p>`:'<div class="empty-state"><h2>週宿題はまだありません</h2><p>「＋ 新しい宿題を作る」から最初の宿題を登録してください。</p></div>'}<p class="muted small">過去週の提出状況は、児童カードの「詳細」から確認できます。予定日から5日で黄色、7日で赤の目安です。</p></section>${occurrence?cards:''}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderWeekly);
    document.getElementById('weekly-select')?.addEventListener('change',event=>{const selected=data.occurrences.find(item=>item.id===event.target.value);state.toolDraft.weekly={occurrenceId:selected.id,dueDate:selected.dueDate,title:selected.title};renderWeekly();});
    document.getElementById('weekly-create').addEventListener('click',openWeeklyCreator);
    wireWeeklyRenewal(missingRecurring,'teacher',renderWeekly);
    document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>handleTeacherWeeklyTap(button.dataset.toolStudent,occurrence)));
  }

  function mondayOf(value){const date=new Date(`${value}T00:00:00`),day=(date.getDay()+6)%7;date.setDate(date.getDate()-day);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function openWeeklyCreator(){openDialog(`<h2>新しい宿題を作る</h2><form id="weekly-create-form"><div class="field"><label for="weekly-new-title">宿題名</label><input class="input" id="weekly-new-title" value="自主学習" required autofocus></div><div class="field section"><label for="weekly-new-date">今週の提出予定日</label><input class="input" id="weekly-new-date" type="date" value="${today()}" required><span class="muted small">週は月曜日から日曜日で扱います。</span></div><label class="check-row"><input type="checkbox" id="weekly-recurring" checked> 毎週の宿題として、次週以降も確認する</label><p class="muted small">年度末まで先に作ることはありません。次の月曜日以降、今週分を作るか確認します。チェックを外すと今週限りです。</p><p class="error" id="weekly-create-error"></p><div class="dialog-actions"><button type="button" class="button" id="weekly-create-cancel">キャンセル</button><button type="submit" class="button primary">作成する</button></div></form>`);document.getElementById('weekly-create-cancel').addEventListener('click',closeDialog);document.getElementById('weekly-create-form').addEventListener('submit',async event=>{event.preventDefault();const title=document.getElementById('weekly-new-title').value.trim(),dueDate=document.getElementById('weekly-new-date').value,recurring=document.getElementById('weekly-recurring').checked;if(!title||!dueDate)return;const seriesId=ClassDB.uid('weeklySeries');const first=await ClassDB.put('records',{id:ClassDB.uid('weeklyOccurrence'),type:'weeklyOccurrence',classId:selectedClass().id,studentId:null,date:dueDate,dueDate,weekStart:mondayOf(dueDate),title,seriesId,recurring});state.toolDraft.weekly={occurrenceId:first.id,dueDate:first.dueDate,title};closeDialog();showToast(recurring?'毎週の宿題として登録しました':'今週限りの宿題を作成しました');renderWeekly();});}
  async function handleTeacherWeeklyTap(studentId,occurrence){if(!occurrence)return;const id=`weekly_${occurrence.id}_${studentId}`,current=await ClassDB.get('records',id),next=current?.status==='submitted'?'forgotten':current?.status==='forgotten'?'unsubmitted':'submitted';await ClassDB.put('records',{...(current||{}),id,type:'weeklySubmission',classId:selectedClass().id,studentId,date:occurrence.dueDate,dueDate:occurrence.dueDate,title:occurrence.title,occurrenceId:occurrence.id,status:next});markFeedback(studentId,next);showToast(next==='submitted'?'提出にしました':next==='forgotten'?'忘れたにしました':'未提出に戻しました');renderWeekly();}

  async function openWeeklyStudent(studentId){
    const classItem=selectedClass();const student=await ClassDB.get('students',studentId);const data=await weeklyData(classItem.id);
    const checked=new Set(data.submissions.filter(item=>item.studentId===studentId&&item.status==='submitted').map(item=>item.occurrenceId));
    openDialog(`<h2>${esc(student.name)}の週宿題</h2><p class="muted">提出された週を選びます。選択を外して保存すると、提出済みを取り消せます。</p><form id="weekly-student-form"><div class="list">${data.occurrences.map(item=>{const age=Math.floor((new Date(today())-new Date(item.dueDate))/86400000);const warning=!checked.has(item.id)&&age>=7?'・7日以上':!checked.has(item.id)&&age>=5?'・5日以上':'';return`<label class="list-row"><span><strong>${esc(jpDate(item.dueDate))}</strong><span class="row-meta">${esc(item.title)}${warning}</span></span><input type="checkbox" data-occurrence="${item.id}" ${checked.has(item.id)?'checked':''}></label>`;}).join('')||'<p>登録済みの週がありません。</p>'}</div><div class="dialog-actions"><button type="button" class="button" id="weekly-student-close">閉じる</button><button type="submit" class="button primary">保存</button></div></form>`);
    document.getElementById('weekly-student-close').addEventListener('click',closeDialog);
    document.getElementById('weekly-student-form').addEventListener('submit',async event=>{event.preventDefault();const selected=new Set([...document.querySelectorAll('[data-occurrence]:checked')].map(item=>item.dataset.occurrence));for(const occurrence of data.occurrences){const id=`weekly_${occurrence.id}_${studentId}`;const existing=await ClassDB.get('records',id);if(selected.has(occurrence.id))await ClassDB.put('records',{...(existing||{}),id,type:'weeklySubmission',classId:classItem.id,studentId,date:occurrence.dueDate,dueDate:occurrence.dueDate,title:occurrence.title,occurrenceId:occurrence.id,status:'submitted'});else if(existing?.status==='submitted')await ClassDB.put('records',{...existing,status:'unsubmitted'});}closeDialog();showToast('週宿題を更新しました');renderWeekly();});
  }

  async function occasionalData(classId){
    const records=(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>!item.deletedAt);
    return{items:records.filter(item=>item.type==='occasionalItem').sort((a,b)=>(a.archived-b.archived)||b.dueDate.localeCompare(a.dueDate)),submissions:records.filter(item=>item.type==='occasionalSubmission')};
  }

  async function renderOccasional(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-occasional';state.activeTool='occasional';
    const classItem=selectedClass();applyClassTheme(classItem);const data=await occasionalData(classItem.id);
    let selectedId=state.toolDraft.occasionalId;
    if(!data.items.some(item=>item.id===selectedId))selectedId=data.items.find(item=>!item.archived)?.id||data.items[0]?.id||null;
    state.toolDraft.occasionalId=selectedId;const item=data.items.find(row=>row.id===selectedId)||null;
    const submissions=item?data.submissions.filter(row=>row.itemId===item.id):[];const roster=await rosterForClass(classItem.id,false,item?.dueDate||today());const itemCards=data.items.map(row=>{const submitted=new Set(data.submissions.filter(record=>record.itemId===row.id&&record.status==='submitted').map(record=>record.studentId)).size;return`<button type="button" class="submission-item-card ${row.id===item?.id?'active':''}" data-occasional-item="${row.id}" title="${esc(row.title)}の提出状況を開く"><span>${row.archived?'完結':'対応中'}</span><strong>${esc(row.title)}</strong><small>${esc(shortJpDate(row.dueDate))}・未提出 ${Math.max(0,roster.length-submitted)}人</small></button>`;}).join('');
    const cards=await teacherRosterCards(classItem.id,submissions,{orderMode:teacherOrderMode(),preserveSeatShape:true,atDate:item?.dueDate||today(),status:record=>record?.status==='submitted'?'提出済み':'未提出',statusClass:record=>record?.status==='submitted'?'good':'alert'});
    app.innerHTML=teacherToolShell('提出物',`<section class="panel"><div class="toolbar-line"><div><h1>${esc(classItem.name)}の提出物</h1><p class="muted">集める書類などを登録し、提出状況を確認します。</p></div><button type="button" class="button primary" id="occasional-create">＋ 新しい提出物を作る</button></div><div class="submission-item-list section">${itemCards||'<div class="empty-state"><h2>提出物はまだありません</h2><p>右上の「＋ 新しい提出物を作る」から登録してください。</p></div>'}</div></section>${item?`<section class="panel"><p class="current-item"><strong>${esc(item.title)}</strong>　提出予定 ${esc(jpDate(item.dueDate))}・${item.archived?'回収終了':'回収中'}</p><div class="toolbar-line section"><p class="muted small">児童名を押して提出済みにします。</p><div class="button-row"><button type="button" class="button" id="occasional-edit">内容を編集</button><button type="button" class="button" id="occasional-archive">${item.archived?'回収を再開する':'回収を終える'}</button>${teacherOrderControlHtml()}</div></div></section>${cards}`:''}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderOccasional);
    document.querySelectorAll('[data-occasional-item]').forEach(button=>button.addEventListener('click',()=>{state.toolDraft.occasionalId=button.dataset.occasionalItem;renderOccasional();}));
    document.getElementById('occasional-create').addEventListener('click',()=>openOccasionalEditor());document.getElementById('occasional-edit')?.addEventListener('click',()=>openOccasionalEditor(item));
    document.getElementById('occasional-archive')?.addEventListener('click',async()=>{await ClassDB.put('records',{...item,archived:!item.archived});showToast(item.archived?'提出物の回収を再開しました':'提出物の回収を終了しました');renderOccasional();});
    document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>toggleOccasionalStudent(button.dataset.toolStudent,item)));
  }

  function openOccasionalEditor(item=null){openDialog(`<h2>${item?'提出物を編集':'新しい提出物を作る'}</h2><form id="occasional-form"><div class="field"><label for="occasional-title">提出物名</label><input class="input" id="occasional-title" value="${esc(item?.title||'')}" placeholder="例：同意書" required autofocus></div><div class="field section"><label for="occasional-date">提出予定日</label><input class="input" id="occasional-date" type="date" value="${item?.dueDate||today()}" required></div><label class="check-row"><input type="checkbox" id="occasional-continue" ${item?.continueDisplay!==false?'checked':''}> 未提出者がいる間は翌日以降も表示する</label><p class="error" id="occasional-error"></p><div class="dialog-actions"><button type="button" class="button" id="occasional-cancel">キャンセル</button><button type="submit" class="button primary">保存して表示</button></div></form>`);document.getElementById('occasional-cancel').addEventListener('click',closeDialog);document.getElementById('occasional-form').addEventListener('submit',async event=>{event.preventDefault();const dueDate=document.getElementById('occasional-date').value,title=document.getElementById('occasional-title').value.trim();if(!dueDate||!title)return;const saved=await ClassDB.put('records',{...(item||{}),id:item?.id||ClassDB.uid('occasionalItem'),type:'occasionalItem',classId:selectedClass().id,studentId:null,date:dueDate,dueDate,title,continueDisplay:document.getElementById('occasional-continue').checked,archived:item?.archived||false});state.toolDraft.occasionalId=saved.id;closeDialog();showToast('提出物を保存しました');renderOccasional();});}

  async function toggleOccasionalStudent(studentId,item){
    if(!item||item.archived)return;
    const id=`occasional_${item.id}_${studentId}`;const existing=await ClassDB.get('records',id);
    if(!existing||existing.status!=='submitted'){await ClassDB.put('records',{...(existing||{}),id,type:'occasionalSubmission',classId:selectedClass().id,studentId,date:today(),dueDate:item.dueDate,title:item.title,itemId:item.id,status:'submitted'});markFeedback(studentId,'submitted');showToast('提出済みにしました');renderOccasional();return;}
    const student=await ClassDB.get('students',studentId);
    openDialog(`<h2>提出済みを取り消しますか</h2><p>${esc(student.name)}の「${esc(item.title)}」を未提出へ戻します。</p><div class="dialog-actions"><button type="button" class="button" id="occasional-cancel">戻る</button><button type="button" class="button danger" id="occasional-confirm">提出を取り消す</button></div>`);
    document.getElementById('occasional-cancel').addEventListener('click',closeDialog);
    document.getElementById('occasional-confirm').addEventListener('click',async()=>{await ClassDB.put('records',{...existing,status:'unsubmitted'});markFeedback(studentId,'unsubmitted');closeDialog();showToast('未提出へ戻しました');renderOccasional();});
  }

  async function supportUnits(classId,subject){
    const records=(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>item.type==='currentUnit'&&item.subject===subject&&!item.deletedAt);
    return records.sort((a,b)=>(a.order||0)-(b.order||0));
  }

  async function ensureSupportUnits(classId,subject){
    let units=await supportUnits(classId,subject);if(units.length)return units;
    const roster=await rosterForClass(classId);await ClassDB.put('records',{id:ClassDB.uid('currentUnit'),type:'currentUnit',classId,studentId:null,date:today(),subject,name:'単元未設定',memberIds:roster.map(row=>row.student.id),order:0});
    return supportUnits(classId,subject);
  }

  function supportDraft(){return state.toolDraft.support||(state.toolDraft.support={date:today(),subject:'国語'});}

  async function renderSupport(){
    if(!teacherActive()){renderPupil();return;}const classItem=selectedClass();if(!isSupportClass(classItem)){showToast('クラス設定で「個別支援級にする」を選ぶと使用できます');renderHome();return;}
    state.route='teacher-support';state.activeTool='support';applyClassTheme(classItem);const draft=supportDraft();const subjects=classSubjects(classItem);if(!subjects.includes(draft.subject))draft.subject=subjects[0];const roster=await rosterForClass(classItem.id);const units=await ensureSupportUnits(classItem.id,draft.subject);
    const termStart=today()<=state.year.firstTermEnd?state.year.startDate:state.year.firstTermEnd;const allRecords=await ClassDB.getAllByIndex('records','classId',classItem.id);const subjectRecords=allRecords.filter(item=>item.type==='supportRecord'&&item.subject===draft.subject&&item.date>=termStart&&!item.deletedAt);const counts=new Map(roster.map(row=>[row.student.id,subjectRecords.filter(item=>item.studentId===row.student.id).length]));const average=roster.length?[...counts.values()].reduce((sum,value)=>sum+value,0)/roster.length:0;
    const unitForStudent=studentId=>units.find(unit=>(unit.memberIds||[]).includes(studentId));
    const supportButton=row=>{const count=counts.get(row.student.id)||0;const level=count===0?'none':count<=2?'very-low':average>0&&count<average*.7?'low':'';const label=count===0?'記録なし':count<=2?'かなり少ない':level==='low'?'やや少なめ':`${count}件`;return`<button type="button" class="${level}" data-support-student="${row.student.id}">${esc(row.student.name)}<span>${label}</span></button>`;};
    const groups=units.map(unit=>`<section class="support-unit"><span class="unit-kicker">現在の単元</span><h2>${esc(unit.name)}</h2><div class="support-pupils">${roster.filter(row=>(unit.memberIds||[]).includes(row.student.id)).map(supportButton).join('')||'<span class="muted">児童なし</span>'}</div></section>`).join('');
    const unassigned=roster.filter(row=>!unitForStudent(row.student.id));
    app.innerHTML=teacherToolShell('学習記録',`${pupilDateNav(draft.date,'support-prev','support-next')}<section class="panel"><div class="button-row" style="justify-content:space-between"><div><h1>${esc(classItem.name)}の学習記録</h1><p class="muted">教科を選び、記録したい児童を押します。同じ単元の児童はまとまって表示されます。</p></div><button type="button" class="button" id="edit-units">学習するまとまりを変更</button></div><div class="field" style="max-width:260px"><label for="support-subject">記録する教科</label><select class="select" id="support-subject">${subjects.map(subject=>`<option ${subject===draft.subject?'selected':''}>${subject}</option>`).join('')}</select></div></section><div class="support-unit-grid">${groups}${unassigned.length?`<section class="support-unit alert"><span class="unit-kicker">確認が必要</span><h2>現在の単元が未設定</h2><div class="support-pupils">${unassigned.map(supportButton).join('')}</div></section>`:''}</div>`);
    wireToolHome();document.getElementById('support-prev').addEventListener('click',()=>{draft.date=moveDate(draft.date,-1);renderSupport();});document.getElementById('support-next').addEventListener('click',()=>{draft.date=moveDate(draft.date,1);renderSupport();});
    document.getElementById('support-subject').addEventListener('change',event=>{draft.subject=event.target.value;renderSupport();});document.getElementById('edit-units').addEventListener('click',renderUnitManager);
    document.querySelectorAll('[data-support-student]').forEach(button=>button.addEventListener('click',()=>openSupportRecord(button.dataset.supportStudent)));
  }

  async function renderUnitManager(){
    if(!teacherActive()){renderPupil();return;}state.route='teacher-unit-manager';const classItem=selectedClass();const draft=supportDraft();const roster=await rosterForClass(classItem.id);const units=await ensureSupportUnits(classItem.id,draft.subject);
    const assigned=new Set(units.flatMap(unit=>unit.memberIds||[]));
    app.innerHTML=teacherToolShell('現在の学習単元',`<section class="panel"><div class="button-row" style="justify-content:space-between"><div><h1>${esc(draft.subject)}で学習するまとまり</h1><p class="muted">同じ単元を学ぶ児童を同じ欄へ入れます。児童名を押し、移動先の欄を押してください。PCではドラッグもできます。</p></div><button type="button" class="button primary" id="add-unit">別の単元を追加</button></div></section><div class="unit-board">${units.map(unit=>unitEditorHtml(unit,roster)).join('')}<section class="unit-column" data-unit-drop=""><span class="unit-kicker">確認が必要</span><h2>単元未設定</h2><div class="unit-students">${roster.filter(row=>!assigned.has(row.student.id)).map(row=>unitStudentHtml(row.student)).join('')||'<span class="muted">児童なし</span>'}</div></section></div><div class="button-row end section"><button type="button" class="button primary" id="units-done">学習記録へ戻る</button></div>`);
    wireToolHome();document.getElementById('units-done').addEventListener('click',renderSupport);document.getElementById('add-unit').addEventListener('click',()=>openUnitEditor());
    document.querySelectorAll('[data-edit-unit]').forEach(button=>button.addEventListener('click',()=>openUnitEditor(units.find(unit=>unit.id===button.dataset.editUnit))));
    let movingStudentId=null;
    document.querySelectorAll('[data-unit-student]').forEach(button=>{button.addEventListener('dragstart',event=>{movingStudentId=button.dataset.unitStudent;event.dataTransfer.setData('text/plain',movingStudentId);});button.addEventListener('click',()=>{movingStudentId=button.dataset.unitStudent;document.querySelectorAll('[data-unit-student]').forEach(item=>item.classList.toggle('selected',item===button));showToast('移動先の単元を選んでください');});});
    document.querySelectorAll('[data-unit-drop]').forEach(column=>{column.addEventListener('dragover',event=>event.preventDefault());column.addEventListener('drop',async event=>{event.preventDefault();await moveSupportStudent(event.dataTransfer.getData('text/plain')||movingStudentId,column.dataset.unitDrop,units);});column.addEventListener('click',async event=>{if(event.target.closest('[data-unit-student],[data-edit-unit]')||!movingStudentId)return;await moveSupportStudent(movingStudentId,column.dataset.unitDrop,units);});});
  }

  function unitEditorHtml(unit,roster){return `<section class="unit-column" data-unit-drop="${unit.id}"><span class="unit-kicker">現在の単元</span><div class="button-row" style="justify-content:space-between"><h2>${esc(unit.name)}</h2><button type="button" class="detail-button" data-edit-unit="${unit.id}">単元名を編集</button></div><div class="unit-students">${roster.filter(row=>(unit.memberIds||[]).includes(row.student.id)).map(row=>unitStudentHtml(row.student)).join('')||'<span class="muted">児童名を選んで、この欄を押します</span>'}</div></section>`;}
  function unitStudentHtml(student){return `<button type="button" class="unit-student" draggable="true" data-unit-student="${student.id}">${esc(student.name)}</button>`;}
  async function moveSupportStudent(studentId,targetUnitId,units){for(const unit of units){const members=(unit.memberIds||[]).filter(id=>id!==studentId);if(unit.id===targetUnitId)members.push(studentId);if(members.length!==(unit.memberIds||[]).length||unit.id===targetUnitId)await ClassDB.put('records',{...unit,memberIds:[...new Set(members)]});}showToast('学習単元を移動しました');renderUnitManager();}

  function openUnitEditor(unit=null){openDialog(`<h2>${unit?'単元名を編集':'現在の学習単元を追加'}</h2><form id="unit-form"><div class="field"><label for="unit-name">単元名</label><input class="input" id="unit-name" value="${esc(unit?.name||'')}" required autofocus></div><div class="dialog-actions"><button type="button" class="button" id="unit-cancel">キャンセル</button><button type="submit" class="button primary">保存</button></div></form>`);document.getElementById('unit-cancel').addEventListener('click',closeDialog);document.getElementById('unit-form').addEventListener('submit',async event=>{event.preventDefault();const draft=supportDraft();await ClassDB.put('records',{...(unit||{}),id:unit?.id||ClassDB.uid('currentUnit'),type:'currentUnit',classId:selectedClass().id,studentId:null,date:today(),subject:draft.subject,name:document.getElementById('unit-name').value.trim(),memberIds:unit?.memberIds||[],order:unit?.order??Date.now()});closeDialog();showToast('単元名を保存しました');renderUnitManager();});}

  async function openSupportRecord(studentId){
    const classItem=selectedClass();const student=await ClassDB.get('students',studentId);const draft=supportDraft();const units=await ensureSupportUnits(classItem.id,draft.subject);const unit=units.find(item=>(item.memberIds||[]).includes(studentId));const configured=await ClassDB.getMeta('supportTags',SUPPORT_TAGS);const categories=Object.keys(configured);let selectedCategories=[];let selectedTags={};let activeCategory=null;
    openDialog(`<h2>${esc(student.name)}の記録</h2><p class="muted">${esc(draft.subject)}・${esc(unit?.name||'単元未設定')}・${esc(shortJpDate(draft.date))}</p><form id="support-record-form"><p class="field-label">当てはまる項目</p><div class="tag-list" id="support-categories">${categories.map(category=>`<button type="button" class="tag-chip" data-support-category="${esc(category)}" aria-pressed="false">${esc(category)}</button>`).join('')}</div><div id="support-tags-area" class="section"></div><div class="field section"><label for="support-text">自由記述（任意）</label><textarea class="textarea" id="support-text"></textarea></div><div class="dialog-actions"><button type="button" class="button" id="support-cancel">キャンセル</button><button type="submit" class="button">保存</button><button type="button" class="button primary" id="support-save-next">保存して次の児童</button></div></form>`);
    const renderTags=()=>{const area=document.getElementById('support-tags-area');if(!activeCategory||!selectedCategories.includes(activeCategory)){area.innerHTML='';return;}area.innerHTML=`<p class="field-label">${esc(activeCategory)}のタグ</p><div class="tag-list">${(configured[activeCategory]||[]).map(tag=>`<button type="button" class="tag-chip" data-support-tag="${esc(tag)}" aria-pressed="${selectedTags[activeCategory]?.includes(tag)||false}">${esc(tag)}</button>`).join('')}</div>`;area.querySelectorAll('[data-support-tag]').forEach(button=>button.addEventListener('click',()=>{const list=selectedTags[activeCategory]||(selectedTags[activeCategory]=[]);if(list.includes(button.dataset.supportTag))selectedTags[activeCategory]=list.filter(tag=>tag!==button.dataset.supportTag);else list.push(button.dataset.supportTag);renderTags();}));};
    document.querySelectorAll('[data-support-category]').forEach(button=>button.addEventListener('click',()=>{const category=button.dataset.supportCategory;if(selectedCategories.includes(category)){selectedCategories=selectedCategories.filter(item=>item!==category);button.setAttribute('aria-pressed','false');if(activeCategory===category)activeCategory=selectedCategories.at(-1)||null;}else{selectedCategories.push(category);button.setAttribute('aria-pressed','true');activeCategory=category;}renderTags();}));
    document.getElementById('support-cancel').addEventListener('click',closeDialog);document.getElementById('support-record-form').addEventListener('submit',async event=>{event.preventDefault();await saveSupportRecord(studentId,unit,selectedCategories,selectedTags);closeDialog();renderSupport();});document.getElementById('support-save-next').addEventListener('click',async()=>{await saveSupportRecord(studentId,unit,selectedCategories,selectedTags);const roster=await rosterForClass(classItem.id);const index=roster.findIndex(row=>row.student.id===studentId);closeDialog();if(index<roster.length-1)openSupportRecord(roster[index+1].student.id);else{showToast('最後の児童まで保存しました');renderSupport();}});
  }

  async function saveSupportRecord(studentId,unit,categories,tags){const draft=supportDraft();await ClassDB.put('records',{id:ClassDB.uid('supportRecord'),type:'supportRecord',classId:selectedClass().id,studentId,date:draft.date,subject:draft.subject,unitId:unit?.id||null,unit:unit?.name||'単元未設定',categories,tags,text:document.getElementById('support-text').value.trim()});showToast('学習記録を保存しました');}
