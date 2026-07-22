/* SPC ONE 로직 검증 하니스 (브라우저 없이 Node에서 실행)
   실행:  node tests/run.js
   spc.html의 인라인 스크립트를 격리 VM 컨텍스트에서 로드하고
   순수 로직(배정 diff, 체크인 트랜잭션, 오프라인 큐, 추천엔진)과
   전 역할×전 페이지 렌더, 클라우드 동기화 경로를 검증한다. */
const fs=require('fs'),vm=require('vm'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','spc.html'),'utf8');
const js=html.match(/<script>\r?\n'use strict'[\s\S]*?<\/script>/)[0].replace(/<\/?script>/g,'');

let MOCK_QS={};const store=new Map();
const fakeEl=()=>new Proxy({classList:{add(){},remove(){},toggle(){},contains(){return false}},style:{},dataset:{},
  value:'',textContent:'',innerHTML:'',checked:false,hidden:false,appendChild(){},prepend(){},remove(){},
  setAttribute(){},getAttribute(){return null},addEventListener(){},removeEventListener(){},focus(){},
  setSelectionRange(){},closest(){return null},querySelectorAll(){return[]}},{get(t,k){return k in t?t[k]:(()=>{})}});
function makeSandbox(withFirebase){
  const written={},snapCbs={};
  const fb=withFirebase?{initializeApp(){},auth(){return{signInAnonymously:async()=>{}}},
    firestore(){return{collection:n=>({doc:id=>({set:v=>{(written[n]=written[n]||{})[id]=v;return Promise.resolve()},delete:()=>Promise.resolve()}),onSnapshot:cb=>{snapCbs[n]=cb;return()=>{}}}),
      runTransaction:async fn=>fn({get:async()=>({exists:false}),set(){}}),enablePersistence:async()=>{},disableNetwork:async()=>{},enableNetwork:async()=>{}}}}:undefined;
  const sb={navigator:{onLine:true},localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},window:{addEventListener(){},open:()=>null,scrollTo(){}},
    document:{addEventListener(){},getElementById:()=>fakeEl(),createElement:()=>fakeEl(),querySelector:()=>fakeEl(),querySelectorAll:s=>MOCK_QS[s]||[],body:fakeEl()},
    BroadcastChannel:class{postMessage(){}close(){}},location:{reload(){}},requestAnimationFrame:cb=>cb(),
    setTimeout:(cb,t)=>{if(t===700)cb();return 0},clearTimeout(){},console,JSON,Date,Math,Object,Array,String,Number,Boolean,Set,Map,parseInt,parseFloat,isNaN,Proxy,RegExp,Promise};
  if(fb){sb.firebase=fb;sb.window.firebase=fb}
  sb.globalThis=sb;vm.createContext(sb);sb.__written=written;sb.__snapCbs=snapCbs;return sb;
}
let pass=0,fail=0;const ok=(n,c)=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗ 실패:',n))};

// ── 로직 + 렌더 ──
store.clear();MOCK_QS={};
const sb=makeSandbox(false);
vm.runInContext(js+`;globalThis.__API={esc,choseong,recScore,computeOrder,commitAssign,doCheckin,undoCheckin,flushQueue,isArrived,guestOf,S,byId,uid,PAGES,ROLES,ROLE_PERMS,setASGN:id=>{ASGN_EV=id},setCUR:u=>{CUR=u},setOffline:b=>{DEMO_OFFLINE=b},reportData,riskRadar,qualityIssues,snapshotOrder,buildScriptText,fmtDuration,arrivalDistChart,receptionDuration,crossEventStats,sparkline,renderStatsTrend,addCompanion,removeCompanion,sanitizeCompanions,renderReception,renderLogin};`,sb);
const A=sb.__API;A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const evId=A.S.events[0].id;

console.log('\n[XSS/검색/추천]');
ok('스크립트 태그 무력화',!A.esc('<script>x</script>').includes('<script'));
ok('초성 검색',A.choseong('가온누리').startsWith('ㄱ'));
ok('추천 정렬 내림차순',A.computeOrder(evId).every((o,i,a)=>i===0||a[i-1].score>=o.score));

console.log('\n[배정 diff — 체크인 보존]');
const egs=A.S.eventGuests.filter(e=>e.eventId===evId);
egs[0].arrivalStatus='arrived';egs[0].checkedInAt='2026-07-22T01:00:00.000Z';
const ng=A.uid('g');A.S.guests.push({id:ng,name:'신규',org:'t',pos:'과장',defaultLevel:'Guest',grp:'기타',isActive:true,eventRelevanceDefault:1});
MOCK_QS['.asgn-cb:checked']=egs.map(e=>({value:e.guestId})).concat([{value:ng}]);A.setASGN(evId);A.commitAssign();
ok('도착 기록 보존',A.byId(A.S.eventGuests,egs[0].id).checkedInAt==='2026-07-22T01:00:00.000Z');
ok('신규 1명만 추가',A.S.eventGuests.filter(e=>e.eventId===evId&&e.arrivalStatus!=='cancelled').length===egs.length+1);

