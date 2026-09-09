(function(){
  'use strict';

  const decoder=new TextDecoder('utf-8');
  const MAX_XLSX_BYTES=25*1024*1024,MAX_XLSX_ENTRIES=5000,MAX_XLSX_EXPANDED_BYTES=50*1024*1024;
  const u16=(view,offset)=>view.getUint16(offset,true);
  const u32=(view,offset)=>view.getUint32(offset,true);
  function decodeXml(value){return String(value||'').replace(/&#(\d+);/g,(_,number)=>String.fromCodePoint(Number(number))).replace(/&#x([0-9a-f]+);/gi,(_,number)=>String.fromCodePoint(parseInt(number,16))).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');}
  function attribute(tag,name){return decodeXml(tag.match(new RegExp(`(?:^|\\s)${name.replace(':','\\:')}="([^"]*)"`))?.[1]||'');}
  function textNodes(xml){return[...String(xml||'').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match=>decodeXml(match[1])).join('');}
  function columnIndex(reference){let value=0;for(const char of String(reference).match(/[A-Z]+/i)?.[0]||'A')value=value*26+char.toUpperCase().charCodeAt(0)-64;return value-1;}

  async function inflate(bytes){
    if(typeof DecompressionStream==='undefined')throw new Error('このブラウザではExcelの展開機能を利用できません。SafariまたはChromeを最新版にしてください。');
    let stream;try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error('Excelファイルを展開できませんでした。');}
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer){
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);let eocd=-1;
    for(let offset=Math.max(0,bytes.length-65557);offset<=bytes.length-22;offset++)if(u32(view,offset)===0x06054b50)eocd=offset;
    if(eocd<0)throw new Error('Excelファイルの形式を確認してください。');
    const total=u16(view,eocd+10),centralOffset=u32(view,eocd+16),entries=new Map();if(total>MAX_XLSX_ENTRIES)throw new Error('Excelのファイル数が多すぎます。必要な名簿だけを保存してください。');let cursor=centralOffset,expandedTotal=0;
    for(let index=0;index<total;index++){
      if(u32(view,cursor)!==0x02014b50)throw new Error('Excelファイルの一覧を読み取れませんでした。');
      const method=u16(view,cursor+10),compressedSize=u32(view,cursor+20),uncompressedSize=u32(view,cursor+24),nameLength=u16(view,cursor+28),extraLength=u16(view,cursor+30),commentLength=u16(view,cursor+32),localOffset=u32(view,cursor+42),name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameLength));
      expandedTotal+=uncompressedSize;if(expandedTotal>MAX_XLSX_EXPANDED_BYTES)throw new Error('Excelを展開した容量が大きすぎます。名簿だけのファイルを選んでください。');
      if(u32(view,localOffset)!==0x04034b50)throw new Error('Excelファイルの内容を読み取れませんでした。');
      const localNameLength=u16(view,localOffset+26),localExtraLength=u16(view,localOffset+28),start=localOffset+30+localNameLength+localExtraLength,compressed=bytes.slice(start,start+compressedSize);
      if(!name.endsWith('/'))entries.set(name,method===0?compressed:method===8?await inflate(compressed):null);
      cursor+=46+nameLength+extraLength+commentLength;
    }
    return entries;
  }

  function entryText(entries,path){const value=entries.get(path);if(!value)throw new Error(`Excel内の「${path}」を読み取れませんでした。`);return decoder.decode(value);}
  function sharedStrings(entries){const bytes=entries.get('xl/sharedStrings.xml');if(!bytes)return[];const xml=decoder.decode(bytes);return[...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match=>textNodes(match[1]));}
  function firstSheetPath(entries){
    const workbook=entryText(entries,'xl/workbook.xml'),sheetTag=workbook.match(/<sheet\b[^>]*>/)?.[0];if(!sheetTag)throw new Error('Excelにシートがありません。');
    const relationId=attribute(sheetTag,'r:id'),relations=entryText(entries,'xl/_rels/workbook.xml.rels');let target='';
    for(const match of relations.matchAll(/<Relationship\b[^>]*\/?\s*>/g))if(attribute(match[0],'Id')===relationId){target=attribute(match[0],'Target');break;}
    if(!target)throw new Error('Excelの先頭シートを特定できませんでした。');
    if(target.startsWith('/'))return target.slice(1);return`xl/${target.replace(/^\.\//,'')}`.replace(/\/[^/]+\/\.\.\//g,'/');
  }

  function worksheetRows(xml,strings){
    const rows=[];
    for(const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
      const row=[];
      for(const cellMatch of rowMatch[1].matchAll(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)){
        const cell=cellMatch[0],reference=attribute(cell.match(/<c\b[^>]*>/)?.[0]||cell,'r'),type=attribute(cell.match(/<c\b[^>]*>/)?.[0]||cell,'t');let value='';
        if(type==='inlineStr')value=textNodes(cell);else{const raw=decodeXml(cell.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1]||'');value=type==='s'?strings[Number(raw)]??'':type==='b'?(raw==='1'?'TRUE':'FALSE'):raw;}
        row[columnIndex(reference)]=value;
      }
      while(row.length&&String(row[row.length-1]??'').trim()==='')row.pop();if(row.some(value=>String(value??'').trim()!==''))rows.push(row.map(value=>value??''));
    }
    return rows;
  }

  async function read(file){
    if(!/\.xlsx$/i.test(file.name||''))throw new Error('Excelファイルは .xlsx 形式で保存してください。');
    if(Number(file.size)>MAX_XLSX_BYTES)throw new Error('Excelファイルが大きすぎます。25MB以下のファイルを選んでください。');
    const entries=await unzip(await file.arrayBuffer()),path=firstSheetPath(entries),rows=worksheetRows(entryText(entries,path),sharedStrings(entries));
    if(!rows.length)throw new Error('Excelの先頭シートに名簿データがありません。');
    return rows;
  }

  window.XlsxRosterReader={read};
})();
