(function(){
  'use strict';

  const app=document.getElementById('app');
  const dialog=document.getElementById('dialog');
  const toastElement=document.getElementById('toast');
  const AUTH_MS=5*60*1000;
  const AUTH_ITERATIONS=210000;
  const PIN_LENGTH=6;
  const PIN_MAX_FAILURES=5;
  const PIN_LOCK_MS=30*1000;
  const PIN_ATTEMPT_KEY='classSupportPinAttemptsV1';
  const COLORS=['#d85b5b','#ef9fb4','#4e78b8','#9adfe8','#efd66e','#397257','#7651a8'];
  const SUBJECTS=['国語','算数','理科','社会','生活','音楽','図画工作','家庭','体育','外国語','道徳','総合','自立活動'];
  const SUPPORT_TAGS={
    '理解・技能':['理解できた','手順を覚えた','自力でできた'],
    '取組・集中':['集中して取り組んだ','最後まで続けた','切り替えられた'],
    '発言・表現':['自分の考えを伝えた','理由を説明した','質問できた'],
    '他者との関わり':['友達と協力した','相手の話を聞いた','助けを求められた'],
    '作品（文・絵）':['丁寧に仕上げた','工夫が見られた','自分らしく表現した']
  };
  const MEMO_TAGS=['集中していた','意欲的だった','自力でできた','工夫していた','最後まで取り組んだ','発表した','考えを伝えた','友達と協力した'];
  const state={
    year:null,
    classes:[],
    selectedClassId:null,
    theme:'light',
    teacherUntil:0,
    sessionSecret:null,
    pinFailures:0,
    pinLockedUntil:0,
    route:'boot',
    settingsTab:'year',
    classSettingsView:'list',
    rosterDraft:[],
    rosterLoadedForClassId:null,
    activeTool:null,
    toolDraft:{},
    pupilTool:'daily',
    pupilDate:null,
    pupilWeeklyId:null,
    pupilOccasionalId:null,
    migrationSources:[],
    migrationPromptShown:false,
    verifiedLegacyCleanupKeys:[],
    setupDraft:null,
    rolloverArchiveVerified:null,
    rolloverDraft:null,
    rolloverContinue:false,
    lockTimer:null
  };

  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function schoolYear(){const d=new Date();return d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;}
  function yearNumberOf(year){const direct=Number(year?.yearNumber);if(Number.isFinite(direct)&&direct>0)return direct;const match=String(year?.label||'').match(/\d{4}/);return match?Number(match[0]):0;}
  function rolloverDue(){return Boolean(state.year&&schoolYear()>yearNumberOf(state.year));}
  function jpDate(value){if(!value)return'';const [y,m,d]=value.split('-').map(Number);return `${y}年${m}月${d}日`;}
  function shortJpDate(value){if(!value)return'';const date=new Date(`${value}T00:00:00`);const days=['日','月','火','水','木','金','土'];return `${date.getMonth()+1}月${date.getDate()}日（${days[date.getDay()]}）`;}
  function moveDate(value,days){const date=new Date(`${value}T00:00:00`);date.setDate(date.getDate()+days);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function slashDate(value){const [,month,day]=value.split('-').map(Number);return `${month}/${day}`;}
  function selectedClass(){return state.classes.find(item=>item.id===state.selectedClassId)||state.classes[0]||null;}
  function isSupportClass(classItem){return classItem?.isSupport??Boolean(classItem?.isOwn&&state.year?.mode==='support');}
  function classSubjects(classItem){return Array.isArray(classItem?.recordSubjects)&&classItem.recordSubjects.length?classItem.recordSubjects:SUBJECTS;}
  function contrastColor(hex){const raw=hex.replace('#','');const value=raw.length===3?raw.split('').map(x=>x+x).join(''):raw;const r=parseInt(value.slice(0,2),16),g=parseInt(value.slice(2,4),16),b=parseInt(value.slice(4,6),16);return (r*299+g*587+b*114)/1000>155?'#17201b':'#ffffff';}
  function validColor(value){return /^#[0-9a-f]{6}$/i.test(String(value||'').trim());}
  function applyClassTheme(classItem){
    const color=classItem?.color||'#397257';
    const text=contrastColor(color);
    document.documentElement.style.setProperty('--class-color',color);
    document.documentElement.style.setProperty('--class-text',text);
    document.querySelector('meta[name="theme-color"]').setAttribute('content',color);
  }
  function showToast(message){toastElement.textContent=message;toastElement.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toastElement.classList.remove('show'),2200);}
  function closeDialog(){if(dialog.open)dialog.close();dialog.innerHTML='';}
  function openDialog(html){dialog.innerHTML=`<div class="dialog-body">${html}</div>`;dialog.showModal();}
  function bytesToBase64(bytes){let binary='';bytes.forEach(byte=>binary+=String.fromCharCode(byte));return btoa(binary);}
  function base64ToBytes(value){return Uint8Array.from(atob(value),char=>char.charCodeAt(0));}
  async function hashSecret(secret,saltBase64,iterations=AUTH_ITERATIONS){
    const encoder=new TextEncoder();
    const key=await crypto.subtle.importKey('raw',encoder.encode(secret),'PBKDF2',false,['deriveBits']);
    const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:base64ToBytes(saltBase64),iterations,hash:'SHA-256'},key,256);
    return bytesToBase64(new Uint8Array(bits));
  }
  async function createVerifier(secret){const salt=crypto.getRandomValues(new Uint8Array(16));const saltBase64=bytesToBase64(salt);return{salt:saltBase64,iterations:AUTH_ITERATIONS,hash:await hashSecret(secret,saltBase64)};}
  async function verifySecret(secret,verifier){if(!verifier)return false;const hash=await hashSecret(secret,verifier.salt,verifier.iterations);let diff=hash.length^verifier.hash.length;for(let i=0;i<Math.min(hash.length,verifier.hash.length);i++)diff|=hash.charCodeAt(i)^verifier.hash.charCodeAt(i);return diff===0;}
  function recoveryCode(){const bytes=crypto.getRandomValues(new Uint8Array(15));const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let value='';bytes.forEach(byte=>value+=chars[byte%chars.length]);return value.match(/.{1,5}/g).join('-');}
  function restorePinAttempts(){try{const saved=JSON.parse(localStorage.getItem(PIN_ATTEMPT_KEY)||'null');if(saved?.yearId===state.year?.id){state.pinFailures=Number(saved.failures)||0;state.pinLockedUntil=Number(saved.lockedUntil)||0;}else localStorage.removeItem(PIN_ATTEMPT_KEY);}catch{localStorage.removeItem(PIN_ATTEMPT_KEY);}}
  function savePinAttempts(){if(!state.pinFailures&&Date.now()>=state.pinLockedUntil){localStorage.removeItem(PIN_ATTEMPT_KEY);return;}localStorage.setItem(PIN_ATTEMPT_KEY,JSON.stringify({yearId:state.year?.id,failures:state.pinFailures,lockedUntil:state.pinLockedUntil}));}

  async function loadState(){
    if(!window.indexedDB)throw new Error('このブラウザでは端末内保存を利用できません。SafariまたはChromeの通常モードで開いてください。');
    if(!window.crypto?.subtle)throw new Error('暗号化機能を利用できません。GitHub PagesのURL（https://）から開いてください。');
    await ClassDB.open();
    state.theme=await ClassDB.getMeta('themePreference',window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light');
    applyTheme();
    const activeYearId=await ClassDB.getMeta('activeYearId');
    state.year=activeYearId?await ClassDB.get('years',activeYearId):null;
    if(!state.year){renderSetup();return;}
    restorePinAttempts();
    state.classes=(await ClassDB.getAllByIndex('classes','yearId',state.year.id)).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));
    state.selectedClassId=await ClassDB.getMeta('selectedClassId',state.classes[0]?.id||null);
    state.lastBackupAt=await ClassDB.getMeta('lastBackupAt',null);state.backupDismissedUntil=await ClassDB.getMeta('backupDismissedUntil',null);
    if(!state.classes.some(item=>item.id===state.selectedClassId))state.selectedClassId=state.classes[0]?.id||null;
    requireTeacher(renderHome);
  }

  function renderSetup(){
    state.route='setup';
    const sy=schoolYear();
    applyClassTheme({color:'#397257'});
    app.innerHTML=`
      <div class="app-shell">
        ${headerHtml('初回設定')}
        <main class="page narrow">
          <div class="setup-steps"><span class="step active"></span><span class="step"></span></div>
          <h1>年度とクラスを設定</h1>
          <p class="muted">最初に自分のクラスを登録します。あとから教師用設定で変更できます。</p>
          <div class="notice"><span>端末を交換した場合は、暗号化バックアップと復旧コードから戻せます。</span><button type="button" class="button" id="setup-restore">バックアップから復旧</button></div>
          <form id="setup-form" class="panel form-grid">
            <div class="field"><label for="setup-year">年度</label><input class="input" id="setup-year" type="number" min="2020" max="2100" value="${sy}" required></div>
            <div class="field"><label for="setup-mode">自分のクラスの種類</label><select class="select" id="setup-mode"><option value="general">一般級</option><option value="support">個別支援級</option></select></div>
            <div class="field"><label for="setup-start">年度開始日</label><input class="input" id="setup-start" type="date" value="${sy}-04-01" required></div>
            <div class="field"><label for="setup-term">前期終了日</label><input class="input" id="setup-term" type="date" value="${sy}-10-10" required></div>
            <div class="field"><label for="setup-end">後期終了日</label><input class="input" id="setup-end" type="date" value="${sy+1}-03-31" required></div>
            <div class="field"><label for="setup-class">自分のクラス名</label><input class="input" id="setup-class" value="5年2組" required></div>
            <div class="field full"><span class="field-label">クラスカラー</span><div class="color-choices" id="setup-colors">${colorButtons('#397257')}</div></div>
            <div class="field"><label for="setup-pin">教師用PIN（6桁）</label><input class="input pin-input" id="setup-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div>
            <div class="field"><label for="setup-pin2">PIN確認</label><input class="input pin-input" id="setup-pin2" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div>
            <div class="field full"><p class="muted small">PINは日常の教師画面用です。暗号化ファイルには、下の年度パスワードを使います。</p></div>
            <div class="field full"><p class="muted small">年度パスワードは、PCログイン時のパスワードと同じように、本人には覚えやすく他人には推測されにくい8文字以上のものを設定してください。</p></div>
            <div class="field"><label for="setup-password">年度パスワード</label><input class="input" id="setup-password" type="password" autocomplete="new-password" minlength="8" required></div>
            <div class="field"><label for="setup-password2">パスワード確認</label><input class="input" id="setup-password2" type="password" autocomplete="new-password" minlength="8" required></div>
            <div class="field full"><label for="setup-hint">パスワードのヒント（氏名などの機密情報は入れない）</label><input class="input" id="setup-hint"></div>
            <div class="field full"><p class="error" id="setup-error" role="alert"></p><div class="button-row end"><button class="button primary" type="submit">復旧コードを作成</button></div></div>
          </form>
        </main>
      </div>`;
    wireColorChoices(document.getElementById('setup-colors'));
    document.getElementById('setup-restore').addEventListener('click',openPasswordRecovery);
    document.getElementById('setup-form').addEventListener('submit',prepareSetup);
  }

  function applyTheme(){document.documentElement.dataset.theme=state.theme;document.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.textContent=state.theme==='dark'?'☀':'☾';button.setAttribute('aria-label',state.theme==='dark'?'ライトモードに切り替え':'ダークモードに切り替え');button.title=button.getAttribute('aria-label');});}
  async function toggleTheme(){state.theme=state.theme==='dark'?'light':'dark';applyTheme();await ClassDB.setMeta('themePreference',state.theme);showToast(state.theme==='dark'?'ダークモードにしました':'ライトモードにしました');}

  function colorButtons(selected){return COLORS.map(color=>`<button type="button" class="color-choice" style="--swatch:${color}" data-color="${color}" aria-label="色を選択" aria-pressed="${color===selected}"></button>`).join('')+`<input class="input color-code" type="text" value="${selected}" aria-label="カラーコード" data-color-code>`;}
  function wireColorChoices(container){
    const code=container.querySelector('[data-color-code]');
    container.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{
      container.querySelectorAll('[data-color]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
      code.value=button.dataset.color;
    }));
    code.addEventListener('input',()=>container.querySelectorAll('[data-color]').forEach(item=>item.setAttribute('aria-pressed','false')));
  }

  async function prepareSetup(event){
    event.preventDefault();
    const error=document.getElementById('setup-error');
    const password=document.getElementById('setup-password').value;
    const password2=document.getElementById('setup-password2').value;
    const pin=document.getElementById('setup-pin').value;
    const pin2=document.getElementById('setup-pin2').value;
    const yearNumber=Number(document.getElementById('setup-year').value);
    const start=document.getElementById('setup-start').value,term=document.getElementById('setup-term').value,end=document.getElementById('setup-end').value;
    if(password!==password2){error.textContent='パスワードが一致しません。';return;}
    if(password.length<8){error.textContent='パスワードは8文字以上にしてください。';return;}
    if(pin!==pin2){error.textContent='教師用PINが一致しません。';return;}
    if(!/^\d{6}$/.test(pin)){error.textContent='教師用PINは数字6桁で設定してください。';return;}
    if(!(start<=term&&term<=end)){error.textContent='年度と学期の日付順を確認してください。';return;}
    error.textContent='';
    const code=recoveryCode();
    state.setupDraft={
      year:{id:ClassDB.uid('year'),label:`${yearNumber}年度`,yearNumber,startDate:start,firstTermEnd:term,endDate:end,mode:document.getElementById('setup-mode').value,passwordHint:document.getElementById('setup-hint').value.trim(),auth:await createVerifier(password),pinAuth:await createVerifier(pin),recoveryAuth:await createVerifier(code),recoverySecretProtected:await protectText(code,password)},
      classItem:{id:ClassDB.uid('class'),name:document.getElementById('setup-class').value.trim(),color:document.querySelector('[data-color-code]').value.trim(),isOwn:true,isSupport:document.getElementById('setup-mode').value==='support',recordSubjects:[...SUBJECTS],order:0},
      code,secret:password
    };
    if(!validColor(state.setupDraft.classItem.color)){error.textContent='カラーコードは #397257 のように入力してください。';state.setupDraft=null;return;}
    renderRecoveryConfirmation();
  }

  function renderRecoveryConfirmation(){
    state.route='setup-recovery';
    const {code}=state.setupDraft;
    app.innerHTML=`
      <div class="app-shell">${headerHtml('復旧コード')}
      <main class="page narrow"><div class="setup-steps"><span class="step active"></span><span class="step active"></span></div>
        <h1>復旧コードを別に保管</h1><p class="muted">年度パスワードを忘れたときに使います。端末やバックアップと別の場所へ保管してください。</p>
        <section class="panel"><p class="field-label">${esc(state.setupDraft.year.label)} 復旧コード</p><p style="font-size:1.35rem;letter-spacing:.08em;font-weight:600;word-break:break-all">${esc(code)}</p>
          <div class="button-row"><button type="button" class="button" id="copy-code">コピー</button><button type="button" class="button" id="save-code">TXT保存</button><button type="button" class="button" id="print-code">印刷</button></div>
        </section>
        <form id="recovery-form" class="panel"><div class="field"><label for="recovery-confirm">保管したコードを再入力</label><input class="input" id="recovery-confirm" autocomplete="off" required></div><p class="error" id="recovery-error" role="alert"></p><div class="button-row end"><button type="button" class="button" id="setup-back">戻る</button><button type="submit" class="button primary">設定を完了</button></div></form>
      </main></div>`;
    document.getElementById('copy-code').addEventListener('click',async()=>{await navigator.clipboard.writeText(code);showToast('復旧コードをコピーしました');});
    document.getElementById('save-code').addEventListener('click',()=>downloadText(`クラス支援_${state.setupDraft.year.label}_復旧コード.txt`,`${state.setupDraft.year.label}\n復旧コード: ${code}\nパスワードヒント: ${state.setupDraft.year.passwordHint||'（なし）'}\n`));
    document.getElementById('print-code').addEventListener('click',()=>window.print());
    document.getElementById('setup-back').addEventListener('click',renderSetup);
    document.getElementById('recovery-form').addEventListener('submit',completeSetup);
  }

  async function completeSetup(event){
    event.preventDefault();
    const input=document.getElementById('recovery-confirm').value.trim().toUpperCase();
    if(input!==state.setupDraft.code){document.getElementById('recovery-error').textContent='復旧コードが一致しません。';return;}
    const year=await ClassDB.put('years',state.setupDraft.year);
    const classItem=await ClassDB.put('classes',{...state.setupDraft.classItem,yearId:year.id});
    await ClassDB.setMeta('activeYearId',year.id);
    await ClassDB.setMeta('selectedClassId',classItem.id);
    await ClassDB.setMeta('lastMode','teacher');
    state.year=year;state.classes=[classItem];state.selectedClassId=classItem.id;state.setupDraft=null;
    unlockTeacher();
    renderHome();
  }

  function downloadText(name,text){const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function downloadCsv(name,text){const blob=new Blob([text],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function runOnce(button,operation){if(!button||button.dataset.busy==='true')return;button.dataset.busy='true';button.disabled=true;button.setAttribute('aria-busy','true');try{return await operation();}finally{button.disabled=false;button.dataset.busy='false';button.removeAttribute('aria-busy');}}

  function unlockTeacher(secret=null){state.teacherUntil=Date.now()+AUTH_MS;if(secret)state.sessionSecret=secret;scheduleLock();}
  function teacherActive(){return Date.now()<state.teacherUntil;}
  function scheduleLock(){clearTimeout(state.lockTimer);const wait=Math.max(0,state.teacherUntil-Date.now());state.lockTimer=setTimeout(()=>{state.sessionSecret=null;if(state.route.startsWith('teacher'))renderPupil();},wait);}
  function touchTeacher(){if(!state.route.startsWith('teacher')||!teacherActive())return;state.teacherUntil=Date.now()+AUTH_MS;scheduleLock();}
  document.addEventListener('pointerdown',touchTeacher,{passive:true});
  document.addEventListener('keydown',touchTeacher);

  async function requireTeacher(onSuccess){
    if(teacherActive()){onSuccess();return;}
    if(!state.year.pinAuth){openPinMigration(onSuccess);return;}
    openPinAuthentication(onSuccess);
  }

  function openPinAuthentication(onSuccess){
    const waitSeconds=Math.max(0,Math.ceil((state.pinLockedUntil-Date.now())/1000));
    openDialog(`<h2>教師用画面を開く</h2><p class="muted">6桁の教師用PINを入力してください。</p><form id="pin-auth-form"><div class="field"><label for="auth-pin">教師用PIN</label><input class="input pin-input" id="auth-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" autofocus required></div><p class="error" id="auth-error" role="alert">${waitSeconds?`入力を${waitSeconds}秒待ってください。`:''}</p><div class="button-row"><button type="button" class="button ghost" id="auth-annual">PINを忘れた場合</button></div><div class="dialog-actions"><button type="button" class="button" id="auth-cancel">キャンセル</button><button type="submit" class="button primary" id="pin-auth-submit" ${waitSeconds?'disabled':''}>認証</button></div></form>`);
    document.getElementById('auth-cancel').addEventListener('click',closeDialog);
    document.getElementById('auth-annual').addEventListener('click',()=>openAnnualTeacherAuth(onSuccess));
    if(waitSeconds)setTimeout(()=>{if(document.getElementById('pin-auth-form')){closeDialog();openPinAuthentication(onSuccess);}},waitSeconds*1000);
    document.getElementById('pin-auth-form').addEventListener('submit',async event=>{
      event.preventDefault();
      const error=document.getElementById('auth-error');
      if(Date.now()<state.pinLockedUntil){error.textContent=`入力を${Math.ceil((state.pinLockedUntil-Date.now())/1000)}秒待ってください。`;return;}
      const pin=document.getElementById('auth-pin').value;
      if(!/^\d{6}$/.test(pin)){error.textContent='数字6桁で入力してください。';return;}
      if(!await verifySecret(pin,state.year.pinAuth)){
        state.pinFailures+=1;
        if(state.pinFailures>=PIN_MAX_FAILURES){state.pinFailures=0;state.pinLockedUntil=Date.now()+PIN_LOCK_MS;savePinAttempts();closeDialog();openPinAuthentication(onSuccess);return;}
        savePinAttempts();
        error.textContent=`PINが違います。あと${PIN_MAX_FAILURES-state.pinFailures}回で30秒間ロックします。`;
        document.getElementById('auth-pin').select();return;
      }
      state.pinFailures=0;state.pinLockedUntil=0;savePinAttempts();closeDialog();unlockTeacher();onSuccess();
    });
  }

  function openAnnualTeacherAuth(onSuccess){
    openDialog(`<h2>年度パスワードで認証</h2><p class="muted">PINを忘れた場合の認証です。認証後は教師用PINを変更できます。</p>${state.year?.passwordHint?`<p class="panel small">ヒント：${esc(state.year.passwordHint)}</p>`:''}<form id="annual-auth-form"><div class="field"><label for="auth-password">年度パスワード</label><input class="input" id="auth-password" type="password" autocomplete="current-password" autofocus required></div><p class="error" id="auth-error" role="alert"></p><div class="button-row"><button type="button" class="button ghost" id="auth-recovery">年度パスワードも忘れた場合</button></div><div class="dialog-actions"><button type="button" class="button" id="auth-cancel">キャンセル</button><button type="submit" class="button primary">認証</button></div></form>`);
    document.getElementById('auth-cancel').addEventListener('click',closeDialog);
    document.getElementById('auth-recovery').addEventListener('click',openPasswordRecovery);
    document.getElementById('annual-auth-form').addEventListener('submit',async event=>{
      event.preventDefault();const password=document.getElementById('auth-password').value;
      if(!await verifySecret(password,state.year.auth)){document.getElementById('auth-error').textContent='年度パスワードが違います。';return;}
      state.pinFailures=0;state.pinLockedUntil=0;savePinAttempts();closeDialog();unlockTeacher(password);onSuccess();
    });
  }

  function openPinMigration(onSuccess){
    openDialog(`<h2>教師用PINを設定</h2><p class="muted">従来データを安全に引き継ぐため、年度パスワードで一度確認し、日常用の6桁PINを設定します。</p><form id="pin-migration-form"><div class="field"><label for="migration-password">現在の年度パスワード</label><input class="input" id="migration-password" type="password" autocomplete="current-password" required autofocus></div><div class="form-grid section"><div class="field"><label for="migration-pin">新しい教師用PIN</label><input class="input pin-input" id="migration-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></div><div class="field"><label for="migration-pin2">PIN確認</label><input class="input pin-input" id="migration-pin2" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></div></div><p class="error" id="pin-migration-error"></p><div class="dialog-actions"><button type="button" class="button" id="pin-migration-cancel">キャンセル</button><button type="submit" class="button primary">PINを設定して開く</button></div></form>`);
    document.getElementById('pin-migration-cancel').addEventListener('click',closeDialog);
    document.getElementById('pin-migration-form').addEventListener('submit',async event=>{
      event.preventDefault();const error=document.getElementById('pin-migration-error'),password=document.getElementById('migration-password').value,pin=document.getElementById('migration-pin').value,pin2=document.getElementById('migration-pin2').value;
      if(!await verifySecret(password,state.year.auth)){error.textContent='年度パスワードが違います。';return;}
      if(pin!==pin2){error.textContent='PINが一致しません。';return;}
      if(!/^\d{6}$/.test(pin)){error.textContent='PINは数字6桁で設定してください。';return;}
      state.year=await ClassDB.put('years',{...state.year,pinAuth:await createVerifier(pin)});closeDialog();unlockTeacher(password);showToast('教師用PINを設定しました');onSuccess();
    });
  }

  function requestAnnualPassword(){
    if(state.sessionSecret)return Promise.resolve(true);
    return new Promise(resolve=>{
      let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener('cancel',onDialogCancel);resolve(value);};const onDialogCancel=()=>finish(false);
      openDialog(`<h2>年度パスワードを入力</h2><p class="muted">暗号化・復号を行うときだけ必要です。PCログイン時のパスワードのように、本人には覚えやすく他人には推測されにくいものを入力してください。</p>${state.year?.passwordHint?`<p class="panel small">ヒント：${esc(state.year.passwordHint)}</p>`:''}<form id="crypto-auth-form"><div class="field"><label for="crypto-password">年度パスワード</label><input class="input" id="crypto-password" type="password" autocomplete="current-password" autofocus required></div><p class="error" id="crypto-auth-error"></p><div class="dialog-actions"><button type="button" class="button" id="crypto-auth-cancel">キャンセル</button><button type="submit" class="button primary">続ける</button></div></form>`);
      dialog.addEventListener('cancel',onDialogCancel,{once:true});
      document.getElementById('crypto-auth-cancel').addEventListener('click',()=>{closeDialog();finish(false);});
      document.getElementById('crypto-auth-form').addEventListener('submit',async event=>{event.preventDefault();const password=document.getElementById('crypto-password').value;if(!await verifySecret(password,state.year.auth)){document.getElementById('crypto-auth-error').textContent='年度パスワードが違います。';return;}state.sessionSecret=password;closeDialog();finish(true);});
    });
  }

  function openPasswordRecovery(){
    openDialog(`<h2>復旧コードで開く</h2><p class="muted">暗号化バックアップと、別に保管した復旧コードを使います。開いた後、新しい年度パスワードを設定します。</p>${state.year?.passwordHint?`<p class="panel small">パスワードのヒント：${esc(state.year.passwordHint)}</p>`:''}<form id="password-recovery-form"><div class="field"><label for="recovery-backup-file">暗号化バックアップ</label><input class="input" id="recovery-backup-file" type="file" accept=".json,application/json" required></div><div class="field section"><label for="recovery-code-input">復旧コード</label><input class="input" id="recovery-code-input" autocomplete="off" required></div><div class="form-grid section"><div class="field"><label for="recovery-new-password">新しい年度パスワード</label><input class="input" id="recovery-new-password" type="password" minlength="8" required></div><div class="field"><label for="recovery-new-password2">新しいパスワードの確認</label><input class="input" id="recovery-new-password2" type="password" minlength="8" required></div></div><p class="error" id="password-recovery-error"></p><div class="dialog-actions"><button type="button" class="button" id="password-recovery-cancel">キャンセル</button><button type="submit" class="button primary">復旧してパスワードを変更</button></div></form>`);
    document.getElementById('password-recovery-cancel').addEventListener('click',closeDialog);document.getElementById('password-recovery-form').addEventListener('submit',recoverPasswordFromBackup);
  }

  async function recoverPasswordFromBackup(event){event.preventDefault();const error=document.getElementById('password-recovery-error'),file=document.getElementById('recovery-backup-file').files[0],code=document.getElementById('recovery-code-input').value.trim().toUpperCase(),password=document.getElementById('recovery-new-password').value,password2=document.getElementById('recovery-new-password2').value;if(password!==password2){error.textContent='新しいパスワードが一致しません。';return;}if(password.length<8){error.textContent='新しいパスワードは8文字以上にしてください。';return;}error.textContent='復旧処理中です…';try{const envelope=JSON.parse(await file.text()),payload=await decryptEnvelope(envelope,code,'recovery');const payloadYear=(payload.data?.years||[]).find(item=>item.id===payload.yearId)||(payload.data?.years||[])[0];if(!payloadYear)throw new Error('年度データが見つかりません');if(payloadYear.recoveryAuth&&!await verifySecret(code,payloadYear.recoveryAuth))throw new Error('復旧コードが一致しません');for(const store of ['years','classes','students','enrollments','records','trash'])if(payload.data?.[store]?.length)await ClassDB.putManyRaw(store,payload.data[store]);for(const item of payload.data?.meta||[])await ClassDB.putRaw('meta',item);const updatedYear=await ClassDB.put('years',{...payloadYear,auth:await createVerifier(password),recoverySecretProtected:await protectText(code,password)});await ClassDB.setMeta('activeYearId',updatedYear.id);const classes=(await ClassDB.getAllByIndex('classes','yearId',updatedYear.id)).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));state.year=updatedYear;state.classes=classes;state.selectedClassId=classes[0]?.id||null;if(state.selectedClassId)await ClassDB.setMeta('selectedClassId',state.selectedClassId);unlockTeacher(password);closeDialog();showToast('復旧し、新しい年度パスワードを設定しました');renderHome();}catch(problem){error.textContent=problem.message||'復旧できませんでした';}}

  async function renderHome(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-home';
    await ClassDB.setMeta('lastMode','teacher');
    const classItem=selectedClass();
    applyClassTheme(classItem);
    const counts=await attentionCounts(classItem?.id);
    const own=classItem?.isOwn;
    const support=isSupportClass(classItem);
    const dashboard=await dashboardHtml(counts);
    app.innerHTML=`<div class="app-shell">
      ${headerHtml('教師用ホーム',`<button type="button" class="header-button" id="sync-placeholder">同期</button><button type="button" class="header-button" id="settings">設定</button><button type="button" class="header-button header-icon" id="help" aria-label="使い方・FAQ">?</button>`)}
      <main class="page">
        ${rolloverNoticeHtml()}
        ${backupNoticeHtml()}
        <h1>${esc(classItem?.name||'クラス未設定')}</h1><p class="muted">${own?'自分のクラス':'担当クラス'}・${support?'個別支援級':'一般級'}</p>
        <nav class="class-tabs" aria-label="クラス選択">${state.classes.map(item=>`<button type="button" class="class-tab" data-class-id="${item.id}" aria-pressed="${item.id===state.selectedClassId}"><span class="class-tab-dot" style="--tab-color:${esc(item.color||'#397257')}"></span>${esc(item.name)}</button>`).join('')}</nav><p class="home-hint"><span class="count-badge-sample">1</span> 赤い数字は、対応が必要な児童数です。クラス色が現在選択中のクラスを示します。</p>
        ${dashboard}
        <section class="tools-main">
          ${support?toolHtml('memo','✎','児童メモ',counts.memo,true):toolHtml('daily','✓','毎日の宿題',counts.daily,true)}
          ${support?toolHtml('daily','✓','毎日の宿題',counts.daily):toolHtml('weekly','▣','週宿題',counts.weekly)}
          ${support?toolHtml('weekly','▣','週宿題',counts.weekly):toolHtml('certificate','☆','ミニ賞状',0)}
          ${support?toolHtml('certificate','☆','ミニ賞状',0):toolHtml('memo','✎','児童メモ',counts.memo)}
          ${toolHtml('assessment','A','ノート評価',0)}
        </section>
        <section class="tools-sub">
          ${toolHtml('occasional','▤','不定期提出物',counts.occasional)}
          ${own?toolHtml('seating','▦','席替え',0):''}
          ${own?toolHtml('reports','文','所見素材',0):''}
          ${support?toolHtml('support','◇','単元設定',counts.support):''}
        </section>
        <div class="home-footer"><button type="button" class="button" id="pupil-mode">児童用の提出画面</button></div>
      </main></div>`;
    wireHeader();
    document.querySelectorAll('[data-class-id]').forEach(button=>button.addEventListener('click',async()=>{state.selectedClassId=button.dataset.classId;state.rosterDraft=[];state.rosterLoadedForClassId=null;await ClassDB.setMeta('selectedClassId',state.selectedClassId);renderHome();}));
    document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>openTool(button.dataset.tool)));
    document.getElementById('pupil-mode').addEventListener('click',()=>renderPupil('daily'));
    document.getElementById('settings').addEventListener('click',()=>{state.settingsTab='year';state.classSettingsView='list';renderSettings();});
    document.getElementById('help').addEventListener('click',renderHelp);
    document.getElementById('sync-placeholder').addEventListener('click',renderDataExchange);
    document.getElementById('start-rollover')?.addEventListener('click',renderYearRollover);
    document.getElementById('backup-from-home')?.addEventListener('click',renderDataExchange);document.getElementById('backup-later')?.addEventListener('click',async()=>{const until=new Date(Date.now()+7*86400000).toISOString();state.backupDismissedUntil=until;await ClassDB.setMeta('backupDismissedUntil',until);renderHome();});
    if(!state.migrationPromptShown&&!await ClassDB.getMeta('lastLegacyMigration',null)){const legacy=LegacyMigration.fromStorage();if(legacy.length){state.migrationPromptShown=true;openDialog(`<h2>旧ツールのデータが見つかりました</h2><p>${legacy.length}件のデータ群があります。内容と移行先を確認してから一括移行できます。</p><div class="dialog-actions"><button type="button" class="button" id="legacy-prompt-later">後で</button><button type="button" class="button primary" id="legacy-prompt-review">内容を確認</button></div>`);document.getElementById('legacy-prompt-later').addEventListener('click',closeDialog);document.getElementById('legacy-prompt-review').addEventListener('click',()=>{closeDialog();openLegacyMigrationReview(legacy);});}}
  }

  function connectionStatusHtml(){return`<span class="connection-chip ${navigator.onLine?'online':'offline'}" id="connection-chip"><span></span>${navigator.onLine?'オンライン':'オフライン・端末保存'}</span>`;}
  function headerHtml(subtitle,actions=''){return `<header class="app-header"><div><div class="app-title">クラス支援ツール</div><div class="app-subtitle">${esc(state.year?.label||'')}　${esc(subtitle)}</div>${connectionStatusHtml()}</div><div class="header-actions">${actions}<button type="button" class="header-button header-icon theme-toggle" data-theme-toggle aria-label="${state.theme==='dark'?'ライトモードに切り替え':'ダークモードに切り替え'}" title="${state.theme==='dark'?'ライトモードに切り替え':'ダークモードに切り替え'}">${state.theme==='dark'?'☀':'☾'}</button></div></header>`;}
  function updateConnectionStatus(){const chip=document.getElementById('connection-chip');if(!chip)return;chip.className=`connection-chip ${navigator.onLine?'online':'offline'}`;chip.innerHTML=`<span></span>${navigator.onLine?'オンライン':'オフライン・端末保存'}`;}
  function wireHeader(){}
  function toolHtml(id,icon,name,count=0,daily=false){return `<button type="button" class="tool${daily?' daily':''}" data-tool="${id}" title="${esc(name)}を開く">${count?`<span class="count-badge">${count}</span>`:''}<span class="tool-icon" aria-hidden="true">${icon}</span><span>${name}</span></button>`;}
  async function dashboardHtml(counts){const history=await ClassDB.getMeta('syncHistory',[]),last=history[0],lastLabel=last?`${last.kindLabel||last.kind}・${new Date(last.at).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`:'まだありません';const items=[['daily','毎日の宿題',counts.daily],['weekly','週宿題',counts.weekly],['occasional','不定期提出物',counts.occasional],['memo','児童メモ',counts.memo]].filter(item=>item[2]>0);return`<section class="dashboard panel"><div class="dashboard-heading"><div><h2>今日の確認</h2><p class="muted">対応が必要なものをまとめています。</p></div><div class="dashboard-sync"><span class="sync-dot ${last?'synced':''}"></span><span>最終同期：${esc(lastLabel)}</span></div></div><div class="dashboard-cards">${items.length?items.map(([id,label,count])=>`<button type="button" class="dashboard-card" data-tool="${id}"><strong>${count}</strong><span>${label}</span></button>`).join(''):'<div class="dashboard-empty">現在、対応が必要な項目はありません。</div>'}</div></section>`;}
  function backupNoticeHtml(){const last=state.lastBackupAt?new Date(state.lastBackupAt).getTime():0;const dismissed=state.backupDismissedUntil?new Date(state.backupDismissedUntil).getTime():0;const due=!last||Date.now()-last>=30*86400000;if(!due||Date.now()<dismissed)return'';return`<div class="notice"><div><strong>暗号化バックアップの時期です</strong><div class="row-meta">${last?'前回から1か月以上経過しています。':'最初のバックアップを保存してください。'}</div></div><div class="button-row"><button type="button" class="button" id="backup-later">後で</button><button type="button" class="button primary" id="backup-from-home">バックアップ</button></div></div>`;}
  function rolloverNoticeHtml(){if(!rolloverDue())return'';return`<div class="notice rollover-notice"><div><strong>${schoolYear()}年度への切り替えが必要です</strong><div class="row-meta">現在は${esc(state.year.label)}のままです。案内は切り替えるまで表示されます。</div></div><button type="button" class="button primary" id="start-rollover">新年度へ切り替える</button></div>`;}

  async function openTool(tool){
    const routes={daily:renderTeacherDaily,weekly:renderWeekly,certificate:renderCertificates,memo:renderMemos,assessment:renderNotebook,occasional:renderOccasional,support:renderSupport,reports:renderReports,seating:renderSeating};
    if(rolloverDue()&&!state.rolloverContinue&&['daily','weekly','certificate','memo','assessment','occasional','support'].includes(tool)){confirmOldYearContinuation(()=>openTool(tool));return;}
    if(['daily','weekly','certificate','memo','assessment','occasional','support','reports','seating'].includes(tool)&&!(await rosterForClass(selectedClass()?.id)).length){state.settingsTab='classes';state.classSettingsView='roster';state.rosterDraft=[];state.rosterLoadedForClassId=null;await renderSettings();showToast('先に名簿を登録してください');return;}
    if(routes[tool])routes[tool]();else showToast('この機能は次の実装段階で追加します');
  }

  function confirmOldYearContinuation(onContinue){
    openDialog(`<h2>年度を確認してください</h2><p>現在は${esc(state.year.label)}です。${schoolYear()}年度へ切り替えずに記録を続けますか。</p><p class="muted">「一時継続」は、このアプリを閉じるまで有効です。ホームの切替案内は残ります。</p><div class="dialog-actions"><button type="button" class="button" id="rollover-temporary">一時継続</button><button type="button" class="button primary" id="rollover-now">新年度へ切り替える</button></div>`);
    document.getElementById('rollover-temporary').addEventListener('click',()=>{state.rolloverContinue=true;closeDialog();onContinue();});
    document.getElementById('rollover-now').addEventListener('click',()=>{closeDialog();renderYearRollover();});
  }

  function teacherToolShell(title,body,actions=''){
    return `<div class="app-shell">${headerHtml(title,`<button type="button" class="header-button" id="tool-home">ホーム</button><button type="button" class="header-button" id="tool-settings">設定</button><button type="button" class="header-button header-icon" id="tool-help" aria-label="使い方・FAQ">?</button>${actions}`)}<main class="page">${body}</main></div>`;
  }

  function wireToolHome(){document.getElementById('tool-home')?.addEventListener('click',renderHome);document.getElementById('tool-settings')?.addEventListener('click',()=>{state.settingsTab='year';state.classSettingsView='list';renderSettings();});document.getElementById('tool-help')?.addEventListener('click',renderHelp);}

  async function teacherRosterCards(classId,records=[],options={}){
    const orderMode=options.orderMode||'seat';const roster=await rosterForClass(classId,orderMode==='seat');
    const byStudent=new Map(records.map(item=>[item.studentId,item]));
    const allRecords=await ClassDB.getAllByIndex('records','classId',classId);
    const lastMemo=new Map();
    allRecords.filter(item=>item.type==='memo'&&!item.deletedAt).forEach(item=>{if(!lastMemo.has(item.studentId)||lastMemo.get(item.studentId)<item.date)lastMemo.set(item.studentId,item.date);});
    const card=row=>{
      const record=byStudent.get(row.student.id);
      const status=options.status?.(record,row)||'';
      const statusClass=options.statusClass?.(record,row)||'';
      const extra=options.extra?.(record,row)||'';
      return `<article class="teacher-student-card ${esc(statusClass)}"><button type="button" class="student-main" data-tool-student="${row.student.id}"><strong>${esc(row.student.name)}</strong>${status?`<span>${esc(status)}</span>`:''}${extra}</button><div class="student-card-footer"><span>${lastMemo.get(row.student.id)?`メモ ${esc(jpDate(lastMemo.get(row.student.id)))}`:'メモなし'}</span><button type="button" class="detail-button" data-student-detail="${row.student.id}" aria-label="${esc(row.student.name)}の詳細">詳細</button></div></article>`;
    };
    const classItem=state.classes.find(item=>item.id===classId);const useShape=options.preserveSeatShape&&orderMode==='seat'&&classItem?.activeSeatLayout?.length;let body='';let style='';
    if(useShape){const byId=new Map(roster.map(row=>[row.student.id,row]));body=classItem.activeSeatLayout.map(id=>id&&byId.has(id)?card(byId.get(id)):'<div class="teacher-student-card grid-empty"><span>空席</span></div>').join('');style=` style="--active-seat-cols:${classItem.activeSeatCols||6}"`;}
    else body=roster.map(card).join('');
    return `<section class="teacher-student-grid ${useShape?'seat-shaped':''}"${style}>${body}</section>`;
  }

  function teacherOrderMode(){return state.toolDraft.teacherOrderMode||'seat';}
  function teacherOrderControlHtml(){const mode=teacherOrderMode();return `<div class="order-toggle" aria-label="表示順"><button type="button" data-teacher-order="seat" aria-pressed="${mode==='seat'}">座席順</button><button type="button" data-teacher-order="number" aria-pressed="${mode==='number'}">出席番号順</button></div>`;}
  function wireTeacherOrder(render){document.querySelectorAll('[data-teacher-order]').forEach(button=>button.addEventListener('click',()=>{state.toolDraft.teacherOrderMode=button.dataset.teacherOrder;render();}));}

  function wireStudentDetails(){document.querySelectorAll('[data-student-detail]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();renderStudentOverview(button.dataset.studentDetail);}));}

  async function memoShortages(classItem){
    if(!isSupportClass(classItem))return[];const roster=await rosterForClass(classItem.id);const subjects=classSubjects(classItem);const termStart=today()<=state.year.firstTermEnd?state.year.startDate:moveDate(state.year.firstTermEnd,1);const termEnd=today()<=state.year.firstTermEnd?state.year.firstTermEnd:state.year.endDate;
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='memo'&&item.date>=termStart&&item.date<=termEnd&&!item.deletedAt);
    return roster.map(row=>({student:row.student,subjects:subjects.filter(subject=>!records.some(record=>record.studentId===row.student.id&&record.subject===subject))})).filter(item=>item.subjects.length);
  }

  async function attentionCounts(classId){
    if(!classId)return{daily:0,weekly:0,occasional:0,memo:0,support:0};
    const records=await ClassDB.getAllByIndex('records','classId',classId);
    const priorForgotten=new Set(records.filter(record=>record.type==='dailyHomework'&&record.date<today()&&record.status==='forgotten'&&!record.resolvedAt&&!record.deletedAt).map(record=>record.studentId));
    const roster=await rosterForClass(classId);
    const activeStudentIds=roster.map(row=>row.student.id);
    const weeklyOccurrences=records.filter(item=>item.type==='weeklyOccurrence'&&item.dueDate<today()&&!item.deletedAt);
    const weeklySubmissions=new Set(records.filter(item=>item.type==='weeklySubmission'&&item.status==='submitted'&&!item.deletedAt).map(item=>`${item.occurrenceId}|${item.studentId}`));
    const weeklyAffected=activeStudentIds.filter(studentId=>weeklyOccurrences.some(item=>!weeklySubmissions.has(`${item.id}|${studentId}`))).length;
    const occasionalItems=records.filter(item=>item.type==='occasionalItem'&&!item.archived&&!item.deletedAt);
    const occasionalSubmissions=new Set(records.filter(item=>item.type==='occasionalSubmission'&&item.status==='submitted'&&!item.deletedAt).map(item=>`${item.itemId}|${item.studentId}`));
    const occasionalAffected=activeStudentIds.filter(studentId=>occasionalItems.some(item=>!occasionalSubmissions.has(`${item.id}|${studentId}`))).length;
    const classItem=state.classes.find(item=>item.id===classId);const memoAffected=(await memoShortages(classItem)).length;
    return{daily:priorForgotten.size,weekly:weeklyAffected,occasional:occasionalAffected,memo:memoAffected,support:0};
  }

  async function renderTeacherDaily(){
    if(!teacherActive()){renderPupil();return;}state.route='teacher-daily';state.activeTool='daily';
    const classItem=selectedClass();applyClassTheme(classItem);const date=state.toolDraft.teacherDailyDate||today();state.toolDraft.teacherDailyDate=date;
    const roster=await rosterForClass(classItem.id);const records=await dailyRecords(classItem.id,date);const classRecords=await ClassDB.getAllByIndex('records','classId',classItem.id);const priorForgotten=new Set(classRecords.filter(item=>item.type==='dailyHomework'&&item.date<date&&item.status==='forgotten'&&!item.resolvedAt&&!item.deletedAt).map(item=>item.studentId));
    const totals={submitted:0,forgotten:0,unconfirmed:0};const map=new Map(records.map(record=>[record.studentId,record]));roster.forEach(row=>{const status=map.get(row.student.id)?.status||'unconfirmed';totals[status]=(totals[status]||0)+1;});
    const labels={unconfirmed:'未確認',submitted:'提出',forgotten:'忘れた'};const cards=await teacherRosterCards(classItem.id,records,{orderMode:teacherOrderMode(),preserveSeatShape:true,status:(record,row)=>`${labels[record?.status||'unconfirmed']}${priorForgotten.has(row.student.id)?'・前回忘れあり':''}`,statusClass:(record,row)=>record?.status==='forgotten'||priorForgotten.has(row.student.id)?'alert':record?.status==='submitted'?'good':''});
    app.innerHTML=teacherToolShell('毎日の宿題',`${pupilDateNav(date,'teacher-daily-prev','teacher-daily-next')}<div class="toolbar-line"><div class="summary-row"><span>提出 <strong>${totals.submitted}</strong></span><span>忘れた <strong>${totals.forgotten}</strong></span><span>未確認 <strong>${totals.unconfirmed}</strong></span></div>${teacherOrderControlHtml()}</div>${cards}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderTeacherDaily);document.getElementById('teacher-daily-prev').addEventListener('click',()=>{state.toolDraft.teacherDailyDate=moveDate(date,-1);renderTeacherDaily();});document.getElementById('teacher-daily-next').addEventListener('click',()=>{state.toolDraft.teacherDailyDate=moveDate(date,1);renderTeacherDaily();});document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>handleDailyTap(button.dataset.toolStudent,date,'teacher')));
  }

  function renderDailyContext(mode){if(mode==='teacher')renderTeacherDaily();else renderPupil('daily');}

  async function renderPupil(tool=state.pupilTool||'daily'){
    if(typeof tool!=='string')tool=state.pupilTool||'daily';
    state.route='pupil';state.pupilTool=tool;state.teacherUntil=0;state.sessionSecret=null;clearTimeout(state.lockTimer);await ClassDB.setMeta('lastMode','pupil');
    const classItem=selectedClass();applyClassTheme(classItem);
    const nav=`<nav class="pupil-nav" aria-label="提出画面"><button type="button" data-pupil-tool="daily" aria-selected="${tool==='daily'}">毎日の宿題</button><button type="button" data-pupil-tool="weekly" aria-selected="${tool==='weekly'}">週宿題</button><button type="button" data-pupil-tool="occasional" aria-selected="${tool==='occasional'}">不定期提出物</button></nav>`;
    app.innerHTML=`<div class="app-shell">${headerHtml(`${esc(classItem?.name||'')}　児童用提出画面`,`<button type="button" class="header-button header-icon" id="teacher-entry" aria-label="教師用設定">⚙</button>`)}<main class="page">${nav}<div id="pupil-content"></div></main></div>`;
    document.getElementById('teacher-entry').addEventListener('click',()=>requireTeacher(renderHome));
    document.querySelectorAll('[data-pupil-tool]').forEach(button=>button.addEventListener('click',()=>renderPupil(button.dataset.pupilTool)));
    if(tool==='daily')await renderPupilDaily();
    if(tool==='weekly')await renderPupilWeekly();
    if(tool==='occasional')await renderPupilOccasional();
  }

  function pupilDateNav(value,previousId,nextId,title=''){return `<div class="pupil-date-row"><button type="button" id="${previousId}" aria-label="前へ">◀</button><div><strong>${esc(shortJpDate(value))}</strong>${title?`<span>${esc(title)}</span>`:''}</div><button type="button" id="${nextId}" aria-label="次へ">▶</button></div>`;}

  async function renderPupilDaily(){
    const classItem=selectedClass();const date=today();state.pupilDate=date;
    const roster=await rosterForClass(classItem?.id,true);const records=await dailyRecords(classItem?.id,date);const map=new Map(records.map(record=>[record.studentId,record]));
    const classRecords=await ClassDB.getAllByIndex('records','classId',classItem.id);const priorForgotten=new Set(classRecords.filter(item=>item.type==='dailyHomework'&&item.date<date&&item.status==='forgotten'&&!item.resolvedAt&&!item.deletedAt).map(item=>item.studentId));
    const totals={submitted:0,forgotten:0,unconfirmed:0};roster.forEach(row=>{const status=map.get(row.student.id)?.status||'unconfirmed';totals[status]=(totals[status]||0)+1;});
    document.getElementById('pupil-content').innerHTML=`<div class="pupil-current-date">${esc(shortJpDate(date))}</div><div class="summary-row"><span>提出 <strong>${totals.submitted}</strong></span><span>忘れた <strong>${totals.forgotten}</strong></span><span>未確認 <strong>${totals.unconfirmed}</strong></span></div>${roster.length?pupilStudentGrid(classItem,roster,map,'daily',priorForgotten):`<section class="panel"><h2>名簿が未登録です</h2><p class="muted">右上の歯車から教師認証し、名簿を登録してください。</p></section>`}`;
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handleDailyTap(button.dataset.studentId,date,'pupil')));
  }

  async function renderPupilWeekly(){
    const classItem=selectedClass();const roster=await rosterForClass(classItem.id,true);const data=await weeklyData(classItem.id);const occurrences=data.occurrences;
    if(!occurrences.length){document.getElementById('pupil-content').innerHTML='<section class="panel"><h2>週宿題はありません</h2><p class="muted">先生が登録すると、ここに表示されます。</p></section>';return;}
    const occurrence=occurrences[0];state.pupilWeeklyId=occurrence.id;const records=data.submissions.filter(item=>item.occurrenceId===occurrence.id);const map=new Map(records.map(item=>[item.studentId,item]));
    document.getElementById('pupil-content').innerHTML=`<div class="pupil-current-date">${esc(shortJpDate(occurrence.dueDate))}<span>${esc(occurrence.title)}</span></div><div class="summary-row"><span>名前を押すたびに「提出 → 忘れた → 未提出」と変わります。</span></div>${pupilStudentGrid(classItem,roster,map,'weekly')}`;
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handlePupilWeeklyTap(button.dataset.studentId,occurrence)));
  }

  async function handlePupilWeeklyTap(studentId,occurrence){
    if(rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handlePupilWeeklyTap(studentId,occurrence)));return;}
    const id=`weekly_${occurrence.id}_${studentId}`;const current=await ClassDB.get('records',id);const next=current?.status==='submitted'?'forgotten':current?.status==='forgotten'?'unsubmitted':'submitted';
    await ClassDB.put('records',{...(current||{}),id,type:'weeklySubmission',classId:selectedClass().id,studentId,date:occurrence.dueDate,dueDate:occurrence.dueDate,title:occurrence.title,occurrenceId:occurrence.id,status:next});renderPupil('weekly');
  }

  async function renderPupilOccasional(){
    const classItem=selectedClass();const roster=await rosterForClass(classItem.id,true);const data=await occasionalData(classItem.id);const items=data.items.filter(item=>!item.archived);
    if(!items.length){document.getElementById('pupil-content').innerHTML='<section class="panel"><h2>不定期提出物はありません</h2><p class="muted">先生が登録すると、ここに表示されます。</p></section>';return;}
    const item=items[0];state.pupilOccasionalId=item.id;const records=data.submissions.filter(row=>row.itemId===item.id);const map=new Map(records.map(record=>[record.studentId,record]));
    document.getElementById('pupil-content').innerHTML=`<div class="pupil-current-date">${esc(shortJpDate(item.dueDate))}<span>${esc(item.title)}</span></div><div class="summary-row"><span>名前を押すと、提出済みと未提出が切り替わります。</span></div>${pupilStudentGrid(classItem,roster,map,'occasional')}`;
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handlePupilOccasionalTap(button.dataset.studentId,item)));
  }

  async function handlePupilOccasionalTap(studentId,item){
    if(rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handlePupilOccasionalTap(studentId,item)));return;}
    const id=`occasional_${item.id}_${studentId}`;const current=await ClassDB.get('records',id);const next=current?.status==='submitted'?'unsubmitted':'submitted';
    await ClassDB.put('records',{...(current||{}),id,type:'occasionalSubmission',classId:selectedClass().id,studentId,date:today(),dueDate:item.dueDate,title:item.title,itemId:item.id,status:next});renderPupil('occasional');
  }

  function studentCard(row,record,kind='daily',priorForgotten=false){
    const defaults={daily:'unconfirmed',weekly:'unsubmitted',occasional:'unsubmitted'};const status=record?.status||defaults[kind];
    const labels={unconfirmed:'未確認',submitted:'提出',forgotten:'忘れた',unsubmitted:'未提出'};
    return `<button type="button" class="student-card ${status}${priorForgotten?' has-prior-forgotten':''}" data-student-id="${row.student.id}"><strong>${esc(row.student.name)}</strong><span class="state ${status}">${labels[status]||status}</span>${priorForgotten?'<span class="prior-flag">前回忘れあり</span>':''}</button>`;
  }
  function pupilStudentGrid(classItem,roster,records,kind,priorForgotten=new Set()){
    const byId=new Map(roster.map(row=>[row.student.id,row]));const shape=classItem?.activeSeatLayout;const useShape=Array.isArray(shape)&&shape.length>0;const body=useShape?shape.map(id=>id&&byId.has(id)?studentCard(byId.get(id),records.get(id),kind,priorForgotten.has(id)):'<div class="student-card grid-empty"><span>空席</span></div>').join(''):roster.map(row=>studentCard(row,records.get(row.student.id),kind,priorForgotten.has(row.student.id))).join('');const style=useShape?` style="--active-seat-cols:${classItem.activeSeatCols||6}"`:'';return`<section class="student-grid ${useShape?'seat-shaped':''}"${style}>${body}</section>`;
  }
  async function rosterForClass(classId,useSeatOrder=false){
    if(!classId)return[];
    const classItem=state.classes.find(item=>item.id===classId);const order=useSeatOrder?(classItem?.dailyStudentOrder||[]):[];
    const enrollments=(await ClassDB.getAllByIndex('enrollments','classId',classId)).filter(item=>!item.endDate).sort((a,b)=>{const ai=order.indexOf(a.studentId),bi=order.indexOf(b.studentId);if(ai>=0||bi>=0)return(ai<0?999:ai)-(bi<0?999:bi);return(a.number||999)-(b.number||999);});
    const result=[];
    for(const enrollment of enrollments){const student=await ClassDB.get('students',enrollment.studentId);if(student)result.push({enrollment,student});}
    return result;
  }
  async function dailyRecords(classId,date){const records=await ClassDB.getAllByIndex('records','classId',classId);return records.filter(item=>item.type==='dailyHomework'&&item.date===date&&!item.deletedAt);}
  async function handleDailyTap(studentId,date=state.pupilDate||today(),mode='pupil'){
    if(mode==='pupil'&&rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handleDailyTap(studentId,date,mode)));return;}
    const classItem=selectedClass();
    const id=`daily_${classItem.id}_${date}_${studentId}`;
    const current=await ClassDB.get('records',id);
    const all=await ClassDB.getAllByIndex('records','studentId',studentId);
    const prior=all.filter(item=>item.type==='dailyHomework'&&item.classId===classItem.id&&item.date<date&&item.status==='forgotten'&&!item.resolvedAt&&!item.deletedAt).sort((a,b)=>a.date.localeCompare(b.date));
    if(prior.length){openPriorDialog(studentId,prior,date,mode);return;}
    const next=current?.status==='submitted'?'forgotten':current?.status==='forgotten'?'unconfirmed':'submitted';
    if(next==='unconfirmed'){await moveToTrash(current);}
    else await ClassDB.put('records',{...(current||{}),id,type:'dailyHomework',classId:classItem.id,studentId,date,status:next,resolvedAt:null});
    renderDailyContext(mode);
  }
  async function moveToTrash(record){if(!record)return;const deletedAt=ClassDB.now();await ClassDB.put('trash',{id:`trash_${record.id}`,record:{...record,deletedAt},deletedAt,purgeAfter:new Date(Date.now()+30*86400000).toISOString()});await ClassDB.remove('records',record.id);}
  function openPriorDialog(studentId,prior,date,mode){
    const oldest=prior[0];
    openDialog(`<h2>前回の忘れ物があります</h2><p>${jpDate(oldest.date)}の宿題が未解決です。</p><div class="dialog-actions"><button type="button" class="button" id="prior-close">閉じる</button><button type="button" class="button" id="today-only">この日分を提出</button><button type="button" class="button" id="prior-only">前回分を提出</button><button type="button" class="button primary" id="both-submit">両方を提出</button></div>`);
    document.getElementById('prior-close').addEventListener('click',closeDialog);
    document.getElementById('today-only').addEventListener('click',async()=>{await setDaySubmitted(studentId,date);closeDialog();renderDailyContext(mode);});
    document.getElementById('prior-only').addEventListener('click',async()=>{await resolvePrior(oldest);closeDialog();renderDailyContext(mode);});
    document.getElementById('both-submit').addEventListener('click',async()=>{await resolvePrior(oldest);await setDaySubmitted(studentId,date);closeDialog();renderDailyContext(mode);});
  }
  async function resolvePrior(record){await ClassDB.put('records',{...record,resolvedAt:ClassDB.now()});}
  async function setDaySubmitted(studentId,date){const classItem=selectedClass();const id=`daily_${classItem.id}_${date}_${studentId}`;const current=await ClassDB.get('records',id);await ClassDB.put('records',{...(current||{}),id,type:'dailyHomework',classId:classItem.id,studentId,date,status:'submitted',resolvedAt:null});}

  async function renderSettings(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-settings';
    const classItem=selectedClass();applyClassTheme(classItem);
    app.innerHTML=`<div class="app-shell">${headerHtml('教師用設定',`<button type="button" class="header-button" id="settings-home">ホーム</button><button type="button" class="header-button header-icon" id="settings-help" aria-label="使い方・FAQ">?</button>`)}<main class="page">
      <nav class="settings-nav" aria-label="設定項目">${[['year','年度'],['classes','クラス・名簿'],['tags','タグ'],['prompt','所見'],['sync','同期'],['data','出力・移行'],['help','ヘルプ・FAQ']].map(([id,label])=>`<button type="button" class="settings-tab" data-settings-tab="${id}" aria-selected="${state.settingsTab===id}">${label}</button>`).join('')}</nav>
      <div id="settings-content"></div>
    </main></div>`;
    document.getElementById('settings-home').addEventListener('click',renderHome);
    document.getElementById('settings-help').addEventListener('click',()=>{state.settingsTab='help';renderSettings();});
    document.querySelectorAll('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>{state.settingsTab=button.dataset.settingsTab;if(state.settingsTab==='sync'){renderDataExchange();return;}if(state.settingsTab==='classes'){state.classSettingsView='list';state.rosterDraft=[];state.rosterLoadedForClassId=null;}renderSettingsContent();}));
    renderSettingsContent();
  }

  function renderSettingsContent(){
    document.querySelectorAll('[data-settings-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.settingsTab===state.settingsTab)));
    if(state.settingsTab==='year')renderYearSettings();
    if(state.settingsTab==='classes')renderClassSettings();
    if(state.settingsTab==='tags')renderTagSettings();
    if(state.settingsTab==='prompt')renderPromptSettings();
    if(state.settingsTab==='data')renderDataSettings();
    if(state.settingsTab==='help')renderHelpContent();
  }

  function helpContentHtml(){return`<section class="help-grid"><article class="panel help-card"><span class="help-number">1</span><h2>最初にすること</h2><ol><li>「設定」→「クラス・名簿」でクラスを登録します。</li><li>クラスごとに「名簿」を開き、Excel・CSV・貼り付けで児童を登録します。</li><li>ホームへ戻り、使う機能を選びます。</li></ol></article><article class="panel help-card"><span class="help-number">2</span><h2>毎日の使い方</h2><p>教室では「児童用の提出画面」を開き、児童が名前をタップします。職員室では教師用ホームから宿題・メモ・評価を記録します。</p><p class="muted">教師画面は6桁PINで開き、5分操作がないと自動ロックされます。</p></article><article class="panel help-card"><span class="help-number">3</span><h2>端末間で同期する</h2><ol><li>教師用ホーム右上の「同期」を開きます。</li><li>「暗号化同期ファイルを作成」でJSONを保存します。</li><li>Teamsなどで別端末へ渡し、同じ年度パスワードで取り込みます。</li><li>内容を確認し、必要なら統合済みファイルを保存します。</li></ol><p class="notice small">同期ファイルには児童名が含まれます。必ず学校で許可された保管場所を使ってください。</p></article><article class="panel help-card"><span class="help-number">4</span><h2>表示の見方</h2><div class="help-status-list"><div><span class="help-status good"></span>緑：提出済み・記録あり</div><div><span class="help-status warn"></span>黄：確認や対応が必要</div><div><span class="help-status danger"></span>赤：未提出・忘れ・記録不足</div><div><span class="count-badge-sample">3</span>赤い数字：対応が必要な児童数</div></div></article></section><section class="panel faq-panel"><h2>よくある質問</h2><details><summary>名簿がない状態で機能を開いたらどうなりますか？</summary><p>そのクラスの「クラス・名簿設定」へ自動的に移動します。登録後、設定画面から戻ると続けて利用できます。</p></details><details><summary>iPadとPCの記録が違う場合はどうなりますか？</summary><p>更新日時が新しい記録を採用します。削除候補は自動削除せず、確認してまとめて承認します。</p></details><details><summary>同期ファイルとバックアップの違いは何ですか？</summary><p>同期は別端末との統合用、バックアップは端末故障や年度保管用です。どちらも暗号化JSONですが、用途を分けて保存してください。</p></details><details><summary>年度を切り替えると前年度の記録は消えますか？</summary><p>先に暗号化保管ファイルを作成し、同じファイルを読み直して確認した後に、新年度へ移行します。保管ファイル自体は手元に残ります。</p></details><details><summary>支援級の「単元設定」は何をしますか？</summary><p>教科ごとに「現在の学習単元」を作り、児童を単元ごとにまとめます。児童を移動すると、同じ単元で学ぶ児童のグループが更新されます。</p></details><details><summary>PIN・年度パスワード・復旧コードの違いは？</summary><p>PINは教師画面を開く日常用、年度パスワードは同期・バックアップの暗号化用です。復旧コードは年度パスワードを忘れた緊急時だけ使います。</p></details><details><summary>年度パスワードを忘れた場合は？</summary><p>別に保管した復旧コードと暗号化バックアップを使って復旧します。復旧後は新しい年度パスワードを設定します。</p></details><details><summary>通信が切れても記録できますか？</summary><p>一度読み込んだアプリはオフラインでも使え、記録は端末内に保存されます。同期ファイルの受け渡しは通信が戻ってから行ってください。</p></details></section><section class="panel help-contact"><h2>困ったときの確認順</h2><p>①現在のクラス　②名簿の登録状況　③教師用／児童用モード　④年度　⑤同期ファイルの作成日時、の順に確認してください。</p></section>`;}
  function renderHelp(){if(!teacherActive()){renderPupil();return;}state.route='teacher-help';applyClassTheme(selectedClass());app.innerHTML=teacherToolShell('使い方・FAQ',`<section class="panel"><h1>クラス支援ツールの使い方</h1><p class="muted">よく使う操作、同期、表示の見方をまとめています。</p></section>${helpContentHtml()}`);wireToolHome();}
  function renderHelpContent(){const target=document.getElementById('settings-content');target.innerHTML=`<section class="panel"><h1>使い方・FAQ</h1><p class="muted">よく使う操作、同期、表示の見方をまとめています。</p></section>${helpContentHtml()}`;}

  function renderYearSettings(){
    const target=document.getElementById('settings-content');
    target.innerHTML=`<section class="panel"><h1>年度設定</h1><form id="year-form" class="form-grid">
      <div class="field"><label for="year-label">年度名</label><input class="input" id="year-label" value="${esc(state.year.label)}" required></div>
      <div class="field"><label for="year-start">年度開始日</label><input class="input" id="year-start" type="date" value="${state.year.startDate}" required></div>
      <div class="field"><label for="year-term">前期終了日</label><input class="input" id="year-term" type="date" value="${state.year.firstTermEnd}" required></div>
      <div class="field"><label for="year-end">後期終了日</label><input class="input" id="year-end" type="date" value="${state.year.endDate}" required></div>
      <div class="field"><label for="year-hint">パスワードのヒント</label><input class="input" id="year-hint" value="${esc(state.year.passwordHint||'')}"></div>
      <div class="field full"><p class="error" id="year-error" role="alert"></p><div class="button-row end"><button class="button primary" type="submit">年度設定を保存</button></div></div>
    </form></section><section class="panel"><h2>認証の設定</h2><div class="credential-guide"><div><strong>教師用PIN</strong><span>日常の教師画面を開く6桁の番号</span></div><div><strong>年度パスワード</strong><span>同期・バックアップの暗号化と復号</span></div><div><strong>復旧コード</strong><span>年度パスワードを忘れた緊急時だけ使用</span></div></div><div class="button-row section"><button type="button" class="button" id="change-pin">教師用PINを変更</button><button type="button" class="button" id="change-annual-password">年度パスワードを変更</button></div></section><section class="panel"><h2>新年度への切り替え</h2><p class="muted">前年度を暗号化ファイルへ保管し、正常に読み直せたことを確認してから、前年度の名簿と記録をこの端末から削除します。</p><button type="button" class="button primary" id="year-rollover-open">新年度の準備を始める</button></section>`;
    document.getElementById('year-form').addEventListener('submit',async event=>{event.preventDefault();const start=document.getElementById('year-start').value,term=document.getElementById('year-term').value,end=document.getElementById('year-end').value;if(!(start<=term&&term<=end)){document.getElementById('year-error').textContent='日付順を確認してください。';return;}state.year=await ClassDB.put('years',{...state.year,label:document.getElementById('year-label').value.trim(),startDate:start,firstTermEnd:term,endDate:end,passwordHint:document.getElementById('year-hint').value.trim()});showToast('年度設定を保存しました');});
    document.getElementById('change-pin').addEventListener('click',openPinChange);
    document.getElementById('change-annual-password').addEventListener('click',openAnnualPasswordChange);
    document.getElementById('year-rollover-open').addEventListener('click',renderYearRollover);
  }

  function openPinChange(){
    openDialog(`<h2>教師用PINを変更</h2><p class="muted">現在のPINを確認してから、新しい数字6桁を設定します。</p><form id="pin-change-form"><div class="field"><label for="current-pin">現在のPIN</label><input class="input pin-input" id="current-pin" type="password" inputmode="numeric" maxlength="6" required autofocus></div><div class="form-grid section"><div class="field"><label for="new-pin">新しいPIN</label><input class="input pin-input" id="new-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></div><div class="field"><label for="new-pin2">新しいPINの確認</label><input class="input pin-input" id="new-pin2" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></div></div><p class="error" id="pin-change-error"></p><div class="button-row"><button type="button" class="button ghost" id="pin-change-annual">現在のPINを忘れた場合</button></div><div class="dialog-actions"><button type="button" class="button" id="pin-change-cancel">キャンセル</button><button type="submit" class="button primary">変更</button></div></form>`);
    document.getElementById('pin-change-cancel').addEventListener('click',closeDialog);
    document.getElementById('pin-change-annual').addEventListener('click',()=>openAnnualTeacherAuth(openPinChangeWithoutCurrent));
    document.getElementById('pin-change-form').addEventListener('submit',async event=>{event.preventDefault();const error=document.getElementById('pin-change-error'),current=document.getElementById('current-pin').value,pin=document.getElementById('new-pin').value,pin2=document.getElementById('new-pin2').value;if(!await verifySecret(current,state.year.pinAuth)){error.textContent='現在のPINが違います。';return;}await saveNewPin(pin,pin2,error);});
  }

  function openPinChangeWithoutCurrent(){
    openDialog(`<h2>新しい教師用PIN</h2><p class="muted">年度パスワードの確認が済みました。新しい数字6桁を設定します。</p><form id="pin-reset-form"><div class="field"><label for="reset-pin">新しいPIN</label><input class="input pin-input" id="reset-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus></div><div class="field section"><label for="reset-pin2">新しいPINの確認</label><input class="input pin-input" id="reset-pin2" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></div><p class="error" id="pin-reset-error"></p><div class="dialog-actions"><button type="button" class="button" id="pin-reset-cancel">キャンセル</button><button type="submit" class="button primary">変更</button></div></form>`);document.getElementById('pin-reset-cancel').addEventListener('click',closeDialog);document.getElementById('pin-reset-form').addEventListener('submit',event=>{event.preventDefault();saveNewPin(document.getElementById('reset-pin').value,document.getElementById('reset-pin2').value,document.getElementById('pin-reset-error'));});
  }

  async function saveNewPin(pin,pin2,error){if(pin!==pin2){error.textContent='新しいPINが一致しません。';return;}if(!/^\d{6}$/.test(pin)){error.textContent='PINは数字6桁で設定してください。';return;}state.year=await ClassDB.put('years',{...state.year,pinAuth:await createVerifier(pin)});state.pinFailures=0;state.pinLockedUntil=0;savePinAttempts();closeDialog();showToast('教師用PINを変更しました');}

  function openAnnualPasswordChange(){
    openDialog(`<h2>年度パスワードを変更</h2><p class="muted">今後作成する同期・バックアップに新しいパスワードを使います。以前のファイルは、作成時のパスワードで開きます。</p><form id="annual-change-form"><div class="field"><label for="annual-current">現在の年度パスワード</label><input class="input" id="annual-current" type="password" autocomplete="current-password" required autofocus></div><div class="form-grid section"><div class="field"><label for="annual-new">新しい年度パスワード</label><input class="input" id="annual-new" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label for="annual-new2">新しいパスワードの確認</label><input class="input" id="annual-new2" type="password" minlength="8" autocomplete="new-password" required></div></div><div class="field section"><label for="annual-hint">新しいヒント</label><input class="input" id="annual-hint" value="${esc(state.year.passwordHint||'')}"></div><p class="error" id="annual-change-error"></p><div class="dialog-actions"><button type="button" class="button" id="annual-change-cancel">キャンセル</button><button type="submit" class="button primary">変更</button></div></form>`);
    document.getElementById('annual-change-cancel').addEventListener('click',closeDialog);
    document.getElementById('annual-change-form').addEventListener('submit',async event=>{event.preventDefault();const error=document.getElementById('annual-change-error'),current=document.getElementById('annual-current').value,password=document.getElementById('annual-new').value,password2=document.getElementById('annual-new2').value;if(!await verifySecret(current,state.year.auth)){error.textContent='現在の年度パスワードが違います。';return;}if(password!==password2){error.textContent='新しいパスワードが一致しません。';return;}if(password.length<8){error.textContent='8文字以上で設定してください。';return;}error.textContent='変更しています…';try{let protectedRecovery=state.year.recoverySecretProtected;if(protectedRecovery){const code=await unprotectText(protectedRecovery,current);protectedRecovery=await protectText(code,password);}state.year=await ClassDB.put('years',{...state.year,auth:await createVerifier(password),passwordHint:document.getElementById('annual-hint').value.trim(),recoverySecretProtected:protectedRecovery});state.sessionSecret=password;closeDialog();showToast('年度パスワードを変更しました');}catch{error.textContent='復旧情報を更新できませんでした。現在のパスワードを確認してください。';}});
  }

  async function renderYearRollover(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-rollover';applyClassTheme(selectedClass());
    const payload=await collectYearPayload();const recordCount=payload.data.records.length,studentCount=payload.data.students.length;
    state.rolloverArchiveVerified=null;
    app.innerHTML=teacherToolShell('新年度への切り替え',`<div class="setup-steps"><span class="step active"></span><span class="step"></span><span class="step"></span></div><section class="panel"><h1>1. ${esc(state.year.label)}を保管</h1><p>名簿 ${studentCount}人、記録 ${recordCount}件を暗号化ファイルへ保存します。</p><p class="muted">保存後、同じファイルを下で選び直してください。内容を正常に読み直せるまで前年度データは削除しません。</p><div class="button-row"><button type="button" class="button primary" id="rollover-archive-save">暗号化ファイルを保存</button><label class="button">保存したファイルを確認<input type="file" id="rollover-archive-check" accept=".json,application/json" hidden></label></div><p class="error" id="rollover-archive-error" role="alert"></p></section><section class="panel"><h2>保管後の動作</h2><ul class="compact-list"><li>新年度には名簿・宿題・評価・メモなどの記録を持ち越しません。</li><li>引き継ぐ共通設定は、次の画面で選べます。</li><li>前年度の暗号化ファイルは、年度ごとのパスワードまたは復旧コードで確認できます。</li></ul></section>`);
    wireToolHome();
    document.getElementById('rollover-archive-save').addEventListener('click',async()=>{const envelope=await createEncryptedFile('archive');if(envelope)showToast(`${state.year.label}の保管ファイルを保存しました`);});
    document.getElementById('rollover-archive-check').addEventListener('change',event=>verifyRolloverArchive(event.target.files[0]));
  }

  function comparableArchiveData(data){const sortById=rows=>[...(rows||[])].sort((a,b)=>String(a.id||a.key).localeCompare(String(b.id||b.key)));return JSON.stringify({years:sortById(data?.years),classes:sortById(data?.classes),students:sortById(data?.students),enrollments:sortById(data?.enrollments),records:sortById(data?.records),trash:sortById(data?.trash),meta:sortById(data?.meta)});}

  async function verifyRolloverArchive(file){
    if(!file)return;const error=document.getElementById('rollover-archive-error');error.textContent='保管ファイルを確認しています…';
    if(!await requestAnnualPassword()){error.textContent='確認をキャンセルしました。';return;}
    try{const envelope=JSON.parse(await file.text());if(envelope.kind!=='archive'&&envelope.kind!=='backup')throw new Error('年度保管またはバックアップのファイルを選んでください');const payload=await decryptEnvelope(envelope);if(payload.yearId!==state.year.id)throw new Error(`${state.year.label}のファイルではありません`);const current=await collectYearPayload();if(comparableArchiveData(payload.data)!==comparableArchiveData(current.data))throw new Error('保存後にデータが変更されています。もう一度保管ファイルを作成してください');state.rolloverArchiveVerified={yearId:state.year.id,payload,checkedAt:ClassDB.now()};showToast('前年度のデータを正常に読み取れました');renderNewYearSettings();}catch(problem){error.textContent=problem.message||'保管ファイルを確認できませんでした';}
  }

  function renderNewYearSettings(){
    if(!state.rolloverArchiveVerified||state.rolloverArchiveVerified.yearId!==state.year.id){renderYearRollover();return;}
    state.route='teacher-rollover-settings';const currentOwn=state.classes.find(item=>item.isOwn)||selectedClass();const next=Math.max(schoolYear(),yearNumberOf(state.year)+1);
    app.innerHTML=teacherToolShell('新年度への切り替え',`<div class="setup-steps"><span class="step active"></span><span class="step active"></span><span class="step"></span></div><section class="panel"><h1>2. 新年度を設定</h1><form id="rollover-settings-form" class="form-grid"><div class="field"><label for="rollover-year">年度</label><input class="input" id="rollover-year" type="number" min="2020" max="2100" value="${next}" required></div><div class="field"><label for="rollover-class">自分のクラス名</label><input class="input" id="rollover-class" value="${esc(currentOwn?.name||'')}" required></div><div class="field"><label for="rollover-start">年度開始日</label><input class="input" id="rollover-start" type="date" value="${next}-04-01" required></div><div class="field"><label for="rollover-term">前期終了日</label><input class="input" id="rollover-term" type="date" value="${next}-10-10" required></div><div class="field"><label for="rollover-end">後期終了日</label><input class="input" id="rollover-end" type="date" value="${next+1}-03-31" required></div><div class="field"><label for="rollover-mode">クラスの種類</label><select class="select" id="rollover-mode"><option value="general" ${!isSupportClass(currentOwn)?'selected':''}>一般級</option><option value="support" ${isSupportClass(currentOwn)?'selected':''}>個別支援級</option></select></div><div class="field full"><span class="field-label">クラスカラー</span><div class="color-choices" id="rollover-colors">${colorButtons(currentOwn?.color||COLORS[5])}</div></div><div class="field full"><span class="field-label">このクラスで記録する教科</span><div class="subject-checks">${SUBJECTS.map(subject=>`<label><input type="checkbox" data-rollover-subject="${subject}" ${classSubjects(currentOwn).includes(subject)?'checked':''}> ${subject}</label>`).join('')}</div></div><div class="field full"><span class="field-label">新年度へ引き継ぐ共通設定</span><label class="check-row"><input type="checkbox" id="carry-memo-tags" checked> 児童メモのタグ</label><label class="check-row"><input type="checkbox" id="carry-support-tags" checked> 支援級の共通タグ</label><label class="check-row"><input type="checkbox" id="carry-report-prompt" checked> 所見プロンプト設定</label></div><div class="field"><label for="rollover-password">新年度パスワード</label><input class="input" id="rollover-password" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label for="rollover-password2">パスワード確認</label><input class="input" id="rollover-password2" type="password" minlength="8" autocomplete="new-password" required></div><div class="field full"><label for="rollover-hint">パスワードのヒント（氏名などの機密情報は入れない）</label><input class="input" id="rollover-hint"></div><div class="field full"><p class="error" id="rollover-settings-error" role="alert"></p><div class="button-row end"><button type="button" class="button" id="rollover-settings-back">戻る</button><button type="submit" class="button primary">復旧コードを作成</button></div></div></form></section>`);
    wireToolHome();wireColorChoices(document.getElementById('rollover-colors'));document.getElementById('rollover-settings-back').addEventListener('click',renderYearRollover);document.getElementById('rollover-settings-form').addEventListener('submit',prepareNewYear);
  }

  async function prepareNewYear(event){
    event.preventDefault();const error=document.getElementById('rollover-settings-error'),password=document.getElementById('rollover-password').value,password2=document.getElementById('rollover-password2').value,start=document.getElementById('rollover-start').value,term=document.getElementById('rollover-term').value,end=document.getElementById('rollover-end').value,yearNumber=Number(document.getElementById('rollover-year').value),subjects=[...document.querySelectorAll('[data-rollover-subject]:checked')].map(item=>item.dataset.rolloverSubject),color=document.querySelector('#rollover-colors [data-color-code]').value.trim();
    if(yearNumber<=yearNumberOf(state.year)){error.textContent=`${state.year.label}より後の年度を指定してください。`;return;}if(password!==password2){error.textContent='パスワードが一致しません。';return;}if(password.length<8){error.textContent='パスワードは8文字以上にしてください。';return;}if(!(start<=term&&term<=end)){error.textContent='年度と学期の日付順を確認してください。';return;}if(!validColor(color)){error.textContent='カラーコードを確認してください。';return;}if(!subjects.length){error.textContent='記録する教科を1つ以上選んでください。';return;}
    const code=recoveryCode(),mode=document.getElementById('rollover-mode').value;state.rolloverDraft={oldYearId:state.year.id,oldYearLabel:state.year.label,oldPasswordHint:state.year.passwordHint||'',year:{id:ClassDB.uid('year'),label:`${yearNumber}年度`,yearNumber,startDate:start,firstTermEnd:term,endDate:end,mode,passwordHint:document.getElementById('rollover-hint').value.trim(),auth:await createVerifier(password),pinAuth:state.year.pinAuth,recoveryAuth:await createVerifier(code),recoverySecretProtected:await protectText(code,password)},classItem:{id:ClassDB.uid('class'),name:document.getElementById('rollover-class').value.trim(),color,isOwn:true,isSupport:mode==='support',recordSubjects:subjects,order:0},carry:{memoTags:document.getElementById('carry-memo-tags').checked,supportTags:document.getElementById('carry-support-tags').checked,reportPrompt:document.getElementById('carry-report-prompt').checked},code,secret:password};renderNewYearRecovery();
  }

  function renderNewYearRecovery(){
    const draft=state.rolloverDraft;if(!draft){renderNewYearSettings();return;}state.route='teacher-rollover-recovery';
    app.innerHTML=teacherToolShell('新年度への切り替え',`<div class="setup-steps"><span class="step active"></span><span class="step active"></span><span class="step active"></span></div><section class="panel"><h1>3. ${esc(draft.year.label)}の復旧コードを保管</h1><p class="muted">前年度とは別の復旧コードです。年度名と一緒に、端末やバックアップとは別の場所へ保管してください。</p><p class="recovery-code">${esc(draft.code)}</p><div class="button-row"><button type="button" class="button" id="rollover-code-copy">コピー</button><button type="button" class="button" id="rollover-code-save">TXT保存</button><button type="button" class="button" id="rollover-code-print">印刷</button></div></section><form id="rollover-finish-form" class="panel"><div class="field"><label for="rollover-code-confirm">保管したコードを再入力</label><input class="input" id="rollover-code-confirm" autocomplete="off" required></div><p class="error" id="rollover-finish-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button" id="rollover-recovery-back">戻る</button><button type="submit" class="button primary">確認して新年度へ切り替える</button></div></form>`);
    wireToolHome();document.getElementById('rollover-code-copy').addEventListener('click',async()=>{await navigator.clipboard.writeText(draft.code);showToast('復旧コードをコピーしました');});document.getElementById('rollover-code-save').addEventListener('click',()=>downloadText(`クラス支援_${draft.year.label}_復旧コード.txt`,`${draft.year.label}\n復旧コード: ${draft.code}\nパスワードヒント: ${draft.year.passwordHint||'（なし）'}\n`));document.getElementById('rollover-code-print').addEventListener('click',()=>window.print());document.getElementById('rollover-recovery-back').addEventListener('click',renderNewYearSettings);document.getElementById('rollover-finish-form').addEventListener('submit',completeYearRollover);
  }

  async function completeYearRollover(event){
    event.preventDefault();const draft=state.rolloverDraft,error=document.getElementById('rollover-finish-error');if(!draft||!state.rolloverArchiveVerified||state.rolloverArchiveVerified.yearId!==draft.oldYearId){error.textContent='前年度の保管確認からやり直してください。';return;}if(document.getElementById('rollover-code-confirm').value.trim().toUpperCase()!==draft.code){error.textContent='復旧コードが一致しません。';return;}error.textContent='新年度へ切り替えています…';
    try{const carryValues={};if(draft.carry.memoTags)carryValues.memoTags=await ClassDB.getMeta('memoTags',MEMO_TAGS);if(draft.carry.supportTags)carryValues.supportTags=await ClassDB.getMeta('supportTags',SUPPORT_TAGS);if(draft.carry.reportPrompt)carryValues.reportPromptTemplate=await ClassDB.getMeta('reportPromptTemplate',defaultReportPrompt());const newYear=await ClassDB.put('years',draft.year),newClass=await ClassDB.put('classes',{...draft.classItem,yearId:newYear.id});await deleteYearFromApp(draft.oldYearId);for(const key of ['memoTags','supportTags','reportPromptTemplate']){if(Object.prototype.hasOwnProperty.call(carryValues,key))await ClassDB.setMeta(key,carryValues[key]);else await ClassDB.remove('meta',key);}await ClassDB.setMeta('yearArchiveHistory',[...await ClassDB.getMeta('yearArchiveHistory',[]),{yearLabel:draft.oldYearLabel,passwordHint:draft.oldPasswordHint,archivedAt:ClassDB.now()}]);await ClassDB.setMeta('activeYearId',newYear.id);await ClassDB.setMeta('selectedClassId',newClass.id);await ClassDB.setMeta('lastBackupAt',null);await ClassDB.setMeta('backupDismissedUntil',null);state.year=newYear;state.classes=[newClass];state.selectedClassId=newClass.id;state.lastBackupAt=null;state.backupDismissedUntil=null;state.rolloverArchiveVerified=null;state.rolloverDraft=null;state.rolloverContinue=false;state.rosterDraft=[];state.rosterLoadedForClassId=null;unlockTeacher(draft.secret);showToast(`${newYear.label}へ切り替えました`);renderHome();}catch(problem){error.textContent=problem.message||'新年度へ切り替えられませんでした';}
  }

  async function deleteYearFromApp(yearId){
    const classes=await ClassDB.getAllByIndex('classes','yearId',yearId),classIds=new Set(classes.map(item=>item.id)),enrollments=(await ClassDB.getAll('enrollments')).filter(item=>classIds.has(item.classId)),studentIds=new Set(enrollments.map(item=>item.studentId)),records=(await ClassDB.getAll('records')).filter(item=>classIds.has(item.classId)),trash=(await ClassDB.getAll('trash')).filter(item=>classIds.has(item.record?.classId));for(const item of records)await ClassDB.remove('records',item.id);for(const item of trash)await ClassDB.remove('trash',item.id);for(const item of enrollments)await ClassDB.remove('enrollments',item.id);for(const item of classes){await ClassDB.remove('classes',item.id);await ClassDB.remove('meta',`seatingSettings_${item.id}`);}await ClassDB.remove('years',yearId);const remaining=await ClassDB.getAll('enrollments'),used=new Set(remaining.map(item=>item.studentId));for(const studentId of studentIds)if(!used.has(studentId))await ClassDB.remove('students',studentId);
  }

  async function renderClassSettings(){
    if(state.classSettingsView==='roster'){await renderRosterSettings();return;}
    const target=document.getElementById('settings-content');
    const rosterCounts=new Map(await Promise.all(state.classes.map(async item=>[item.id,(await rosterForClass(item.id)).length])));if(state.settingsTab!=='classes'||state.classSettingsView!=='list')return;
    target.innerHTML=`<section class="panel"><div class="button-row" style="justify-content:space-between"><div><h1>クラス・名簿設定</h1><p class="muted">クラスの設定と、そのクラスの名簿登録をここで行います。自分のクラスはホームの先頭に固定します。</p></div><button type="button" class="button primary" id="add-class">クラスを追加</button></div><div class="list">${state.classes.map(item=>`<div class="list-row"><div><div class="row-title"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${esc(item.color)};margin-right:7px"></span>${esc(item.name)}</div><div class="row-meta">${item.isOwn?'自分のクラス':'担当クラス'}・${isSupportClass(item)?'個別支援級':'一般級'}・名簿 ${rosterCounts.get(item.id)||0}人</div></div><div class="button-row"><button type="button" class="button primary" data-roster-class="${item.id}">名簿</button><button type="button" class="button" data-edit-class="${item.id}">編集</button></div></div>`).join('')}</div></section>`;
    document.getElementById('add-class').addEventListener('click',()=>openClassEditor());
    document.querySelectorAll('[data-edit-class]').forEach(button=>button.addEventListener('click',()=>openClassEditor(state.classes.find(item=>item.id===button.dataset.editClass))));
    document.querySelectorAll('[data-roster-class]').forEach(button=>button.addEventListener('click',async()=>{state.selectedClassId=button.dataset.rosterClass;await ClassDB.setMeta('selectedClassId',state.selectedClassId);state.classSettingsView='roster';state.rosterDraft=[];state.rosterLoadedForClassId=null;renderClassSettings();}));
  }

  function openClassEditor(item=null){
    const current=item||{name:'',color:COLORS[2],isOwn:false,isSupport:false,recordSubjects:[...SUBJECTS]};const subjects=classSubjects(current);
    openDialog(`<h2>${item?'クラスを編集':'クラスを追加'}</h2><form id="class-form"><div class="field"><label for="class-name">クラス名</label><input class="input" id="class-name" value="${esc(current.name)}" required></div><div class="field section"><span class="field-label">クラスカラー</span><div class="color-choices" id="class-colors">${colorButtons(current.color)}</div></div><label class="check-row"><input id="class-own" type="checkbox" ${current.isOwn?'checked':''}> 自分のクラスにする</label><label class="check-row"><input id="class-support" type="checkbox" ${isSupportClass(current)?'checked':''}> 個別支援級にする</label><div class="field section"><span class="field-label">このクラスで記録する教科</span><div class="subject-checks">${SUBJECTS.map(subject=>`<label><input type="checkbox" data-class-subject="${subject}" ${subjects.includes(subject)?'checked':''}> ${subject}</label>`).join('')}</div></div><p class="error" id="class-error"></p><div class="dialog-actions"><button type="button" class="button" id="class-cancel">キャンセル</button><button type="submit" class="button primary">保存</button></div></form>`);
    wireColorChoices(document.getElementById('class-colors'));
    document.getElementById('class-cancel').addEventListener('click',closeDialog);
    document.getElementById('class-form').addEventListener('submit',async event=>{event.preventDefault();const isOwn=document.getElementById('class-own').checked;const isSupport=document.getElementById('class-support').checked;const recordSubjects=[...document.querySelectorAll('[data-class-subject]:checked')].map(input=>input.dataset.classSubject);const color=document.querySelector('#class-colors [data-color-code]').value.trim();if(!validColor(color)){document.getElementById('class-error').textContent='カラーコードを確認してください。';return;}if(!recordSubjects.length){document.getElementById('class-error').textContent='記録する教科を1つ以上選んでください。';return;}if(isOwn){for(const other of state.classes.filter(x=>x.isOwn&&x.id!==item?.id))await ClassDB.put('classes',{...other,isOwn:false});}const saved=await ClassDB.put('classes',{...(item||{}),id:item?.id||ClassDB.uid('class'),yearId:state.year.id,name:document.getElementById('class-name').value.trim(),color,isOwn,isSupport,recordSubjects,order:item?.order??state.classes.length});state.classes=(await ClassDB.getAllByIndex('classes','yearId',state.year.id)).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));if(!state.selectedClassId)state.selectedClassId=saved.id;closeDialog();renderClassSettings();showToast('クラスを保存しました');});
  }

  async function renderRosterSettings(){
    const target=document.getElementById('settings-content');
    const classItem=selectedClass();
    if(!classItem){target.innerHTML='<section class="panel">先にクラスを登録してください。</section>';return;}
    if(state.rosterLoadedForClassId!==classItem.id){const rows=await rosterForClass(classItem.id);state.rosterDraft=rows.map(({enrollment,student})=>({enrollmentId:enrollment.id,studentId:student.id,number:enrollment.number,name:student.name,grade:enrollment.grade||'',gender:enrollment.gender||''}));state.rosterLoadedForClassId=classItem.id;}
    if(state.settingsTab!=='classes'||state.classSettingsView!=='roster'||selectedClass()?.id!==classItem.id)return;
    target.innerHTML=`<section class="panel"><div class="button-row" style="justify-content:space-between"><div><h1>${esc(classItem.name)}の名簿</h1><p class="muted">Excel・CSV・表の貼り付けから「出席番号・氏名・学年・性別」を読み取ります。Excelは先頭シートを使用します。</p></div><button type="button" class="button" id="roster-back">クラス一覧へ</button></div><div class="form-grid"><div class="field full"><label for="roster-paste">表を貼り付け</label><textarea class="textarea" id="roster-paste" placeholder="1\t青木 陽斗\t5\t男"></textarea></div><div class="field"><label for="roster-file">Excel・CSV・テキストファイル</label><input class="input" id="roster-file" type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"><span class="small muted">Excelは .xlsx 形式に対応しています。</span></div><div class="field" style="align-self:end"><button type="button" class="button" id="parse-roster">貼り付け内容を追加</button></div></div></section><section class="panel"><div class="button-row" style="justify-content:space-between"><h2>登録内容</h2><button type="button" class="button" id="blank-row">1人追加</button></div><div class="table-wrap"><table class="roster-table"><thead><tr><th>番号</th><th>氏名</th><th>学年</th><th>性別</th><th></th></tr></thead><tbody id="roster-body">${rosterRowsHtml()}</tbody></table></div><p class="error" id="roster-error" role="alert"></p><div class="button-row end"><button type="button" class="button primary" id="save-roster">名簿を保存</button></div></section>`;
    wireRosterRows();
    document.getElementById('roster-back').addEventListener('click',()=>{state.classSettingsView='list';state.rosterDraft=[];state.rosterLoadedForClassId=null;renderClassSettings();});
    document.getElementById('blank-row').addEventListener('click',()=>{readRosterInputs();state.rosterDraft.push({number:state.rosterDraft.length+1,name:'',grade:'',gender:''});renderRosterSettings();});
    document.getElementById('parse-roster').addEventListener('click',()=>{readRosterInputs();appendParsedRoster(document.getElementById('roster-paste').value);renderRosterSettings();});
    document.getElementById('roster-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;readRosterInputs();try{if(/\.xlsx$/i.test(file.name))appendRosterRows(await XlsxRosterReader.read(file));else appendParsedRoster(await file.text());renderRosterSettings();}catch(error){document.getElementById('roster-error').textContent=error.message||'名簿ファイルを読み取れませんでした。';}});
    document.getElementById('save-roster').addEventListener('click',saveRoster);
  }

  function rosterRowsHtml(){return state.rosterDraft.map((row,index)=>`<tr data-roster-row="${index}"><td><input type="number" min="1" value="${esc(row.number)}" data-field="number" aria-label="出席番号"></td><td><input value="${esc(row.name)}" data-field="name" aria-label="氏名"></td><td><input value="${esc(row.grade)}" data-field="grade" aria-label="学年"></td><td><select data-field="gender" aria-label="性別"><option value=""></option><option value="male" ${normalizeGender(row.gender)==='male'?'selected':''}>男</option><option value="female" ${normalizeGender(row.gender)==='female'?'selected':''}>女</option><option value="other" ${normalizeGender(row.gender)==='other'?'selected':''}>その他・未設定</option></select></td><td><button type="button" class="button danger" data-remove-row="${index}">外す</button></td></tr>`).join('');}
  function normalizeGender(value){const text=String(value||'').trim().toLowerCase();if(['男','男性','m','male'].includes(text))return'male';if(['女','女性','f','female'].includes(text))return'female';return text||'';}
  function wireRosterRows(){document.querySelectorAll('[data-remove-row]').forEach(button=>button.addEventListener('click',()=>{readRosterInputs();state.rosterDraft.splice(Number(button.dataset.removeRow),1);renderRosterSettings();}));}
  function readRosterInputs(){document.querySelectorAll('[data-roster-row]').forEach(rowElement=>{const row=state.rosterDraft[Number(rowElement.dataset.rosterRow)];rowElement.querySelectorAll('[data-field]').forEach(input=>row[input.dataset.field]=input.value);});}
  function appendParsedRoster(text){const rows=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>line.split(line.includes('\t')?'\t':',').map(cell=>cell.trim().replace(/^"|"$/g,'')));appendRosterRows(rows);}
  function rosterHeader(value){return String(value||'').replace(/[\s　_・]/g,'').toLowerCase();}
  function appendRosterRows(inputRows){
    const rows=inputRows.map(row=>Array.from(row||[],cell=>String(cell??'').trim())).filter(row=>row.some(Boolean));
    const aliases={number:['出席番号','番号','no','no.','№'],name:['氏名','名前','児童氏名','児童名','生徒氏名','生徒名'],grade:['学年'],gender:['性別']};
    let headerIndex=-1,columns={};
    for(let index=0;index<Math.min(rows.length,10);index++){const normalized=rows[index].map(rosterHeader),candidate={};for(const [field,names] of Object.entries(aliases)){const found=normalized.findIndex(value=>names.includes(value));if(found>=0)candidate[field]=found;}if(candidate.name!==undefined){headerIndex=index;columns=candidate;break;}}
    const dataRows=headerIndex>=0?rows.slice(headerIndex+1):rows;
    const parsed=dataRows.map(cells=>{if(headerIndex>=0)return{number:Number(cells[columns.number]||'')||'',name:cells[columns.name]||'',grade:columns.grade!==undefined?cells[columns.grade]||'':'',gender:normalizeGender(columns.gender!==undefined?cells[columns.gender]||'':'')};return{number:Number(cells[0])||'',name:cells[1]||cells[0]||'',grade:cells[2]||'',gender:normalizeGender(cells[3]||'')};}).filter(row=>row.name&&rosterHeader(row.name)!=='氏名');
    state.rosterDraft.push(...parsed);
  }
  async function saveRoster(){
    readRosterInputs();
    const valid=state.rosterDraft.filter(row=>row.name.trim());
    const numbers=valid.map(row=>String(row.number)).filter(Boolean);
    if(new Set(numbers).size!==numbers.length){document.getElementById('roster-error').textContent='出席番号が重複しています。';return;}
    const classItem=selectedClass();
    const activeEnrollments=(await ClassDB.getAllByIndex('enrollments','classId',classItem.id)).filter(item=>!item.endDate);
    const retainedIds=new Set(valid.map(row=>row.enrollmentId).filter(Boolean));
    for(const enrollment of activeEnrollments.filter(item=>!retainedIds.has(item.id))){await ClassDB.put('enrollments',{...enrollment,endDate:today()});}
    for(const row of valid){const student=await ClassDB.put('students',{id:row.studentId||ClassDB.uid('student'),name:row.name.trim()});await ClassDB.put('enrollments',{id:row.enrollmentId||ClassDB.uid('enrollment'),studentId:student.id,classId:classItem.id,number:Number(row.number)||null,grade:String(row.grade||'').trim(),gender:normalizeGender(row.gender),startDate:state.year.startDate,endDate:null});}
    state.rosterDraft=[];state.rosterLoadedForClassId=null;showToast(`${valid.length}人の名簿を保存しました`);renderRosterSettings();
  }

  async function renderTagSettings(){
    const tags=await ClassDB.getMeta('certificateTags',['最後まで取り組んだ','工夫した','友達を助けた','よく発表した','丁寧に仕上げた','成長が見られた']);
    const memoTags=await ClassDB.getMeta('memoTags',MEMO_TAGS);
    const supportTags=await ClassDB.getMeta('supportTags',SUPPORT_TAGS);
    document.getElementById('settings-content').innerHTML=`<section class="panel"><h1>児童メモのタグ</h1><p class="muted">プラス評価として使うタグを、1行に1つ入力します。全クラスで共通です。</p><form id="memo-tags-form"><div class="field"><label for="memo-tags-text">選択タグ</label><textarea class="textarea tall" id="memo-tags-text">${esc(memoTags.join('\n'))}</textarea></div><div class="button-row end section"><button type="submit" class="button primary">児童メモタグを保存</button></div></form></section><section class="panel"><h1>ミニ賞状のタグ</h1><p class="muted">1行に1つ入力します。ここで設定したタグが、全クラスのミニ賞状で共通して使われます。</p><form id="certificate-tags-form"><div class="field"><label for="certificate-tags-text">選択タグ</label><textarea class="textarea tall" id="certificate-tags-text">${esc(tags.join('\n'))}</textarea></div><div class="button-row end section"><button type="submit" class="button primary">賞状タグを保存</button></div></form></section>${isSupportClass(selectedClass())?`<section class="panel"><h1>個別支援級・学習記録のタグ</h1><p class="muted">定型項目ごとに、1行に1つ入力します。個別支援級で共通です。</p><form id="support-tags-form" class="form-grid">${Object.entries(supportTags).map(([category,values])=>`<div class="field"><label>${esc(category)}</label><textarea class="textarea" data-support-tag-category="${esc(category)}">${esc(values.join('\n'))}</textarea></div>`).join('')}<div class="field full"><div class="button-row end"><button type="submit" class="button primary">学習記録タグを保存</button></div></div></form></section>`:''}`;
    document.getElementById('memo-tags-form').addEventListener('submit',async event=>{event.preventDefault();const values=document.getElementById('memo-tags-text').value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);await ClassDB.setMeta('memoTags',[...new Set(values)]);showToast('児童メモタグを保存しました');});
    document.getElementById('certificate-tags-form').addEventListener('submit',async event=>{event.preventDefault();const values=document.getElementById('certificate-tags-text').value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);await ClassDB.setMeta('certificateTags',[...new Set(values)]);showToast('賞状タグを保存しました');});
    document.getElementById('support-tags-form')?.addEventListener('submit',async event=>{event.preventDefault();const values={};document.querySelectorAll('[data-support-tag-category]').forEach(textarea=>{values[textarea.dataset.supportTagCategory]=[...new Set(textarea.value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean))];});await ClassDB.setMeta('supportTags',values);showToast('支援級タグを保存しました');});
  }

  async function renderMemos(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-memo';state.activeTool='memo';
    const classItem=selectedClass();applyClassTheme(classItem);const date=state.toolDraft.memoDate||today();state.toolDraft.memoDate=date;
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='memo'&&item.date===date&&!item.deletedAt);
    const shortages=await memoShortages(classItem);
    const latest=new Map();records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).forEach(item=>{if(!latest.has(item.studentId))latest.set(item.studentId,item);});
    const cards=await teacherRosterCards(classItem.id,[...latest.values()],{status:record=>record?(record.tags?.join('・')||record.viewpoint||'記録あり'):'記録を追加'});
    const shortageHtml=isSupportClass(classItem)?`<section class="panel memo-shortage"><h2>メモが不足　${shortages.length}人</h2>${shortages.length?`<div class="list">${shortages.map(item=>`<div class="shortage-row"><strong>${esc(item.student.name)}</strong><div class="shortage-subjects">${item.subjects.map(subject=>`<button type="button" data-shortage-student="${item.student.id}" data-shortage-subject="${esc(subject)}">${esc(subject)}</button>`).join('')}</div></div>`).join('')}</div>`:'<p class="muted">設定したすべての教科にメモがあります。</p>'}</section>`:'';
    app.innerHTML=teacherToolShell('児童メモ',`${pupilDateNav(date,'memo-prev','memo-next')}<section class="panel"><h1>${esc(classItem.name)}の児童メモ</h1><p class="muted">教科とタグを選ぶだけでも保存できます。必要なときだけ自由記述を加えます。</p></section>${shortageHtml}${cards}`);
    wireToolHome();wireStudentDetails();
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
    const cards=await teacherRosterCards(classItem.id,records,{status:record=>record?(record.tags?.length?record.tags.join('・'):'渡した'):'未配付',statusClass:record=>record?'good':''});
    app.innerHTML=teacherToolShell('ミニ賞状',`${pupilDateNav(date,'certificate-prev','certificate-next')}<section class="panel"><h1>${esc(classItem.name)}のミニ賞状</h1><p class="muted">1回目で「渡した」。もう一度選ぶと理由メモの追加や取消ができます。</p></section>${cards}`);
    wireToolHome();wireStudentDetails();
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
    const cards=await teacherRosterCards(classItem.id,records,{status:record=>record?(record.status==='absent'?'欠席':record.status==='unsubmitted'?'未提出':record.grade):'未評価',statusClass:record=>record?(record.grade?`grade-${record.grade.toLowerCase().replace('+','plus').replace('-','minus')}`:record.status==='unsubmitted'?'alert':'warn'):''});
    app.innerHTML=teacherToolShell('ノート評価',`${pupilDateNav(draft.date,'notebook-prev','notebook-next')}<section class="panel"><h1>${esc(classItem.name)}のノート評価</h1><div class="tool-controls"><div class="field"><label for="notebook-subject">教科</label><select class="select" id="notebook-subject">${subjects.map(subject=>`<option ${subject===draft.subject?'selected':''}>${subject}</option>`).join('')}</select></div><div class="field"><label for="notebook-unit">単元</label><input class="input" id="notebook-unit" value="${esc(draft.unit)}"></div><div class="field wide"><label for="notebook-title">題名（任意）</label><input class="input" id="notebook-title" value="${esc(draft.title)}" placeholder="空欄なら ${esc(slashDate(draft.date))}"></div></div><div class="button-row end"><button type="button" class="button primary" id="notebook-apply">この内容で表示</button></div><p class="muted small">題名が空欄の場合は「${esc(draft.subject)}　${esc(draft.unit||'単元')}　${esc(slashDate(draft.date))}」と表示します。1回目はB、2回目で評価を選びます。</p></section>${cards}`);
    wireToolHome();wireStudentDetails();
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
    const records=(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>!item.deletedAt);
    const occurrences=records.filter(item=>item.type==='weeklyOccurrence').sort((a,b)=>b.dueDate.localeCompare(a.dueDate));
    const submissions=records.filter(item=>item.type==='weeklySubmission');
    return{occurrences,submissions};
  }

  async function renderWeekly(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-weekly';state.activeTool='weekly';
    const classItem=selectedClass();applyClassTheme(classItem);const data=await weeklyData(classItem.id);
    let draft=state.toolDraft.weekly;
    if(!draft){const latest=data.occurrences[0];draft=state.toolDraft.weekly={occurrenceId:latest?.id||null,dueDate:latest?.dueDate||today(),title:latest?.title||'自主学習'};}
    let occurrence=data.occurrences.find(item=>item.id===draft.occurrenceId)||null;
    if(!occurrence&&data.occurrences.length){occurrence=data.occurrences[0];draft.occurrenceId=occurrence.id;draft.dueDate=occurrence.dueDate;draft.title=occurrence.title;}
    const currentSubmissions=occurrence?data.submissions.filter(item=>item.occurrenceId===occurrence.id):[];
    const missingByStudent=new Map();
    const dueOccurrences=data.occurrences.filter(item=>item.dueDate<today());
    const roster=await rosterForClass(classItem.id);
    roster.forEach(row=>{const missing=dueOccurrences.filter(week=>!data.submissions.some(item=>item.studentId===row.student.id&&item.occurrenceId===week.id&&item.status==='submitted'));missingByStudent.set(row.student.id,missing);});
    const cards=await teacherRosterCards(classItem.id,currentSubmissions,{orderMode:teacherOrderMode(),preserveSeatShape:true,status:(record,row)=>{const missing=missingByStudent.get(row.student.id);const missed=missing.length;const maxAge=missing.length?Math.max(...missing.map(item=>Math.floor((new Date(today())-new Date(item.dueDate))/86400000))):0;if(record?.status==='submitted')return missed?`提出済み・過去未提出 ${missed}週`:'提出済み';if(record?.status==='forgotten')return'忘れた';if(missed>=2)return`${missed}週未提出`;if(maxAge>=7)return'7日以上未提出';if(maxAge>=5)return'5日以上未提出';if(occurrence?.dueDate<today())return'未提出';return missed?'過去分未提出':'未提出';},statusClass:(record,row)=>{const missing=missingByStudent.get(row.student.id);const maxAge=missing.length?Math.max(...missing.map(item=>Math.floor((new Date(today())-new Date(item.dueDate))/86400000))):0;if(record?.status==='forgotten'||missing.length>=2||maxAge>=7)return'alert';if(maxAge>=5)return'warn';return record?.status==='submitted'?'good':'';}});
    app.innerHTML=teacherToolShell('週宿題',`<section class="panel"><div class="toolbar-line"><h1>${esc(classItem.name)}の週宿題</h1>${teacherOrderControlHtml()}</div><div class="tool-controls"><div class="field wide"><label for="weekly-select">登録済みの週</label><select class="select" id="weekly-select"><option value="">新しい週を登録</option>${data.occurrences.map(item=>`<option value="${item.id}" ${item.id===occurrence?.id?'selected':''}>${esc(jpDate(item.dueDate))}　${esc(item.title)}</option>`).join('')}</select></div><div class="field"><label for="weekly-date">提出予定日</label><input class="input" id="weekly-date" type="date" value="${esc(draft.dueDate)}"></div><div class="field"><label for="weekly-title">宿題名</label><input class="input" id="weekly-title" value="${esc(draft.title)}"></div></div><div class="button-row end"><button type="button" class="button primary" id="weekly-register">この週を登録・表示</button></div><p class="muted small">児童を選び、提出した週をまとめて指定できます。予定日から5日で黄色、7日で赤の目安です。</p></section>${cards}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderWeekly);
    document.getElementById('weekly-select').addEventListener('change',event=>{const selected=data.occurrences.find(item=>item.id===event.target.value);state.toolDraft.weekly=selected?{occurrenceId:selected.id,dueDate:selected.dueDate,title:selected.title}:{occurrenceId:null,dueDate:today(),title:draft.title||'自主学習'};renderWeekly();});
    document.getElementById('weekly-register').addEventListener('click',async()=>{const dueDate=document.getElementById('weekly-date').value;const title=document.getElementById('weekly-title').value.trim();if(!dueDate||!title){showToast('提出予定日と宿題名を入力してください');return;}let saved=data.occurrences.find(item=>item.dueDate===dueDate&&item.title===title);if(!saved)saved=await ClassDB.put('records',{id:ClassDB.uid('weeklyOccurrence'),type:'weeklyOccurrence',classId:classItem.id,studentId:null,date:dueDate,dueDate,title});state.toolDraft.weekly={occurrenceId:saved.id,dueDate,title};showToast('週宿題を登録しました');renderWeekly();});
    document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>openWeeklyStudent(button.dataset.toolStudent)));
  }

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
    const submissions=item?data.submissions.filter(row=>row.itemId===item.id):[];
    const cards=await teacherRosterCards(classItem.id,submissions,{orderMode:teacherOrderMode(),preserveSeatShape:true,status:record=>record?.status==='submitted'?'提出済み':'未提出',statusClass:record=>record?.status==='submitted'?'good':'alert'});
    app.innerHTML=teacherToolShell('不定期提出物',`<section class="panel"><div class="toolbar-line"><h1>${esc(classItem.name)}の不定期提出物</h1>${teacherOrderControlHtml()}</div><div class="tool-controls"><div class="field wide"><label for="occasional-select">提出物</label><select class="select" id="occasional-select"><option value="">新しい提出物</option>${data.items.map(row=>`<option value="${row.id}" ${row.id===item?.id?'selected':''}>${row.archived?'【完結】':''}${esc(row.title)}　${esc(jpDate(row.dueDate))}</option>`).join('')}</select></div><div class="field"><label for="occasional-date">提出予定日</label><input class="input" id="occasional-date" type="date" value="${item?.dueDate||today()}"></div><div class="field"><label for="occasional-title">提出物名</label><input class="input" id="occasional-title" value="${esc(item?.title||'')}"></div></div><div class="button-row end">${item?`<button type="button" class="button" id="occasional-archive">${item.archived?'再開する':'完結・アーカイブ'}</button>`:''}<button type="button" class="button primary" id="occasional-save">登録・表示</button></div><p class="muted small">未提出者は完結するまで翌日以降も表示されます。</p></section>${item?cards:'<section class="panel"><p>提出物を登録してください。</p></section>'}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderOccasional);
    document.getElementById('occasional-select').addEventListener('change',event=>{state.toolDraft.occasionalId=event.target.value||null;renderOccasional();});
    document.getElementById('occasional-save').addEventListener('click',async()=>{const dueDate=document.getElementById('occasional-date').value;const title=document.getElementById('occasional-title').value.trim();if(!dueDate||!title){showToast('提出予定日と提出物名を入力してください');return;}const saved=await ClassDB.put('records',{...(item||{}),id:item?.id||ClassDB.uid('occasionalItem'),type:'occasionalItem',classId:classItem.id,studentId:null,date:dueDate,dueDate,title,archived:item?.archived||false});state.toolDraft.occasionalId=saved.id;showToast('提出物を保存しました');renderOccasional();});
    document.getElementById('occasional-archive')?.addEventListener('click',async()=>{await ClassDB.put('records',{...item,archived:!item.archived});showToast(item.archived?'提出物を再開しました':'提出物を完結しました');renderOccasional();});
    document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>toggleOccasionalStudent(button.dataset.toolStudent,item)));
  }

  async function toggleOccasionalStudent(studentId,item){
    if(!item||item.archived)return;
    const id=`occasional_${item.id}_${studentId}`;const existing=await ClassDB.get('records',id);
    if(!existing||existing.status!=='submitted'){await ClassDB.put('records',{...(existing||{}),id,type:'occasionalSubmission',classId:selectedClass().id,studentId,date:today(),dueDate:item.dueDate,title:item.title,itemId:item.id,status:'submitted'});showToast('提出済みにしました');renderOccasional();return;}
    const student=await ClassDB.get('students',studentId);
    openDialog(`<h2>提出済みを取り消しますか</h2><p>${esc(student.name)}の「${esc(item.title)}」を未提出へ戻します。</p><div class="dialog-actions"><button type="button" class="button" id="occasional-cancel">戻る</button><button type="button" class="button danger" id="occasional-confirm">提出を取り消す</button></div>`);
    document.getElementById('occasional-cancel').addEventListener('click',closeDialog);
    document.getElementById('occasional-confirm').addEventListener('click',async()=>{await ClassDB.put('records',{...existing,status:'unsubmitted'});closeDialog();showToast('未提出へ戻しました');renderOccasional();});
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
    const groups=units.map(unit=>`<section class="support-unit"><h2>${esc(unit.name)}</h2><div class="support-pupils">${roster.filter(row=>(unit.memberIds||[]).includes(row.student.id)).map(supportButton).join('')||'<span class="muted">児童なし</span>'}</div></section>`).join('');
    const unassigned=roster.filter(row=>!unitForStudent(row.student.id));
    app.innerHTML=teacherToolShell('単元設定',`${pupilDateNav(draft.date,'support-prev','support-next')}<section class="panel"><div class="button-row" style="justify-content:space-between"><div><h1>${esc(classItem.name)}の単元設定</h1><p class="muted">教科と現在の学習単元を確認し、児童を選ぶと学習記録を入力できます。</p></div><button type="button" class="button" id="edit-units">単元名を編集</button></div><div class="field" style="max-width:260px"><label for="support-subject">教科</label><select class="select" id="support-subject">${subjects.map(subject=>`<option ${subject===draft.subject?'selected':''}>${subject}</option>`).join('')}</select></div></section><div class="support-unit-grid">${groups}${unassigned.length?`<section class="support-unit alert"><h2>単元未設定</h2><div class="support-pupils">${unassigned.map(supportButton).join('')}</div></section>`:''}</div>`);
    wireToolHome();document.getElementById('support-prev').addEventListener('click',()=>{draft.date=moveDate(draft.date,-1);renderSupport();});document.getElementById('support-next').addEventListener('click',()=>{draft.date=moveDate(draft.date,1);renderSupport();});
    document.getElementById('support-subject').addEventListener('change',event=>{draft.subject=event.target.value;renderSupport();});document.getElementById('edit-units').addEventListener('click',renderUnitManager);
    document.querySelectorAll('[data-support-student]').forEach(button=>button.addEventListener('click',()=>openSupportRecord(button.dataset.supportStudent)));
  }

  async function renderUnitManager(){
    if(!teacherActive()){renderPupil();return;}state.route='teacher-unit-manager';const classItem=selectedClass();const draft=supportDraft();const roster=await rosterForClass(classItem.id);const units=await ensureSupportUnits(classItem.id,draft.subject);
    const assigned=new Set(units.flatMap(unit=>unit.memberIds||[]));
    app.innerHTML=teacherToolShell('現在の学習単元',`<section class="panel"><div class="button-row" style="justify-content:space-between"><div><h1>${esc(draft.subject)}・現在の学習単元</h1><p class="muted">児童をドラッグして移動できます。児童をタップしてから移動先をタップする方法も使えます。</p></div><button type="button" class="button primary" id="add-unit">単元を追加</button></div></section><div class="unit-board">${units.map(unit=>unitEditorHtml(unit,roster)).join('')}<section class="unit-column" data-unit-drop=""><h2>未設定</h2><div class="unit-students">${roster.filter(row=>!assigned.has(row.student.id)).map(row=>unitStudentHtml(row.student)).join('')||'<span class="muted">児童なし</span>'}</div></section></div><div class="button-row end section"><button type="button" class="button primary" id="units-done">記録画面へ戻る</button></div>`);
    wireToolHome();document.getElementById('units-done').addEventListener('click',renderSupport);document.getElementById('add-unit').addEventListener('click',()=>openUnitEditor());
    document.querySelectorAll('[data-edit-unit]').forEach(button=>button.addEventListener('click',()=>openUnitEditor(units.find(unit=>unit.id===button.dataset.editUnit))));
    let movingStudentId=null;
    document.querySelectorAll('[data-unit-student]').forEach(button=>{button.addEventListener('dragstart',event=>{movingStudentId=button.dataset.unitStudent;event.dataTransfer.setData('text/plain',movingStudentId);});button.addEventListener('click',()=>{movingStudentId=button.dataset.unitStudent;document.querySelectorAll('[data-unit-student]').forEach(item=>item.classList.toggle('selected',item===button));showToast('移動先の単元を選んでください');});});
    document.querySelectorAll('[data-unit-drop]').forEach(column=>{column.addEventListener('dragover',event=>event.preventDefault());column.addEventListener('drop',async event=>{event.preventDefault();await moveSupportStudent(event.dataTransfer.getData('text/plain')||movingStudentId,column.dataset.unitDrop,units);});column.addEventListener('click',async event=>{if(event.target.closest('[data-unit-student],[data-edit-unit]')||!movingStudentId)return;await moveSupportStudent(movingStudentId,column.dataset.unitDrop,units);});});
  }

  function unitEditorHtml(unit,roster){return `<section class="unit-column" data-unit-drop="${unit.id}"><div class="button-row" style="justify-content:space-between"><h2>${esc(unit.name)}</h2><button type="button" class="detail-button" data-edit-unit="${unit.id}">単元名を編集</button></div><div class="unit-students">${roster.filter(row=>(unit.memberIds||[]).includes(row.student.id)).map(row=>unitStudentHtml(row.student)).join('')||'<span class="muted">ここへドラッグ</span>'}</div></section>`;}
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

  async function saveSupportRecord(studentId,unit,categories,tags){const draft=supportDraft();await ClassDB.put('records',{id:ClassDB.uid('supportRecord'),type:'supportRecord',classId:selectedClass().id,studentId,date:draft.date,subject:draft.subject,unitId:unit?.id||null,unit:unit?.name||'単元未設定',categories,tags,text:document.getElementById('support-text').value.trim()});showToast('支援級記録を保存しました');}

  async function seatingDraft(){
    const classItem=selectedClass();const roster=await rosterForClass(classItem.id);let draft=state.toolDraft.seating;
    if(!draft||draft.classId!==classItem.id){
      const saved=await ClassDB.getMeta(`seatingSettings_${classItem.id}`,null);const cols=saved?.cols||6;const rows=saved?.rows||Math.max(1,Math.ceil(roster.length/cols));const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='seatingPlan'&&!item.deletedAt).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
      draft={classId:classItem.id,cols,rows,emptySeats:saved?.emptySeats||[],genderMode:saved?.genderMode||'checker',groupDefs:saved?.groupDefs||[{id:'A',name:'A'},{id:'B',name:'B'},{id:'C',name:'C'}],conditions:saved?.conditions||{},layout:records[0]?.layout||[],previousLayout:records[0]?.layout||[],history:records.slice(0,10)};state.toolDraft.seating=draft;
    }
    if(!Array.isArray(draft.groupDefs))draft.groupDefs=[{id:'A',name:'A'},{id:'B',name:'B'},{id:'C',name:'C'}];
    roster.forEach(row=>{draft.conditions[row.student.id]={vision:0,groups:[],leader:false,window:false,hall:false,front:false,back:false,care:'',...(draft.conditions[row.student.id]||{})};});
    return{draft,roster};
  }

  async function saveSeatingSettings(draft){await ClassDB.setMeta(`seatingSettings_${draft.classId}`,{cols:draft.cols,rows:draft.rows,emptySeats:draft.emptySeats,genderMode:draft.genderMode,groupDefs:draft.groupDefs,conditions:draft.conditions});}

  function seatingGroupEditorHtml(draft){return`<div class="seat-group-editor"><div><strong>分散グループ</strong><p class="muted small">同じグループの児童が近くならないように配置します。名称は自由に変更できます。</p></div><div class="seat-group-defs">${draft.groupDefs.map(group=>`<div class="seat-group-def"><label><span>名称</span><input class="input" data-seat-group-name="${esc(group.id)}" value="${esc(group.name)}" maxlength="20"></label><button type="button" class="detail-button" data-remove-seat-group="${esc(group.id)}" aria-label="${esc(group.name)}を削除">削除</button></div>`).join('')}</div><button type="button" class="button" id="seat-add-group">グループを追加</button></div>`;}

  async function renderSeating(){
    if(!teacherActive()){renderPupil();return;}state.route='teacher-seating';state.activeTool='seating';const classItem=selectedClass();applyClassTheme(classItem);const {draft,roster}=await seatingDraft();
    const total=draft.cols*draft.rows;const valid=total-draft.emptySeats.length;const conditions=seatingGroupEditorHtml(draft)+roster.map(row=>seatingConditionHtml(row,draft.conditions[row.student.id],draft.groupDefs)).join('');
    app.innerHTML=teacherToolShell('席替え',`<section class="panel seat-controls"><div class="button-row" style="justify-content:space-between"><div><h1>${esc(classItem.name)}の席替え</h1><p class="muted">名簿はクラス設定と共通です。条件を設定して自動配置し、必要ならドラッグで調整できます。</p></div><button type="button" class="button primary" id="seat-generate">席替えを実行</button></div><div class="form-grid section"><div class="field"><label for="seat-cols">横の列数</label><input class="input" id="seat-cols" type="number" min="1" max="12" value="${draft.cols}"></div><div class="field"><label for="seat-rows">縦の行数</label><input class="input" id="seat-rows" type="number" min="1" max="12" value="${draft.rows}"></div><div class="field"><label for="seat-gender">男女配置</label><select class="select" id="seat-gender"><option value="checker" ${draft.genderMode==='checker'?'selected':''}>市松模様</option><option value="neighbor" ${draft.genderMode==='neighbor'?'selected':''}>左右を男女ペア</option><option value="random" ${draft.genderMode==='random'?'selected':''}>指定なし</option></select></div><div class="field" style="align-self:end"><button type="button" class="button" id="seat-grid-apply">座席数を適用</button></div></div><p class="small muted">${roster.length}人・有効席 ${valid}席。下の座席を押すと空席を切り替えます。</p><div class="seat-empty-grid" style="--seat-cols:${draft.cols}">${Array.from({length:total},(_,index)=>`<button type="button" class="seat-empty-toggle ${draft.emptySeats.includes(index)?'empty':''}" data-empty-seat="${index}">${draft.emptySeats.includes(index)?'空席':index+1}</button>`).join('')}</div></section><details class="panel seat-conditions"><summary><strong>配慮・グループ設定</strong><span class="muted small">　視力、位置、離す・近く・ペア、グループ、リーダー</span></summary><div class="seat-condition-list section">${conditions||'<p class="muted">名簿が未登録です。</p>'}</div><div class="button-row end section"><button type="button" class="button primary" id="seat-save-conditions">配慮設定を保存</button></div></details><section class="panel section seat-print"><div class="button-row no-print" style="justify-content:space-between"><div><h2>座席表</h2><p class="muted">黒板側が上です。</p></div><div class="button-row"><button type="button" class="button" id="seat-save-plan">履歴に保存</button><button type="button" class="button" id="seat-apply-daily">日常画面へ反映</button><button type="button" class="button primary" id="seat-print">印刷</button></div></div><div class="blackboard">黒板</div><div id="seat-layout" class="seat-layout" style="--seat-cols:${draft.cols}">${seatingLayoutHtml(draft,roster)}</div><div id="seat-warnings">${seatingWarningsHtml(draft,roster)}</div></section><section class="panel section seat-history"><h2>席替え履歴</h2><div class="list">${draft.history.map((item,index)=>`<div class="list-row"><div><div class="row-title">${esc(item.label||jpDate(item.date))}</div><div class="row-meta">${esc(jpDate(item.date))}・${item.cols}列×${item.rows}行</div></div><button type="button" class="button" data-load-seat-plan="${index}">表示</button></div>`).join('')||'<p class="muted">保存した席替えはありません。</p>'}</div></section>`);
    wireToolHome();wireSeating(draft,roster);
  }

  function seatingConditionHtml(row,condition,groupDefs){return `<div class="seat-condition-row" data-seat-student="${row.student.id}"><div><strong>${row.enrollment.number||'―'}　${esc(row.student.name)}</strong><div class="row-meta">${row.enrollment.gender==='female'?'女':row.enrollment.gender==='male'?'男':'性別未設定'}</div></div><select class="select" data-seat-field="vision" aria-label="視力配慮"><option value="0" ${!condition.vision?'selected':''}>視力配慮なし</option><option value="1" ${condition.vision===1?'selected':''}>前1列</option><option value="2" ${condition.vision===2?'selected':''}>前2列・中央</option></select><div class="seat-checks">${groupDefs.map(group=>`<label><input type="checkbox" data-seat-group="${esc(group.id)}" ${condition.groups.includes(group.id)?'checked':''}>${esc(group.name)}</label>`).join('')}<label><input type="checkbox" data-seat-field="leader" ${condition.leader?'checked':''}>リーダー</label></div><div class="seat-checks"><label><input type="checkbox" data-seat-field="window" ${condition.window?'checked':''}>窓側</label><label><input type="checkbox" data-seat-field="hall" ${condition.hall?'checked':''}>廊下側</label><label><input type="checkbox" data-seat-field="front" ${condition.front?'checked':''}>前列</label><label><input type="checkbox" data-seat-field="back" ${condition.back?'checked':''}>後列</label></div><input class="input" data-seat-field="care" value="${esc(condition.care)}" placeholder="例：3番と離す、5番の近く、7番とペア"></div>`;}

  function readSeatingConditions(draft){document.querySelectorAll('[data-seat-group-name]').forEach(input=>{const group=draft.groupDefs.find(item=>item.id===input.dataset.seatGroupName);if(group)group.name=input.value.trim()||'名称未設定';});document.querySelectorAll('[data-seat-student]').forEach(row=>{const condition=draft.conditions[row.dataset.seatStudent];condition.vision=Number(row.querySelector('[data-seat-field="vision"]').value);condition.groups=[...row.querySelectorAll('[data-seat-group]:checked')].map(input=>input.dataset.seatGroup);['leader','window','hall','front','back'].forEach(field=>condition[field]=row.querySelector(`[data-seat-field="${field}"]`).checked);condition.care=row.querySelector('[data-seat-field="care"]').value.trim();});draft.genderMode=document.getElementById('seat-gender').value;}

  function seatingLayoutHtml(draft,roster){const byId=new Map(roster.map(row=>[row.student.id,row])),groupNames=new Map(draft.groupDefs.map(group=>[group.id,group.name]));return Array.from({length:draft.cols*draft.rows},(_,index)=>{if(draft.emptySeats.includes(index))return`<div class="seat-cell empty"><span>空席</span></div>`;const studentId=draft.layout[index];const row=byId.get(studentId);if(!row)return`<div class="seat-cell vacant" data-seat-index="${index}"><span>${index+1}</span></div>`;const condition=draft.conditions[studentId];const previous=draft.previousLayout[index]===studentId;const marks=[condition.leader?'★':'',condition.vision?'眼':'',...(condition.groups||[]).map(id=>groupNames.get(id)||id)].filter(Boolean).join(' ');return`<button type="button" draggable="true" class="seat-cell occupied ${row.enrollment.gender||''} ${previous?'previous':''}" data-seat-index="${index}"><small>${row.enrollment.number||''}</small><strong>${esc(row.student.name)}</strong><span>${esc(marks)}</span></button>`;}).join('');}

  function seatPosition(index,draft){return{row:Math.floor(index/draft.cols),col:index%draft.cols};}
  function isGenderPairSeat(first,second,draft){const a=seatPosition(first,draft),b=seatPosition(second,draft);return a.row===b.row&&Math.abs(a.col-b.col)===1&&Math.floor(a.col/2)===Math.floor(b.col/2);}
  function isVisionTwoSeat(pos,draft){const min=Math.max(0,Math.floor(draft.cols/2)-1),max=Math.min(draft.cols-1,Math.ceil(draft.cols/2));return pos.row<2&&pos.col>=min&&pos.col<=max;}
  function positionPenalty(row,index,draft){const pos=seatPosition(index,draft),condition=draft.conditions[row.student.id];let score=0;if(condition.vision===1&&pos.row!==0)score+=12000+pos.row*500;if(condition.vision===2&&!isVisionTwoSeat(pos,draft))score+=8000+pos.row*300+Math.abs(pos.col-(draft.cols-1)/2)*200;if(condition.front&&pos.row!==0)score+=10000+pos.row*400;if(condition.back&&pos.row!==draft.rows-1)score+=7000+Math.abs(draft.rows-1-pos.row)*300;if(condition.window&&pos.col!==0)score+=14000+pos.col*500;if(condition.hall&&pos.col!==draft.cols-1)score+=14000+Math.abs(draft.cols-1-pos.col)*500;if(draft.genderMode==='checker'){const expected=(pos.row+pos.col)%2===0?'male':'female';if(row.enrollment.gender&&row.enrollment.gender!==expected)score+=200;}return score;}
  function toHalfWidth(value){return String(value||'').replace(/[０-９]/g,char=>String.fromCharCode(char.charCodeAt(0)-0xFEE0));}
  function parseSeatCare(value){const result={separate:[],near:[],pair:[]};const text=toHalfWidth(value);for(const match of text.matchAll(/(\d+)番?と離す/g))result.separate.push(Number(match[1]));for(const match of text.matchAll(/(\d+)番?[のにと]近く/g))result.near.push(Number(match[1]));for(const match of text.matchAll(/(\d+)番?と(?:ペア|隣)/g))result.pair.push(Number(match[1]));return result;}

  function seatingScore(layout,draft,roster){const idByNumber=new Map(roster.map(row=>[Number(row.enrollment.number),row.student.id]));const indexById=new Map();layout.forEach((id,index)=>{if(id)indexById.set(id,index);});let score=0;const distance=(a,b)=>{const x=seatPosition(a,draft),y=seatPosition(b,draft);return Math.abs(x.row-y.row)+Math.abs(x.col-y.col);};
    roster.forEach(row=>{const id=row.student.id,index=indexById.get(id);if(index===undefined)return;const condition=draft.conditions[id];score+=positionPenalty(row,index,draft);if(draft.previousLayout[index]===id)score+=180;const care=parseSeatCare(condition.care);care.separate.forEach(number=>{const target=indexById.get(idByNumber.get(number));if(target!==undefined){const d=distance(index,target);if(d<2)score+=800;else if(d<4)score+=120;}});care.near.forEach(number=>{const target=indexById.get(idByNumber.get(number));if(target!==undefined&&distance(index,target)>3)score+=250;});care.pair.forEach(number=>{const target=indexById.get(idByNumber.get(number));if(target!==undefined&&distance(index,target)!==1)score+=500;});});
    for(let i=0;i<roster.length;i++)for(let j=i+1;j<roster.length;j++){const a=roster[i],b=roster[j],ai=indexById.get(a.student.id),bi=indexById.get(b.student.id);if(ai===undefined||bi===undefined)continue;const d=distance(ai,bi),ac=draft.conditions[a.student.id],bc=draft.conditions[b.student.id];if(ac.groups.some(group=>bc.groups.includes(group))){if(d<2)score+=700;else if(d<3)score+=150;}if(ac.leader&&bc.leader&&d<3)score+=220;if(draft.genderMode==='neighbor'&&isGenderPairSeat(ai,bi,draft)&&a.enrollment.gender&&a.enrollment.gender===b.enrollment.gender)score+=1800;}
    return score;
  }

  function shuffled(values){const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;}
  function seatingPriority(row,draft){const condition=draft.conditions[row.student.id];return Number(condition.window||condition.hall)*5+Number(condition.vision>0||condition.front||condition.back)*4+Number(Boolean(condition.care))*2+condition.groups.length+Number(condition.leader);}
  function generateSeating(draft,roster){const valid=Array.from({length:draft.cols*draft.rows},(_,index)=>index).filter(index=>!draft.emptySeats.includes(index));if(roster.length>valid.length)return null;let best=null,bestScore=Infinity;for(let attempt=0;attempt<900;attempt++){const layout=Array(draft.cols*draft.rows).fill(null),available=shuffled(valid),ordered=shuffled(roster).sort((a,b)=>seatingPriority(b,draft)-seatingPriority(a,draft));for(const row of ordered){let bestSeat=available[0],bestPosition=Infinity;for(const seat of available){const score=positionPenalty(row,seat,draft);if(score<bestPosition){bestPosition=score;bestSeat=seat;}}layout[bestSeat]=row.student.id;available.splice(available.indexOf(bestSeat),1);}const score=seatingScore(layout,draft,roster);if(score<bestScore){bestScore=score;best=layout;if(score===0)break;}}return best;}

  function seatingConditionWarnings(draft,roster){
    const warnings=[];const byId=new Map(roster.map(row=>[row.student.id,row]));const idByNumber=new Map(roster.map(row=>[Number(row.enrollment.number),row.student.id]));const groupNames=new Map(draft.groupDefs.map(group=>[group.id,group.name]));const indexById=new Map();draft.layout.forEach((id,index)=>{if(id)indexById.set(id,index);});const name=id=>byId.get(id)?.student.name||'不明';const distance=(a,b)=>{const x=seatPosition(a,draft),y=seatPosition(b,draft);return Math.abs(x.row-y.row)+Math.abs(x.col-y.col);};
    roster.forEach(row=>{const id=row.student.id,index=indexById.get(id);if(index===undefined){warnings.push(`${row.student.name}：座席に配置されていません`);return;}const pos=seatPosition(index,draft),condition=draft.conditions[id];if(condition.vision===1&&pos.row!==0)warnings.push(`${row.student.name}：視力配慮「前1列」を満たしていません`);if(condition.vision===2&&!isVisionTwoSeat(pos,draft))warnings.push(`${row.student.name}：視力配慮「前2列・中央」を満たしていません`);if(condition.front&&pos.row!==0)warnings.push(`${row.student.name}：「前列」を満たしていません`);if(condition.back&&pos.row!==draft.rows-1)warnings.push(`${row.student.name}：「後列」を満たしていません`);if(condition.window&&pos.col!==0)warnings.push(`${row.student.name}：「窓側」を満たしていません`);if(condition.hall&&pos.col!==draft.cols-1)warnings.push(`${row.student.name}：「廊下側」を満たしていません`);const care=parseSeatCare(condition.care);[['離す',care.separate],['近く',care.near],['ペア',care.pair]].forEach(([label,numbers])=>numbers.forEach(number=>{const targetId=idByNumber.get(number),target=indexById.get(targetId);if(!targetId){warnings.push(`${row.student.name}：「${number}番と${label}」の相手が見つかりません`);return;}if(target===undefined)return;const d=distance(index,target);if(label==='離す'&&d<2)warnings.push(`${row.student.name}と${name(targetId)}：「離す」を満たしていません`);if(label==='近く'&&d>3)warnings.push(`${row.student.name}と${name(targetId)}：「近く」を満たしていません`);if(label==='ペア'&&d!==1)warnings.push(`${row.student.name}と${name(targetId)}：「ペア」を満たしていません`);}));});
    for(let i=0;i<roster.length;i++)for(let j=i+1;j<roster.length;j++){const a=roster[i],b=roster[j],ai=indexById.get(a.student.id),bi=indexById.get(b.student.id);if(ai===undefined||bi===undefined)continue;const d=distance(ai,bi),ac=draft.conditions[a.student.id],bc=draft.conditions[b.student.id];const shared=ac.groups.filter(group=>bc.groups.includes(group));if(shared.length&&d<3)warnings.push(`${shared.map(id=>groupNames.get(id)||id).join('・')}：${a.student.name}と${b.student.name}が近すぎます`);if(ac.leader&&bc.leader&&d<3)warnings.push(`リーダー配置：${a.student.name}と${b.student.name}が近すぎます`);}
    if(draft.genderMode==='checker'){const names=roster.filter(row=>{const index=indexById.get(row.student.id);if(index===undefined||!row.enrollment.gender)return false;const pos=seatPosition(index,draft);return row.enrollment.gender!==((pos.row+pos.col)%2===0?'male':'female');}).map(row=>row.student.name);if(names.length)warnings.push(`男女の市松配置：${names.join('、')}の位置が模様と一致していません`);}
    if(draft.genderMode==='neighbor'){for(let row=0;row<draft.rows;row++)for(let col=0;col<draft.cols-1;col+=2){const a=draft.layout[row*draft.cols+col],b=draft.layout[row*draft.cols+col+1];if(!a||!b)continue;const ar=byId.get(a),br=byId.get(b);if(ar?.enrollment.gender&&ar.enrollment.gender===br?.enrollment.gender)warnings.push(`男女ペア配置（${col+1}・${col+2}列）：${name(a)}と${name(b)}が同性です`);}}
    return[...new Set(warnings)];
  }

  function seatingWarningsHtml(draft,roster){if(!draft.layout?.some(Boolean))return'<p class="muted no-print">「席替えを実行」で座席を作成します。</p>';const warnings=seatingConditionWarnings(draft,roster);const same=draft.layout.filter((id,index)=>id&&draft.previousLayout[index]===id).length;const previous=same?`<div class="seat-previous-info">前回と同じ席：${same}人（黄色枠）</div>`:'';return warnings.length?`<div class="seat-warning no-print"><strong>満たせていない条件 ${warnings.length}件</strong><ul>${warnings.map(text=>`<li>${esc(text)}</li>`).join('')}</ul>${previous}</div>`:`<div class="seat-ok no-print">設定した条件を満たしています。${previous}</div>`;}

  function wireSeating(draft,roster){let dragFrom=null;document.querySelectorAll('[data-empty-seat]').forEach(button=>button.addEventListener('click',async()=>{const index=Number(button.dataset.emptySeat);draft.emptySeats=draft.emptySeats.includes(index)?draft.emptySeats.filter(item=>item!==index):[...draft.emptySeats,index];draft.layout=[];await saveSeatingSettings(draft);renderSeating();}));
    document.getElementById('seat-add-group').addEventListener('click',async()=>{readSeatingConditions(draft);draft.groupDefs.push({id:ClassDB.uid('seatGroup'),name:`グループ${draft.groupDefs.length+1}`});await saveSeatingSettings(draft);renderSeating();});
    document.querySelectorAll('[data-remove-seat-group]').forEach(button=>button.addEventListener('click',()=>{readSeatingConditions(draft);const id=button.dataset.removeSeatGroup,name=draft.groupDefs.find(item=>item.id===id)?.name||'このグループ';openDialog(`<h2>${esc(name)}を削除しますか</h2><p>児童に付けたこのグループの設定も外れます。</p><div class="dialog-actions"><button type="button" class="button" id="seat-group-delete-cancel">キャンセル</button><button type="button" class="button danger" id="seat-group-delete-confirm">削除</button></div>`);document.getElementById('seat-group-delete-cancel').addEventListener('click',closeDialog);document.getElementById('seat-group-delete-confirm').addEventListener('click',async()=>{draft.groupDefs=draft.groupDefs.filter(item=>item.id!==id);Object.values(draft.conditions).forEach(condition=>condition.groups=condition.groups.filter(groupId=>groupId!==id));await saveSeatingSettings(draft);closeDialog();renderSeating();});}));
    document.getElementById('seat-grid-apply').addEventListener('click',async()=>{readSeatingConditions(draft);draft.cols=Math.max(1,Math.min(12,Number(document.getElementById('seat-cols').value)||6));draft.rows=Math.max(1,Math.min(12,Number(document.getElementById('seat-rows').value)||6));draft.emptySeats=draft.emptySeats.filter(index=>index<draft.cols*draft.rows);draft.layout=[];await saveSeatingSettings(draft);renderSeating();});document.getElementById('seat-save-conditions').addEventListener('click',async()=>{readSeatingConditions(draft);await saveSeatingSettings(draft);showToast('配慮設定を保存しました');});
    document.getElementById('seat-generate').addEventListener('click',async()=>{readSeatingConditions(draft);await saveSeatingSettings(draft);const layout=generateSeating(draft,roster);if(!layout){showToast('児童数より有効席が少ないため作成できません');return;}draft.layout=layout;renderSeating();showToast('座席を作成しました');});
    document.querySelectorAll('#seat-layout [data-seat-index]').forEach(cell=>{cell.addEventListener('dragstart',event=>{dragFrom=Number(cell.dataset.seatIndex);event.dataTransfer.effectAllowed='move';});cell.addEventListener('dragover',event=>event.preventDefault());cell.addEventListener('drop',event=>{event.preventDefault();const target=Number(cell.dataset.seatIndex);if(dragFrom===null||draft.emptySeats.includes(target))return;[draft.layout[dragFrom],draft.layout[target]]=[draft.layout[target],draft.layout[dragFrom]];renderSeating();});});
    document.getElementById('seat-save-plan').addEventListener('click',()=>{if(!draft.layout?.some(Boolean)){showToast('先に席替えを実行してください');return;}openDialog(`<h2>席替え履歴に保存</h2><form id="seat-plan-form"><div class="field"><label for="seat-plan-label">履歴名</label><input class="input" id="seat-plan-label" value="${esc(selectedClass().name)} ${new Date().getMonth()+1}月の席替え" required></div><div class="dialog-actions"><button type="button" class="button" id="seat-plan-cancel">キャンセル</button><button type="submit" class="button primary">保存</button></div></form>`);document.getElementById('seat-plan-cancel').addEventListener('click',closeDialog);document.getElementById('seat-plan-form').addEventListener('submit',async event=>{event.preventDefault();await ClassDB.put('records',{id:ClassDB.uid('seatingPlan'),type:'seatingPlan',classId:draft.classId,studentId:null,date:today(),label:document.getElementById('seat-plan-label').value.trim(),cols:draft.cols,rows:draft.rows,emptySeats:[...draft.emptySeats],layout:[...draft.layout]});draft.previousLayout=[...draft.layout];state.toolDraft.seating=null;closeDialog();showToast('席替え履歴に保存しました');renderSeating();});});
    document.getElementById('seat-apply-daily').addEventListener('click',async()=>{if(!draft.layout?.some(Boolean)){showToast('先に席替えを実行してください');return;}const classItem=selectedClass();const saved=await ClassDB.put('classes',{...classItem,dailyStudentOrder:draft.layout.filter(Boolean),activeSeatLayout:[...draft.layout],activeSeatCols:draft.cols,activeSeatRows:draft.rows,activeSeatEmptySeats:[...draft.emptySeats],activeSeatAppliedAt:ClassDB.now()});state.classes=state.classes.map(item=>item.id===saved.id?saved:item);showToast('座席の形と空席を日常画面へ反映しました');});document.getElementById('seat-print').addEventListener('click',()=>window.print());document.querySelectorAll('[data-load-seat-plan]').forEach(button=>button.addEventListener('click',()=>{const item=draft.history[Number(button.dataset.loadSeatPlan)];draft.cols=item.cols;draft.rows=item.rows;draft.emptySeats=[...(item.emptySeats||[])];draft.layout=[...item.layout];renderSeating();}));
  }

  function currentTermRange(){
    const first=today()<=state.year.firstTermEnd;
    return{label:first?'前期':'後期',start:first?state.year.startDate:moveDate(state.year.firstTermEnd,1),end:first?state.year.firstTermEnd:state.year.endDate};
  }

  async function renderReports(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-reports';state.activeTool='reports';
    const classItem=selectedClass();applyClassTheme(classItem);const term=currentTermRange();
    const all=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>['memo','notebookAssessment','supportRecord'].includes(item.type)&&item.date>=term.start&&item.date<=term.end&&!item.deletedAt);
    const cards=await teacherRosterCards(classItem.id,[],{status:(_,row)=>{const count=all.filter(item=>item.studentId===row.student.id).length;return count?`${term.label} ${count}件`:'素材なし';},statusClass:(_,row)=>all.some(item=>item.studentId===row.student.id)?'good':'warn'});
    app.innerHTML=teacherToolShell('所見素材',`<section class="panel"><h1>${esc(classItem.name)}・${term.label}</h1><p class="muted">児童を選ぶと、今学期の児童メモ・ノート評価・学習記録を自動選択します。</p></section>${cards}`);
    wireToolHome();wireStudentDetails();document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>renderReportBuilder(button.dataset.toolStudent)));
  }

  async function renderReportBuilder(studentId){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-report-builder';const classItem=selectedClass();const student=await ClassDB.get('students',studentId);if(!student){renderReports();return;}
    const term=currentTermRange();const records=(await ClassDB.getAllByIndex('records','studentId',studentId)).filter(item=>item.classId===classItem.id&&['memo','notebookAssessment','supportRecord'].includes(item.type)&&item.date>=term.start&&item.date<=term.end&&!item.deletedAt).sort((a,b)=>a.date.localeCompare(b.date)||a.updatedAt.localeCompare(b.updatedAt));
    app.innerHTML=teacherToolShell('所見素材',`<div class="button-row" style="justify-content:space-between"><button type="button" class="button" id="reports-back">一覧へ戻る</button><div><h1>${esc(student.name)}</h1><p class="muted">${esc(classItem.name)}・${term.label}</p></div></div><section class="panel section"><div class="button-row" style="justify-content:space-between"><div><h2>使用する記録</h2><p class="muted">すべて選択済みです。不要な記録だけ外してください。</p></div><div class="button-row"><button type="button" class="button" id="report-all">すべて選択</button><button type="button" class="button" id="report-none">すべて外す</button></div></div><div class="report-records">${records.map(reportRecordChoiceHtml).join('')||'<p class="muted">この期間の対象記録はありません。</p>'}</div></section><section class="report-columns section"><div class="panel"><div class="button-row" style="justify-content:space-between"><h2>所見素材</h2><div class="button-row"><button type="button" class="button" data-copy-report="materials">コピー</button><button type="button" class="button" data-save-report="materials">TXT保存</button></div></div><textarea class="textarea report-output" id="report-materials" readonly></textarea></div><div class="panel"><div class="button-row" style="justify-content:space-between"><h2>AI用プロンプト</h2><div class="button-row"><button type="button" class="button" data-copy-report="prompt">コピー</button><button type="button" class="button" data-save-report="prompt">TXT保存</button></div></div><textarea class="textarea report-output" id="report-prompt" readonly></textarea></div></section>`);
    wireToolHome();document.getElementById('reports-back').addEventListener('click',renderReports);
    const refresh=async()=>{const selected=records.filter(record=>document.querySelector(`[data-report-record="${record.id}"]`)?.checked);const materials=buildReportMaterials(selected,student,classItem,term);const template=await ClassDB.getMeta('reportPromptTemplate',defaultReportPrompt());document.getElementById('report-materials').value=materials;document.getElementById('report-prompt').value=fillReportPrompt(template,{name:student.name,className:classItem.name,term:term.label,materials});};
    document.querySelectorAll('[data-report-record]').forEach(input=>input.addEventListener('change',refresh));
    document.getElementById('report-all').addEventListener('click',()=>{document.querySelectorAll('[data-report-record]').forEach(input=>input.checked=true);refresh();});document.getElementById('report-none').addEventListener('click',()=>{document.querySelectorAll('[data-report-record]').forEach(input=>input.checked=false);refresh();});
    document.querySelectorAll('[data-copy-report]').forEach(button=>button.addEventListener('click',async()=>{const area=document.getElementById(button.dataset.copyReport==='materials'?'report-materials':'report-prompt');await copyText(area.value);showToast('コピーしました');}));
    document.querySelectorAll('[data-save-report]').forEach(button=>button.addEventListener('click',()=>{const kind=button.dataset.saveReport;const area=document.getElementById(kind==='materials'?'report-materials':'report-prompt');downloadText(`${student.name}_${term.label}_${kind==='materials'?'所見素材':'AI用プロンプト'}.txt`,area.value);}));
    await refresh();
  }

  function reportRecordChoiceHtml(record){
    const labels={memo:'児童メモ',notebookAssessment:'ノート評価',supportRecord:'学習記録'};let detail='';
    if(record.type==='memo')detail=`${record.subject||'教科なし'}　${(record.tags||[]).join('・')}${record.text?`　${record.text}`:''}`;
    if(record.type==='notebookAssessment')detail=`${record.subject||''}　${record.unit||''}　${record.title||''}　${record.grade||record.status||''}`;
    if(record.type==='supportRecord')detail=`${record.subject||''}　${record.unit||''}　${flattenSupportTags(record).join('・')}${record.text?`　${record.text}`:''}`;
    return `<label class="report-record"><input type="checkbox" data-report-record="${record.id}" checked><span><strong>${esc(shortJpDate(record.date))}　${labels[record.type]}</strong><small>${esc(detail.trim())}</small></span></label>`;
  }

  function flattenSupportTags(record){return Object.values(record.tags||{}).flat().filter(Boolean);}
  function assessmentLabel(record){return record.grade||({absent:'欠席',unsubmitted:'未提出'}[record.status]||record.status||'未評価');}
  function buildReportMaterials(records,student,classItem,term){
    const lines=[`${student.name}　${classItem.name}　${term.label} 所見素材`];
    const memos=records.filter(item=>item.type==='memo');
    if(memos.length){lines.push('\n【児童メモ】');memos.forEach(item=>lines.push(`・${slashDate(item.date)} ${item.subject||'教科なし'}：${[...(item.tags||[]),item.text].filter(Boolean).join('／')}`));}
    const assessments=records.filter(item=>item.type==='notebookAssessment');
    if(assessments.length){lines.push('\n【ノート評価】');const subjects=[...new Set(assessments.map(item=>item.subject||'教科なし'))];subjects.forEach(subject=>{const items=assessments.filter(item=>(item.subject||'教科なし')===subject);const counts={};items.forEach(item=>{const label=assessmentLabel(item);counts[label]=(counts[label]||0)+1;});const tendency=Object.entries(counts).map(([label,count])=>`${label} ${count}件`).join('、');const details=items.map(item=>`${item.unit||'単元未設定'}${item.title?`「${item.title}」`:''}（${assessmentLabel(item)}）`).join('、');lines.push(`・${subject}：${tendency}\n  主な単元・評価：${details}`);});}
    const support=records.filter(item=>item.type==='supportRecord');
    if(support.length){lines.push('\n【学習記録】');support.forEach(item=>{const categories=(item.categories||[]).join('・');const detail=[categories,...flattenSupportTags(item),item.text].filter(Boolean).join('／');lines.push(`・${slashDate(item.date)} ${item.subject||'教科なし'}「${item.unit||'単元未設定'}」：${detail||'記録あり'}`);});}
    if(records.length===0)lines.push('\n（選択された記録はありません）');
    return lines.join('\n');
  }

  function defaultReportPrompt(){return `あなたは小学校の学級担任を支援する文章作成者です。\n以下の所見素材だけを根拠に、{name}の{term}の所見文案を作成してください。\n\n条件：\n・素材にない事実は加えない\n・タグや箇条書きを、自然で具体的な文章にする\n・児童のよさ、努力、成長が伝わる肯定的な表現にする\n・同じ語尾の繰り返しを避ける\n・180～220字程度にまとめる\n・完成した所見文だけを出力する\n\n【所属】{class}\n【所見素材】\n{materials}`;}
  function fillReportPrompt(template,data){return String(template).replaceAll('{name}',data.name).replaceAll('{class}',data.className).replaceAll('{term}',data.term).replaceAll('{materials}',data.materials);}
  async function copyText(value){if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return;}const area=document.createElement('textarea');area.value=value;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();}

  async function renderPromptSettings(){
    const prompt=await ClassDB.getMeta('reportPromptTemplate',defaultReportPrompt());
    document.getElementById('settings-content').innerHTML=`<section class="panel"><h1>所見プロンプト設定</h1><p class="muted">全クラス共通です。{name}、{class}、{term}、{materials} は作成時に自動で置き換わります。</p><form id="report-prompt-form"><div class="field"><label for="report-prompt-template">AI用プロンプト</label><textarea class="textarea report-output" id="report-prompt-template">${esc(prompt)}</textarea></div><div class="button-row end section"><button type="button" class="button" id="report-prompt-reset">推奨設定に戻す</button><button type="submit" class="button primary">保存</button></div></form></section>`;
    document.getElementById('report-prompt-reset').addEventListener('click',()=>{document.getElementById('report-prompt-template').value=defaultReportPrompt();});document.getElementById('report-prompt-form').addEventListener('submit',async event=>{event.preventDefault();await ClassDB.setMeta('reportPromptTemplate',document.getElementById('report-prompt-template').value.trim()||defaultReportPrompt());showToast('所見プロンプトを保存しました');});
  }

  async function renderStudentOverview(studentId,tab='summary'){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-student-overview';
    const classItem=selectedClass();applyClassTheme(classItem);const roster=await rosterForClass(classItem.id);const index=roster.findIndex(row=>row.student.id===studentId);const student=await ClassDB.get('students',studentId);
    if(!student){renderHome();return;}
    const all=(await ClassDB.getAllByIndex('records','studentId',studentId)).filter(item=>item.classId===classItem.id&&!item.deletedAt);
    const termStart=today()<=state.year.firstTermEnd?state.year.startDate:state.year.firstTermEnd;
    const records=all.filter(item=>item.date>=termStart&&item.date<=state.year.endDate).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
    const memos=records.filter(item=>item.type==='memo');
    const authored=records.filter(item=>['memo','notebookAssessment','certificate','supportRecord'].includes(item.type));
    const daily=all.filter(item=>item.type==='dailyHomework'&&item.status==='forgotten'&&!item.resolvedAt);
    const weekly=await weeklyData(classItem.id);const weeklyMissing=weekly.occurrences.filter(item=>item.dueDate<today()&&!weekly.submissions.some(row=>row.studentId===studentId&&row.occurrenceId===item.id&&row.status==='submitted'));
    const occasional=await occasionalData(classItem.id);const occasionalMissing=occasional.items.filter(item=>!item.archived&&!occasional.submissions.some(row=>row.studentId===studentId&&row.itemId===item.id&&row.status==='submitted'));
    const tabs=[['summary','概要'],['memo','メモ'],['assessment','評価'],['certificate','賞状'],['homework','宿題・提出物']];
    let content='';
    if(tab==='summary')content=`<div class="overview-layout"><section class="overview-stats"><div class="overview-stat"><strong>最後の記録</strong><div>${authored[0]?jpDate(authored[0].date):'記録なし'}</div></div><div class="overview-stat"><strong>宿題未解決</strong><div>${daily.length+weeklyMissing.length}件${[...daily.map(x=>x.date),...weeklyMissing.map(x=>x.dueDate)].sort()[0]?`・最古 ${jpDate([...daily.map(x=>x.date),...weeklyMissing.map(x=>x.dueDate)].sort()[0])}`:''}</div></div><div class="overview-stat"><strong>提出物未解決</strong><div>${occasionalMissing.length}件${occasionalMissing[0]?`・最古 ${jpDate([...occasionalMissing].sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0].dueDate)}`:''}</div></div></section><section class="panel"><h2>最近の児童メモ</h2><div class="record-list">${memos.slice(0,3).map(recordItemHtml).join('')||'<p class="muted">まだありません。</p>'}</div>${memos.length>3?'<button type="button" class="button section" data-overview-tab="memo">すべて見る</button>':''}</section></div>`;
    else{const filtered=tab==='memo'?memos:tab==='assessment'?records.filter(item=>item.type==='notebookAssessment'):tab==='certificate'?records.filter(item=>item.type==='certificate'):records.filter(item=>['dailyHomework','weeklySubmission','occasionalSubmission'].includes(item.type));content=`<section class="panel"><div class="record-list">${filtered.map(recordItemHtml).join('')||'<p class="muted">この期間の記録はありません。</p>'}</div></section>`;}
    app.innerHTML=teacherToolShell('児童概要',`<div class="button-row" style="justify-content:space-between"><button type="button" class="button" id="student-prev" ${index<=0?'disabled':''}>前</button><div><h1>${esc(student.name)}</h1><p class="muted">${esc(classItem.name)}・出席番号 ${roster[index]?.enrollment.number||'―'}</p></div><button type="button" class="button" id="student-next" ${index<0||index>=roster.length-1?'disabled':''}>次</button></div><nav class="settings-nav">${tabs.map(([id,label])=>`<button type="button" class="settings-tab" data-overview-tab="${id}" aria-selected="${tab===id}">${label}</button>`).join('')}</nav>${content}`);
    wireToolHome();
    document.getElementById('student-prev')?.addEventListener('click',()=>renderStudentOverview(roster[index-1].student.id,tab));document.getElementById('student-next')?.addEventListener('click',()=>renderStudentOverview(roster[index+1].student.id,tab));
    document.querySelectorAll('[data-overview-tab]').forEach(button=>button.addEventListener('click',()=>renderStudentOverview(studentId,button.dataset.overviewTab)));
    document.querySelectorAll('[data-record-id]').forEach(button=>button.addEventListener('click',()=>openRecordDetail(button.dataset.recordId,studentId,tab)));
  }

  function recordItemHtml(record){const labels={memo:'児童メモ',notebookAssessment:'ノート評価',certificate:'ミニ賞状',dailyHomework:'毎日の宿題',weeklySubmission:'週宿題',occasionalSubmission:'不定期提出物',supportRecord:'学習記録'};const detail=record.type==='memo'?`${record.subject||'教科なし'} ${(record.tags||[]).join('・')} ${record.viewpoint||''} ${record.text||''}`:record.type==='notebookAssessment'?`${record.subject||''} ${record.unit||''} ${record.title||''} ${record.grade||record.status||''}`:record.type==='certificate'?(record.tags||[]).join('・')||'渡した':record.title||record.status||'';return`<button type="button" class="record-item" data-record-id="${record.id}"><strong>${esc(jpDate(record.date))}　${esc(labels[record.type]||record.type)}</strong><div class="row-meta">${esc(detail)}</div></button>`;}

  async function openRecordDetail(recordId,studentId,tab){
    const record=await ClassDB.get('records',recordId);if(!record)return;
    const editable=record.type==='memo';
    openDialog(`<h2>${esc(jpDate(record.date))}の記録</h2><p><strong>${esc(record.type==='memo'?'児童メモ':record.type==='notebookAssessment'?'ノート評価':record.type==='certificate'?'ミニ賞状':'記録')}</strong></p>${editable?`<div class="field"><label for="detail-text">自由記述</label><textarea class="textarea" id="detail-text">${esc(record.text||'')}</textarea></div>`:`<p>${esc(record.title||record.text||record.grade||record.status||'')}</p>`}<div class="dialog-actions"><button type="button" class="button danger" id="detail-delete">削除</button><button type="button" class="button" id="detail-close">閉じる</button>${editable?'<button type="button" class="button primary" id="detail-save">保存</button>':''}</div>`);
    document.getElementById('detail-close').addEventListener('click',closeDialog);
    document.getElementById('detail-save')?.addEventListener('click',async()=>{await ClassDB.put('records',{...record,text:document.getElementById('detail-text').value.trim()});closeDialog();showToast('記録を更新しました');renderStudentOverview(studentId,tab);});
    document.getElementById('detail-delete').addEventListener('click',()=>{openDialog(`<h2>この記録を削除しますか</h2><p>30日間はごみ箱に残ります。</p><div class="dialog-actions"><button type="button" class="button" id="delete-cancel">キャンセル</button><button type="button" class="button danger" id="delete-confirm">削除</button></div>`);document.getElementById('delete-cancel').addEventListener('click',closeDialog);document.getElementById('delete-confirm').addEventListener('click',async()=>{await moveToTrash(record);closeDialog();showToast('ごみ箱へ移動しました');renderStudentOverview(studentId,tab);});});
  }

  function syncDeviceDefault(){return /iPad|iPhone|Macintosh.*Mobile/i.test(navigator.userAgent)?'iPad':'PC';}
  function syncDateStamp(){const d=new Date();return`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;}
  function safeFilePart(value){return String(value||'').replace(/[\\/:*?"<>|\s]+/g,'_');}
  async function recordSyncHistory(kind,details={}){const labels={export:'同期ファイル作成',import:'同期ファイル取込',backup:'バックアップ保存',archive:'年度保管'};const history=await ClassDB.getMeta('syncHistory',[]);const entry={id:ClassDB.uid('syncHistory'),at:ClassDB.now(),kind,kindLabel:labels[kind]||kind,device:details.device||await ClassDB.getMeta('syncDeviceName',syncDeviceDefault()),yearLabel:state.year?.label||'',add:details.add||0,update:details.update||0,delete:details.delete||0};await ClassDB.setMeta('syncHistory',[entry,...history].slice(0,20));return entry;}
  function syncHistoryHtml(history){if(!history?.length)return'<p class="muted">同期・バックアップの履歴はまだありません。</p>';return`<div class="sync-history-list">${history.slice(0,8).map(item=>`<div class="sync-history-row"><span class="sync-history-icon">${item.kind==='import'?'↓':item.kind==='backup'||item.kind==='archive'?'▣':'↑'}</span><div><strong>${esc(item.kindLabel||item.kind)}</strong><div class="row-meta">${esc(new Date(item.at).toLocaleString('ja-JP'))}・${esc(item.device||'端末名なし')}</div></div><span class="sync-history-count">${item.add||item.update||item.delete?`+${item.add||0} / 更新${item.update||0} / 削除${item.delete||0}`:'保存'}</span></div>`).join('')}</div>`;}
  async function deriveEncryptionKey(secret,salt,iterations=250000){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
  async function protectText(value,secret){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=250000,key=await deriveEncryptionKey(secret,salt,iterations),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value));return{iterations,salt:bytesToBase64(salt),iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(encrypted))};}
  async function unprotectText(bundle,secret){const key=await deriveEncryptionKey(secret,base64ToBytes(bundle.salt),bundle.iterations),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(bundle.iv)},key,base64ToBytes(bundle.ciphertext));return new TextDecoder().decode(plain);}
  async function wrapDataKey(rawKey,secret){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=250000,key=await deriveEncryptionKey(secret,salt,iterations),wrapped=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,rawKey);return{iterations,salt:bytesToBase64(salt),iv:bytesToBase64(iv),wrappedKey:bytesToBase64(new Uint8Array(wrapped))};}
  async function unwrapDataKey(bundle,secret){const key=await deriveEncryptionKey(secret,base64ToBytes(bundle.salt),bundle.iterations);return crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(bundle.iv)},key,base64ToBytes(bundle.wrappedKey));}
  async function recoverySecretForSession(){if(!state.year.recoverySecretProtected||!state.sessionSecret)return null;try{return await unprotectText(state.year.recoverySecretProtected,state.sessionSecret);}catch{return null;}}
  async function encryptPayload(payload,kind){const rawKey=crypto.getRandomValues(new Uint8Array(32)),dataKey=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt','decrypt']),payloadIv=crypto.getRandomValues(new Uint8Array(12)),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:payloadIv},dataKey,new TextEncoder().encode(JSON.stringify(payload))),recoverySecret=await recoverySecretForSession();const wraps={password:await wrapDataKey(rawKey,state.sessionSecret)};if(recoverySecret)wraps.recovery=await wrapDataKey(rawKey,recoverySecret);return{format:'class-support-encrypted',version:2,kind,yearLabel:state.year.label,passwordHint:state.year.passwordHint||'',createdAt:ClassDB.now(),device:payload.device,crypto:{algorithm:'AES-GCM',kdf:'PBKDF2-SHA-256',payloadIv:bytesToBase64(payloadIv),wraps},ciphertext:bytesToBase64(new Uint8Array(encrypted))};}
  async function decryptEnvelope(envelope,credential=state.sessionSecret,method='password'){if(envelope?.format!=='class-support-encrypted'||!envelope.crypto||!envelope.ciphertext)throw new Error('クラス支援ツールの暗号化ファイルではありません');try{if(envelope.version===1){if(method==='recovery')throw new Error('この旧形式ファイルは年度パスワードで開いてください');const key=await deriveEncryptionKey(credential,base64ToBytes(envelope.crypto.salt),envelope.crypto.iterations),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(envelope.crypto.iv)},key,base64ToBytes(envelope.ciphertext));return JSON.parse(new TextDecoder().decode(plain));}const wrap=envelope.crypto.wraps?.[method];if(!wrap)throw new Error(method==='recovery'?'このバックアップには復旧コード情報がありません':'年度パスワード用の情報がありません');const rawKey=await unwrapDataKey(wrap,credential),dataKey=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(envelope.crypto.payloadIv)},dataKey,base64ToBytes(envelope.ciphertext));return JSON.parse(new TextDecoder().decode(plain));}catch(error){if(error.message?.includes('旧形式')||error.message?.includes('情報がありません'))throw error;throw new Error(method==='recovery'?'復旧コードが異なるか、ファイルが破損しています':'パスワードが異なるか、ファイルが破損しています');}}

  async function collectYearPayload(){const classItems=await ClassDB.getAllByIndex('classes','yearId',state.year.id),classIds=new Set(classItems.map(item=>item.id));const allEnrollments=await ClassDB.getAll('enrollments'),enrollments=allEnrollments.filter(item=>classIds.has(item.classId));const studentIds=new Set(enrollments.map(item=>item.studentId));const students=(await ClassDB.getAll('students')).filter(item=>studentIds.has(item.id));const records=(await ClassDB.getAll('records')).filter(item=>classIds.has(item.classId));const trash=(await ClassDB.getAll('trash')).filter(item=>classIds.has(item.record?.classId));const meta=(await ClassDB.getAll('meta')).filter(item=>!['lastMode','selectedClassId','activeYearId'].includes(item.key));const device=await ClassDB.getMeta('syncDeviceName',syncDeviceDefault());return{format:'class-support-sync-payload',schemaVersion:1,yearId:state.year.id,yearLabel:state.year.label,generatedAt:ClassDB.now(),device,data:{years:[state.year],classes:classItems,students,enrollments,records,trash,meta}};}
  async function createEncryptedFile(kind,download=true){if(!await requestAnnualPassword())return null;if(['backup','archive'].includes(kind)&&!state.year.recoverySecretProtected){const ready=await prepareBackupExport();if(!ready)return null;}const payload=await collectYearPayload(),envelope=await encryptPayload(payload,kind);if(download){const prefix=kind==='backup'?'暗号化バックアップ':kind==='archive'?'年度保管':'同期';downloadText(`${prefix}_${safeFilePart(state.year.label)}_${syncDateStamp()}_${safeFilePart(payload.device)}.json`,JSON.stringify(envelope));if(kind==='backup'){state.lastBackupAt=ClassDB.now();state.backupDismissedUntil=null;await ClassDB.setMeta('lastBackupAt',state.lastBackupAt);await ClassDB.setMeta('backupDismissedUntil',null);}if(kind==='sync')await recordSyncHistory('export',{device:payload.device});if(kind==='backup')await recordSyncHistory('backup',{device:payload.device});if(kind==='archive')await recordSyncHistory('archive',{device:payload.device});}return envelope;}

  async function prepareBackupExport(){if(state.year.recoverySecretProtected)return true;return new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.removeEventListener('cancel',onDialogCancel);resolve(value);},onDialogCancel=()=>finish(false);openDialog(`<h2>復旧コードを確認</h2><p class="muted">この端末の設定は旧形式です。今回だけ復旧コードを入力すると、今後のバックアップを復旧コードでも開けるようになります。</p><form id="backup-recovery-form"><div class="field"><label for="backup-recovery-code">${esc(state.year.label)}の復旧コード</label><input class="input" id="backup-recovery-code" autocomplete="off" required></div><p class="error" id="backup-recovery-error"></p><div class="dialog-actions"><button type="button" class="button" id="backup-recovery-cancel">キャンセル</button><button type="submit" class="button primary">確認して保存</button></div></form>`);dialog.addEventListener('cancel',onDialogCancel,{once:true});document.getElementById('backup-recovery-cancel').addEventListener('click',()=>{closeDialog();finish(false);});document.getElementById('backup-recovery-form').addEventListener('submit',async event=>{event.preventDefault();const code=document.getElementById('backup-recovery-code').value.trim().toUpperCase();if(!await verifySecret(code,state.year.recoveryAuth)){document.getElementById('backup-recovery-error').textContent='復旧コードが一致しません。';return;}state.year=await ClassDB.put('years',{...state.year,recoverySecretProtected:await protectText(code,state.sessionSecret)});closeDialog();finish(true);});});}

  async function renderDataExchange(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-data';applyClassTheme(selectedClass());
    const device=await ClassDB.getMeta('syncDeviceName',syncDeviceDefault());
    const lastBackup=await ClassDB.getMeta('lastBackupAt',null);
    const syncHistory=await ClassDB.getMeta('syncHistory',[]);
    const term=currentTermRange();
    app.innerHTML=teacherToolShell('同期・バックアップ',`
      <section class="panel credential-status"><h1>認証状態</h1><div><span class="status-pill good">教師用PIN 認証済み</span><span class="status-pill ${state.sessionSecret?'good':'neutral'}">年度パスワード ${state.sessionSecret?'認証済み':'未認証'}</span></div><p class="muted small">年度パスワードは、暗号化ファイルを作成・取込するときにだけ確認します。</p></section>
      <section class="panel"><h1>暗号化同期</h1><p class="muted">今年度の全クラス・名簿・記録・設定を、年度パスワードで暗号化します。Teamsなどへ毎回別名で保存してください。</p><div class="form-grid"><div class="field"><label for="sync-device-name">作成端末名</label><input class="input" id="sync-device-name" value="${esc(device)}"></div><div class="field" style="align-self:end"><button type="button" class="button primary" id="sync-export">同期ファイルを作成</button></div><div class="field full"><label for="sync-import">同期ファイルを取り込む</label><input class="input" id="sync-import" type="file" accept=".json,application/json"></div></div></section>
      <section class="panel"><div class="button-row" style="justify-content:space-between"><div><h1>同期履歴</h1><p class="muted">この端末で行った同期・バックアップの最近の履歴です。</p></div><button type="button" class="button" id="sync-history-refresh">更新</button></div>${syncHistoryHtml(syncHistory)}</section>
      <section class="panel"><h1>暗号化バックアップ</h1><p class="muted">端末故障や年度保管に備えた全データです。年度パスワードで暗号化します。最終保存：${lastBackup?esc(new Date(lastBackup).toLocaleString('ja-JP')):'まだありません'}</p><div class="button-row"><button type="button" class="button primary" id="backup-export">暗号化バックアップを保存</button><label class="button">バックアップを読み込む<input id="backup-import" type="file" accept=".json,application/json" hidden></label></div></section>
      <section class="panel"><h1>前年度の保管ファイルを確認</h1><p class="muted">アプリへ戻さずに、保管した年度・クラス・人数・記録件数を確認します。その年度のパスワードまたは復旧コードを使います。</p><label class="button">保管ファイルを選ぶ<input id="archive-inspect" type="file" accept=".json,application/json" hidden></label></section>
      <section class="panel"><h1>CSV出力</h1><p class="muted">PCのExcelで確認できる提出状況とノート評価の一覧を保存します。</p><div class="form-grid"><div class="field"><label for="csv-class">クラス</label><select class="select" id="csv-class">${state.classes.map(item=>`<option value="${item.id}" ${item.id===state.selectedClassId?'selected':''}>${esc(item.name)}</option>`).join('')}</select></div><div></div><div class="field"><label for="csv-start">開始日</label><input class="input" id="csv-start" type="date" value="${term.start}"></div><div class="field"><label for="csv-end">終了日</label><input class="input" id="csv-end" type="date" value="${term.end}"></div></div><p class="error" id="csv-error" role="alert"></p><div class="button-row section"><button type="button" class="button primary" id="submission-csv">提出状況CSV</button><button type="button" class="button primary" id="assessment-csv">評価一覧CSV</button></div></section>
      <section class="panel"><h1>旧データ移行</h1><p class="muted">同じGitHub Pagesに保存された旧データ、または旧ツールのJSON・CSVバックアップを確認してから一括移行します。旧データは、移行後の暗号化バックアップを読み直すまで削除しません。</p><div class="button-row"><button type="button" class="button primary" id="legacy-scan">この端末の旧データを確認</button><label class="button">バックアップファイルを選ぶ<input id="legacy-files" type="file" accept=".json,.csv,application/json,text/csv" multiple hidden></label></div></section>`);
    wireToolHome();
    document.getElementById('sync-device-name').addEventListener('change',async event=>{await ClassDB.setMeta('syncDeviceName',event.target.value.trim()||syncDeviceDefault());showToast('端末名を保存しました');});
    document.getElementById('sync-export').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{await saveDeviceNameFromScreen();const saved=await createEncryptedFile('sync');if(saved)showToast('暗号化同期ファイルを保存しました');}));
    document.getElementById('backup-export').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{await saveDeviceNameFromScreen();const saved=await createEncryptedFile('backup');if(saved)showToast('暗号化バックアップを保存しました');}));
    document.getElementById('sync-history-refresh').addEventListener('click',event=>runOnce(event.currentTarget,async()=>renderDataExchange()));
    document.getElementById('sync-import').addEventListener('change',event=>readEncryptedImport(event.target.files[0]));
    document.getElementById('backup-import').addEventListener('change',event=>readEncryptedImport(event.target.files[0]));
    document.getElementById('archive-inspect').addEventListener('change',event=>inspectArchiveFile(event.target.files[0]));
    document.getElementById('submission-csv').addEventListener('click',event=>runOnce(event.currentTarget,()=>exportClassCsv('submission')));
    document.getElementById('assessment-csv').addEventListener('click',event=>runOnce(event.currentTarget,()=>exportClassCsv('assessment')));
    document.getElementById('legacy-scan').addEventListener('click',()=>openLegacyMigrationReview(LegacyMigration.fromStorage()));
    document.getElementById('legacy-files').addEventListener('change',async event=>openLegacyMigrationReview(await LegacyMigration.fromFiles([...event.target.files])));
  }

  async function inspectArchiveFile(file){
    if(!file)return;try{const envelope=JSON.parse(await file.text());if(envelope?.format!=='class-support-encrypted')throw new Error('クラス支援ツールの暗号化ファイルではありません');openDialog(`<h2>${esc(envelope.yearLabel||'保管年度')}を確認</h2><p class="panel small">パスワードのヒント：${esc(envelope.passwordHint||'ファイル表面には保存されていません')}</p><form id="archive-inspect-form"><div class="field"><label for="archive-method">開く方法</label><select class="select" id="archive-method"><option value="password">年度パスワード</option><option value="recovery">復旧コード</option></select></div><div class="field section"><label for="archive-credential">パスワードまたは復旧コード</label><input class="input" id="archive-credential" type="password" required autofocus></div><p class="error" id="archive-inspect-error"></p><div class="dialog-actions"><button type="button" class="button" id="archive-inspect-cancel">キャンセル</button><button type="submit" class="button primary">内容を確認</button></div></form>`);document.getElementById('archive-inspect-cancel').addEventListener('click',closeDialog);document.getElementById('archive-inspect-form').addEventListener('submit',async event=>{event.preventDefault();const error=document.getElementById('archive-inspect-error'),method=document.getElementById('archive-method').value,credential=document.getElementById('archive-credential').value.trim();error.textContent='読み取っています…';try{const payload=await decryptEnvelope(envelope,method==='recovery'?credential.toUpperCase():credential,method),data=payload.data||{},classes=data.classes||[],students=data.students||[],records=data.records||[];openDialog(`<h2>${esc(payload.yearLabel||envelope.yearLabel||'保管年度')}の内容</h2><div class="overview-stats"><div class="overview-stat"><span class="row-meta">クラス</span><strong>${classes.length}</strong></div><div class="overview-stat"><span class="row-meta">児童</span><strong>${students.length}</strong></div><div class="overview-stat"><span class="row-meta">記録</span><strong>${records.length}</strong></div></div><div class="list section">${classes.map(item=>`<div class="list-row"><strong>${esc(item.name)}</strong><span class="row-meta">${(data.enrollments||[]).filter(row=>row.classId===item.id).length}人</span></div>`).join('')}</div><p class="muted section">この確認では、現在のアプリへデータを追加していません。</p><div class="dialog-actions"><button type="button" class="button primary" id="archive-result-close">OK</button></div>`);document.getElementById('archive-result-close').addEventListener('click',closeDialog);}catch(problem){error.textContent=problem.message||'保管ファイルを読み取れませんでした';}});}catch(problem){openDialog(`<h2>読み込めませんでした</h2><p>${esc(problem.message||'ファイルを確認してください')}</p><div class="dialog-actions"><button type="button" class="button primary" id="archive-error-close">OK</button></div>`);document.getElementById('archive-error-close').addEventListener('click',closeDialog);}
  }

  async function exportClassCsv(kind){
    const classId=document.getElementById('csv-class').value,start=document.getElementById('csv-start').value,end=document.getElementById('csv-end').value,error=document.getElementById('csv-error');
    error.textContent='';if(!start||!end||start>end){error.textContent='出力期間を確認してください。';return;}
    const classItem=state.classes.find(item=>item.id===classId);if(!classItem){error.textContent='クラスを選択してください。';return;}
    const roster=await rosterForClass(classId),records=await ClassDB.getAllByIndex('records','classId',classId),args={classItem,roster,records,start,end};
    const rows=kind==='submission'?ClassCsvExport.submissionRows(args):ClassCsvExport.assessmentRows(args),label=kind==='submission'?'提出状況':'評価一覧';
    downloadCsv(`${label}_${safeFilePart(classItem.name)}_${start.replaceAll('-','')}-${end.replaceAll('-','')}.csv`,ClassCsvExport.csv(rows));showToast(`${label}CSVを保存しました（${Math.max(0,rows.length-1)}件）`);
  }

  async function openLegacyMigrationReview(sources){
    if(!sources?.length){showToast('移行できる旧データは見つかりませんでした');return;}
    state.migrationSources=sources;
    const years=await ClassDB.getAll('years'),classes=await ClassDB.getAll('classes');
    const targets=classes.map(item=>{const year=years.find(row=>row.id===item.yearId);return{...item,yearLabel:year?.label||'年度不明'};});
    const defaultId=selectedClass()?.id||targets[0]?.id;
    app.innerHTML=teacherToolShell('旧データ移行',`<section class="panel"><h1>移行内容を確認</h1><p class="muted">データごとに移行先の年度・クラスを選んでください。同じ記録がすでにある場合は重複させず、内容が異なる場合は両方を残して「要確認」にします。</p></section><section class="panel"><div class="list">${sources.map(source=>`<div class="list-row migration-row"><div><div class="row-title">${esc(source.label)}</div><div class="row-meta">児童 ${source.studentCount}人・記録まとまり ${source.recordCount}件</div></div><div class="field migration-target"><label for="migration-${source.id}">移行先</label><select class="select" id="migration-${source.id}" data-migration-target="${source.id}">${targets.map(target=>`<option value="${target.id}" ${target.id===defaultId?'selected':''}>${esc(target.yearLabel)}・${esc(target.name)}</option>`).join('')}</select></div></div>`).join('')}</div><div class="button-row end section"><button type="button" class="button" id="migration-cancel">キャンセル</button><button type="button" class="button primary" id="migration-apply">この内容で一括移行</button></div></section>`);
    wireToolHome();
    document.getElementById('migration-cancel').addEventListener('click',renderDataExchange);
    document.getElementById('migration-apply').addEventListener('click',applyLegacyMigration);
  }

  async function legacyRosterMap(source,classId){
    const existing=await rosterForClass(classId),byNumber=new Map(),nameByNumber=new Map(),byName=new Map(),sourceNumberMap=new Map();
    existing.forEach(row=>{byNumber.set(Number(row.enrollment.number),row.student.id);nameByNumber.set(Number(row.enrollment.number),row.student.name.trim());byName.set(row.student.name.trim(),row.student.id);});
    for(const row of LegacyMigration.roster(source)){
      const requested=Number(row.number)||null,numberMatch=requested&&nameByNumber.get(requested)===row.name?byNumber.get(requested):null;
      let studentId=byName.get(row.name)||numberMatch;
      if(!studentId){const classItem=await ClassDB.get('classes',classId),year=classItem?await ClassDB.get('years',classItem.yearId):state.year;const student=await ClassDB.put('students',{id:ClassDB.uid('student'),name:row.name});studentId=student.id;let assigned=requested;if(!assigned||byNumber.has(assigned)){assigned=1;while(byNumber.has(assigned))assigned++;}await ClassDB.put('enrollments',{id:ClassDB.uid('enrollment'),classId,studentId,number:assigned,grade:row.grade||'',gender:row.gender||'',startDate:year?.startDate||state.year.startDate});byNumber.set(assigned,studentId);nameByNumber.set(assigned,row.name);}
      if(requested)sourceNumberMap.set(requested,studentId);byName.set(row.name,studentId);
    }
    return{resolve:({number,name})=>byName.get(String(name||'').trim())||(number?sourceNumberMap.get(Number(number)):null)||null};
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
    document.getElementById('migration-done').addEventListener('click',()=>{closeDialog();renderDataExchange();});
  }
  async function saveDeviceNameFromScreen(){const input=document.getElementById('sync-device-name');if(input)await ClassDB.setMeta('syncDeviceName',input.value.trim()||syncDeviceDefault());}

  function newerThan(incoming,local){return String(incoming?.updatedAt||incoming?.deletedAt||'')>String(local?.updatedAt||local?.deletedAt||'');}
  async function buildSyncPlan(payload){const stores=['years','classes','students','enrollments','records','trash'];const plan={payload,writes:{},deletes:[],counts:{add:0,update:0,conflict:0,delete:0,skip:0}};const localTrash=await ClassDB.getAll('trash');const deletedByRecord=new Map(localTrash.map(item=>[item.record?.id,item]));for(const store of stores){plan.writes[store]=[];for(const incoming of payload.data?.[store]||[]){if(store==='records'){const deleted=deletedByRecord.get(incoming.id);if(deleted&&String(deleted.deletedAt||'')>=String(incoming.updatedAt||'')){plan.counts.skip++;continue;}}const local=await ClassDB.get(store,incoming.id);if(!local){plan.writes[store].push(incoming);plan.counts.add++;continue;}if(newerThan(incoming,local)){plan.writes[store].push(incoming);plan.counts.update++;continue;}if(!incoming.updatedAt&&!local.updatedAt&&JSON.stringify(incoming)!==JSON.stringify(local)&&store==='records'){plan.writes[store].push({...incoming,id:ClassDB.uid('syncConflict'),conflictOriginalId:incoming.id,needsReview:true});plan.counts.conflict++;}else plan.counts.skip++;}}
    for(const incomingTrash of payload.data?.trash||[]){const recordId=incomingTrash.record?.id;if(!recordId)continue;const localRecord=await ClassDB.get('records',recordId);if(localRecord&&String(incomingTrash.deletedAt||'')>=String(localRecord.updatedAt||'')){plan.deletes.push({record:localRecord,trash:incomingTrash});}}
    plan.deletes=[...new Map(plan.deletes.map(item=>[item.record.id,item])).values()];plan.counts.delete=plan.deletes.length;plan.meta=[];for(const incoming of payload.data?.meta||[]){const local=await ClassDB.get('meta',incoming.key);if(!local||newerThan(incoming,local)){plan.meta.push(incoming);local?plan.counts.update++:plan.counts.add++;}else plan.counts.skip++;}return plan;}

  async function readEncryptedImport(file){if(!file)return;if(!await requestAnnualPassword())return;try{const envelope=JSON.parse(await file.text()),payload=await decryptEnvelope(envelope);if(payload.yearLabel!==state.year.label){showToast(`このファイルは${payload.yearLabel||'別年度'}のデータです`);return;}const cleanup=await ClassDB.getMeta('legacyCleanupKeys',[]);state.verifiedLegacyCleanupKeys=envelope.kind==='backup'&&payload.data?.records?.some(item=>item.legacyImported)?cleanup:[];const plan=await buildSyncPlan(payload);state.pendingSync={plan,envelope};openSyncPreview(false);}catch(error){openDialog(`<h2>読み込めませんでした</h2><p>${esc(error.message)}</p><div class="dialog-actions"><button type="button" class="button primary" id="sync-error-close">OK</button></div>`);document.getElementById('sync-error-close').addEventListener('click',closeDialog);}}
  function syncSummaryHtml(plan,detailed=false){const c=plan.counts;return`<div class="sync-summary"><div><strong>${c.add}</strong><span>追加</span></div><div><strong>${c.update}</strong><span>更新</span></div><div><strong>${c.conflict}</strong><span>要確認</span></div><div><strong>${c.delete}</strong><span>削除候補</span></div></div>${detailed?`<div class="list section"><div class="list-row"><span>変更しないデータ</span><strong>${c.skip}件</strong></div><div class="list-row"><span>取込元</span><strong>${esc(plan.payload.device||'不明')}</strong></div><div class="list-row"><span>作成日時</span><strong>${esc(new Date(plan.payload.generatedAt).toLocaleString('ja-JP'))}</strong></div></div>${c.delete?`<label class="check-row"><input type="checkbox" id="approve-sync-deletes"> 削除候補${c.delete}件をまとめて承認する</label>`:''}`:''}`;}
  function openSyncPreview(detailed){const pending=state.pendingSync;if(!pending)return;const plan=pending.plan;openDialog(`<h2>同期内容を確認</h2><p class="muted">更新日時が新しい方を採用します。</p>${syncSummaryHtml(plan,detailed)}<div class="dialog-actions"><button type="button" class="button" id="sync-cancel">同期キャンセル</button>${detailed?'':`<button type="button" class="button" id="sync-detail">詳細を表示</button>`}<button type="button" class="button primary" id="sync-apply">${detailed?'同期する':'OK'}</button></div>`);document.getElementById('sync-cancel').addEventListener('click',()=>{state.pendingSync=null;closeDialog();});document.getElementById('sync-detail')?.addEventListener('click',()=>openSyncPreview(true));document.getElementById('sync-apply').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{if(plan.counts.delete&&!detailed){openSyncPreview(true);return;}await applySyncPlan(Boolean(document.getElementById('approve-sync-deletes')?.checked));}));}
  async function applySyncPlan(approveDeletes){
    const pending=state.pendingSync;if(!pending)return;const plan=pending.plan;
    for(const store of ['years','classes','students','enrollments','records','trash'])if(plan.writes[store]?.length)await ClassDB.putManyRaw(store,plan.writes[store]);
    for(const item of plan.meta)await ClassDB.putRaw('meta',item);
    if(approveDeletes)for(const item of plan.deletes){await ClassDB.putRaw('trash',item.trash);await ClassDB.remove('records',item.record.id);}
    state.year=await ClassDB.get('years',state.year.id);state.classes=(await ClassDB.getAllByIndex('classes','yearId',state.year.id)).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));state.pendingSync=null;
    const merged=await createEncryptedFile('sync',false);state.mergedSyncEnvelope=merged;await recordSyncHistory('import',{device:plan.payload.device,add:plan.counts.add,update:plan.counts.update,delete:approveDeletes?plan.counts.delete:0});const canClean=state.verifiedLegacyCleanupKeys.length>0;
    openDialog(`<h2>同期しました</h2><p>追加 ${plan.counts.add}件、更新 ${plan.counts.update}件${approveDeletes?`、削除 ${plan.counts.delete}件`:''}を反映しました。</p>${canClean?'<p class="notice"><strong>移行後の暗号化バックアップを正常に読み取れました。</strong><br>この端末に残した旧形式データを削除できます。</p>':''}<div class="dialog-actions"><button type="button" class="button" id="sync-done">OK</button>${canClean?'<button type="button" class="button danger" id="legacy-cleanup">確認済みの旧データを削除</button>':''}<button type="button" class="button primary" id="sync-save-merged">統合済み同期ファイルを保存</button></div>`);
    document.getElementById('sync-done').addEventListener('click',()=>{state.verifiedLegacyCleanupKeys=[];closeDialog();renderDataExchange();});
    document.getElementById('legacy-cleanup')?.addEventListener('click',confirmLegacyCleanup);
    document.getElementById('sync-save-merged').addEventListener('click',()=>{const device=state.mergedSyncEnvelope.device||syncDeviceDefault();downloadText(`同期済み_${safeFilePart(state.year.label)}_${syncDateStamp()}_${safeFilePart(device)}.json`,JSON.stringify(state.mergedSyncEnvelope));showToast('統合済み同期ファイルを保存しました');});
  }

  function confirmLegacyCleanup(){
    openDialog(`<h2>旧形式データを削除しますか</h2><p>暗号化バックアップで移行済みデータを確認できました。この端末の旧ツール用データだけを削除します。新アプリの記録は削除されません。</p><div class="dialog-actions"><button type="button" class="button" id="legacy-cleanup-cancel">キャンセル</button><button type="button" class="button danger" id="legacy-cleanup-apply">削除する</button></div>`);
    document.getElementById('legacy-cleanup-cancel').addEventListener('click',closeDialog);
    document.getElementById('legacy-cleanup-apply').addEventListener('click',async()=>{for(const key of state.verifiedLegacyCleanupKeys)localStorage.removeItem(key);state.verifiedLegacyCleanupKeys=[];await ClassDB.setMeta('legacyCleanupKeys',[]);closeDialog();showToast('確認済みの旧形式データを削除しました');renderDataExchange();});
  }

  function renderDataSettings(){document.getElementById('settings-content').innerHTML=`<section class="panel"><h1>データ</h1><div class="list"><div class="list-row"><div><div class="row-title">暗号化同期・バックアップ</div><div class="row-meta">今年度の全クラス・全記録・設定を暗号化して保存します</div></div><button class="button primary" id="open-data-exchange">開く</button></div><div class="list-row"><div><div class="row-title">旧データ移行</div><div class="row-meta">この端末または旧バックアップの内容を確認して移行します</div></div><button class="button" id="open-legacy-migration">開く</button></div></div></section>`;document.getElementById('open-data-exchange').addEventListener('click',renderDataExchange);document.getElementById('open-legacy-migration').addEventListener('click',renderDataExchange);}

  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  window.addEventListener('error',event=>{console.error(event.error||event.message);showToast('画面処理でエラーが発生しました');});
  window.addEventListener('unhandledrejection',event=>{console.error(event.reason);showToast('保存処理を完了できませんでした。もう一度お試しください');});
  window.addEventListener('online',()=>{updateConnectionStatus();showToast('オンラインに戻りました');});
  window.addEventListener('offline',()=>{updateConnectionStatus();showToast('オフラインです。記録はこの端末に保存されます');});
  document.addEventListener('click',event=>{if(event.target.closest('[data-theme-toggle]'))toggleTheme();});
  document.addEventListener('input',event=>{if(event.target.matches('.pin-input'))event.target.setCustomValidity(event.target.value&&/^\d{6}$/.test(event.target.value)?'':'教師用PINは数字6桁で入力してください。');});
  document.addEventListener('invalid',event=>{if(event.target.matches('.pin-input'))event.target.setCustomValidity('教師用PINは数字6桁で入力してください。');},true);
  loadState().catch(error=>{console.error(error);app.innerHTML=`<main class="page narrow"><section class="panel"><h1>起動できませんでした</h1><p>${esc(error.message||'読み込み中にエラーが発生しました。')}</p><p class="muted">ページを再読み込みしても直らない場合は、この表示内容を先生用端末で確認してください。</p></section></main>`;});
})();
