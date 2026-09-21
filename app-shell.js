"use strict";

  async function renderHome(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-home';state.dataInSettings=false;
    await ClassDB.setMeta('lastMode','teacher');
    const classItem=selectedClass();
    applyClassTheme(classItem);
    const counts=await attentionCounts(classItem?.id);
    const own=classItem?.isOwn;
    const support=isSupportClass(classItem);
    const dashboard=await dashboardHtml(counts);
    const rosterCount=classItem?(await rosterForClass(classItem.id)).length:0;
    const rosterPrompt=!rosterCount?`<section class="panel start-here"><h2>次にすること：児童を登録</h2><p>まだ名簿がありません。先に児童の氏名を登録すると、宿題・メモ・評価を使えるようになります。</p><button type="button" class="button primary" id="home-open-roster">児童を登録する</button></section>`:'';
    app.innerHTML=`<div class="app-shell">
      ${headerHtml('教師用ホーム','',true)}
      <main class="page">
        ${rolloverNoticeHtml()}
        ${backupNoticeHtml()}
        ${onboardingBannerHtml()}
        ${state.classes.length>1?`<nav class="class-tabs compact-class-tabs" aria-label="クラス選択">${state.classes.map(item=>`<button type="button" class="class-tab" data-class-id="${item.id}" aria-pressed="${item.id===state.selectedClassId}"><span class="class-tab-dot" style="--tab-color:${esc(item.color||'#397257')}"></span>${esc(item.name)}${item.id===state.selectedClassId?'<small>操作中</small>':''}</button>`).join('')}</nav>`:''}
        ${dashboard}
        ${homeNavigationHintHtml()}
        ${rosterPrompt}
        <section class="tools-main ${!own&&!support?'limited':'core-tools'}">
          ${!own&&!support?`${toolHtml('assessment','A','ノート評価',0,true)}${toolHtml('records','記','児童の記録',counts.memo)}${toolHtml('occasional','▤','提出物',counts.occasional)}${toolHtml('tests','テ','小テスト',0)}${toolHtml('grades','点','成績管理',0)}`:`
          ${support?toolHtml('records','記','児童の記録',counts.memo,true):toolHtml('daily','✓','毎日の宿題',counts.daily,true)}
          ${support?toolHtml('daily','✓','毎日の宿題',counts.daily):toolHtml('weekly','▣','週宿題',counts.weekly)}
          ${support?toolHtml('weekly','▣','週宿題',counts.weekly):toolHtml('records','記','児童の記録',counts.memo)}
          ${toolHtml('certificate','☆','ミニ賞状',0)}
          ${toolHtml('assessment','A','ノート評価',0)}`}
        </section>
        ${own||support?`<section class="tools-sub">
          ${toolHtml('occasional','▤','提出物',counts.occasional)}
          ${toolHtml('tests','テ','小テスト',0)}
          ${own?toolHtml('seating','▦','席替え',0):''}
          ${toolHtml('grades','点','成績管理',0)}
          ${own?toolHtml('reports','文','所見素材',0):''}
          ${support?toolHtml('support','◇','学習記録',counts.support):''}
        </section>`:''}
        <div class="home-footer"><button type="button" class="button primary" id="pupil-mode">児童用の提出画面</button></div>
      </main>${teacherFooter('home')}</div>`;
    document.querySelectorAll('[data-class-id]').forEach(button=>button.addEventListener('click',async()=>{state.selectedClassId=button.dataset.classId;state.rosterDraft=[];state.rosterLoadedForClassId=null;await ClassDB.setMeta('selectedClassId',state.selectedClassId);renderHome();}));
    document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>openTool(button.dataset.tool)));
    document.querySelectorAll('[data-footer-tool]').forEach(button=>button.addEventListener('click',()=>openFooterItem(button.dataset.footerTool)));
    document.getElementById('pupil-mode').addEventListener('click',()=>renderPupil('all'));
    document.getElementById('home-open-roster')?.addEventListener('click',()=>{state.settingsTab='classes';state.classSettingsView='roster';state.rosterDraft=[];state.rosterLoadedForClassId=null;renderSettings();});
    wireOnboardingStop();
    wireCommonHeader('home');
    document.getElementById('start-rollover')?.addEventListener('click',renderYearRollover);
    document.getElementById('backup-from-home')?.addEventListener('click',openDataManagement);document.getElementById('backup-later')?.addEventListener('click',async()=>{const until=new Date(Date.now()+7*86400000).toISOString();state.backupDismissedUntil=until;await ClassDB.setMeta('backupDismissedUntil',until);renderHome();});
    if(!state.migrationPromptShown&&!await ClassDB.getMeta('lastLegacyMigration',null)){const legacy=LegacyMigration.fromStorage();if(legacy.length){state.migrationPromptShown=true;openDialog(`<h2>以前の形式のデータが見つかりました</h2><p>${legacy.length}件のデータ群があります。内容と移行先を確認してから一括移行できます。</p><div class="dialog-actions"><button type="button" class="button" id="legacy-prompt-later">後で</button><button type="button" class="button primary" id="legacy-prompt-review">内容を確認</button></div>`);document.getElementById('legacy-prompt-later').addEventListener('click',closeDialog);document.getElementById('legacy-prompt-review').addEventListener('click',()=>{closeDialog();openLegacyMigrationReview(legacy);});}}
    if(!dialog.open)maybePromptWeeklyCreation('teacher');
  }

  function connectionStatusHtml(){return`<span class="connection-chip ${navigator.onLine?'online':'offline'}" id="connection-chip" ${navigator.onLine?'hidden':''}><span></span>オフライン・端末保存</span>`;}
  function saveStatusHtml(){const synced=state.lastSyncAt?`最終同期 ${new Date(state.lastSyncAt).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'})}`:'端末保存・同期未実施';return`<span class="save-status-chip" title="記録はこの端末に自動保存されます。${state.lastSyncAt?`最終同期：${new Date(state.lastSyncAt).toLocaleString('ja-JP')}`:'端末間の同期はまだ行っていません。'}">● ${esc(synced)}</span>`;}
  function headerHtml(subtitle,actions='',homeActive=false,teacherControls=true){const classItem=selectedClass();if(!teacherControls)return `<header class="app-header pupil-header"><div class="pupil-header-title">${esc(pupilClassName(classItem))}　${esc(pupilText('提出','ていしゅつ'))}</div><div class="header-actions">${actions}${connectionStatusHtml()}</div></header>`;const context=`<div class="header-context"><button type="button" class="class-context-button" data-current-class title="現在のクラスを確認・変更"><span class="class-context-dot"></span><span><small>現在のクラス</small><strong>${esc(classItem?.name||'クラス未設定')}</strong></span><span aria-hidden="true">⌄</span></button></div>`,menu=`<button type="button" class="header-button home-menu-button" data-home-menu aria-label="やりたいことから選ぶ" title="やりたいことから選ぶ"><span aria-hidden="true">☰</span></button>`,brand=`<button type="button" class="app-title brand-home" data-common-home title="教師用ホームへ戻る">クラス支援ツール</button>`,common=`<button type="button" class="header-button home-button ${homeActive?'active':''}" data-common-home aria-current="${homeActive?'page':'false'}" title="教師用ホームへ戻る"><span aria-hidden="true">⌂</span> ホーム</button><button type="button" class="header-button" data-common-settings title="設定を開く">⚙ 設定</button><button type="button" class="header-button header-icon" data-context-help aria-label="この画面の使い方" title="この画面の使い方">?</button>`;return `<header class="app-header">${menu}<div class="brand-block">${brand}<div class="app-subtitle">${esc(state.year?.label||'')}　${esc(subtitle)}</div>${context}${saveStatusHtml()}${connectionStatusHtml()}</div><div class="header-actions">${common}${actions}</div></header>`;}

  function homeNavigationHintHtml(){return`<aside class="home-navigation-hint" aria-label="画面の使い分け"><span><b>中央</b>今日の記録</span><span><b>下部</b>いつもの機能</span><span><b>左上☰</b>設定・低頻度の機能</span></aside>`;}
  function openHomeMenu(){
    const classItem=selectedClass(),own=classItem?.isOwn,support=isSupportClass(classItem),tasks=[],managementTasks=[];
    if(own||support)tasks.push(['daily','毎日の宿題','今日の提出を確認']);
    if(own||support)tasks.push(['weekly','週宿題','今週分の提出を確認']);
    tasks.push(['records','児童の記録','メモと行動の○を記録'],['assessment','ノート評価','ノートをすばやく評価'],['certificate','ミニ賞状','渡した児童を記録'],['occasional','提出物','書類などの提出を確認'],['tests','小テスト','漢字・計算テストを直接入力']);
    managementTasks.push(['grades','成績管理','紙テスト取込と成績一覧']);
    if(support)managementTasks.push(['support','学習記録','教科・単元ごとに記録']);
    if(own)managementTasks.push(['seating','席替え','条件を設定して席替え'],['reports','所見素材','記録から素材を作成']);
    document.getElementById('home-menu-drawer')?.remove();document.getElementById('home-menu-backdrop')?.remove();
    const previous=document.activeElement,backdrop=document.createElement('button'),drawer=document.createElement('aside');backdrop.id='home-menu-backdrop';backdrop.className='home-menu-backdrop';backdrop.type='button';backdrop.setAttribute('aria-label','メニューを閉じる');drawer.id='home-menu-drawer';drawer.className='home-menu-drawer';drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','やりたいことから選ぶ');drawer.innerHTML=`<div class="home-menu-head"><div><small>操作中</small><h2>${esc(classItem?.name||'クラス未設定')}</h2></div><button type="button" class="header-button header-icon" data-home-menu-close aria-label="閉じる">×</button></div><p class="muted small">毎日の記録は中央・下部メニューから開けます。ここでは、記録の確認と準備・集計をまとめています。</p><h3 class="home-menu-heading">記録する</h3><nav class="home-menu-list" aria-label="記録する">${tasks.map(([id,label,description])=>`<button type="button" data-home-menu-tool="${id}"><span class="tool-icon" aria-hidden="true">${featureIcon(id)}</span><span><strong>${esc(label)}</strong><small>${esc(description)}</small></span><b>›</b></button>`).join('')}</nav>${managementTasks.length?`<div class="home-menu-section"><h3>準備・集計（ときどき）</h3><nav class="home-menu-list" aria-label="準備と集計">${managementTasks.map(([id,label,description])=>`<button type="button" data-home-menu-tool="${id}"><span class="tool-icon" aria-hidden="true">${featureIcon(id)}</span><span><strong>${esc(label)}</strong><small>${esc(description)}</small></span><b>›</b></button>`).join('')}</nav></div>`:''}<div class="home-menu-section"><h3>設定・児童用画面</h3><button type="button" data-home-menu-settings="classes"><span>👥</span><span><strong>クラス・児童</strong><small>クラスや名簿を変更</small></span><b>›</b></button><button type="button" data-home-menu-settings="appearance"><span>◐</span><span><strong>画面と操作</strong><small>表示と下部メニューを変更</small></span><b>›</b></button><button type="button" data-home-menu-settings="data"><span>⇄</span><span><strong>データと安全</strong><small>同期、保存、年度、PIN</small></span><b>›</b></button><button type="button" data-home-menu-pupil><span>☝</span><span><strong>児童用の提出画面</strong><small>児童に操作してもらう</small></span><b>›</b></button></div>`;
    const classSettings=drawer.querySelector('[data-home-menu-settings="classes"]'),operationSettings=drawer.querySelector('[data-home-menu-settings="appearance"]'),safetySettings=drawer.querySelector('[data-home-menu-settings="data"]');if(classSettings)classSettings.querySelector('strong').textContent='クラスと児童';if(operationSettings){operationSettings.dataset.homeMenuSettings='operation';operationSettings.querySelector('strong').textContent='画面と操作';operationSettings.querySelector('small').textContent='表示と下部メニューを変更';}if(safetySettings){safetySettings.dataset.homeMenuSettings='safety';safetySettings.querySelector('strong').textContent='データと安全';safetySettings.querySelector('small').textContent='同期、保存、年度、PIN';}
    const close=()=>{document.removeEventListener('keydown',onKey);backdrop.remove();drawer.remove();previous?.focus?.();},onKey=event=>{if(event.key==='Escape'){close();return;}if(event.key==='Tab'){const focusable=[...drawer.querySelectorAll('button')],first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};document.body.append(backdrop,drawer);document.addEventListener('keydown',onKey);requestAnimationFrame(()=>{backdrop.classList.add('open');drawer.classList.add('open');drawer.querySelector('[data-home-menu-close]').focus();});backdrop.addEventListener('click',close);drawer.querySelector('[data-home-menu-close]').addEventListener('click',close);drawer.querySelectorAll('[data-home-menu-tool]').forEach(button=>button.addEventListener('click',()=>{const tool=button.dataset.homeMenuTool;close();openTool(tool);}));drawer.querySelectorAll('[data-home-menu-settings]').forEach(button=>button.addEventListener('click',()=>{state.settingsTab=button.dataset.homeMenuSettings;state.classSettingsView='list';close();renderSettings();}));drawer.querySelector('[data-home-menu-pupil]').addEventListener('click',()=>{close();renderPupil('all');});
  }
  function updateConnectionStatus(){const chip=document.getElementById('connection-chip');if(!chip)return;chip.hidden=navigator.onLine;chip.className=`connection-chip ${navigator.onLine?'online':'offline'}`;chip.innerHTML='<span></span>オフライン・端末保存';}
  function wireCommonHeader(helpKey='home'){
    document.querySelector('[data-home-menu]')?.addEventListener('click',openHomeMenu);
    document.querySelectorAll('[data-common-home]').forEach(button=>button.addEventListener('click',()=>navigateSafely(renderHome)));
    const settingsButton=document.querySelector('[data-common-settings]');if(state.route==='teacher-settings'){settingsButton?.classList.add('settings-active');settingsButton?.setAttribute('aria-current','page');}
    settingsButton?.addEventListener('click',()=>navigateSafely(()=>{state.settingsTab='guide';state.classSettingsView='list';renderSettings();}));
    document.querySelector('[data-context-help]')?.addEventListener('click',()=>openContextHelp(helpKey));
    document.querySelector('[data-current-class]')?.addEventListener('click',openClassSwitcher);
    applyTheme();
  }
  function openClassSwitcher(){openDialog(`<h2>操作するクラスを選択</h2><p class="muted">選んだクラスが、以後の記録先になります。</p><div class="class-switch-list">${state.classes.map(item=>`<button type="button" class="class-switch-option" data-switch-class="${item.id}" aria-pressed="${item.id===state.selectedClassId}"><span class="class-tab-dot" style="--tab-color:${esc(item.color||'#397257')}"></span><span><strong>${esc(item.name)}</strong><small>${item.isOwn?'自分のクラス':'担当クラス'}・${isSupportClass(item)?'個別支援級':'一般級'}</small></span>${item.id===state.selectedClassId?'<b>選択中</b>':''}</button>`).join('')}</div><div class="dialog-actions"><button type="button" class="button" id="class-switch-close">閉じる</button></div>`);document.getElementById('class-switch-close').addEventListener('click',closeDialog);document.querySelectorAll('[data-switch-class]').forEach(button=>button.addEventListener('click',async()=>{state.selectedClassId=button.dataset.switchClass;state.rosterDraft=[];state.rosterLoadedForClassId=null;state.toolDraft={};await ClassDB.setMeta('selectedClassId',state.selectedClassId);closeDialog();renderHome();}));}
  function openContextHelp(key){const topic=HELP_TOPICS[key]||HELP_TOPICS.home,related={daily:['宿題表示の設定','appearance'],weekly:['クラス・児童設定','classes'],memo:['入力候補・タグ設定','tags'],certificate:['賞状タグの設定','tags'],assessment:['記録教科の設定','classes'],occasional:['クラス・児童設定','classes'],seating:['クラス・児童設定','classes'],appearance:['表示・アイコン設定','appearance']}[key];document.getElementById('context-help-drawer')?.remove();document.getElementById('help-drawer-backdrop')?.remove();const previous=document.activeElement,backdrop=document.createElement('button'),drawer=document.createElement('aside');backdrop.id='help-drawer-backdrop';backdrop.className='help-drawer-backdrop';backdrop.type='button';backdrop.setAttribute('aria-label','ヘルプを閉じる');drawer.id='context-help-drawer';drawer.className='help-drawer';drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','この画面の使い方');drawer.innerHTML=`<div class="help-drawer-head"><h2>${esc(topic[0])}</h2><button type="button" class="header-button header-icon" data-help-close aria-label="閉じる">×</button></div><h3>できること</h3><p>${esc(topic[1])}</p><h3>最初の操作</h3><p>${esc(topic[2])}</p>${topic[3]?.length?`<h3>迷ったとき</h3><ol class="help-steps">${topic[3].map(item=>`<li>${esc(item)}</li>`).join('')}</ol>`:''}<div class="button-row section">${related?`<button type="button" class="button primary" data-related-settings>${esc(related[0])}</button>`:''}<button type="button" class="button" data-full-help>ヘルプ・FAQで探す</button></div>`;const close=()=>{document.removeEventListener('keydown',onKey);backdrop.remove();drawer.remove();previous?.focus?.();},onKey=event=>{if(event.key==='Escape')close();if(event.key==='Tab'){const focusable=[...drawer.querySelectorAll('button,[href],input,select,textarea')],first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};document.body.append(backdrop,drawer);document.addEventListener('keydown',onKey);requestAnimationFrame(()=>{backdrop.classList.add('open');drawer.classList.add('open');drawer.querySelector('[data-help-close]').focus();});backdrop.addEventListener('click',close);drawer.querySelector('[data-help-close]').addEventListener('click',close);drawer.querySelector('[data-related-settings]')?.addEventListener('click',()=>{close();state.settingsTab=related[1];state.classSettingsView='list';renderSettings();});drawer.querySelector('[data-full-help]').addEventListener('click',()=>{close();if(key==='pupil')requireTeacher(renderHelp);else renderHelp();});}
  function toolHtml(id,_icon,name,count=0,daily=false){return `<button type="button" class="tool${daily?' daily':''}" data-tool="${id}" title="${esc(name)}を開く">${count?`<span class="count-badge" aria-label="対応が必要な児童 ${count}人"><small>要対応</small>${count}人</span>`:''}<span class="tool-icon" aria-hidden="true">${featureIcon(id)}</span><span>${name}</span></button>`;}
  function operationTipHtml(summary,detail){return `<details class="operation-tip" ${state.informationMode==='detailed'?'open':''}><summary>${esc(summary)}</summary><p>${esc(detail)}</p></details>`;}
  async function dashboardHtml(counts){const items=[['毎日の宿題',counts.daily],['週宿題',counts.weekly],['提出物',counts.occasional],['児童メモ',counts.memo]].filter(item=>item[1]>0);const summary=items.length?items.map(([label,count])=>`${label} ${count}人`).join('　／　'):'要対応はありません';const sync=state.lastSyncAt?`最終同期 ${new Date(state.lastSyncAt).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'})}`:'端末保存中・同期は未実施';return`<section class="dashboard attention-dashboard"><div class="dashboard-primary"><strong>今日の確認</strong><span>${esc(summary)}</span></div><small class="dashboard-save-status">${esc(sync)}</small></section>`;}
  function backupNoticeHtml(){const last=state.lastBackupAt?new Date(state.lastBackupAt).getTime():0;const dismissed=state.backupDismissedUntil?new Date(state.backupDismissedUntil).getTime():0;const due=!last||Date.now()-last>=30*86400000;if(!due||Date.now()<dismissed)return'';return`<div class="notice"><div><strong>暗号化バックアップの時期です</strong><div class="row-meta">${last?'前回から1か月以上経過しています。':'最初のバックアップを保存してください。'}</div></div><div class="button-row"><button type="button" class="button" id="backup-later">後で</button><button type="button" class="button primary" id="backup-from-home">バックアップ</button></div></div>`;}
  function rolloverNoticeHtml(){if(!rolloverDue())return'';return`<div class="notice rollover-notice"><div><strong>${schoolYear()}年度への切り替えが必要です</strong><div class="row-meta">現在は${esc(state.year.label)}のままです。案内は切り替えるまで表示されます。</div></div><button type="button" class="button primary" id="start-rollover">新年度へ切り替える</button></div>`;}

  const PUPIL_OVERVIEW_OPTIONS=[['daily','今週の毎日の宿題の忘れ'],['weekly','今週の週宿題の未提出'],['occasional','回収中の提出物の未提出'],['monthly','この1か月の忘れ回数'],['reward','条件達成アイコン']];
  function pupilOverviewOptionsHtml(prefix){return`<div class="pupil-overview-options">${PUPIL_OVERVIEW_OPTIONS.map(([key,label])=>`<label class="check-row"><input type="checkbox" id="${prefix}-${key}" ${state.pupilOverviewVisibility[key]?'checked':''}> ${label}</label>`).join('')}</div><p class="muted small">毎日の宿題・週宿題・提出物を外すと、「一覧」のお知らせと児童用の該当タブの両方から隠れます。忘れ回数・達成アイコンも同じ設定で隠せます。</p>`;}
  function readPupilOverviewOptions(prefix){return Object.fromEntries(PUPIL_OVERVIEW_OPTIONS.map(([key])=>[key,document.getElementById(`${prefix}-${key}`).checked]));}
  async function savePupilOverviewOptions(options){state.pupilOverviewVisibility={...state.pupilOverviewVisibility,...options};state.showMonthlyForgotten=state.pupilOverviewVisibility.monthly;await ClassDB.setMeta('pupilOverviewVisibility',state.pupilOverviewVisibility);await ClassDB.setMeta('showMonthlyForgotten',state.showMonthlyForgotten);}

  async function openTool(tool){
    if(tool==='memo')state.toolDraft.recordsMode='memo';if(tool==='behavior')state.toolDraft.recordsMode='behavior';
    const routes={daily:renderTeacherDaily,weekly:renderWeekly,certificate:renderCertificates,records:renderStudentRecords,memo:renderStudentRecords,behavior:renderStudentRecords,assessment:renderNotebook,tests:renderTests,grades:renderGradebook,occasional:renderOccasional,support:renderSupport,reports:renderReports,seating:renderSeating};
    if(rolloverDue()&&!state.rolloverContinue&&['daily','weekly','certificate','records','memo','behavior','assessment','tests','grades','occasional','support'].includes(tool)){confirmOldYearContinuation(()=>openTool(tool));return;}
    if(['daily','weekly','certificate','records','memo','behavior','assessment','tests','grades','occasional','support','reports','seating'].includes(tool)&&!(await rosterForClass(selectedClass()?.id)).length){state.settingsTab='classes';state.classSettingsView='roster';state.rosterDraft=[];state.rosterLoadedForClassId=null;await renderSettings();showToast('先に名簿を登録してください');return;}
    if(tool==='daily'&&state.onboardingStep===3)await setOnboardingStep(4);
    if(routes[tool])routes[tool]();else showToast('この機能は次の実装段階で追加します');
  }

  function openFooterItem(item){if(item==='settings'){state.settingsTab='guide';state.classSettingsView='list';renderSettings();return;}openTool(item);}

  function confirmOldYearContinuation(onContinue){
    openDialog(`<h2>年度を確認してください</h2><p>現在は${esc(state.year.label)}です。${schoolYear()}年度へ切り替えずに記録を続けますか。</p><p class="muted">「一時継続」は、このアプリを閉じるまで有効です。ホームの切替案内は残ります。</p><div class="dialog-actions"><button type="button" class="button" id="rollover-temporary">一時継続</button><button type="button" class="button primary" id="rollover-now">新年度へ切り替える</button></div>`);
    document.getElementById('rollover-temporary').addEventListener('click',()=>{state.rolloverContinue=true;closeDialog();onContinue();});
    document.getElementById('rollover-now').addEventListener('click',()=>{closeDialog();renderYearRollover();});
  }

  function teacherToolShell(title,body,actions=''){
    const key=state.activeTool||state.route.replace('teacher-','');
    return `<div class="app-shell">${headerHtml(title,actions)}<main class="page">${onboardingBannerHtml()}${body}</main>${key==='student'?'':teacherFooter(key)}</div>`;
  }

  function activeToolRenderer(){return{daily:renderTeacherDaily,weekly:renderWeekly,certificate:renderCertificates,records:renderStudentRecords,memo:renderStudentRecords,behavior:renderStudentRecords,assessment:renderNotebook,tests:renderTests,grades:renderGradebook,occasional:renderOccasional,support:renderSupport,reports:renderReports,seating:renderSeating}[state.activeTool]||renderHome;}
  function openPrintPreview({title,caption='',content,returnAction=activeToolRenderer()}){
    document.body.classList.add('print-preview-active');
    app.innerHTML=`<div class="print-preview-shell"><header class="print-preview-toolbar"><div><strong>印刷プレビュー</strong><span>座席表以外の操作部分は印刷されません</span></div><div class="button-row"><button type="button" class="button" id="print-preview-back">戻る</button><button type="button" class="button primary" id="print-preview-print">印刷する</button></div></header><main class="print-document"><h1>${esc(title)}</h1>${caption?`<p class="print-caption">${esc(caption)}</p>`:''}${content}</main></div>`;
    const close=()=>{document.body.classList.remove('print-preview-active');returnAction();};
    document.getElementById('print-preview-back').addEventListener('click',close);
    document.getElementById('print-preview-print').addEventListener('click',()=>window.print());
  }

  function teacherFooter(active){const allowed=normalizeFooterLayout(state.footerLayout);return`<nav class="teacher-footer" aria-label="日常機能" style="--footer-count:${allowed.length}">${allowed.map(id=>`<button type="button" data-footer-tool="${id}" aria-current="${active===id?'page':'false'}" title="${footerLabel(id)}へ切り替える"><span>${featureIcon(id)}</span>${footerLabel(id)}</button>`).join('')}</nav>`;}
  function wireToolHome(){const key=state.activeTool||state.route.replace('teacher-','');wireCommonHeader(key);wireOnboardingStop();document.querySelector('[data-breadcrumb-home]')?.addEventListener('click',()=>navigateSafely(renderHome));document.querySelectorAll('[data-footer-tool]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openFooterItem(button.dataset.footerTool))));}

  function activeSeatGridTemplate(classItem){const cols=Math.max(1,Number(classItem?.activeSeatCols)||6),aisles=new Set((classItem?.activeSeatAisleAfterColumns||[]).map(Number)),tracks=[];for(let column=1;column<=cols;column++){tracks.push('minmax(0,1fr)');if(column<cols&&aisles.has(column))tracks.push('var(--teacher-aisle-track,minmax(18px,.25fr))');}return tracks.join(' ');}
  function submissionExempt(row){return Boolean(row?.enrollment?.submissionExempt);}
  function subjectExempt(row,subject){return Boolean(subject&&Array.isArray(row?.enrollment?.excludedSubjects)&&row.enrollment.excludedSubjects.includes(subject));}

  async function teacherRosterCards(classId,records=[],options={}){
    const orderMode=options.orderMode||'seat';const roster=await rosterForClass(classId,orderMode==='seat',options.atDate||null);
    const byStudent=new Map(records.map(item=>[item.studentId,item]));
    const allRecords=await ClassDB.getAllByIndex('records','classId',classId);
    const lastMemo=new Map();
    allRecords.filter(item=>item.type==='memo'&&!item.deletedAt).forEach(item=>{if(!lastMemo.has(item.studentId)||lastMemo.get(item.studentId)<item.date)lastMemo.set(item.studentId,item.date);});
    const card=row=>{
      if(options.seatOnly?.(row)){
        const attendanceNumber=orderMode==='number'&&row.enrollment.number!==null&&row.enrollment.number!==undefined&&row.enrollment.number!==''
          ? `<span class="student-number" aria-label="出席番号${esc(row.enrollment.number)}">${esc(row.enrollment.number)}</span>`
          : '';
        return `<article class="teacher-student-card exchange-seat-only" aria-label="${esc(row.student.name)}"><div class="student-main"><strong>${attendanceNumber}${esc(row.student.name)}</strong></div></article>`;
      }
      const record=byStudent.get(row.student.id);
      const status=options.status?.(record,row)||'';
      const statusClass=options.statusClass?.(record,row)||'';
      const extra=options.extra?.(record,row)||'';
      const attendanceNumber=orderMode==='number'&&row.enrollment.number!==null&&row.enrollment.number!==undefined&&row.enrollment.number!==''
        ? `<span class="student-number" aria-label="出席番号${esc(row.enrollment.number)}">${esc(row.enrollment.number)}</span>`
        : '';
      const memoDate=lastMemo.get(row.student.id);return `<article class="teacher-student-card ${esc(statusClass)}${feedbackClass(row.student.id)}"><button type="button" class="student-main" data-tool-student="${row.student.id}"><strong>${attendanceNumber}${esc(row.student.name)}</strong>${status?`<span>${esc(status)}</span>`:''}${extra}</button><div class="student-card-footer">${memoDate?`<span title="最後のメモ：${esc(jpDate(memoDate))}">メモ ${esc(slashDate(memoDate))}</span>`:'<span></span>'}<button type="button" class="detail-button" data-student-detail="${row.student.id}" aria-label="${esc(row.student.name)}の詳細">詳細</button></div></article>`;
    };
    const classItem=state.classes.find(item=>item.id===classId);const useShape=options.preserveSeatShape&&orderMode==='seat'&&classItem?.activeSeatLayout?.length;let body='';let style='';
    if(useShape){const byId=new Map(roster.map(row=>[row.student.id,row])),cols=Math.max(1,Number(classItem.activeSeatCols)||6),aisles=new Set((classItem.activeSeatAisleAfterColumns||[]).map(Number));body=classItem.activeSeatLayout.map((id,index)=>{const cell=id&&byId.has(id)?card(byId.get(id)):'<div class="teacher-student-card grid-empty"><span>空席</span></div>',column=index%cols+1;return cell+(column<cols&&aisles.has(column)?'<div class="teacher-seat-aisle" aria-hidden="true"></div>':'');}).join('');style=` style="grid-template-columns:${activeSeatGridTemplate(classItem)}"`;}
    else body=roster.map(card).join('');
    const autoCompact=roster.length>=30||Number(classItem?.activeSeatCols)>=7,compact=state.rosterDensity==='compact'||(state.rosterDensity==='auto'&&autoCompact);
    const grid=`<section class="teacher-student-grid ${useShape?'seat-shaped ':''}${compact?'compact-roster':''}"${style}>${body}</section>`;
    return grid;
  }

  function teacherOrderMode(){return state.toolDraft.teacherOrderMode||'seat';}
  function teacherOrderControlHtml(){const mode=teacherOrderMode();return `<div class="roster-view-controls"><span class="view-control-label">並び方</span><div class="order-toggle" aria-label="児童の並び方"><button type="button" data-teacher-order="seat" aria-pressed="${mode==='seat'}">座席順</button><button type="button" data-teacher-order="number" aria-pressed="${mode==='number'}">出席番号順</button></div></div>`;}
  function wireTeacherOrder(render){document.querySelectorAll('[data-teacher-order]').forEach(button=>button.addEventListener('click',()=>{state.toolDraft.teacherOrderMode=button.dataset.teacherOrder;render();}));}

  function wireStudentDetails(){document.querySelectorAll('[data-student-detail]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();renderStudentOverview(button.dataset.studentDetail);}));}

  async function memoShortages(classItem,baseDate=today()){
    if(!isSupportClass(classItem))return[];const roster=await rosterForClass(classItem.id);const termStart=baseDate<=state.year.firstTermEnd?state.year.startDate:moveDate(state.year.firstTermEnd,1);const termEnd=baseDate<=state.year.firstTermEnd?state.year.firstTermEnd:state.year.endDate;
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>item.type==='memo'&&item.date>=termStart&&item.date<=termEnd&&!item.deletedAt);
    return roster.map(row=>({student:row.student,subjects:studentSupportSubjects(row,classItem).filter(subject=>!records.some(record=>record.studentId===row.student.id&&record.subject===subject))})).filter(item=>item.subjects.length);
  }

  async function attentionCounts(classId){
    if(!classId)return{daily:0,weekly:0,occasional:0,memo:0,support:0};
    const records=await ClassDB.getAllByIndex('records','classId',classId);
    const roster=await rosterForClass(classId);
    const activeRoster=roster.filter(row=>!submissionExempt(row)),activeStudentIds=activeRoster.map(row=>row.student.id);
    const priorForgotten=new Set(records.filter(record=>record.type==='dailyHomework'&&record.date>=currentWeekStart()&&record.date<today()&&['forgotten','partialForgotten'].includes(record.status)&&!record.resolvedAt&&!record.deletedAt&&activeStudentIds.includes(record.studentId)).map(record=>record.studentId));
    const weeklyOccurrences=records.filter(item=>item.type==='weeklyOccurrence'&&mondayOf(item.dueDate)===currentWeekStart()&&item.dueDate<=today()&&!item.deletedAt);
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
    const roster=await rosterForClass(classItem.id);const records=await dailyRecords(classItem.id,date);const classRecords=await ClassDB.getAllByIndex('records','classId',classItem.id);const priorForgotten=new Set(classRecords.filter(item=>item.type==='dailyHomework'&&item.date>=currentWeekStart(date)&&item.date<date&&['forgotten','partialForgotten'].includes(item.status)&&!item.resolvedAt&&!item.deletedAt).map(item=>item.studentId));const medalData=await homeworkMedalData(classItem.id);
    const totals={submitted:0,forgotten:0,partialForgotten:0,unconfirmed:0,absent:0};const map=new Map(records.map(record=>[record.studentId,record]));roster.filter(row=>!submissionExempt(row)).forEach(row=>{const status=map.get(row.student.id)?.status||'unconfirmed';totals[status]=(totals[status]||0)+1;});
    const labels={unconfirmed:'未確認',submitted:'提出',forgotten:'忘れた',partialForgotten:'一部忘れた',absent:'欠席'};const cards=await teacherRosterCards(classItem.id,records,{orderMode:teacherOrderMode(),preserveSeatShape:true,atDate:date,seatOnly:row=>submissionExempt(row),status:(record,row)=>submissionExempt(row)?'':`${labels[record?.status||'unconfirmed']}${priorForgotten.has(row.student.id)?'・今週の要確認あり':''}`,statusClass:(record,row)=>submissionExempt(row)?'muted':record?.status==='forgotten'||priorForgotten.has(row.student.id)?'alert':record?.status==='partialForgotten'?'warn':record?.status==='submitted'?'good':record?.status==='absent'?'absent':'',extra:(record,row)=>!submissionExempt(row)&&medalData.medals.has(row.student.id)?rewardIconHtml():''});
    app.innerHTML=teacherToolShell('毎日の宿題',`${pupilDateNav(date,'teacher-daily-prev','teacher-daily-next')}<section class="panel daily-guide"><div class="toolbar-line"><div><h1>今日の提出確認</h1><p class="muted">児童名を押して記録します。未解決の忘れ物は今週分だけ表示します。</p></div>${teacherOrderControlHtml()}</div>${operationTipHtml('押し方を見る','児童名は、提出 → 忘れた → 欠席 → 未確認の順で切り替わります。「一部忘れた」は児童用画面または詳細から記録できます。')}<div class="summary-row"><span>提出 <strong>${totals.submitted}</strong></span><span>忘れた <strong>${totals.forgotten}</strong></span><span>一部忘れた <strong>${totals.partialForgotten}</strong></span><span>欠席 <strong>${totals.absent}</strong></span><span>未確認 <strong>${totals.unconfirmed}</strong></span></div><div class="button-row section"><button type="button" class="button" id="daily-absence-setting">欠席をまとめて設定</button></div><div class="medal-setting"><label for="homework-medal-limit">達成アイコンの条件</label><select class="select" id="homework-medal-limit">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${n===medalData.limit?'selected':''}>1か月の忘れ ${n}回以内</option>`).join('')}</select><span class="muted small">一部忘れた（0.5回）が1件でもある児童は、今月の達成アイコン対象外です。</span></div></section>${cards}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderTeacherDaily);document.getElementById('teacher-daily-prev').addEventListener('click',()=>{state.toolDraft.teacherDailyDate=moveDate(date,-1);renderTeacherDaily();});document.getElementById('teacher-daily-next').addEventListener('click',()=>{state.toolDraft.teacherDailyDate=moveDate(date,1);renderTeacherDaily();});document.getElementById('daily-absence-setting').addEventListener('click',()=>openDailyAbsenceDialog(date));document.getElementById('homework-medal-limit').addEventListener('change',async event=>{await ClassDB.setMeta('homeworkMedalLimit',Number(event.target.value));showToast('達成アイコンの条件を保存しました');renderTeacherDaily();});document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',async()=>{const row=(await rosterForClass(classItem.id)).find(item=>item.student.id===button.dataset.toolStudent);if(row&&submissionExempt(row))return;handleDailyTap(button.dataset.toolStudent,date,'teacher');}));
  }

  function renderDailyContext(mode){if(mode==='teacher')renderTeacherDaily();else renderPupil('daily');}

  async function renderPupil(tool=state.pupilTool||'daily'){
    if(typeof tool!=='string')tool=state.pupilTool||'daily';
    if(state.onboardingStep===4){await setOnboardingStep(0);showToast('初回の準備が完了しました');}
    state.route='pupil';state.pupilTool=tool;state.teacherUntil=0;state.sessionSecret=null;clearTimeout(state.lockTimer);await ClassDB.setMeta('lastMode','pupil');
    const classItem=selectedClass();applyClassTheme(classItem);
    const visible=state.pupilOverviewVisibility;if(tool!=='all'&&!visible[tool])tool='all';state.pupilTool=tool;
    const nav=`<nav class="pupil-nav" aria-label="${esc(pupilText('提出画面','ていしゅつ がめん'))}"><button type="button" data-pupil-tool="all" aria-selected="${tool==='all'}">${esc(pupilText('一覧','みる'))}</button>${visible.daily?`<button type="button" data-pupil-tool="daily" aria-selected="${tool==='daily'}">${esc(pupilText('毎日の宿題','きょうの しゅくだい'))}</button>`:''}${visible.weekly?`<button type="button" data-pupil-tool="weekly" aria-selected="${tool==='weekly'}">${esc(pupilText('週宿題','しゅうの しゅくだい'))}</button>`:''}${visible.occasional?`<button type="button" data-pupil-tool="occasional" aria-selected="${tool==='occasional'}">${esc(pupilText('提出物','ていしゅつもの'))}</button>`:''}</nav>`;
    app.innerHTML=`<div class="app-shell pupil-screen ${state.pupilKanaMode?'pupil-kana-mode':''}">${headerHtml('',`<button type="button" class="header-button header-icon" id="pupil-help" aria-label="${esc(pupilText('この画面の使い方','この がめんの つかいかた'))}" title="${esc(pupilText('この画面の使い方','この がめんの つかいかた'))}">?</button><button type="button" class="header-button header-icon" id="teacher-entry" aria-label="先生用画面を開く" title="先生用画面を開く">⚙</button>`,false,false)}<main class="page">${nav}<div id="pupil-content"></div></main></div>`;
    document.getElementById('teacher-entry').addEventListener('click',()=>requireTeacher(renderHome));
    document.getElementById('pupil-help').addEventListener('click',()=>openContextHelp('pupil'));
    document.querySelectorAll('[data-pupil-tool]').forEach(button=>button.addEventListener('click',()=>renderPupil(button.dataset.pupilTool)));
    if(tool==='all')await renderPupilAll();
    if(tool==='daily')await renderPupilDaily();
    if(tool==='weekly'){await renderPupilWeekly();await injectWeeklyDeadlineNotice();}
    if(tool==='occasional')await renderPupilOccasional();
    if(!dialog.open)maybePromptWeeklyCreation('pupil');
  }

  function dailyForgottenWeight(record){if(record?.forgottenAt||record?.status==='forgotten')return 1;if(record?.partialForgottenAt||record?.hadPartialForgotten||record?.status==='partialForgotten')return .5;return 0;}
  function homeworkMedalEligible(studentId,counts,partialStudents,limit){return!partialStudents.has(studentId)&&(counts.get(studentId)||0)<=limit;}
  async function homeworkMedalData(classId){const roster=(await rosterForClass(classId)).filter(row=>!submissionExempt(row)),allowed=new Set(roster.map(row=>row.student.id)),records=(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>item.type==='dailyHomework'&&allowed.has(item.studentId)&&item.date>=recentMonthStart()&&item.date<=today()&&!item.deletedAt&&item.status!=='absent');const counts=new Map(),partialStudents=new Set();records.forEach(item=>{const weight=dailyForgottenWeight(item);if(weight)counts.set(item.studentId,(counts.get(item.studentId)||0)+weight);if(item.hadPartialForgotten||item.partialForgottenAt||item.status==='partialForgotten')partialStudents.add(item.studentId);});const limit=Number(await ClassDB.getMeta('homeworkMedalLimit',0));return{limit,counts,partialStudents,hasRecords:records.length>0,medals:new Set(records.length?roster.filter(row=>homeworkMedalEligible(row.student.id,counts,partialStudents,limit)).map(row=>row.student.id):[])};}
  function visibleRewardMedals(medalData){return state.pupilOverviewVisibility.reward?medalData.medals:new Set();}

  async function pupilAlerts(classItem){
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>!item.deletedAt),roster=(await rosterForClass(classItem.id,true)).filter(row=>!submissionExempt(row)),visibleRoster=roster.filter(row=>!pupilStatusHidden(row)),alerts=new Map(roster.map(row=>[row.student.id,[]])),visibleDailyIds=new Set(visibleRoster.map(row=>row.student.id));
    if(state.pupilOverviewVisibility.daily)records.filter(item=>item.type==='dailyHomework'&&visibleDailyIds.has(item.studentId)&&withinCurrentWeek(item.date)&&item.date<=today()&&item.status==='forgotten'&&!item.resolvedAt).forEach(item=>alerts.get(item.studentId)?.push({kind:'daily',text:pupilText(`${relativeHomeworkLabel(item.date)}の宿題が出ていません`,`${pupilHomeworkDateLabel(item.date)}の しゅくだいを だしてね`)}));
    const week=currentWeekStart(),weekly=records.filter(item=>item.type==='weeklyOccurrence'&&mondayOf(item.dueDate)===week&&item.dueDate<=today()),weeklySubmissions=records.filter(item=>item.type==='weeklySubmission');
    if(state.pupilOverviewVisibility.weekly)for(const occurrence of weekly)for(const row of visibleRoster)if(!weeklySubmissions.some(item=>item.occurrenceId===occurrence.id&&item.studentId===row.student.id&&item.status==='submitted'))alerts.get(row.student.id).push({kind:'weekly',text:pupilText(`今週の${occurrence.title}が出ていません`,`${occurrence.title}を だしてね`)});
    const items=records.filter(item=>item.type==='occasionalItem'&&!item.archived&&item.dueDate<=today()),submissions=records.filter(item=>item.type==='occasionalSubmission');
    if(state.pupilOverviewVisibility.occasional)for(const item of items)for(const row of visibleRoster)if(!submissions.some(record=>record.itemId===item.id&&record.studentId===row.student.id&&record.status==='submitted'))alerts.get(row.student.id).push({kind:'occasional',text:pupilText(`${item.title}の提出物が出ていません`,`${item.title}を だしてね`)});
    return{roster,alerts,medalData:await homeworkMedalData(classItem.id)};
  }

  async function renderPupilAll(){
    const classItem=selectedClass();const {roster,alerts,medalData}=await pupilAlerts(classItem);const needing=roster.filter(row=>alerts.get(row.student.id).length),showAll=Boolean(state.pupilOverviewShowAll),visible=showAll?roster:needing;
    document.getElementById('pupil-content').innerHTML=`<section class="pupil-overview-head"><div class="toolbar-line"><div><h1>${esc(pupilText('提出するもの一覧','だすもの'))}</h1><p>${esc(pupilText('名前を探して、出ていないものを確認してください。提出の操作は上の各ページで行います。','じぶんの なまえを さがしてね。だすものを たしかめよう。'))}</p></div><button type="button" class="button" id="pupil-overview-toggle">${esc(pupilText(showAll?'アラートだけ表示':'全員表示',showAll?'しらせだけ':'みんなをみる'))}</button></div></section>${visible.length?`<section class="pupil-alert-grid">${visible.map(row=>{const items=alerts.get(row.student.id),hidden=pupilStatusHidden(row),count=medalData.counts.get(row.student.id)||0,number=row.enrollment?.number?`${row.enrollment.number}. `:'';return`<article class="pupil-alert-card ${hidden?'all-clear':items.length?'needs-action':'all-clear'}"><div class="pupil-alert-name"><strong>${esc(number)}${esc(row.student.name)}</strong>${!hidden&&state.pupilOverviewVisibility.reward&&medalData.medals.has(row.student.id)?rewardIconHtml():''}</div>${hidden?'':`${state.pupilOverviewVisibility.monthly?`<div class="monthly-forgotten">${esc(pupilText(`この1か月で ${count}回忘れ`,`この 1かげつで ${count}かい わすれた`))}</div>`:''}${items.length?`<div class="pupil-alert-list">${items.map(item=>`<button type="button" data-alert-tool="${item.kind}">! ${esc(item.text)}</button>`).join('')}</div>`:`<div class="all-clear-label">✓ ${esc(pupilText('表示中の項目に未提出はありません','だしていないものは ありません'))}</div>`}`}</article>`;}).join('')}</section>`:`<section class="panel empty-state"><strong>${esc(pupilText('いま確認が必要な児童はいません','いま しらせは ありません'))}</strong><p>${esc(pupilText('「全員表示」を押すと、全員の状況を確認できます。','「みんなをみる」をおすと、みんなを みられます。'))}</p></section>`}${!roster.length?`<section class="panel"><h2>${esc(pupilText('名簿が未登録です','なまえが とうろく されていません'))}</h2><p>${esc(pupilText('先生に知らせてください。','せんせいに しらせてね。'))}</p></section>`:''}<p class="pupil-overview-summary">${esc(pupilText(`表示中の項目で確認が必要な児童：${needing.length}人`,`たしかめる ひと：${needing.length}にん`))}</p>`;
    document.getElementById('pupil-overview-toggle').addEventListener('click',()=>{state.pupilOverviewShowAll=!showAll;renderPupilAll();});document.querySelectorAll('[data-alert-tool]').forEach(button=>button.addEventListener('click',()=>renderPupil(button.dataset.alertTool)));
  }

  function pupilDateNav(value,previousId,nextId,title=''){return `<div class="pupil-date-row"><button type="button" id="${previousId}" aria-label="前へ">◀</button><div><strong>${esc(shortJpDate(value))}</strong>${title?`<span>${esc(title)}</span>`:''}</div><button type="button" id="${nextId}" aria-label="次へ">▶</button></div>`;}

  async function renderPupilDaily(){
    const classItem=selectedClass();const date=today();state.pupilDate=date;
    const roster=await rosterForClass(classItem?.id,true,date);const records=await dailyRecords(classItem?.id,date);const map=new Map(records.map(record=>[record.studentId,record]));const medalData=await homeworkMedalData(classItem.id);
    const classRecords=await ClassDB.getAllByIndex('records','classId',classItem.id);const priorForgotten=new Set(classRecords.filter(item=>item.type==='dailyHomework'&&item.date>=currentWeekStart(date)&&item.date<date&&['forgotten','partialForgotten'].includes(item.status)&&!item.resolvedAt&&!item.deletedAt).map(item=>item.studentId));
    const totals={submitted:0,forgotten:0,partialForgotten:0,unconfirmed:0,absent:0};roster.filter(row=>!pupilStatusHidden(row)).forEach(row=>{const status=map.get(row.student.id)?.status||'unconfirmed';totals[status]=(totals[status]||0)+1;});
    document.getElementById('pupil-content').innerHTML=`<div class="pupil-current-date">${esc(pupilDateText(date))}</div><div class="status-legend"><span class="legend-submitted">${esc(pupilStatusLabel('submitted'))}</span><span class="legend-forgotten">${esc(pupilStatusLabel('forgotten'))}</span><span class="legend-partial">${esc(pupilStatusLabel('partialForgotten'))}</span><span class="legend-absent">${esc(pupilStatusLabel('absent'))}</span><span class="legend-unconfirmed">${esc(pupilStatusLabel('unconfirmed'))}</span></div><div class="summary-row"><span>${esc(pupilText('提出','だした'))} <strong>${totals.submitted}</strong></span><span>${esc(pupilText('忘れた','わすれた'))} <strong>${totals.forgotten}</strong></span><span>${esc(pupilText('一部忘れた','すこし わすれた'))} <strong>${totals.partialForgotten}</strong></span><span>${esc(pupilText('欠席','おやすみ'))} <strong>${totals.absent}</strong></span><span>${esc(pupilText('未確認','まだ'))} <strong>${totals.unconfirmed}</strong></span></div>${roster.length?pupilStudentGrid(classItem,roster,map,'daily',priorForgotten,visibleRewardMedals(medalData)):`<section class="panel"><h2>${esc(pupilText('名簿が未登録です','なまえが とうろく されていません'))}</h2><p class="muted">${esc(pupilText('右上の歯車から教師認証し、名簿を登録してください。','せんせいに しらせてね。'))}</p></section>`}`;
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handleDailyTap(button.dataset.studentId,date,'pupil')));
  }

  async function renderPupilWeekly(){
    const classItem=selectedClass();const roster=await rosterForClass(classItem.id,true);const data=await weeklyData(classItem.id);const occurrences=data.occurrences;const missingRecurring=missingRecurringWeeks(data);const medalData=await homeworkMedalData(classItem.id);
    const current=currentWeeklyOccurrences(data);if(!current.length){document.getElementById('pupil-content').innerHTML=`${weeklyRenewalNotice(missingRecurring,'pupil')}<section class="panel"><h2>${esc(pupilText('今週の週宿題はありません','こんしゅうの しゅくだいは ありません'))}</h2><p class="muted">${esc(pupilText('先生が今週分を作ると、ここに表示されます。前週までの修正は教師画面で行います。','せんせいが つくると、ここに でます。'))}</p></section>`;wireWeeklyRenewal(missingRecurring,'pupil',()=>renderPupil('weekly'));return;}
    const occurrence=current.find(item=>item.id===state.pupilWeeklyId)||current[0];state.pupilWeeklyId=occurrence.id;const records=data.submissions.filter(item=>item.occurrenceId===occurrence.id);const map=new Map(records.map(item=>[item.studentId,item])),choices=current.length>1?`<div class="pupil-weekly-choices" role="tablist" aria-label="${esc(pupilText('今週の宿題','こんしゅうの しゅくだい'))}">${current.map(item=>`<button type="button" class="button ${item.id===occurrence.id?'primary':''}" data-pupil-weekly-choice="${item.id}" aria-selected="${item.id===occurrence.id}">${esc(item.title)}<small>${esc(pupilDateText(item.dueDate))}</small></button>`).join('')}</div>`:'';
    document.getElementById('pupil-content').innerHTML=`${weeklyRenewalNotice(missingRecurring,'pupil')}${choices}<div class="pupil-current-date">${esc(pupilDateText(occurrence.dueDate))}<span>${esc(occurrence.title)}</span></div><div class="status-legend"><span class="legend-submitted">${esc(pupilStatusLabel('submitted'))}</span><span class="legend-forgotten">${esc(pupilStatusLabel('forgotten'))}</span><span class="legend-unsubmitted">${esc(pupilStatusLabel('unsubmitted'))}</span></div><div class="summary-row"><span>${esc(pupilText('名前を押すと状態が変わります。','じぶんの なまえを おしてね。'))}</span></div>${pupilStudentGrid(classItem,roster,map,'weekly',new Set(),visibleRewardMedals(medalData))}`;
    wireWeeklyRenewal(missingRecurring,'pupil',()=>renderPupil('weekly'));
    document.querySelectorAll('[data-pupil-weekly-choice]').forEach(button=>button.addEventListener('click',()=>{state.pupilWeeklyId=button.dataset.pupilWeeklyChoice;renderPupil('weekly');}));
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handlePupilWeeklyTap(button.dataset.studentId,occurrence)));
  }

  async function handlePupilWeeklyTap(studentId,occurrence){
    if(rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handlePupilWeeklyTap(studentId,occurrence)));return;}
    return applyWeeklyTap(studentId,occurrence,()=>renderPupil('weekly'));
  }

  async function renderPupilOccasional(){
    const classItem=selectedClass();const roster=await rosterForClass(classItem.id,true);const data=await occasionalData(classItem.id);const items=data.items.filter(item=>!item.archived);const medalData=await homeworkMedalData(classItem.id);
    if(!items.length){document.getElementById('pupil-content').innerHTML=`<section class="panel"><h2>${esc(pupilText('提出物はありません','ていしゅつものは ありません'))}</h2><p class="muted">${esc(pupilText('先生が登録すると、ここに表示されます。','せんせいが とうろくすると、ここに でます。'))}</p></section>`;return;}
    const item=items.find(row=>row.id===state.pupilOccasionalId)||items[0];state.pupilOccasionalId=item.id;const records=data.submissions.filter(row=>row.itemId===item.id);const map=new Map(records.map(record=>[record.studentId,record]));
    const choices=items.length>1?`<div class="pupil-item-choices" role="group" aria-label="提出物を選択">${items.map(row=>`<button type="button" data-pupil-occasional-choice="${esc(row.id)}" aria-pressed="${row.id===item.id}">${esc(row.title)}<small>${esc(pupilDateText(row.dueDate))}</small></button>`).join('')}</div>`:'';
    document.getElementById('pupil-content').innerHTML=`${choices}<div class="pupil-current-date">${esc(pupilDateText(item.dueDate))}<span>${esc(item.title)}</span></div><div class="status-legend"><span class="legend-submitted">${esc(pupilText('✓ 提出済み','✓ だした'))}</span><span class="legend-unsubmitted">${esc(pupilStatusLabel('unsubmitted'))}</span></div><div class="summary-row"><span>${esc(pupilText('名前を押して提出を記録します。','じぶんの なまえを おしてね。'))}</span></div>${pupilStudentGrid(classItem,roster,map,'occasional',new Set(),visibleRewardMedals(medalData))}`;
    document.querySelectorAll('[data-pupil-occasional-choice]').forEach(button=>button.addEventListener('click',()=>{state.pupilOccasionalId=button.dataset.pupilOccasionalChoice;renderPupil('occasional');}));
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handlePupilOccasionalTap(button.dataset.studentId,item)));
  }

  async function handlePupilOccasionalTap(studentId,item){
    if(rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handlePupilOccasionalTap(studentId,item)));return;}
    const id=`occasional_${item.id}_${studentId}`;const current=await ClassDB.get('records',id);const next=current?.status==='submitted'?'unsubmitted':'submitted';
    await ClassDB.put('records',{...(current||{}),id,type:'occasionalSubmission',classId:selectedClass().id,studentId,date:today(),dueDate:item.dueDate,title:item.title,itemId:item.id,status:next});markFeedback(studentId,next);showToast(next==='submitted'?'提出済みにしました':'未提出に戻しました');renderPupil('occasional');
  }

  function pupilStatusHidden(row){return Boolean(row?.enrollment?.hidePupilHomeworkStatus);}
  function studentCard(row,record,kind='daily',priorForgotten=false,medals=new Set()){
    const defaults={daily:'unconfirmed',weekly:'unsubmitted',occasional:'unsubmitted'};const status=record?.status||defaults[kind],exchangeSeatOnly=submissionExempt(row),hideDaily=kind==='daily'&&pupilStatusHidden(row);
    const number=row.enrollment?.number?`${row.enrollment.number}. `:'';
    return `<button type="button" class="student-card ${exchangeSeatOnly?'exchange-seat-only':hideDaily?'pupil-status-hidden':status}${!exchangeSeatOnly&&!hideDaily&&priorForgotten?' has-prior-forgotten':''}${!hideDaily?feedbackClass(row.student.id):''}" data-student-id="${row.student.id}" ${exchangeSeatOnly?'disabled':''}><strong>${esc(number)}${esc(row.student.name)}${!exchangeSeatOnly&&!hideDaily&&medals.has(row.student.id)?rewardIconHtml('medal-inline'):''}</strong>${exchangeSeatOnly||hideDaily?'':`<span class="state ${status}">${esc(pupilStatusLabel(status))}</span>${priorForgotten?`<span class="prior-flag">${esc(pupilText('今週の要確認あり','こんしゅう たしかめてね'))}</span>`:''}`}</button>`;
  }
  function pupilStudentGrid(classItem,roster,records,kind,priorForgotten=new Set(),medals=new Set()){
    const byId=new Map(roster.map(row=>[row.student.id,row]));const shape=classItem?.activeSeatLayout;const useShape=Array.isArray(shape)&&shape.length>0;const body=useShape?shape.map(id=>id&&byId.has(id)?studentCard(byId.get(id),records.get(id),kind,priorForgotten.has(id),medals):'<div class="student-card grid-empty"><span>空席</span></div>').join(''):roster.map(row=>studentCard(row,records.get(row.student.id),kind,priorForgotten.has(row.student.id),medals)).join('');const style=useShape?` style="--active-seat-cols:${classItem.activeSeatCols||6}"`:'';const compact=roster.length>=30||Number(classItem?.activeSeatCols)>=7;return`<section class="student-grid ${useShape?'seat-shaped ':''}${compact?'compact-roster':''}"${style}>${body}</section>`;
  }
  async function rosterForClass(classId,useSeatOrder=false,atDate=null){
    if(!classId)return[];
    const classItem=state.classes.find(item=>item.id===classId);const order=useSeatOrder?(classItem?.dailyStudentOrder||[]):[];
    const enrollments=(await ClassDB.getAllByIndex('enrollments','classId',classId)).filter(item=>!item.deletedAt&&(atDate?(item.startDate||state.year.startDate)<=atDate&&(!item.endDate||item.endDate>=atDate):!item.endDate)).sort((a,b)=>{const ai=order.indexOf(a.studentId),bi=order.indexOf(b.studentId);if(ai>=0||bi>=0)return(ai<0?999:ai)-(bi<0?999:bi);return(a.number||999)-(b.number||999);});
    const studentIds=new Set(enrollments.map(item=>item.studentId)),students=(await ClassDB.getAll('students')).filter(item=>studentIds.has(item.id)),byId=new Map(students.map(item=>[item.id,item]));
    return enrollments.map(enrollment=>({enrollment,student:byId.get(enrollment.studentId)})).filter(row=>row.student);
  }
  async function enrollmentPeriodsForStudent(classId,studentId){return(await ClassDB.getAllByIndex('enrollments','studentId',studentId)).filter(item=>item.classId===classId&&!item.deletedAt).sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||'')));}
  function dateInEnrollment(date,enrollment){return Boolean(date&&enrollment&&(enrollment.startDate||state.year.startDate)<=date&&(!enrollment.endDate||date<=enrollment.endDate));}
  async function rosterForRange(classId,start,end){const enrollments=(await ClassDB.getAllByIndex('enrollments','classId',classId)).filter(item=>!item.deletedAt&&(item.startDate||state.year.startDate)<=end&&(!item.endDate||item.endDate>=start)),studentIds=new Set(enrollments.map(item=>item.studentId)),students=(await ClassDB.getAll('students')).filter(item=>studentIds.has(item.id)),periods=new Map();for(const enrollment of enrollments){if(!periods.has(enrollment.studentId))periods.set(enrollment.studentId,[]);periods.get(enrollment.studentId).push(enrollment);}return students.map(student=>{const list=periods.get(student.id).sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||'')));return{student,enrollment:list[0],enrollments:list};}).sort((a,b)=>(a.enrollment.number||999)-(b.enrollment.number||999));}
  async function dailyRecords(classId,date){const records=await ClassDB.getAllByIndex('records','classId',classId);return records.filter(item=>item.type==='dailyHomework'&&item.date===date&&!item.deletedAt);}
  async function handleDailyTap(studentId,date=state.pupilDate||today(),mode='pupil'){
    if(mode==='pupil'&&rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handleDailyTap(studentId,date,mode)));return;}
    const classItem=selectedClass();
    const id=`daily_${classItem.id}_${date}_${studentId}`;
    const current=await ClassDB.get('records',id);
    const all=await ClassDB.getAllByIndex('records','studentId',studentId);
    const prior=all.filter(item=>item.type==='dailyHomework'&&item.classId===classItem.id&&item.date>=currentWeekStart(date)&&item.date<date&&['forgotten','partialForgotten'].includes(item.status)&&!item.resolvedAt&&!item.deletedAt).sort((a,b)=>a.date.localeCompare(b.date));
    if(prior.length){openDailyWeekDialog(studentId,prior,date,mode);return;}
    const next=dailyNextStatus(current?.status,mode);
    if(next==='unconfirmed'){await moveToTrash(current);}
    else await setDailyStatus(studentId,date,next);
    markFeedback(studentId,next);const message=next==='submitted'?'提出にしました':next==='forgotten'?'忘れたにしました':next==='partialForgotten'?'一部忘れたにしました':next==='absent'?'欠席にしました':'未確認に戻しました';await renderDailyContext(mode);
    if(mode==='teacher')showUndoToast(message,async()=>{if(current){await ClassDB.put('records',current);await ClassDB.remove('trash',`trash_${id}`);}else await ClassDB.remove('records',id);await renderDailyContext(mode);});else showToast(message);
  }
  function dailyNextStatus(status,mode='pupil'){return mode==='teacher'?(status==='submitted'?'forgotten':status==='forgotten'?'absent':['absent','partialForgotten'].includes(status)?'unconfirmed':'submitted'):(status==='submitted'?'forgotten':status==='forgotten'?'partialForgotten':status==='partialForgotten'?'unconfirmed':'submitted');}
  function trashEntryFor(record){const deletedAt=ClassDB.now(),deviceId=ClassDB.deviceId();return{id:`trash_${record.id}`,record:{...record,deletedAt},deletedAt,purgeAfter:new Date(Date.now()+30*86400000).toISOString(),createdAt:deletedAt,updatedAt:deletedAt,deviceId};}
  async function moveToTrash(record){if(!record)return;await ClassDB.applyBatch({puts:{trash:[trashEntryFor(record)]},deletes:{records:[record.id]}});}
  async function openDailyWeekDialog(studentId,prior,date,mode){
    const student=await ClassDB.get('students',studentId),current=await ClassDB.get('records',`daily_${selectedClass().id}_${date}_${studentId}`),items=[...prior];if(!items.some(item=>item.date===date))items.push(current||{date,status:'unconfirmed'});items.sort((a,b)=>a.date.localeCompare(b.date));
    openDialog(`<h2>${esc(student?.name||'児童')}の今週の宿題</h2><p class="muted">今週の要確認項目と今日の分だけを表示しています。各日の状態を選んでください。</p><div class="daily-week-list">${items.map(item=>{const status=item.resolvedAt?'submitted':item.status;return`<div class="daily-week-row" data-daily-row="${item.date}"><div><strong>${esc(relativeHomeworkLabel(item.date,date))}</strong><span>${esc(shortJpDate(item.date))}</span></div><div class="daily-choice"><button type="button" data-daily-choice="submitted" data-daily-date="${item.date}" aria-pressed="${status==='submitted'}">✓ 提出</button><button type="button" data-daily-choice="forgotten" data-daily-date="${item.date}" aria-pressed="${status==='forgotten'}">! 忘れた</button><button type="button" data-daily-choice="partialForgotten" data-daily-date="${item.date}" aria-pressed="${status==='partialForgotten'}">△ 一部忘れた</button></div></div>`;}).join('')}</div><div class="dialog-actions"><button type="button" class="button primary" id="daily-week-close">閉じて反映</button></div>`);
    document.querySelectorAll('[data-daily-choice]').forEach(button=>button.addEventListener('click',async()=>{const day=button.dataset.dailyDate,status=button.dataset.dailyChoice,existing=await ClassDB.get('records',`daily_${selectedClass().id}_${day}_${studentId}`);if(status==='submitted'&&day<date&&['forgotten','partialForgotten'].includes(existing?.status))await resolvePrior(existing);else await setDailyStatus(studentId,day,status);const row=button.closest('[data-daily-row]');row.querySelectorAll('[data-daily-choice]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));markFeedback(studentId,status);showToast(status==='submitted'?'提出にしました':status==='forgotten'?'忘れたにしました':'一部忘れたにしました');}));
    document.getElementById('daily-week-close').addEventListener('click',()=>{closeDialog();renderDailyContext(mode);});
  }
  async function resolvePrior(record){await ClassDB.put('records',{...record,resolvedAt:ClassDB.now()});}
  async function openDailyAbsenceDialog(date){
    const classItem=selectedClass(),roster=await rosterForClass(classItem.id,true,date),records=await dailyRecords(classItem.id,date),absentIds=new Set(records.filter(item=>item.status==='absent').map(item=>item.studentId)),byId=new Map(roster.map(row=>[row.student.id,row])),layout=Array.isArray(classItem.activeSeatLayout)&&classItem.activeSeatLayout.length?classItem.activeSeatLayout:roster.map(row=>row.student.id),columns=classItem.activeSeatCols||6,seatItem=row=>submissionExempt(row)?`<span class="daily-absence-seat exchange-seat-only"><span><small>${esc(row.enrollment?.number||'')}</small>${esc(row.student.name)}<em>座席のみ</em></span></span>`:`<label class="daily-absence-seat"><input type="checkbox" data-daily-absent="${row.student.id}" ${absentIds.has(row.student.id)?'checked':''}><span><small>${esc(row.enrollment?.number||'')}</small>${esc(row.student.name)}</span></label>`,seatGrid=layout.map(id=>id&&byId.has(id)?seatItem(byId.get(id)):'<span class="daily-absence-empty" aria-hidden="true"></span>').join('');
    openDialog(`<h2>${esc(shortJpDate(date))}の欠席を設定</h2><p class="muted">普段の席順で選びます。欠席にした児童は、この日の宿題忘れ・月間の忘れ回数・児童用の忘れ物表示に含めません。</p><form id="daily-absence-form"><div class="daily-absence-grid" style="--absence-cols:${columns}">${seatGrid}</div><div class="dialog-actions"><button type="button" class="button" id="daily-absence-cancel">キャンセル</button><button type="submit" class="button primary" id="daily-absence-save">保存する</button></div></form>`);
    document.getElementById('daily-absence-cancel').addEventListener('click',closeDialog);document.getElementById('daily-absence-form').addEventListener('submit',async event=>{event.preventDefault();const button=document.getElementById('daily-absence-save');if(button.disabled)return;button.disabled=true;const selected=new Set([...document.querySelectorAll('[data-daily-absent]:checked')].map(input=>input.dataset.dailyAbsent));for(const row of roster){const current=records.find(item=>item.studentId===row.student.id);if(selected.has(row.student.id)&&current?.status!=='absent')await setDailyStatus(row.student.id,date,'absent');if(!selected.has(row.student.id)&&current?.status==='absent')await ClassDB.remove('records',current.id);}closeDialog();showToast(selected.size?`${selected.size}人を欠席にしました`:'欠席設定を解除しました');renderTeacherDaily();});
  }
  function dailyHistory(current,status){if(status==='absent')return{forgottenAt:null,partialForgottenAt:null,hadPartialForgotten:false};if(status==='forgotten')return{forgottenAt:current?.forgottenAt||ClassDB.now(),partialForgottenAt:current?.partialForgottenAt||null,hadPartialForgotten:Boolean(current?.hadPartialForgotten)};if(status==='partialForgotten')return{forgottenAt:null,partialForgottenAt:current?.partialForgottenAt||ClassDB.now(),hadPartialForgotten:true};return{forgottenAt:current?.forgottenAt||null,partialForgottenAt:current?.partialForgottenAt||null,hadPartialForgotten:Boolean(current?.hadPartialForgotten)};}
  async function setDailyStatus(studentId,date,status){const classItem=selectedClass();const id=`daily_${classItem.id}_${date}_${studentId}`;const current=await ClassDB.get('records',id);await ClassDB.put('records',{...(current||{}),id,type:'dailyHomework',classId:classItem.id,studentId,date,status,resolvedAt:null,...dailyHistory(current,status)});}
  async function renderSettings(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-settings';state.activeTool='settings';
    const classItem=selectedClass();applyClassTheme(classItem);
    app.innerHTML=`<div class="app-shell">${headerHtml('設定')}<main class="page"><div id="settings-content"></div></main>${teacherFooter('settings')}</div>`;
    wireCommonHeader('settings');document.querySelector('[data-breadcrumb-home]')?.addEventListener('click',()=>navigateSafely(renderHome));document.querySelectorAll('[data-footer-tool]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openFooterItem(button.dataset.footerTool))));
    renderSettingsContent();
  }
