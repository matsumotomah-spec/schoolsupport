"use strict";

  async function deriveEncryptionKey(secret,salt,iterations=250000){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}

  async function protectText(value,secret){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=250000,key=await deriveEncryptionKey(secret,salt,iterations),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value));return{iterations,salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(encrypted))};}

  async function unprotectText(bundle,secret){const key=await deriveEncryptionKey(secret,base64ToBytes(bundle.salt),bundle.iterations),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(bundle.iv)},key,base64ToBytes(bundle.ciphertext));return new TextDecoder().decode(plain);}

  async function wrapDataKey(rawKey,secret){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=250000,key=await deriveEncryptionKey(secret,salt,iterations),wrapped=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,rawKey);return{iterations,salt:bytesToBase64(salt),iv:bytesToBase64(iv),wrappedKey:bytesToBase64(new Uint8Array(wrapped))};}

  async function unwrapDataKey(bundle,secret){const key=await deriveEncryptionKey(secret,base64ToBytes(bundle.salt),bundle.iterations);return crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(bundle.iv)},key,base64ToBytes(bundle.wrappedKey));}

  async function recoverySecretForSession(){if(!state.year.recoverySecretProtected||!state.sessionSecret)return null;try{return await unprotectText(state.year.recoverySecretProtected,state.sessionSecret);}catch{return null;}}

  async function encryptPayload(payload,kind,includeRecovery=true){const rawKey=crypto.getRandomValues(new Uint8Array(32)),dataKey=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt','decrypt']),payloadIv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:payloadIv},dataKey,new TextEncoder().encode(JSON.stringify(payload))),recoverySecret=includeRecovery?await recoverySecretForSession():null;const wraps={password:await wrapDataKey(rawKey,state.sessionSecret)};if(recoverySecret)wraps.recovery=await wrapDataKey(rawKey,recoverySecret);return{format:'class-support-encrypted',version:2,kind,yearLabel:state.year.label,passwordHint:state.year.passwordHint||'',createdAt:ClassDB.now(),device:payload.device,crypto:{algorithm:'AES-GCM',kdf:'PBKDF2-SHA-256',payloadIv:bytesToBase64(payloadIv),wraps},ciphertext:bytesToBase64(new Uint8Array(encrypted))};}

  async function decryptEnvelope(envelope,credential=state.sessionSecret,method='password'){validateEncryptedEnvelope(envelope);try{if(envelope.version===1){if(method==='recovery')throw new Error('この旧形式ファイルは年度パスワードで開いてください');const key=await deriveEncryptionKey(credential,base64ToBytes(envelope.crypto.salt),envelope.crypto.iterations),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(envelope.crypto.iv)},key,base64ToBytes(envelope.ciphertext));return JSON.parse(new TextDecoder().decode(plain));}const wrap=envelope.crypto.wraps?.[method];if(!wrap)throw new Error(method==='recovery'?'このバックアップには復旧コード情報がありません':'年度パスワード用の情報がありません');const rawKey=await unwrapDataKey(wrap,credential),dataKey=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(envelope.crypto.payloadIv)},dataKey,base64ToBytes(envelope.ciphertext));return JSON.parse(new TextDecoder().decode(plain));}catch(error){if(error.message?.includes('旧形式')||error.message?.includes('情報がありません'))throw error;throw new Error(method==='recovery'?'復旧コードが異なるか、ファイルが破損しています':'パスワードが異なるか、ファイルが破損しています');}}

  const YEAR_SYNC_META_KEYS=new Set(['testGradeThresholds','pupilOverviewVisibility','pupilKanaMode','showMonthlyForgotten','weeklySkippedWeeks','memoTags','certificateTags','supportTags','reportPromptTemplate','homeworkMedalLimit']);
  function isYearSyncMeta(key){return YEAR_SYNC_META_KEYS.has(key);}

  function trashBelongsToYear(item,classIds,yearId){return classIds.has(item?.record?.classId)||(item?.kind==='classBundle'&&item.classBundle?.class?.yearId===yearId);}
  async function collectYearPayload(){const classItems=await ClassDB.getAllByIndex('classes','yearId',state.year.id),classIds=new Set(classItems.map(item=>item.id));const allEnrollments=await ClassDB.getAll('enrollments'),enrollments=allEnrollments.filter(item=>classIds.has(item.classId));const studentIds=new Set(enrollments.map(item=>item.studentId));const students=(await ClassDB.getAll('students')).filter(item=>studentIds.has(item.id));const records=(await ClassDB.getAll('records')).filter(item=>classIds.has(item.classId));const trash=(await ClassDB.getAll('trash')).filter(item=>trashBelongsToYear(item,classIds,state.year.id));const meta=(await ClassDB.getAll('meta')).filter(item=>isYearSyncMeta(item.key));const device=await ClassDB.getMeta('syncDeviceName',syncDeviceDefault());return{format:'class-support-sync-payload',schemaVersion:1,yearId:state.year.id,yearLabel:state.year.label,generatedAt:ClassDB.now(),device,data:{years:[state.year],classes:classItems,students,enrollments,records,trash,meta}};}

  async function createEncryptedFile(kind,download=true){if(!await requestAnnualPassword())return null;if(['backup','archive'].includes(kind)&&!state.year.recoverySecretProtected){const ready=await prepareBackupExport();if(!ready)return null;}const payload=await collectYearPayload(),envelope=await encryptPayload(payload,kind);if(download){const prefix=kind==='backup'?'暗号化バックアップ':kind==='archive'?'年度保管':'同期';downloadText(`${prefix}_${safeFilePart(state.year.label)}_${syncDateStamp()}_${safeFilePart(payload.device)}.json`,JSON.stringify(envelope));if(kind==='backup'){state.lastBackupAt=ClassDB.now();state.backupDismissedUntil=null;await ClassDB.setMeta('lastBackupAt',state.lastBackupAt);await ClassDB.setMeta('backupDismissedUntil',null);}if(kind==='sync')await recordSyncHistory('export',{device:payload.device});if(kind==='backup')await recordSyncHistory('backup',{device:payload.device});if(kind==='archive')await recordSyncHistory('archive',{device:payload.device});}return envelope;}

  async function savePreSyncSnapshot(){
    const payload=await collectYearPayload(),envelope=await encryptPayload(payload,'pre-sync',false);
    const cutoff=Date.now()-30*86400000,existing=await ClassDB.getMeta('preSyncSnapshots',[]);
    const snapshots=[{id:ClassDB.uid('preSync'),createdAt:ClassDB.now(),yearId:payload.yearId,yearLabel:payload.yearLabel,envelope},...existing.filter(item=>Date.parse(item.createdAt)>=cutoff)].slice(0,3);
    await ClassDB.setMeta('preSyncSnapshots',snapshots);
    return snapshots[0];
  }

  async function restorePreSyncSnapshot(snapshotId,inSettings){
    if(!await requestAnnualPassword())return;
    try{
      const snapshots=await ClassDB.getMeta('preSyncSnapshots',[]),snapshot=snapshots.find(item=>item.id===snapshotId);
      if(!snapshot)throw new Error('同期前の保存が見つかりません');
      const payload=validateSyncPayload(await decryptEnvelope(snapshot.envelope));
      if(payload.yearId!==state.year.id)throw new Error('現在とは異なる年度の保存です');
      const classes=payload.data.classes.filter(item=>item.yearId===payload.yearId).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));
      if(!classes.length)throw new Error('戻せるクラスがありません');
      const selectedClassId=classes.some(item=>item.id===state.selectedClassId)?state.selectedClassId:classes[0].id,timestamp=ClassDB.now(),deviceId=ClassDB.deviceId();
      const meta=payload.data.meta.filter(item=>!['activeYearId','selectedClassId','lastMode','preSyncSnapshots'].includes(item.key));
      meta.push({key:'activeYearId',value:payload.yearId,updatedAt:timestamp,deviceId},{key:'selectedClassId',value:selectedClassId,updatedAt:timestamp,deviceId},{key:'preSyncSnapshots',value:snapshots,updatedAt:timestamp,deviceId});
      const replacement={...payload.data,meta};
      openDialog(`<h2>同期前の状態へ戻しますか</h2><p>${esc(new Date(snapshot.createdAt).toLocaleString('ja-JP'))}時点の、クラス ${classes.length}件・児童 ${payload.data.students.length}人・記録 ${payload.data.records.length}件へ戻します。</p><p class="notice">この操作では、同期後に追加・変更された内容が同期前の状態へ戻ります。</p><div class="dialog-actions"><button type="button" class="button" id="pre-sync-cancel">キャンセル</button><button type="button" class="button primary" id="pre-sync-confirm">同期前へ戻す</button></div>`);
      document.getElementById('pre-sync-cancel').addEventListener('click',requestDialogClose);
