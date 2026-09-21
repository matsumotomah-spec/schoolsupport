"use strict";

  async function restoreTrashRecord(trashId){const item=await ClassDB.get('trash',trashId);if(!item?.record)return 0;let items=[item],relatedRecords=[];const record=item.record,timestamp=ClassDB.now(),deviceId=ClassDB.deviceId(),puts={};
    if(record.type==='weeklyOccurrence'){const allTrash=await ClassDB.getAll('trash');items=allTrash.filter(row=>row.id===item.id||(row.record?.type==='weeklySubmission'&&row.record?.occurrenceId===record.id));if(record.recurring&&record.seriesId&&record.seriesActive!==false){relatedRecords=(await ClassDB.getAllByIndex('records','classId',record.classId)).filter(row=>row.type==='weeklyOccurrence'&&row.seriesId===record.seriesId).map(row=>({...row,seriesActive:true,updatedAt:timestamp,deviceId}));const skipped=await ClassDB.getMeta('weeklySkippedWeeks',[]),skipKey=`${record.classId}|${record.seriesId}|${mondayOf(record.dueDate)}`;puts.meta=[{key:'weeklySkippedWeeks',value:(Array.isArray(skipped)?skipped:[]).filter(key=>key!==skipKey),updatedAt:timestamp,deviceId}];}}
    puts.records=[...items.map(row=>{const restored={...row.record,updatedAt:timestamp,deviceId};delete restored.deletedAt;return restored;}),...relatedRecords];await ClassDB.applyBatch({puts,deletes:{trash:items.map(row=>row.id)}});return items.length;
  }

  async function resetToWelcomePreservingLegacy(){
    await ClassDB.resetAll();
    localStorage.removeItem(PIN_ATTEMPT_KEY);
    clearTimeout(state.lockTimer);
    Object.assign(state,{year:null,classes:[],selectedClassId:null,teacherUntil:0,sessionSecret:null,pinFailures:0,pinLockedUntil:0,route:'setup',settingsTab:'guide',classSettingsView:'list',rosterDraft:[],rosterLoadedForClassId:null,activeTool:null,toolDraft:{},pupilTool:'all',pupilDate:null,pupilWeeklyId:null,pupilOccasionalId:null,migrationSources:[],migrationPromptShown:false,verifiedLegacyCleanupKeys:[],setupDraft:null,rolloverArchiveVerified:null,rolloverDraft:null,rolloverContinue:false,lockTimer:null,dataInSettings:false,weeklyPromptShown:new Set(),feedback:null,iconMode:'standard',emojiIcons:{...DEFAULT_EMOJI_ICONS},rewardIcon:'✨',showMonthlyForgotten:true,pupilKanaMode:false,showExplanations:true,onboardingStep:0});
    state.pcPinlessMode=false;
    renderSetup();
  }

  async function confirmDeleteAllData(){
    const counts={classes:(await ClassDB.getAll('classes')).length,students:(await ClassDB.getAll('students')).length,records:(await ClassDB.getAll('records')).length};
    openDialog(`<h2>このアプリの全データを削除しますか</h2><p>年度設定、教師用PIN、クラス ${counts.classes}件、児童 ${counts.students}人、記録 ${counts.records}件をこの端末から削除します。</p><p class="notice"><strong>旧版ツールのデータは削除しません。</strong><br>次回は「ようこそ」画面から始まり、旧データを移行するか選べます。</p><p class="error">この操作は元に戻せません。必要なら先に暗号化バックアップを保存してください。</p><label class="check-row"><input type="checkbox" id="delete-all-confirm-check"> 内容を確認し、全データを削除します</label><div class="dialog-actions"><button type="button" class="button" id="delete-all-cancel">キャンセル</button><button type="button" class="button danger" id="delete-all-confirm" disabled>全データを削除</button></div>`);
    const check=document.getElementById('delete-all-confirm-check'),button=document.getElementById('delete-all-confirm');
    check.addEventListener('change',()=>button.disabled=!check.checked);
    document.getElementById('delete-all-cancel').addEventListener('click',closeDialog);
    button.addEventListener('click',event=>runOnce(event.currentTarget,async()=>{closeDialog();await resetToWelcomePreservingLegacy();showToast('全データを削除しました');}));
  }

  async function confirmDeleteClassRecords(){const classItem=selectedClass();if(!classItem)return;const records=await ClassDB.getAllByIndex('records','classId',classItem.id);openDialog(`<h2>${esc(classItem.name)}の記録を削除しますか</h2><p>宿題・提出物・評価・メモなど ${records.length}件を30日間ごみ箱へ移します。名簿とクラス設定は残ります。</p><div class="dialog-actions"><button type="button" class="button" id="records-delete-cancel">キャンセル</button><button type="button" class="button danger" id="records-delete-confirm">${records.length}件を削除</button></div>`);document.getElementById('records-delete-cancel').addEventListener('click',closeDialog);document.getElementById('records-delete-confirm').addEventListener('click',async()=>{const timestamp=ClassDB.now(),deviceId=ClassDB.deviceId(),meta={key:'lastLegacyMigration',value:null,updatedAt:timestamp,deviceId};await ClassDB.applyBatch({puts:{trash:records.map(trashEntryFor),meta:[meta]},deletes:{records:records.map(record=>record.id)}});closeDialog();showToast(`${records.length}件をごみ箱へ移動しました`);renderDataExchange(true);});}

  async function confirmDeleteCurrentClass(){const classItem=selectedClass();if(!classItem)return;const roster=(await rosterForClass(classItem.id)).length,records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).length;openDialog(`<h2>${esc(classItem.name)}を削除しますか</h2><p>名簿 ${roster}人、記録 ${records}件が対象です。以前の形式のデータは削除しません。</p><p class="error">この操作は元に戻せません。必要なら先に暗号化バックアップを保存してください。</p><div class="dialog-actions"><button type="button" class="button" id="class-delete-cancel">キャンセル</button><button type="button" class="button danger" id="class-delete-confirm">クラスを削除</button></div>`);document.getElementById('class-delete-cancel').addEventListener('click',closeDialog);document.getElementById('class-delete-confirm').addEventListener('click',async()=>{const enrollments=await ClassDB.getAllByIndex('enrollments','classId',classItem.id),classRecords=await ClassDB.getAllByIndex('records','classId',classItem.id),allEnrollments=await ClassDB.getAll('enrollments'),studentIds=new Set(enrollments.map(item=>item.studentId)),usedElsewhere=new Set(allEnrollments.filter(item=>item.classId!==classItem.id).map(item=>item.studentId));state.classes=state.classes.filter(item=>item.id!==classItem.id);state.selectedClassId=state.classes[0]?.id||null;const timestamp=ClassDB.now(),deviceId=ClassDB.deviceId(),meta=[{key:'selectedClassId',value:state.selectedClassId,updatedAt:timestamp,deviceId},{key:'lastLegacyMigration',value:null,updatedAt:timestamp,deviceId}];await ClassDB.applyBatch({puts:{meta},deletes:{records:classRecords.map(item=>item.id),enrollments:enrollments.map(item=>item.id),classes:[classItem.id],students:[...studentIds].filter(id=>!usedElsewhere.has(id)),meta:[`seatingSettings_${classItem.id}`]}});closeDialog();if(!state.classes.length){await resetToWelcomePreservingLegacy();showToast('クラスがなくなったため、初期設定へ戻りました');}else renderHome();});}

  async function inspectArchiveFile(file){
    if(!file)return;try{const envelope=validateEncryptedEnvelope(JSON.parse(await readImportText(file,'保管ファイル')));openDialog(`<h2>${esc(envelope.yearLabel||'保管年度')}を確認</h2><p class="panel small">パスワードのヒント：${esc(envelope.passwordHint||'ファイル表面には保存されていません')}</p><form id="archive-inspect-form"><div class="field"><label for="archive-method">開く方法</label><select class="select" id="archive-method"><option value="password">年度パスワード</option><option value="recovery">復旧コード</option></select></div><div class="field section"><label for="archive-credential">パスワードまたは復旧コード</label><input class="input" id="archive-credential" type="password" required autofocus></div><p class="error" id="archive-inspect-error"></p><div class="dialog-actions"><button type="button" class="button" id="archive-inspect-cancel">キャンセル</button><button type="submit" class="button primary">内容を確認</button></div></form>`);document.getElementById('archive-inspect-cancel').addEventListener('click',closeDialog);document.getElementById('archive-inspect-form').addEventListener('submit',async event=>{event.preventDefault();const error=document.getElementById('archive-inspect-error'),method=document.getElementById('archive-method').value,credential=document.getElementById('archive-credential').value.trim();error.textContent='読み取っています…';try{const payload=validateSyncPayload(await decryptEnvelope(envelope,method==='recovery'?credential.toUpperCase():credential,method)),data=payload.data,classes=data.classes,students=data.students,records=data.records;openDialog(`<h2>${esc(payload.yearLabel||envelope.yearLabel||'保管年度')}の内容</h2><div class="overview-stats"><div class="overview-stat"><span class="row-meta">クラス</span><strong>${classes.length}</strong></div><div class="overview-stat"><span class="row-meta">児童</span><strong>${students.length}</strong></div><div class="overview-stat"><span class="row-meta">記録</span><strong>${records.length}</strong></div></div><div class="list section">${classes.map(item=>`<div class="list-row"><strong>${esc(item.name)}</strong><span class="row-meta">${data.enrollments.filter(row=>row.classId===item.id).length}人</span></div>`).join('')}</div><p class="muted section">この確認では、現在のアプリへデータを追加していません。</p><div class="dialog-actions"><button type="button" class="button primary" id="archive-result-close">OK</button></div>`);document.getElementById('archive-result-close').addEventListener('click',closeDialog);}catch(problem){error.textContent=problem.message||'保管ファイルを読み取れませんでした';}});}catch(problem){openDialog(`<h2>読み込めませんでした</h2><p>${esc(problem.message||'ファイルを確認してください')}</p><div class="dialog-actions"><button type="button" class="button primary" id="archive-error-close">OK</button></div>`);document.getElementById('archive-error-close').addEventListener('click',closeDialog);}
  }

  async function exportClassCsv(kind){
    const classId=document.getElementById('csv-class').value,start=document.getElementById('csv-start').value,end=document.getElementById('csv-end').value,error=document.getElementById('csv-error');
    error.textContent='';if(!start||!end||start>end){error.textContent='出力期間を確認してください。';return;}
    const classItem=state.classes.find(item=>item.id===classId);if(!classItem){error.textContent='クラスを選択してください。';return;}
    const roster=await rosterForRange(classId,start,end),records=await ClassDB.getAllByIndex('records','classId',classId),args={classItem,roster,records,start,end};
    const rows=kind==='submission'?ClassCsvExport.submissionRows(args):ClassCsvExport.assessmentRows(args),label=kind==='submission'?'提出状況':'評価一覧';
    downloadCsv(`${label}_${safeFilePart(classItem.name)}_${start.replaceAll('-','')}-${end.replaceAll('-','')}.csv`,ClassCsvExport.csv(rows));showToast(`${label}CSVを保存しました（${Math.max(0,rows.length-1)}件）`);
  }

  async function inspectSmartImportFiles(files){
    if(!files.length)return;try{
      const legacy=await LegacyMigration.fromFiles(files),recognized=new Set(legacy.flatMap(source=>source.fileNames||[])),tables=files.filter(file=>!recognized.has(file.name));
      if(legacy.length&&!tables.length){await openLegacyMigrationReview(legacy);return;}
      if(!legacy.length&&tables.length===1){openExternalImport(tables[0]);return;}
      openDialog(`<h2>ファイルの種類を確認しました</h2><p class="muted">判別できたものから、取り込みたい内容を選んでください。</p><div class="import-choice-list section">${legacy.length?`<button type="button" class="import-choice" id="smart-open-legacy"><strong>以前のツールのデータ</strong><span>${legacy.length}件のデータ群を検出しました</span><b>内容を確認 ›</b></button>`:''}${tables.map((file,index)=>`<button type="button" class="import-choice" data-smart-table="${index}"><strong>${esc(file.name)}</strong><span>表の内容から、毎日の宿題・週宿題・提出物を推測します</span><b>判別する ›</b></button>`).join('')}</div><div class="dialog-actions"><button type="button" class="button" id="smart-import-close">閉じる</button></div>`);document.getElementById('smart-import-close').addEventListener('click',closeDialog);document.getElementById('smart-open-legacy')?.addEventListener('click',()=>{closeDialog();openLegacyMigrationReview(legacy);});document.querySelectorAll('[data-smart-table]').forEach(button=>button.addEventListener('click',()=>{const file=tables[Number(button.dataset.smartTable)];closeDialog();openExternalImport(file);}));
    }catch(problem){openDialog(`<h2>ファイルを判別できませんでした</h2><p>${esc(problem.message||'ファイルの形式を確認してください')}</p><p class="muted">CSV・Excelは表の見出しに「日付」「氏名または出席番号」「状態」を入れると判別しやすくなります。</p><div class="dialog-actions"><button type="button" class="button primary" id="smart-import-close">OK</button></div>`);document.getElementById('smart-import-close').addEventListener('click',closeDialog);}
  }

  function legacySourceDescription(source){const descriptions={classChecker:['以前のクラス記録','毎日の宿題・週宿題・賞状・メモ・ノート評価・座席を移します'],multi:['以前の複数クラス記録','複数クラスのノート評価を、選んだクラスへ移します'],seating:['以前の座席データ','名簿・座席・配慮設定を移します'],behavior:['以前の行動記録','児童メモまたは個別支援級の学習記録へ移します']};return descriptions[source.kind]||['以前のデータ','内容を確認して対応する記録へ移します'];}

  async function openLegacyMigrationReview(sources){
    if(!sources?.length){showToast('移行できる旧データは見つかりませんでした');return;}
    state.migrationSources=sources;
    const years=await ClassDB.getAll('years'),classes=await ClassDB.getAll('classes');
    const targets=classes.map(item=>{const year=years.find(row=>row.id===item.yearId);return{...item,yearLabel:year?.label||'年度不明'};});
    if(!targets.length){openDialog(`<h2>先に移行先のクラスを作成してください</h2><p>旧データを入れるクラスがまだありません。「クラス・児童」からクラスを作ると、取り込み先を選べるようになります。</p><div class="dialog-actions"><button type="button" class="button" id="migration-no-target-close">閉じる</button><button type="button" class="button primary" id="migration-no-target-classes">クラスを作る</button></div>`);document.getElementById('migration-no-target-close').addEventListener('click',closeDialog);document.getElementById('migration-no-target-classes').addEventListener('click',()=>{closeDialog();openSettingsPage('classes');});return;}
    const defaultId=selectedClass()?.id||targets[0]?.id;
    const body=`<section class="panel"><div class="setup-steps" aria-label="取込の進行状況"><span class="step active"></span><span class="step active"></span><span class="step"></span></div><h1>ファイルの種類と移行内容を確認</h1><p class="muted">①ファイルを読みました。②移行先を選びます。まだデータは保存されていません。</p></section><section class="panel"><div class="list">${sources.map(source=>{const [kind,description]=legacySourceDescription(source);return`<div class="list-row migration-row"><div><span class="status-pill neutral">${esc(kind)}と推測</span><div class="row-title">${esc(source.label)}</div><div class="row-meta">${esc(description)}</div><div class="row-meta">児童 ${source.studentCount}人・移行できる記録 ${source.recordCount}件</div></div><div class="field migration-target"><label for="migration-${source.id}">移行先</label><select class="select" id="migration-${source.id}" data-migration-target="${source.id}">${targets.map(target=>`<option value="${target.id}" ${target.id===defaultId?'selected':''}>${esc(target.yearLabel)}・${esc(target.name)}</option>`).join('')}</select></div></div>`;}).join('')}</div><p class="notice small">移行先を確認したら、下のボタンを押してください。同じ記録は重複させません。</p><div class="button-row end section"><button type="button" class="button" id="migration-cancel">キャンセル</button><button type="button" class="button primary" id="migration-apply">この内容で一括移行</button></div></section>`;
    if(state.dataInSettings){state.settingsTab='data';await renderDataExchange(true);document.getElementById('settings-content').innerHTML=body;}else{app.innerHTML=teacherToolShell('旧データ移行',body);wireToolHome();}
    document.getElementById('migration-cancel').addEventListener('click',()=>renderDataExchange(state.dataInSettings));
    document.getElementById('migration-apply').addEventListener('click',event=>runOnce(event.currentTarget,applyLegacyMigration));
  }

  async function legacyRosterMap(source,classId){
    const existing=await rosterForClass(classId),byNumber=new Map(),nameByNumber=new Map(),byName=new Map(),sourceNumberMap=new Map();
    existing.forEach(row=>{byNumber.set(Number(row.enrollment.number),row.student.id);nameByNumber.set(Number(row.enrollment.number),normalizeStudentName(row.student.name));byName.set(normalizeStudentName(row.student.name),row.student.id);});
    for(const row of LegacyMigration.roster(source)){
      const requested=Number(row.number)||null,name=normalizeStudentName(row.name),numberMatch=requested&&nameByNumber.get(requested)===name?byNumber.get(requested):null;
      let studentId=byName.get(name)||numberMatch;
      if(!studentId){const classItem=await ClassDB.get('classes',classId),year=classItem?await ClassDB.get('years',classItem.yearId):state.year;const student=await ClassDB.put('students',{id:ClassDB.uid('student'),name:row.name});studentId=student.id;let assigned=requested;if(!assigned||byNumber.has(assigned)){assigned=1;while(byNumber.has(assigned))assigned++;}await ClassDB.put('enrollments',{id:ClassDB.uid('enrollment'),classId,studentId,number:assigned,grade:row.grade||'',gender:row.gender||'',startDate:year?.startDate||state.year.startDate});byNumber.set(assigned,studentId);nameByNumber.set(assigned,name);}
      if(requested)sourceNumberMap.set(requested,studentId);byName.set(name,studentId);
    }
    return{resolve:({number,name})=>byName.get(normalizeStudentName(name))||(number?sourceNumberMap.get(Number(number)):null)||null};
  }

  function comparableLegacy(record){const copy={...record};for(const key of ['createdAt','updatedAt','deviceId'])delete copy[key];return JSON.stringify(copy);}

  async function saveLegacyRecord(record){
    const existing=await ClassDB.get('records',record.id);
    if(!existing){await ClassDB.put('records',record);return'added';}
    if(comparableLegacy(existing)===comparableLegacy(record))return'skipped';
    await ClassDB.put('records',{...record,id:ClassDB.uid('legacyConflict'),conflictOriginalId:record.id,needsReview:true});return'conflict';
  }

  async function applyLegacyMigration(){
    const counts={students:0,records:0,conflicts:0,skipped:0},cleanup=new Set(await ClassDB.getMeta('legacyCleanupKeys',[]));
    for(const source of state.migrationSources){
      const classId=document.querySelector(`[data-migration-target="${source.id}"]`)?.value;if(!classId)continue;
      const before=(await rosterForClass(classId)).length,map=await legacyRosterMap(source,classId),after=(await rosterForClass(classId)).length;counts.students+=Math.max(0,after-before);
      const targetClass=await ClassDB.get('classes',classId);const converted=LegacyMigration.records(source,map.resolve,classId).map(record=>source.kind==='behavior'&&!isSupportClass(targetClass)?{...record,type:'memo',tags:record.tags||[]}:record);
      for(const record of converted){const result=await saveLegacyRecord(record);if(result==='added')counts.records++;else if(result==='conflict')counts.conflicts++;else counts.skipped++;}
      const patch=LegacyMigration.classPatch(source,map.resolve);if(patch){const {__seatingSettings,...classFields}=patch;await ClassDB.put('classes',{...targetClass,...classFields});if(__seatingSettings)await ClassDB.setMeta(`seatingSettings_${classId}`,__seatingSettings);}
      source.cleanupKeys.forEach(key=>cleanup.add(key));
    }
    await ClassDB.setMeta('legacyCleanupKeys',[...cleanup]);
    await ClassDB.setMeta('lastLegacyMigration',{at:ClassDB.now(),sources:state.migrationSources.map(item=>item.label),counts});
    state.classes=(await ClassDB.getAllByIndex('classes','yearId',state.year.id)).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));state.migrationSources=[];
    openDialog(`<h2>旧データを移行しました</h2><p>新しい児童 ${counts.students}人、記録 ${counts.records}件を追加しました。${counts.conflicts?`内容が異なる記録 ${counts.conflicts}件は両方を残しています。`:''}</p><p class="muted">旧データはまだ削除していません。暗号化バックアップを保存し、そのファイルを読み直して確認すると削除できます。</p><div class="dialog-actions"><button type="button" class="button primary" id="migration-done">OK</button></div>`);
    document.getElementById('migration-done').addEventListener('click',()=>{closeDialog();renderDataExchange(state.dataInSettings);});
  }

