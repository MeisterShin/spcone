# 좌석배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spc.html`에 행사별 가로×세로 좌석 그리드, 복도(행/열) 지정, 의전서열 기반 자동 추천배치, 드래그앤드롭 수동 재배치를 지원하는 "좌석배치" 페이지를 추가한다.

**Architecture:** 순수 계산 함수 3개(`seatPriorityCoords`, `autoAssignSeats`, `swapSeats`/`moveSeatTo`) → 행사 생성/수정 모달에 그리드 크기 입력 필드 추가 → 신규 페이지 `renderSeating()`(그리드 렌더링 + 복도 토글) → 의전순서 페이지가 이미 쓰는 네이티브 HTML5 드래그앤드롭 패턴을 그대로 재사용하는 `initSeatDnD()`. 전부 `spc.html`의 인라인 `<script>`/`<style>` 안에서 추가/수정하는 작업이며 별도 파일은 만들지 않는다(기존 단일 파일 아키텍처 유지).

**Tech Stack:** 순수 JS(ES2019), 네이티브 HTML5 Drag and Drop API(기존 `initOrderDnD`와 동일 패턴, 신규 라이브러리 없음), 기존 CSS 토큰·아바타 색상 클래스(`.av`,`.av26`,`.av-vv`,`.av-vip`,`.av-g`) 재사용.

## Global Constraints
- 사용자 입력을 `innerHTML`에 넣을 때는 반드시 `esc()`로 이스케이프 (CLAUDE.md 코딩 규칙 1)
- 인라인 `onclick` 금지, 클릭 액션은 전부 `data-act` + `ACTS` 위임 사용 (CLAUDE.md 코딩 규칙 5)
- 중요한 변경은 `audit()`로 기록 (CLAUDE.md 코딩 규칙 4)
- 기능 수정 후 `node tests/run.js` 통과 필수, 새 핵심 로직엔 테스트 추가 (CLAUDE.md 코딩 규칙 7)
- 새 Firestore 컬렉션 추가 없음 — `events`/`eventGuests`에 필드만 추가
- 복도는 행/열 단위로만 지정(칸 단위 지정 없음) — 스펙에서 확정된 범위
- 그리드 가로·세로 칸수는 행사 생성/수정 모달에서 입력, 좌석배치 화면에서는 표시만 함(재입력 UI 없음) — 사용자가 명시적으로 확인한 사항
- 무대는 항상 그리드 상단(0행 쪽)에 고정 표시 — 사용자가 명시적으로 요청한 사항

---

### Task 1: 좌석 배치 순수 함수 (seatPriorityCoords/autoAssignSeats/swapSeats/moveSeatTo)

**Files:**
- Modify: `spc.html` (`computeOrder` 함수 — 현재 1292~1300행 — 바로 다음에 추가)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: 기존 `computeOrder(evId)`(의전서열 정렬), `byId`, `save`, `audit`
- Produces:
  - `seatPriorityCoords(cols, rows, aisleRows, aisleCols): Array<{row:number,col:number}>` — 무대(0행)에서 가까운 줄부터, 각 줄 안에서는 중앙 열→바깥쪽 순으로 정렬된 좌표 배열. `aisleRows`/`aisleCols`에 포함된 행/열은 제외.
  - `autoAssignSeats(evId): {placed:number, overflow:number}` — `computeOrder(evId)` 순서대로 `seatPriorityCoords(...)` 좌표에 `eg.seat={row,col}`를 채움. 좌석보다 인원이 많으면 넘치는 인원은 `eg.seat=null`.
  - `swapSeats(evId, egIdA, egIdB): void` — 두 `eventGuests`의 `seat`를 서로 교환.
  - `moveSeatTo(egId, row, col): void` — 해당 내빈의 `seat`를 지정 좌표로 설정(빈 좌석으로 이동할 때 사용).

- [ ] **Step 1: 테스트 추가 (실패 상태)**

`tests/run.js`의 `globalThis.__API={...}` 목록(33행)에 `seatPriorityCoords,autoAssignSeats,swapSeats,moveSeatTo`를 추가한다.

`[로그인 화면]` 섹션 뒤, `// ── 클라우드 경로 ──` 주석 이전에 추가:

