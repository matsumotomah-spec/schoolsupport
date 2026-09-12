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
        ${rosterPrompt}
        <section class="tools-main ${!own&&!support?'limited':''}">
          ${!own&&!support?`${toolHtml('memo','✎','児童メモ',counts.memo,true)}${toolHtml('assessment','A','ノート評価',0)}${toolHtml('occasional','▤','提出物',counts.occasional)}`:`
          ${support?toolHtml('memo','✎','児童メモ',counts.memo,true):toolHtml('daily','✓','毎日の宿題',counts.daily,true)}
          ${support?toolHtml('daily','✓','毎日の宿題',counts.daily):toolHtml('weekly','▣','週宿題',counts.weekly)}
          ${support?toolHtml('weekly','▣','週宿題',counts.weekly):toolHtml('certificate','☆','ミニ賞状',0)}
          ${support?toolHtml('certificate','☆','ミニ賞状',0):toolHtml('memo','✎','児童メモ',counts.memo)}
          ${toolHtml('assessment','A','ノート評価',0)}`}
        </section>
        ${own||support?`<section class="tools-sub">
          ${toolHtml('occasional','▤','提出物',counts.occasional)}
          ${own?toolHtml('seating','▦','席替え',0):''}
          ${own?toolHtml('reports','文','所見素材',0):''}
          ${support?toolHtml('support','◇','学習記録',counts.support):''}
        </section>`:''}
        <div class="home-footer"><button type="button" class="button" id="homework-display-settings" title="達成アイコンと1か月の忘れ回数表示を設定する">宿題の表示設定</button><button type="button" class="button primary" id="pupil-mode">児童用の提出画面</button></div>
      </main></div>`;
    document.querySelectorAll('[data-class-id]').forEach(button=>button.addEventListener('click',async()=>{state.selectedClassId=button.dataset.classId;state.rosterDraft=[];state.rosterLoadedForClassId=null;await ClassDB.setMeta('selectedClassId',state.selectedClassId);renderHome();}));
    document.querySelectorAll('[data-tool]').forEach(button=>button.addEventListener('click',()=>openTool(button.dataset.tool)));
    document.querySelectorAll('[data-footer-tool]').forEach(button=>button.addEventListener('click',()=>openTool(button.dataset.footerTool)));
    document.getElementById('pupil-mode').addEventListener('click',()=>renderPupil('all'));
    document.getElementById('home-open-roster')?.addEventListener('click',()=>{state.settingsTab='classes';state.classSettingsView='roster';state.rosterDraft=[];state.rosterLoadedForClassId=null;renderSettings();});
    document.getElementById('homework-display-settings').addEventListener('click',openHomeworkDisplaySettings);
    wireOnboardingStop();
    wireCommonHeader('home');
    document.getElementById('start-rollover')?.addEventListener('click',renderYearRollover);
    document.getElementById('backup-from-home')?.addEventListener('click',openDataManagement);document.getElementById('backup-later')?.addEventListener('click',async()=>{const until=new Date(Date.now()+7*86400000).toISOString();state.backupDismissedUntil=until;await ClassDB.setMeta('backupDismissedUntil',until);renderHome();});
    if(!state.migrationPromptShown&&!await ClassDB.getMeta('lastLegacyMigration',null)){const legacy=LegacyMigration.fromStorage();if(legacy.length){state.migrationPromptShown=true;openDialog(`<h2>旧ツールのデータが見つかりました</h2><p>${legacy.length}件のデータ群があります。内容と移行先を確認してから一括移行できます。</p><div class="dialog-actions"><button type="button" class="button" id="legacy-prompt-later">後で</button><button type="button" class="button primary" id="legacy-prompt-review">内容を確認</button></div>`);document.getElementById('legacy-prompt-later').addEventListener('click',closeDialog);document.getElementById('legacy-prompt-review').addEventListener('click',()=>{closeDialog();openLegacyMigrationReview(legacy);});}}
    if(!dialog.open)maybePromptWeeklyCreation('teacher');
  }

  function connectionStatusHtml(){return`<span class="connection-chip ${navigator.onLine?'online':'offline'}" id="connection-chip" ${navigator.onLine?'hidden':''}><span></span>オフライン・端末保存</span>`;}
  function headerHtml(subtitle,actions='',homeActive=false,teacherControls=true){const classItem=selectedClass(),context=teacherControls?`<div class="header-context"><button type="button" class="class-context-button" data-current-class title="現在のクラスを確認・変更"><span class="class-context-dot"></span><span><small>現在のクラス</small><strong>${esc(classItem?.name||'クラス未設定')}</strong></span><span aria-hidden="true">⌄</span></button></div>`:`<div class="header-context"><span class="mode-chip pupil">児童用</span><strong class="pupil-class-name">${esc(classItem?.name||'')}</strong></div>`,brand=teacherControls?`<button type="button" class="app-title brand-home" data-common-home title="教師用ホームへ戻る">クラス支援ツール</button>`:`<div class="app-title">クラス支援ツール</div>`,common=teacherControls?`<button type="button" class="header-button home-button ${homeActive?'active':''}" data-common-home aria-current="${homeActive?'page':'false'}" title="教師用ホームへ戻る"><span aria-hidden="true">⌂</span> ホーム</button><button type="button" class="header-button" data-common-settings title="設定を開く">⚙ 設定</button><button type="button" class="header-button header-icon" data-context-help aria-label="この画面の使い方" title="この画面の使い方">?</button>`:'';return `<header class="app-header"><div class="brand-block">${brand}<div class="app-subtitle">${esc(state.year?.label||'')}　${esc(subtitle)}</div>${context}${connectionStatusHtml()}</div><div class="header-actions">${common}${actions}</div></header>`;}
  function updateConnectionStatus(){const chip=document.getElementById('connection-chip');if(!chip)return;chip.hidden=navigator.onLine;chip.className=`connection-chip ${navigator.onLine?'online':'offline'}`;chip.innerHTML='<span></span>オフライン・端末保存';}
  function wireCommonHeader(helpKey='home'){
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
  async function dashboardHtml(counts){const items=[['毎日の宿題',counts.daily],['週宿題',counts.weekly],['提出物',counts.occasional],['児童メモ',counts.memo]].filter(item=>item[1]>0);if(!items.length)return'';const summary=items.map(([label,count])=>`${label} ${count}人`).join('　／　');return`<section class="dashboard attention-dashboard"><strong>今日の確認</strong><span>${esc(summary)}</span></section>`;}
  function backupNoticeHtml(){const last=state.lastBackupAt?new Date(state.lastBackupAt).getTime():0;const dismissed=state.backupDismissedUntil?new Date(state.backupDismissedUntil).getTime():0;const due=!last||Date.now()-last>=30*86400000;if(!due||Date.now()<dismissed)return'';return`<div class="notice"><div><strong>暗号化バックアップの時期です</strong><div class="row-meta">${last?'前回から1か月以上経過しています。':'最初のバックアップを保存してください。'}</div></div><div class="button-row"><button type="button" class="button" id="backup-later">後で</button><button type="button" class="button primary" id="backup-from-home">バックアップ</button></div></div>`;}
  function rolloverNoticeHtml(){if(!rolloverDue())return'';return`<div class="notice rollover-notice"><div><strong>${schoolYear()}年度への切り替えが必要です</strong><div class="row-meta">現在は${esc(state.year.label)}のままです。案内は切り替えるまで表示されます。</div></div><button type="button" class="button primary" id="start-rollover">新年度へ切り替える</button></div>`;}

  const PUPIL_OVERVIEW_OPTIONS=[['daily','今週の毎日の宿題の忘れ'],['weekly','今週の週宿題の未提出'],['occasional','回収中の提出物の未提出'],['monthly','この1か月の忘れ回数'],['reward','条件達成アイコン']];
  function pupilOverviewOptionsHtml(prefix){return`<div class="pupil-overview-options">${PUPIL_OVERVIEW_OPTIONS.map(([key,label])=>`<label class="check-row"><input type="checkbox" id="${prefix}-${key}" ${state.pupilOverviewVisibility[key]?'checked':''}> ${label}</label>`).join('')}</div><p class="muted small">「一覧」タブだけの設定です。毎日の宿題・週宿題・提出物の記録画面は引き続き使えます。</p>`;}
  function readPupilOverviewOptions(prefix){return Object.fromEntries(PUPIL_OVERVIEW_OPTIONS.map(([key])=>[key,document.getElementById(`${prefix}-${key}`).checked]));}
  async function savePupilOverviewOptions(options){state.pupilOverviewVisibility={...state.pupilOverviewVisibility,...options};state.showMonthlyForgotten=state.pupilOverviewVisibility.monthly;await ClassDB.setMeta('pupilOverviewVisibility',state.pupilOverviewVisibility);await ClassDB.setMeta('showMonthlyForgotten',state.showMonthlyForgotten);}

  function openHomeworkDisplaySettings(){
    openDialog(`<h2>児童用一覧の表示設定</h2><p class="muted">児童が「一覧」を開いたときに見せる情報を選びます。</p><form id="homework-display-form">${pupilOverviewOptionsHtml('quick-overview')}<div class="field section"><span class="field-label">条件達成アイコンの種類</span><div class="reward-icon-choices">${REWARD_ICONS.map(icon=>`<label><input type="radio" name="reward-icon" value="${icon}" ${icon===state.rewardIcon?'checked':''}><span>${icon}</span></label>`).join('')}</div></div><div class="dialog-actions"><button type="button" class="button" id="homework-display-cancel">キャンセル</button><button type="button" class="button" id="open-full-appearance">表示設定をすべて開く</button><button type="submit" class="button primary">保存</button></div></form>`);
    document.getElementById('homework-display-cancel').addEventListener('click',closeDialog);
    document.getElementById('open-full-appearance').addEventListener('click',()=>{closeDialog();state.settingsTab='appearance';renderSettings();});
    document.getElementById('homework-display-form').addEventListener('submit',async event=>{event.preventDefault();await savePupilOverviewOptions(readPupilOverviewOptions('quick-overview'));state.rewardIcon=document.querySelector('input[name="reward-icon"]:checked')?.value||'✨';await ClassDB.setMeta('homeworkRewardIcon',state.rewardIcon);closeDialog();showToast('児童用一覧の表示設定を保存しました');renderHome();});
  }

  async function openTool(tool){
    const routes={daily:renderTeacherDaily,weekly:renderWeekly,certificate:renderCertificates,memo:renderMemos,assessment:renderNotebook,occasional:renderOccasional,support:renderSupport,reports:renderReports,seating:renderSeating};
    if(rolloverDue()&&!state.rolloverContinue&&['daily','weekly','certificate','memo','assessment','occasional','support'].includes(tool)){confirmOldYearContinuation(()=>openTool(tool));return;}
    if(['daily','weekly','certificate','memo','assessment','occasional','support','reports','seating'].includes(tool)&&!(await rosterForClass(selectedClass()?.id)).length){state.settingsTab='classes';state.classSettingsView='roster';state.rosterDraft=[];state.rosterLoadedForClassId=null;await renderSettings();showToast('先に名簿を登録してください');return;}
    if(tool==='daily'&&state.onboardingStep===3)await setOnboardingStep(4);
    if(routes[tool])routes[tool]();else showToast('この機能は次の実装段階で追加します');
  }

  function confirmOldYearContinuation(onContinue){
    openDialog(`<h2>年度を確認してください</h2><p>現在は${esc(state.year.label)}です。${schoolYear()}年度へ切り替えずに記録を続けますか。</p><p class="muted">「一時継続」は、このアプリを閉じるまで有効です。ホームの切替案内は残ります。</p><div class="dialog-actions"><button type="button" class="button" id="rollover-temporary">一時継続</button><button type="button" class="button primary" id="rollover-now">新年度へ切り替える</button></div>`);
    document.getElementById('rollover-temporary').addEventListener('click',()=>{state.rolloverContinue=true;closeDialog();onContinue();});
    document.getElementById('rollover-now').addEventListener('click',()=>{closeDialog();renderYearRollover();});
  }

  function teacherToolShell(title,body,actions=''){
    const key=state.activeTool||state.route.replace('teacher-','');
    return `<div class="app-shell">${headerHtml(title,actions)}<main class="page">${onboardingBannerHtml()}${body}</main>${key==='student'?'':teacherFooter(key)}</div>`;
  }

  function activeToolRenderer(){return{daily:renderTeacherDaily,weekly:renderWeekly,certificate:renderCertificates,memo:renderMemos,assessment:renderNotebook,occasional:renderOccasional,support:renderSupport,reports:renderReports,seating:renderSeating}[state.activeTool]||renderHome;}
  function openPrintPreview({title,caption='',content,returnAction=activeToolRenderer()}){
    document.body.classList.add('print-preview-active');
    app.innerHTML=`<div class="print-preview-shell"><header class="print-preview-toolbar"><div><strong>印刷プレビュー</strong><span>座席表以外の操作部分は印刷されません</span></div><div class="button-row"><button type="button" class="button" id="print-preview-back">戻る</button><button type="button" class="button primary" id="print-preview-print">印刷する</button></div></header><main class="print-document"><h1>${esc(title)}</h1>${caption?`<p class="print-caption">${esc(caption)}</p>`:''}${content}</main></div>`;
    const close=()=>{document.body.classList.remove('print-preview-active');returnAction();};
    document.getElementById('print-preview-back').addEventListener('click',close);
    document.getElementById('print-preview-print').addEventListener('click',()=>window.print());
  }

  function teacherFooter(active){const classItem=selectedClass(),allowed=!classItem?.isOwn&&!isSupportClass(classItem)?['memo','assessment','occasional']:['daily','weekly','certificate','memo','assessment','occasional'];const labels={daily:'毎日の宿題',weekly:'週宿題',certificate:'ミニ賞状',memo:'児童メモ',assessment:'ノート評価',occasional:'提出物'};return`<nav class="teacher-footer" aria-label="日常機能" style="--footer-count:${allowed.length}">${allowed.map(id=>`<button type="button" data-footer-tool="${id}" aria-current="${active===id?'page':'false'}" title="${labels[id]}へ切り替える"><span>${featureIcon(id)}</span>${labels[id]}</button>`).join('')}</nav>`;}
  function wireToolHome(){const key=state.activeTool||state.route.replace('teacher-','');wireCommonHeader(key);wireOnboardingStop();document.querySelector('[data-breadcrumb-home]')?.addEventListener('click',()=>navigateSafely(renderHome));document.querySelectorAll('[data-footer-tool]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openTool(button.dataset.footerTool))));}

  function activeSeatGridTemplate(classItem){const cols=Math.max(1,Number(classItem?.activeSeatCols)||6),aisles=new Set((classItem?.activeSeatAisleAfterColumns||[]).map(Number)),tracks=[];for(let column=1;column<=cols;column++){tracks.push('minmax(0,1fr)');if(column<cols&&aisles.has(column))tracks.push('var(--teacher-aisle-track,minmax(18px,.25fr))');}return tracks.join(' ');}

  async function teacherRosterCards(classId,records=[],options={}){
    const orderMode=options.orderMode||'seat';const roster=await rosterForClass(classId,orderMode==='seat',options.atDate||null);
    const byStudent=new Map(records.map(item=>[item.studentId,item]));
    const allRecords=await ClassDB.getAllByIndex('records','classId',classId);
    const lastMemo=new Map();
    allRecords.filter(item=>item.type==='memo'&&!item.deletedAt).forEach(item=>{if(!lastMemo.has(item.studentId)||lastMemo.get(item.studentId)<item.date)lastMemo.set(item.studentId,item.date);});
    const card=row=>{
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
    const priorForgotten=new Set(records.filter(record=>record.type==='dailyHomework'&&record.date>=currentWeekStart()&&record.date<today()&&record.status==='forgotten'&&!record.resolvedAt&&!record.deletedAt).map(record=>record.studentId));
    const roster=await rosterForClass(classId);
    const activeStudentIds=roster.map(row=>row.student.id);
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
    const roster=await rosterForClass(classItem.id);const records=await dailyRecords(classItem.id,date);const classRecords=await ClassDB.getAllByIndex('records','classId',classItem.id);const priorForgotten=new Set(classRecords.filter(item=>item.type==='dailyHomework'&&item.date>=currentWeekStart(date)&&item.date<date&&item.status==='forgotten'&&!item.resolvedAt&&!item.deletedAt).map(item=>item.studentId));const medalData=await homeworkMedalData(classItem.id);
    const totals={submitted:0,forgotten:0,unconfirmed:0};const map=new Map(records.map(record=>[record.studentId,record]));roster.forEach(row=>{const status=map.get(row.student.id)?.status||'unconfirmed';totals[status]=(totals[status]||0)+1;});
    const labels={unconfirmed:'未確認',submitted:'提出',forgotten:'忘れた'};const cards=await teacherRosterCards(classItem.id,records,{orderMode:teacherOrderMode(),preserveSeatShape:true,atDate:date,status:(record,row)=>`${labels[record?.status||'unconfirmed']}${priorForgotten.has(row.student.id)?'・今週の忘れあり':''}`,statusClass:(record,row)=>record?.status==='forgotten'||priorForgotten.has(row.student.id)?'alert':record?.status==='submitted'?'good':'',extra:(record,row)=>medalData.medals.has(row.student.id)?rewardIconHtml():''});
    app.innerHTML=teacherToolShell('毎日の宿題',`${pupilDateNav(date,'teacher-daily-prev','teacher-daily-next')}<section class="panel daily-guide"><div class="toolbar-line"><div><h1>今日の提出確認</h1><p class="muted">児童名を押して記録します。未解決の忘れ物は今週分だけ表示します。</p></div>${teacherOrderControlHtml()}</div>${operationTipHtml('押し方を見る','押すたびに、提出 → 忘れた → 未確認の順で変わります。')}<div class="summary-row"><span>提出 <strong>${totals.submitted}</strong></span><span>忘れた <strong>${totals.forgotten}</strong></span><span>未確認 <strong>${totals.unconfirmed}</strong></span></div><div class="medal-setting"><label for="homework-medal-limit">達成アイコンの条件</label><select class="select" id="homework-medal-limit">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${n===medalData.limit?'selected':''}>1か月の忘れ ${n}回以内</option>`).join('')}</select><span class="muted small">条件を満たす名前の横に「${esc(state.rewardIcon)}」だけを表示します。</span></div></section>${cards}`);
    wireToolHome();wireStudentDetails();wireTeacherOrder(renderTeacherDaily);document.getElementById('teacher-daily-prev').addEventListener('click',()=>{state.toolDraft.teacherDailyDate=moveDate(date,-1);renderTeacherDaily();});document.getElementById('teacher-daily-next').addEventListener('click',()=>{state.toolDraft.teacherDailyDate=moveDate(date,1);renderTeacherDaily();});document.getElementById('homework-medal-limit').addEventListener('change',async event=>{await ClassDB.setMeta('homeworkMedalLimit',Number(event.target.value));showToast('達成アイコンの条件を保存しました');renderTeacherDaily();});document.querySelectorAll('[data-tool-student]').forEach(button=>button.addEventListener('click',()=>handleDailyTap(button.dataset.toolStudent,date,'teacher')));
  }

  function renderDailyContext(mode){if(mode==='teacher')renderTeacherDaily();else renderPupil('daily');}

  async function renderPupil(tool=state.pupilTool||'daily'){
    if(typeof tool!=='string')tool=state.pupilTool||'daily';
    if(state.onboardingStep===4){await setOnboardingStep(0);showToast('初回の準備が完了しました');}
    state.route='pupil';state.pupilTool=tool;state.teacherUntil=0;state.sessionSecret=null;clearTimeout(state.lockTimer);await ClassDB.setMeta('lastMode','pupil');
    const classItem=selectedClass();applyClassTheme(classItem);
    const nav=`<nav class="pupil-nav" aria-label="提出画面"><button type="button" data-pupil-tool="all" aria-selected="${tool==='all'}">一覧</button><button type="button" data-pupil-tool="daily" aria-selected="${tool==='daily'}">毎日の宿題</button><button type="button" data-pupil-tool="weekly" aria-selected="${tool==='weekly'}">週宿題</button><button type="button" data-pupil-tool="occasional" aria-selected="${tool==='occasional'}">提出物</button></nav>`;
    app.innerHTML=`<div class="app-shell">${headerHtml(`${esc(classItem?.name||'')}　児童用提出画面`,`<button type="button" class="header-button header-icon" id="pupil-help" aria-label="この画面の使い方" title="この画面の使い方">?</button><button type="button" class="header-button" id="teacher-entry" aria-label="先生用画面を開く" title="先生用画面を開く">⚙ 先生用</button>`,false,false)}<main class="page">${nav}<div id="pupil-content"></div></main></div>`;
    document.getElementById('teacher-entry').addEventListener('click',()=>requireTeacher(renderHome));
    document.getElementById('pupil-help').addEventListener('click',()=>openContextHelp('pupil'));
    document.querySelectorAll('[data-pupil-tool]').forEach(button=>button.addEventListener('click',()=>renderPupil(button.dataset.pupilTool)));
    if(tool==='all')await renderPupilAll();
    if(tool==='daily')await renderPupilDaily();
    if(tool==='weekly')await renderPupilWeekly();
    if(tool==='occasional')await renderPupilOccasional();
    if(!dialog.open)maybePromptWeeklyCreation('pupil');
  }

  async function homeworkMedalData(classId){const records=(await ClassDB.getAllByIndex('records','classId',classId)).filter(item=>item.type==='dailyHomework'&&item.date>=recentMonthStart()&&item.date<=today()&&!item.deletedAt);const counts=new Map();records.filter(item=>item.forgottenAt||item.status==='forgotten').forEach(item=>counts.set(item.studentId,(counts.get(item.studentId)||0)+1));const limit=Number(await ClassDB.getMeta('homeworkMedalLimit',0));const roster=await rosterForClass(classId);return{limit,counts,hasRecords:records.length>0,medals:new Set(records.length?roster.filter(row=>(counts.get(row.student.id)||0)<=limit).map(row=>row.student.id):[])};}

  async function pupilAlerts(classItem){
    const records=(await ClassDB.getAllByIndex('records','classId',classItem.id)).filter(item=>!item.deletedAt),roster=await rosterForClass(classItem.id,true),alerts=new Map(roster.map(row=>[row.student.id,[]]));
    if(state.pupilOverviewVisibility.daily)records.filter(item=>item.type==='dailyHomework'&&withinCurrentWeek(item.date)&&item.date<=today()&&item.status==='forgotten'&&!item.resolvedAt).forEach(item=>alerts.get(item.studentId)?.push({kind:'daily',text:`${relativeHomeworkLabel(item.date)}の宿題が出ていません`}));
    const week=currentWeekStart(),weekly=records.filter(item=>item.type==='weeklyOccurrence'&&mondayOf(item.dueDate)===week&&item.dueDate<=today()),weeklySubmissions=records.filter(item=>item.type==='weeklySubmission');
    if(state.pupilOverviewVisibility.weekly)for(const occurrence of weekly)for(const row of roster)if(!weeklySubmissions.some(item=>item.occurrenceId===occurrence.id&&item.studentId===row.student.id&&item.status==='submitted'))alerts.get(row.student.id).push({kind:'weekly',text:`今週の${occurrence.title}が出ていません`});
    const items=records.filter(item=>item.type==='occasionalItem'&&!item.archived&&item.dueDate<=today()),submissions=records.filter(item=>item.type==='occasionalSubmission');
    if(state.pupilOverviewVisibility.occasional)for(const item of items)for(const row of roster)if(!submissions.some(record=>record.itemId===item.id&&record.studentId===row.student.id&&record.status==='submitted'))alerts.get(row.student.id).push({kind:'occasional',text:`${item.title}の提出物が出ていません`});
    return{roster,alerts,medalData:await homeworkMedalData(classItem.id)};
  }

  async function renderPupilAll(){
    const classItem=selectedClass();const {roster,alerts,medalData}=await pupilAlerts(classItem);const needing=roster.filter(row=>alerts.get(row.student.id).length);
    document.getElementById('pupil-content').innerHTML=`<section class="pupil-overview-head"><h1>提出するもの一覧</h1><p>名前を探して、出ていないものを確認してください。提出の操作は上の各ページで行います。</p></section><section class="pupil-alert-grid">${roster.map(row=>{const items=alerts.get(row.student.id),count=medalData.counts.get(row.student.id)||0;return`<article class="pupil-alert-card ${items.length?'needs-action':'all-clear'}"><div class="pupil-alert-name"><strong>${esc(row.student.name)}</strong>${state.pupilOverviewVisibility.reward&&medalData.medals.has(row.student.id)?rewardIconHtml():''}</div>${state.pupilOverviewVisibility.monthly?`<div class="monthly-forgotten">この1か月で ${count}回忘れ</div>`:''}${items.length?`<div class="pupil-alert-list">${items.map(item=>`<button type="button" data-alert-tool="${item.kind}">! ${esc(item.text)}</button>`).join('')}</div>`:'<div class="all-clear-label">✓ 表示中の項目に未提出はありません</div>'}</article>`;}).join('')}</section>${!roster.length?'<section class="panel"><h2>名簿が未登録です</h2><p>先生に知らせてください。</p></section>':''}<p class="pupil-overview-summary">表示中の項目で確認が必要な児童：${needing.length}人</p>`;
    document.querySelectorAll('[data-alert-tool]').forEach(button=>button.addEventListener('click',()=>renderPupil(button.dataset.alertTool)));
  }

  function pupilDateNav(value,previousId,nextId,title=''){return `<div class="pupil-date-row"><button type="button" id="${previousId}" aria-label="前へ">◀</button><div><strong>${esc(shortJpDate(value))}</strong>${title?`<span>${esc(title)}</span>`:''}</div><button type="button" id="${nextId}" aria-label="次へ">▶</button></div>`;}

  async function renderPupilDaily(){
    const classItem=selectedClass();const date=today();state.pupilDate=date;
    const roster=await rosterForClass(classItem?.id,true,date);const records=await dailyRecords(classItem?.id,date);const map=new Map(records.map(record=>[record.studentId,record]));const medalData=await homeworkMedalData(classItem.id);
    const classRecords=await ClassDB.getAllByIndex('records','classId',classItem.id);const priorForgotten=new Set(classRecords.filter(item=>item.type==='dailyHomework'&&item.date>=currentWeekStart(date)&&item.date<date&&item.status==='forgotten'&&!item.resolvedAt&&!item.deletedAt).map(item=>item.studentId));
    const totals={submitted:0,forgotten:0,unconfirmed:0};roster.forEach(row=>{const status=map.get(row.student.id)?.status||'unconfirmed';totals[status]=(totals[status]||0)+1;});
    document.getElementById('pupil-content').innerHTML=`<div class="pupil-current-date">${esc(shortJpDate(date))}</div><div class="status-legend"><span class="legend-submitted">✓ 提出</span><span class="legend-forgotten">! 忘れた</span><span class="legend-unconfirmed">— 未確認</span></div><div class="summary-row"><span>提出 <strong>${totals.submitted}</strong></span><span>忘れた <strong>${totals.forgotten}</strong></span><span>未確認 <strong>${totals.unconfirmed}</strong></span></div>${roster.length?pupilStudentGrid(classItem,roster,map,'daily',priorForgotten,medalData.medals):`<section class="panel"><h2>名簿が未登録です</h2><p class="muted">右上の歯車から教師認証し、名簿を登録してください。</p></section>`}`;
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handleDailyTap(button.dataset.studentId,date,'pupil')));
  }

  async function renderPupilWeekly(){
    const classItem=selectedClass();const roster=await rosterForClass(classItem.id,true);const data=await weeklyData(classItem.id);const occurrences=data.occurrences;const missingRecurring=missingRecurringWeeks(data);const medalData=await homeworkMedalData(classItem.id);
    if(!occurrences.length){document.getElementById('pupil-content').innerHTML=`${weeklyRenewalNotice(missingRecurring,'pupil')}<section class="panel"><h2>週宿題はありません</h2><p class="muted">先生が登録すると、ここに表示されます。</p></section>`;wireWeeklyRenewal(missingRecurring,'pupil',()=>renderPupil('weekly'));return;}
    const occurrence=occurrences[0];state.pupilWeeklyId=occurrence.id;const records=data.submissions.filter(item=>item.occurrenceId===occurrence.id);const map=new Map(records.map(item=>[item.studentId,item]));
    document.getElementById('pupil-content').innerHTML=`${weeklyRenewalNotice(missingRecurring,'pupil')}<div class="pupil-current-date">${esc(shortJpDate(occurrence.dueDate))}<span>${esc(occurrence.title)}</span></div><div class="status-legend"><span class="legend-submitted">✓ 提出</span><span class="legend-forgotten">! 忘れた</span><span class="legend-unsubmitted">— 未提出</span></div><div class="summary-row"><span>名前を押すと状態が変わります。</span></div>${pupilStudentGrid(classItem,roster,map,'weekly',new Set(),medalData.medals)}`;
    wireWeeklyRenewal(missingRecurring,'pupil',()=>renderPupil('weekly'));
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handlePupilWeeklyTap(button.dataset.studentId,occurrence)));
  }

  async function handlePupilWeeklyTap(studentId,occurrence){
    if(rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handlePupilWeeklyTap(studentId,occurrence)));return;}
    const id=`weekly_${occurrence.id}_${studentId}`;const current=await ClassDB.get('records',id);const next=current?.status==='submitted'?'forgotten':current?.status==='forgotten'?'unsubmitted':'submitted';
    await ClassDB.put('records',{...(current||{}),id,type:'weeklySubmission',classId:selectedClass().id,studentId,date:occurrence.dueDate,dueDate:occurrence.dueDate,title:occurrence.title,occurrenceId:occurrence.id,status:next});markFeedback(studentId,next);showToast(next==='submitted'?'提出にしました':next==='forgotten'?'忘れたにしました':'未提出に戻しました');renderPupil('weekly');
  }

  async function renderPupilOccasional(){
    const classItem=selectedClass();const roster=await rosterForClass(classItem.id,true);const data=await occasionalData(classItem.id);const items=data.items.filter(item=>!item.archived);const medalData=await homeworkMedalData(classItem.id);
    if(!items.length){document.getElementById('pupil-content').innerHTML='<section class="panel"><h2>提出物はありません</h2><p class="muted">先生が登録すると、ここに表示されます。</p></section>';return;}
    const item=items[0];state.pupilOccasionalId=item.id;const records=data.submissions.filter(row=>row.itemId===item.id);const map=new Map(records.map(record=>[record.studentId,record]));
    document.getElementById('pupil-content').innerHTML=`<div class="pupil-current-date">${esc(shortJpDate(item.dueDate))}<span>${esc(item.title)}</span></div><div class="status-legend"><span class="legend-submitted">✓ 提出済み</span><span class="legend-unsubmitted">— 未提出</span></div><div class="summary-row"><span>名前を押して提出を記録します。</span></div>${pupilStudentGrid(classItem,roster,map,'occasional',new Set(),medalData.medals)}`;
    document.querySelectorAll('[data-student-id]').forEach(button=>button.addEventListener('click',()=>handlePupilOccasionalTap(button.dataset.studentId,item)));
  }

  async function handlePupilOccasionalTap(studentId,item){
    if(rolloverDue()&&!state.rolloverContinue){requireTeacher(()=>confirmOldYearContinuation(()=>handlePupilOccasionalTap(studentId,item)));return;}
    const id=`occasional_${item.id}_${studentId}`;const current=await ClassDB.get('records',id);const next=current?.status==='submitted'?'unsubmitted':'submitted';
    await ClassDB.put('records',{...(current||{}),id,type:'occasionalSubmission',classId:selectedClass().id,studentId,date:today(),dueDate:item.dueDate,title:item.title,itemId:item.id,status:next});markFeedback(studentId,next);showToast(next==='submitted'?'提出済みにしました':'未提出に戻しました');renderPupil('occasional');
  }

  function studentCard(row,record,kind='daily',priorForgotten=false,medals=new Set()){
    const defaults={daily:'unconfirmed',weekly:'unsubmitted',occasional:'unsubmitted'};const status=record?.status||defaults[kind];
    const labels={unconfirmed:'— 未確認',submitted:'✓ 提出',forgotten:'! 忘れた',unsubmitted:'— 未提出'};
    return `<button type="button" class="student-card ${status}${priorForgotten?' has-prior-forgotten':''}${feedbackClass(row.student.id)}" data-student-id="${row.student.id}"><strong>${esc(row.student.name)}${medals.has(row.student.id)?rewardIconHtml('medal-inline'):''}</strong><span class="state ${status}">${labels[status]||status}</span>${priorForgotten?'<span class="prior-flag">今週の忘れあり</span>':''}</button>`;
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
    const prior=all.filter(item=>item.type==='dailyHomework'&&item.classId===classItem.id&&item.date>=currentWeekStart(date)&&item.date<date&&item.status==='forgotten'&&!item.resolvedAt&&!item.deletedAt).sort((a,b)=>a.date.localeCompare(b.date));
    if(prior.length){openDailyWeekDialog(studentId,prior,date,mode);return;}
    const next=current?.status==='submitted'?'forgotten':current?.status==='forgotten'?'unconfirmed':'submitted';
    if(next==='unconfirmed'){await moveToTrash(current);}
    else await ClassDB.put('records',{...(current||{}),id,type:'dailyHomework',classId:classItem.id,studentId,date,status:next,resolvedAt:null,forgottenAt:next==='forgotten'?(current?.forgottenAt||ClassDB.now()):(current?.forgottenAt||null)});
    markFeedback(studentId,next);showToast(next==='submitted'?'提出にしました':next==='forgotten'?'忘れたにしました':'未確認に戻しました');
    renderDailyContext(mode);
  }
  function trashEntryFor(record){const deletedAt=ClassDB.now(),deviceId=ClassDB.deviceId();return{id:`trash_${record.id}`,record:{...record,deletedAt},deletedAt,purgeAfter:new Date(Date.now()+30*86400000).toISOString(),createdAt:deletedAt,updatedAt:deletedAt,deviceId};}
  async function moveToTrash(record){if(!record)return;await ClassDB.applyBatch({puts:{trash:[trashEntryFor(record)]},deletes:{records:[record.id]}});}
  async function openDailyWeekDialog(studentId,prior,date,mode){
    const student=await ClassDB.get('students',studentId),current=await ClassDB.get('records',`daily_${selectedClass().id}_${date}_${studentId}`),items=[...prior];if(!items.some(item=>item.date===date))items.push(current||{date,status:'unconfirmed'});items.sort((a,b)=>a.date.localeCompare(b.date));
    openDialog(`<h2>${esc(student?.name||'児童')}の今週の宿題</h2><p class="muted">今週の忘れ物と今日の分だけを表示しています。各日を「提出」または「忘れた」にしてください。</p><div class="daily-week-list">${items.map(item=>{const status=item.resolvedAt?'submitted':item.status;return`<div class="daily-week-row" data-daily-row="${item.date}"><div><strong>${esc(relativeHomeworkLabel(item.date,date))}</strong><span>${esc(shortJpDate(item.date))}</span></div><div class="daily-choice"><button type="button" data-daily-choice="submitted" data-daily-date="${item.date}" aria-pressed="${status==='submitted'}">✓ 提出</button><button type="button" data-daily-choice="forgotten" data-daily-date="${item.date}" aria-pressed="${status==='forgotten'}">! 忘れた</button></div></div>`;}).join('')}</div><div class="dialog-actions"><button type="button" class="button primary" id="daily-week-close">閉じて反映</button></div>`);
    document.querySelectorAll('[data-daily-choice]').forEach(button=>button.addEventListener('click',async()=>{const day=button.dataset.dailyDate,status=button.dataset.dailyChoice,existing=await ClassDB.get('records',`daily_${selectedClass().id}_${day}_${studentId}`);if(status==='submitted'&&day<date&&existing?.status==='forgotten')await resolvePrior(existing);else await setDailyStatus(studentId,day,status);const row=button.closest('[data-daily-row]');row.querySelectorAll('[data-daily-choice]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));markFeedback(studentId,status);showToast(status==='submitted'?'提出にしました':'忘れたにしました');}));
    document.getElementById('daily-week-close').addEventListener('click',()=>{closeDialog();renderDailyContext(mode);});
  }
  async function resolvePrior(record){await ClassDB.put('records',{...record,resolvedAt:ClassDB.now()});}
  async function setDailyStatus(studentId,date,status){const classItem=selectedClass();const id=`daily_${classItem.id}_${date}_${studentId}`;const current=await ClassDB.get('records',id);await ClassDB.put('records',{...(current||{}),id,type:'dailyHomework',classId:classItem.id,studentId,date,status,resolvedAt:null,forgottenAt:status==='forgotten'?(current?.forgottenAt||ClassDB.now()):(current?.forgottenAt||null)});}
  async function setDaySubmitted(studentId,date){return setDailyStatus(studentId,date,'submitted');}

  async function renderSettings(){
    if(!teacherActive()){renderPupil();return;}
    state.route='teacher-settings';state.activeTool='settings';
    const classItem=selectedClass();applyClassTheme(classItem);
    app.innerHTML=`<div class="app-shell">${headerHtml('設定')}<main class="page">
      <nav class="settings-nav" aria-label="設定項目">${[['guide','設定トップ'],['classes','クラス・児童'],['year','年度・認証'],['appearance','表示'],['tags','メモ・賞状'],['prompt','所見素材'],['data','データ管理'],['help','使い方・FAQ']].map(([id,label])=>`<button type="button" class="settings-tab" data-settings-tab="${id}" aria-selected="${state.settingsTab===id}" title="${label}を開く">${label}</button>`).join('')}</nav>
      <div id="settings-content"></div>
    </main>${teacherFooter('settings')}</div>`;
    wireCommonHeader('settings');document.querySelector('[data-breadcrumb-home]')?.addEventListener('click',()=>navigateSafely(renderHome));document.querySelectorAll('[data-footer-tool]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openTool(button.dataset.footerTool))));
    document.querySelectorAll('[data-settings-tab]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>{state.settingsTab=button.dataset.settingsTab;if(state.settingsTab==='classes'){state.classSettingsView='list';state.rosterDraft=[];state.rosterLoadedForClassId=null;}renderSettingsContent();})));
    renderSettingsContent();
  }
