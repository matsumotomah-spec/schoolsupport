/* v126+ 成績集計の回帰テスト。ブラウザを使わず、集計関数の境界条件を検証する。 */
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','app-grades.js'),'utf8');
const context={
  console,
  state:{testGradeThresholds:null},
  notebookAverageLabel:value=>String(value),
  NOTEBOOK_VIEWPOINTS:[{key:'knowledge'},{key:'thinking'},{key:'attitude'}],
  Number,
  String,
  Math,
  Date,
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'app-grades.js'});
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const paper=(id,total,scores)=>({id,type:'testScore',sourceKind:'paper',sourceTestId:id,total,maxTotal:100,scores});
const score=(point,max=100,viewpoint='knowledge')=>({point,max,viewpoint,label:viewpoint});

const zeroPaper=paper('zero',[].length?0:0,[score(0)]);
const mixed=[paper('mixed',0,[score(0)]),paper('mixed',80,[score(80)])];
assert(context.isUnconductedPaperTest([zeroPaper]),'全員0点の紙テストを未実施として判定できる');
assert(!context.isUnconductedPaperTest(mixed),'0点を含む実施済みテストを未実施にしない');
assert(!context.isUnconductedPaperTest([paper('blank',0,[])]),'得点内訳のない記録を未実施判定しない');
const ids=context.unconductedPaperTestIds([zeroPaper,...mixed]);
assert(ids.has('zero'),'全員0点のテストIDを集計外にできる');
assert(!ids.has('mixed'),'混在テストIDを集計対象に残す');

const workbook=context.testWorkbookSheets([{name:'国語',rows:[['','','小テスト'],['','', '知識・技能'],['番号','氏名','10'],['1','田中','0'],['2','佐藤','']]}]);
assert(workbook[0].students.length===2,'名簿行を読み取る');
const zeroCell=workbook[0].rows[3][2],blankCell=workbook[0].rows[4][2];
assert(vm.runInContext('numberValue("0")',context)===0,'Excel上の0点を空欄と区別する');
assert(vm.runInContext('numberValue("")',context)===null,'Excel上の空欄を未実施として扱う');

const summary=context.testStudentSummary([paper('scores',0,[score(0),score(0,100,'thinking')]),paper('scores',50,[score(50),score(50,100,'thinking')])]);
assert(summary.count===2,'0点をテスト回数に含める');
assert(summary.percentage===25,'0点を含む平均得点率を正しく計算する');
assert(summary.viewpoints.knowledge.percentage===25,'知識・技能を分けて集計する');
assert(summary.viewpoints.thinking.percentage===25,'思考・判断・表現を分けて集計する');
console.log('GRADEBOOK_REGRESSION_OK');
