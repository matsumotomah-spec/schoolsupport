"use strict";

  function syncDeviceDefault(){return /iPad|iPhone|Macintosh.*Mobile/i.test(navigator.userAgent)?'iPad':'PC';}

  function syncDateStamp(){const d=new Date();return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;}

  function safeFilePart(value){return String(value||'').replace(/[\\/:*?"<>|\s]+/g,'_');}
  async function recordSyncHistory(kind,details={}){const labels={export:'同期ファイル作成',import:'同期ファイル取込',backup:'バックアップ保存',archive:'年度保管'};const history=await ClassDB.getMeta('syncHistory',[]);const entry={id:ClassDB.uid('syncHistory'),at:ClassDB.now(),kind,kindLabel:labels[kind]||kind,device:details.device||await ClassDB.getMeta('syncDeviceName',syncDeviceDefault()),yearLabel:state.year?.label||'',add:details.add||0,update:details.update||0,delete:details.delete||0};await ClassDB.setMeta('syncHistory',[entry,...history].slice(0,20));if(kind==='export'||kind==='import'){state.lastSyncAt=entry.at;await ClassDB.setMeta('lastSyncAt',entry.at);}return entry;}

  function syncHistoryHtml(history){if(!history?.length)return'<p class="muted">同期・バックアップの履歴はまだありません。</p>';return`<div class="sync-history-list">${history.slice(0,8).map(item=>`<div class="sync-history-row"><span class="sync-history-icon">${item.kind==='import'?'↓':item.kind==='backup'||item.kind==='archive'?'▣':'↑'}</span><div><strong>${esc(item.kindLabel||item.kind)}</strong><div class="row-meta">${esc(new Date(item.at).toLocaleString('ja-JP'))}・${esc(item.device||'端末名なし')}</div></div><span class="sync-history-count">${item.add||item.update||item.delete?`+${item.add||0} / 更新${item.update||0} / 削除${item.delete||0}`:'保存'}</span></div>`).join('')}</div>`;}

  function syncGuideHtml(){return`<ol class="sync-steps"><li><b>1</b><span><strong>移す元の端末でファイルを作る</strong><small>iPadで日常記録をした後など、記録を送る端末で「ファイルを作る」を押します。</small></span></li><li><b>2</b><span><strong>Teamsの自分用領域などへ置く</strong><small>作ったJSONファイルを、移動先の端末で開ける場所へ置きます。</small></span></li><li><b>3</b><span><strong>移動先の端末で取り込む</strong><small>PCで印刷や所見作成をする前などに取り込み、内容を確認して統合します。</small></span></li></ol><details class="sync-practice"><summary>本番前に、個人情報のないファイルで練習する</summary><p class="muted small">「練習用ファイル」をTeams経由で移動先の端末へ移し、そこで選んでください。実際の名簿や記録には一切触れません。</p><div class="button-row"><button type="button" class="button" id="sync-practice-export">練習用ファイルを作る</button><label class="button">移した練習用ファイルを選ぶ<input type="file" id="sync-practice-import" accept=".json,.json.txt,application/json,text/plain" hidden></label></div></details>`;}

  function createSyncPracticeFile(){const sample={format:'class-support-sync-practice',version:1,createdAt:ClassDB.now(),message:'このファイルには実際の児童情報や記録は入っていません。'};downloadText(`同期練習用_${syncDateStamp()}.json`,JSON.stringify(sample,null,2));showToast('練習用ファイルを保存しました');}

  function wireDataSectionTabs(root=document){
    const heading=root.querySelector('.data-heading');if(!heading)return;
    const buttons=[...root.querySelectorAll('.data-flow-guide [data-data-section]')];
    const groups={sync:[],backup:[],exchange:[],safety:[]};
    const add=(key,node)=>{if(node){node.dataset.dataTabGroup=key;groups[key].push(node);}};
    const keyForSection=id=>id==='data-backup'?'backup':id==='data-export'?'exchange':id==='data-restore'?'safety':'sync';
    buttons.forEach(button=>{button.classList.add('card-role-navigation','settings-choice-card');button.dataset.cardRole='移動';button.dataset.dataTab=keyForSection(button.dataset.dataSection);});
    add('sync',root.querySelector('#data-sync'));add('backup',root.querySelector('#data-backup'));add('exchange',root.querySelector('#data-export'));add('safety',root.querySelector('#data-restore'));
    root.querySelectorAll('.data-advanced').forEach(node=>{if(node.dataset.dataTabGroup)return;const summary=node.querySelector('summary')?.textContent||'';if(summary.includes('同期'))add('sync',node);else if(summary.includes('前年度')||summary.includes('保存'))add('backup',node);else if(summary.includes('Excel')||summary.includes('取り込む'))add('exchange',node);else add('safety',node);});
    const setActive=key=>{Object.entries(groups).forEach(([name,nodes])=>nodes.forEach(node=>{node.hidden=name!==key;}));buttons.forEach(button=>{const active=button.dataset.dataTab===key;button.setAttribute('aria-selected',String(active));button.classList.toggle('active',active);});};
    buttons.forEach(button=>button.addEventListener('click',()=>setActive(button.dataset.dataTab)));
    setActive(buttons[0]?.dataset.dataTab||'sync');
  }



  async function inspectSyncPracticeFile(file){if(!file)return;try{const sample=JSON.parse(await readImportText(file,'練習用ファイル'));if(sample?.format!=='class-support-sync-practice')throw new Error('練習用ファイルではありません');openDialog('<h2>練習成功</h2><p>この端末でファイルを受け取れました。本番では、この下にある「別の端末で作ったファイルを取り込む」を使います。</p><p class="notice">練習では名簿や記録を変更していません。</p><div class="dialog-actions"><button type="button" class="button primary" id="sync-practice-close">OK</button></div>');document.getElementById('sync-practice-close').addEventListener('click',closeDialog);}catch(problem){openDialog(`<h2>練習用ファイルを確認できません</h2><p>${esc(problem.message||'ファイルを確認してください')}</p><div class="dialog-actions"><button type="button" class="button primary" id="sync-practice-close">OK</button></div>`);document.getElementById('sync-practice-close').addEventListener('click',closeDialog);}}

  async function saveDeviceNameFromScreen(){const input=document.getElementById('sync-device-name');if(input)await ClassDB.setMeta('syncDeviceName',input.value.trim()||syncDeviceDefault());}

  function newerThan(incoming,local){return String(incoming?.updatedAt||incoming?.deletedAt||'')>String(local?.updatedAt||local?.deletedAt||'');}

  async function buildSyncPlan(payload){const stores=['years','classes','students','enrollments','records','trash'];const plan={payload,writes:{},deletes:[],counts:{add:0,update:0,conflict:0,delete:0,skip:0}};const localTrash=await ClassDB.getAll('trash');const deletedByRecord=new Map(localTrash.map(item=>[item.record?.id,item]));for(const store of stores){plan.writes[store]=[];for(const incoming of payload.data?.[store]||[]){if(store==='records'){const deleted=deletedByRecord.get(incoming.id);if(deleted&&String(deleted.deletedAt||'')>=String(incoming.updatedAt||'')){plan.counts.skip++;continue;}}const local=await ClassDB.get(store,incoming.id);if(!local){plan.writes[store].push(incoming);plan.counts.add++;continue;}if(newerThan(incoming,local)){plan.writes[store].push(incoming);plan.counts.update++;continue;}if(!incoming.updatedAt&&!local.updatedAt&&JSON.stringify(incoming)!==JSON.stringify(local)&&store==='records'){plan.writes[store].push({...incoming,id:ClassDB.uid('syncConflict'),conflictOriginalId:incoming.id,needsReview:true});plan.counts.conflict++;}else plan.counts.skip++;}}
    for(const incomingTrash of payload.data?.trash||[]){const recordId=incomingTrash.record?.id;if(!recordId)continue;const localRecord=await ClassDB.get('records',recordId);if(localRecord&&String(incomingTrash.deletedAt||'')>=String(localRecord.updatedAt||'')){plan.deletes.push({record:localRecord,trash:incomingTrash});}}
    plan.deletes=[...new Map(plan.deletes.map(item=>[item.record.id,item])).values()];plan.counts.delete=plan.deletes.length;plan.meta=[];const localOnly=new Set(['activeYearId','selectedClassId','lastMode','preSyncSnapshots']);for(const incoming of payload.data?.meta||[]){if(localOnly.has(incoming.key)){plan.counts.skip++;continue;}const local=await ClassDB.get('meta',incoming.key);if(!local||newerThan(incoming,local)){plan.meta.push(incoming);local?plan.counts.update++:plan.counts.add++;}else plan.counts.skip++;}return plan;}

  async function readEncryptedImport(file){if(!file)return;if(!await requestAnnualPassword())return;try{const envelope=validateEncryptedEnvelope(JSON.parse(await readImportText(file,'同期・バックアップファイル'))),payload=validateSyncPayload(await decryptEnvelope(envelope));if(payload.yearLabel!==state.year.label||payload.yearId!==state.year.id){showToast(`このファイルは${payload.yearLabel||'別年度'}のデータです`);return;}const cleanup=await ClassDB.getMeta('legacyCleanupKeys',[]);state.verifiedLegacyCleanupKeys=envelope.kind==='backup'&&payload.data.records.some(item=>item.legacyImported)?cleanup:[];const plan=await buildSyncPlan(payload);state.pendingSync={plan,envelope};openSyncPreview(false);}catch(error){openDialog(`<h2>読み込めませんでした</h2><p>${esc(error.message)}</p><div class="dialog-actions"><button type="button" class="button primary" id="sync-error-close">OK</button></div>`);document.getElementById('sync-error-close').addEventListener('click',closeDialog);}}

  function syncSummaryHtml(plan,detailed=false){const c=plan.counts;return`<div class="sync-summary"><div><strong>${c.add}</strong><span>追加</span></div><div><strong>${c.update}</strong><span>更新</span></div><div><strong>${c.conflict}</strong><span>要確認</span></div><div><strong>${c.delete}</strong><span>削除候補</span></div></div>${detailed?`<div class="list section"><div class="list-row"><span>変更しないデータ</span><strong>${c.skip}件</strong></div><div class="list-row"><span>取込元</span><strong>${esc(plan.payload.device||'不明')}</strong></div><div class="list-row"><span>作成日時</span><strong>${esc(new Date(plan.payload.generatedAt).toLocaleString('ja-JP'))}</strong></div></div>${c.delete?`<label class="check-row"><input type="checkbox" id="approve-sync-deletes"> 削除候補${c.delete}件をまとめて承認する</label>`:''}`:''}`;}

  function openSyncPreview(detailed){const pending=state.pendingSync;if(!pending)return;const plan=pending.plan;openDialog(`<h2>同期内容を確認</h2><p class="muted">更新日時が新しい方を採用します。</p>${syncSummaryHtml(plan,detailed)}<div class="dialog-actions"><button type="button" class="button" id="sync-cancel">同期キャンセル</button>${detailed?'':`<button type="button" class="button" id="sync-detail">詳細を表示</button>`}<button type="button" class="button primary" id="sync-apply">${detailed?'同期する':'OK'}</button></div>`);document.getElementById('sync-cancel').addEventListener('click',()=>{state.pendingSync=null;closeDialog();});document.getElementById('sync-detail')?.addEventListener('click',()=>openSyncPreview(true));document.getElementById('sync-apply').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{if(plan.counts.delete&&!detailed){openSyncPreview(true);return;}await applySyncPlan(Boolean(document.getElementById('approve-sync-deletes')?.checked));}));}

  async function applySyncPlan(approveDeletes){
    const pending=state.pendingSync;if(!pending)return;const plan=pending.plan;
    await savePreSyncSnapshot();
    const puts={...plan.writes,meta:plan.meta};
    if(approveDeletes)puts.trash=[...(puts.trash||[]),...plan.deletes.map(item=>item.trash)];
    const deletes=approveDeletes?{records:plan.deletes.map(item=>item.record.id)}:{};
    await ClassDB.applyBatch({puts,deletes});
    state.year=await ClassDB.get('years',state.year.id);state.classes=(await ClassDB.getAllByIndex('classes','yearId',state.year.id)).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));state.pendingSync=null;
    const merged=await createEncryptedFile('sync',false);state.mergedSyncEnvelope=merged;await recordSyncHistory('import',{device:plan.payload.device,add:plan.counts.add,update:plan.counts.update,delete:approveDeletes?plan.counts.delete:0});const canClean=state.verifiedLegacyCleanupKeys.length>0;
    openDialog(`<h2>同期しました</h2><p>追加 ${plan.counts.add}件、更新 ${plan.counts.update}件${approveDeletes?`、削除 ${plan.counts.delete}件`:''}を反映しました。</p>${canClean?'<p class="notice"><strong>移行後の暗号化バックアップを正常に読み取れました。</strong><br>この端末に残した旧形式データを削除できます。</p>':''}<div class="dialog-actions"><button type="button" class="button" id="sync-done">OK</button>${canClean?'<button type="button" class="button danger" id="legacy-cleanup">確認済みの旧データを削除</button>':''}<button type="button" class="button primary" id="sync-save-merged">統合済み同期ファイルを保存</button></div>`);
    document.getElementById('sync-done').addEventListener('click',()=>{state.verifiedLegacyCleanupKeys=[];closeDialog();renderDataExchange(state.dataInSettings);});
    document.getElementById('legacy-cleanup')?.addEventListener('click',confirmLegacyCleanup);
    document.getElementById('sync-save-merged').addEventListener('click',()=>{const device=state.mergedSyncEnvelope.device||syncDeviceDefault();downloadText(`同期済み_${safeFilePart(state.year.label)}_${syncDateStamp()}_${safeFilePart(device)}.json`,JSON.stringify(state.mergedSyncEnvelope));showToast('統合済み同期ファイルを保存しました');});
  }

  function confirmLegacyCleanup(){
    openDialog(`<h2>以前の形式のデータを削除しますか</h2><p>暗号化バックアップで移行済みデータを確認できました。この端末に残る以前の形式のデータだけを削除します。現在のアプリの記録は削除されません。</p><div class="dialog-actions"><button type="button" class="button" id="legacy-cleanup-cancel">キャンセル</button><button type="button" class="button danger" id="legacy-cleanup-apply">削除する</button></div>`);
    document.getElementById('legacy-cleanup-cancel').addEventListener('click',closeDialog);
    document.getElementById('legacy-cleanup-apply').addEventListener('click',async()=>{for(const key of state.verifiedLegacyCleanupKeys)localStorage.removeItem(key);state.verifiedLegacyCleanupKeys=[];await ClassDB.setMeta('legacyCleanupKeys',[]);closeDialog();showToast('確認済みの旧形式データを削除しました');renderDataExchange(state.dataInSettings);});
  }
