"use strict";

  const TEXT_TRANSFER_FORMAT='CSTX1';
  const TEXT_TRANSFER_PLAIN_FORMAT='CSTP1';
  const TEXT_TRANSFER_MAX_CHARS=10000;
  const TEXT_TRANSFER_PAYLOAD_CHARS=9600;
  const TEXT_TRANSFER_BUTTON_PAGE=30;
  let textTransferReceiveSession=null;

  async function textTransferHash(value){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));
    return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }

  async function createTextTransferParts(text,format=TEXT_TRANSFER_FORMAT){
    const source=String(text||'');
    if(!source)throw new Error('表示する暗号化データがありません');
    const fullHash=await textTransferHash(source),transferId=fullHash.slice(0,12),chunks=[];
    for(let offset=0;offset<source.length;){let end=Math.min(source.length,offset+TEXT_TRANSFER_PAYLOAD_CHARS);if(end<source.length&&/[\uD800-\uDBFF]/.test(source[end-1])&&/[\uDC00-\uDFFF]/.test(source[end]))end--;chunks.push(source.slice(offset,end));offset=end;}
    const hashes=await Promise.all(chunks.map(textTransferHash));
    const parts=chunks.map((payload,index)=>`${format}|${transferId}|${index+1}|${chunks.length}|${fullHash}|${hashes[index]}\n${payload}`);
    if(parts.some(part=>part.length>TEXT_TRANSFER_MAX_CHARS))throw new Error('分割テキストが1万字を超えました');
    return{transferId,fullHash,parts,total:parts.length,sourceLength:source.length,maxPartLength:Math.max(...parts.map(part=>part.length))};
  }

  function splitPastedTransferParts(value){
    const normalized=String(value||'').replace(/\r\n?/g,'\n').replace(/^[\t \n]+(?=CST[XP]1\|)/,'').replace(/\n+$/,'');
    return normalized.split(/\n+[\t ]*(?=CST[XP]1\|)/).map(item=>item.replace(/\n+$/,'')).filter(Boolean);
  }

  async function parseTextTransferPart(value){
    const text=String(value||'').replace(/\r\n?/g,'\n').replace(/^[\t \n]+(?=CST[XP]1\|)/,'').replace(/\n+$/,'');
    if(text.length>TEXT_TRANSFER_MAX_CHARS)throw new Error('1つの部分が1万字を超えています');
    const lineEnd=text.indexOf('\n');
    if(lineEnd<0)throw new Error('先頭情報と本文の区切りがありません');
    const [format,transferId,indexText,totalText,fullHash,partHash,...extra]=text.slice(0,lineEnd).split('|');
    if(![TEXT_TRANSFER_FORMAT,TEXT_TRANSFER_PLAIN_FORMAT].includes(format)||extra.length)throw new Error('分割テキストの形式が違います');
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

  async function createPlainTextTransfer(kind){const syncScope=kind==='sync'&&!isDesktopDevice()?'daily-records':'full',payload=await collectYearPayload(syncScope);return{format:'class-support-plaintext-transfer',version:1,kind,yearLabel:state.year.label,createdAt:ClassDB.now(),device:payload.device,payload};}

  function validatePlainTextTransfer(transfer){if(!transfer||typeof transfer!=='object'||Array.isArray(transfer)||transfer.format!=='class-support-plaintext-transfer'||Number(transfer.version)!==1||transfer.kind!=='sync')throw new Error('テスト用平文テキストの形式が正しくありません');return validateSyncPayload(transfer.payload);}

  async function openTextTransferExport(kind='sync',mode='encrypted'){
    await saveDeviceNameFromScreen();
    const plain=mode==='plain';
    if(plain&&kind!=='sync')throw new Error('平文テキストは日常記録だけで使えます');
    if(plain&&!await requestAnnualPassword())return;
    const envelope=plain?await createPlainTextTransfer(kind):await createEncryptedFile(kind,false);if(!envelope)return;
    const model=await createTextTransferParts(JSON.stringify(envelope),plain?TEXT_TRANSFER_PLAIN_FORMAT:TEXT_TRANSFER_FORMAT);
    await markTextTransferExport(kind,envelope.device);
    const compressionNote=plain?`<p class="notice"><strong>テスト専用：内容は暗号化されていません。</strong><br>児童名・記録などが、この画面・コピー先・送信先にそのまま表示されます。検証後に削除する暫定機能です。</p>`:envelope.compression?`<p class="notice small"><strong>圧縮してから暗号化しました。</strong><br>圧縮前の記録 ${Math.ceil(envelope.compression.originalBytes/1024).toLocaleString('ja-JP')}KB → 送る暗号化テキスト ${model.sourceLength.toLocaleString('ja-JP')}字です。受取側もこの版以降のアプリで開いてください。</p>`:`<p class="muted small">この端末では圧縮せずに作成しました。受取側は従来どおり開けます。</p>`;
    let selected=1,page=0;
    openDialog(`<h2>${plain?'テスト用・平文':'暗号化した'}${kind==='backup'?'バックアップ':'日常記録'}を分割テキストで渡す</h2><p class="notice"><strong>ファイルを使わない緊急用です。</strong><br>1番から順にコピーして、Teamsなど学校で使える方法でPCへ送ります。${plain?'':'内容は暗号化されていますが、公開の場所には貼らないでください。'}</p>${compressionNote}<div class="text-transfer-summary"><strong>${model.total}個</strong><span>送る${plain?'平文':'暗号化'}データ ${model.sourceLength.toLocaleString('ja-JP')}字・1個最大 ${model.maxPartLength.toLocaleString('ja-JP')}字</span></div>${model.total>60?'<p class="notice">60個を超えています。番号を途中で抜かさないよう、30個ずつ送ってください。</p>':''}<div class="toolbar-line text-transfer-page"><span id="text-transfer-page-label"></span><div class="button-row"><button type="button" class="button" id="text-transfer-prev">前の30個</button><button type="button" class="button" id="text-transfer-next">次の30個</button></div></div><div id="text-transfer-parts" class="text-transfer-part-grid"></div><div class="field section"><label for="text-transfer-output">選んだ番号のテキスト</label><textarea class="textarea text-transfer-output" id="text-transfer-output" rows="9" readonly spellcheck="false"></textarea><small class="field-help">コピー後は次の番号を選びます。受取側は順不同で追加でき、同じ番号を二度貼っても重複登録しません。</small></div><div class="dialog-actions"><button type="button" class="button" id="text-transfer-close">閉じる</button><button type="button" class="button primary" id="text-transfer-copy">この番号をコピー</button></div>`,'dialog-xwide');
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
      for(const value of values){const part=await parseTextTransferPart(value),session=textTransferReceiveSession;if(part.format!==session.format)throw new Error(session.format===TEXT_TRANSFER_PLAIN_FORMAT?'テスト用平文テキストを貼り付けてください':'暗号化テキストを貼り付けてください');if(session.transferId&&part.transferId!==session.transferId)throw new Error('別々に作ったテキストが混ざっています');if(!session.transferId){Object.assign(session,{transferId:part.transferId,total:part.total,fullHash:part.fullHash});}if(part.total!==session.total||part.fullHash!==session.fullHash)throw new Error('別々に作ったテキストが混ざっています');const existing=session.parts.get(part.index);if(existing&&existing.partHash!==part.partHash)throw new Error(`${part.index}番が2種類あります`);session.parts.set(part.index,part);}
      input.value='';updateTextTransferReceiveScreen(`${values.length}個を確認しました`);
    }catch(problem){updateTextTransferReceiveScreen(problem.message||'追加できませんでした',true);}
  }

  async function finishTextTransferReceive(){
    const session=textTransferReceiveSession;
    try{
      const result=await joinTextTransferParts([...session.parts.values()].map(part=>part.text));if(!result.complete)throw new Error(textTransferMissingLabel(session));
      const transfer=JSON.parse(result.text);
      if(session.format===TEXT_TRANSFER_PLAIN_FORMAT){const payload=validatePlainTextTransfer(transfer);closeDialog();await openImportedSyncPayload(payload,{kind:'sync',plaintextTransfer:true});return;}
      const envelope=validateEncryptedEnvelope(transfer);
      if(session.mode==='sync'&&envelope.kind!=='sync')throw new Error('日常記録の同期テキストではありません');
      if(session.mode==='backup'&&!['backup','archive'].includes(envelope.kind))throw new Error('バックアップまたは年度保管のテキストではありません');
      closeDialog();
      if(session.mode==='sync')await readEncryptedImport(textTransferFile(result.text,'text-sync.json'));
      else await restoreBackupFile(textTransferFile(result.text,'text-backup.json'));
    }catch(problem){updateTextTransferReceiveScreen(problem.message||'結合・復号を開始できませんでした',true);}
  }

  function openTextTransferReceive(mode='sync',transferMode='encrypted'){
    const plain=transferMode==='plain',format=plain?TEXT_TRANSFER_PLAIN_FORMAT:TEXT_TRANSFER_FORMAT;
    textTransferReceiveSession={mode,format,transferId:null,total:0,fullHash:null,parts:new Map()};
    openDialog(`<h2>${plain?'テスト用・平文':'暗号化した'}${mode==='backup'?'バックアップ':'日常記録'}の分割テキストを受け取る</h2>${plain?'<p class="notice"><strong>テスト専用：内容は暗号化されていません。</strong><br>確認後、送信先やコピー履歴から削除してください。</p>':''}<p class="muted">送られてきた番号を1つずつ貼り付けます。順番は自由です。同じ番号は一度だけ数え、文字の欠け・変更・別データの混入をその場で止めます。</p><div class="field"><label for="text-transfer-input">番号付きテキストを貼り付け</label><textarea class="textarea text-transfer-input" id="text-transfer-input" rows="8" spellcheck="false" placeholder="${plain?'CSTP1':'CSTX1'}|… から始まる1番などを貼り付け"></textarea></div><div class="button-row section"><button type="button" class="button" id="text-transfer-add">この部分を追加</button><button type="button" class="button" id="text-transfer-reset">最初からやり直す</button></div><p class="notice" id="text-transfer-receive-status" role="status"></p><div class="dialog-actions"><button type="button" class="button" id="text-transfer-receive-close">閉じる</button><button type="button" class="button primary" id="text-transfer-finish" disabled>結合して内容を確認</button></div>`,'dialog-xwide');
    document.getElementById('text-transfer-add').addEventListener('click',addTextTransferReceiveInput);
    document.getElementById('text-transfer-reset').addEventListener('click',()=>{textTransferReceiveSession={mode,format,transferId:null,total:0,fullHash:null,parts:new Map()};document.getElementById('text-transfer-input').value='';updateTextTransferReceiveScreen('受取内容を消去しました');});
    document.getElementById('text-transfer-receive-close').addEventListener('click',requestDialogClose);
    document.getElementById('text-transfer-finish').addEventListener('click',event=>runOnce(event.currentTarget,finishTextTransferReceive));
    updateTextTransferReceiveScreen();
  }