document.getElementById('pre-sync-confirm').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{try{await ClassDB.replaceYearRaw(replacement,payload.yearId);await reloadStateFromDb();closeDialog();showToast('同期前の状態へ戻しました');renderDataExchange(inSettings);}catch(problem){openDialog(`<h2>元に戻せませんでした</h2><p>${esc(problem.message||'保存処理を完了できませんでした')}</p><div class="dialog-actions"><button type="button" class="button primary" id="pre-sync-error-close">OK</button></div>`);document.getElementById('pre-sync-error-close').addEventListener('click',requestDialogClose);}}));
    }catch(problem){openDialog(`<h2>同期前の保存を開けませんでした</h2><p>${esc(problem.message||'保存内容を確認できませんでした')}</p><div class="dialog-actions"><button type="button" class="button primary" id="pre-sync-error-close">OK</button></div>`);document.getElementById('pre-sync-error-close').addEventListener('click',requestDialogClose);}
  }

  async function restoreBackupFile(file){
    if(!file||!await requestAnnualPassword())return;
    try{
      const envelope=validateEncryptedEnvelope(JSON.parse(await readImportText(file,'暗号化バックアップ'))),payload=validateSyncPayload(await decryptEnvelope(envelope));
      if(!['backup','archive'].includes(envelope.kind))throw new Error('故障時の復旧には、バックアップまたは年度保管ファイルを選んでください');
      const year=payload.data.years.find(item=>item.id===payload.yearId),classes=payload.data.classes.filter(item=>item.yearId===payload.yearId).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));
      if(!year||!classes.length)throw new Error('復旧できる年度・クラスがありません');
      const selectedClassId=classes[0].id,timestamp=ClassDB.now(),deviceId=ClassDB.deviceId(),meta=payload.data.meta.filter(item=>!['activeYearId','selectedClassId','lastMode','preSyncSnapshots'].includes(item.key));
      meta.push({key:'activeYearId',value:year.id,updatedAt:timestamp,deviceId},{key:'selectedClassId',value:selectedClassId,updatedAt:timestamp,deviceId});
      const replacement={...payload.data,meta};
      openDialog(`<h2>${esc(payload.yearLabel)}のバックアップを戻しますか</h2><p>クラス ${classes.length}件、児童 ${payload.data.students.length}人、記録 ${payload.data.records.length}件を確認しました。</p><p class="notice"><strong>この端末に現在ある新形式データを、バックアップの内容へ置き換えます。</strong><br>iPadとPCの記録を追加統合する場合は、上の「別の端末で作ったファイルを取り込む」を使ってください。</p><div class="dialog-actions"><button type="button" class="button" id="backup-restore-cancel">キャンセル</button><button type="button" class="button primary" id="backup-restore-confirm">確認して復旧</button></div>`);
      document.getElementById('backup-restore-cancel').addEventListener('click',requestDialogClose);
