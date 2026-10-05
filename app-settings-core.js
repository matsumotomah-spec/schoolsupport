"use strict";

  const SETTINGS_CATEGORIES={
    classes:{title:'クラスと児童',description:'クラス、名簿、転入・転出、教科を管理します。'},
    operation:{title:'画面と操作',description:'画面の見え方、児童用画面、下部メニューを整えます。'},
    records:{title:'記録の候補',description:'児童メモ、賞状、支援級の記録、所見で使う候補を整えます。'},
    safety:{title:'データと安全',description:'同期・保存、年度、教師用PINを管理します。'}
  };
  function settingsCategoryFor(tab=state.settingsTab){if(tab==='classes')return'classes';if(['operation','appearance','footer'].includes(tab))return'operation';if(['records','tags','prompt'].includes(tab))return'records';if(['safety','data','year'].includes(tab))return'safety';return null;}
  function settingsScopeFor(tab=state.settingsTab){if(tab==='classes')return'年度・クラス単位';if(tab==='operation')return'設定項目によって異なります';if(['appearance','footer'].includes(tab))return'この端末・全クラス共通';if(['records','tags','prompt'].includes(tab))return'年度・全クラス共通';if(tab==='data')return'現在の年度・全クラス';if(tab==='year')return'現在の年度・この端末';if(tab==='safety')return'年度・この端末';return'';}
  function settingsScopeHtml(scope){return scope?`<small class="settings-scope settings-card-scope">対象：${esc(scope)}</small>`:'';}
  function settingsSaveNote(method,description){return`<p class="settings-save-note" data-save-method="${esc(method)}"><strong>${esc(method)}</strong><span>${esc(description)}</span></p>`;}
  function settingsSaveResult(target){
    if(!target)return null;
    let result=target.querySelector?.('[data-settings-save-result]');
    if(result)return result;
    result=document.createElement('p');result.className='settings-save-result';result.dataset.settingsSaveResult='';result.setAttribute('role','status');result.setAttribute('aria-live','polite');
    const actions=target.querySelector?.('.button-row.end,.dialog-actions');if(actions)actions.before(result);else target.append?.(result);
    return result;
  }
  async function runSettingsSave(source,operation,{successMessage='変更を保存しました',failureMessage='保存できませんでした。入力内容は残っています。同じ操作でもう一度お試しください。',completeDraft=true}={}){
    const target=source?.matches?.('form')?source:(source?.closest?.('form,.settings-detail-card')||source),result=settingsSaveResult(target),buttons=[...(target?.querySelectorAll?.('button[type="submit"], [data-settings-save], #save-roster')||[])],disabled=buttons.map(button=>button.disabled);
    target?.setAttribute?.('aria-busy','true');buttons.forEach(button=>button.disabled=true);if(result){result.className='settings-save-result saving';result.textContent='保存中…';}
    try{const saved=await operation();if(saved===false){if(result){result.className='settings-save-result';result.textContent='入力内容を確認してください。';}return false;}if(completeDraft&&target?.matches?.('form'))completeFormDraft(target);if(result){result.className='settings-save-result success';result.textContent=`保存済み：${successMessage}`;}showToast(successMessage);return true;}
    catch(error){console.error('設定の保存に失敗しました',error);if(result){result.className='settings-save-result error';result.textContent=failureMessage;}showToast('保存できませんでした。入力内容を残しています');return false;}
    finally{target?.removeAttribute?.('aria-busy');buttons.forEach((button,index)=>button.disabled=disabled[index]);}
  }
  function settingsPageLead(title,description,categoryKey=settingsCategoryFor(),scope=settingsScopeFor()){
    const category=SETTINGS_CATEGORIES[categoryKey]||{title:'設定',description:''};
    return`<section class="settings-page-lead"><button type="button" class="settings-back" data-settings-home>← 設定一覧</button><div><nav class="settings-level-nav" aria-label="設定の階層"><span>設定</span><b aria-hidden="true">›</b><span>${esc(category.title)}</span><b aria-hidden="true">›</b><strong>${esc(title)}</strong></nav><h1>${esc(title)}</h1><p class="settings-page-description">${esc(description||category.description)}</p><div class="settings-page-status">${settingsScopeHtml(scope)}<button type="button" class="settings-help-inline" data-settings-help>？ この画面の使い方</button></div></div></section>`;
  }
  function openSettingsRoute(tab,{classSettingsView='list'}={}){state.settingsTab=tab;state.classSettingsView=classSettingsView;renderSettingsContent();}
  function openSettingsPage(tab='guide',{classSettingsView='list'}={}){state.settingsTab=tab;state.classSettingsView=classSettingsView;if(tab==='classes'&&classSettingsView==='roster'){state.rosterDraft=[];state.rosterLoadedForClassId=null;}renderSettings();}
  function wireSettingsHome(target=document){target.querySelectorAll('[data-settings-home]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openSettingsRoute('guide'))));target.querySelectorAll('[data-settings-help]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openSettingsRoute('help'))));}
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
      ['operation','◐','画面と操作','画面の見え方、児童用画面、下部メニューを整えます。',`${state.theme==='dark'?'ダーク':'ライト'}・自動調整`,'日常の使いやすさ'],
      ['records','✎','記録の候補','児童メモ、賞状、支援級記録、所見で使う候補を整えます。','全クラス共通','入力前に必要なとき'],
      ['safety','▣','データと安全','同期・保存、年度、教師用PINを管理します。',`前回バックアップ：${esc(backupLabel)}`,'端末を替えるとき・年度末']
    ];
    target.innerHTML=`<section class="settings-start"><div><h1>設定</h1><p>必要な項目を選んで変更します。</p><small class="app-version-line">アプリ v${esc(APP_VERSION)}・最終更新 ${esc(APP_UPDATED_AT)}</small></div><div class="settings-status-grid" aria-label="現在の設定状況"><div class="settings-status-item good"><span>年度</span><strong>${esc(state.year?.label||'未設定')}</strong></div><div class="settings-status-item ${classItem?'good':'warn'}"><span>現在のクラス</span><strong>${esc(classItem?.name||'未設定')}</strong></div><div class="settings-status-item ${rosterCount?'good':'warn'}"><span>児童</span><strong>${rosterCount?`${rosterCount}人登録済み`:'未登録'}</strong></div></div></section><section class="settings-card-grid" aria-label="設定のカテゴリ">${cards.map(([id,icon,title,description,current,timing])=>`<button type="button" class="settings-category-card card-role-navigation ${id==='classes'&&!classItem?'recommended':''}" data-guide-tab="${id}" title="${esc(title)}を開く"><span class="settings-card-icon" aria-hidden="true">${icon}</span><small>${esc(timing)}</small><strong>${esc(title)}</strong><span>${esc(description)}</span><b>開く ▶</b></button>`).join('')}</section><section class="settings-help-link"><span>操作に迷ったときは</span><button type="button" class="button" data-guide-tab="help">使い方・FAQを開く</button></section>`;
    const start=target.querySelector('.settings-start'),categories=target.querySelector('.settings-card-grid'),overview=document.createElement('section');overview.className='settings-overview';overview.setAttribute('aria-label','現在の設定と変更項目');start.before(overview);overview.append(start,categories);
    target.querySelectorAll('[data-guide-tab]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openSettingsRoute(button.dataset.guideTab))));
  }

  function settingsNavigationCard({id,title,description,current='',action='開く',scope='',attribute='data-settings-route',className='settings-route-card',depthNote=true}){return`<button type="button" class="${className} card-role-navigation" ${attribute}="${esc(id)}"${depthNote?' data-settings-depth="2"':''}>${settingsScopeHtml(scope)}<strong>${esc(title)}</strong><span>${esc(description)}</span><b>${esc(action)} ▶</b></button>`;}
  function settingsChoiceCard({id,title,description,current='',scope='',selected=false,attribute='data-settings-choice'}){return`<button type="button" class="settings-role-card settings-choice-card" ${attribute}="${esc(id)}" aria-pressed="${selected?'true':'false'}">${settingsScopeHtml(scope)}<strong>${esc(title)}</strong><span>${esc(description)}</span><b>${selected?'選択中':'選ぶ'}</b></button>`;}
  function settingsActionCard({id,title,description,action,scope='',attribute='data-settings-action'}){return`<button type="button" class="settings-role-card settings-action-card" data-card-role="実行" ${attribute}="${esc(id)}">${settingsScopeHtml(scope)}<strong>${esc(title)}</strong><span>${esc(description)}</span><b>${esc(action)}</b></button>`;}
  function settingsStatusCard({title,value,description='',scope='',tone='good'}){return`<section class="settings-role-card settings-status-card ${esc(tone)}" data-card-role="状態">${settingsScopeHtml(scope)}<small>${esc(title)}</small><strong>${esc(value)}</strong>${description?`<span>${esc(description)}</span>`:''}</section>`;}
  function settingsDangerCard({id,title,description,action,scope='',attribute='data-settings-danger'}){return`<button type="button" class="settings-role-card settings-danger-card" data-card-role="危険操作" ${attribute}="${esc(id)}">${settingsScopeHtml(scope)}<strong>${esc(title)}</strong><span>${esc(description)}</span><b>${esc(action)}</b></button>`;}
  function settingsDisclosure({title,summary='',content='',open=false}){return`<details class="settings-disclosure"${open?' open':''}><summary><strong>${esc(title)}</strong>${summary?`<small>${esc(summary)}</small>`:''}</summary><div>${content}</div></details>`;}
  function settingsRouteCards(cards){return`<section class="settings-route-grid">${cards.map(([id,title,description,current,action='開く',scope=''])=>settingsNavigationCard({id,title,description,current,action,scope})).join('')}</section>`;}
  function wireSettingsRoutes(target=document){target.querySelectorAll('[data-settings-route]').forEach(button=>button.addEventListener('click',()=>navigateSafely(()=>openSettingsRoute(button.dataset.settingsRoute))));}
