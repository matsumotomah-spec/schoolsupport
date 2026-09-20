"use strict";

  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=89',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{}));
  window.addEventListener('error',event=>{console.error(event.error||event.message);showToast('画面処理でエラーが発生しました');});
  window.addEventListener('unhandledrejection',event=>{console.error(event.reason);showToast('保存処理を完了できませんでした。もう一度お試しください');});
  window.addEventListener('online',()=>{updateConnectionStatus();showToast('オンラインに戻りました');});
  window.addEventListener('offline',()=>{updateConnectionStatus();showToast('オフラインです。記録はこの端末に保存されます');});
  document.addEventListener('click',event=>{if(event.target.closest('[data-theme-toggle]'))toggleTheme();});
  document.addEventListener('mouseover',event=>{const button=event.target.closest('button');if(button&&!button.title){const label=button.getAttribute('aria-label')||button.textContent.replace(/\s+/g,' ').trim();if(label)button.title=label;}});
  document.addEventListener('input',event=>{if(event.target.matches('.pin-input'))event.target.setCustomValidity(event.target.value&&/^\d{6}$/.test(event.target.value)?'':'教師用PINは数字6桁で入力してください。');});
  document.addEventListener('input',event=>{if(event.target.closest('#app form,#roster-body'))unsavedChanges=true;});
  document.addEventListener('submit',()=>{unsavedChanges=false;},true);
  window.addEventListener('beforeunload',event=>{if(!unsavedChanges)return;event.preventDefault();event.returnValue='';});
  document.addEventListener('invalid',event=>{if(event.target.matches('.pin-input'))event.target.setCustomValidity('教師用PINは数字6桁で入力してください。');},true);
  if(window.MutationObserver){const terminologyObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE){const changed=friendlyTerms(node.nodeValue);if(changed!==node.nodeValue)node.nodeValue=changed;}else if(node.nodeType===Node.ELEMENT_NODE)applyFriendlyTerms(node);})));terminologyObserver.observe(document.body,{childList:true,subtree:true});}
  loadState().catch(error=>{console.error(error);app.innerHTML=`<main class="page narrow"><section class="panel"><h1>起動できませんでした</h1><p>${esc(error.message||'読み込み中にエラーが発生しました。')}</p><p class="muted">ページを再読み込みしても直らない場合は、この表示内容を先生用端末で確認してください。</p></section></main>`;});
