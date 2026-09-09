(function(){
  'use strict';

  const CC_KEYS=['cc_names_v1','cc_hw_v3','cc_hw_flw_v1','cc_wh_v1','cc_wh_types_v1','cc_sh_v1','cc_mm_v1','cc_sb_v1','cc_ckpts_v1','cc_seat_layout_v1'];
  const SHOKEN_KEYS=['shoken_students_v2','shoken_records_v2'];
  const clean=value=>String(value??'').trim();
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(clean(value));
  function hash(value){let h=2166136261;for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
  function id(kind,...parts){return`legacy_${kind}_${hash(parts.map(value=>JSON.stringify(value)).join('|'))}`;}
  function sourceId(label,kind,suffix=''){return`source_${hash(`${label}|${kind}|${suffix}`)}`;}
  function countObject(value){return value&&typeof value==='object'?Object.keys(value).length:0;}

  function storageSnapshot(){
    const data={},keys=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!(CC_KEYS.includes(key)||SHOKEN_KEYS.includes(key)||key==='seatV5'||/^mc_(meta|ckpts|sb_.+|names_.+)_v1$/.test(key)))continue;
      try{data[key]=JSON.parse(localStorage.getItem(key));keys.push(key);}catch{}
    }
    return{data,keys};
  }

  function classCheckerSource(data,label,cleanupKeys=[]){
    if(!CC_KEYS.some(key=>data[key]!==undefined))return null;
    const names=data.cc_names_v1||{};
    return{id:sourceId(label,'classChecker'),kind:'classChecker',label:`${label}・クラスチェッカー`,raw:data,cleanupKeys:cleanupKeys.filter(key=>CC_KEYS.includes(key)),studentCount:countObject(names),recordCount:[data.cc_hw_v3,data.cc_wh_v1,data.cc_sh_v1,data.cc_mm_v1,data.cc_sb_v1].reduce((sum,value)=>sum+countObject(value),0)};
  }

  function multiSources(data,label,cleanupKeys=[]){
    const meta=data.mc_meta_v1||{};
    const inferred=Object.keys(data).map(key=>key.match(/^mc_(?:names|sb)_(.+)_v1$/)?.[1]).filter(Boolean);
    const ids=[...new Set([...(meta.classIds||[]),...inferred])];
    return ids.filter(classId=>data[`mc_names_${classId}_v1`]!==undefined||data[`mc_sb_${classId}_v1`]!==undefined).map(classId=>{
      const names=data[`mc_names_${classId}_v1`]||{},records=data[`mc_sb_${classId}_v1`]||{};
      return{id:sourceId(label,'multi',classId),kind:'multi',legacyClassId:classId,label:`${label}・${meta.classNames?.[classId]||`${classId}クラス`}`,raw:{names,records,viewpoints:data.mc_ckpts_v1||{}},cleanupKeys:cleanupKeys.filter(key=>key===`mc_names_${classId}_v1`||key===`mc_sb_${classId}_v1`||key==='mc_meta_v1'||key==='mc_ckpts_v1'),studentCount:countObject(names),recordCount:countObject(records)};
    });
  }

  function seatingSource(raw,label,cleanupKeys=[]){
    if(!raw||!Array.isArray(raw.students)||(!raw.cols&&!raw.rows))return null;
    return{id:sourceId(label,'seating',raw.className||''),kind:'seating',label:`${label}・席替え${raw.className?`（${raw.className}）`:''}`,raw,cleanupKeys:cleanupKeys.filter(key=>key==='seatV5'),studentCount:raw.students.filter(item=>clean(item.name)).length,recordCount:(raw.history||[]).length+(raw.currentLayout?.some(Boolean)?1:0)};
  }

  function behaviorSource(students,records,label,cleanupKeys=[]){
    if(!Array.isArray(students)&&!Array.isArray(records))return null;
    const list=Array.isArray(records)?records:[];
    return{id:sourceId(label,'behavior'),kind:'behavior',label:`${label}・行動記録`,raw:{students:Array.isArray(students)?students:[],records:list},cleanupKeys:cleanupKeys.filter(key=>SHOKEN_KEYS.includes(key)),studentCount:Array.isArray(students)?students.length:new Set(list.map(item=>item.studentName)).size,recordCount:list.length};
  }

  function discover(data,label='旧バックアップ',cleanupKeys=[]){
    const sources=[];
    const cc=classCheckerSource(data,label,cleanupKeys);if(cc)sources.push(cc);
    sources.push(...multiSources(data,label,cleanupKeys));
    const seat=seatingSource(data.seatV5,label,cleanupKeys);if(seat)sources.push(seat);
    const behavior=behaviorSource(data.shoken_students_v2,data.shoken_records_v2,label,cleanupKeys);if(behavior)sources.push(behavior);
    return sources;
  }

  function parseCsv(text,label){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const char=text[i];
      if(char==='"'&&quoted&&text[i+1]==='"'){cell+='"';i++;}
      else if(char==='"')quoted=!quoted;
      else if(char===','&&!quoted){row.push(cell);cell='';}
      else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(value=>clean(value)))rows.push(row);row=[];cell='';}
      else cell+=char;
    }
    row.push(cell);if(row.some(value=>clean(value)))rows.push(row);
    if(!rows.length)return[];
    const header=rows.shift().map(clean),studentIndex=header.indexOf('studentName'),dateIndex=header.indexOf('date'),subjectIndex=header.indexOf('subject'),noteIndex=header.indexOf('note');
    if(studentIndex<0||dateIndex<0||noteIndex<0)return[];
    const records=rows.map((values,index)=>({id:values[header.indexOf('id')]||index,date:values[dateIndex],studentName:values[studentIndex],subject:subjectIndex>=0?values[subjectIndex]:'',note:values.slice(noteIndex).join(',')}));
    return[behaviorSource([],records,label,[])].filter(Boolean);
  }

  async function fromFiles(files){
    const sources=[];
    for(const file of files){
      if(Number(file.size)>25*1024*1024)throw new Error(`${file.name||'旧データ'}が大きすぎます。25MB以下のファイルを選んでください。`);
      const text=await file.text();
      if(text.length>25*1024*1024)throw new Error(`${file.name||'旧データ'}の読み込み量が大きすぎます。25MB以下のファイルを選んでください。`);
      if(/\.csv$/i.test(file.name)){sources.push(...parseCsv(text,file.name));continue;}
      let payload;try{payload=JSON.parse(text);}catch{continue;}
      const data=payload?.data&&typeof payload.data==='object'?payload.data:payload;
      const discovered=discover(data,file.name,[]);sources.push(...discovered);
      if(!discovered.length){const seat=seatingSource(payload,file.name,[]);if(seat)sources.push(seat);const behavior=behaviorSource(payload.students,payload.records,file.name,[]);if(behavior)sources.push(behavior);}
    }
    return sources;
  }

  function fromStorage(){const snapshot=storageSnapshot();return discover(snapshot.data,'この端末',snapshot.keys);}

  function roster(source){
    if(source.kind==='classChecker'||source.kind==='multi'){
      const names=source.kind==='classChecker'?source.raw.cc_names_v1:source.raw.names;
      return Object.entries(names||{}).filter(([,name])=>clean(name)).map(([number,name])=>({number:Number(number)||null,name:clean(name),grade:'',gender:''}));
    }
    if(source.kind==='seating')return(source.raw.students||[]).filter(item=>clean(item.name)).map((item,index)=>({number:Number(item.num||item.number)||index+1,name:clean(item.name),grade:clean(item.grade),gender:item.gender==='女'?'female':item.gender==='男'?'male':clean(item.gender)}));
    const names=new Set();
    for(const item of source.raw.students||[])names.add(clean(typeof item==='string'?item:item.name||item.studentName));
    for(const item of source.raw.records||[])names.add(clean(item.studentName||item.name));
    return[...names].filter(Boolean).map((name,index)=>({number:index+1,name,grade:'',gender:''}));
  }

  function splitNotebookName(value){
    const text=clean(value),match=text.match(/^(国語|算数|理科|社会|生活|音楽|図画工作|図工|家庭科|家庭|体育|外国語|英語|道徳|総合|自立活動|その他)[ 　]*(.*)$/);
    if(!match)return{subject:'その他',title:text};
    const normalized={図工:'図画工作',家庭科:'家庭',英語:'外国語'}[match[1]]||match[1];
    return{subject:normalized,title:clean(match[2])||text};
  }

  function records(source,resolve,classId){
    const out=[];const add=record=>out.push({...record,classId,legacySource:source.label,legacyImported:true});
    const student=(number,name)=>resolve({number:Number(number)||null,name:clean(name)});
    const addNotebook=(date,session,grades)=>{
      const info=splitNotebookName(session.name),sessionKey=id('session',source.id,date,session.id||session.name,session.kan||'');
      for(const [number,value] of Object.entries(grades||{})){
        if(value===''||value===null||value===undefined)continue;const studentId=student(number);if(!studentId)continue;
        if(session.type==='score'){
          if(value!=='abs')add({id:id('scoreMemo',source.id,date,session.id||session.name,number,value),type:'memo',studentId,date,subject:info.subject,tags:[],text:`${info.title||'評価'}：${value}点`});
          continue;
        }
        const gradeMap={Bp:'B+',Bm:'B-'};const isAbsent=value==='abs',isMissing=value==='none';
        add({id:id('notebook',source.id,date,session.id||session.name,number,value),type:'notebookAssessment',studentId,date,subject:info.subject,unit:clean(session.kan),title:info.title||date.slice(5).replace('-','/'),sessionKey,grade:isAbsent||isMissing?null:(gradeMap[value]||value),status:isAbsent?'absent':isMissing?'unsubmitted':'evaluated'});
      }
    };
    if(source.kind==='classChecker'){
      const raw=source.raw,names=raw.cc_names_v1||{},nameFor=number=>names[number]||names[String(number)]||'';
      for(const [date,day] of Object.entries(raw.cc_hw_v3||{}))if(validDate(date))for(const [number,value] of Object.entries(day||{})){const studentId=student(number,nameFor(number));if(!studentId||!value)continue;const follow=raw.cc_hw_flw_v1?.[number];add({id:id('daily',source.id,date,number),type:'dailyHomework',studentId,date,status:value===1?'submitted':value===2?'absent':'forgotten',resolvedAt:follow?.resolved?follow.date||date:null});}
      const types=new Map((raw.cc_wh_types_v1||[]).map(item=>[String(item.id),item.name]));
      for(const [date,day] of Object.entries(raw.cc_wh_v1||{}))if(validDate(date))for(const [typeId,states] of Object.entries(day||{})){const title=types.get(String(typeId))||'週宿題',occurrenceId=id('weeklyOccurrence',source.id,date,typeId);add({id:occurrenceId,type:'weeklyOccurrence',studentId:null,date,dueDate:date,title});for(const [number,value] of Object.entries(states||{})){const studentId=student(number,nameFor(number));if(!studentId||!value)continue;add({id:id('weekly',source.id,date,typeId,number),type:'weeklySubmission',studentId,date,dueDate:date,title,occurrenceId,status:value===1?'submitted':value===2?'forgotten':'unsubmitted'});}}
      for(const [date,day] of Object.entries(raw.cc_sh_v1||{}))if(validDate(date))for(const number of day?.given||[]){const studentId=student(number,nameFor(number));if(studentId)add({id:id('certificate',source.id,date,number),type:'certificate',studentId,date,tags:[],text:''});}
      for(const [date,day] of Object.entries(raw.cc_mm_v1||{}))if(validDate(date))for(const [number,text] of Object.entries(day||{})){const studentId=student(number,nameFor(number));if(studentId&&clean(text))add({id:id('memo',source.id,date,number,text),type:'memo',studentId,date,subject:'',tags:[],text:clean(text)});}
      for(const [date,day] of Object.entries(raw.cc_sb_v1||{}))if(validDate(date))for(const session of day?.sessions||[])addNotebook(date,session,session.type==='score'?session.scores:session.grades);
    }
    if(source.kind==='multi')for(const [date,day] of Object.entries(source.raw.records||{}))if(validDate(date))for(const session of day?.sessions||[])addNotebook(date,session,session.type==='score'?session.scores:session.grades);
    if(source.kind==='seating'){
      const layouts=[...(source.raw.history||[])];if(source.raw.currentLayout?.some(Boolean))layouts.unshift({date:source.raw.exportedAt||new Date().toISOString(),label:'移行時の座席',layout:source.raw.currentLayout,cols:source.raw.cols,rows:source.raw.rows});
      layouts.forEach((plan,index)=>{const date=validDate(clean(plan.date).slice(0,10))?clean(plan.date).slice(0,10):new Date().toISOString().slice(0,10);add({id:id('seatingPlan',source.id,index,plan.date||'',plan.label||''),type:'seatingPlan',studentId:null,date,label:clean(plan.label)||'旧ツールの席替え',cols:Number(plan.cols||source.raw.cols)||6,rows:Number(plan.rows||source.raw.rows)||6,emptySeats:[...(source.raw.emptySeats||[])],layout:(plan.layout||[]).map(number=>number>0?student(number):null)});});
    }
    if(source.kind==='behavior')for(const [index,item] of(source.raw.records||[]).entries()){const date=validDate(item.date)?item.date:new Date().toISOString().slice(0,10),studentId=student(null,item.studentName||item.name);if(!studentId)continue;add({id:id('behavior',source.id,item.id||index,date,item.studentName,item.note),type:'supportRecord',studentId,date,subject:clean(item.subject),unit:'',categories:[],tags:{},text:clean(item.note)});}
    return out;
  }

  function classPatch(source,resolve){
    if(source.kind==='classChecker'){
      const layout=source.raw.cc_seat_layout_v1;if(!layout?.seats?.length)return null;
      return{activeSeatCols:Number(layout.cols)||6,activeSeatRows:Number(layout.rows)||Math.ceil(layout.seats.length/(Number(layout.cols)||6)),activeSeatLayout:layout.seats.map(seat=>seat?.empty?null:resolve({number:Number(seat?.num)||null}))};
    }
    if(source.kind==='seating'){
      const students=source.raw.students||[];
      const conditions={};students.filter(item=>clean(item.name)).forEach(item=>{const studentId=resolve({number:Number(item.num)||null,name:item.name});if(studentId)conditions[studentId]={vision:Number(item.vision)||0,groups:[...(item.groups||[])],leader:Boolean(item.isLeader),window:Boolean(item.posWin),hall:Boolean(item.posHall),front:Boolean(item.posFront),back:Boolean(item.posBack),care:clean(item.care)};});
      return{activeSeatCols:Number(source.raw.cols)||6,activeSeatRows:Number(source.raw.rows)||6,activeSeatLayout:(source.raw.currentLayout||[]).map(number=>number>0?resolve({number}):null),__seatingSettings:{cols:Number(source.raw.cols)||6,rows:Number(source.raw.rows)||6,emptySeats:[...(source.raw.emptySeats||[])],genderMode:source.raw.genderMode||'checker',conditions}};
    }
    return null;
  }

  window.LegacyMigration={fromStorage,fromFiles,roster,records,classPatch};
})();
