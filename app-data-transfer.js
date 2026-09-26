"use strict";

  const SETUP_TRANSFER_CODE_WARNING_LENGTH=28000,SETUP_TRANSFER_CODE_MAX_LENGTH=48000,SETUP_TRANSFER_CODE_MAX_AGE_MS=31*24*60*60*1000;
  const SETUP_TRANSFER_SHARED_META_KEYS=new Set(['memoTags','certificateTags','certificateTagDefinitions','supportTags','testGradeThresholds','pupilOverviewVisibility','pupilKanaMode','showMonthlyForgotten','reportPromptTemplate','homeworkMedalLimit']);

  function normalizedSetupTransferCode(value){return String(value||'').replace(/\s+/g,'');}

  function setupTransferSizeNotice(length){
    if(length>SETUP_TRANSFER_CODE_MAX_LENGTH)throw new Error('受け渡しコードが長すぎます。名簿・座席設定を確認して、別の方法で初期設定を行ってください');
    return length>SETUP_TRANSFER_CODE_WARNING_LENGTH?'<p class="notice">コードが長めです。Teams本文で一度にコピーできない場合は、この受け渡し方法を使わず、PCで名簿を登録してください。</p>':'';
  }

  function setupTransferReadiness(classItem,enrollments,students){
    const numbers=new Map();enrollments.forEach(item=>{const number=String(item.number||'').trim();if(number)numbers.set(number,(numbers.get(number)||0)+1);});
    const duplicateNumbers=[...numbers].filter(([,count])=>count>1).map(([number])=>number),studentIds=new Set(students.map(item=>item.id)),layout=Array.isArray(classItem.activeSeatLayout)?classItem.activeSeatLayout:[],placed=new Set(layout.filter(id=>studentIds.has(id))),unplaced=students.filter(item=>!placed.has(item.id)).length;
    return{duplicateNumbers,hasSeatLayout:layout.some(id=>studentIds.has(id)),unplaced};
  }

  function setupTransferPayloadValid(payload){
    if(!payload||payload.format!=='class-support-setup-transfer'||payload.schemaVersion!==1)throw new Error('このコードは初回受け取り用ではありません');
    if(!payload.createdAt||Number.isNaN(new Date(payload.createdAt).getTime()))throw new Error('受け渡しコードの作成日時を確認できません');
    const year=payload.data?.year,classItem=payload.data?.classItem,students=payload.data?.students,enrollments=payload.data?.enrollments,cleaningConfig=payload.data?.cleaningConfig,sharedSettings=payload.data?.sharedSettings||[];
    if(!year?.id||!year?.auth||!classItem?.id||!Array.isArray(students)||!Array.isArray(enrollments))throw new Error('受け取り用データが不足しています');
    if(classItem.yearId!==year.id)throw new Error('年度とクラスの組み合わせを確認できません');
    const studentIds=new Set(students.map(item=>item?.id)),enrollmentIds=new Set();
    if(studentIds.size!==students.length||students.some(item=>!item?.id)||enrollments.some(item=>!item?.id||enrollmentIds.has(item.id)||item.classId!==classItem.id||!studentIds.has(item.studentId)||(enrollmentIds.add(item.id),false)))throw new Error('名簿の対応を確認できません');
    if(cleaningConfig&&(!Array.isArray(cleaningConfig.groups)||cleaningConfig.classId!==classItem.id||cleaningConfig.yearId!==year.id||cleaningConfig.type!==CLEANING_CONFIG_TYPE))throw new Error('掃除班の設定を確認できません');
    if(!Array.isArray(sharedSettings)||sharedSettings.some(item=>!item||!SETUP_TRANSFER_SHARED_META_KEYS.has(item.key)))throw new Error('共通設定を確認できません');
    return payload;
  }

  async function createSetupTransferCode(mode='initial'){
    const classItem=selectedClass();if(!classItem){showToast('先にクラスを選んでください');return;}
    if(!await requestAnnualPassword())return;
    const enrollments=await ClassDB.getAllByIndex('enrollments','classId',classItem.id),studentIds=new Set(enrollments.map(item=>item.studentId)),students=(await ClassDB.getAll('students')).filter(item=>studentIds.has(item.id)),seatingSettings=await ClassDB.get('meta',`seatingSettings_${classItem.id}`),cleaningConfig=await ClassDB.get('records',cleaningConfigId(classItem.id));
    const readiness=setupTransferReadiness(classItem,enrollments,students);
    if(readiness.duplicateNumbers.length){openDialog(`<h2>出席番号を確認してください</h2><p>${esc(readiness.duplicateNumbers.join('・'))}番が重複しています。</p><p class="notice">iPadへ渡す前に、名簿で出席番号を直してください。</p><div class="dialog-actions"><button type="button" class="button" id="setup-transfer-number-close">閉じる</button><button type="button" class="button primary" id="setup-transfer-open-roster">名簿を開く ▶</button></div>`);document.getElementById('setup-transfer-number-close').addEventListener('click',requestDialogClose);document.getElementById('setup-transfer-open-roster').addEventListener('click',()=>{closeDialog();state.classSettingsView='roster';renderClassSettings();});return;}
    const sharedSettings=mode==='update'?[]:(await ClassDB.getAll('meta')).filter(item=>SETUP_TRANSFER_SHARED_META_KEYS.has(item.key)),kind=mode==='update'?'setup-update':'setup-transfer',payload={format:'class-support-setup-transfer',schemaVersion:1,createdAt:ClassDB.now(),sourceDevice:await ClassDB.getMeta('syncDeviceName',syncDeviceDefault()),data:{year:state.year,classItem,students,enrollments,seatingSettings,cleaningConfig,sharedSettings}};
    const envelope=await encryptPayload(payload,kind,false),code=JSON.stringify(envelope),sizeNotice=setupTransferSizeNotice(code.length),title=mode==='update'?'iPadへ名簿・座席を反映':'iPadへ年度・名簿を渡す',destination=mode==='update'?'データ管理の「PCから名簿・座席を反映」':'新しいiPadでは最初の画面、年度を追加するiPadではデータ管理の「PCから次の年度を受け取る」';
    const seatingNotice=readiness.hasSeatLayout?(readiness.unplaced?`<p class="notice">座席設定はありますが、${readiness.unplaced}人が未配置です。必要ならPCで席替えを開いて確認してください。</p>`:'<p class="status-line good">名簿と座席設定を確認しました。</p>'):'<p class="notice">座席設定はまだありません。iPadでの初期設定後に、PCの席替えから追加できます。</p>';
    openDialog(`<h2>${title}</h2><p class="muted">${esc(classItem.name)}の年度・名簿・座席設定${cleaningConfig?'・掃除班の設定':''}${sharedSettings.length?'・共通設定':''}だけを暗号化しています。日常記録、紙テスト、成績、削除履歴は含みません。</p>${seatingNotice}<ol class="transfer-steps"><li>このコードをコピーして、Teamsの本文などiPadで開ける場所へ貼り付けます。</li><li>${destination}を押します。</li><li>コードと同じデータ保護パスワードを入力し、内容を確認して受け取ります。</li></ol>${sizeNotice}<div class="field"><label for="setup-transfer-code">受け渡しコード（${code.length.toLocaleString()}文字）</label><textarea class="textarea transfer-code" id="setup-transfer-code" readonly>${esc(code)}</textarea></div><div class="dialog-actions"><button type="button" class="button" id="setup-transfer-copy">コピー</button><button type="button" class="button primary" id="setup-transfer-close">閉じる</button></div>`,'dialog-wide');
    document.getElementById('setup-transfer-copy').addEventListener('click',async()=>{await copyText(code);showToast('受け渡しコードをコピーしました');});document.getElementById('setup-transfer-close').addEventListener('click',requestDialogClose);
  }

  function openSetupTransferReceive(mode='initial'){
    const update=mode==='update',newYear=mode==='new-year',expectedKind=update?'setup-update':'setup-transfer',title=update?'PCから名簿・座席を反映':newYear?'PCから次の年度を受け取る':'PCから初期設定を受け取る',description=update?'同じ年度・クラスの名簿、座席設定、掃除班設定だけを反映します。日常記録や紙テストは変更しません。':newYear?'PCで用意した次の年度の名簿・座席設定を追加します。現在の年度の記録は残り、置き換えません。':'PCで作った受け渡しコードと、同じデータ保護パスワードを入力してください。年度・名簿・座席設定と、作成済みの場合は掃除班の設定だけを登録します。';
    openDialog(`<h2>${title}</h2><p class="muted">${description}</p><ol class="transfer-steps"><li>Teams本文などでPCからのコードを開き、すべてコピーします。</li><li>下の欄へ貼り付け、データ保護パスワードを入力します。</li><li>年度・クラス・人数を確認してから受け取ります。</li></ol><form id="setup-transfer-receive-form"><div class="field"><label for="setup-transfer-input">受け渡しコード</label><textarea class="textarea transfer-code" id="setup-transfer-input" autocomplete="off" required></textarea></div><div class="field section"><label for="setup-transfer-password">データ保護パスワード</label><input class="input" id="setup-transfer-password" type="password" autocomplete="current-password" required></div><p class="error" id="setup-transfer-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button" id="setup-transfer-receive-cancel">キャンセル</button><button type="submit" class="button primary">内容を確認</button></div></form>`,'dialog-wide');
    document.getElementById('setup-transfer-receive-cancel').addEventListener('click',requestDialogClose);
    document.getElementById('setup-transfer-receive-form').addEventListener('submit',async event=>{event.preventDefault();const error=document.getElementById('setup-transfer-error'),text=normalizedSetupTransferCode(document.getElementById('setup-transfer-input').value),password=document.getElementById('setup-transfer-password').value;try{if(text.length>SETUP_TRANSFER_CODE_MAX_LENGTH)throw new Error('受け渡しコードが長すぎます。PCで名簿を登録してください');const envelope=validateEncryptedEnvelope(JSON.parse(text));if(envelope.kind!==expectedKind)throw new Error(update?'PCで作成した名簿・座席更新用コードを貼り付けてください':'PCで作成した初期設定用コードを貼り付けてください');const payload=setupTransferPayloadValid(await decryptEnvelope(envelope,password));if(Date.now()-Date.parse(payload.createdAt)>SETUP_TRANSFER_CODE_MAX_AGE_MS)throw new Error('受け渡しコードの作成から31日以上経っています。PCで最新のコードを作り直してください');openSetupTransferConfirmation(payload,password,mode);}catch(problem){error.textContent=problem.message||'コードまたはパスワードを確認してください';}});
  }

  function openSetupTransferConfirmation(payload,password,mode='initial'){
    const {year,classItem,students,enrollments,seatingSettings,cleaningConfig,sharedSettings=[]}=payload.data;
    const update=mode==='update',newYear=mode==='new-year';
    openDialog(`<h2>${update?'この名簿・座席を反映しますか':newYear?'この年度を追加しますか':'この初期設定を受け取りますか'}</h2><p><strong>${esc(year.label)}　${esc(classItem.name)}</strong></p><p>名簿 ${enrollments.length}人・座席設定 ${seatingSettings?'あり':'なし'}・掃除班 ${cleaningConfig?'あり':'なし'}${sharedSettings.length?`・共通設定 ${sharedSettings.length}件`:''}</p><p class="row-meta">PCで作成：${esc(new Date(payload.createdAt).toLocaleString('ja-JP'))}（${esc(payload.sourceDevice||'端末名なし')}）</p><p class="notice">${update?'日常記録や紙テストは変更しません。転出した児童の過去記録も残します。古いコードを使うと名簿・座席が戻るため、PCで作り直した最新のコードだけを使ってください。':newYear?'現在の年度と記録は残したまま、新しい年度・名簿・座席設定と共通設定だけを追加します。日常記録や紙テストは受け取りません。':'この端末には、まだ年度データがない場合だけ登録できます。日常記録や紙テストは受け取りません。'}</p><div class="dialog-actions"><button type="button" class="button" id="setup-transfer-confirm-cancel">戻る</button><button type="button" class="button primary" id="setup-transfer-confirm">${update?'この内容を反映':newYear?'この年度を追加':'受け取って始める'}</button></div>`);
    document.getElementById('setup-transfer-confirm-cancel').addEventListener('click',()=>openSetupTransferReceive(mode));
    document.getElementById('setup-transfer-confirm').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{
      const years=await ClassDB.getAll('years'),timestamp=ClassDB.now(),deviceId=ClassDB.deviceId();
      if(update){
        const existingYear=years.find(item=>item.id===year.id),existingClass=await ClassDB.get('classes',classItem.id);
        if(!existingYear||!existingClass){showToast('この端末の年度・クラスと一致しません。初期設定用コードを確認してください');return;}
        const oldEnrollments=await ClassDB.getAllByIndex('enrollments','classId',classItem.id),incomingIds=new Set(enrollments.map(item=>item.id)),removedEnrollmentIds=oldEnrollments.filter(item=>!incomingIds.has(item.id)).map(item=>item.id),meta=seatingSettings?[{...seatingSettings,key:`seatingSettings_${classItem.id}`,updatedAt:timestamp,deviceId}]:[];
        const deletes={};if(removedEnrollmentIds.length)deletes.enrollments=removedEnrollmentIds;if(!seatingSettings)deletes.meta=[`seatingSettings_${classItem.id}`];
        await ClassDB.applyBatch({puts:{classes:[classItem],students,enrollments,records:cleaningConfig?[cleaningConfig]:[],meta},deletes});
        await reloadStateFromDb();state.sessionSecret=password;closeDialog();showToast('PCの名簿・座席設定を反映しました');renderHome();return;
      }
      if(newYear){
        if(years.some(item=>item.id===year.id||item.label===year.label)){showToast('同じ年度がすでにあります。名簿・座席の反映を使ってください');return;}
        const existingStudentIds=new Set((await ClassDB.getAll('students')).map(item=>item.id));
        if(students.some(item=>existingStudentIds.has(item.id))){showToast('前年度と同じ児童IDが含まれています。PCで新年度の名簿を作り直してください');return;}
        const meta=[{key:'activeYearId',value:year.id,updatedAt:timestamp,deviceId},{key:'selectedClassId',value:classItem.id,updatedAt:timestamp,deviceId},{key:'onboardingStep',value:3,updatedAt:timestamp,deviceId},...sharedSettings.map(item=>({key:item.key,value:item.value,updatedAt:timestamp,deviceId}))];
        if(seatingSettings)meta.push({...seatingSettings,key:`seatingSettings_${classItem.id}`,updatedAt:timestamp,deviceId});
        await ClassDB.applyBatch({puts:{years:[year],classes:[classItem],students,enrollments,records:cleaningConfig?[cleaningConfig]:[],meta}});
        await reloadStateFromDb();state.sessionSecret=password;closeDialog();showToast('PCで用意した新しい年度を受け取りました');renderHome();return;
      }
      if(years.length){showToast('この端末にはすでに年度データがあります。データ管理から取り込んでください');return;}
      const meta=[{key:'activeYearId',value:year.id,updatedAt:timestamp,deviceId},{key:'selectedClassId',value:classItem.id,updatedAt:timestamp,deviceId},{key:'onboardingStep',value:3,updatedAt:timestamp,deviceId},...sharedSettings.map(item=>({key:item.key,value:item.value,updatedAt:timestamp,deviceId}))];
      if(seatingSettings)meta.push({...seatingSettings,key:`seatingSettings_${classItem.id}`,updatedAt:timestamp,deviceId});
      await ClassDB.applyBatch({puts:{years:[year],classes:[classItem],students,enrollments,records:cleaningConfig?[cleaningConfig]:[],meta}});
      await reloadStateFromDb();state.sessionSecret=password;unlockTeacher(password);closeDialog();showToast('PCの初期設定を受け取りました');renderHome();
    }));
  }