document.getElementById('backup-restore-confirm').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{try{await ClassDB.replaceYearRaw(replacement,payload.yearId);await reloadStateFromDb();closeDialog();showToast('バックアップの内容へ復旧しました');renderHome();}catch(problem){openDialog(`<h2>復旧を完了できませんでした</h2><p>${esc(problem.message||'端末への保存に失敗しました')}</p><p class="muted">元のデータは変更されていません。</p><div class="dialog-actions"><button type="button" class="button primary" id="backup-restore-error-close">OK</button></div>`);document.getElementById('backup-restore-error-close').addEventListener('click',requestDialogClose);}}));
    }catch(problem){openDialog(`<h2>バックアップを開けませんでした</h2><p>${esc(problem.message||'ファイルを確認してください')}</p><div class="dialog-actions"><button type="button" class="button primary" id="backup-restore-error-close">OK</button></div>`);document.getElementById('backup-restore-error-close').addEventListener('click',requestDialogClose);}
  }

  async function prepareBackupExport(){if(state.year.recoverySecretProtected)return true;return new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener('cancel',onDialogCancel);resolve(value);},onDialogCancel=()=>finish(false);openDialog(`<h2>復旧コードを確認</h2><p class="muted">この端末の設定は旧形式です。今回だけ復旧コードを入力すると、今後のバックアップを復旧コードでも開けるようになります。</p><form id="backup-recovery-form"><div class="field"><label for="backup-recovery-code">${esc(state.year.label)}の復旧コード</label><input class="input" id="backup-recovery-code" autocomplete="off" required></div><p class="error" id="backup-recovery-error"></p><div class="dialog-actions"><button type="button" class="button" id="backup-recovery-cancel">キャンセル</button><button type="submit" class="button primary">確認して保存</button></div></form>`);dialog.addEventListener('cancel',onDialogCancel,{once:true});document.getElementById('backup-recovery-cancel').addEventListener('click',()=>{if(requestDialogClose())finish(false);});document.getElementById('backup-recovery-form').addEventListener('submit',async event=>{event.preventDefault();const code=document.getElementById('backup-recovery-code').value.trim().toUpperCase();if(!await verifySecret(code,state.year.recoveryAuth)){document.getElementById('backup-recovery-error').textContent='復旧コードが一致しません。';return;}state.year=await ClassDB.put('years',{...state.year,recoverySecretProtected:await protectText(code,state.sessionSecret)});closeDialog();finish(true);});});}