```js
console.log('\n[좌석배치 로직]');
const coords=A.seatPriorityCoords(4,3,[1],[]);
ok('복도 행 제외',coords.every(c=>c.row!==1));
ok('무대(0행)부터 채움',coords[0].row===0);
ok('중앙 열 우선(0행 첫 좌표는 열 1 또는 2, 4칸 중앙 근접)',coords[0].col===1||coords[0].col===2);
ok('전체 칸수 = (3-1)행 × 4열',coords.length===8);

A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const seatEvId=A.S.events[0].id;
const seatEv=A.byId(A.S.events,seatEvId);
seatEv.seatConfig={cols:3,rows:2,aisleRows:[],aisleCols:[]};
const before=A.S.eventGuests.filter(e=>e.eventId===seatEvId&&e.arrivalStatus!=='cancelled').length;
const result=A.autoAssignSeats(seatEvId);
ok('배치+초과 인원 합이 전체 인원과 일치(좌석 6개)',result.placed<=6&&result.placed+result.overflow===before);
const seated=A.S.eventGuests.filter(e=>e.eventId===seatEvId&&e.seat);
ok('배치된 인원만큼 seat 필드 채워짐',seated.length===result.placed);
ok('좌표 중복 없음',new Set(seated.map(e=>`${e.seat.row}_${e.seat.col}`)).size===seated.length);

const twoSeated=seated.slice(0,2);
if(twoSeated.length===2){
  const seatA=twoSeated[0].seat,seatB=twoSeated[1].seat;
  A.swapSeats(seatEvId,twoSeated[0].id,twoSeated[1].id);
  ok('swapSeats로 좌석 교환',twoSeated[0].seat.row===seatB.row&&twoSeated[0].seat.col===seatB.col&&twoSeated[1].seat.row===seatA.row&&twoSeated[1].seat.col===seatA.col);
}
const unseated=A.S.eventGuests.find(e=>e.eventId===seatEvId&&!e.seat);
if(unseated){
  A.moveSeatTo(unseated.id,0,0);
  ok('moveSeatTo로 빈 좌석에 배치',unseated.seat&&unseated.seat.row===0&&unseated.seat.col===0);
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.seatPriorityCoords is not a function` 형태의 에러로 실패

- [ ] **Step 3: 구현 추가**

`spc.html`의 `computeOrder` 함수(현재 1292~1300행) 바로 다음에 추가:

```js
function seatPriorityCoords(cols,rows,aisleRows,aisleCols){
  const ar=new Set(aisleRows||[]),ac=new Set(aisleCols||[]);
  const centerCol=(cols-1)/2;
  const coords=[];
  for(let r=0;r<rows;r++){
    if(ar.has(r))continue;
    const colsOrder=Array.from({length:cols},(_,c)=>c).filter(c=>!ac.has(c))
      .sort((a,b)=>Math.abs(a-centerCol)-Math.abs(b-centerCol)||a-b);
    colsOrder.forEach(c=>coords.push({row:r,col:c}));
  }
  return coords;
}
function autoAssignSeats(evId){
  const ev=byId(S.events,evId);if(!ev||!ev.seatConfig)return{placed:0,overflow:0};
  const{cols,rows,aisleRows=[],aisleCols=[]}=ev.seatConfig;
  const coords=seatPriorityCoords(cols,rows,aisleRows,aisleCols);
  const order=computeOrder(evId).map(o=>o.eg);
  order.forEach((eg,i)=>{eg.seat=i<coords.length?{...coords[i]}:null});
  save(['eventGuests']);
  const placed=Math.min(order.length,coords.length);
  audit('event',evId,'seat_auto_assign',null,{placed,total:order.length},evId);
  return{placed,overflow:Math.max(0,order.length-coords.length)};
}
function swapSeats(evId,egIdA,egIdB){
  const a=byId(S.eventGuests,egIdA),b=byId(S.eventGuests,egIdB);
  if(!a||!b)return;
  const tmp=a.seat;a.seat=b.seat;b.seat=tmp;
  save(['eventGuests']);
  audit('eventGuest',a.id,'seat_swap',null,{with:b.id},evId);
}
function moveSeatTo(egId,row,col){
  const eg=byId(S.eventGuests,egId);if(!eg)return;
  eg.seat={row,col};
  save(['eventGuests']);
  audit('eventGuest',eg.id,'seat_move',null,{row,col},eg.eventId);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 모두 `✓`, 마지막 줄 `═══ 결과: N 통과 / 0 실패 ═══`(기존 40 + 신규 항목수)

- [ ] **Step 5: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 좌석배치 순수 함수 seatPriorityCoords/autoAssignSeats/swapSeats/moveSeatTo 추가"
```

