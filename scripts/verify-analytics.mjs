import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import vm from 'node:vm';
import worker from '../worker/index.mjs';
const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../drizzle/0000_analytics.sql',import.meta.url),'utf8'));
const DB={
  prepare(query){return{bind(...args){return{run:()=>sql.prepare(query).run(...args),all:async()=>({results:sql.prepare(query).all(...args)})}}}},
  async batch(items){sql.exec('BEGIN');try{const values=items.map(item=>item.run());sql.exec('COMMIT');return values}catch(e){sql.exec('ROLLBACK');throw e}}
};
const env={DB,ANALYTICS_ADMIN_HASH:createHash('sha256').update('test-password').digest('hex'),ASSETS:{fetch:()=>new Response('asset')}};
const origin='https://jhlee1020lee.github.io',base='https://snu-gate-campus-break.lee1010202001.chatgpt.site';
const event={id:randomUUID(),visitor:randomUUID(),kind:'page',device:'mobile'};
const post=(body=event,source=origin)=>worker.fetch(new Request(base+'/api/collect',{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);
assert.equal((await post()).status,200);await post();assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,1);
await post({...event,id:randomUUID(),kind:'start'});assert.equal((await post(event,'https://evil.example')).status,403);
assert.equal((await post({...event,kind:'invalid'})).status,400);assert.equal((await post({...event,email:'private'})).status,400);
assert.equal((await post({value:'x'.repeat(2000)})).status,413);
assert.equal((await worker.fetch(new Request(base+'/api/stats'),env)).status,401);
assert.equal((await worker.fetch(new Request(base+'/api/stats',{headers:{Authorization:'Bearer wrong'}}),env)).status,401);
const result=await worker.fetch(new Request(base+'/api/stats',{headers:{Authorization:'Bearer test-password'}}),env);const stats=await result.json();assert.equal(stats.rows[0].views,1);assert.equal(stats.rows[0].starts,1);assert.equal(stats.rows[0].visitors,1);assert.ok(!JSON.stringify(stats).includes(event.visitor));
sql.prepare('INSERT INTO analytics_events VALUES (?,?,?,?,?,?)').run(randomUUID(),'2000-01-01','sites',randomUUID(),'page','desktop');await post();assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE day='2000-01-01'").get().n,0);
assert.equal(await (await worker.fetch(new Request(base+'/index.html'),env)).text(),'asset');
const preflight=await worker.fetch(new Request(base+'/api/collect',{method:'OPTIONS',headers:{Origin:origin}}),env);assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
const client=await readFile(new URL('../public/analytics.js',import.meta.url),'utf8');
for(const off of [false,true]){const requests=[],values=new Map(off?[['campus-analytics-off','1']]:[]);let observer;const ui={dataset:{state:'loading'}};const context={location:{hostname:'jhlee1020lee.github.io'},navigator:{},document:{visibilityState:'visible',getElementById:()=>ui,addEventListener(){}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},crypto:{randomUUID},matchMedia:()=>({matches:true}),MutationObserver:class{constructor(cb){observer=cb}observe(){}},fetch:(url,request)=>{requests.push(JSON.parse(request.body));return Promise.resolve()},Date};vm.runInNewContext(client,context);ui.dataset.state='playing';observer();ui.dataset.state='paused';observer();ui.dataset.state='playing';observer();assert.deepEqual(requests.map(x=>x.kind),off?[]:['page','start']);}
console.log('Analytics verified: SQLite writes, deduplication, invalid input/origin/size, authentication, aggregate-only output, retention, assets, CORS, and client initial-start/opt-out behavior. No browser used.');