console.log('\n[체크인 멱등/오프라인/취소]');
const g1=egs.find(e=>A.guestOf(e).name==='아름솔');A.doCheckin(g1.id);A.doCheckin(g1.id);
ok('중복클릭 로그 1건',A.S.checkinLogs.filter(l=>l.eventGuestId===g1.id&&l.action==='checkin').length===1);
A.setOffline(true);const g2=egs.find(e=>A.guestOf(e).name==='사랑비');A.doCheckin(g2.id);
ok('오프라인 큐 적재',A.S.queue.length===1&&A.S.checkinLogs.filter(l=>l.eventGuestId===g2.id).length===0);
A.setOffline(false);A.flushQueue();A.flushQueue();
ok('재연결 멱등 동기화',A.S.checkinLogs.filter(l=>l.eventGuestId===g2.id).length===1&&A.S.queue.length===0);

console.log('\n[전 역할 × 전 페이지 렌더]');
let re=0;for(const role of Object.keys(A.ROLES)){A.setCUR({id:'u',role,name:'T',assignedEventIds:[]});
  for(const[v,fn]of Object.entries(A.PAGES)){if(!A.ROLE_PERMS[role].has(v))continue;
    try{if(typeof fn()!=='string')throw 0}catch(e){re++;console.log('   ✗',role,v,e.message||e)}}}
ok('렌더 오류 0건',re===0);

console.log('\n[통계 헬퍼]');
ok('fmtDuration 분 단위 표기',A.fmtDuration(125000)==='2분');
ok('fmtDuration 1분 미만',A.fmtDuration(30000)==='1분 미만');
ok('fmtDuration null 처리',A.fmtDuration(null)==='—');
ok('arrivalDistChart 빈 버킷 안내',A.arrivalDistChart({}).includes('도착 데이터 없음'));
ok('arrivalDistChart 값 렌더',A.arrivalDistChart({'09:00':2}).includes('2명'));

console.log('\n[VVIP 응대시간]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const vvGuest=A.S.eventGuests.find(e=>e.eventId===evId&&e.protocolLevel==='VVIP'&&e.arrivalStatus==='expected');
if(vvGuest){
  const checkinTime=new Date().toISOString();
  A.S.checkinLogs.push({eventId:evId,eventGuestId:vvGuest.id,action:'checkin',createdAt:checkinTime});
  A.S.checkinLogs.push({eventId:evId,eventGuestId:vvGuest.id,action:'reception_complete',
    createdAt:new Date(new Date(checkinTime).getTime()+10*60000).toISOString()});
  const rd=A.receptionDuration(evId);
  ok('응대시간 정확히 1건 집계(VVIP만)',rd.count===1);
  ok('응대시간 평균이 10분 이상',rd.avg>=10*60000-1000);
  // VVIP 필터 검증: 非VVIP 내빈에 체크인+영접완료 로그 추가하면 집계되지 않아야 함
  const nonVVGuest=A.S.eventGuests.find(e=>e.eventId===evId&&e.protocolLevel!=='VVIP'&&e.arrivalStatus==='expected');
  if(nonVVGuest){
    const checkinTime2=new Date(new Date(checkinTime).getTime()+20*60000).toISOString();
    A.S.checkinLogs.push({eventId:evId,eventGuestId:nonVVGuest.id,action:'checkin',createdAt:checkinTime2});
    A.S.checkinLogs.push({eventId:evId,eventGuestId:nonVVGuest.id,action:'reception_complete',
      createdAt:new Date(new Date(checkinTime2).getTime()+5*60000).toISOString()});
    const rd2=A.receptionDuration(evId);
    ok('非VVIP 로그 추가해도 VVIP만 집계',rd2.count===1);
    ok('非VVIP는 응대시간에 포함 안 됨(평균 유지)',rd2.avg>=10*60000-1000);
  }else{
    ok('非VVIP 표본 확보',false);
  }
}else{
  ok('검증 가능한 VVIP 표본 확보(선행 섹션이 모두 소모하지 않음)',false);
}
const rdEmpty=A.receptionDuration('없는-행사-id');
ok('표본 없으면 count 0, avg null',rdEmpty.count===0&&rdEmpty.avg===null);

console.log('\n[행사간 추이]');
const single=A.crossEventStats();
ok('행사 1건일 때도 배열 반환',Array.isArray(single)&&single.length===1);
const ev2Id=A.uid('e');
A.S.events.push({id:ev2Id,title:'테스트 행사2',type:'forum',date:'2026-07-01',startTime:'10:00',endTime:'11:00',
  status:'confirmed',managerIds:[],createdBy:'u1',createdAt:'2026-07-01T00:00:00.000Z',version:1});
const sorted=A.crossEventStats();
ok('날짜 오름차순 정렬',sorted.length===2&&sorted[0].ev.id===ev2Id);
ok('rate 필드는 0~100 범위',sorted.every(r=>r.rate>=0&&r.rate<=100));

// 권한 범위 필터링 회귀 테스트: manager 역할은 assignedEventIds로만 행사 볼 수 있음
A.setCUR({id:'u1',role:'manager',name:'권한테스트',assignedEventIds:[evId]});
const restrictedStats=A.crossEventStats();
ok('manager · 할당된 행사만 반환(1개)',restrictedStats.length===1&&restrictedStats[0].ev.id===evId);
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});