---

### Task 2: 행사 생성/수정 모달에 좌석 그리드 크기 입력 + 시드 행사 기본값

**Files:**
- Modify: `spc.html` — `openEventModal`/`saveEvent` 함수(`function openEventModal(id){`를 검색해 위치 확인, 이전 태스크들로 정확한 줄 번호가 밀렸을 수 있음)
- Modify: `spc.html` — `seedIfEmpty()` 안의 시드 행사 객체(`S.events=[{id:evId,title:'2026 새롬시 스마트도시 국제포럼'...`를 검색)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: Task 1의 `seatPriorityCoords`(간접적으로, 데모 시드 값 결정에만 참고)
- Produces: `events[].seatConfig:{cols:number,rows:number,aisleRows:number[],aisleCols:number[]}` — Task 3(`renderSeating`)이 이 필드를 읽음

- [ ] **Step 1: `openEventModal`에 입력 필드 추가**

`spc.html`에서 `function openEventModal(id){`로 시작하는 함수를 찾아, `body` 템플릿 리터럴의 마지막 줄(`${f('개인정보 보유기한','e-ret',ev?.retentionUntil,'date')}`) 바로 다음, `</div>\`;` 앞에 아래 두 줄을 추가:

```js
    <div class="fl"><label>좌석 가로 칸수</label><input class="inp" type="number" id="e-cols" value="${ev?.seatConfig?.cols||10}" min="1"></div>
    <div class="fl"><label>좌석 세로 칸수</label><input class="inp" type="number" id="e-rows" value="${ev?.seatConfig?.rows||8}" min="1"></div>
```

- [ ] **Step 2: `saveEvent`에서 `seatConfig` 저장**

`function saveEvent(){`로 시작하는 함수를 아래 전체로 교체:

```js
function saveEvent(){
  const title=$('e-title').value.trim();const date=$('e-date').value;
  if(!title||!date){toast('행사명과 일자는 필수입니다','err');return}
  const cols=clamp(parseInt($('e-cols').value)||10,1,40);
  const rows=clamp(parseInt($('e-rows').value)||8,1,40);
  const d={title,type:$('e-type').value,date,startTime:$('e-start').value,endTime:$('e-end').value,
    loc:$('e-loc').value.trim(),hostDept:$('e-host').value.trim(),desc:$('e-desc').value.trim(),retentionUntil:$('e-ret').value,updatedAt:now()};
  const id=EG_EDIT;
  if(id&&id!=='new-event'){
    const ev=byId(S.events,id);Object.assign(ev,d);
    ev.seatConfig={cols,rows,aisleRows:ev.seatConfig?.aisleRows||[],aisleCols:ev.seatConfig?.aisleCols||[]};
    ev.version=(ev.version||1)+1;audit('event',id,'update',null,d,id)
  }else{
    const nid=uid('e');
    S.events.push({id:nid,...d,seatConfig:{cols,rows,aisleRows:[],aisleCols:[]},managerIds:[CUR.id],status:'confirmed',createdBy:CUR.id,createdAt:now(),version:1});
    SEL=nid;audit('event',nid,'create',null,{title},nid)
  }
  save(['events']);closeModal();toast('행사 저장 완료','ok');rerender();
}
```

(변경 요약: `cols`/`rows` 입력값 파싱 + `seatConfig` 설정 두 곳 추가, 나머지 로직은 기존과 동일)

- [ ] **Step 3: 시드 행사에 기본 좌석 설정 추가(데모 즉시 시연 가능하도록)**

`seedIfEmpty()` 안에서 `S.events=[{id:evId,title:'2026 새롬시 스마트도시 국제포럼'...`로 시작하는 객체 리터럴을 찾아, `desc:'스마트도시 정책 방향 공유 및 공동선언',retentionUntil:''` 다음에 아래 필드를 추가(콤마로 연결):

```js
    ,seatConfig:{cols:10,rows:8,aisleRows:[3],aisleCols:[5]}
```

(행 3, 열 5를 기본 복도로 설정 — 10×8 그리드를 좌우 블록으로 나누고 중간에 가로 통로를 하나 두는 전형적인 배치)

- [ ] **Step 4: 테스트 추가**

