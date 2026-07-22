# 통계 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spc.html`에 새 데이터 모델 없이 기존 `eventGuests`/`checkinLogs`/`events`만으로 "행사 상세" + "행사간 추이" 2탭짜리 통계 대시보드 페이지를 추가한다.

**Architecture:** 순수 계산 함수 3개(`receptionDuration`, `crossEventStats`, 기존 `reportData` 재사용) → 순수 렌더 헬퍼 2개(`arrivalDistChart` 추출 리팩터, `sparkline`) → 신규 페이지 `renderStats()` → `PAGES`/`NAV`/`P_ALL`/`ROLE_PERMS`/`ACTS`에 배선. 전부 `spc.html`의 인라인 `<script>` 안에서 함수를 추가/수정하는 작업이며 별도 모듈 파일은 만들지 않는다(기존 단일 파일 아키텍처 유지).

**Tech Stack:** 순수 JS(ES2019), 인라인 SVG, 기존 CSS 클래스(`.stats`,`.stat`,`.card`,`.grid2`) 재사용. 신규 npm 의존성 없음.

## Global Constraints
- 사용자 입력을 `innerHTML`에 넣을 때는 반드시 `esc()`로 이스케이프 (CLAUDE.md 코딩 규칙 1)
- 인라인 `onclick` 금지, 클릭 액션은 전부 `data-act` + `ACTS` 위임 사용 (CLAUDE.md 코딩 규칙 5)
- 기능 수정 후 `node tests/run.js` 통과 필수, 새 핵심 로직엔 테스트 추가 (CLAUDE.md 코딩 규칙 7)
- 새 Firestore 스키마/필드 추가 없음 — 기존 컬렉션만으로 계산 (스펙 목표)
- 차트는 외부 라이브러리 없이 순수 SVG/CSS로 그림 (사용자 승인 사항)

---

### Task 1: `fmtDuration` 헬퍼 + `arrivalDistChart` 추출 리팩터

**Files:**
- Modify: `spc.html:368-370` (포맷 헬퍼들 근처에 `fmtDuration` 추가)
- Modify: `spc.html:1456-1490` (`renderReport` 내부의 도착 분포 차트 계산 블록을 `arrivalDistChart` 함수로 추출)
- Test: `tests/run.js`

**Interfaces:**
- Produces: `fmtDuration(ms:number|null): string` — 밀리초를 "12분"/"1분 미만"/"—"(ms가 null) 형태 문자열로 변환
- Produces: `arrivalDistChart(buckets:Record<string,number>): string` — `reportData().buckets`를 받아 막대그래프 HTML 문자열 반환 (renderReport가 만들던 것과 동일한 마크업)
- Consumes: 없음 (순수 함수, 기존 `esc` 사용)

- [ ] **Step 1: 현재 `renderReport`의 차트 블록 확인**

`spc.html`의 아래 블록(현재 1464~1468행 부근)을 그대로 옮길 것이므로 먼저 원문을 확인한다:

```js
const maxB=Math.max(1,...Object.values(d.buckets));
const chart=Object.keys(d.buckets).sort().map(k=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
  <span style="font-size:11px;color:var(--gray5);width:44px;font-variant-numeric:tabular-nums">${esc(k)}</span>
  <div style="flex:1;background:var(--gray2);border-radius:4px;height:16px;overflow:hidden"><div style="height:100%;width:${d.buckets[k]/maxB*100}%;background:var(--green);border-radius:4px"></div></div>
  <span style="font-size:11px;color:var(--gray5);width:28px">${d.buckets[k]}명</span></div>`).join('')||'<p class="hint">도착 데이터 없음</p>';