console.log('\n[스파크라인]');
ok('표본 2개 미만이면 빈 문자열',A.sparkline([5],'#000')==='');
ok('표본 2개 이상이면 SVG 반환',A.sparkline([10,20,15],'#0B6E42').startsWith('<svg'));
ok('색상 값 반영',A.sparkline([1,2],'#ABCDEF').includes('#ABCDEF'));

console.log('\n[통계 페이지]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
ok('행사 상세 탭 기본 렌더',typeof A.PAGES.stats()==='string');

A.setCUR({id:'u1',role:'manager',name:'권한테스트',assignedEventIds:[evId]});
ok('행사 2건 미만이면 추이 안내 문구 표시',A.renderStatsTrend().includes('2건 이상 필요'));
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
ok('행사 2건 이상이면 추이 차트 렌더(안내 문구 없음)',!A.renderStatsTrend().includes('2건 이상 필요')&&A.renderStatsTrend().includes('<svg'));

console.log('\n[수행원 배열 로직]');
const c0=[];
const c1=A.addCompanion(c0);
ok('addCompanion은 원본을 바꾸지 않음',c0.length===0&&c1.length===1);
ok('addCompanion 결과는 빈 항목',c1[0].name===''&&c1[0].role===''&&c1[0].phone==='');
const c2=A.addCompanion(c1);
const c3=A.removeCompanion(c2,0);
ok('removeCompanion은 원본을 바꾸지 않음',c2.length===2&&c3.length===1);
const dirty=[{name:'  김비서  ',role:' 비서 ',phone:'010-1111-2222'},{name:'   ',role:'운전기사',phone:''},{name:'박기사',role:'',phone:''}];
const clean=A.sanitizeCompanions(dirty);
ok('빈 이름 항목 제외',clean.length===2);
ok('trim 처리됨',clean[0].name==='김비서'&&clean[0].role==='비서');
ok('원본 배열 불변',dirty.length===3&&dirty[0].name==='  김비서  ');

console.log('\n[수행원 표시]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const vipEg=A.S.eventGuests.find(e=>e.eventId===evId&&(e.protocolLevel==='VVIP'||e.receptionRequired));
if(vipEg){
  vipEg.companions=[{name:'김비서',role:'비서',phone:'010-0000-0000'}];
  const html=A.renderReception();
  ok('영접 관리 화면에 수행원 수 표시',html.includes('1명'));
}else{
  ok('VVIP/영접대상 표본 확보',false);
}

console.log('\n[로그인 화면]');
let loginThrew=false;
try{A.renderLogin()}catch(e){loginThrew=true;console.log('   ✗',e.message)}
ok('renderLogin 예외 없이 실행됨',!loginThrew);

// ── 클라우드 경로 ──
console.log('\n[클라우드 동기화 경로]');
store.clear();MOCK_QS={};
const sc=makeSandbox(true);
vm.runInContext(js+`;globalThis.__API={FB,FB_CONFIG,initCloud,S};`,sc);
(async()=>{
  sc.__API.FB_CONFIG.apiKey='k';sc.__API.FB_CONFIG.projectId='p';
  await sc.__API.initCloud();
  ok('클라우드 모드 활성',sc.__API.FB.on===true);
  ok('부트스트랩 업로드',sc.__written['spc_guests']&&Object.keys(sc.__written['spc_guests']).length>0);
  console.log(`\n═══ 결과: ${pass} 통과 / ${fail} 실패 ═══`);
  process.exit(fail?1:0);
})();
