"use strict";

  const SETTINGS_CATEGORIES={
    classes:{title:'クラスと児童',description:'クラス、名簿、転入・転出、教科を管理します。'},
    operation:{title:'画面と操作',description:'画面の見え方、児童用画面、下部メニューを整えます。'},
    records:{title:'記録の候補',description:'児童メモ、賞状、支援級の記録、所見で使う候補を整えます。'},
    safety:{title:'データと安全',description:'同期・保存、年度、教師用PINを管理します。'}
  };
  function settingsCategoryFor(tab=state.settingsTab){if(tab==='classes')return'classes';if(['operation','appearance','footer'].includes(tab))return'operation';if(['records','tags','prompt'].includes(tab))return'records';if(['safety','data','year'].includes(tab))return'safety';return null;}
  function settingsPageLead(title,description,categoryKey=settingsCategoryFor()){
    const category=SETTINGS_CATEGORIES[categoryKey]||{title:'設定',description:''};
    const scope=title.includes('児童名簿')?'クラスごと':title.includes('年度・教師用PIN')?'年度・この端末':categoryKey==='operation'?'この端末・全クラス共通':categoryKey==='records'?'年度・全クラス共通':categoryKey==='classes'?'年度・クラスごと':categoryKey==='safety'?'項目ごとに異なります（各カードで表示）':'設定内容により異なります';
    const saveState=categoryKey==='operation'?'変更はすぐに保存・反映されます':categoryKey==='safety'?'操作前に対象と影響を確認します':'保存ボタンを押すと反映されます';
    return`<section class="settings-page-lead"><button type="button" class="settings-back" data-settings-home>← 設定一覧</button><div><nav class="settings-level-nav" aria-label="設定の階層"><span>設定</span><b aria-hidden="true">›</b><span>${esc(category.title)}</span><b aria-hidden="true">›</b><strong>${esc(title)}</strong></nav><h1>${esc(title)}</h1><p class="settings-page-description">${esc(description||category.description)}</p><div class="settings-page-status"><small class="settings-scope settings-page-scope">適用範囲：${esc(scope)}</small><small class="status-pill good">${esc(saveState)}</small><button type="button" class="settings-help-inline" data-settings-help>？ この画面の使い方</button></div></div></section>`;
  }
  function wireSettingsHome(target=document){target.querySelectorAll('[data-settings-home]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>{state.settingsTab='guide';state.classSettingsView='list';renderSettingsContent();})));target.querySelectorAll('[data-settings-help]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>{state.settingsTab='help';renderSettingsContent();})));}
  function renderSettingsContent(){
    if(state.settingsTab==='guide')renderSettingsGuide();
    if(state.settingsTab==='operation')renderOperationSettings();
    if(state.settingsTab==='records')renderRecordSettings();
    if(state.settingsTab==='year'){renderYearSettings();wirePcPinlessSettings();}
    if(state.settingsTab==='classes')renderClassSettings();
    if(state.settingsTab==='appearance')renderAppearanceSettings();
    if(state.settingsTab==='tags')renderTagSettings();
    if(state.settingsTab==='prompt')renderPromptSettings();
    if(state.settingsTab==='footer')renderFooterSettings();
    if(state.settingsTab==='data')renderDataSettings();
    if(state.settingsTab==='safety')renderSafetySettings();
    if(state.settingsTab==='help')renderHelpContent();
  }

  async function renderSettingsGuide(){
    const target=document.getElementById('settings-content'),classItem=selectedClass(),rosterCount=classItem?(await rosterForClass(classItem.id)).length:0;
    if(state.settingsTab!=='guide'||!target)return;
    const backupLabel=state.lastBackupAt?new Date(state.lastBackupAt).toLocaleDateString('ja-JP'):'未保存';
    const cards=[
      ['classes','👥','クラスと児童','クラス作成、名簿、転入・転出、教科を管理します。',classItem?`${esc(classItem.name)}・${rosterCount}人`:'クラス未設定','最初に確認'],
      ['operation','◐','画面と操作','画面の見え方、児童用画面、下部メニューを整えます。',`${state.theme==='dark'?'ダーク':'ライト'}・${state.informationMode==='compact'?'すっきり':state.informationMode==='detailed'?'詳しく':'標準'}`,'日常の使いやすさ'],
      ['records','✎','記録の候補','児童メモ、賞状、支援級記録、所見で使う候補を整えます。','全クラス共通','入力前に必要なとき'],
      ['safety','▣','データと安全','同期・保存、年度、教師用PINを管理します。',`前回バックアップ：${esc(backupLabel)}`,'端末移動・年度始め']
    ];
    target.innerHTML=`<section class="settings-start"><div><h1>設定</h1><p>設定一覧から分野を選び、項目を開いて変更します。すべての設定画面で同じ階層と操作規則を使います。</p><small class="app-version-line">アプリ v${esc(APP_VERSION)}・最終更新 ${esc(APP_UPDATED_AT)}</small></div><div class="settings-status-grid" aria-label="現在の設定状況"><div class="settings-status-item good"><span>年度</span><strong>${esc(state.year?.label||'未設定')}</strong></div><div class="settings-status-item ${classItem?'good':'warn'}"><span>現在のクラス</span><strong>${esc(classItem?.name||'未設定')}</strong></div><div class="settings-status-item ${rosterCount?'good':'warn'}"><span>児童</span><strong>${rosterCount?`${rosterCount}人登録済み`:'未登録'}</strong></div></div></section><section class="settings-card-grid" aria-label="設定のカテゴリ">${cards.map(([id,icon,title,description,current,timing])=>`<button type="button" class="settings-category-card card-role-navigation ${id==='classes'&&!classItem?'recommended':''}" data-card-role="移動" data-guide-tab="${id}" title="${esc(title)}を開く"><span class="settings-card-icon" aria-hidden="true">${icon}</span><small>${esc(timing)}</small><strong>${esc(title)}</strong><span>${esc(description)}</span><em>現在：${current}</em><b>開く ›</b></button>`).join('')}</section><section class="settings-help-link"><span>操作に迷ったときは</span><button type="button" class="button" data-guide-tab="help">使い方・FAQを開く</button></section>`;
    target.querySelectorAll('[data-guide-tab]').forEach(button=>button.addEventListener('click',()=>{state.settingsTab=button.dataset.guideTab;renderSettingsContent();}));
  }

  function settingsRouteCards(cards){return`<section class="settings-route-grid">${cards.map(([id,title,description,current,action='開く',scope=''])=>`<button type="button" class="settings-route-card card-role-navigation" data-card-role="移動" data-settings-route="${id}" data-settings-depth="2"><strong>${esc(title)}</strong><span>${esc(description)}</span>${scope?`<small class="settings-scope">${esc(scope)}</small>`:''}<em>現在：${esc(current)}</em><b>${esc(action)} ›</b><small class="settings-depth-note">設定一覧から2クリック目</small></button>`).join('')}</section>`;}
  function wireSettingsRoutes(target=document){target.querySelectorAll('[data-settings-route]').forEach(button=>button.addEventListener('click',()=>{state.settingsTab=button.dataset.settingsRoute;renderSettingsContent();}));}
  function cardifySettingsPanels(target){target.querySelectorAll(':scope > .panel, :scope > details.panel').forEach(panel=>panel.classList.add('settings-detail-card'));}
  function cardifyAppearanceSections(target){const form=target.querySelector('#appearance-form');if(!form||form.dataset.cardified==='true')return;form.dataset.cardified='true';const children=[...form.children],groups=[];let current=null;children.forEach(node=>{if(node.tagName==='H2'){current=document.createElement('section');current.className='settings-detail-card settings-option-card';current.dataset.cardRole='選択';groups.push(current);current.append(node);}else if(current)current.append(node);});groups.forEach(card=>form.append(card));}
