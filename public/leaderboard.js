(() => {
  const ui=document.getElementById('ui'),rows=document.getElementById('leaderboard-rows');
  const table=document.getElementById('leaderboard-table'),status=document.getElementById('leaderboard-status'),refresh=document.getElementById('leaderboard-refresh');
  if(!ui||!rows||!table||!status||!refresh)return;
  let pending=false,lastAttempt=0;
  const inMenu=()=>document.visibilityState==='visible'&&['loading','landing','paused'].includes(ui.dataset.state);
  async function load(force=false){
    if(pending||!inMenu()||(!force&&Date.now()-lastAttempt<60000))return;
    pending=true;lastAttempt=Date.now();refresh.disabled=true;
    status.textContent='순위를 불러오는 중이에요.';
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch('https://snu-gate-campus-break.lee1010202001.chatgpt.site/api/leaderboard',{credentials:'omit',cache:force?'no-cache':'default',signal:controller.signal});
      if(!response.ok)throw new Error('Unavailable');
      const data=await response.json();
      if(!Array.isArray(data.buildings)||data.buildings.length>5||data.buildings.some(item=>!item||typeof item.name!=='string'||!Number.isSafeInteger(item.rank)||item.rank<1||item.rank>5||!Number.isSafeInteger(item.destructions)||item.destructions<1))throw new Error('Invalid ranking');
      const fragment=document.createDocumentFragment();
      for(const item of data.buildings){
        const row=document.createElement('tr');
        for(const value of [item.rank,item.name,`${item.destructions.toLocaleString('ko-KR')}회`]){
          const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);
        }
        fragment.append(row);
      }
      rows.replaceChildren(fragment);table.hidden=data.buildings.length===0;
      status.textContent=data.buildings.length?'두 게임 주소의 기록을 합산한 순위예요.':'아직 집계된 건물이 없어요.';
    }catch{
      status.textContent=table.hidden?'순위를 불러오지 못했어요. 게임은 바로 시작할 수 있어요.':'순위를 갱신하지 못했어요. 이전 순위를 표시해요.';
    }finally{clearTimeout(timeout);pending=false;refresh.disabled=false;}
  }
  refresh.addEventListener('click',()=>load(true));
  new MutationObserver(()=>load()).observe(ui,{attributes:true,attributeFilter:['data-state']});
  document.addEventListener('visibilitychange',()=>load());
  load();
})();
