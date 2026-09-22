(function(){
  'use strict';

  const DB_NAME='class-support-v1';
  const DB_VERSION=1;
  const STORES=['meta','years','classes','students','enrollments','records','trash'];
  const YEAR_SYNC_META_KEYS=new Set(['testGradeThresholds','pupilOverviewVisibility','pupilKanaMode','showMonthlyForgotten','weeklySkippedWeeks','memoTags','certificateTags','supportTags','reportPromptTemplate','homeworkMedalLimit']);

  function requestResult(request){
    return new Promise((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  function transactionDone(transaction){
    return new Promise((resolve,reject)=>{
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error||new Error('保存処理が中断されました'));
    });
  }

  function open(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const db=request.result;
        const meta=db.createObjectStore('meta',{keyPath:'key'});
        meta.createIndex('updatedAt','updatedAt');

        const years=db.createObjectStore('years',{keyPath:'id'});
        years.createIndex('label','label',{unique:true});

        const classes=db.createObjectStore('classes',{keyPath:'id'});
        classes.createIndex('yearId','yearId');
        classes.createIndex('yearOrder',['yearId','order']);

        db.createObjectStore('students',{keyPath:'id'});

        const enrollments=db.createObjectStore('enrollments',{keyPath:'id'});
        enrollments.createIndex('classId','classId');
        enrollments.createIndex('studentId','studentId');
        enrollments.createIndex('classNumber',['classId','number']);

        const records=db.createObjectStore('records',{keyPath:'id'});
        records.createIndex('classId','classId');
        records.createIndex('studentId','studentId');
        records.createIndex('typeDate',['type','date']);

        const trash=db.createObjectStore('trash',{keyPath:'id'});
        trash.createIndex('purgeAfter','purgeAfter');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }

  async function withStore(storeName,mode,operation){
    const db=await open();
    let tx;
    try{
      tx=db.transaction(storeName,mode);
      const done=mode==='readwrite'?transactionDone(tx):null;
      const store=tx.objectStore(storeName);
      const result=await operation(store,tx);
      if(done)await done;
      return result;
    }catch(error){
      if(mode==='readwrite'&&tx)try{tx.abort();}catch{}
      throw error;
    }finally{
      db.close();
    }
  }

  function uid(prefix){
    const value=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${value}`;
  }

  function now(){return new Date().toISOString();}

  function deviceId(){
    const key='class-support-device-id';
    let value=localStorage.getItem(key);
    if(!value){value=uid('device');localStorage.setItem(key,value);}
    return value;
  }

  function stamp(item,isNew){
    const timestamp=now();
    return {...item,createdAt:isNew?(item.createdAt||timestamp):item.createdAt,updatedAt:timestamp,deviceId:deviceId()};
  }

  async function get(storeName,key){
    return withStore(storeName,'readonly',store=>requestResult(store.get(key)));
  }

  async function getAll(storeName){
    return withStore(storeName,'readonly',store=>requestResult(store.getAll()));
  }

  async function getAllByIndex(storeName,indexName,value){
    return withStore(storeName,'readonly',store=>requestResult(store.index(indexName).getAll(value)));
  }

  async function put(storeName,item){
    const current=item.id?await get(storeName,item.id):null;
    const prepared=stamp(item,!current);
    await withStore(storeName,'readwrite',store=>requestResult(store.put(prepared)));
    return prepared;
  }

  async function putMany(storeName,items){
    const prepared=items.map(item=>stamp(item,!item.createdAt));
    await withStore(storeName,'readwrite',async store=>{
      prepared.forEach(item=>store.put(item));
    });
    return prepared;
  }

  async function putRaw(storeName,item){
    await withStore(storeName,'readwrite',store=>requestResult(store.put(item)));
    return item;
  }

  async function putManyRaw(storeName,items){
    await withStore(storeName,'readwrite',async store=>{items.forEach(item=>store.put(item));});
    return items;
  }

  async function remove(storeName,key){
    return withStore(storeName,'readwrite',store=>requestResult(store.delete(key)));
  }

  async function getMeta(key,fallback=null){
    const row=await get('meta',key);
    return row?row.value:fallback;
  }

  async function setMeta(key,value){
    const timestamp=now();
    await withStore('meta','readwrite',store=>requestResult(store.put({key,value,updatedAt:timestamp,deviceId:deviceId()})));
    return value;
  }

  async function resetAll(){
    await applyBatch({clear:STORES});
  }

  async function applyBatch({clear=[],puts={},deletes={}}={}){
    const names=[...new Set([...clear,...Object.keys(puts),...Object.keys(deletes)])];
    if(!names.length)return;
    for(const name of names)if(!STORES.includes(name))throw new Error(`保存先「${name}」は利用できません`);
    const db=await open();
    let tx;
    try{
      tx=db.transaction(names,'readwrite');
      const done=transactionDone(tx);
      for(const name of clear)tx.objectStore(name).clear();
      for(const [name,items] of Object.entries(puts))for(const item of items||[])tx.objectStore(name).put(item);
      for(const [name,keys] of Object.entries(deletes))for(const key of keys||[])tx.objectStore(name).delete(key);
      await done;
    }catch(error){
      if(tx)try{tx.abort();}catch{}
      throw error;
    }finally{
      db.close();
    }
  }

  async function replaceAllRaw(data={}){
    const puts=Object.fromEntries(STORES.map(name=>[name,Array.isArray(data[name])?data[name]:[]]));
    await applyBatch({clear:STORES,puts});
  }

  async function replaceYearRaw(data={},yearId){
    if(!yearId)throw new Error('復元対象の年度を指定してください');
    const classes=await getAllByIndex('classes','yearId',yearId),classIds=new Set(classes.map(item=>item.id));
    const allEnrollments=await getAll('enrollments'),enrollments=allEnrollments.filter(item=>classIds.has(item.classId)),studentIds=new Set(enrollments.map(item=>item.studentId));
    const records=(await getAll('records')).filter(item=>classIds.has(item.classId)),trash=(await getAll('trash')).filter(item=>classIds.has(item.record?.classId)||(item.kind==='classBundle'&&item.classBundle?.class?.yearId===yearId));
    const remainingEnrollmentStudents=new Set(allEnrollments.filter(item=>!classIds.has(item.classId)).map(item=>item.studentId));
    // Students can be enrolled in more than one year.  A year-only restore
    // must not overwrite the profile that another year is currently using.
    const incoming={years:(data.years||[]).filter(item=>item.id===yearId),classes:(data.classes||[]).filter(item=>item.yearId===yearId),students:(data.students||[]).filter(item=>!remainingEnrollmentStudents.has(item.id)),enrollments:data.enrollments||[],records:data.records||[],trash:data.trash||[],meta:data.meta||[]};
    const ids=name=>new Set((incoming[name]||[]).map(item=>item.id||item.key));
    const incomingMetaKeys=ids('meta'),staleYearMeta=(await getAll('meta')).filter(item=>YEAR_SYNC_META_KEYS.has(item.key)&&!incomingMetaKeys.has(item.key)).map(item=>item.key);
    const deletableStudents=[...studentIds].filter(id=>!remainingEnrollmentStudents.has(id));
    const remove=(name,items,key='id')=>items.map(item=>item[key]).filter(id=>!ids(name).has(id));
    await applyBatch({puts:incoming,deletes:{years:[yearId].filter(id=>!ids('years').has(id)),classes:remove('classes',classes),enrollments:remove('enrollments',enrollments),records:remove('records',records),trash:remove('trash',trash),students:deletableStudents.filter(id=>!ids('students').has(id)),meta:staleYearMeta}});
  }

  window.ClassDB={open,uid,now,deviceId,get,getAll,getAllByIndex,put,putMany,putRaw,putManyRaw,remove,getMeta,setMeta,applyBatch,replaceAllRaw,replaceYearRaw,resetAll};
})();
