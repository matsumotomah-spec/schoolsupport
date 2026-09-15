'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const applicationFiles=['app-core.js','app-shell.js','app-settings.js','app-records.js','app-grades.js','app-seating.js','app-reports.js','app-data.js','app.js'];
const applicationSource=()=>applicationFiles.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
global.window=global;
global.localStorage={length:0,key(){return null;},getItem(){return null;},removeItem(){}};
for(const file of ['csv-export.js','migration.js','xlsx-reader.js'])vm.runInThisContext(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});

function testCsv(){
  const roster=[
    {student:{id:'s2',name:'上田'},enrollment:{number:2}},
    {student:{id:'s1',name:'青木'},enrollment:{number:1}}
  ];
  const records=[
    {id:'d1',type:'dailyHomework',studentId:'s1',date:'2026-09-06',status:'submitted'},
    {id:'w1',type:'weeklyOccurrence',date:'2026-09-06',dueDate:'2026-09-06',title:'自主学習'},
    {id:'ws1',type:'weeklySubmission',occurrenceId:'w1',studentId:'s2',status:'forgotten'},
    {id:'o1',type:'occasionalItem',date:'2026-09-07',dueDate:'2026-09-07',title:'同意書',archived:false},
    {id:'a1',type:'notebookAssessment',studentId:'s1',date:'2026-09-06',subject:'国語',unit:'物語',title:'9/6',grade:'B+',viewpointGrades:{knowledge:'A',thinking:'B+',attitude:'B'},status:'evaluated',note:'場面に合う言葉を選べた'}
  ];
  const args={classItem:{name:'5年2組'},roster,records,start:'2026-09-01',end:'2026-09-30'};
  const submissions=ClassCsvExport.submissionRows(args);
  assert.equal(submissions.length,7,'3種類×2人を出力する');
  assert.deepEqual(submissions[1].slice(4,7),[1,'青木','提出済み']);
  assert.equal(submissions[2][6],'未確認');
  assert.equal(submissions[3][6],'未提出');
  assert.equal(submissions[4][6],'忘れた');
  const assessments=ClassCsvExport.assessmentRows(args);
  assert.deepEqual(assessments[1].slice(7,11),['A','B+','B','B+']);
  assert.deepEqual(assessments[0].slice(7,10),['知識・技能','思考・判断・表現','主体的に学習に取り組む態度']);
  assert.equal(assessments[1].at(-1),'場面に合う言葉を選べた','ノート評価メモをCSVへ出力する');
  const absentAssessment=ClassCsvExport.assessmentRows({...args,records:[{type:'notebookAssessment',studentId:'s1',date:'2026-09-06',subject:'国語',status:'absent'}]});
  assert.deepEqual(absentAssessment[1].slice(7,11),['','','',''],'欠席は観点評価欄を空欄にする');
  const csv=ClassCsvExport.csv([['氏名','式'],['青木','=1+1'],['上田',' =1+1']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=1+1"),'表計算ソフトの数式実行を防ぐ');
  assert.ok(csv.includes("' =1+1"),'先頭空白を含む数式も実行されない');
  const transferRoster=[...roster,{student:{id:'s3',name:'転入児童'},enrollment:{number:3,startDate:'2026-09-07'},enrollments:[{number:3,startDate:'2026-09-07'}]}];
  const transferRows=ClassCsvExport.submissionRows({...args,roster:transferRoster});
  assert.ok(!transferRows.some(row=>row[1]==='2026-09-06'&&row[5]==='転入児童'),'転入前の提出物を未提出として出力しない');
}

function testMigration(){
  const selfData={cc_names_v1:{1:'青木',2:'上田'},cc_hw_v3:{'2026-09-06':{1:1,2:3}},cc_wh_types_v1:[{id:'home','name':'自主学習ノート'}],cc_wh_v1:{'2026-09-06':{home:{1:1,2:2}}},cc_sb_v1:{'2026-09-06':{sessions:[{id:'notebook-1',name:'国語 ノート',kan:'物語',grades:{1:'B',2:'Bp'}}]}}};
  const ownFile={name:'クラスチェッカー_バックアップ.json',size:100,text:async()=>JSON.stringify({version:1,data:{...selfData,cc_seat_layout_v1:{cols:2,rows:1,seats:[{num:1},{num:2}]}}})};
  const combinedFile={name:'クラス記録_統合バックアップ.json',size:100,text:async()=>JSON.stringify({app:'classroom-suite',version:1,data:{...selfData,cc_ckpts_v1:{国語:['発言']},mc_meta_v1:{classIds:['A'],classNames:{A:'担当学級'}},mc_names_A_v1:{1:'伊藤'},mc_sb_A_v1:{'2026-09-06':{sessions:[{id:'other-1',name:'算数 ノート',kan:'小数',grades:{1:'A'}}]}}}})};
  return LegacyMigration.fromFiles([combinedFile,ownFile]).then(sources=>{
    assert.equal(sources.length,2,'重複する自クラス分を統合し、他クラス分と分ける');
    const self=sources.find(source=>source.kind==='classChecker'),other=sources.find(source=>source.kind==='multi');
    assert.ok(self&&other,'自クラス用と他クラス用を判別する');
    assert.equal(self.fileNames.length,2,'同じ自クラス記録を含む2ファイルを一つにまとめる');
    assert.ok(self.raw.cc_ckpts_v1&&self.raw.cc_seat_layout_v1,'両ファイルに分かれた設定を補完する');
    assert.equal(LegacyMigration.roster(self).length,2);
    const ids={青木:'s1',上田:'s2'};
    const records=LegacyMigration.records(self,({name,number})=>ids[name]||({1:'s1',2:'s2'}[number]),'c1');
    assert.equal(records.find(item=>item.studentId==='s1').status,'submitted');
    assert.equal(records.find(item=>item.type==='dailyHomework'&&item.studentId==='s2').status,'forgotten');
    const oldAbsent=records.find(item=>item.type==='weeklySubmission'&&item.studentId==='s2');
    assert.equal(oldAbsent.status,'unsubmitted','旧週宿題の欠席を忘れ物として数えない');
    assert.equal(oldAbsent.legacyStatus,'absent','旧画面で欠席だった情報を保持する');
    const otherRecords=LegacyMigration.records(other,({number})=>number===1?'s3':null,'c2');
    assert.equal(otherRecords.filter(item=>item.type==='notebookAssessment').length,1,'他クラスのノート評価を変換する');
  });
}

async function testXlsxRoster(){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'class-support-xlsx-')),content=path.join(temporary,'content'),relations=path.join(content,'xl','_rels'),worksheets=path.join(content,'xl','worksheets');
  fs.mkdirSync(relations,{recursive:true});fs.mkdirSync(worksheets,{recursive:true});
  fs.writeFileSync(path.join(content,'[Content_Types].xml'),'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  fs.writeFileSync(path.join(content,'xl','workbook.xml'),'<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="名簿" sheetId="1" r:id="rId1"/></sheets></workbook>');
  fs.writeFileSync(path.join(relations,'workbook.xml.rels'),'<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  fs.writeFileSync(path.join(worksheets,'sheet1.xml'),'<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>出席番号</t></is></c><c r="B1" t="inlineStr"><is><t>氏名</t></is></c><c r="C1" t="inlineStr"><is><t>学年</t></is></c><c r="D1" t="inlineStr"><is><t>性別</t></is></c></row><row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>青木</t></is></c><c r="C2"><v>5</v></c><c r="D2" t="inlineStr"><is><t>男</t></is></c></row></sheetData></worksheet>');
  const xlsx=path.join(temporary,'sample.xlsx');execFileSync('zip',['-qr',xlsx,'.'],{cwd:content});const bytes=fs.readFileSync(xlsx),file=new File([bytes],'sample.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  try{const rows=await XlsxRosterReader.read(file);assert.deepEqual(rows,[['出席番号','氏名','学年','性別'],['1','青木','5','男']]);}finally{fs.rmSync(temporary,{recursive:true,force:true});}
}

function testShellAndNavigation(){
  const app=applicationSource();
  const settings=fs.readFileSync(path.join(root,'app-settings.js'),'utf8');
  const data=fs.readFileSync(path.join(root,'app-data.js'),'utf8');
  const styles=fs.readFileSync(path.join(root,'styles.css'),'utf8'),xlsx=fs.readFileSync(path.join(root,'xlsx-reader.js'),'utf8');
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const db=fs.readFileSync(path.join(root,'db.js'),'utf8');
  assert.ok(!app.includes('id="sync-placeholder">同期'),'右上の独立した同期ボタンを残さない');
  assert.ok(app.includes('data-common-settings'),'共通ヘッダーから設定案内へ移動できる');
  assert.ok(app.includes('home-button'),'ホームを共通ヘッダーで強調する');
  assert.ok(app.includes('data-home-menu')&&app.includes('openHomeMenu'),'教師画面左側からやりたいことメニューを開ける');
  assert.ok(app.includes("function wireCommonHeader(helpKey='home'){\n    document.querySelector('[data-home-menu]')?.addEventListener('click',openHomeMenu)"),'すべての教師画面でハンバーガーメニューを共通配線する');
  assert.ok(styles.includes('.home-menu-drawer'),'教師用ハンバーガーメニューを左側のドロワーで表示する');
  assert.ok(styles.includes('.home-menu-button{flex:0 0 44px;width:44px'),'ハンバーガーボタンをiPadで押せる大きさにする');
  assert.ok(styles.includes('width:min(390px,92vw)'),'左メニューを狭い画面からはみ出させない');
  assert.ok(app.includes('data-current-class'),'共通ヘッダーから現在のクラスを確認・切替できる');
  assert.ok(app.includes('<small>操作中</small>'),'現在操作中のクラスを明示する');
  assert.ok(app.includes('pupil-header-title'),'児童用ヘッダーをクラス名と提出だけへ整理する');
  assert.ok(!app.includes('mode-chip pupil'),'児童用ヘッダーに重複するモード表示を残さない');
  assert.ok(settings.includes('name="pupil-kana-mode"')&&settings.includes("ClassDB.setMeta('pupilKanaMode'"),'ひらがな表示は教師用設定から変更できる');
  assert.ok(!app.includes('pupil-kana-toggle'),'児童用画面にひらがな切替を出さない');
  assert.ok(app.includes("ClassDB.setMeta('pupilKanaMode'"),'ひらがな表示の選択を端末に保存する');
  assert.ok(!app.includes('data-focus-toggle'),'意味が伝わりにくい集中表示ボタンをヘッダーに残さない');
  assert.ok(app.includes('name="information-mode"')&&app.includes('すっきり')&&app.includes('標準')&&app.includes('詳しく'),'画面の情報量を3段階で選べる');
  assert.ok(!app.includes("['roster','名簿']"),'名簿の独立タブを残さない');
  assert.ok(app.includes("state.classSettingsView='roster'"),'名簿画面へ直接移動できる');
  assert.ok(app.includes("showToast('先に名簿を登録してください')"));
  assert.ok(app.includes('data-roster-class'),'各クラスから名簿を開ける');
  assert.ok(app.includes('＋ 転入児童を追加'),'転入児童を日付付きで追加できる');
  assert.ok(app.includes('data-transfer-row'),'転出操作を入力行の取消と分ける');
  assert.ok(app.includes('data-reactivate-enrollment'),'転出済み児童を在籍へ戻せる');
  assert.ok(app.includes('data-delete-student-row'),'誤登録児童を転出と分けて削除できる');
  assert.ok(app.includes('data-restore-deleted-student'),'誤登録として削除した児童を戻せる');
  assert.ok(app.includes('deletedAt:timestamp')&&app.includes('directRecords.map(trashEntryFor)'),'児童削除を同期可能にし関連記録をごみ箱へ移す');
  assert.ok(app.includes("item.startDate||state.year.startDate)<=atDate"),'過去日は当時の在籍期間で児童を抽出する');
  assert.ok(!app.includes('id="class-type"'),'クラス種別の二重入力を残さない');
  assert.ok(app.includes('verifyRolloverArchive'),'年度保管ファイルを読み直す');
  assert.ok(app.includes('使い方・FAQ'),'ヘルプ画面を表示する');
  assert.ok(app.includes('faq-panel'),'FAQの折りたたみ表示を用意する');
  assert.ok(app.includes('class-tab-dot'),'クラス色を選択ボタンに表示する');
  assert.ok(!app.includes('<p class="home-hint">'),'ホームに件数バッジの凡例を重複表示しない');
  assert.ok(app.includes('dashboardHtml'),'ホームの対応状況ダッシュボードを表示する');
  assert.ok(app.includes("if(!items.length)return''"),'要対応がないときダッシュボードを隠す');
  assert.ok(!app.includes('data-roster-density title='),'カードの大きさを各記録画面に重複表示しない');
  assert.ok(app.includes('recordSyncHistory'),'同期履歴を保存する');
  assert.ok(app.includes('studentSupportSubjects'),'支援級の対象教科を児童ごとに判定する');
  assert.ok(app.includes('supportSubjects'),'名簿の児童ごとの支援記録教科を保存する');
  assert.ok(app.includes('unitsAtDate'),'支援級の過去日付で当時の学習単元を表示する');
  assert.ok(app.includes('moveDate(state.year.firstTermEnd,1)'),'支援級の後期集計開始日を前期終了日の翌日にする');
  assert.ok(app.includes('normalizeStudentName'),'児童名を正規化して重複候補を検出する');
  assert.ok(app.includes('openStudentMerge'),'重複児童を統合できる');
  assert.ok(app.includes('openExternalImport'),'宿題・提出物の外部取込画面を用意する');
  assert.ok(app.includes('externalImportHistory'),'外部取込の再取込を防止する');
  assert.ok(app.includes('data-external-candidate'),'名寄せ候補を手動選択できる');
  assert.ok(app.includes('student-number'),'出席番号順の児童カードに出席番号を表示する');
  assert.ok(app.includes("orderMode==='number'&&row.enrollment.number"),'出席番号表示を出席番号順に限定する');
  assert.ok(db.includes('function applyBatch')&&db.includes("db.transaction(names,'readwrite')"),'複数保存先を一つの処理で更新する');
  assert.ok(db.includes('function replaceAllRaw'),'復旧時に一括置換する');
  assert.ok(app.includes('savePreSyncSnapshot'),'同期直前の暗号化状態を自動保存する');
  assert.ok(app.includes('restorePreSyncSnapshot'),'同期前の状態へ戻せる');
  assert.ok(app.includes('validateSyncPayload'),'同期・復旧データを反映前に検証する');
  assert.ok(app.includes('restoreBackupFile'),'バックアップ復旧と同期取込を分離する');
  assert.ok(app.includes('runOnce'),'二重操作を防止する');
  assert.ok(app.includes('pinAuth:await createVerifier(pin)'),'初回設定で教師用PINを保存する');
  assert.ok(app.includes('PIN_MAX_FAILURES=5'),'PINの連続失敗回数を制限する');
  assert.ok(app.includes('PIN_LOCK_MS=30*1000'),'PINを30秒間ロックする');
  assert.ok(app.includes('classSupportPinAttemptsV1'),'PINロック状態を再読み込み後も維持する');
  assert.ok(app.includes('openPinMigration'),'旧データへ教師用PINを追加できる');
  assert.ok(app.includes('requestAnnualPassword'),'暗号化時に年度パスワードを確認する');
  assert.ok(app.includes('id="change-pin"'),'設定から教師用PINを変更できる');
  assert.ok(app.includes('id="change-annual-password"'),'設定から年度パスワードを変更できる');
  assert.ok(app.includes('connectionStatusHtml'),'オンライン状態を表示する');
  assert.ok(app.includes("window.addEventListener('unhandledrejection'"),'非同期エラーを利用者へ通知する');
  assert.ok(app.includes('requireTeacher(renderHome)'),'起動時は教師ホームへの認証から開始する');
  assert.ok(app.includes('themePreference'),'ライト・ダークモードを保存する');
  assert.ok(app.includes("['data','データ管理']"),'設定内に同期・バックアップ・出力をまとめる');
  assert.ok(data.includes('smart-import-status')&&data.includes('ファイルを選んで内容を確認'),'旧データ選択後の読込状況と次の操作を表示する');
  assert.ok(data.includes("await renderDataExchange(true);document.getElementById('settings-content').innerHTML=body"),'設定内の旧データ確認画面を、元の設定画面に上書きされない順番で表示する');
  assert.ok(!data.includes("await renderSettings();document.getElementById('settings-content').innerHTML=body"),'旧データ確認画面を消してしまう非同期描画順を残さない');
  assert.ok(data.includes('migration-no-target-classes'),'移行先クラスがない場合はクラス作成へ案内する');
  assert.ok(app.includes('renderSettingsGuide'),'設定の説明ページを用意する');
  assert.ok(app.includes('最初の準備')&&app.includes('日常の設定')&&app.includes('データ・年度'),'設定を作業目的で3群に整理する');
  assert.ok(app.includes('openContextHelp'),'ページ別ヘルプを横から表示する');
  assert.ok(app.includes('help-search'),'ヘルプを検索できる');
  assert.ok(app.includes('teacherFooter'),'日常機能を下部から切り替えられる');
  assert.ok(app.includes('＋ 新しい宿題を作る'),'週宿題の登録動線を明確にする');
  assert.ok(app.includes('＋ 新しい提出物を作る'),'提出物の登録動線を明確にする');
  assert.ok(app.includes('gradeLevel'),'一般級の学年を名簿へ引き継ぐ');
  assert.ok(app.includes('復旧コードだけで年度パスワードを再設定'),'ローカルデータは復旧コードだけで開ける');
  assert.ok(app.includes('data-resolve-daily'),'児童概要から毎日の忘れ物を解決できる');
  assert.ok(app.includes('data-resolve-weekly'),'児童概要から週宿題を提出済みにできる');
  assert.ok(app.includes('data-resolve-occasional'),'児童概要から提出物を解決できる');
  assert.ok(app.includes('openStudentQuickAdd'),'児童概要から記録を追加できる');
  assert.ok(app.includes('openStudentMemoAdd'),'児童概要からメモを追加できる');
  assert.ok(app.includes('openStudentAssessmentAdd'),'児童概要から評価を追加できる');
  assert.ok(app.includes('openStudentCertificateAdd'),'児童概要から賞状を追加できる');
  assert.ok(app.includes('openStudentSubmissionAdd'),'児童概要から提出物を追加できる');
  assert.ok(app.includes('student-overview-close'),'児童概要から元の一覧へ戻れる');
  assert.ok(app.includes('教師用PINは数字6桁で入力してください。'),'PIN桁数を日本語で案内する');
  assert.ok(app.includes('全データを削除（旧版データは残す）'),'旧版データを残す全データ削除を用意する');
  assert.ok(app.includes('resetToWelcomePreservingLegacy'),'クラス未設定時にようこそ画面へ戻す');
  assert.ok(app.includes("localStorage.removeItem(PIN_ATTEMPT_KEY)"),'全データ削除時に古いPIN試行情報を消す');
  assert.ok(!app.includes('id="setup-class" value="ひまわり"'),'支援級名にひまわりを自動入力しない');
  assert.ok(app.includes('missingRecurringWeeks'),'毎週の宿題は当週分だけ確認して作る');
  assert.ok(!app.includes('while(next<=state.year.endDate'),'週宿題を年度末まで一括作成しない');
  assert.ok(app.includes('data-pupil-tool="all"'),'児童用提出画面に一覧タブを表示する');
  assert.ok(app.includes('この1か月で ${count}回忘れ'),'児童用一覧に直近1か月の忘れ回数を表示する');
  assert.ok(app.includes('homeworkMedalLimit'),'達成アイコンの条件を保存する');
  assert.ok(app.includes("REWARD_ICONS=['✨','💯','👍','🌟','🏅','👏','✅','📚','🌈','🚀']"),'達成アイコンを10種類から選べる');
  assert.ok(app.includes('featureIconMode'),'標準記号と絵文字モードを保存する');
  assert.ok(app.includes('featureEmojiIcons'),'機能ごとの絵文字を保存する');
  assert.ok(app.includes('showMonthlyForgotten'),'1か月の忘れ回数表示を切り替える');
  assert.ok(app.includes('pupilOverviewVisibility'),'児童用一覧の表示項目を保存する');
  assert.ok(app.includes('state.pupilOverviewVisibility.daily')&&app.includes('state.pupilOverviewVisibility.weekly')&&app.includes('state.pupilOverviewVisibility.occasional'),'宿題・週宿題・提出物の警告を個別に切り替える');
  assert.ok(app.includes('state.pupilOverviewVisibility.monthly')&&app.includes('state.pupilOverviewVisibility.reward'),'忘れ回数と達成アイコンを個別に切り替える');
  assert.ok(app.includes('週宿題の表示・終了を管理')&&app.includes('今後の繰り返しを終了しました'),'週宿題を削除せず終了できる');
  assert.ok(app.includes('setWeeklyVisibility')&&app.includes('選んだ宿題を表示しない'),'週宿題をまとめて非表示にできる');
  assert.ok(app.includes('allOccurrences')&&app.includes('item.hidden'),'非表示の週宿題を通常表示から外す');
  assert.ok(app.includes('weeklyCreationQueue'),'今週分の二重作成を直列化する');
  assert.ok(app.includes('weeklyTapQueues'),'週宿題の素早い連続タップを順番に処理する');
  assert.ok(app.includes('data-pupil-weekly-choice'),'児童画面で今週の複数宿題を切り替えられる');
  assert.ok(app.includes('今週以外の日付も選べます'),'週宿題を先行作成できる');
  assert.ok(app.includes('restoreTrashRecord'),'ごみ箱から削除済み記録を復元できる');
  assert.ok(!app.includes('宿題名人'),'旧称号を画面に残さない');
  assert.ok(app.includes('openDailyWeekDialog'),'今週の忘れ物を日付別に確認する');
  assert.ok(app.includes('openDailyAbsenceDialog')&&app.includes('欠席を設定'),'毎日の宿題で欠席をまとめて設定できる');
  assert.ok(app.includes("status==='absent'&&item.status!=='absent'")||app.includes("item.status!=='absent'"),'欠席を忘れ回数から除外する');
  assert.ok(app.includes('supportUnitForStudent')&&app.includes('学習中の単元'),'支援級の児童メモへ現在の学習単元を反映する');
  assert.ok(app.includes('id="grade-note"')&&app.includes('note:note===undefined'),'ノート評価の詳細入力でメモを保存する');
  assert.ok(app.includes('pupil-overview-toggle')&&app.includes('pupilOverviewShowAll'),'児童用提出一覧をアラート対象に絞り全員表示へ切り替えられる');
  assert.ok(app.includes('row.enrollment?.number'),'児童用提出画面に出席番号を表示する');
  assert.ok(app.includes('daily-absence-grid')&&app.includes('activeSeatLayout'),'欠席者を席順から選択できる');
  assert.ok(app.includes('normalizeStudentName(row.name)')&&app.includes('normalizeStudentName(name)'),'名寄せで全角半角を含む空白を無視する');
  assert.ok(app.includes("style.setProperty('--action',color)")&&app.includes("style.setProperty('--action-text',text)"),'主要な操作色をクラスカラーに合わせる');
  assert.ok(app.includes('APP_UPDATED_AT')&&app.includes('アップデート日時'),'公開版とアップデート日時を表示する');
  assert.ok(app.includes('移す元の端末でファイルを作る')&&app.includes('移動先の端末で取り込む'),'同期の端末の役割を分かりやすく表示する');
  assert.ok(app.includes('今週以外の日付も選べます')&&!app.includes('dueDate<week||dueDate>week'),'週宿題を先の日付で作成できる');
  assert.ok(app.includes("item.date>=currentWeekStart(date)"),'毎日の忘れ物を月曜日で区切る');
  assert.ok(!app.includes('NFPYM-8AEXB-QQS28'),'バックアップ画面の復旧コード例を表示しない');
  assert.ok(app.includes('data-shortage-subject'),'不足教科を指定して児童メモを開く');
  assert.ok(app.includes('Math.floor(a.col/2)===Math.floor(b.col/2)'),'男女ペアを1・2列、3・4列の組で判定する');
  assert.ok(app.includes('col+=2'),'男女ペア警告も2列単位で判定する');
  assert.ok(app.includes('positionPenalty'),'位置条件を優先して席を割り当てる');
  assert.ok(app.includes('groupDefs'),'席替えグループの名称と追加設定を保存する');
  assert.ok(app.includes('aisleAfterColumns'),'印刷用通路を保存する');
  assert.ok(app.includes('8列×5行'),'可変座席の例を案内する');
  assert.ok(app.includes('今年度${summary.count}回'),'賞状の今年度回数を表示する');
  assert.ok(app.includes('前回から${since}日'),'賞状の前回からの日数を表示する');
  assert.ok(app.includes("['classes','クラス・児童']"),'設定名称をクラス・児童へ整理する');
  assert.ok(styles.includes('.tool-icon{width:42px'),'機能アイコンをタイル表示する');
  assert.ok(!app.includes('<span></span><span></span>'),'ノート評価の空白スペーサーを残さない');
  assert.ok(styles.includes('grid-template-columns:repeat(6,minmax(0,1fr))'),'ノート評価を6分割で均等配置する');
  assert.ok(styles.includes('grid-column:3 / span 2;grid-row:2'),'Bを中央に配置する');
  assert.ok(styles.includes('.teacher-footer'),'教師用の下部ナビを表示する');
  assert.ok(styles.includes('.student-overview-tabs'),'設定と児童記録のタブを視覚的に分ける');
  assert.ok(styles.includes('.data-task-grid'),'データ管理の目的別案内を表示する');
  assert.ok(app.includes('primary-data-tasks'),'データ管理は同期と安全保存を前面にする');
  assert.ok(app.includes('最近の同期・保存履歴を確認する'),'同期履歴を必要時だけ開く');
  assert.ok(styles.includes(':root[data-explanations="false"]'),'表示設定で説明領域を畳む');
  assert.ok(app.includes('data-save-row'),'児童を一人ずつ保存できる');
  assert.ok(settings.includes('class-subject-all')&&settings.includes('class-subject-none'),'クラス編集で担当教科を一括選択・一括解除できる');
  assert.ok(app.includes('teacherHelpContentHtml'),'教員の作業順によるチュートリアルとFAQを表示する');
  assert.ok(app.includes('defaultSeatAisles'),'印刷通路の初期値を2列ごとにする');
  assert.ok(app.includes('onboardingStep'),'初回設定後の操作案内を段階保存する');
  assert.ok(app.includes('次に、教師ホームの「毎日の宿題」を開いて'),'児童登録後の次操作を案内する');
  assert.ok(app.includes('data-seat-care-target'),'席替えの相手児童を一覧から選べる');
  assert.ok(app.includes('交換するもう1人を押してください'),'iPadで座席を順に押して交換できる');
  assert.ok(styles.includes('.seat-cell.tap-selected'),'席替えで選択中の座席を強調する');
  assert.ok(app.includes('class-support-sync-practice'),'個人情報のない同期練習ファイルを用意する');
  assert.ok(app.includes('Teamsの自分用領域などへ置く'),'同期の手順を3段階で案内する');
  assert.ok(styles.includes('.sync-steps'),'同期手順を視覚的に表示する');
  assert.ok(!app.includes('data-theme-toggle aria-label'),'ヘッダーにテーマ切替を表示しない');
  assert.ok(styles.includes('.emoji-choice-grid'),'達成アイコンと機能アイコンを同じ形式で選択できる');
  assert.ok(app.includes("STANDARD_ICONS={daily:'宿',weekly:'週',certificate:'賞'"),'標準アイコンを意味の分かる文字にする');
  assert.ok(app.includes('要対応')&&app.includes('対応が必要な児童'),'件数バッジの意味を文字で示す');
  assert.ok(app.includes('回収を終える'),'提出物の完了操作を教員向けの言葉にする');
  assert.ok(app.includes('学習するまとまりを変更'),'支援級の単元設定を分かりやすく案内する');
  assert.ok(app.includes('seat-condition-count'),'席替えの配慮設定人数を表示する');
  assert.ok(app.includes("operationTipHtml('押し方を見る'"),'タップ説明を折りたたみ表示にする');
  assert.ok(styles.includes('.operation-tip'),'タップ説明のアコーディオンを表示する');
  assert.ok(styles.includes('.display-mode-choices'),'アイコン表示モードを選択できる');
  assert.ok(styles.includes('overflow-wrap:anywhere'),'長い表示内容の重なりを防ぐ');
  assert.ok(styles.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'狭い画面では下部ナビを3列に折り返す');
  assert.ok(styles.includes('.help-drawer'),'ページ別ヘルプをスライド表示する');
  assert.ok(styles.includes('.unresolved-row'),'未解決項目を操作可能な一覧で表示する');
  assert.ok(styles.includes('.compact-roster'),'大人数をコンパクト表示する');
  assert.ok(app.includes('rosterDensity'),'児童一覧の表示密度を保存する');
  assert.ok(styles.includes('.settings-status-grid'),'設定トップに現在の準備状況を表示する');
  assert.ok(app.includes("['appearance','日常の表示・入力']")&&settings.includes('settings-subnav'),'表示・タグ・所見設定を日常の設定へまとめる');
  assert.ok(styles.includes('.settings-subnav{grid-template-columns:1fr}'),'狭い画面で日常設定の項目を縦に並べる');
  assert.ok(app.includes('smart-import-files')&&app.includes('inferExternalImportType'),'外部・旧ツールのファイルを判別して取り込める');
  assert.ok(styles.includes('button:focus-visible'),'キーボード操作時の焦点を明示する');
  assert.ok(styles.includes('.seat-aisle'),'印刷用通路を表示する');
  const shellMatch=sw.match(/const SHELL=\[([^;]+)\];/s);
  assert.ok(shellMatch);
  const assets=[...shellMatch[1].matchAll(/'\.\/([^']+)'/g)].map(match=>match[1].split('?')[0]).filter(Boolean);
  for(const asset of assets)assert.ok(fs.existsSync(path.join(root,asset)),`キャッシュ対象 ${asset} が存在する`);
  for(const script of ['db.js','migration.js','xlsx-reader.js','csv-export.js',...applicationFiles])assert.ok(index.includes(`<script src="${script}?v=62"></script>`));
  assert.ok(index.includes('styles.css?v=62'),'CSSに公開版番号を付ける');
  assert.ok(app.includes("register('./sw.js?v=62'"),'Service Workerの公開版番号を付ける');
  assert.ok(app.includes('dateInEnrollment(item.dueDate,currentEnrollment)'),'転入前・転出後の提出予定を未提出扱いにしない');
  assert.ok(app.includes('previousEnrollmentId'),'再在籍は過去の在籍期間を上書きしない');
  assert.ok(app.includes('data-ended-student'),'転出済み児童の過去記録を開ける');
  assert.ok(app.includes('offerSeatForTransfer'),'転入児童を現在の座席へ配置できる');
  assert.ok(app.includes('showUndoToast'),'記録変更を短時間取り消せる');
  assert.ok(app.includes('data-trash-restore'),'30日間のごみ箱から記録を復元できる');
  assert.ok(app.includes("APP_VERSION='62'")&&app.includes('APP_UPDATED_AT'),'データ管理に公開版と更新日時を表示する');
  assert.ok(app.includes("NOTEBOOK_POINTS={'A':5,'B+':4,'B':3,'B-':2,'C':1}"),'ノート評価の平均換算を定義する');
  assert.ok(app.includes("NOTEBOOK_DEFAULT_GRADES={knowledge:'B',thinking:'B',attitude:'B'}"),'ノート評価の初回入力を3観点すべてBにする');
  assert.ok(app.includes("label:'知識・技能'")&&app.includes("label:'思考・判断・表現'")&&app.includes("label:'主体的に学習に取り組む態度'"),'ノート評価の3観点を定義する');
  assert.ok(app.includes('viewpoint-grade-editor')&&app.includes('すべてBに戻す'),'3観点を1画面で変更できる');
  assert.ok(app.includes("data-notebook-period=\"front\"")&&app.includes("data-notebook-period=\"back\"")&&app.includes("data-notebook-period=\"year\""),'前期・後期・年間の集計切替を表示する');
  assert.ok(app.includes('欠席・未提出は平均から除外'),'欠席と未提出を平均値に含めないことを明示する');
  assert.ok(app.includes('前期・後期・年間の観点別平均を確認できます'),'ノート評価の画面別ヘルプから集計欄を案内する');
  assert.ok(styles.includes('.notebook-summary-row'),'ノート評価集計を端末幅に合わせて表示する');
  assert.ok(styles.includes('.viewpoint-grade-choices'),'3観点の評価ボタンを横並びで表示する');
  assert.ok(app.includes('class-support-shell-v${APP_VERSION}'),'更新確認で現在版のキャッシュを保持する');
  assert.ok(!app.includes('class-support-shell-v34'),'更新確認で旧版キャッシュ名を固定しない');
  assert.ok(styles.includes('@keyframes status-confirm'),'提出操作に短い確認アニメーションを表示する');
  assert.ok(app.includes('seat-run no-print'),'席替え作成操作を印刷画面から除外する');
  assert.ok(styles.includes('.seat-run,.seat-history,.no-print'),'印刷時に操作パネルを除外する');
  assert.ok(styles.includes('.teacher-footer,.seat-controls'),'印刷時に教師用フッターを除外する');
  assert.ok(app.includes('openPrintPreview'),'座席表だけを持つ印刷専用画面を用意する');
  assert.ok(app.includes('seatingPrintLayoutHtml'),'印刷では氏名だけの座席セルを組み立てる');
  const printLayout=app.slice(app.indexOf('function seatingPrintLayoutHtml'),app.indexOf('function teacherViewDraft'));
  assert.ok(!printLayout.includes('groupNames')&&!printLayout.includes('condition.')&&!printLayout.includes('<small>'),'印刷専用座席に番号・配慮事項を混ぜない');
  assert.ok(app.includes('chooseSeatingPrintView'),'印刷前に児童側と教師側の向きを選べる');
  assert.ok(app.includes('teacherViewDraft'),'教師側の座席配置へ変換する');
  assert.ok(styles.includes('body.print-preview-active .print-preview-toolbar'),'印刷時に専用画面の操作バーを除外する');
  assert.ok(styles.includes('body.print-preview-active> :not(#app)'),'印刷時に通知とダイアログを除外する');
  assert.ok(styles.includes('--aisle-track:minmax(12px,.45fr)'),'席替え印刷の通路を狭める');
  assert.ok(styles.includes('aspect-ratio:2.2/1'),'印刷する机を横長にする');
  assert.ok(styles.includes('column-gap:2px'),'印刷時の通常の列間隔を狭くする');
  assert.ok(styles.includes('size:A4 landscape'),'席替えをA4横向きで印刷する');
  assert.ok(!app.includes('data-print-teacher-seats'),'席替え以外の画面に座席印刷を置かない');
  assert.ok(app.includes('activeSeatAisleAfterColumns'),'教師画面にも通路位置を反映する');
  assert.ok(app.includes('廊下側から${hallColumn}・${hallColumn+1}列の間'),'通路位置を廊下側から数える');
  assert.ok(app.includes('id="setup-group" value=""'),'初期クラスの組を空欄にする');
  assert.ok(app.includes('<option value="">学年</option>'),'初期クラスの学年を未選択にする');
  assert.ok(app.includes('週宿題の表示・終了を管理'),'古い週宿題を一覧から整理できる');
  assert.ok(app.includes('renderGradebook')&&app.includes('Excelのテスト採点表を取り込む'),'成績管理画面とExcel取込の入口を用意する');
  assert.ok(app.includes('type:\'testScore\'')&&app.includes('testStudentSummary'),'テスト得点を児童別に集計する');
  assert.ok(app.includes('notebookStudentSummary(notesByStudent'),'テストとノート評価を同じ一覧に並べる');
  assert.ok(xlsx.includes('readWorkbook')&&xlsx.includes('sheetList'),'Excelの複数教科シートを読み込める');
  assert.ok(app.includes("visible.daily?`<button")&&app.includes('visible.weekly?`<button')&&app.includes('visible.occasional?`<button'),'児童用表示設定を提出タブにも反映する');
  assert.ok(app.includes('visibleRewardMedals(medalData)')&&app.includes("state.pupilOverviewVisibility.reward?medalData.medals:new Set()"),'達成アイコンの表示設定を提出画面にも反映する');
  assert.ok(app.includes('preserveSeatShape:true,atDate:date,status:(record,row)=>{const summary=certificateSummary'),'ミニ賞状を座席順表示にも対応する');
  assert.ok(app.includes("toolHtml('grades','点','成績管理',0)}${toolHtml('occasional'"),'担当外クラスのホームにも成績管理を表示する');
  assert.ok(app.includes("['memo','assessment','grades','occasional']"),'担当外クラスのフッターから成績管理へ移動できる');
  assert.ok(app.includes('submissionExempt')&&app.includes('subjectExempt'),'交流学級の提出・教科対象外を児童ごとに判定する');
  assert.ok(settings.includes('交流学級での配慮')&&settings.includes('data-exchange-support'),'名簿から交流学級の配慮を設定できる');
  assert.ok(app.includes('notebook-history-select')&&app.includes('openNotebookRecordEditor'),'過去のノート評価をプルダウンから編集できる');
  assert.ok(app.includes("application/json;charset=utf-8")&&app.includes("/\\.json\$/i.test(name)"),'JSON保存をtext/plainからapplication/jsonへ切り替える');
  assert.ok(app.includes('復旧コードは、パスワードを忘れた場合だけ使用します')&&app.includes('.json.txt'),'同期画面で通常パスワードと既存ファイルを案内する');
}

function testApplicationSplit(){
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const positions=applicationFiles.map(file=>index.indexOf(`<script src="${file}?v=62"></script>`));
  assert.ok(positions.every(position=>position>=0),'分割した全スクリプトを読み込む');
  assert.deepEqual(positions,[...positions].sort((a,b)=>a-b),'依存関係どおりの順序で読み込む');
  for(const file of applicationFiles)execFileSync(process.execPath,['--check',path.join(root,file)]);
  assert.ok(fs.statSync(path.join(root,'app.js')).size<10000,'app.jsは起動処理だけに限定する');
  const source=applicationSource();
  assert.ok(source.includes('renderHome')&&source.includes('renderSettings')&&source.includes('renderSeating')&&source.includes('applySyncPlan'),'分割後も主要機能を保持する');
}

function testSeparateScriptEvaluation(){
  const documentStub={getElementById(){return null;},addEventListener(){},querySelector(){return{setAttribute(){}};},querySelectorAll(){return[];},documentElement:{dataset:{},style:{setProperty(){}}}};
  const sandbox={console,document:documentStub,navigator:{onLine:true},localStorage:global.localStorage,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,Blob,URL,setTimeout,clearTimeout};
  sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.matchMedia=()=>({matches:false});
  const context=vm.createContext(sandbox);
  for(const file of applicationFiles){
    let source=fs.readFileSync(path.join(root,file),'utf8');
    if(file==='app.js')source=source.replace('loadState().catch(','Promise.resolve().catch(');
    vm.runInContext(source,context,{filename:file});
  }
  assert.equal(vm.runInContext('APP_VERSION',context),'62');
  vm.runInContext("state.informationMode='compact';applyTheme()",context);
  assert.equal(documentStub.documentElement.dataset.information,'compact');
  assert.equal(documentStub.documentElement.dataset.explanations,'false');
  vm.runInContext("state.year={startDate:'2026-04-01',firstTermEnd:'2026-10-10',endDate:'2027-03-31'}",context);
  assert.equal(vm.runInContext("(()=>{const week=currentWeekStart(),data={classId:'c1',occurrences:[{id:'w1',recurring:true,seriesId:'series1',dueDate:moveDate(week,-7)}],skippedWeeks:[]};return missingRecurringWeeks(data).length})()",context),1,'有効な毎週宿題は今週分の作成対象にする');
  assert.equal(vm.runInContext("(()=>{const week=currentWeekStart(),data={classId:'c1',occurrences:[{id:'w1',recurring:true,seriesId:'series1',dueDate:moveDate(week,-7)}],skippedWeeks:[`c1|series1|${week}`]};return missingRecurringWeeks(data).length})()",context),0,'この週だけ削除した毎週宿題は再作成案内を出さない');
  assert.equal(vm.runInContext("notebookSummaryPeriodRange('back').start",context),'2026-10-11');
  assert.equal(vm.runInContext('notebookAverageLabel(3.49)',context),'B');
  const notebookSummary=JSON.parse(vm.runInContext("JSON.stringify(notebookStudentSummary([{grade:'A',status:'evaluated'},{grade:'B',status:'evaluated'},{grade:null,status:'absent'},{grade:null,status:'unsubmitted'}]))",context));
  assert.equal(notebookSummary.average,4,'AとBの平均を正しく算出する');
  assert.equal(notebookSummary.count,2,'欠席・未提出を評価数から除外する');
  assert.equal(notebookSummary.absent,1);assert.equal(notebookSummary.unsubmitted,1);
  const viewpointSummary=JSON.parse(vm.runInContext("JSON.stringify(notebookStudentSummary([{viewpointGrades:{knowledge:'A',thinking:'B',attitude:'C'},status:'evaluated'}]))",context));
  assert.equal(viewpointSummary.average,3);assert.equal(viewpointSummary.viewpoints.knowledge.average,5);assert.equal(viewpointSummary.viewpoints.attitude.average,1);
  assert.equal(vm.runInContext("notebookViewpointText({grade:'B+',status:'evaluated'})",context),'知B＋・思B＋・態B＋','旧形式の単一評価を3観点へ引き継ぐ');
  assert.equal(vm.runInContext("notebookOverallGrade({knowledge:'A',thinking:'B',attitude:'B'})",context),'B+','3観点から総合目安を算出する');
  const testViewpoints=JSON.parse(vm.runInContext("JSON.stringify(testStudentSummary([{total:16,maxTotal:20,scores:[{viewpoint:'knowledge',point:8,max:10},{viewpoint:'thinking',point:8,max:10}]}]).viewpoints)",context));
  assert.equal(testViewpoints.knowledge.percentage,80,'テストの知識・技能を別集計する');assert.equal(testViewpoints.thinking.percentage,80,'テストの思考・判断・表現を別集計する');
  assert.equal(vm.runInContext('typeof renderHome',context),'function');
  assert.equal(vm.runInContext('typeof renderSettings',context),'function');
  assert.equal(vm.runInContext('typeof renderSeating',context),'function');
  assert.equal(vm.runInContext('typeof applySyncPlan',context),'function');
  assert.equal(vm.runInContext("submissionExempt({enrollment:{submissionExempt:true}})",context),true,'提出管理の対象外を児童ごとに判定する');
  assert.equal(vm.runInContext("subjectExempt({enrollment:{excludedSubjects:['算数']}},'算数')",context),true,'参加しない教科を児童ごとに判定する');
  assert.equal(vm.runInContext('typeof openNotebookRecordEditor',context),'function','ノート評価履歴の編集画面を用意する');
  assert.equal(vm.runInContext('typeof openTestScoreList',context),'function','過去に取り込んだテストの点数一覧を開ける');
  assert.equal(vm.runInContext("testViewpoint('知識・技能')",context),'knowledge','Excelの知識・技能列を判定する');
  assert.equal(vm.runInContext("testViewpoint('思考・判断・表現')",context),'thinking','Excelの思考・判断・表現列を判定する');
  assert.equal(vm.runInContext("testViewpoint('漢字小テスト')",context),'knowledge','旧データの漢字小テストを知識・技能へ分類する');
  assert.equal(vm.runInContext("testViewpoint('読むこと')",context),'thinking','国語の読むことを思考・判断・表現へ分類する');
  assert.equal(vm.runInContext("combinedCriterionSummary(testStudentSummary([{total:16,maxTotal:20,scores:[{label:'漢字',point:8,max:10},{label:'読むこと',point:8,max:10}]}]),notebookStudentSummary([{viewpointGrades:{knowledge:'B',thinking:'B+',attitude:'B'},status:'evaluated'}])).knowledge.label",context),'B＋','テストとノートを合わせて知識・技能の目安を算出する');
  assert.equal(vm.runInContext("state.pupilOverviewVisibility.reward=false;visibleRewardMedals({medals:new Set(['s1'])}).size",context),0,'達成アイコンを非表示にすると児童用画面の印も隠す');
  vm.runInContext("state.classes=[{id:'c1',name:'テスト組',isOwn:true}];state.selectedClassId='c1';state.year={label:'2026年度',startDate:'2026-04-01',firstTermEnd:'2026-10-10',endDate:'2027-03-31'}",context);
  assert.ok(vm.runInContext("headerHtml('ノート評価').includes('data-home-menu')",context),'教師用の各機能画面にもハンバーガーメニューを表示する');
  assert.ok(!vm.runInContext("headerHtml('提出','',false,false).includes('data-home-menu')",context),'児童用画面には教師メニューを表示しない');
  assert.equal(vm.runInContext("state.pupilKanaMode=true;pupilClassName({name:'5年3組'})",context),'5ねん3くみ','児童用ひらがなモードで一般級名を読みやすく表示する');
  assert.equal(vm.runInContext("pupilStatusLabel('submitted')",context),'✓ だした','児童用ひらがなモードで提出状態を読みやすく表示する');
  assert.equal(vm.runInContext("state.pupilKanaMode=false;pupilStatusLabel('submitted')",context),'✓ 提出','通常表示へ戻せる');
  assert.equal(vm.runInContext("inferExternalImportType([{title:'自主学習ノート'}],'提出.csv').type",context),'weekly','自主学習の表を週宿題と推測する');
  assert.equal(vm.runInContext("inferExternalImportType([{title:'運動会参加同意書'}],'提出.csv').type",context),'occasional','同意書の表を提出物と推測する');
  assert.equal(vm.runInContext("inferExternalImportType([{title:'毎日の音読'}],'提出.csv').type",context),'daily','毎日の音読を毎日の宿題と推測する');
  assert.equal(vm.runInContext("externalImportRows([['日付','出席番号','氏名','宿題名','状態'],['2026-09-13','1','青木','自主学習','提出']]).length",context),1,'見出しの列順にかかわらずデータ行だけを取り込む');
}

async function testWeeklyStateTransitions(){
  const stores={records:new Map(),trash:new Map(),meta:new Map()},clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));let sequence=0;
  const ClassDB={uid:prefix=>`${prefix}_${++sequence}`,now:()=>new Date().toISOString(),deviceId:()=>'test-device',async get(store,key){return clone(stores[store]?.get(key));},async getAll(store){return [...(stores[store]?.values()||[])].map(clone);},async getAllByIndex(store,index,value){return [...(stores[store]?.values()||[])].filter(item=>item[index]===value).map(clone);},async put(store,item){const saved={...clone(item),createdAt:item.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),deviceId:'test-device'};stores[store].set(saved.id||saved.key,saved);return clone(saved);},async remove(store,key){stores[store].delete(key);},async getMeta(key,fallback=null){return clone(stores.meta.get(key)?.value??fallback);},async applyBatch({puts={},deletes={}}={}){for(const [store,items] of Object.entries(puts))for(const item of items||[])stores[store].set(item.id||item.key,clone(item));for(const [store,keys] of Object.entries(deletes))for(const key of keys||[])stores[store].delete(key);}};
  const element=()=>({open:false,innerHTML:'',classList:{add(){},remove(){}},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},setAttribute(){}}),documentStub={getElementById:element,addEventListener(){},querySelector(){return element();},querySelectorAll(){return[];},createTreeWalker(){return{nextNode(){return false;}}},documentElement:{dataset:{},style:{setProperty(){}}}};
  const sandbox={console,document:documentStub,NodeFilter:{SHOW_TEXT:4},navigator:{onLine:true},localStorage:global.localStorage,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,Blob,URL,setTimeout,clearTimeout,ClassDB};sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.matchMedia=()=>({matches:false});const context=vm.createContext(sandbox);
  for(const file of applicationFiles){let source=fs.readFileSync(path.join(root,file),'utf8');if(file==='app.js')source=source.replace('loadState().catch(','Promise.resolve().catch(');vm.runInContext(source,context,{filename:file});}
  vm.runInContext("state.year={id:'y1',startDate:'2026-04-01',firstTermEnd:'2026-10-10',endDate:'2027-03-31'};state.classes=[{id:'c1',name:'テスト組'}];state.selectedClassId='c1';showToast=()=>{};markFeedback=()=>{};closeDialog=()=>{};renderWeekly=async()=>{};showUndoToast=(message,undo)=>{window.__weeklyUndo=undo};",context);
  const source=await vm.runInContext("(async()=>{const week=currentWeekStart(),previous=moveDate(week,-7);return ClassDB.put('records',{id:'weekly-old',type:'weeklyOccurrence',classId:'c1',studentId:null,date:moveDate(previous,2),dueDate:moveDate(previous,2),weekStart:previous,title:'自主学習',seriesId:'series-a',recurring:true,seriesActive:true})})()",context);
  context.__source=source;await vm.runInContext('Promise.all([createCurrentWeeklyOccurrences([__source]),createCurrentWeeklyOccurrences([__source])])',context);
  const current=JSON.parse(await vm.runInContext("(async()=>JSON.stringify((await weeklyData('c1')).occurrences.filter(item=>item.seriesId==='series-a'&&mondayOf(item.dueDate)===currentWeekStart())))()",context));assert.equal(current.length,1,'二度押しでも今週分を重複作成しない');
  const visible=JSON.parse(vm.runInContext("JSON.stringify(currentWeeklyOccurrences({occurrences:[{id:'past',dueDate:moveDate(currentWeekStart(),-1)},{id:'one',dueDate:currentWeekStart()},{id:'two',dueDate:moveDate(currentWeekStart(),4)}]}).map(item=>item.id))",context));assert.deepEqual(visible,['one','two'],'児童画面の対象を今週の複数宿題だけにする');
  context.__occurrence=current[0];await vm.runInContext("Promise.all([applyWeeklyTap('s1',__occurrence,async()=>{}),applyWeeklyTap('s1',__occurrence,async()=>{})])",context);assert.equal((await ClassDB.get('records',`weekly_${current[0].id}_s1`)).status,'forgotten','素早い2回押しを順番に処理する');await vm.runInContext("applyWeeklyTap('s1',__occurrence,async()=>{})",context);assert.equal((await ClassDB.get('records',`weekly_${current[0].id}_s1`)).status,'unsubmitted','3回目で未提出へ戻す');
  await vm.runInContext("ClassDB.put('records',{id:'weekly-stale',type:'weeklySubmission',classId:'c1',studentId:'s2',occurrenceId:__occurrence.id,status:'forgotten',forgottenOn:'2000-01-01'})",context);await vm.runInContext("weeklyData('c1')",context);assert.equal((await ClassDB.get('records','weekly-stale')).status,'unsubmitted','前日に忘れた週宿題は翌日に未提出へ戻す');
  await vm.runInContext("ClassDB.put('records',{id:`weekly_${__occurrence.id}_s1`,type:'weeklySubmission',classId:'c1',studentId:'s1',date:__occurrence.dueDate,dueDate:__occurrence.dueDate,title:__occurrence.title,occurrenceId:__occurrence.id,status:'submitted'})",context);await vm.runInContext('endWeeklySeries(__occurrence)',context);assert.equal((await ClassDB.get('records','weekly-old')).seriesActive,false,'繰り返し終了を過去回へ反映する');assert.equal((await ClassDB.get('records',`weekly_${current[0].id}_s1`)).status,'submitted','終了しても提出記録を残す');await vm.runInContext('resumeWeeklySeries(__occurrence)',context);assert.equal((await ClassDB.get('records','weekly-old')).seriesActive,true,'終了した繰り返しを再開できる');await vm.runInContext('setWeeklyVisibility([__occurrence.id],true)',context);const hidden=JSON.parse(await vm.runInContext("(async()=>JSON.stringify(await weeklyData('c1')))()",context));assert.ok(!hidden.occurrences.some(item=>item.id===context.__occurrence.id),'非表示の宿題を通常一覧から外す');assert.ok(hidden.allOccurrences.some(item=>item.id===context.__occurrence.id),'非表示の宿題も管理一覧には残す');await vm.runInContext('setWeeklyVisibility([__occurrence.id],false)',context);assert.ok((await ClassDB.get('records',context.__occurrence.id)).hidden===false,'非表示の宿題を再表示できる');
}

