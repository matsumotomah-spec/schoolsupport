"use strict";

  const app=document.getElementById('app');
  const dialog=document.getElementById('dialog');
  const toastElement=document.getElementById('toast');
  const AUTH_MS=5*60*1000;
  const AUTH_ITERATIONS=210000;
  const PIN_LENGTH=6;
  const PIN_MAX_FAILURES=5;
  const PIN_LOCK_MS=30*1000;
  const APP_VERSION='62';
  const APP_UPDATED_AT='2026-09-15 23:30';
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
  const STANDARD_ICONS={daily:'宿',weekly:'週',certificate:'賞',memo:'メ',assessment:'B',grades:'点',occasional:'提',seating:'席',reports:'所',support:'学'};
  const EMOJI_ICON_CHOICES={daily:['✅','📚','✏️','📝'],weekly:['📅','📘','📒','🗓️'],certificate:['🏅','🎖️','🌟','👏'],memo:['📝','✍️','💡','📌'],assessment:['💯','📊','🅰️','📖'],grades:['📈','🧮','📋','🎯'],occasional:['📨','📄','📥','📋'],seating:['🪑','🧩','🏫','↔️'],reports:['✍️','📜','💬','🗒️'],support:['🧭','📚','🧩','🎯']};
  const REWARD_ICONS=['✨','💯','👍','🌟','🏅','👏','✅','📚','🌈','🚀'];
  const DEFAULT_EMOJI_ICONS=Object.fromEntries(Object.entries(EMOJI_ICON_CHOICES).map(([id,icons])=>[id,icons[0]]));
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
    pupilTool:'all',
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
    lockTimer:null,
    dataInSettings:false,
    weeklyPromptShown:new Set(),
    feedback:null,
    iconMode:'standard',
    emojiIcons:{...DEFAULT_EMOJI_ICONS},
    rewardIcon:'✨',
    showMonthlyForgotten:true,
    pupilOverviewVisibility:{daily:true,weekly:true,occasional:true,monthly:true,reward:true},
    pupilKanaMode:false,
    showExplanations:true,
    informationMode:'standard',
    rosterDensity:'auto',
    focusMode:false,
    studentReturnTool:null,
    onboardingStep:0
  };
  let unsavedChanges=false;
  async function navigateSafely(action){if(unsavedChanges&&state.route==='teacher-settings'&&state.settingsTab==='classes'&&state.classSettingsView==='roster'){const saved=await saveRoster({silent:true,rerender:false});if(!saved)return;action();return;}if(unsavedChanges&&!window.confirm('入力中の変更が保存されていません。移動しますか？'))return;unsavedChanges=false;action();}

  const HELP_TOPICS={
    home:['教師用ホーム','操作するクラスを選び、今日使う機能を開きます。「要対応○人」は確認が必要な児童数です。','児童に渡すときは、画面下の「児童用の提出画面」を押してください。',['最初に上部の「操作中」で現在のクラスを確認します。','大きい機能ボタン、または画面下部の機能名を押します。','週の初めに案内が出たら、今週分の週宿題を作るか選びます。']],
    daily:['毎日の宿題','その日の提出状況と、今週の未解決の忘れ物を確認します。','児童名を押すたびに、提出→忘れた→未確認の順で切り替わります。',['今週の忘れ物がある児童では日付別の確認画面が開きます。','月曜日より前の忘れ物は日常画面へ持ち越しません。','「達成アイコンの条件」で、直近1か月の忘れ回数の上限を設定できます。']],
    weekly:['週宿題','毎週または今週限りの宿題を作り、提出状況を記録します。','児童名を押すたびに、提出→忘れた→未提出の順で切り替わります。',['「毎週」にしても年度末まで一括作成しません。','次の月曜日以降に案内が出たら「今週分を作る」を押します。','案内を閉じた場合も、週宿題画面のボタンから作成できます。']],
    memo:['児童メモ','児童を選び、教科とプラス評価タグを選ぶだけで保存できます。','個別支援級では、今期にメモがない教科を上部に表示します。'],
    certificate:['ミニ賞状','児童名を1回押すと「渡した」と記録します。同じ名前をもう一度押すと理由タグの追加や取消ができます。','まず配付の有無だけを素早く記録し、理由は必要なときだけ追加できます。タグは設定の「メモ・賞状の選択肢」から編集できます。'],
    assessment:['ノート評価','児童名を1回押すと、知識・技能、思考・判断・表現、主体的に学習に取り組む態度の3観点をすべてBで記録します。','よくできた観点や気になる観点がある児童だけ、同じ名前をもう一度押して変更します。',['3観点は1つの画面で変更でき、ほかの観点はBのまま残せます。','教科を選ぶと、前期・後期・年間の観点別平均を確認できます。','欠席・未提出は平均に含めず、成績は自動決定しません。']],
    grades:['成績管理','Excelの採点表からテスト得点を取り込み、ノート評価と同じ一覧で確認できます。','「Excelのテスト採点表を取り込む」を押し、内容を確認してから登録します。',['テストは得点率、ノートは3観点平均として並びます。','氏名は出席番号を優先し、空白を無視して名簿と結び付けます。','通知表の評定は自動決定しません。教師が判断するための材料です。']],
    occasional:['提出物','登録済みの提出物を一覧で確認し、児童ごとの提出状況を記録します。','「＋ 新しい提出物を作る」から複数の提出物を追加できます。',['提出物カードを選んでから児童名を押します。','緑は提出済み、灰色・赤は未提出です。','回収が終わったら「回収を終える」を押します。']],
    seating:['席替え','列数・行数・空席・印刷用通路と配慮条件を設定して、教室に合う座席表を作ります。','8列×5行なども設定できます。通路は列の間を選ぶと、印刷時に机約1列分の余白になります。',['空席は座席番号として残り、通路は座席数に含めません。','ドラッグ後も満たせていない配慮条件を再計算します。','確定後に「日常画面へ反映」を押すと宿題画面へ反映します。']],
    settings:['設定','普段変更する項目を6つに整理しています。最初は「クラス・児童」を確認してください。','画面の見え方やタグは「日常の表示・入力」、同期や保存は「データ管理」から変更できます。'],
    appearance:['日常の表示・入力','画面表示、児童用表示、アイコン、メモ・賞状の選択肢、所見の文章設定をまとめています。','上部の3項目から、変更したい内容を選びます。',['宿題の条件達成アイコンは10種類から選べます。','1か月の忘れ回数を児童用画面に出すか選べます。','設定後は「保存」を押し、ホームで表示を確認します。']],
    data:['データ管理','目的を選んで、iPadとPCの記録をまとめる、故障に備えて保存する、Excel用の一覧を作る、削除した記録を戻す操作を行います。','普段は「iPadとPCの記録をまとめる」、月に1回は「故障に備えて保存する」を使います。'],
    support:['学習記録','教科と現在の学習単元を確認し、児童ごとの学習記録を入力します。','児童名を押して記録します。学ぶ単元が変わったときは「学習するまとまりを変更」を押します。'],
    student:['児童概要','未解決の宿題・提出物を確認して解決し、メモ・評価・賞状・提出物を追加できます。','概要の未解決件数または機能別タブを押し、確認・追加ボタンから操作します。'],
    pupil:['児童用提出画面','一覧で自分の未提出を確認し、毎日の宿題・週宿題・提出物を記録します。','最初に「一覧」で名前を確認し、必要な機能へ移動して自分の名前を押します。',['緑の「提出」、赤の「忘れた」、灰色の「未提出・未確認」を確認します。','名前を押した直後は、色と0.5秒の動きで変更を知らせます。','右上の歯車は先生用です。教師用PINが必要です。']]
  };

  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function friendlyTerms(value){return String(value??'').replaceAll('新年度パスワード','新しいデータ保護パスワード').replaceAll('年度パスワード','データ保護パスワード').replaceAll('教師用PIN','教師画面PIN').replaceAll('復旧コード','緊急復旧コード').replaceAll('入力候補・タグ','メモ・賞状の選択肢').replaceAll('机約1列分の余白','氏名欄の約半分幅');}
  function applyFriendlyTerms(root){if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(node=>{const changed=friendlyTerms(node.nodeValue);if(changed!==node.nodeValue)node.nodeValue=changed;});root.querySelectorAll?.('[title],[aria-label],[placeholder]').forEach(element=>['title','aria-label','placeholder'].forEach(name=>{if(element.hasAttribute(name))element.setAttribute(name,friendlyTerms(element.getAttribute(name)));}));}
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function schoolYear(){const d=new Date();return d.getMonth()>=3?d.getFullYear():d.getFullYear()-1;}
  function yearNumberOf(year){const direct=Number(year?.yearNumber);if(Number.isFinite(direct)&&direct>0)return direct;const match=String(year?.label||'').match(/\d{4}/);return match?Number(match[0]):0;}
  function rolloverDue(){return Boolean(state.year&&schoolYear()>yearNumberOf(state.year));}
  function jpDate(value){if(!value)return'';const [y,m,d]=value.split('-').map(Number);return `${y}年${m}月${d}日`;}
  function shortJpDate(value){if(!value)return'';const date=new Date(`${value}T00:00:00`);const days=['日','月','火','水','木','金','土'];return `${date.getMonth()+1}月${date.getDate()}日（${days[date.getDay()]}）`;}
  function moveDate(value,days){const date=new Date(`${value}T00:00:00`);date.setDate(date.getDate()+days);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function daysBetween(later,earlier){return Math.floor((new Date(`${later}T00:00:00`)-new Date(`${earlier}T00:00:00`))/86400000);}
  function currentWeekStart(value=today()){return mondayOf(value);}
  function withinCurrentWeek(value,base=today()){return Boolean(value&&value>=currentWeekStart(base)&&value<=base);}
  function recentMonthStart(value=today()){return moveDate(value,-29);}
  function weekdayLabel(value){const days=['日','月','火','水','木','金','土'];return `${days[new Date(`${value}T00:00:00`).getDay()]}曜日提出分`;}
  function relativeHomeworkLabel(value,base=today()){const age=daysBetween(base,value);if(age===0)return'今日の分';if(age===1)return'きのうの分';if(age===2)return'おとといの分';return weekdayLabel(value);}
  function slashDate(value){const [,month,day]=value.split('-').map(Number);return `${month}/${day}`;}
  function pupilText(standard,kana){return state.pupilKanaMode?kana:standard;}
  function pupilClassName(classItem=selectedClass()){const name=String(classItem?.name||'');if(!state.pupilKanaMode)return name;return name.replace(/([1-6])年([0-9]+)組/g,(_,grade,group)=>`${grade}ねん${group}くみ`);}
  function pupilDateText(value){if(!state.pupilKanaMode)return shortJpDate(value);const date=new Date(`${value}T00:00:00`),days=['にち','げつ','か','すい','もく','きん','ど'];return `${date.getMonth()+1}がつ${date.getDate()}にち（${days[date.getDay()]}）`;}
  function pupilHomeworkDateLabel(value,base=today()){if(!state.pupilKanaMode)return relativeHomeworkLabel(value,base);const age=daysBetween(base,value);if(age===0)return'きょうの ぶん';if(age===1)return'きのうの ぶん';if(age===2)return'おとといの ぶん';const days=['にち','げつ','か','すい','もく','きん','ど'];return `${days[new Date(`${value}T00:00:00`).getDay()]}ようびの ぶん`;}
  function pupilStatusLabel(status){const labels={unconfirmed:['— 未確認','— まだ'],submitted:['✓ 提出','✓ だした'],forgotten:['! 忘れた','! わすれた'],unsubmitted:['— 未提出','— まだ'],absent:['— 欠席','— おやすみ']};const pair=labels[status]||[status,status];return pupilText(pair[0],pair[1]);}
  function selectedClass(){return state.classes.find(item=>item.id===state.selectedClassId)||state.classes[0]||null;}
  function featureIcon(id){return state.iconMode==='emoji'?(state.emojiIcons[id]||DEFAULT_EMOJI_ICONS[id]||'●'):(STANDARD_ICONS[id]||'●');}
  function rewardIconHtml(className='homework-medal'){return`<span class="${className}" title="直近1か月の設定条件を達成" aria-label="直近1か月の設定条件を達成">${esc(state.rewardIcon)}</span>`;}
  function isSupportClass(classItem){return classItem?.isSupport??Boolean(classItem?.isOwn&&state.year?.mode==='support');}
  function classSubjects(classItem){return Array.isArray(classItem?.recordSubjects)&&classItem.recordSubjects.length?classItem.recordSubjects:SUBJECTS;}
  function normalizeStudentName(value){return String(value||'').normalize('NFKC').replace(/[\s　・･.,、。]/g,'').toLowerCase();}
  function studentSupportSubjects(row,classItem){
    const configured=row?.enrollment?.supportSubjects;
    return Array.isArray(configured)&&configured.length?configured.filter(subject=>classSubjects(classItem).includes(subject)):classSubjects(classItem);
  }
  function contrastColor(hex){const raw=String(hex||'').replace('#',''),value=raw.length===3?raw.split('').map(x=>x+x).join(''):raw,channels=[0,2,4].map(index=>(parseInt(value.slice(index,index+2),16)||0)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4),luminance=.2126*channels[0]+.7152*channels[1]+.0722*channels[2],white=1.05/(luminance+.05),dark=(luminance+.05)/.058;return dark>=white?'#17201b':'#ffffff';}
  function validColor(value){return /^#[0-9a-f]{6}$/i.test(String(value||'').trim());}
  function applyClassTheme(classItem){
    const color=classItem?.color||'#397257';
    const text=contrastColor(color);
    document.documentElement.style.setProperty('--class-color',color);
    document.documentElement.style.setProperty('--class-text',text);
    document.documentElement.style.setProperty('--action',color);
    document.documentElement.style.setProperty('--action-text',text);
    document.querySelector('meta[name="theme-color"]').setAttribute('content',color);
  }
  function showToast(message){toastElement.innerHTML=`<span>${esc(message)}</span>`;toastElement.classList.remove('with-action');toastElement.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toastElement.classList.remove('show'),2200);}
  function showUndoToast(message,undo){toastElement.innerHTML=`<span>${esc(message)}</span><button type="button">元に戻す</button>`;toastElement.classList.add('show','with-action');clearTimeout(showToast.timer);const button=toastElement.querySelector('button');let available=true;button.addEventListener('click',async()=>{if(!available)return;available=false;button.disabled=true;await undo();toastElement.classList.remove('show','with-action');showToast('元に戻しました');});showToast.timer=setTimeout(()=>{available=false;toastElement.classList.remove('show','with-action');},7000);}
  function markFeedback(studentId,status){state.feedback={studentId,status,until:Date.now()+700};}
  function feedbackClass(studentId){const item=state.feedback;if(!item||item.studentId!==studentId||Date.now()>item.until)return'';return` just-updated feedback-${item.status||'changed'}`;}
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
    await purgeExpiredTrash();
    state.theme=await ClassDB.getMeta('themePreference',window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light');
    state.iconMode=await ClassDB.getMeta('featureIconMode','standard');
    state.emojiIcons={...DEFAULT_EMOJI_ICONS,...await ClassDB.getMeta('featureEmojiIcons',{})};
    state.rewardIcon=await ClassDB.getMeta('homeworkRewardIcon','✨');
    const legacyMonthly=await ClassDB.getMeta('showMonthlyForgotten',true),savedPupilOverview=await ClassDB.getMeta('pupilOverviewVisibility',{});
    state.pupilOverviewVisibility={daily:true,weekly:true,occasional:true,monthly:legacyMonthly,reward:true,...savedPupilOverview};
    state.showMonthlyForgotten=state.pupilOverviewVisibility.monthly;
    state.pupilKanaMode=Boolean(await ClassDB.getMeta('pupilKanaMode',false));
    const savedInformationMode=await ClassDB.getMeta('informationMode',null),legacyExplanations=await ClassDB.getMeta('showExplanations',true);
    state.informationMode=['compact','standard','detailed'].includes(savedInformationMode)?savedInformationMode:(legacyExplanations?'standard':'compact');state.showExplanations=state.informationMode!=='compact';state.rosterDensity=await ClassDB.getMeta('rosterDensity','auto');state.onboardingStep=Number(await ClassDB.getMeta('onboardingStep',0));
    applyTheme();
    const activeYearId=await ClassDB.getMeta('activeYearId');
    state.year=activeYearId?await ClassDB.get('years',activeYearId):null;
    if(!state.year){renderSetup();return;}
    restorePinAttempts();
    state.classes=(await ClassDB.getAllByIndex('classes','yearId',state.year.id)).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));
    if(!state.classes.length){await resetToWelcomePreservingLegacy();return;}
    state.selectedClassId=await ClassDB.getMeta('selectedClassId',state.classes[0]?.id||null);
    state.lastBackupAt=await ClassDB.getMeta('lastBackupAt',null);state.backupDismissedUntil=await ClassDB.getMeta('backupDismissedUntil',null);
    if(!state.classes.some(item=>item.id===state.selectedClassId))state.selectedClassId=state.classes[0]?.id||null;
    requireTeacher(renderHome);
  }

  async function purgeExpiredTrash(){const now=ClassDB.now(),expired=(await ClassDB.getAll('trash')).filter(item=>item.purgeAfter&&item.purgeAfter<now);for(const item of expired)await ClassDB.remove('trash',item.id);}

  function renderSetup(){
    state.route='setup';
    const sy=schoolYear();
    applyClassTheme({color:'#397257'});
    app.innerHTML=`
      <div class="app-shell">
        ${headerHtml('初回設定','',false,false)}
      <main class="page narrow">
          <section class="welcome-card"><span class="setup-kicker">最初の準備 1 / 2</span><h1>ようこそ</h1><p>まずクラス名と、先生だけが使う番号を登録します。次の画面で児童名を登録すれば、すぐに宿題の提出確認を始められます。</p><ol class="setup-checklist"><li class="current"><strong>いま：</strong>クラスと先生用の番号を決める</li><li><strong>つぎ：</strong>児童の氏名を登録する</li><li><strong>完了：</strong>教師ホームから「毎日の宿題」を開く</li></ol><details class="setup-existing"><summary>以前のデータを戻したい場合</summary><div class="button-row section"><button type="button" class="button" id="setup-restore">保存したバックアップから戻す</button><button type="button" class="button" id="setup-legacy-check">以前のツールのデータを確認</button></div></details></section>
          <div class="setup-steps"><span class="step active"></span><span class="step"></span></div>
          <h1>クラスの準備</h1>
          <p class="muted">上から順に入力してください。「通常はそのままでよい」と書かれた項目は、必要な場合だけ変更します。</p>
          <form id="setup-form" class="panel setup-form">
            <section class="setup-block"><h2><span>1</span> クラスを登録</h2><div class="form-grid">
            <div class="field"><label for="setup-year">年度</label><input class="input" id="setup-year" type="number" min="2020" max="2100" value="${sy}" required></div>
            <div class="field"><label for="setup-mode">クラスの種類</label><select class="select" id="setup-mode"><option value="general">一般級</option><option value="support">個別支援級</option></select></div>
            <div class="field" id="setup-general-name"><label>一般級の学年・組</label><div class="inline-class-name"><select class="select" id="setup-grade" required><option value="">学年</option>${[1,2,3,4,5,6].map(n=>`<option value="${n}">${n}年</option>`).join('')}</select><input class="input" id="setup-group" value="" placeholder="例：2" aria-label="組" required><span>組</span></div></div>
            <div class="field" id="setup-support-name" hidden><label for="setup-class">個別支援級の名前</label><input class="input" id="setup-class" value="" placeholder="例：ひまわり"></div>
            <div class="field full"><span class="field-label">クラスカラー</span><div class="color-choices" id="setup-colors">${colorButtons('#397257')}</div></div>
            </div></section>
            <details class="setup-optional"><summary>学校の期間を確認する <small>通常はそのままで大丈夫です</small></summary><div class="form-grid section">
              <div class="field"><label for="setup-start">年度開始日</label><input class="input" id="setup-start" type="date" value="${sy}-04-01" required></div>
              <div class="field"><label for="setup-term">前期終了日</label><input class="input" id="setup-term" type="date" value="${sy}-10-10" required></div>
              <div class="field"><label for="setup-end">後期終了日</label><input class="input" id="setup-end" type="date" value="${sy+1}-03-31" required></div>
            </div></details>
            <section class="setup-block"><h2><span>2</span> 先生用の番号を決める</h2><p class="muted small">児童用画面から教師ホームへ戻るときに使います。数字6桁を決めてください。</p><div class="form-grid">
            <div class="field"><label for="setup-pin">教師用PIN（6桁）</label><input class="input pin-input" id="setup-pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div>
            <div class="field"><label for="setup-pin2">PIN確認</label><input class="input pin-input" id="setup-pin2" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="new-password" required></div>
            </div></section>
            <section class="setup-block"><h2><span>3</span> 保存データを守る言葉を決める</h2><p class="muted small">月1回のバックアップや、iPadとPCの記録をまとめるときに使います。普段の画面移動では入力しません。</p><div class="form-grid">
            <div class="field"><label for="setup-password">年度パスワード</label><input class="input" id="setup-password" type="password" autocomplete="new-password" minlength="8" required></div>
            <div class="field"><label for="setup-password2">パスワード確認</label><input class="input" id="setup-password2" type="password" autocomplete="new-password" minlength="8" required></div>
            <div class="field full"><p class="muted small">PCログイン時のパスワードのように、自分には覚えやすく、ほかの人には推測されにくい8文字以上がおすすめです。</p></div>
            <div class="field full"><label for="setup-hint">忘れたときのヒント（児童名などは入れない）</label><input class="input" id="setup-hint"></div>
            </div></section>
            <div class="field full setup-submit"><p class="error" id="setup-error" role="alert"></p><button class="button primary large-action" type="submit">保存して児童登録へ進む</button><p class="muted small">次の画面で、緊急時に使うコードを一度だけ保存します。</p></div>
          </form>
        </main>
      </div>`;
    wireColorChoices(document.getElementById('setup-colors'));
    const toggleSetupClass=()=>{const support=document.getElementById('setup-mode').value==='support';document.getElementById('setup-general-name').hidden=support;document.getElementById('setup-support-name').hidden=!support;document.getElementById('setup-group').required=!support;document.getElementById('setup-class').required=support;};document.getElementById('setup-mode').addEventListener('change',toggleSetupClass);toggleSetupClass();
    document.getElementById('setup-restore').addEventListener('click',openPasswordRecovery);
    document.getElementById('setup-legacy-check').addEventListener('click',()=>{const legacy=LegacyMigration.fromStorage();showToast(legacy.length?`${legacy.length}件の旧データが見つかりました。初期設定後に移行できます`:'旧データは見つかりませんでした');});
    document.getElementById('setup-form').addEventListener('submit',prepareSetup);
  }

  function applyTheme(){document.documentElement.dataset.theme=state.theme;document.documentElement.dataset.information=state.informationMode;document.documentElement.dataset.explanations=state.informationMode==='compact'?'false':'true';document.querySelectorAll('[data-theme-toggle]').forEach(button=>{button.textContent=state.theme==='dark'?'☀':'☾';button.setAttribute('aria-label',state.theme==='dark'?'ライトモードに切り替え':'ダークモードに切り替え');button.title=button.getAttribute('aria-label');});}
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
    const mode=document.getElementById('setup-mode').value,gradeLevel=mode==='general'?Number(document.getElementById('setup-grade').value):null,group=mode==='general'?document.getElementById('setup-group').value.trim():'',className=mode==='support'?document.getElementById('setup-class').value.trim():`${gradeLevel}年${group}組`;
    if((mode==='general'&&(!gradeLevel||!group))||(mode==='support'&&!className)){error.textContent=mode==='general'?'学年と組を入力してください。':'クラス名を入力してください。';return;}
    state.setupDraft={
      year:{id:ClassDB.uid('year'),label:`${yearNumber}年度`,yearNumber,startDate:start,firstTermEnd:term,endDate:end,mode:document.getElementById('setup-mode').value,passwordHint:document.getElementById('setup-hint').value.trim(),auth:await createVerifier(password),pinAuth:await createVerifier(pin),recoveryAuth:await createVerifier(code),recoverySecretProtected:await protectText(code,password)},
      classItem:{id:ClassDB.uid('class'),name:className,gradeLevel,color:document.querySelector('[data-color-code]').value.trim(),isOwn:true,isSupport:mode==='support',recordSubjects:[...SUBJECTS],order:0},
      code,secret:password
    };
    if(!validColor(state.setupDraft.classItem.color)){error.textContent='カラーコードは #397257 のように入力してください。';state.setupDraft=null;return;}
    renderRecoveryConfirmation();
  }

  function renderRecoveryConfirmation(){
    state.route='setup-recovery';
    const {code}=state.setupDraft;
    app.innerHTML=`
      <div class="app-shell">${headerHtml('復旧コード','',false,false)}
      <main class="page narrow"><div class="setup-steps"><span class="step active"></span><span class="step active"></span></div>
        <h1>復旧コードを別に保管</h1><p class="muted">年度パスワードを忘れたときに使います。端末やバックアップと別の場所へ保管してください。</p>
        <section class="panel"><p class="field-label">${esc(state.setupDraft.year.label)} 復旧コード</p><p style="font-size:1.35rem;letter-spacing:.08em;font-weight:600;word-break:break-all">${esc(code)}</p>
          <div class="button-row"><button type="button" class="button" id="copy-code">コピー</button><button type="button" class="button" id="save-code">TXT保存</button><button type="button" class="button" id="print-code">印刷</button></div>
        </section>
        <form id="recovery-form" class="panel"><div class="field"><label for="recovery-confirm">保管したコードを再入力</label><input class="input" id="recovery-confirm" autocomplete="off" required></div><p class="error" id="recovery-error" role="alert"></p><div class="button-row end"><button type="button" class="button" id="setup-back">戻る</button><button type="submit" class="button primary">設定を完了</button></div></form>
      </main>${teacherFooter('home')}</div>`;
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
    await ClassDB.setMeta('onboardingStep',2);
    state.year=year;state.classes=[classItem];state.selectedClassId=classItem.id;state.setupDraft=null;state.onboardingStep=2;
    unlockTeacher();
    state.settingsTab='classes';state.classSettingsView='roster';state.rosterDraft=[{number:1,name:'',grade:classItem.gradeLevel||'',gender:''}];state.rosterLoadedForClassId=classItem.id;
    renderSettings();showToast('続いて名簿を登録してください');
  }

  function downloadText(name,text){name=friendlyTerms(name);text=friendlyTerms(text);const type=/\.json$/i.test(name)?'application/json;charset=utf-8':'text/plain;charset=utf-8',blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
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
    openDialog(`<h2>復旧コードで開く</h2><p class="muted">この端末にデータが残っていれば、復旧コードだけで年度パスワードを再設定できます。新しい端末やデータ消失時は暗号化バックアップも選んでください。</p>${state.year?.passwordHint?`<p class="panel small">パスワードのヒント：${esc(state.year.passwordHint)}</p>`:''}<form id="password-recovery-form"><div class="field"><label for="recovery-backup-file">暗号化バックアップ（別端末・データ消失時のみ）</label><input class="input" id="recovery-backup-file" type="file" accept=".json,application/json"></div><div class="field section"><label for="recovery-code-input">復旧コード</label><input class="input" id="recovery-code-input" autocomplete="off" required></div><div class="form-grid section"><div class="field"><label for="recovery-new-password">新しい年度パスワード</label><input class="input" id="recovery-new-password" type="password" minlength="8" required></div><div class="field"><label for="recovery-new-password2">新しいパスワードの確認</label><input class="input" id="recovery-new-password2" type="password" minlength="8" required></div></div><p class="error" id="password-recovery-error"></p><div class="dialog-actions"><button type="button" class="button" id="password-recovery-cancel">キャンセル</button><button type="submit" class="button primary">復旧してパスワードを変更</button></div></form>`);
    document.getElementById('password-recovery-cancel').addEventListener('click',closeDialog);document.getElementById('password-recovery-form').addEventListener('submit',recoverPasswordFromBackup);
  }

  async function recoverPasswordFromBackup(event){
    event.preventDefault();
    const error=document.getElementById('password-recovery-error'),file=document.getElementById('recovery-backup-file').files[0],code=document.getElementById('recovery-code-input').value.trim().toUpperCase(),password=document.getElementById('recovery-new-password').value,password2=document.getElementById('recovery-new-password2').value;
    if(password!==password2){error.textContent='新しいパスワードが一致しません。';return;}
    if(password.length<8){error.textContent='新しいパスワードは8文字以上にしてください。';return;}
    error.textContent='復旧処理中です…';
    try{
      if(!file&&state.year){if(!await verifySecret(code,state.year.recoveryAuth))throw new Error('復旧コードが一致しません');state.year=await ClassDB.put('years',{...state.year,auth:await createVerifier(password),recoverySecretProtected:await protectText(code,password)});unlockTeacher(password);closeDialog();showToast('復旧コードで年度パスワードを再設定しました');renderHome();return;}
      if(!file)throw new Error('この端末に年度データがないため、暗号化バックアップを選んでください');
      const envelope=validateEncryptedEnvelope(JSON.parse(await readImportText(file,'暗号化バックアップ'))),payload=validateSyncPayload(await decryptEnvelope(envelope,code,'recovery'));
      const payloadYear=payload.data.years.find(item=>item.id===payload.yearId);
      if(payloadYear.recoveryAuth&&!await verifySecret(code,payloadYear.recoveryAuth))throw new Error('復旧コードが一致しません');
      const timestamp=ClassDB.now(),deviceId=ClassDB.deviceId(),updatedYear={...payloadYear,auth:await createVerifier(password),recoverySecretProtected:await protectText(code,password),updatedAt:timestamp,deviceId};
      const classes=payload.data.classes.filter(item=>item.yearId===updatedYear.id).sort((a,b)=>(b.isOwn-a.isOwn)||(a.order-b.order));
      if(!classes.length)throw new Error('復旧できるクラスがありません');
      const selectedClassId=classes[0].id,meta=payload.data.meta.filter(item=>!['activeYearId','selectedClassId','lastMode','preSyncSnapshots'].includes(item.key));
      meta.push({key:'activeYearId',value:updatedYear.id,updatedAt:timestamp,deviceId},{key:'selectedClassId',value:selectedClassId,updatedAt:timestamp,deviceId});
      const replacement={...payload.data,years:payload.data.years.map(item=>item.id===updatedYear.id?updatedYear:item),meta};
      openDialog(`<h2>${esc(payload.yearLabel)}を復旧しますか</h2><p>クラス ${classes.length}件、児童 ${payload.data.students.length}人、記録 ${payload.data.records.length}件を確認しました。</p><p class="notice"><strong>この端末に現在ある新形式データを、選んだバックアップの内容へ置き換えます。</strong><br>以前のツール用データは削除しません。</p><div class="dialog-actions"><button type="button" class="button" id="recovery-replace-cancel">キャンセル</button><button type="button" class="button primary" id="recovery-replace-confirm">確認して復旧</button></div>`);
      document.getElementById('recovery-replace-cancel').addEventListener('click',closeDialog);
      document.getElementById('recovery-replace-confirm').addEventListener('click',event=>runOnce(event.currentTarget,async()=>{try{await ClassDB.replaceAllRaw(replacement);state.year=updatedYear;state.classes=classes;state.selectedClassId=selectedClassId;unlockTeacher(password);closeDialog();showToast('バックアップを復旧し、新しい年度パスワードを設定しました');renderHome();}catch(problem){openDialog(`<h2>復旧を完了できませんでした</h2><p>${esc(problem.message||'端末への保存に失敗しました')}</p><p class="muted">元のデータは変更されていません。空き容量を確認して、もう一度お試しください。</p><div class="dialog-actions"><button type="button" class="button primary" id="recovery-error-close">OK</button></div>`);document.getElementById('recovery-error-close').addEventListener('click',closeDialog);}}));
    }catch(problem){error.textContent=problem.message||'復旧できませんでした';}
  }

  async function setOnboardingStep(step){state.onboardingStep=step;await ClassDB.setMeta('onboardingStep',step);}
  function onboardingBannerHtml(){if(!state.onboardingStep)return'';const data={2:['2 / 4','児童を登録します','氏名を入力して「この児童を登録」を押してください。'],3:['3 / 4','毎日の宿題を開きます','名簿登録はできています。次に、教師ホームの「毎日の宿題」を開いて画面を確認します。'],4:['4 / 4','児童用画面を確認します','提出確認画面を確認できました。最後に「児童用の提出画面」を開けば準備完了です。']}[state.onboardingStep];if(!data)return'';return`<section class="onboarding-banner"><span>はじめの準備 ${data[0]}</span><div><strong>${data[1]}</strong><p>${data[2]}</p></div><button type="button" class="button" data-onboarding-stop>案内を終了</button></section>`;}
  function wireOnboardingStop(){document.querySelector('[data-onboarding-stop]')?.addEventListener('click',async()=>{await setOnboardingStep(0);document.querySelector('.onboarding-banner')?.remove();showToast('初回案内を終了しました');});}
