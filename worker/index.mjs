import {buildings} from './buildings.mjs';
const ORIGINS = new Set(['https://jhlee1020lee.github.io','https://snu-gate-campus-break.lee1010202001.chatgpt.site']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const diagnosticVisitor='00000000-0000-4000-8000-000000000000';
const day = (date = Date.now()) => new Date(date + 9 * 3600000).toISOString().slice(0,10);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b=>b.toString(16).padStart(2,'0')).join('');
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin');
    const cors = ORIGINS.has(origin) ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'} : {};
    const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if (request.method==='OPTIONS') return ORIGINS.has(origin) ? new Response(null,{status:204,headers:cors}) : reply({error:'Origin rejected'},403);
    try {
      if (url.pathname==='/api/collect' && request.method==='POST') {
        if (!ORIGINS.has(origin)) return reply({error:'Origin rejected'},403);
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error:'JSON required'},415);
        const reader=request.body?.getReader(); if(!reader)return reply({error:'Body required'},400);
        const chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return reply({error:'Too large'},413)}chunks.push(value)}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
        let event;try{event=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply({error:'Invalid JSON'},400)}
        if (!event || !uuid.test(event.id) || !uuid.test(event.visitor) || !['page','start','building'].includes(event.kind) || !['mobile','desktop'].includes(event.device) || Object.keys(event).some(k=>!['id','visitor','kind','device',...(event.kind==='building'?['building']:[])].includes(k))) return reply({error:'Invalid event'},400);
        if(event.kind==='building' && (typeof event.building!=='string'||!Object.hasOwn(buildings,event.building)))return reply({error:'Unknown building'},400);
        if(event.visitor===diagnosticVisitor && (!env.ANALYTICS_ADMIN_HASH || await digest(request.headers.get('Authorization')?.replace(/^Bearer /,'')??'')!==env.ANALYTICS_ADMIN_HASH))return reply({error:'Unauthorized'},401);
        const host=origin.includes('github.io')?'github-pages':'sites', today=day();
        if(event.kind==='building') {
          await env.DB.batch([
            env.DB.prepare('DELETE FROM building_destructions WHERE day < ?').bind(day(Date.now()-29*86400000)),
            env.DB.prepare('DELETE FROM analytics_events WHERE day < ?').bind(day(Date.now()-29*86400000)),
            env.DB.prepare('INSERT OR IGNORE INTO building_destructions (id,day,host,visitor,building,device) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM building_destructions WHERE day=? AND host=? AND visitor=?) < 5000').bind(event.id,today,host,event.visitor,event.building,event.device,today,host,event.visitor)
          ]);
          return reply({ok:true});
        }
        await env.DB.batch([
          env.DB.prepare('DELETE FROM building_destructions WHERE day < ?').bind(day(Date.now()-29*86400000)),
          env.DB.prepare('DELETE FROM analytics_events WHERE day < ?').bind(day(Date.now()-29*86400000)),
          env.DB.prepare('INSERT OR IGNORE INTO analytics_events (id, day, host, visitor, kind, device) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM analytics_events WHERE day=? AND host=? AND visitor=?) < 500').bind(event.id,today,host,event.visitor,event.kind,event.device,today,host,event.visitor)
        ]);
        return reply({ok:true});
      }
      if(url.pathname==='/api/stats' && request.method==='GET') {
        const token=request.headers.get('Authorization')?.replace(/^Bearer /,'') ?? '';
        if(!env.ANALYTICS_ADMIN_HASH || token.length>200 || await digest(token)!==env.ANALYTICS_ADMIN_HASH)return reply({error:'Unauthorized'},401);
        const result=await env.DB.prepare("SELECT day, host, device, SUM(kind='page') AS views, SUM(kind='start') AS starts, COUNT(DISTINCT visitor) AS visitors FROM analytics_events WHERE day>=? AND visitor<>? GROUP BY day,host,device ORDER BY day DESC,host,device").bind(day(Date.now()-29*86400000),diagnosticVisitor).all();
        const ranking=await env.DB.prepare('SELECT building, COUNT(*) AS destructions FROM building_destructions WHERE day>=? AND visitor<>? GROUP BY building ORDER BY destructions DESC,building').bind(day(Date.now()-29*86400000),diagnosticVisitor).all();
        return reply({timezone:'Asia/Seoul',retentionDays:30,rows:result.results,buildings:ranking.results.map(row=>({...row,name:buildings[row.building]??row.building}))});
      }
      return reply({error:'Not found'},404);
    } catch { return reply({error:'Temporarily unavailable'},503); }
  }
};
