'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');

const root=path.resolve(__dirname,'..');
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
  const csv=ClassCsvExport.csv([['氏名','式'],['青木','=1+1']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=1+1"),'表計算ソフトの数式実行を防ぐ');
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
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const styles=fs.readFileSync(path.join(root,'styles.css'),'utf8');
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.ok(!app.includes('id="sync-placeholder">同期'),'右上の独立した同期ボタンを残さない');
  assert.ok(app.includes('data-common-settings'),'共通ヘッダーから設定案内へ移動できる');
  assert.ok(app.includes('home-button'),'ホームを共通ヘッダーで強調する');
  assert.ok(!app.includes("['roster','名簿']"),'名簿の独立タブを残さない');
  assert.ok(app.includes("state.classSettingsView='roster'"),'名簿画面へ直接移動できる');
  assert.ok(app.includes("showToast('先に名簿を登録してください')"));
  assert.ok(app.includes('data-roster-class'),'各クラスから名簿を開ける');
  assert.ok(app.includes('verifyRolloverArchive'),'年度保管ファイルを読み直す');
  assert.ok(app.includes('使い方・FAQ'),'ヘルプ画面を表示する');
  assert.ok(app.includes('faq-panel'),'FAQの折りたたみ表示を用意する');
  assert.ok(app.includes('class-tab-dot'),'クラス色を選択ボタンに表示する');
  assert.ok(app.includes('home-hint'),'件数バッジの凡例を表示する');
  assert.ok(app.includes('dashboardHtml'),'ホームの対応状況ダッシュボードを表示する');
  assert.ok(app.includes('recordSyncHistory'),'同期履歴を保存する');
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
  assert.ok(app.includes("['data','データ管理']"),'設定内にデータ管理をまとめる');
  assert.ok(app.includes('renderSettingsGuide'),'設定の説明ページを用意する');
  assert.ok(app.includes('openContextHelp'),'ページ別ヘルプを横から表示する');
  assert.ok(app.includes('help-search'),'ヘルプを検索できる');
  assert.ok(app.includes('teacherFooter'),'日常機能を下部から切り替えられる');
  assert.ok(app.includes('＋ 新しい宿題を作る'),'週宿題の登録動線を明確にする');
  assert.ok(app.includes('＋ 新しい提出物を作る'),'提出物の登録動線を明確にする');
  assert.ok(app.includes('gradeLevel'),'一般級の学年を名簿へ引き継ぐ');
  assert.ok(app.includes('復旧コードだけで年度パスワードを再設定'),'ローカルデータは復旧コードだけで開ける');
  assert.ok(app.includes('教師用PINは数字6桁で入力してください。'),'PIN桁数を日本語で案内する');
  assert.ok(!app.includes('NFPYM-8AEXB-QQS28'),'バックアップ画面の復旧コード例を表示しない');
  assert.ok(app.includes('data-shortage-subject'),'不足教科を指定して児童メモを開く');
  assert.ok(app.includes('Math.floor(a.col/2)===Math.floor(b.col/2)'),'男女ペアを1・2列、3・4列の組で判定する');
  assert.ok(app.includes('col+=2'),'男女ペア警告も2列単位で判定する');
  assert.ok(app.includes('positionPenalty'),'位置条件を優先して席を割り当てる');
  assert.ok(app.includes('groupDefs'),'席替えグループの名称と追加設定を保存する');
  assert.ok(styles.includes('.tool-icon{width:42px'),'機能アイコンをタイル表示する');
  assert.ok(!app.includes('<span></span><span></span>'),'ノート評価の空白スペーサーを残さない');
  assert.ok(styles.includes('grid-template-columns:repeat(6,minmax(0,1fr))'),'ノート評価を6分割で均等配置する');
  assert.ok(styles.includes('grid-column:3 / span 2;grid-row:2'),'Bを中央に配置する');
  assert.ok(styles.includes('.teacher-footer'),'教師用の下部ナビを表示する');
  assert.ok(styles.includes('.help-drawer'),'ページ別ヘルプをスライド表示する');
  const shellMatch=sw.match(/const SHELL=\[([^;]+)\];/s);
  assert.ok(shellMatch);
  const assets=[...shellMatch[1].matchAll(/'\.\/([^']+)'/g)].map(match=>match[1]).filter(Boolean);
  for(const asset of assets)assert.ok(fs.existsSync(path.join(root,asset)),`キャッシュ対象 ${asset} が存在する`);
  for(const script of ['db.js','migration.js','xlsx-reader.js','csv-export.js','app.js'])assert.ok(index.includes(`<script src="${script}"></script>`));
}

function testSeatingAlgorithm(){
  let source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  source=source.replace("if('serviceWorker'in navigator)","window.__seatingTest={isGenderPairSeat,generateSeating,seatingConditionWarnings};if('serviceWorker'in navigator)");
  source=source.replace('loadState().catch(','Promise.resolve().catch(');
  const documentStub={getElementById(){return null;},addEventListener(){},querySelector(){return{setAttribute(){}};},querySelectorAll(){return[];},documentElement:{dataset:{},style:{setProperty(){}}}};
  const sandbox={console,document:documentStub,navigator:{onLine:true},localStorage:global.localStorage,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,Blob,URL,setTimeout,clearTimeout};
  sandbox.window=sandbox;sandbox.window.addEventListener=()=>{};sandbox.window.matchMedia=()=>({matches:false});
  vm.runInNewContext(source,sandbox,{filename:'app.js'});
  const engine=sandbox.__seatingTest;
  assert.equal(engine.isGenderPairSeat(0,1,{cols:6}),true);
  assert.equal(engine.isGenderPairSeat(1,2,{cols:6}),false,'2列目と3列目は男女ペアにしない');
  const roster=Array.from({length:12},(_,index)=>({student:{id:`s${index+1}`,name:`児童${index+1}`},enrollment:{number:index+1,gender:index%2?'female':'male'}}));
  const conditions=Object.fromEntries(roster.map((row,index)=>[row.student.id,{vision:0,groups:[],leader:false,window:index<2,hall:index>=10,front:false,back:false,care:''}]));
  const draft={cols:6,rows:2,emptySeats:[],genderMode:'neighbor',groupDefs:[{id:'A',name:'要配慮'}],conditions,layout:[],previousLayout:[]};
  draft.layout=engine.generateSeating(draft,roster);
  assert.ok(draft.layout?.length);
  const warnings=engine.seatingConditionWarnings(draft,roster);
  assert.ok(!warnings.some(item=>/窓側|廊下側/.test(item)),`位置条件の警告: ${warnings.join(' / ')}`);
  assert.ok(!warnings.some(item=>/男女ペア配置/.test(item)),`男女ペアの警告: ${warnings.join(' / ')}`);
}

(async()=>{
  testCsv();
  await testMigration();
  await testXlsxRoster();
  testShellAndNavigation();
  testSeatingAlgorithm();
  console.log('All integration checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