`tests/run.js`의 `[좌석배치 로직]` 섹션에서 이미 `const seatEv=A.byId(A.S.events,seatEvId);seatEv.seatConfig=...`로 직접 덮어써서 테스트하므로, 시드 값이 있어도 테스트에 영향 없음(시드 행사 이후에 새 값으로 재설정하기 때문). 다만 시드 값 자체가 존재하는지 별도로 확인하는 테스트를 `[좌석배치 로직]` 섹션 맨 앞(`const coords=...` 이전)에 추가:

```js
ok('시드 행사에 기본 seatConfig 존재',A.S.events[0].seatConfig&&A.S.events[0].seatConfig.cols===10&&A.S.events[0].seatConfig.rows===8);
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 통과, "전 역할 × 전 페이지 렌더" 항목도 여전히 통과(이 태스크는 렌더 함수를 바꾸지 않으므로 회귀 없어야 함)

- [ ] **Step 6: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 행사 생성·수정 모달에 좌석 그리드 크기 입력 추가, 시드 행사 기본 seatConfig 반영"
```

---

### Task 3: 좌석배치 페이지 렌더 (그리드·복도 토글·무대 표시) + 라우팅/권한/네비 배선

**Files:**
- Modify: `spc.html:399-401` (`P_ALL`에 `'seating'`,`'seating.edit'` 추가)
- Modify: `spc.html:402-414` (`ROLE_PERMS`의 admin은 `P_ALL` 전체로 자동 포함, chief/manager에 `'seating'`,`'seating.edit'` 추가)
- Modify: `spc.html:673-687` (`NAV`에 좌석배치 항목 추가)
- Modify: `spc.html:750-751` (`PAGES`에 `seating:renderSeating` 추가)
- Modify: `spc.html` (CSS `<style>` 블록에 좌석 그리드 스타일 추가 — `.ord-card` 정의 근처, 288~290행 부근에 이어서)
- Modify: `spc.html` (`renderSeating()` 함수 추가, Task 1의 `moveSeatTo` 함수 바로 다음)
- Modify: `spc.html` (`ACTS`에 `seat-toggle-row`,`seat-toggle-col`,`seat-auto` 추가)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: Task 1의 `seatPriorityCoords`,`autoAssignSeats`; Task 2의 `ev.seatConfig`; 기존 `egOf`,`guestOf`,`dispName`,`avCls`,`currentEvent`,`eventSelector`,`pageHead`,`emptyState`,`can`,`toast`,`rerender`
- Produces: `renderSeating(): string` — `PAGES.seating`으로 등록되어 "전 역할 × 전 페이지 렌더" 테스트가 자동 커버

- [ ] **Step 1: `P_ALL`/`ROLE_PERMS` 수정**

`spc.html:399-401`의 `P_ALL` 배열에서 `'order'` 다음에 `'seating'`을, `'order.edit'` 다음에 `'seating.edit'`을 추가:

```js
const P_ALL=['dashboard','checkin','reception','guests','paste','events','order','seating','scenario','report','stats','users',
  'checkin.do','checkin.undo','checkin.admin','reception.act','guest.edit','guest.deactivate',
  'event.edit','event.archive','event.delete','assign','order.edit','seating.edit','scenario.approve','export','privateNote','demoReset'];
```

`ROLE_PERMS`의 `chief`,`manager` 안에서 `'order'` 다음에 `'seating'`을, `'order.edit'` 다음에 `'seating.edit'`을 추가(전체 블록 교체):

```js
const ROLE_PERMS={
  admin:new Set(P_ALL),
  chief:new Set(['dashboard','checkin','reception','guests','paste','events','order','seating','scenario','report','stats',
    'checkin.do','checkin.undo','checkin.admin','reception.act','guest.edit','guest.deactivate',
    'event.edit','event.archive','assign','order.edit','seating.edit','scenario.approve','export','privateNote']),
  manager:new Set(['dashboard','checkin','reception','guests','paste','events','order','seating','scenario','report','stats',
    'checkin.do','checkin.undo','reception.act','guest.edit','guest.deactivate',
    'event.edit','event.archive','assign','order.edit','seating.edit','scenario.approve','export','privateNote']),
  desk:new Set(['dashboard','checkin','checkin.do','checkin.undo']),
  greeter:new Set(['dashboard','reception','reception.act']),
  mc:new Set(['scenario']),
  viewer:new Set(['dashboard','report','stats']),
};
```

