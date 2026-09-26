"use strict";

  function syncDeviceDefault(){return /iPad|iPhone|Macintosh.*Mobile/i.test(navigator.userAgent)?'iPad':'PC';}

  function syncDateStamp(){const d=new Date();return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;}

  function safeFilePart(value){return String(value||'').replace(/[\\/:*?"<>|\s]+/g,'_');}
  async function recordSyncHistory(kind,details={}){const labels={export:'同期ファイル作成',import:'同期ファイル取込',backup:'バックアップ保存',archive:'年度保管'};const history=await ClassDB.getMeta('syncHistory',[]);const entry={id:ClassDB.uid('syncHistory'),at:ClassDB.now(),kind,kindLabel:labels[kind]||kind,device:details.device||await ClassDB.getMeta('syncDeviceName',syncDeviceDefault()),yearLabel:state.year?.label||'',add:details.add||0,update:details.update||0,delete:details.delete||0};await ClassDB.setMeta('syncHistory',[entry,...history].slice(0,20));if(kind==='import'){state.lastSyncAt=entry.at;await ClassDB.setMeta('lastSyncAt',entry.at);}return entry;}

  function syncHistoryHtml(history){if(!history?.length)return'<p class="muted">同期・バックアップの履歴はまだありません。</p>';return`<div class="sync-history-list">${history.slice(0,8).map(item=>`<div class="sync-history-row"><span class="sync-history-icon">${item.kind==='import'?'↓':item.kind==='backup'||item.kind==='archive'?'▣':'↑'}</span><div><strong>${esc(item.kindLabel||item.kind)}</strong><div class="row-meta">${esc(new Date(item.at).toLocaleString('ja-JP'))}・${esc(item.device||'端末名なし')}</div></div><span class="sync-history-count">${item.add||item.update||item.delete?`+${item.add||0} / 更新${item.update||0} / 削除${item.delete||0}`:'保存'}</span></div>`).join('')}</div>`;}

  async function currentYearSyncConflicts(){
    const classIds=new Set(state.classes.map(item=>item.id));
    return (await ClassDB.getAll('records')).filter(item=>item.needsReview&&item.conflictOriginalId&&classIds.has(item.classId)&&!item.deletedAt);
  }

  function syncConflictLabel(item){return item.title||({memo:'児童メモ',notebookAssessment:'ノート評価',certificate:'ミニ賞状',daily:'毎日の宿題',weeklyOccurrence:'週宿題'}[item.type]||'記録');}

  async function openSyncConflictReview(){
    const conflicts=await currentYearSyncConflicts();
    if(!conflicts.length){showToast('確認が必要な同期競合はありません');return;}
    openDialog(`<h2>同期競合を確認</h2><p class="muted">同じ記録を両端末で同時に変更したため、元の記録と確認用コピーを分けて保存しています。</p><div class="list section">${conflicts.map(item=>`<div class="list-row sync-conflict-row"><div><strong>${esc(syncConflictLabel(item))}</strong><div class="row-meta">${esc(item.date||'日付なし')}・取込元 ${esc(item.conflictDevice||'不明')}</div></div><div class="button-row"><button type="button" class="button" data-conflict-choice="local" data-conflict-id="${esc(item.id)}">元の記録を残す</button><button type="button" class="button primary" data-conflict-choice="incoming" data-conflict-id="${esc(item.id)}">取込側を採用</button></div></div>`).join('')}</div><div class="dialog-actions"><button type="button" class="button" id="sync-conflict-close">閉じる</button></div>`);
    document.querySelectorAll('[data-conflict-choice]').forEach(button=>button.addEventListener('click',()=>runOnce(button,async()=>{await resolveSyncConflict(button.dataset.conflictId,button.dataset.conflictChoice);openSyncConflictReview();})));
    document.getElementById('sync-conflict-close').addEventListener('click',requestDialogClose);
  }

  async function resolveSyncConflict(conflictId,choice){
    const conflict=await ClassDB.get('records',conflictId);if(!conflict)return;
    const original=await ClassDB.get('records',conflict.conflictOriginalId);
    if(choice==='incoming'){
      const adopted={...conflict,id:original?.id||conflict.id,needsReview:false,conflictOriginalId:undefined,conflictDevice:undefined,conflictReason:undefined,conflictFingerprint:undefined,updatedAt:conflict.updatedAt||ClassDB.now()};
      const deletes=original&&original.id!==conflict.id?[conflictId]:[];
      await ClassDB.applyBatch({puts:{records:[adopted]},deletes:deletes.length?{records:deletes}:{}});
      showToast('取込側の記録を採用しました');
    }else if(original){
      await ClassDB.applyBatch({deletes:{records:[conflictId]}});
      showToast('元の記録を残しました');
    }else showToast('元の記録が見つからないため、取込側を確認候補として残しました');
  }

  function syncGuideHtml(){return`<ol class="sync-steps"><li><b>1</b><span><strong>記録した端末でファイルを作る</strong><small>「この端末の記録をファイルに保存」を押します。この時点では、もう一方の端末へはまだ反映されていません。</small></span></li><li><b>2</b><span><strong>PCでファイルを受け取る</strong><small>iPadの記録をPCへ渡す場合は、学校で許可されたTeamsなどを使ってPCでファイルを保存します。</small></span></li><li><b>3</b><span><strong>PCで内容を取り込む</strong><small>PCの「別の端末で作ったファイルを選ぶ」から開き、内容を確認して取り込みます。iPadへ初期設定を渡すときは、上の受け渡しコードを使います。</small></span></li></ol><details class="sync-practice"><summary>本番前に、個人情報のないファイルで練習する</summary><p class="muted small">「練習用ファイル」をTeams経由でPCへ渡し、そこで選んでください。実際の名簿や記録には一切触れません。</p><div class="button-row"><button type="button" class="button" id="sync-practice-export">練習用ファイルを作る</button><label class="button">PCで練習用ファイルを選ぶ<input type="file" id="sync-practice-import" accept=".json,.json.txt,application/json,text/plain" hidden></label></div></details>`;}

  function createSyncPracticeFile(){const sample={format:'class-support-sync-practice',version:1,createdAt:ClassDB.now(),message:'このファイルには実際の児童情報や記録は入っていません。'};downloadText(`同期練習用_${syncDateStamp()}.json`,JSON.stringify(sample,null,2));showToast('練習用ファイルを保存しました');}

  function wireDataSectionTabs(root=document){
    const heading=root.querySelector('.data-heading');if(!heading)return;
    const buttons=[...root.querySelectorAll('.data-flow-guide [data-data-section]')];
    const groups={sync:[],backup:[],exchange:[],safety:[]};
    const add=(key,node)=>{if(node){node.dataset.dataTabGroup=key;groups[key].push(node);}};
    const keyForSection=id=>id==='data-backup'?'backup':id==='data-export'?'exchange':id==='data-restore'?'safety':'sync';
    buttons.forEach(button=>{button.classList.add('card-role-navigation','settings-choice-card');button.dataset.cardRole='移動';button.dataset.dataTab=keyForSection(button.dataset.dataSection);});
    add('sync',root.querySelector('#data-sync'));add('backup',root.querySelector('#data-backup'));add('exchange',root.querySelector('#data-export'));add('safety',root.querySelector('#data-restore'));
    const advancedTab=node=>{
      if(node.dataset.dataTab)return node.dataset.dataTab;
      if(node.querySelector('#sync-history-refresh')||node.querySelector('[data-pre-sync-restore]')||node.dataset.cardRole==='復元')return'sync';
      if(node.querySelector('#archive-inspect'))return'backup';
      if(node.id==='data-export'||node.querySelector('#smart-import-files'))return'exchange';
      return'safety';
    };
    root.querySelectorAll('.data-advanced').forEach(node=>{if(!node.dataset.dataTabGroup)add(advancedTab(node),node);});
    const setActive=key=>{state.dataSectionTab=key;Object.entries(groups).forEach(([name,nodes])=>nodes.forEach(node=>{node.hidden=name!==key;}));buttons.forEach(button=>{const active=button.dataset.dataTab===key;button.setAttribute('aria-selected',String(active));button.classList.toggle('active',active);});};
    buttons.forEach(button=>button.addEventListener('click',()=>setActive(button.dataset.dataTab)));
    setActive(dataSectionTabForState(state.dataSectionTab,groups,buttons));
  }

  function dataSectionTabForState(preferred,groups,buttons){return preferred&&groups[preferred]?.length?preferred:(buttons[0]?.dataset.dataTab||'sync');}



  async function inspectSyncPracticeFile(file){if(!file)return;try{const sample=JSON.parse(await readImportText(file,'練習用ファイル'));if(sample?.format!=='class-support-sync-practice')throw new Error('練習用ファイルではありません');openDialog('<h2>練習成功</h2><p>この端末でファイルを受け取れました。本番では、この下にある「別の端末で作ったファイルを取り込む」を使います。</p><p class="notice">練習では名簿や記録を変更していません。</p><div class="dialog-actions"><button type="button" class="button primary" id="sync-practice-close">OK</button></div>');document.getElementById('sync-practice-close').addEventListener('click',requestDialogClose);}catch(problem){openDialog(`<h2>練習用ファイルを確認できません</h2><p>${esc(problem.message||'ファイルを確認してください')}</p><div class="dialog-actions"><button type="button" class="button primary" id="sync-practice-close">OK</button></div>`);document.getElementById('sync-practice-close').addEventListener('click',requestDialogClose);}}

  async function saveDeviceNameFromScreen(){const input=document.getElementById('sync-device-name');if(input)await ClassDB.setMeta('syncDeviceName',input.value.trim()||syncDeviceDefault());}

  function newerThan(incoming,local){return String(incoming?.updatedAt||incoming?.deletedAt||'')>String(local?.updatedAt||local?.deletedAt||'');}

  function syncConflictCopy(incoming,local,device,makeId){
    if(!incoming||!local||String(incoming.updatedAt||'')!==String(local.updatedAt||'')||JSON.stringify(incoming)===JSON.stringify(local))return null;
    return {...incoming,id:makeId(),conflictOriginalId:incoming.id,conflictDevice:device||'不明',conflictReason:'sameUpdatedAt',conflictFingerprint:JSON.stringify({originalId:incoming.id,sourceDevice:device||'不明',updatedAt:incoming.updatedAt||'',record:incoming}),needsReview:true};
  }

  function syncDeletionCandidate(incomingTrash,effectiveRecord,localTombstone){const recordId=incomingTrash?.record?.id;if(!recordId)return null;if(localTombstone&&String(localTombstone.deletedAt||'')>=String(incomingTrash.deletedAt||''))return null;if(effectiveRecord&&String(incomingTrash.deletedAt||'')<String(effectiveRecord.updatedAt||''))return null;return{record:effectiveRecord||null,trash:incomingTrash};}
  async function syncClassDeletionCandidate(incomingTrash){const classItem=incomingTrash?.classBundle?.class;if(!classItem?.id)return null;const localClass=await ClassDB.get('classes',classItem.id),enrollments=localClass?await ClassDB.getAllByIndex('enrollments','classId',classItem.id):[],records=localClass?await ClassDB.getAllByIndex('records','classId',classItem.id):[];const newest=[localClass,...enrollments,...records].filter(Boolean).map(item=>String(item.updatedAt||'')).sort().at(-1)||'';if(newest&&String(incomingTrash.deletedAt||'')<newest)return null;return{classItem:localClass||null,enrollments,records,trash:incomingTrash};}
  async function buildSyncPlan(payload){const dailyOnly=payload.syncScope==='daily-records',stores=dailyOnly?['records']:['years','classes','students','enrollments','records'];const plan={payload,dailyOnly,writes:{},deletes:[],classDeletes:[],unmatchedStudents:[],counts:{add:0,update:0,conflict:0,delete:0,skip:0}};const localTrash=await ClassDB.getAll('trash'),localRecords=await ClassDB.getAll('records'),localEnrollments=dailyOnly?await ClassDB.getAll('enrollments'):[];const enrolledByClass=new Map();localEnrollments.forEach(item=>{if(!enrolledByClass.has(item.classId))enrolledByClass.set(item.classId,new Set());enrolledByClass.get(item.classId).add(item.studentId);});const deletedByRecord=new Map(localTrash.filter(item=>item.record?.id).map(item=>[item.record.id,item])),existingConflictFingerprints=new Set(localRecords.map(item=>item.conflictFingerprint).filter(Boolean));for(const store of stores){plan.writes[store]=[];for(const incoming of payload.data?.[store]||[]){if(dailyOnly&&(incoming.type==='cleaningDutyConfig'||incoming.type==='testScore'&&incoming.sourceKind==='paper')){plan.counts.skip++;continue;}if(dailyOnly&&incoming.studentId&&!enrolledByClass.get(incoming.classId)?.has(incoming.studentId)){plan.unmatchedStudents.push({classId:incoming.classId,studentId:incoming.studentId,recordId:incoming.id});plan.counts.skip++;continue;}if(store==='records'){const deleted=deletedByRecord.get(incoming.id);if(deleted&&String(deleted.deletedAt||'')>=String(incoming.updatedAt||'')){plan.counts.skip++;continue;}}const local=await ClassDB.get(store,incoming.id);if(!local){plan.writes[store].push(incoming);plan.counts.add++;continue;}if(newerThan(incoming,local)){plan.writes[store].push(incoming);plan.counts.update++;continue;}const conflict=store==='records'?syncConflictCopy(incoming,local,payload.device,()=>ClassDB.uid('syncConflict')):null;if(conflict&&!existingConflictFingerprints.has(conflict.conflictFingerprint)){plan.writes[store].push(conflict);existingConflictFingerprints.add(conflict.conflictFingerprint);plan.counts.conflict++;}else plan.counts.skip++;}}
    for(const incomingTrash of payload.data?.trash||[]){const recordId=incomingTrash.record?.id;if(!recordId||(dailyOnly&&(incomingTrash.record?.type==='cleaningDutyConfig'||incomingTrash.record?.type==='testScore'&&incomingTrash.record?.sourceKind==='paper')))continue;const localRecord=await ClassDB.get('records',recordId),incomingRecord=plan.writes.records.find(item=>item.id===recordId),candidate=syncDeletionCandidate(incomingTrash,incomingRecord||localRecord,deletedByRecord.get(recordId));if(candidate){plan.deletes.push(candidate);plan.writes.records=plan.writes.records.filter(item=>item.id!==recordId);}else plan.counts.skip++;}
    if(!dailyOnly)for(const incomingTrash of payload.data?.trash||[]){if(incomingTrash.kind!=='classBundle')continue;const candidate=await syncClassDeletionCandidate(incomingTrash);if(candidate)plan.classDeletes.push(candidate);else plan.counts.skip++;}
    plan.deletes=[...new Map(plan.deletes.map(item=>[item.trash.record.id,item])).values()];plan.classDeletes=[...new Map(plan.classDeletes.map(item=>[item.trash.classBundle.class.id,item])).values()];plan.counts.delete=plan.deletes.length+plan.classDeletes.length;plan.meta=[];if(!dailyOnly)for(const incoming of payload.data?.meta||[]){if(!isYearSyncMeta(incoming.key)){plan.counts.skip++;continue;}const local=await ClassDB.get('meta',incoming.key);if(!local||newerThan(incoming,local)){plan.meta.push(incoming);local?plan.counts.update++:plan.counts.add++;}else plan.counts.skip++;}return plan;}

  async function readEncryptedImport(file){if(!file)return;if(!await requestAnnualPassword())return;try{const envelope=validateEncryptedEnvelope(JSON.parse(await readImportText(file,'同期・バックアップファイル'))),payload=validateSyncPayload(await decryptEnvelope(envelope));if(payload.yearLabel!==state.year.label||payload.yearId!==state.year.id){showToast(`このファイルは${payload.yearLabel||'別年度'}のデータです`);return;}const cleanup=await ClassDB.getMeta('legacyCleanupKeys',[]);state.verifiedLegacyCleanupKeys=envelope.kind==='backup'&&payload.data.records.some(item=>item.legacyImported)?cleanup:[];const plan=await buildSyncPlan(payload);state.pendingSync={plan,envelope};openSyncPreview(false);}catch(error){openDialog(`<h2>読み込めませんでした</h2><p>${esc(error.message)}</p><div class="dialog-actions"><button type="button" class="button primary" id="sync-error-close">OK</button></div>`);document.getElementById('sync-error-close').addEventListener('click',requestDialogClose);}}

  function syncSummaryHtml(plan,detailed=false){const c=plan.counts,scope=plan.dailyOnly?'日常記録のみ（PCの名簿・座席・掃除班・紙テストは変更しません）':'すべての年度データ',unmatched=plan.unmatchedStudents?.length||0;return`<div class="sync-summary"><div><strong>${c.add}</strong><span>追加</span></div><div><strong>${c.update}</strong><span>更新</span></div><div><strong>${c.conflict}</strong><span>要確認</span></div><div><strong>${c.delete}</strong><span>削除候補</span></div></div>${detailed?`<div class="list section"><div class="list-row"><span>取込範囲</span><strong>${esc(scope)}</strong></div><div class="list-row"><span>変更しないデータ</span><strong>${c.skip}件</strong></div><div class="list-row"><span>取込元</span><strong>${esc(plan.payload.device||'不明')}</strong></div><div class="list-row"><span>作成日時</span><strong>${esc(new Date(plan.payload.generatedAt).toLocaleString('ja-JP'))}</strong></div></div>${unmatched?`<p class="notice">${unmatched}件はPCの名簿にいない児童の記録のため取り込みません。先に「PCから名簿・座席を反映」で名簿をそろえてから、同期ファイルを作り直してください。</p>`:''}${c.conflict?`<p class="notice">要確認 ${c.conflict}件：同じ更新時刻で内容が異なる記録は、元の記録を残して「要確認」のコピーを追加します。</p>`:''}${c.delete?`<label class="check-row"><input type="checkbox" id="approve-sync-deletes"> 削除候補${c.delete}件をまとめて承認する</label>`:''}`:''}`;}

  function openSyncPreview(detailed){const pending=state.pendingSync;if(!pending)return;const plan=pending.plan;openDialog(`<h2>取り込む内容を確認</h2><p class="muted">同じ記録は更新日時が新しい方を候補にします。内容が分かれた記録は、確認用コピーを残します。</p>${syncSummaryHtml(plan,detailed)}<div class="dialog-actions"><button type="button" class="button" id="sync-cancel">取り込みをやめる</button>${detailed?'':`<button type="button" class="button" id="sync-detail">詳しく確認</button>`}<button type="button" class="button primary" id="sync-apply">${detailed?'この内容を取り込む':'内容を確認'}</button></div>`);document.getElementById('sync-cancel').addEventListener('click',()=>{state.pendingSync=null;closeDialog();});document.getElementById('sync-detail')?.addEventListener('click',()=>openSyncPreview(true));document.getElementById('sync-apply').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{if(plan.counts.delete&&!detailed){openSyncPreview(true);return;}await applySyncPlan(Boolean(document.getElementById('approve-sync-deletes')?.checked));}));}

  function syncBatchForPlan(plan,approveDeletes,orphanStudents=[]){
    const puts={...plan.writes,meta:plan.meta};
    if(approveDeletes)puts.trash=[...(puts.trash||[]),...plan.deletes.map(item=>item.trash),...(plan.classDeletes||[]).map(item=>item.trash)];
    if(!approveDeletes)return{puts,deletes:{}};
    const classDeletes=plan.classDeletes||[],records=[...plan.deletes.filter(item=>item.record).map(item=>item.record.id),...classDeletes.flatMap(item=>item.records.map(record=>record.id))],enrollments=classDeletes.flatMap(item=>item.enrollments.map(item=>item.id)),classes=classDeletes.filter(item=>item.classItem).map(item=>item.classItem.id),deletes={records};
    if(enrollments.length)deletes.enrollments=enrollments;
    if(classes.length)deletes.classes=classes;
    if(orphanStudents.length)deletes.students=orphanStudents;
    return {puts,deletes};
  }

  async function syncOrphanStudentIds(plan){
    const classDeletes=plan.classDeletes||[],enrollmentIds=new Set(classDeletes.flatMap(item=>item.enrollments.map(row=>row.id))),candidateIds=new Set(classDeletes.flatMap(item=>item.enrollments.map(row=>row.studentId)).filter(Boolean));
    if(!candidateIds.size)return[];
    const remaining=(await ClassDB.getAll('enrollments')).filter(row=>!enrollmentIds.has(row.id));
    const incomingEnrollments=(plan.writes?.enrollments||[]).filter(row=>!enrollmentIds.has(row.id));
    const stillEnrolled=new Set([...remaining,...incomingEnrollments].map(row=>row.studentId));
    return[...candidateIds].filter(id=>!stillEnrolled.has(id));
  }

  async function applySyncPlan(approveDeletes){
    const pending=state.pendingSync;if(!pending)return;const plan=pending.plan;
    await savePreSyncSnapshot();
    const orphanStudents=approveDeletes?await syncOrphanStudentIds(plan):[];
    await ClassDB.applyBatch(syncBatchForPlan(plan,approveDeletes,orphanStudents));
    await reloadStateFromDb();state.pendingSync=null;
    const merged=await createEncryptedFile('sync',false);state.mergedSyncEnvelope=merged;await recordSyncHistory('import',{device:plan.payload.device,add:plan.counts.add,update:plan.counts.update,delete:approveDeletes?plan.counts.delete:0});const canClean=state.verifiedLegacyCleanupKeys.length>0;
    openDialog(`<h2>この端末へ取り込みました</h2><p>追加 ${plan.counts.add}件、更新 ${plan.counts.update}件${approveDeletes?`、削除 ${plan.counts.delete}件`:''}を反映しました。</p><p class="muted">この操作だけでは、ほかの端末には反映されません。必要な場合だけ、下の控えを保存して別の端末へ渡してください。</p>${canClean?'<p class="notice"><strong>移行後の暗号化バックアップを正常に読み取れました。</strong><br>この端末に残した旧形式データを削除できます。</p>':''}<div class="dialog-actions"><button type="button" class="button" id="sync-done">閉じる</button>${canClean?'<button type="button" class="button danger" id="legacy-cleanup">確認済みの旧データを削除</button>':''}<button type="button" class="button primary" id="sync-save-merged">統合後の控えを保存</button></div>`);
    document.getElementById('sync-done').addEventListener('click',()=>{state.verifiedLegacyCleanupKeys=[];closeDialog();renderDataExchange(state.dataInSettings);});
    document.getElementById('legacy-cleanup')?.addEventListener('click',confirmLegacyCleanup);
    document.getElementById('sync-save-merged').addEventListener('click',()=>{const device=state.mergedSyncEnvelope.device||syncDeviceDefault();downloadText(`統合後の控え_${safeFilePart(state.year.label)}_${syncDateStamp()}_${safeFilePart(device)}.json`,JSON.stringify(state.mergedSyncEnvelope));showToast('統合後の控えを保存しました');});
  }

  function confirmLegacyCleanup(){
    openDialog(`<h2>以前の形式のデータを削除しますか</h2><p>暗号化バックアップで移行済みデータを確認できました。この端末に残る以前の形式のデータだけを削除します。現在のアプリの記録は削除されません。</p><div class="dialog-actions"><button type="button" class="button" id="legacy-cleanup-cancel">キャンセル</button><button type="button" class="button danger" id="legacy-cleanup-apply">削除する</button></div>`);
    document.getElementById('legacy-cleanup-cancel').addEventListener('click',requestDialogClose);
    document.getElementById('legacy-cleanup-apply').addEventListener('click',async()=>{for(const key of state.verifiedLegacyCleanupKeys)localStorage.removeItem(key);state.verifiedLegacyCleanupKeys=[];await ClassDB.setMeta('legacyCleanupKeys',[]);closeDialog();showToast('確認済みの旧形式データを削除しました');renderDataExchange(state.dataInSettings);});
  }
