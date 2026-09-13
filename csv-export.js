(function(){
  'use strict';

  const submissionLabels={submitted:'提出済み',forgotten:'忘れた',unsubmitted:'未提出',unconfirmed:'未確認',absent:'欠席'};
  const assessmentLabels={evaluated:'評価済み',unsubmitted:'未提出',absent:'欠席'};
  const assessmentPoints={'A':5,'B+':4,'B':3,'B-':2,'C':1};
  const dateOf=record=>record.dueDate||record.date||'';
  function inRange(date,start,end){return date&&date>=start&&date<=end;}
  function rosterInfo(roster){const byId=new Map(roster.map(row=>[row.student.id,{number:Number(row.enrollment.number)||'',name:row.student.name}]));return{byId,ordered:[...roster].sort((a,b)=>(Number(a.enrollment.number)||999)-(Number(b.enrollment.number)||999))};}
  function expectedOn(rosterRow,date){const periods=rosterRow.enrollments||[rosterRow.enrollment];return periods.some(item=>(item.startDate||'0000-01-01')<=date&&(!item.endDate||date<=item.endDate));}
  function row(className,date,kind,title,student,status,closed=''){return[className,date,kind,title,student.number,student.name,status,closed];}

  function submissionRows({classItem,roster,records,start,end}){
    const {byId,ordered}=rosterInfo(roster),rows=[];
    const daily=records.filter(item=>item.type==='dailyHomework'&&inRange(item.date,start,end)&&!item.deletedAt),dailyDates=[...new Set(daily.map(item=>item.date))].sort();
    for(const date of dailyDates){const map=new Map(daily.filter(item=>item.date===date).map(item=>[item.studentId,item]));for(const rosterRow of ordered.filter(item=>expectedOn(item,date))){const item=map.get(rosterRow.student.id),student=byId.get(rosterRow.student.id),status=submissionLabels[item?.status||'unconfirmed']||item?.status||'未確認';rows.push(row(classItem.name,date,'毎日の宿題','毎日の宿題',student,item?.resolvedAt&&item?.status==='forgotten'?`${status}（解消済み）`:status));}}
    const occurrences=records.filter(item=>item.type==='weeklyOccurrence'&&inRange(dateOf(item),start,end)&&!item.deletedAt).sort((a,b)=>dateOf(a).localeCompare(dateOf(b)));
    const weekly=records.filter(item=>item.type==='weeklySubmission'&&!item.deletedAt);
    for(const occurrence of occurrences){const date=dateOf(occurrence),map=new Map(weekly.filter(item=>item.occurrenceId===occurrence.id).map(item=>[item.studentId,item]));for(const rosterRow of ordered.filter(item=>expectedOn(item,date))){const item=map.get(rosterRow.student.id),student=byId.get(rosterRow.student.id);rows.push(row(classItem.name,date,'週宿題',occurrence.title||'週宿題',student,submissionLabels[item?.status||'unsubmitted']||item?.status||'未提出'));}}
    const items=records.filter(item=>item.type==='occasionalItem'&&inRange(dateOf(item),start,end)&&!item.deletedAt).sort((a,b)=>dateOf(a).localeCompare(dateOf(b))),occasional=records.filter(item=>item.type==='occasionalSubmission'&&!item.deletedAt);
    for(const item of items){const date=dateOf(item),map=new Map(occasional.filter(record=>record.itemId===item.id).map(record=>[record.studentId,record]));for(const rosterRow of ordered.filter(row=>expectedOn(row,date))){const record=map.get(rosterRow.student.id),student=byId.get(rosterRow.student.id);rows.push(row(classItem.name,date,'提出物',item.title||'提出物',student,submissionLabels[record?.status||'unsubmitted']||record?.status||'未提出',item.archived?'完結':'継続中'));}}
    return[['クラス','日付・提出予定日','種類','宿題・提出物名','出席番号','氏名','状態','管理状態'],...rows];
  }

  function assessmentRows({classItem,roster,records,start,end}){
    const {byId}=rosterInfo(roster),rows=records.filter(item=>item.type==='notebookAssessment'&&inRange(item.date,start,end)&&!item.deletedAt).map(item=>{const student=byId.get(item.studentId)||{number:'',name:'名簿外'},evaluated=!['absent','unsubmitted'].includes(item.status),fallback=Object.prototype.hasOwnProperty.call(assessmentPoints,item.grade)?item.grade:'B',grades=evaluated?{knowledge:item.viewpointGrades?.knowledge||fallback,thinking:item.viewpointGrades?.thinking||fallback,attitude:item.viewpointGrades?.attitude||fallback}:{knowledge:'',thinking:'',attitude:''};return[classItem.name,item.date,item.subject||'',item.unit||'',item.title||'',student.number,student.name,grades.knowledge,grades.thinking,grades.attitude,evaluated?(item.grade||fallback):'',assessmentLabels[item.status]||item.status||'',item.note||''];}).sort((a,b)=>a[1].localeCompare(b[1])||String(a[2]).localeCompare(String(b[2]),'ja')||(Number(a[5])||999)-(Number(b[5])||999));
    return[['クラス','日付','教科','単元','題名','出席番号','氏名','知識・技能','思考・判断・表現','主体的に学習に取り組む態度','3観点の総合目安','状態','メモ'],...rows];
  }

  function cell(value){let text=String(value??'');const leading=/^[\s\u0000-\u001f]*/.exec(text)?.[0]||'';const visible=text.slice(leading.length);if(/^[=+@]/.test(visible)||/^-\D/.test(visible))text=`'${text}`;return`"${text.replace(/"/g,'""')}"`;}
  function csv(rows){return'\uFEFF'+rows.map(values=>values.map(cell).join(',')).join('\r\n');}
  window.ClassCsvExport={submissionRows,assessmentRows,csv};
})();