- [ ] **Step 2: `NAV`에 항목 추가**

`spc.html:673-687`의 `NAV` 배열에서 `{id:'order',...}` 다음 줄에 추가:

```js
  {id:'seating',perm:'seating',label:'좌석배치',icon:'M2 12h12M4 8h2v4H4zM7 8h2v4H7zM10 8h2v4h-2z'},
```

- [ ] **Step 3: `PAGES` 맵에 등록**

`spc.html:750-751`을 아래로 교체:

```js
const PAGES={dashboard:renderDash,checkin:renderCI,reception:renderReception,guests:renderGuests,
  paste:renderPaste,events:renderEvents,order:renderOrder,seating:renderSeating,scenario:renderScenario,report:renderReport,stats:renderStats,users:renderUsers};
```

- [ ] **Step 4: CSS 추가**

`spc.html`에서 `.ord-card.over{border-color:var(--green);box-shadow:var(--shadow)}`(290행 부근) 바로 다음에 추가:

```css
.seat-stage{text-align:center;background:var(--green);color:#fff;font-weight:800;font-size:12px;letter-spacing:.05em;padding:8px;border-radius:var(--rs);margin-bottom:12px}
.seat-wrap{overflow-x:auto;padding:4px 0}
.seat-hdrs{display:flex;gap:4px;margin-bottom:4px;margin-left:24px}
.seat-hdr-col{width:28px;height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--gray4);cursor:pointer;border:none;border-radius:4px;background:transparent}
.seat-hdr-col.aisle-on{background:var(--amber-l);color:var(--amber)}
.seat-row{display:flex;gap:4px;margin-bottom:4px}
.seat-hdr-row{width:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--gray4);cursor:pointer;border:none;border-radius:4px;background:transparent;margin-right:0}
.seat-hdr-row.aisle-on{background:var(--amber-l);color:var(--amber)}
.seat-cell{width:28px;height:28px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800}
.seat-empty{background:var(--gray1);border:1px dashed var(--gray3)}
.seat-aisle{background:transparent}
.seat-occ{cursor:grab}
.seat-occ.dragging{opacity:.4}
.seat-cell.over{outline:2px solid var(--green);outline-offset:1px}
```

- [ ] **Step 5: `renderSeating` 함수 추가**

Task 1의 `moveSeatTo` 함수 바로 다음에 추가:

```js
function renderSeating(){
  const ev=currentEvent();
  const right=`${eventSelector()}${can('seating.edit')?'<button class="btn btn-s btn-sm" data-act="seat-auto">추천배치 적용</button>':''}`;
  if(!ev)return pageHead('좌석배치','',right)+emptyState('행사를 선택하세요');
  if(!ev.seatConfig||!ev.seatConfig.cols||!ev.seatConfig.rows)
    return pageHead('좌석배치',esc(ev.title),right)+emptyState('행사 수정에서 가로·세로 칸수를 먼저 설정하세요');
  const{cols,rows,aisleRows=[],aisleCols=[]}=ev.seatConfig;
  const ar=new Set(aisleRows),ac=new Set(aisleCols);
  const egs=egOf(ev.id);
  const byPos={};egs.forEach(eg=>{if(eg.seat)byPos[`${eg.seat.row}_${eg.seat.col}`]=eg});
  const capacity=seatPriorityCoords(cols,rows,aisleRows,aisleCols).length;
  const overflow=Math.max(0,egs.length-capacity);
  const canEdit=can('seating.edit');
  const colHdrs=`<div class="seat-hdrs"><div class="seat-hdr-row"></div>${Array.from({length:cols},(_,c)=>
    `<button class="seat-hdr-col ${ac.has(c)?'aisle-on':''}" data-act="seat-toggle-col" data-i="${c}" ${canEdit?'':'disabled'}>${c+1}</button>`).join('')}</div>`;
  const bodyRows=Array.from({length:rows},(_,r)=>{
    const cells=Array.from({length:cols},(_,c)=>{
      if(ar.has(r)||ac.has(c))return'<div class="seat-cell seat-aisle"></div>';
      const eg=byPos[`${r}_${c}`];
      if(eg){const g=guestOf(eg);
        return`<div class="seat-cell seat-occ av ${avCls(eg.protocolLevel)}" draggable="${canEdit}" data-eg="${eg.id}" data-row="${r}" data-col="${c}" title="${esc(dispName(eg))} · ${esc(g.org||'')}">${esc(dispName(eg)[0]||'?')}</div>`;
      }
      return`<div class="seat-cell seat-empty" data-row="${r}" data-col="${c}"></div>`;
    }).join('');
    return`<div class="seat-row"><button class="seat-hdr-row ${ar.has(r)?'aisle-on':''}" data-act="seat-toggle-row" data-i="${r}" ${canEdit?'':'disabled'}>${r+1}</button>${cells}</div>`;
  }).join('');
  return pageHead('좌석배치',`${esc(ev.title)} · ${egs.length}명${overflow?` · 배치 안 됨 ${overflow}명`:''}`,right)
    +`<div class="card"><div class="card-body">
      <div class="seat-stage">무대</div>
      <div class="seat-wrap">${colHdrs}${bodyRows}</div>
    </div></div>`;
}
```