```

- [ ] **Step 2: `tests/run.js`에 실패하는 테스트 추가**

`globalThis.__API={...}` 목록(33행)에 `fmtDuration,arrivalDistChart`를 추가한다.

**삽입 위치 주의**: 새 테스트 섹션은 `[전 역할 × 전 페이지 렌더]` 섹션(기존 58~62행) **다음, `[클라우드 동기화 경로]` 섹션(기존 64행 `console.log('\n[클라우드 동기화 경로]')`) 이전**에 추가한다. `[배정 diff]`/`[체크인 멱등...]` 섹션보다 앞에 넣으면 그 섹션들이 정의하는 `egs` 변수를 아직 쓸 수 없어 이후 태스크(Task 2)의 테스트가 깨진다. 이번 태스크는 `egs`를 쓰지 않지만, 이후 태스크들과 같은 자리에 순서대로 쌓기 위해 여기서부터 시작한다:

```js
console.log('\n[통계 헬퍼]');
ok('fmtDuration 분 단위 표기',A.fmtDuration(125000)==='2분');
ok('fmtDuration 1분 미만',A.fmtDuration(30000)==='1분 미만');
ok('fmtDuration null 처리',A.fmtDuration(null)==='—');
ok('arrivalDistChart 빈 버킷 안내',A.arrivalDistChart({}).includes('도착 데이터 없음'));
ok('arrivalDistChart 값 렌더',A.arrivalDistChart({'09:00':2}).includes('2명'));
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.fmtDuration is not a function` 형태의 TypeError로 스크립트가 중단되거나(현재 IIFE 구조상 동기 섹션에서 즉시 크래시) 콘솔에 에러가 출력됨. `fmtDuration`/`arrivalDistChart`가 아직 없으므로 반드시 실패해야 한다.

- [ ] **Step 4: `spc.html`에 구현 추가**

`spc.html:370`(`const fmtD=...` 다음 줄)에 추가:

```js
const fmtDuration=ms=>{if(ms==null)return'—';const m=Math.round(ms/60000);return m<1?'1분 미만':`${m}분`};
```

`renderReport` 함수 **앞**(`// ── 24. 결과보고 ──` 주석과 `let RPT_PRIVACY=true;` 사이 또는 그 직후)에 추가:

```js
function arrivalDistChart(buckets){
  const maxB=Math.max(1,...Object.values(buckets));
  return Object.keys(buckets).sort().map(k=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
    <span style="font-size:11px;color:var(--gray5);width:44px;font-variant-numeric:tabular-nums">${esc(k)}</span>
    <div style="flex:1;background:var(--gray2);border-radius:4px;height:16px;overflow:hidden"><div style="height:100%;width:${buckets[k]/maxB*100}%;background:var(--green);border-radius:4px"></div></div>
    <span style="font-size:11px;color:var(--gray5);width:28px">${buckets[k]}명</span></div>`).join('')||'<p class="hint">도착 데이터 없음</p>';
}
```

그다음 `renderReport` 내부의 원래 2줄(`const maxB=...`와 `const chart=...`)을 아래 한 줄로 교체한다:

```js
const chart=arrivalDistChart(d.buckets);
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새로 추가한 5개 항목 모두 `✓`, 마지막 줄 `═══ 결과: N 통과 / 0 실패 ═══` (N은 기존 11 + 5 = 16 이상, 이후 태스크에서 더 늘어남)

