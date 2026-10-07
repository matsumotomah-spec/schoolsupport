"use strict";

  const TEXT_TRANSFER_FORMAT='CSTX1';
  const TEXT_TRANSFER_MAX_CHARS=10000;
  const TEXT_TRANSFER_PAYLOAD_CHARS=9600;
  const TEXT_TRANSFER_BUTTON_PAGE=30;
  let textTransferReceiveSession=null;
  const DAILY_SYNC_GROUP_LABELS={homework:'毎日の宿題・出欠',weekly:'週宿題',occasional:'提出物',notebook:'ノート評価',quiz:'手入力の小テスト',behavior:'行動記録・児童メモ・ミニ賞状'};

  function dailySyncRecordTypesForGroups(groups){return[...new Set((groups||[]).flatMap(group=>DAILY_SYNC_RECORD_GROUPS[group]||[]))];}
  function dailySyncChoiceHtml(selected){return Object.entries(DAILY_SYNC_GROUP_LABELS).map(([id,label])=>`<label class="check-row"><input type="checkbox" name="daily-sync-group" value="${id}" ${selected.includes(id)?'checked':''}> ${esc(label)}</label>`).join('');}
  function dailySyncBaselineLabel(baseline,candidate){if(baseline)return`基準：${esc(new Date(baseline.generatedAt).toLocaleString('ja-JP'))}にPC取込済みとして登録されています。`;if(candidate)return`直近の送信：${esc(new Date(candidate.generatedAt).toLocaleString('ja-JP'))}。PCで取り込めたことを確認した後、下のボタンで基準にできます。`;return'差分の基準はまだありません。初回は通常同期を作るか、PCと同じ状態であることを確認して基準を登録します。';}

  async function confirmDailySyncDeltaBaseline(candidate=null,recordTypes=null){const source=candidate||await ClassDB.getMeta(DAILY_SYNC_EXPORT_CANDIDATE_KEY,null);if(source?.yearId!==state.year.id)throw new Error('この年度でPCへ取り込んだ送信が見つかりません');const baseline={yearId:state.year.id,yearLabel:state.year.label,generatedAt:source.generatedAt||ClassDB.now(),recordTypes:source.recordTypes||recordTypes||[...DAILY_SYNC_DEFAULT_TYPES],confirmedAt:ClassDB.now()};await ClassDB.setMeta(DAILY_SYNC_DELTA_BASELINE_KEY,baseline);showToast('次回の差分同期の基準にしました');return baseline;}

  async function setCurrentDailySyncDeltaBaseline(recordTypes){const baseline={yearId:state.year.id,yearLabel:state.year.label,generatedAt:ClassDB.now(),recordTypes:recordTypes?.length?recordTypes:[...DAILY_SYNC_DEFAULT_TYPES],confirmedAt:ClassDB.now(),manual:true};await ClassDB.setMeta(DAILY_SYNC_DELTA_BASELINE_KEY,baseline);showToast('現在の状態を差分同期の基準にしました');return baseline;}

  async function openDailySyncExportChoice(output='text'){const [baseline,candidate]=await Promise.all([dailySyncDeltaBaseline(),ClassDB.getMeta(DAILY_SYNC_EXPORT_CANDIDATE_KEY,null)]),selected=['homework','weekly','occasional'],outputLabel=output==='file'?'暗号化ファイルを作る':'テキストを作る';openDialog(`<h2>PCへ送る記録を選ぶ</h2><p class="muted">PCに保存済みのクラス名・児童名・名簿・座席・紙テスト・掃除設定は送りません。PC側の名簿で照合し、一致しない児童の記録は取込前に止めます。</p><fieldset class="field section"><legend>送る記録</legend>${dailySyncChoiceHtml(selected)}</fieldset><fieldset class="field section"><legend>送る範囲</legend><label class="check-row"><input type="radio" name="daily-sync-scope" value="daily-records" ${baseline?'':'checked'}> 選んだ種類をすべて送る</label><label class="check-row"><input type="radio" name="daily-sync-scope" value="daily-delta" ${baseline?'checked':'disabled'}> 前回の基準以降に変わったものだけ送る</label><small class="field-help">${baseline?`差分送信が標準です。${dailySyncBaselineLabel(baseline,candidate)}`:dailySyncBaselineLabel(baseline,candidate)}</small></fieldset><details class="section"><summary>差分の基準を登録する</summary><p class="muted small">PCで直近の送信を取り込み、内容を確認した後だけ使います。基準より前の記録は、次回の差分には入りません。</p>${candidate?.yearId===state.year.id?`<button type="button" class="button" id="daily-sync-use-candidate">直近の送信を次回の基準にする</button>`:''}<label class="check-row section"><input type="checkbox" id="daily-sync-current-confirm"> PCとiPadの記録がすでに同じことを確認した</label><button type="button" class="button" id="daily-sync-use-current">現在の状態を基準にする</button></details><p class="error" id="daily-sync-choice-error"></p><div class="dialog-actions"><button type="button" class="button" id="daily-sync-choice-cancel">キャンセル</button><button type="button" class="button primary" id="daily-sync-choice-create">選んで${outputLabel}</button></div>`,'dialog-xwide');const error=document.getElementById('daily-sync-choice-error'),groups=()=>[...document.querySelectorAll('[name="daily-sync-group"]:checked')].map(input=>input.value),types=()=>dailySyncRecordTypesForGroups(groups());document.getElementById('daily-sync-choice-cancel').addEventListener('click',requestDialogClose);document.getElementById('daily-sync-use-candidate')?.addEventListener('click',async()=>{try{await confirmDailySyncDeltaBaseline(candidate);closeDialog();await openDailySyncExportChoice(output);}catch(problem){error.textContent=problem.message||'基準を登録できませんでした';}});document.getElementById('daily-sync-use-current').addEventListener('click',async()=>{if(!document.getElementById('daily-sync-current-confirm').checked){error.textContent='PCとiPadが同じ状態であることを確認してください。';return;}try{await setCurrentDailySyncDeltaBaseline(types());closeDialog();await openDailySyncExportChoice(output);}catch(problem){error.textContent=problem.message||'基準を登録できませんでした';}});document.getElementById('daily-sync-choice-create').addEventListener('click',async event=>{const recordTypes=types(),scope=document.querySelector('[name="daily-sync-scope"]:checked')?.value;if(!recordTypes.length){error.textContent='送る記録を1つ以上選んでください。';return;}if(scope==='daily-delta'&&!await dailySyncDeltaBaseline()){error.textContent='差分の基準を登録してください。';return;}closeDialog();await runOnce(event.currentTarget,async()=>{if(output==='file'){await saveDeviceNameFromScreen();const saved=await createEncryptedFile('sync',true,scope,recordTypes);if(saved)showToast('暗号化ファイルを作成しました。相手端末で取り込むまで反映されません');}else await openTextTransferExport('sync',{syncScope:scope,recordTypes});});});}

  async function textTransferHash(value){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
    return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function createTextTransferParts(text){
    const source=String(text||'');
    if(!source)throw new Error('表示する暗号化データがありません');
    const fullHash=await textTransferHash(source),transferId=fullHash.slice(0,12),chunks=[];
    for(let offset=0;offset<source.length;){let end=Math.min(source.length,offset+TEXT_TRANSFER_PAYLOAD_CHARS);if(end<source.length&&/[\uD800-\uDBFF]/.test(source[end-1])&&/[\uDC00-\uDFFF]/.test(source[end]))end--;chunks.push(source.slice(offset,end));offset=end;}
    const hashes=await Promise.all(chunks.map(textTransferHash));
    const parts=chunks.map((payload,index)=>`${TEXT_TRANSFER_FORMAT}|${transferId}|${index+1}|${chunks.length}|${fullHash}|${hashes[index]}\n${payload}`);
    if(parts.some(part=>part.length>TEXT_TRANSFER_MAX_CHARS))throw new Error('分割テキストが1万字を超えました');
    return{transferId,fullHash,parts,total:parts.length,sourceLength:source.length,maxPartLength:Math.max(...parts.map(part=>part.length))};
  }

  function splitPastedTransferParts(value){
    const normalized=String(value||'').replace(/\r\n?/g,'\n').replace(/^[\t \n]+(?=CSTX1\|)/,'').replace(/\n+$/,'');
    return normalized.split(/\n+[\t ]*(?=CSTX1\|)/).map(item=>item.replace(/\n+$/,'')).filter(Boolean);
  }

  async function parseTextTransferPart(value){
    const text=String(value||'').replace(/\r\n?/g,'\n').replace(/^[\t \n]+(?=CSTX1\|)/,'').replace(/\n+$/,'');
    if(text.length>TEXT_TRANSFER_MAX_CHARS)throw new Error('1つの部分が1万字を超えています');
    const lineEnd=text.indexOf('\n');
    if(lineEnd<0)throw new Error('先頭情報と本文の区切りがありません');
    const [format,transferId,indexText,totalText,fullHash,partHash,...extra]=text.slice(0,lineEnd).split('|');
    if(format!==TEXT_TRANSFER_FORMAT||extra.length)throw new Error('分割テキストの形式が違います');
    const index=Number(indexText),total=Number(totalText),payload=text.slice(lineEnd+1);
    if(!/^[a-f0-9]{12}$/.test(transferId)||!Number.isInteger(index)||!Number.isInteger(total)||index<1||total<1||index>total||total>5000||!/^[a-f0-9]{64}$/.test(fullHash)||!/^[a-f0-9]{64}$/.test(partHash))throw new Error('番号または照合情報が正しくありません');
    if(await textTransferHash(payload)!==partHash)throw new Error(`${index}番の文字が欠けたか変わっています`);
    return{format,transferId,index,total,fullHash,partHash,payload,text};
  }

  async function joinTextTransferParts(values){
    const parsed=[];
    for(const value of values)for(const part of splitPastedTransferParts(value))parsed.push(await parseTextTransferPart(part));
    if(!parsed.length)throw new Error('分割テキストを貼り付けてください');
    const first=parsed[0],byIndex=new Map();
    for(const part of parsed){
      if(part.format!==first.format||part.transferId!==first.transferId||part.fullHash!==first.fullHash||part.total!==first.total)throw new Error('別々に作ったテキストが混ざっています');
      const existing=byIndex.get(part.index);
      if(existing&&existing.partHash!==part.partHash)throw new Error(`${part.index}番が2種類あります`);
      byIndex.set(part.index,part);
    }
    const missing=[];for(let index=1;index<=first.total;index++)if(!byIndex.has(index))missing.push(index);
    if(missing.length)return{complete:false,transferId:first.transferId,total:first.total,received:byIndex.size,missing,parts:byIndex,fullHash:first.fullHash};
    const text=[...byIndex.values()].sort((a,b)=>a.index-b.index).map(part=>part.payload).join('');
    if(await textTransferHash(text)!==first.fullHash)throw new Error('結合後の照合に失敗しました。各番号をもう一度確認してください');
    return{complete:true,format:first.format,transferId:first.transferId,total:first.total,received:byIndex.size,missing:[],parts:byIndex,fullHash:first.fullHash,text};
  }

  function textTransferFile(text,name='encrypted-transfer.json'){
    return{name,size:new TextEncoder().encode(text).byteLength,text:async()=>text};
  }

  function textTransferPartButtonHtml(index,selected){return`<button type="button" class="button ${index===selected?'primary':''}" data-text-part="${index}" aria-pressed="${index===selected}">${index}番</button>`;}

  function renderTextTransferPartPage(model,page,selected){
    const start=page*TEXT_TRANSFER_BUTTON_PAGE,end=Math.min(model.total,start+TEXT_TRANSFER_BUTTON_PAGE),container=document.getElementById('text-transfer-parts');
    if(!container)return;
    container.innerHTML=Array.from({length:end-start},(_,offset)=>textTransferPartButtonHtml(start+offset+1,selected)).join('');
    document.getElementById('text-transfer-page-label').textContent=model.total>TEXT_TRANSFER_BUTTON_PAGE?`${start+1}〜${end}番／全${model.total}個`: `全${model.total}個`;
    document.getElementById('text-transfer-prev').disabled=page===0;
    document.getElementById('text-transfer-next').disabled=end>=model.total;
  }

  async function copyTextTransferPart(model,index){
    const textarea=document.getElementById('text-transfer-output'),value=model.parts[index-1];
    textarea.value=value;textarea.focus();textarea.select();
    let copied=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);copied=true;}}catch{}
    if(!copied)try{copied=document.execCommand('copy');}catch{}
    showToast(copied?`${index}番をコピーしました`:`${index}番を表示しました。長押ししてコピーしてください`);
  }

  async function markTextTransferExport(kind,device){
    if(kind==='sync')await recordSyncHistory('export',{device});
    if(kind==='backup'){
      state.lastBackupAt=ClassDB.now();state.backupDismissedUntil=null;
      await ClassDB.setMeta('lastBackupAt',state.lastBackupAt);await ClassDB.setMeta('backupDismissedUntil',null);
      await recordSyncHistory('backup',{device});
    }
  }

  async function openTextTransferExport(kind='sync',options={}){
    await saveDeviceNameFromScreen();
    const syncScope=options.syncScope||null,recordTypes=options.recordTypes||null;
    const envelope=await createEncryptedFile(kind,false,syncScope,recordTypes);if(!envelope)return;
    const model=await createTextTransferParts(JSON.stringify(envelope));
    await markTextTransferExport(kind,envelope.device);
    const scopeNote=envelope.syncScope==='daily-delta'?`<p class="notice small">前回の基準以降に変わった記録だけです。PCで取込完了を確認した後、次回の差分の基準を更新してください。</p>`:'';
    const compressionNote=envelope.compression?`<p class="notice small"><strong>圧縮してから暗号化しました。</strong><br>圧縮前の記録 ${Math.ceil(envelope.compression.originalBytes/1024).toLocaleString('ja-JP')}KB → 送る暗号化テキスト ${model.sourceLength.toLocaleString('ja-JP')}字です。受取側もこの版以降のアプリで開いてください。</p>`:`<p class="muted small">この端末では圧縮せずに作成しました。受取側は従来どおり開けます。</p>`;
    let selected=1,page=0;
    openDialog(`<h2>暗号化した${kind==='backup'?'バックアップ':'日常記録'}を分割テキストで渡す</h2><p class="notice"><strong>ファイルを使わない緊急用です。</strong><br>1番から順にコピーして、Teamsなど学校で使える方法でPCへ送ります。内容は暗号化されていますが、公開の場所には貼らないでください。</p>${compressionNote}${scopeNote}<div class="text-transfer-summary"><strong>${model.total}個</strong><span>送る暗号化データ ${model.sourceLength.toLocaleString('ja-JP')}字・1個最大 ${model.maxPartLength.toLocaleString('ja-JP')}字</span></div>${model.total>60?'<p class="notice">60個を超えています。番号を途中で抜かさないよう、30個ずつ送ってください。</p>':''}<div class="toolbar-line text-transfer-page"><span id="text-transfer-page-label"></span><div class="button-row"><button type="button" class="button" id="text-transfer-prev">前の30個</button><button type="button" class="button" id="text-transfer-next">次の30個</button></div></div><div id="text-transfer-parts" class="text-transfer-part-grid"></div><div class="field section"><label for="text-transfer-output">選んだ番号のテキスト</label><textarea class="textarea text-transfer-output" id="text-transfer-output" rows="9" readonly spellcheck="false"></textarea><small class="field-help">コピー後は次の番号を選びます。受取側は順不同で追加でき、同じ番号を二度貼っても重複登録しません。</small></div><div class="dialog-actions"><button type="button" class="button" id="text-transfer-close">閉じる</button><button type="button" class="button primary" id="text-transfer-copy">この番号をコピー</button></div>`,'dialog-xwide');
    const select=index=>{selected=index;page=Math.floor((selected-1)/TEXT_TRANSFER_BUTTON_PAGE);renderTextTransferPartPage(model,page,selected);document.getElementById('text-transfer-output').value=model.parts[selected-1];document.querySelectorAll('[data-text-part]').forEach(button=>button.addEventListener('click',()=>select(Number(button.dataset.textPart))));};
    const turn=delta=>{page=Math.max(0,Math.min(Math.ceil(model.total/TEXT_TRANSFER_BUTTON_PAGE)-1,page+delta));selected=page*TEXT_TRANSFER_BUTTON_PAGE+1;select(selected);};
    document.getElementById('text-transfer-prev').addEventListener('click',()=>turn(-1));document.getElementById('text-transfer-next').addEventListener('click',()=>turn(1));
    document.getElementById('text-transfer-close').addEventListener('click',requestDialogClose);
    document.getElementById('text-transfer-copy').addEventListener('click',async()=>{await copyTextTransferPart(model,selected);if(selected<model.total)select(selected+1);});
    select(1);
  }

  function textTransferMissingLabel(session){
    const missing=[];for(let index=1;index<=session.total;index++)if(!session.parts.has(index))missing.push(index);
    if(!missing.length)return'すべてそろいました';
    const shown=missing.slice(0,12).join('、');return`不足：${shown}${missing.length>12?` ほか${missing.length-12}個`:''}`;
  }

  function updateTextTransferReceiveScreen(message='',error=false){
    const session=textTransferReceiveSession,status=document.getElementById('text-transfer-receive-status'),finish=document.getElementById('text-transfer-finish');if(!status||!session)return;
    status.className=error?'error':'notice';
    status.innerHTML=session.total?`<strong>${session.parts.size}／${session.total}個を受け取りました。</strong><br>${esc(textTransferMissingLabel(session))}${message?`<br>${esc(message)}`:''}`:`<strong>まだ追加されていません。</strong>${message?`<br>${esc(message)}`:''}`;
    finish.disabled=!session.total||session.parts.size!==session.total;
  }

  async function addTextTransferReceiveInput(){
    const input=document.getElementById('text-transfer-input'),values=splitPastedTransferParts(input.value);if(!values.length){updateTextTransferReceiveScreen('貼り付けるテキストを確認してください',true);return;}
    try{
      for(const value of values){const part=await parseTextTransferPart(value),session=textTransferReceiveSession;if(part.format!==session.format)throw new Error('暗号化テキストを貼り付けてください');if(session.transferId&&part.transferId!==session.transferId)throw new Error('別々に作ったテキストが混ざっています');if(!session.transferId){Object.assign(session,{transferId:part.transferId,total:part.total,fullHash:part.fullHash});}if(part.total!==session.total||part.fullHash!==session.fullHash)throw new Error('別々に作ったテキストが混ざっています');const existing=session.parts.get(part.index);if(existing&&existing.partHash!==part.partHash)throw new Error(`${part.index}番が2種類あります`);session.parts.set(part.index,part);}
      input.value='';updateTextTransferReceiveScreen(`${values.length}個を確認しました`);
    }catch(problem){updateTextTransferReceiveScreen(problem.message||'追加できませんでした',true);}
  }

  async function finishTextTransferReceive(){
    const session=textTransferReceiveSession;
    try{
      const result=await joinTextTransferParts([...session.parts.values()].map(part=>part.text));if(!result.complete)throw new Error(textTransferMissingLabel(session));
      const envelope=validateEncryptedEnvelope(JSON.parse(result.text));
      if(session.mode==='sync'&&envelope.kind!=='sync')throw new Error('日常記録の同期テキストではありません');
      if(session.mode==='backup'&&!['backup','archive'].includes(envelope.kind))throw new Error('バックアップまたは年度保管のテキストではありません');
      closeDialog();
      if(session.mode==='sync')await readEncryptedImport(textTransferFile(result.text,'text-sync.json'));
      else await restoreBackupFile(textTransferFile(result.text,'text-backup.json'));
    }catch(problem){updateTextTransferReceiveScreen(problem.message||'結合・復号を開始できませんでした',true);}
  }

  function openTextTransferReceive(mode='sync'){
    const format=TEXT_TRANSFER_FORMAT;
    textTransferReceiveSession={mode,format,transferId:null,total:0,fullHash:null,parts:new Map()};
    openDialog(`<h2>暗号化した${mode==='backup'?'バックアップ':'日常記録'}の分割テキストを受け取る</h2><p class="muted">送られてきた番号を1つずつ貼り付けます。順番は自由です。同じ番号は一度だけ数え、文字の欠け・変更・別データの混入をその場で止めます。</p><div class="field"><label for="text-transfer-input">番号付きテキストを貼り付け</label><textarea class="textarea text-transfer-input" id="text-transfer-input" rows="8" spellcheck="false" placeholder="CSTX1|… から始まる1番などを貼り付け"></textarea></div><div class="button-row section"><button type="button" class="button" id="text-transfer-add">この部分を追加</button><button type="button" class="button" id="text-transfer-reset">最初からやり直す</button></div><p class="notice" id="text-transfer-receive-status" role="status"></p><div class="dialog-actions"><button type="button" class="button" id="text-transfer-receive-close">閉じる</button><button type="button" class="button primary" id="text-transfer-finish" disabled>結合して内容を確認</button></div>`,'dialog-xwide');
    document.getElementById('text-transfer-add').addEventListener('click',addTextTransferReceiveInput);
    document.getElementById('text-transfer-reset').addEventListener('click',()=>{textTransferReceiveSession={mode,format,transferId:null,total:0,fullHash:null,parts:new Map()};document.getElementById('text-transfer-input').value='';updateTextTransferReceiveScreen('受取内容を消去しました');});
    document.getElementById('text-transfer-receive-close').addEventListener('click',requestDialogClose);
    document.getElementById('text-transfer-finish').addEventListener('click',event=>runOnce(event.currentTarget,finishTextTransferReceive));
    updateTextTransferReceiveScreen();
  }