- [ ] **Step 6: `ACTS`에 토글/자동배치 액션 추가**

`spc.html`의 `const ACTS={` 블록 안에 `'ord-auto':()=>autoRecommend(),` 항목 다음에 추가:

```js
'seat-toggle-row':el=>{if(!can('seating.edit'))return;const ev=currentEvent();if(!ev||!ev.seatConfig)return;
  const i=+el.dataset.i;const idx=ev.seatConfig.aisleRows.indexOf(i);
  if(idx===-1)ev.seatConfig.aisleRows.push(i);else ev.seatConfig.aisleRows.splice(idx,1);
  save(['events']);rerender()},
'seat-toggle-col':el=>{if(!can('seating.edit'))return;const ev=currentEvent();if(!ev||!ev.seatConfig)return;
  const i=+el.dataset.i;const idx=ev.seatConfig.aisleCols.indexOf(i);
  if(idx===-1)ev.seatConfig.aisleCols.push(i);else ev.seatConfig.aisleCols.splice(idx,1);
  save(['events']);rerender()},
'seat-auto':()=>{const ev=currentEvent();if(!ev)return;const r=autoAssignSeats(ev.id);
  toast(`추천배치 적용 완료${r.overflow?` · 배치 안 됨 ${r.overflow}명`:''}`,'ok');rerender()},
```

- [ ] **Step 7: 테스트 추가**

`tests/run.js`의 `__API` 목록에 `renderSeating`을 추가하고, `[좌석배치 로직]` 섹션 뒤에 추가:

```js
console.log('\n[좌석배치 페이지]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const seatHtml=A.renderSeating();
ok('무대 표시 포함',seatHtml.includes('무대'));
ok('복도로 지정한 열은 좌석 칸이 아님(seat-aisle 클래스 존재)',seatHtml.includes('seat-aisle'));
```

- [ ] **Step 8: 전체 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 통과, "전 역할 × 전 페이지 렌더" 항목도 여전히 통과(= `renderSeating`이 `admin/chief/manager` 역할에서 에러 없이 문자열 반환)

- [ ] **Step 9: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 좌석배치 페이지(그리드·복도 토글·무대 표시) 추가"
```

---

### Task 4: 드래그앤드롭 수동 재배치 배선

**Files:**
- Modify: `spc.html` (`let dragEg=null;` 다음에 `let dragSeatEg=null;` 추가)
- Modify: `spc.html` (`initSeatDnD()` 함수 추가, `initOrderDnD()` 함수 바로 다음)
- Modify: `spc.html` (`rerender()` 함수 — `if(VIEW==='order')initOrderDnD();` 다음 줄에 좌석배치 초기화 호출 추가)
- Test: `tests/run.js` (DOM 상호작용이라 이 태스크는 별도 자동테스트보다 육안 확인 위주 — 아래 Step 3 참고)

**Interfaces:**
- Consumes: Task 1의 `swapSeats`,`moveSeatTo`; 기존 `currentEventId()`
- Produces: 없음(터미널 UI 배선 — 다른 태스크가 의존하지 않음)

- [ ] **Step 1: `dragSeatEg` 상태 변수 추가**

`spc.html`에서 `let dragEg=null;`를 찾아 바로 다음 줄에 추가:

```js
let dragSeatEg=null;
```

- [ ] **Step 2: `initSeatDnD` 함수 추가**

`function initOrderDnD(){...}` 함수(중괄호로 끝나는 지점) 바로 다음에 추가:

```js
function initSeatDnD(){
  document.querySelectorAll('.seat-cell[data-row]').forEach(cell=>{
    if(cell.classList.contains('seat-occ')){
      cell.addEventListener('dragstart',()=>{dragSeatEg=cell.dataset.eg;cell.classList.add('dragging')});
      cell.addEventListener('dragend',()=>{cell.classList.remove('dragging');document.querySelectorAll('.seat-cell').forEach(c=>c.classList.remove('over'))});
    }
    cell.addEventListener('dragover',e=>{e.preventDefault();cell.classList.add('over')});
    cell.addEventListener('dragleave',()=>cell.classList.remove('over'));
    cell.addEventListener('drop',e=>{e.preventDefault();if(!dragSeatEg)return;
      const targetEg=cell.dataset.eg;
      if(targetEg&&targetEg!==dragSeatEg)swapSeats(currentEventId(),dragSeatEg,targetEg);
      else if(!targetEg)moveSeatTo(dragSeatEg,+cell.dataset.row,+cell.dataset.col);
      dragSeatEg=null;rerender()});
  });
}
```

- [ ] **Step 3: `rerender()`에서 초기화 호출**

`spc.html`의 `rerender()` 함수에서 `if(VIEW==='order')initOrderDnD();` 줄을 찾아 바로 다음 줄에 추가:

```js
  if(VIEW==='seating')initSeatDnD();
