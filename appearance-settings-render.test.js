"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=fs.readFileSync(path.resolve(__dirname,"..","app-settings-display.js"),"utf8");
const listeners=[];
const monthlyRow={hidden:false,insertAdjacentHTML(){}};
const monthly={closest:()=>monthlyRow};
const listenerNode={addEventListener:(type,handler)=>listeners.push({type,handler})};
const actionRow={replaceChildren(){}};
const form={
  querySelector(selector){
    if(selector==="#appearance-show-monthly")return monthly;
    if(selector==="#appearance-overview-monthly")return listenerNode;
    if(selector===".button-row.end")return actionRow;
    return null;
  },
  querySelectorAll(){return[];},
  addEventListener:(type,handler)=>listeners.push({type,handler})
};
const target={
  innerHTML:"",
  insertAdjacentHTML(){},
  querySelector:selector=>selector==="#appearance-form"?form:null,
  querySelectorAll:()=>[]
};
const context={
  state:{informationMode:"standard",theme:"light",rosterDensity:"auto",pupilKanaMode:false,iconMode:"standard",emojiIcons:{},rewardIcon:"✨",showMonthlyForgotten:true},
  EMOJI_ICON_CHOICES:{},REWARD_ICONS:[],
  settingsPageLead:()=>"",displaySettingsGuideHtml:()=>"",wireSettingsHome(){},wireDisplaySettingsGuide(){},
  pupilOverviewOptionsHtml:()=>"",readPupilOverviewOptions:()=>({monthly:true}),savePupilOverviewOptions:async()=>{},
  emojiChoiceGroup:()=>"",ClassDB:{setMeta:async()=>{}},applyTheme(){},showToast(){},
  document:{getElementById:id=>id==="settings-content"?target:null,createElement:()=>({})}
};
const renderSource=source.match(/function renderAppearanceSettings\(\)\{[\s\S]*?\n  \}/)[0];
const renderAppearanceSettings=vm.runInNewContext(`${renderSource}\nrenderAppearanceSettings;`,context);

assert.doesNotThrow(()=>renderAppearanceSettings());
assert.equal(monthlyRow.hidden,true);
assert.ok(listeners.some(item=>item.type==="change"));
assert.ok(listeners.some(item=>item.type==="submit"));
assert.doesNotMatch(source,/querySelector\('\.panel h1'\)/);
assert.match(source,/const form=target\.querySelector\('#appearance-form'\)/);

console.log("appearance-settings-render: passed");
