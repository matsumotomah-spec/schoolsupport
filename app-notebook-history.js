"use strict";

  /* ノート評価の履歴は、現在の入力画面とは別の表示・集約責務として扱う。 */
  const NotebookHistory=Object.freeze({
    label(record,formatDate=slashDate){return`${record?.subject||'教科なし'}　${record?.unit||'単元未設定'}　${formatDate(record?.date||'')}`;},
    sessions(records,resolveSessionKey){
      const grouped=new Map();
      records.forEach(record=>{const key=record.sessionKey||resolveSessionKey(record);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(record);});
      return[...grouped.entries()].map(([key,items])=>({key,records:[...items].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))})).sort((a,b)=>String(b.records[0]?.date||'').localeCompare(String(a.records[0]?.date||''))||String(b.records[0]?.updatedAt||'').localeCompare(String(a.records[0]?.updatedAt||'')));
    },
    html(sessions,{escape=esc,formatDate=slashDate}={}){
      const latest=sessions[0]?.records[0],summary=sessions.length?`${sessions.length}回・最新 ${formatDate(latest.date)}`:'まだ記録はありません';
      const list=sessions.length?`<div class="record-list section">${sessions.map(session=>{const first=session.records[0],evaluated=session.records.filter(record=>!['absent','unsubmitted'].includes(record.status)).length,exceptions=session.records.length-evaluated;return`<button type="button" class="record-item" data-notebook-session="${escape(session.key)}"><strong>${escape(NotebookHistory.label(first,formatDate))}</strong><span>${escape(first.title||'題名なし')}　${session.records.length}人分（評価 ${evaluated}人${exceptions?`・欠席／未提出 ${exceptions}人`:''}）</span></button>`;}).join('')}</div>`:'<p class="muted">まだ過去のノート評価はありません。</p>';
      return`<details class="panel notebook-history"><summary class="notebook-history-toggle"><span><strong>過去のノート評価</strong><small>${escape(summary)}</small></span></summary><div class="notebook-history-content"><p class="muted small">開くと、その回の児童一覧から評価・メモを確認・修正できます。</p>${list}</div></details>`;
    }
  });