```

- [ ] **Step 4: 전체 테스트 실행 → 회귀 없음 확인**

Run: `node tests/run.js`
Expected: 기존 통과 수와 동일(이 태스크는 테스트 하니스가 다루지 않는 실제 브라우저 드래그 이벤트 배선이라 새 자동 테스트를 추가하지 않음 — 대신 Step 5에서 육안 확인).

- [ ] **Step 5: 브라우저에서 육안 확인**

Run: 로컬에서 `spc.html`을 브라우저로 열거나 Claude_Browser로 `file:///` 경로를 연다.
Expected:
1. 의전 총괄로 로그인 → 좌측 "준비 · 편집" 섹션에 "좌석배치" 메뉴가 보인다.
2. 클릭 시 10×8 그리드, 상단에 초록색 "무대" 배너, 3행과 5열이 복도(빈 회색 띠)로 표시된다.
3. "추천배치 적용" 클릭 시 의전서열 순서대로(무대에서 가까운 줄·중앙 열부터) 내빈 아바타가 채워진다.
4. 배치된 좌석 하나를 다른 좌석으로 드래그하면 서로 자리가 바뀐다(또는 빈 칸이면 그 칸으로 이동).
5. 열 번호(1~10)나 행 번호(1~8) 버튼을 클릭하면 해당 행/열이 복도로 토글되고 그리드가 즉시 갱신된다.
6. 현장 접수자(desk)·영접 담당자(greeter)·사회자(mc)·상황실 조회자(viewer) 역할로 로그인하면 "좌석배치" 메뉴 자체가 보이지 않는다(권한 미부여 확인).

- [ ] **Step 6: 커밋**

```bash
git add spc.html
git commit -m "feat: 좌석배치 드래그앤드롭 수동 재배치 배선"
```

---

## Self-Review Checklist
- [x] 스펙의 "가로×세로 그리드" → Task 2(모달 입력) + Task 3(렌더링)
- [x] 스펙의 "복도 구역 지정(행/열 단위)" → Task 3 토글 UI + `seatPriorityCoords`의 제외 로직(Task 1)
- [x] 스펙의 "의전서열 기반 추천배치" → Task 1 `autoAssignSeats`가 기존 `computeOrder` 재사용
- [x] 스펙의 "임의 변경배치" → Task 4 드래그앤드롭(`swapSeats`/`moveSeatTo`)
- [x] 스펙의 "행사 생성 시 정해두고 바꿀 수 있게" → Task 2(생성·수정 모달 공통 입력)
- [x] 스펙의 "무대 위치 항상 표기" → Task 3 `.seat-stage` 고정 배너
- [x] 스펙의 "좌석 부족 시 안내" → Task 3 `overflow` 계산 및 pageHead 서브타이틀 표시
- [x] 스펙의 "그리드 미설정 행사 안내" → Task 3 `renderSeating`의 조기 반환 분기
- [x] 스펙의 "테스트 추가" → Task 1~3에 TDD/렌더 테스트 반영(Task 4는 DOM 이벤트라 육안 확인으로 대체, 계획에 명시)
