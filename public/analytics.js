(() => {
  const endpoint='https://snu-gate-campus-break.lee1010202001.chatgpt.site/api/collect';
  if(!['jhlee1020lee.github.io','snu-gate-campus-break.lee1010202001.chatgpt.site'].includes(location.hostname))return;
  const disabled=()=>navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true||localStorage.getItem('campus-analytics-off')==='1';
  let visited=false,started=false;
  function send(kind){try{
    if(disabled())return;
    const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
    let stored;try{stored=JSON.parse(localStorage.getItem('campus-analytics-visitor')||'null')}catch{}
    if(!stored||stored.day!==day){stored={day,id:crypto.randomUUID()};localStorage.setItem('campus-analytics-visitor',JSON.stringify(stored))}
    const body=JSON.stringify({id:crypto.randomUUID(),visitor:stored.id,kind,device:matchMedia('(pointer: coarse)').matches?'mobile':'desktop'});
    fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body,credentials:'omit',keepalive:true}).catch(()=>{});
  }catch{}}
  const ui=document.getElementById('ui');
  function check(){if(document.visibilityState!=='visible')return;if(!visited){visited=true;send('page')}if(ui?.dataset.state==='playing'&&!started){started=true;send('start')}}
  if(ui)new MutationObserver(check).observe(ui,{attributes:true,attributeFilter:['data-state']});
  document.addEventListener('visibilitychange',check);check();
})();
