const CACHE='doday-v72';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./badge-96.png'];
const OK_HOSTS=['cdn.jsdelivr.net','www.gstatic.com'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('doday-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin&&!OK_HOSTS.includes(u.host))return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r})
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));
});

/* ===== 알림 ===== */
const NC='notif-doday';               // 'doday-'로 시작하지 않게 해서 업데이트 때 안 지워지게
const SCHED_AT=18*60, LEFT_AT=20*60, LEFT_MIN=3;
const nk=k=>new Request(self.registration.scope+'__notif/'+k);
async function getJ(k){try{const r=await (await caches.open(NC)).match(nk(k));return r?await r.json():null}catch(e){return null}}
async function putJ(k,v){const c=await caches.open(NC);await c.put(nk(k),new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}}))}
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const TYPE={perf:'수행평가',acad:'특별 일정',exam:'시험',etc:'일정'};

function schedMsg(s,t,tm){
  const evs=(s.ev||[]).filter(e=>e.d===tm);
  const ex=s.exam||{days:[]},exTm=(ex.days||[]).includes(tm),exT=(ex.days||[]).includes(t);
  if(!evs.length&&!exTm)return null;
  const jo=(w,a,b)=>{const c=w.charCodeAt(w.length-1)-0xAC00;return w+(c>=0&&c<=11171&&c%28?a:b)};
  let title;
  if(exTm&&!evs.length)title=exT?`내일도 ${ex.t} 있어요!`:`내일부터 ${jo(ex.t,'이에요','예요')}!`;
  else{
    const tys=[...new Set(evs.map(e=>e.ty))],n=evs.length+(exTm?1:0);
    const w=tys.length===1&&!exTm?(TYPE[tys[0]]||'일정'):'일정';
    title=n>1?`내일 ${jo(w,'이','가')} ${n}개 있어요!`:`내일 ${jo(w,'이','가')} 있어요!`;
  }
  const names=evs.map(e=>e.t);if(exTm)names.unshift(ex.t);
  const tail=pick(['오늘 미리 챙겨 두면 마음이 편해요','준비물이랑 할 거 지금 한 번 확인해요','자기 전에 한 번만 더 점검해요']);
  return {title,body:names.join(' · ')+'\n'+tail,tag:'doday-sched',url:'./'};
}
function leftMsg(s,t){
  let n=0;for(const d in (s.left||{}))if(d<t)n+=s.left[d];
  if(n<LEFT_MIN)return null;
  const nm=s.name?s.name+'님, ':'';
  const v=pick([
    [`미룬 할 일이 ${n}개나 쌓였어요!`,`${nm}지금 딱 하나만 시작해 봐요. 시작이 제일 어려워요`],
    [`밀린 할 일 ${n}개, 오늘 좀 줄여 볼까요?`,`${nm}제일 짧은 것부터 하나 골라서 시작해요`],
    [`아직 ${n}개가 기다리고 있어요`,`${nm}지금 시작하면 자기 전에 꽤 줄일 수 있어요!`]
  ]);
  return {title:v[0],body:v[1],tag:'doday-left',url:'./?go=left'};
}
async function show(m){
  await self.registration.showNotification(m.title,{body:m.body,tag:m.tag,icon:'icon-192.png',badge:'badge-96.png',data:{url:m.url},lang:'ko'});
}
async function runCheck(){
  const s=await getJ('snap');if(!s||!s.on)return;
  const log=(await getJ('log'))||{};
  const now=new Date(),t=ymd(now),mm=now.getHours()*60+now.getMinutes();
  const tmD=new Date(now);tmD.setDate(tmD.getDate()+1);const tm=ymd(tmD);
  let ch=false;
  try{
    if(mm>=SCHED_AT&&log.s!==t){const m=schedMsg(s,t,tm);if(m){await show(m);log.s=t;ch=true}}
    if(mm>=LEFT_AT&&log.l!==t){const m=leftMsg(s,t);if(m){await show(m);log.l=t;ch=true}}
  }catch(e){}
  if(ch)await putJ('log',log);
}
self.addEventListener('message',e=>{
  const d=e.data;if(!d||d.t!=='notif')return;
  e.waitUntil(putJ('snap',d.snap).then(runCheck));
});
// 서버(GitHub Actions → FCM)에서 온 알림
self.addEventListener('push',e=>{
  let p={};try{p=e.data?e.data.json():{}}catch(x){}
  const d=p.data||p;if(!d.title)return;
  e.waitUntil((async()=>{
    await show({title:d.title,body:d.body||'',tag:d.tag||'doday',url:d.url||'./'});
    if(d.kind==='sched'||d.kind==='left'){const log=(await getJ('log'))||{};log[d.kind==='sched'?'s':'l']=ymd(new Date());await putJ('log',log)}
  })());
});
self.addEventListener('periodicsync',e=>{if(e.tag==='doday-notif')e.waitUntil(runCheck())});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  const left=url.includes('go=left');
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
    const c=cs.find(x=>x.url.startsWith(self.registration.scope));
    if(c){if(left)c.postMessage({go:'left'});return c.focus()}
    return self.clients.openWindow(url);
  }));
});