- [ ] **Step 6: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "refactor: 도착분포 차트를 arrivalDistChart로 추출, fmtDuration 헬퍼 추가"
```

---

### Task 2: `receptionDuration(evId)` — VVIP 응대시간 계산

**Files:**
- Modify: `spc.html` (Task 1에서 추가한 `arrivalDistChart` 바로 다음)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: `S.checkinLogs`(필드: `eventGuestId`,`action`,`createdAt`), `egOf(evId)`(기존 함수, `spc.html:683`)
- Produces: `receptionDuration(evId:string): {count:number, avg:number|null, max:number|null}` — `avg`/`max`는 밀리초 단위. VVIP이면서 `checkin` 로그와 `reception_complete` 로그가 모두 있는 내빈만 집계.

- [ ] **Step 1: 테스트 추가 (실패 상태)**

`tests/run.js`의 `__API` 목록에 `receptionDuration`을 추가하고, Task 1에서 추가한 `[통계 헬퍼]` 섹션 바로 뒤(여전히 `[전 역할 × 전 페이지 렌더]` 다음, `[클라우드 동기화 경로]` 이전)에 추가:

```js
console.log('\n[VVIP 응대시간]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
// 이 시점까지 다른 섹션이 건드리지 않은 'expected' 상태의 VVIP를 찾는다
// (앞선 섹션들이 egs[0]이나 특정 이름의 내빈 상태를 이미 바꿔놨을 수 있으므로 이름을 하드코딩하지 않는다)
const vvGuest=A.S.eventGuests.find(e=>e.eventId===evId&&e.protocolLevel==='VVIP'&&e.arrivalStatus==='expected');
if(vvGuest){
  A.doCheckin(vvGuest.id);
  // reception_complete 로그를 직접 추가해 소요시간을 검증 가능하게 만든다
  const arrLog=A.S.checkinLogs.find(l=>l.eventGuestId===vvGuest.id&&l.action==='checkin');
  A.S.checkinLogs.push({eventId:evId,eventGuestId:vvGuest.id,action:'reception_complete',
    createdAt:new Date(new Date(arrLog.createdAt).getTime()+10*60000).toISOString()});
  const rd=A.receptionDuration(evId);
  ok('응대시간 표본 1건 이상 집계',rd.count>=1);
  ok('응대시간 평균이 10분 이상',rd.avg>=10*60000-1000);
}else{
  ok('검증 가능한 VVIP 표본 확보(선행 섹션이 모두 소모하지 않음)',false);
}
const rdEmpty=A.receptionDuration('없는-행사-id');
ok('표본 없으면 count 0, avg null',rdEmpty.count===0&&rdEmpty.avg===null);
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.receptionDuration is not a function` 에러로 실패

- [ ] **Step 3: 구현 추가**

`arrivalDistChart` 함수 바로 다음에 추가:

```js
function receptionDuration(evId){
  const vv=egOf(evId).filter(g=>g.protocolLevel==='VVIP');
  const durations=vv.map(eg=>{
    const arr=S.checkinLogs.find(l=>l.eventGuestId===eg.id&&l.action==='checkin');
    const rec=S.checkinLogs.find(l=>l.eventGuestId===eg.id&&l.action==='reception_complete');
    if(!arr||!rec)return null;
    const d=new Date(rec.createdAt).getTime()-new Date(arr.createdAt).getTime();
    return d>=0?d:null;
  }).filter(d=>d!==null);
  if(!durations.length)return{count:0,avg:null,max:null};
  return{count:durations.length,avg:durations.reduce((a,b)=>a+b,0)/durations.length,max:Math.max(...durations)};
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 3개 항목(또는 `가온누리`를 못 찾으면 2개) 통과, 실패 0건

- [ ] **Step 5: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: VVIP 응대시간 계산 함수 receptionDuration 추가"
```

---

### Task 3: `crossEventStats()` — 행사간 추이 데이터

**Files:**
- Modify: `spc.html` (Task 2의 `receptionDuration` 바로 다음)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: `events()`(기존 함수, `spc.html:673`, 권한 범위 내 행사만 반환), `reportData(evId)`, `receptionDuration(evId)`
- Produces: `crossEventStats(): Array<{ev:Event, rate:number, vv:number, reception:{count:number,avg:number|null,max:number|null}}>` — 날짜 오름차순 정렬

- [ ] **Step 1: 테스트 추가 (실패 상태)**

`__API`에 `crossEventStats`, `uid`(이미 있음)를 추가 확인 후, `[VVIP 응대시간]` 섹션 뒤에 추가:

```js
console.log('\n[행사간 추이]');
const single=A.crossEventStats();
ok('행사 1건일 때도 배열 반환',Array.isArray(single)&&single.length===1);
const ev2Id=A.uid('e');
A.S.events.push({id:ev2Id,title:'테스트 행사2',type:'forum',date:'2026-07-01',startTime:'10:00',endTime:'11:00',
  status:'confirmed',managerIds:[],createdBy:'u1',createdAt:'2026-07-01T00:00:00.000Z',version:1});
const sorted=A.crossEventStats();
ok('날짜 오름차순 정렬',sorted.length===2&&sorted[0].ev.id===ev2Id);
ok('rate 필드는 0~100 범위',sorted.every(r=>r.rate>=0&&r.rate<=100));
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.crossEventStats is not a function` 에러

- [ ] **Step 3: 구현 추가**

`receptionDuration` 함수 바로 다음에 추가:

```js
function crossEventStats(){
  return events().slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).map(ev=>{
    const d=reportData(ev.id);
    return{ev,rate:d.active?Math.round(d.arrived/d.active*100):0,vv:d.vv,reception:receptionDuration(ev.id)};
  });
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 3개 항목 통과

- [ ] **Step 5: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 행사간 추이 집계 함수 crossEventStats 추가"
```

---

### Task 4: `sparkline(values, color)` — SVG 라인차트 헬퍼

**Files:**
- Modify: `spc.html` (Task 3의 `crossEventStats` 바로 다음)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `sparkline(values:number[], color:string): string` — `<svg>...</svg>` 문자열. `values.length<2`면 빈 문자열 반환.

- [ ] **Step 1: 테스트 추가 (실패 상태)**

`__API`에 `sparkline` 추가 후, `[행사간 추이]` 섹션 뒤에 추가:

```js
console.log('\n[스파크라인]');
ok('표본 2개 미만이면 빈 문자열',A.sparkline([5],'#000')==='');
ok('표본 2개 이상이면 SVG 반환',A.sparkline([10,20,15],'#0B6E42').startsWith('<svg'));
ok('색상 값 반영',A.sparkline([1,2],'#ABCDEF').includes('#ABCDEF'));
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.sparkline is not a function` 에러

- [ ] **Step 3: 구현 추가**

`crossEventStats` 함수 바로 다음에 추가:

```js
function sparkline(values,color){
  if(values.length<2)return'';
  const w=Math.max(120,values.length*40),h=60,max=Math.max(...values,1),min=Math.min(...values,0);
  const range=max-min||1;
  const pts=values.map((v,i)=>`${(i/(values.length-1)*w).toFixed(1)},${(h-((v-min)/range*h)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 3개 항목 통과

- [ ] **Step 5: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: SVG 스파크라인 헬퍼 sparkline 추가"
```

---

### Task 5: `renderStats()` 페이지 + 라우팅/권한/네비/액션 배선

**Files:**
- Modify: `spc.html:387-389` (`P_ALL`에 `'stats'` 추가)
- Modify: `spc.html:390-402` (`ROLE_PERMS`의 chief/manager/viewer에 `'stats'` 추가 — admin은 `P_ALL` 전체를 쓰므로 자동 포함)
- Modify: `spc.html:619-633` (`NAV`에 통계 대시보드 항목 추가)
- Modify: `spc.html:695-696` (`PAGES`에 `stats:renderStats` 추가)
- Modify: `spc.html` (Task 4의 `sparkline` 바로 다음에 `renderStats`/`renderStatsDetail`/`renderStatsTrend` 추가, `STATS_TAB` 상태 변수 추가)
- Modify: `spc.html:1758-1828` (`ACTS`에 `'stats-tab'` 핸들러 추가)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: `currentEvent()`,`eventSelector()`,`pageHead()`,`emptyState()`,`reportData()`,`receptionDuration()`,`crossEventStats()`,`arrivalDistChart()`,`sparkline()`,`fmtDuration()`,`fmtD()`,`esc()` — 전부 앞선 태스크/기존 코드에서 이미 정의됨
- Produces: `renderStats(): string` — `PAGES.stats`로 등록되어 기존 "전 역할 × 전 페이지 렌더" 테스트가 자동으로 커버함

- [ ] **Step 1: `P_ALL`/`ROLE_PERMS` 수정**

`spc.html:387-389`의 `P_ALL` 배열에 `'report'` 다음에 `'stats'`를 추가:

```js
const P_ALL=['dashboard','checkin','reception','guests','paste','events','order','scenario','report','stats','users',
  'checkin.do','checkin.undo','checkin.admin','reception.act','guest.edit','guest.deactivate',
  'event.edit','event.archive','event.delete','assign','order.edit','scenario.approve','export','privateNote','demoReset'];
```

`ROLE_PERMS`의 `chief`,`manager`,`viewer` 안에서 `'report'` 다음에 `'stats'`를 추가(3곳 모두):

```js
chief:new Set(['dashboard','checkin','reception','guests','paste','events','order','scenario','report','stats',
  'checkin.do','checkin.undo','checkin.admin','reception.act','guest.edit','guest.deactivate',
  'event.edit','event.archive','assign','order.edit','scenario.approve','export','privateNote']),
manager:new Set(['dashboard','checkin','reception','guests','paste','events','order','scenario','report','stats',
  'checkin.do','checkin.undo','reception.act','guest.edit','guest.deactivate',
  'event.edit','event.archive','assign','order.edit','scenario.approve','export','privateNote']),
desk:new Set(['dashboard','checkin','checkin.do','checkin.undo']),
greeter:new Set(['dashboard','reception','reception.act']),
mc:new Set(['scenario']),
viewer:new Set(['dashboard','report','stats']),
```

- [ ] **Step 2: `NAV`에 항목 추가**

`spc.html:630-632`:

```js
{sec:'보고 · 관리'},
{id:'report',perm:'report',label:'결과보고',icon:'M4 2h8v12H4zM6 5h4M6 8h4M6 11h2'},
{id:'stats',perm:'stats',label:'통계 대시보드',icon:'M2 13h2v-5H2zM6 13h2V4H6zM10 13h2V8h-2z'},
{id:'users',perm:'users',label:'사용자 · 권한',icon:'M8 8a3 3 0 100-6 3 3 0 000 6zM2 14c0-3 2.7-5 6-5s6 2 6 5'},
```

- [ ] **Step 3: `PAGES` 맵에 등록**

`spc.html:695-696`:

```js
const PAGES={dashboard:renderDash,checkin:renderCI,reception:renderReception,guests:renderGuests,
  paste:renderPaste,events:renderEvents,order:renderOrder,scenario:renderScenario,report:renderReport,stats:renderStats,users:renderUsers};
```

- [ ] **Step 4: `renderStats` 구현**

Task 4의 `sparkline` 함수 바로 다음, `let RPT_PRIVACY=true;` 근처에 `STATS_TAB` 상태 변수를 추가하고 3개 함수를 추가:

```js
let STATS_TAB='detail';
function renderStats(){
  const ev=currentEvent();
  const right=eventSelector();
  const tabBtn=(id,label)=>`<button class="btn btn-sm ${STATS_TAB===id?'btn-p':'btn-s'}" data-act="stats-tab" data-tab="${id}">${esc(label)}</button>`;
  const tabs=`<div style="display:flex;gap:8px;margin-bottom:16px">${tabBtn('detail','행사 상세')}${tabBtn('trend','행사간 추이')}</div>`;
  if(STATS_TAB==='trend')return pageHead('통계 대시보드','',right)+tabs+renderStatsTrend();
  if(!ev)return pageHead('통계 대시보드','',right)+tabs+emptyState('행사를 선택하세요');
  return pageHead('통계 대시보드',`${esc(ev.title)} · ${esc(fmtD(ev.date))}`,right)+tabs+renderStatsDetail(ev);
}
function renderStatsDetail(ev){
  const d=reportData(ev.id);const rd=receptionDuration(ev.id);
  const rate=d.active?Math.round(d.arrived/d.active*100):0;
  const stat=(n,l)=>`<div class="stat"><div class="stat-n">${n}</div><div class="stat-l">${esc(l)}</div></div>`;
  return`<div class="stats">${stat(`${rate}%`,'참석률(도착/참석확정)')}${stat(d.absent,'미도착·불참')}${stat(`${d.vvArr}/${d.vv}`,'VVIP 도착')}${stat(`${rd.count}/${d.vv}`,'VVIP 응대완료')}${stat(fmtDuration(rd.avg),'평균 응대시간')}${stat(fmtDuration(rd.max),'최대 응대시간')}</div>
    <div class="card"><div class="card-head"><h3>시간대별 도착 분포</h3></div><div class="card-body">${arrivalDistChart(d.buckets)}</div></div>`;
}
function renderStatsTrend(){
  const rows=crossEventStats();
  if(rows.length<2)return`<div class="card"><div class="card-body">${emptyState('추이를 보려면 완료된 행사가 2건 이상 필요합니다')}</div></div>`;
  const rates=rows.map(r=>r.rate);
  return`<div class="grid2">
    <div class="card"><div class="card-head"><h3>행사별 참석률 추이</h3></div><div class="card-body">${sparkline(rates,'#0B6E42')}
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--gray4);margin-top:4px">${rows.map(r=>`<span>${esc(r.ev.title)}</span>`).join('')}</div></div></div>
    <div class="card"><div class="card-head"><h3>행사별 VVIP 응대완료율</h3></div><div class="card-body">
      ${rows.map(r=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;color:var(--gray5);width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.ev.title)}</span>
        <div style="flex:1;background:var(--gray2);border-radius:4px;height:16px;overflow:hidden"><div style="height:100%;width:${r.vv?r.reception.count/r.vv*100:0}%;background:var(--green);border-radius:4px"></div></div>
        <span style="font-size:11px;color:var(--gray5);width:44px">${r.reception.count}/${r.vv}</span></div>`).join('')}
    </div></div>
  </div>`;
}
```

- [ ] **Step 5: `ACTS`에 탭 전환 액션 추가**

`spc.html:1758` `const ACTS={` 안에 아무 위치에나(예: `'user-toggle'` 항목 다음) 추가:

```js
'stats-tab':el=>{STATS_TAB=el.dataset.tab;rerender()},
```

- [ ] **Step 6: 테스트에 라우팅 반영 확인 추가**

`tests/run.js`의 `__API` 목록에 `renderStats` 추가는 필수는 아니다(`PAGES`를 통해 이미 "전 역할 × 전 페이지 렌더" 루프가 커버). 다만 트렌드 탭 안내 문구를 명시적으로 검증하기 위해 `[스파크라인]` 섹션 뒤에 추가:

```js
console.log('\n[통계 페이지]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
ok('행사 상세 탭 기본 렌더',typeof A.PAGES.stats()==='string');
```

(`STATS_TAB` 기본값이 `'detail'`이므로 이 호출은 상세 탭을 렌더한다. 트렌드 탭 전환은 클릭 핸들러(`ACTS['stats-tab']`)를 통해서만 바뀌므로 이 테스트 하니스에서는 별도 setter 없이도 기본 경로만 검증하면 충분하다.)

- [ ] **Step 7: 전체 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 마지막 줄이 `═══ 결과: N 통과 / 0 실패 ═══` (기존 11 + Task1~5에서 추가한 항목 전부). "전 역할 × 전 페이지 렌더" 항목도 여전히 통과해야 한다(= `renderStats`가 `admin/chief/manager/viewer` 역할에서 에러 없이 문자열을 반환).

- [ ] **Step 8: 브라우저에서 육안 확인**

Run: 로컬에서 `spc.html`을 브라우저로 열거나 Claude_Browser로 `file:///` 경로를 연다.
Expected:
1. 의전 총괄로 로그인 → 좌측 "보고 · 관리" 섹션에 "통계 대시보드" 메뉴가 보인다.
2. 클릭 시 "행사 상세" 탭이 기본 선택되고 스탯카드 6개 + 도착 분포 막대그래프가 보인다.
3. "행사간 추이" 탭 클릭 시(시드 데이터는 행사가 1건뿐이므로) "추이를 보려면 완료된 행사가 2건 이상 필요합니다" 안내가 보인다.
4. 현장 접수자(desk)·영접 담당자(greeter)·사회자(mc) 역할로 로그인하면 "통계 대시보드" 메뉴 자체가 보이지 않는다(권한 미부여 확인).

- [ ] **Step 9: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 통계 대시보드 페이지(행사 상세/행사간 추이) 추가"
```

---

## Self-Review Checklist (계획 작성자가 완료 후 확인)
- [x] 스펙의 "행사 상세 탭" → Task 5 `renderStatsDetail`에서 구현
- [x] 스펙의 "행사간 추이 탭" → Task 5 `renderStatsTrend`에서 구현, 2건 미만 안내 포함
- [x] 스펙의 "VVIP 응대시간" → Task 2 `receptionDuration`
- [x] 스펙의 "권한: report와 동일" → Task 5 `P_ALL`/`ROLE_PERMS`에서 report 대상과 동일하게 부여
- [x] 스펙의 "SVG 직접 그리기, CDN 없음" → Task 4 `sparkline`은 순수 SVG 문자열 생성, 외부 스크립트 없음
- [x] 스펙의 "테스트 추가" → 각 태스크마다 `tests/run.js`에 TDD 사이클로 반영
