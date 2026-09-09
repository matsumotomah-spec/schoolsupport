'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
const applicationFiles=['app-core.js','app-shell.js','app-settings.js','app-records.js','app-seating.js','app-reports.js','app-data.js','app.js'];
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
    {id:'a1',type:'notebookAssessment',studentId:'s1',date:'2026-09-06',subject:'国語',unit:'物語',title:'9/6',grade:'B+',status:'evaluated'}
  ];
  const args={classItem:{name:'5年2組'},roster,records,start:'2026-09-01',end:'2026-09-30'};
  const submissions=ClassCsvExport.submissionRows(args);
  assert.equal(submissions.length,7,'3種類×2人を出力する');
  assert.deepEqual(submissions[1].slice(4,7),[1,'青木','提出済み']);
  assert.equal(submissions[2][6],'未確認');
  assert.equal(submissions[3][6],'未提出');
  assert.equal(submissions[4][6],'忘れた');
  const assessments=ClassCsvExport.assessmentRows(args);
  assert.equal(assessments[1][7],'B+');
  const csv=ClassCsvExport.csv([['氏名','式'],['青木','=1+1'],['上田',' =1+1']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=1+1"),'表計算ソフトの数式実行を防ぐ');
  assert.ok(csv.includes("' =1+1"),'先頭空白を含む数式も実行されない');
  const transferRoster=[...roster,{student:{id:'s3',name:'転入児童'},enrollment:{number:3,startDate:'2026-09-07'},enrollments:[{number:3,startDate:'2026-09-07'}]}];
  const transferRows=ClassCsvExport.submissionRows({...args,roster:transferRoster});
  assert.ok(!transferRows.some(row=>row[1]==='2026-09-06'&&row[5]==='転入児童'),'転入前の提出物を未提出として出力しない');
}

function testMigration(){
  const file={name:'旧データ.json',text:async()=>JSON.stringify({cc_names_v1:{1:'青木',2:'上田'},cc_hw_v3:{'2026-09-06':{1:1,2:3}}})};
  return LegacyMigration.fromFiles([file]).then(sources=>{
    assert.equal(sources.length,1);
    assert.equal(LegacyMigration.roster(sources[0]).length,2);
    const ids={青木:'s1',上田:'s2'};
    const records=LegacyMigration.records(sources[0],({name,number})=>ids[name]||({1:'s1',2:'s2'}[number]),'c1');
    assert.equal(records.length,2);
    assert.equal(records.find(item=>item.studentId==='s1').status,'submitted');
    assert.equal(records.find(item=>item.studentId==='s2').status,'forgotten');
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
  const styles=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const db=fs.readFileSync(path.join(root,'db.js'),'utf8');
  assert.ok(!app.includes('id="sync-placeholder">同期'),'右上の独立した同期ボタンを残さない');
  assert.ok(app.includes('data-common-settings'),'共通ヘッダーから設定案内へ移動できる');
  assert.ok(app.includes('home-button'),'ホームを共通ヘッダーで強調する');
  assert.ok(app.includes('data-current-class'),'共通ヘッダーから現在のクラスを確認・切替できる');
  assert.ok(app.includes('<small>操作中</small>'),'現在操作中のクラスを明示する');
  assert.ok(app.includes('mode-chip'),'教師用・児童用モードを常時表示する');
  assert.ok(!app.includes('data-focus-toggle'),'意味が伝わりにくい集中表示ボタンをヘッダーに残さない');
  assert.ok(app.includes('appearance-show-explanations'),'説明文の表示・非表示を設定で選べる');
  assert.ok(!app.includes("['roster','名簿']"),'名簿の独立タブを残さない');
  assert.ok(app.includes("state.classSettingsView='roster'"),'名簿画面へ直接移動できる');
  assert.ok(app.includes("showToast('先に名簿を登録してください')"));
  assert.ok(app.includes('data-roster-class'),'各クラスから名簿を開ける');
  assert.ok(app.includes('＋ 転入児童を追加'),'転入児童を日付付きで追加できる');
  assert.ok(app.includes('data-transfer-row'),'転出操作を入力行の取消と分ける');
  assert.ok(app.includes('data-reactivate-enrollment'),'転出済み児童を在籍へ戻せる');
  assert.ok(app.includes("item.startDate||state.year.startDate)<=atDate"),'過去日は当時の在籍期間で児童を抽出する');
  assert.ok(!app.includes('id="class-type"'),'クラス種別の二重入力を残さない');
  assert.ok(app.includes('verifyRolloverArchive'),'年度保管ファイルを読み直す');
  assert.ok(app.includes('使い方・FAQ'),'ヘルプ画面を表示する');
  assert.ok(app.includes('faq-panel'),'FAQの折りたたみ表示を用意する');
  assert.ok(app.includes('class-tab-dot'),'クラス色を選択ボタンに表示する');
  assert.ok(app.includes('home-hint'),'件数バッジの凡例を表示する');
  assert.ok(app.includes('dashboardHtml'),'ホームの対応状況ダッシュボードを表示する');
  assert.ok(app.includes('recordSyncHistory'),'同期履歴を保存する');
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
  assert.ok(app.includes("['data','保存・端末間共有']"),'設定内に保存・端末間共有をまとめる');
  assert.ok(app.includes('renderSettingsGuide'),'設定の説明ページを用意する');
  assert.ok(app.includes('まず使う')&&app.includes('ときどき使う')&&app.includes('年度始め・端末を替えたとき'),'設定を利用頻度で3群に整理する');
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
  assert.ok(app.includes('state.showMonthlyForgotten?'),'児童用一覧で設定に応じて忘れ回数を表示する');
  assert.ok(!app.includes('宿題名人'),'旧称号を画面に残さない');
  assert.ok(app.includes('openDailyWeekDialog'),'今週の忘れ物を日付別に確認する');
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
  assert.ok(app.includes("['classes','クラス・名簿']"),'設定名称をクラス・名簿へ整理する');
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
  assert.ok(styles.includes('.reward-icon-choices'),'達成アイコンを選択しやすく表示する');
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
  assert.ok(styles.includes('.seat-aisle'),'印刷用通路を表示する');
  const shellMatch=sw.match(/const SHELL=\[([^;]+)\];/s);
  assert.ok(shellMatch);
  const assets=[...shellMatch[1].matchAll(/'\.\/([^']+)'/g)].map(match=>match[1].split('?')[0]).filter(Boolean);
  for(const asset of assets)assert.ok(fs.existsSync(path.join(root,asset)),`キャッシュ対象 ${asset} が存在する`);
  for(const script of ['db.js','migration.js','xlsx-reader.js','csv-export.js',...applicationFiles])assert.ok(index.includes(`<script src="${script}?v=38"></script>`));
  assert.ok(index.includes('styles.css?v=38'),'CSSに公開版番号を付ける');
  assert.ok(app.includes("register('./sw.js?v=38'"),'Service Workerの公開版番号を付ける');
  assert.ok(app.includes('dateInEnrollment(item.dueDate,currentEnrollment)'),'転入前・転出後の提出予定を未提出扱いにしない');
  assert.ok(app.includes('previousEnrollmentId'),'再在籍は過去の在籍期間を上書きしない');
  assert.ok(app.includes('data-ended-student'),'転出済み児童の過去記録を開ける');
  assert.ok(app.includes('offerSeatForTransfer'),'転入児童を現在の座席へ配置できる');
  assert.ok(app.includes('showUndoToast'),'記録変更を短時間取り消せる');
  assert.ok(app.includes('data-trash-restore'),'30日間のごみ箱から記録を復元できる');
  assert.ok(app.includes("APP_VERSION='38'"),'データ管理に公開版を表示する');
  assert.ok(app.includes('class-support-shell-v${APP_VERSION}'),'更新確認で現在版のキャッシュを保持する');
  assert.ok(!app.includes('class-support-shell-v34'),'更新確認で旧版キャッシュ名を固定しない');
  assert.ok(styles.includes('@keyframes status-confirm'),'提出操作に短い確認アニメーションを表示する');
  assert.ok(app.includes('seat-run no-print'),'席替え作成操作を印刷画面から除外する');
  assert.ok(styles.includes('.seat-run,.seat-history,.no-print'),'印刷時に操作パネルを除外する');
  assert.ok(styles.includes('.teacher-footer,.seat-controls'),'印刷時に教師用フッターを除外する');
  assert.ok(app.includes("printSection('printing-seat-plan')"),'席替え印刷を座席表だけに絞る');
  assert.ok(styles.includes('body.printing-seat-plan .page> :not(.seat-print)'),'席替え印刷では座席表以外を除外する');
  assert.ok(styles.includes('--aisle-track:minmax(26px,.5fr)'),'席替え印刷の通路を名前欄の半分幅にする');
  assert.ok(app.includes('data-print-teacher-seats'),'教師画面の現在座席配置を印刷できる');
  assert.ok(app.includes('activeSeatAisleAfterColumns'),'教師画面にも通路位置を反映する');
  assert.ok(styles.includes('body.printing-teacher-seats .page> :not(.teacher-seat-print-target)'),'教師用座席印刷では対象の座席表だけを印刷する');
  assert.ok(app.includes('廊下側から${hallColumn}・${hallColumn+1}列の間'),'通路位置を廊下側から数える');
}

function testApplicationSplit(){
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const positions=applicationFiles.map(file=>index.indexOf(`<script src="${file}?v=38"></script>`));
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
  assert.equal(vm.runInContext('APP_VERSION',context),'38');
  assert.equal(vm.runInContext('typeof renderHome',context),'function');
  assert.equal(vm.runInContext('typeof renderSettings',context),'function');
  assert.equal(vm.runInContext('typeof renderSeating',context),'function');
  assert.equal(vm.runInContext('typeof applySyncPlan',context),'function');
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
  assert.throws(()=>sandbox.validateSyncPayload({...valid,data:{...valid.data,enrollments:[{id:'e2',classId:'missing',studentId:'s1'}]}}),/所属クラスが不明/,'存在しないクラスへの在籍を拒否する');
  await assert.rejects(()=>sandbox.readImportText({size:26*1024*1024,text:async()=>''},'テストファイル'),/25MB以下/,'大きすぎるファイルを拒否する');
}

function testSeatingAlgorithm(){
  let source=applicationSource();
  source=source.replace("if('serviceWorker'in navigator)","window.__seatingTest={isGenderPairSeat,generateSeating,seatingConditionWarnings,seatGridTemplate,parseSeatCare,defaultSeatAisles};if('serviceWorker'in navigator)");
  source=source.replace('loadState().catch(','Promise.resolve().catch(');
  const documentStub={getElementById(){return null;},addEventListener(){},querySelector(){return{setAttribute(){}};},querySelectorAll(){return[];},documentElement:{dataset:{},style:{setProperty(){}}}};
  const sandbox={console,document:documentStub,navigator:{onLine:true},localStorage:global.localStorage,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,Blob,URL,setTimeout,clearTimeout};
  sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.matchMedia=()=>({matches:false});
  vm.runInNewContext(source,sandbox,{filename:'app.js'});
  const engine=sandbox.__seatingTest;
  assert.equal(engine.isGenderPairSeat(0,1,{cols:6}),true);
  assert.equal(engine.isGenderPairSeat(1,2,{cols:6}),false,'2列目と3列目は男女ペアにしない');
  assert.equal(engine.isGenderPairSeat(6,7,{cols:8}),true,'8列でも7・8列を男女ペアとして扱う');
  const wideDraft={cols:8,rows:5,aisleAfterColumns:[2,5]};
  assert.equal(engine.seatGridTemplate(wideDraft).split(' ').filter(item=>item.startsWith('minmax')).length,8,'8列分の座席トラックを作る');
  assert.equal((engine.seatGridTemplate(wideDraft).match(/--aisle-track/g)||[]).length,2,'指定した2か所に通路を作る');
  assert.deepEqual(Array.from(engine.defaultSeatAisles(8)),[2,4,6],'初期通路を2列ごとに作る');
  assert.deepEqual(Array.from(engine.defaultSeatAisles(5)),[1,3],'奇数列でも廊下側から2列ごとに通路を作る');
  const care=engine.parseSeatCare('3番と離す、5番の近く、7番とペア');
  assert.deepEqual(Array.from(care.separate),[3]);assert.deepEqual(Array.from(care.near),[5]);assert.deepEqual(Array.from(care.pair),[7]);
  const roster=Array.from({length:12},(_,index)=>({student:{id:`s${index+1}`,name:`児童${index+1}`},enrollment:{number:index+1,gender:index%2?'female':'male'}}));
  const conditions=Object.fromEntries(roster.map((row,index)=>[row.student.id,{vision:0,groups:[],leader:false,window:index<2,hall:index>=10,front:false,back:false,care:''}]));
  const draft={cols:6,rows:2,emptySeats:[],genderMode:'neighbor',groupDefs:[{id:'A',name:'要配慮'}],conditions,layout:[],previousLayout:[]};
  draft.layout=engine.generateSeating(draft,roster);
  assert.ok(draft.layout?.length);
  const warnings=engine.seatingConditionWarnings(draft,roster);
  assert.ok(!warnings.some(item=>/窓側|廊下側/.test(item)),`位置条件の警告: ${warnings.join(' / ')}`);
  assert.ok(!warnings.some(item=>/男女ペア配置/.test(item)),`男女ペアの警告: ${warnings.join(' / ')}`);
  const roster36=Array.from({length:36},(_,index)=>({student:{id:`large${index+1}`,name:`児童${index+1}`},enrollment:{number:index+1,gender:index%2?'female':'male'}}));
  const largeDraft={cols:8,rows:5,emptySeats:[7,15,31,39],aisleAfterColumns:[2,4,6],genderMode:'none',groupDefs:[],conditions:Object.fromEntries(roster36.map(row=>[row.student.id,{vision:0,groups:[],leader:false,window:false,hall:false,front:false,back:false,care:''}])),layout:[],previousLayout:[]};
  largeDraft.layout=engine.generateSeating(largeDraft,roster36);
  assert.equal(largeDraft.layout.length,40,'8列×5行の座席数を保つ');
  assert.equal(largeDraft.layout.filter(Boolean).length,36,'36人を空席4席へ重複なく配置する');
  assert.equal(new Set(largeDraft.layout.filter(Boolean)).size,36,'同じ児童を複数座席へ配置しない');
  for(const index of largeDraft.emptySeats)assert.equal(largeDraft.layout[index],null,'指定した空席を維持する');
}

(async()=>{
  testCsv();
  await testMigration();
  await testXlsxRoster();
  testShellAndNavigation();
  testApplicationSplit();
  testSeparateScriptEvaluation();
  await testImportValidation();
  testSeatingAlgorithm();
  console.log('All integration checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
