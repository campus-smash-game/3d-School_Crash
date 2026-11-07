import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../public/leaderboard.js',import.meta.url),'utf8');
class Element {
  children=[];hidden=true;disabled=false;listeners={};textContent='';dataset={state:'landing'};
  append(child){this.children.push(child)}
  replaceChildren(fragment){this.children=fragment.children}
  addEventListener(name,fn){this.listeners[name]=fn}
}
const elements=Object.fromEntries(['ui','leaderboard-rows','leaderboard-table','leaderboard-status','leaderboard-refresh'].map(id=>[id,new Element()]));
const requests=[],responses=[],listeners={};let observer,now=100000;
const document={visibilityState:'visible',getElementById:id=>elements[id],createElement:()=>new Element(),createDocumentFragment:()=>new Element(),addEventListener:(name,fn)=>listeners[name]=fn};
const context={document,Date:{now:()=>now},AbortController,setTimeout,clearTimeout,MutationObserver:class{constructor(fn){observer=fn}observe(){}},fetch:(url,options)=>{requests.push({url,options});return new Promise((resolve,reject)=>responses.push({resolve,reject}))}};
const settle=async()=>{await new Promise(resolve=>setImmediate(resolve))};
vm.runInNewContext(source,context);
assert.equal(requests.length,1);assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.headers,undefined);
assert.equal(elements['leaderboard-refresh'].disabled,true);
observer();assert.equal(requests.length,1,'Pending requests must not duplicate');
const unsafe='<img src=x onerror=alert(1)>';
responses.shift().resolve({ok:true,json:async()=>({buildings:[{rank:1,name:unsafe,destructions:42},{rank:1,name:'다른 건물',destructions:42}]})});await settle();
assert.equal(elements['leaderboard-table'].hidden,false);assert.equal(elements['leaderboard-rows'].children[0].children[1].textContent,unsafe);
assert.equal(elements['leaderboard-rows'].children[0].children[2].textContent,'42회');assert.equal(elements['leaderboard-refresh'].disabled,false);
elements.ui.dataset.state='playing';now+=61000;observer();assert.equal(requests.length,1,'Do not fetch during gameplay');
elements.ui.dataset.state='paused';observer();assert.equal(requests.length,2);responses.shift().reject(Error('offline'));await settle();
assert.equal(elements['leaderboard-table'].hidden,false);assert.match(elements['leaderboard-status'].textContent,/이전 순위/);
elements['leaderboard-refresh'].listeners.click();assert.equal(requests.length,3);assert.equal(requests[2].options.cache,'no-cache');
responses.shift().resolve({ok:true,json:async()=>({buildings:[]})});await settle();assert.equal(elements['leaderboard-table'].hidden,true);assert.match(elements['leaderboard-status'].textContent,/아직/);
elements['leaderboard-refresh'].listeners.click();responses.shift().resolve({ok:true,json:async()=>({buildings:[{rank:1,name:'invalid',destructions:-1}]})});await settle();assert.match(elements['leaderboard-status'].textContent,/게임은 바로 시작/);
document.visibilityState='hidden';now+=61000;listeners.visibilitychange();assert.equal(requests.length,4);
console.log('Leaderboard client verified: safe names, empty/error states, refresh, in-flight deduplication and no requests during gameplay. DOM fixtures only.');