async function testImportValidation(){
  const documentStub={getElementById(){return null;},addEventListener(){},querySelector(){return{setAttribute(){}};},querySelectorAll(){return[];},documentElement:{dataset:{},style:{setProperty(){}}}};
  const sandbox={console,document:documentStub,navigator:{onLine:true},localStorage:global.localStorage,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,Blob,URL,setTimeout,clearTimeout};
  sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.matchMedia=()=>({matches:false});
  const context=vm.createContext(sandbox);
  for(const file of applicationFiles){let source=fs.readFileSync(path.join(root,file),'utf8');if(file==='app.js')source=source.replace('loadState().catch(','Promise.resolve().catch(');vm.runInContext(source,context,{filename:file});}
  const valid={format:'class-support-sync-payload',schemaVersion:1,yearId:'y1',yearLabel:'2026年度',generatedAt:'2026-09-09T00:00:00.000Z',device:'テスト',data:{years:[{id:'y1'}],classes:[{id:'c1',yearId:'y1'}],students:[{id:'s1',name:'青木'}],enrollments:[{id:'e1',classId:'c1',studentId:'s1'}],records:[{id:'r1',classId:'c1',studentId:'s1',type:'memo'}],trash:[],meta:[]}};
  assert.equal(sandbox.validateSyncPayload(valid),valid,'正しい同期データを受理する');
  assert.throws(()=>sandbox.validateSyncPayload({...valid,data:{...valid.data,records:[{id:'r2',classId:'c1',studentId:'unknown'}]}}),/児童が不明/,'名簿外IDの記録を拒否する');
  assert.throws(()=>sandbox.validateSyncPayload({...valid,data:{...valid.data,enrollments:[{id:'e2',classId:'c1',studentId:'unknown'}]}}),/児童が不明/,'名簿外IDの在籍を拒否する');
  assert.throws(()=>sandbox.validateSyncPayload({...valid,data:{...valid.data,classes:[{id:'c1',yearId:'unknown'}]}}),/年度が不明/,'年度外クラスを拒否する');
}

async function run(){
  testCsv();
  await testMigration();
  await testXlsxRoster();
  testShellAndNavigation();
  testApplicationSplit();
  testSeparateScriptEvaluation();
  await testWeeklyStateTransitions();
  await testImportValidation();
  console.log('All tests passed');
}

run().catch(error=>{console.error(error);process.exitCode=1;});
