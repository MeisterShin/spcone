# 동선(게이트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spc.html`에 행사별 동선 게이트(예: 주차장 입장·건물 입장·행사장 입장)를 등록하고, 현장 체크인 화면에서 게이트별로 통과를 개별 기록하며, 게이트 배열의 마지막 항목을 통과하는 순간 기존 체크인(`doCheckin`)이 그대로 실행되도록 만든다.

**Architecture:** 순수 배열 조작 함수(`addGate`/`removeGate`/`sanitizeGates`, 수행원 관리 때의 패턴을 그대로 복제) → 행사 생성/수정 모달에 게이트 입력 UI 추가 → 체크인 통합 함수 `toggleGatePass`(기존 `doCheckin`/오프라인 큐를 호출·재사용, 새 상태머신 없음) → `현장 체크인` 페이지 카드 렌더링을 게이트 유무에 따라 분기. 게이트가 없는 행사는 기존 코드 경로를 그대로 타므로 회귀 위험이 없다.

**Tech Stack:** 순수 JS(ES2019), 기존 `S.queue`/`flushQueue` 오프라인 메커니즘 재사용, 신규 라이브러리 없음.

## Global Constraints
- 사용자 입력을 `innerHTML`에 넣을 때는 반드시 `esc()`로 이스케이프 (CLAUDE.md 코딩 규칙 1)
- 기존 체크인·도착 기록을 삭제하는 코드 금지 — 게이트 취소(`gate_undo`)는 `gatesPassed`에서 제거만 하고, 도착 취소(`undoCheckin`)는 `gatesPassed`를 건드리지 않음 (CLAUDE.md 코딩 규칙 2, 스펙의 에러 처리 절)
- 인라인 `onclick` 금지, 클릭 액션은 전부 `data-act` + `ACTS` 위임 사용 (CLAUDE.md 코딩 규칙 5)
- 중요한 변경은 `audit()`로 기록 (CLAUDE.md 코딩 규칙 4)
- 기능 수정 후 `node tests/run.js` 통과 필수, 새 핵심 로직엔 테스트 추가 (CLAUDE.md 코딩 규칙 7)
- 새 Firestore 컬렉션 추가 없음 — `events`/`eventGuests`에 필드만 추가
- **게이트는 필수 순차 관문이 아님** — 순서 상관없이 개별 토글 가능(사용자가 명시적으로 확인한 사항)
- **`events.gates` 배열의 마지막 항목 = 최종 체크인과 동일** — 그 게이트를 누르는 즉시 기존 `doCheckin(egId)`를 그대로 호출(로직 복제 금지, 사용자가 명시적으로 확인한 사항)
- 게이트가 설정되지 않은 행사(빈 배열)는 현재 동작과 100% 동일해야 함(회귀 없음이 최우선)
- 영접 관리·대시보드·통계·결과보고 화면에는 게이트 상세를 노출하지 않음(범위 밖)

---

### Task 1: 게이트 배열 조작 순수 함수 (addGate/removeGate/sanitizeGates)

**Files:**
- Modify: `spc.html` — `// ── 29. 행사 모달 ──` 주석(현재 1808행) 바로 다음, `function openEventModal(id){` 앞에 추가
- Test: `tests/run.js`

**Interfaces:**
- Produces: `addGate(list:Array<{id,name}>): Array<{id,name}>` — `{id:uid('gt'),name:''}` 항목을 추가한 **새 배열** 반환(원본 불변)
- Produces: `removeGate(list, idx:number): Array<{id,name}>` — 해당 인덱스를 제거한 **새 배열** 반환(원본 불변)
- Produces: `sanitizeGates(list): Array<{id,name}>` — 이름이 빈(trim 후 빈 문자열) 항목은 제외, 나머지는 이름을 trim한 새 배열 반환
- Consumes: 없음 (순수 함수, `uid()`만 사용)

- [ ] **Step 1: 테스트 추가 (실패 상태)**

`tests/run.js`의 `globalThis.__API={...}` 목록(33행)에 `addGate,removeGate,sanitizeGates`를 추가한다.

가장 마지막 태스크 섹션(`[좌석배치 페이지]` 다음, `// ── 클라우드 경로 ──` 주석 이전)에 추가:

```js
console.log('\n[게이트 배열 로직]');
const gl0=[];
const gl1=A.addGate(gl0);
ok('addGate는 원본을 바꾸지 않음',gl0.length===0&&gl1.length===1);
ok('addGate 결과는 빈 이름',gl1[0].name==='');
const gl2=A.addGate(gl1);
const gl3=A.removeGate(gl2,0);
ok('removeGate는 원본을 바꾸지 않음',gl2.length===2&&gl3.length===1);
const dirtyGates=[{id:'g1',name:'  주차장 입장  '},{id:'g2',name:'   '},{id:'g3',name:'행사장 입장'}];
const cleanGates=A.sanitizeGates(dirtyGates);
ok('빈 이름 게이트 제외',cleanGates.length===2);
ok('trim 처리됨',cleanGates[0].name==='주차장 입장');
ok('원본 배열 불변',dirtyGates.length===3&&dirtyGates[0].name==='  주차장 입장  ');
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.addGate is not a function` 형태의 에러로 실패

- [ ] **Step 3: 구현 추가**

`spc.html`에서 `// ── 29. 행사 모달 ──` 주석 바로 다음, `function openEventModal(id){` 앞에 추가:

```js
function addGate(list){return[...list,{id:uid('gt'),name:''}]}
function removeGate(list,idx){return list.filter((_,i)=>i!==idx)}
function sanitizeGates(list){return list.map(g=>({id:g.id,name:(g.name||'').trim()})).filter(g=>g.name)}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 6개 항목 모두 `✓`, 마지막 줄 `═══ 결과: N 통과 / 0 실패 ═══`(기존 53 + 6 = 59)

- [ ] **Step 5: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 게이트 목록 조작 순수 함수 addGate/removeGate/sanitizeGates 추가"
```

---

### Task 2: 행사 모달 게이트 입력 UI + 시드 기본 게이트

**Files:**
- Modify: `spc.html:1731` (`EVT_GATES` 상태 변수 추가)
- Modify: `spc.html:1739` (`closeModal`에서 `EVT_GATES` 초기화)
- Modify: `spc.html:1809-1826` (`openEventModal`에 게이트 섹션 추가)
- Modify: `spc.html:1827-1845` (`saveEvent`에서 `sanitizeGates` 사용해 저장)
- Modify: `spc.html` (`ACTS`에 `evt-gate-add`/`evt-gate-rm` 추가, 기존 병합 input 리스너에 `gate-name` 분기 추가)
- Modify: `spc.html:616` (시드 행사에 기본 게이트 3개 추가)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: Task 1의 `addGate`,`removeGate`,`sanitizeGates`
- Produces: `events[].gates: Array<{id,name}>` — Task 3(`toggleGatePass`)과 Task 4(`renderCI`)가 이 필드를 읽음

- [ ] **Step 1: `EVT_GATES` 상태 변수 추가**

`spc.html:1731`을 아래로 교체:

```js
let CONFIRM_FN=null,REASON_FN=null,GUEST_EDIT=null,EG_EDIT=null,REC_EG=null,URGENT=false,EG_COMP=[],EVT_GATES=[];
```

`spc.html:1739`(`closeModal` 함수)을 아래로 교체:

```js
function closeModal(){$('modal-root').innerHTML='';CONFIRM_FN=REASON_FN=null;GUEST_EDIT=EG_EDIT=REC_EG=null;URGENT=false;EG_COMP=[];EVT_GATES=[]}
```

- [ ] **Step 2: `openEventModal`에 게이트 섹션 추가**

`// ── 29. 행사 모달 ──` 주석과 `function openEventModal(id){` 사이(Task 1에서 이미 `addGate`/`removeGate`/`sanitizeGates`를 추가한 바로 다음)에 게이트 행 렌더 헬퍼를 추가:

```js
function renderGateRows(){
  if(!EVT_GATES.length)return'<p class="hint">게이트 없음 — 단일 체크인 모드로 동작</p>';
  return EVT_GATES.map((g,i)=>`<div class="gate-row-edit" style="display:flex;gap:6px;margin-bottom:6px">
    <input class="inp gate-name" data-i="${i}" placeholder="게이트 이름(예: 주차장 입장)" value="${esc(g.name)}" style="flex:1">
    <button type="button" class="btn btn-g btn-xs" data-act="evt-gate-rm" data-i="${i}">삭제</button></div>`).join('');
}
function refreshGateRows(){const el=$('evt-gate-list');if(el)el.innerHTML=renderGateRows()}
```

`spc.html`의 `openEventModal` 함수(1809~1826행)를 아래로 통째로 교체:

```js
function openEventModal(id){
  const ev=id?byId(S.events,id):null;
  EVT_GATES=(ev?.gates||[]).map(g=>({...g}));
  const f=(lbl,idn,val,type='text')=>`<div class="fl"><label>${lbl}</label><input class="inp" id="${idn}" value="${esc(val||'')}" ${type!=='text'?`type="${type}"`:''}></div>`;
  const body=`<div class="fg">
    <div class="fl fg-full"><label>행사명 <span class="req">*</span></label><input class="inp" id="e-title" value="${esc(ev?.title||'')}"></div>
    <div class="fl"><label>유형</label><select class="inp inp-sel" id="e-type">${Object.entries(ET).map(([k,v])=>`<option value="${k}" ${ev?.type===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
    ${f('일자','e-date',ev?.date||todayISO(),'date')}
    ${f('시작','e-start',ev?.startTime,'time')}${f('종료','e-end',ev?.endTime,'time')}
    ${f('장소','e-loc',ev?.loc)}${f('주최·주관','e-host',ev?.hostDept)}
    <div class="fl fg-full"><label>설명</label><input class="inp" id="e-desc" value="${esc(ev?.desc||'')}"></div>
    ${f('개인정보 보유기한','e-ret',ev?.retentionUntil,'date')}
    <div class="fl"><label>좌석 가로 칸수</label><input class="inp" type="number" id="e-cols" value="${ev?.seatConfig?.cols||10}" min="1"></div>
    <div class="fl"><label>좌석 세로 칸수</label><input class="inp" type="number" id="e-rows" value="${ev?.seatConfig?.rows||8}" min="1"></div>
    <div class="fl fg-full"><label>게이트(동선)</label><div id="evt-gate-list">${renderGateRows()}</div>
      <button type="button" class="btn btn-g btn-xs" data-act="evt-gate-add" style="margin-top:6px">+ 게이트 추가</button></div>
  </div>`;
  GUEST_EDIT=null;EG_EDIT=id||'new-event';
  openModal(id?'행사 수정':'행사 생성',body,[{label:'취소',cls:'btn-s',act:'close'},{label:'저장',cls:'btn-p',act:'save-event'}]);
  setTimeout(()=>$('e-title')?.focus(),50);
}
```

(변경 요약: `EVT_GATES` 초기화 한 줄과, 좌석 칸수 입력 다음에 게이트 섹션 한 블록이 추가됐을 뿐 나머지 필드는 그대로다.)

- [ ] **Step 3: `saveEvent`에서 게이트 저장**

`spc.html`의 `saveEvent` 함수(1827~1845행)를 아래로 통째로 교체:

```js
function saveEvent(){
  const title=$('e-title').value.trim();const date=$('e-date').value;
  if(!title||!date){toast('행사명과 일자는 필수입니다','err');return}
  const cols=clamp(parseInt($('e-cols').value)||10,1,40);
  const rows=clamp(parseInt($('e-rows').value)||8,1,40);
  const d={title,type:$('e-type').value,date,startTime:$('e-start').value,endTime:$('e-end').value,
    loc:$('e-loc').value.trim(),hostDept:$('e-host').value.trim(),desc:$('e-desc').value.trim(),retentionUntil:$('e-ret').value,
    gates:sanitizeGates(EVT_GATES),updatedAt:now()};
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

(변경 요약: `d`에 `gates:sanitizeGates(EVT_GATES)` 한 줄 추가됐을 뿐, 좌석 관련 로직은 그대로다. `gates`는 생성·수정 양쪽 다 모달의 현재 상태로 완전히 교체된다 — `seatConfig`의 복도 배열과 달리 별도 보존 로직이 필요 없다, 모달 자체가 기존 게이트를 이미 보여주고 편집하기 때문.)

- [ ] **Step 4: ACTS에 게이트 추가/삭제, input 리스너에 게이트 이름 동기화 추가**

`spc.html`의 `const ACTS={` 블록 안에서 `'eg-comp-rm':el=>{EG_COMP=removeCompanion(EG_COMP,+el.dataset.i);refreshCompRows()},` 항목 바로 다음에 추가:

```js
'evt-gate-add':()=>{EVT_GATES=addGate(EVT_GATES);refreshGateRows()},
'evt-gate-rm':el=>{EVT_GATES=removeGate(EVT_GATES,+el.dataset.i);refreshGateRows()},
```

기존에 이미 있는 `document.addEventListener('input', ...)` 리스너(`comp-name`/`comp-role`/`comp-phone`를 처리하는 부분, `t.classList.contains('comp-name')...`로 시작하는 블록)를 찾아 그 `if` 블록 안에 `gate-name` 분기를 추가한다. 현재:

```js
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.classList.contains('comp-name')||t.classList.contains('comp-role')||t.classList.contains('comp-phone')){
    const i=+t.dataset.i;if(!EG_COMP[i])return;
    if(t.classList.contains('comp-name'))EG_COMP[i].name=t.value;
    else if(t.classList.contains('comp-role'))EG_COMP[i].role=t.value;
    else EG_COMP[i].phone=t.value;
    return;
  }
  const a=t.dataset.act;if(a!=='ci-search'&&a!=='g-search')return;
  ...
```

아래 전체 블록으로 교체(게이트 분기 추가):

```js
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.classList.contains('comp-name')||t.classList.contains('comp-role')||t.classList.contains('comp-phone')){
    const i=+t.dataset.i;if(!EG_COMP[i])return;
    if(t.classList.contains('comp-name'))EG_COMP[i].name=t.value;
    else if(t.classList.contains('comp-role'))EG_COMP[i].role=t.value;
    else EG_COMP[i].phone=t.value;
    return;
  }
  if(t.classList.contains('gate-name')){
    const i=+t.dataset.i;if(!EVT_GATES[i])return;
    EVT_GATES[i].name=t.value;
    return;
  }
  const a=t.dataset.act;if(a!=='ci-search'&&a!=='g-search')return;
  const val=t.value;if(a==='ci-search')CI_Q=val;else G_Q=val;rerender();
  const n=document.querySelector(`[data-act="${a}"]`);if(n){n.focus();try{n.setSelectionRange(val.length,val.length)}catch{}}
});
```

- [ ] **Step 5: 시드 행사에 기본 게이트 3개 추가**

`spc.html:616`에서 `seatConfig:{cols:10,rows:8,aisleRows:[3],aisleCols:[5]}` 바로 다음에(콤마로 연결) 추가:

```js
    ,gates:[{id:'gt1',name:'주차장 입장'},{id:'gt2',name:'건물 입장'},{id:'gt3',name:'행사장 입장'}]
```

- [ ] **Step 6: 테스트 추가**

`tests/run.js`의 `[게이트 배열 로직]` 섹션 뒤에 추가:

```js
ok('시드 행사에 기본 게이트 3개 존재',A.S.events[0].gates&&A.S.events[0].gates.length===3&&A.S.events[0].gates[2].name==='행사장 입장');
```

- [ ] **Step 7: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 통과, "전 역할 × 전 페이지 렌더" 항목도 여전히 통과(이 태스크는 렌더 함수를 바꾸지 않으므로 회귀 없어야 함)

- [ ] **Step 8: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 행사 생성·수정 모달에 게이트(동선) 입력 추가, 시드 행사 기본 게이트 반영"
```

---

### Task 3: `toggleGatePass` — 체크인 통합 로직

**Files:**
- Modify: `spc.html` — `undoCheckin`/`adminUndo` 함수 다음, `// ── 16. VVIP 영접 관리 ──` 주석(현재 1009행) 이전에 추가
- Test: `tests/run.js`

**Interfaces:**
- Consumes: 기존 `doCheckin(egId)`,`isArrived`,`isOnline`,`makeLog`,`pushCheckinLog`,`audit`,`save`,`byId`,`can`,`toast`,`rerender`
- Produces: `toggleGatePass(egId:string, gateId:string): void` — `eventGuests[].gatesPassed`를 갱신하고, 마지막 게이트면 `doCheckin`을 호출

- [ ] **Step 1: 테스트 추가 (실패 상태)**

`tests/run.js`의 `__API` 목록에 `toggleGatePass`를 추가한다. `[게이트 배열 로직]` 섹션 뒤에 추가:

```js
console.log('\n[게이트 체크인 통합]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const gateEvId=A.S.events[0].id;
const gateEv=A.byId(A.S.events,gateEvId);
gateEv.gates=[{id:'g1',name:'주차장 입장'},{id:'g2',name:'건물 입장'},{id:'g3',name:'행사장 입장'}];
// VVIP·동명이인은 doCheckin이 확인 모달만 띄우고 즉시 도착 처리하지 않으므로
// (모달 콜백은 이 테스트 하니스에서 실행되지 않음), 반드시 VVIP가 아닌 내빈으로 검증한다.
const gateGuest=A.S.eventGuests.find(e=>e.eventId===gateEvId&&e.protocolLevel!=='VVIP'&&e.arrivalStatus==='expected');
if(gateGuest){
  A.toggleGatePass(gateGuest.id,'g1');
  ok('일반 게이트 통과는 gatesPassed만 갱신',gateGuest.gatesPassed&&gateGuest.gatesPassed.g1&&gateGuest.arrivalStatus==='expected');
  A.toggleGatePass(gateGuest.id,'g1');
  ok('같은 게이트 다시 누르면 취소됨',!gateGuest.gatesPassed.g1);
  A.toggleGatePass(gateGuest.id,'g3');
  ok('마지막 게이트를 누르면 doCheckin이 실행되어 도착 처리됨(다른 게이트 안 눌러도)',gateGuest.arrivalStatus==='arrived');
  ok('마지막 게이트 자체도 gatesPassed에 기록됨',gateGuest.gatesPassed.g3);
}else{
  ok('게이트 테스트용 미도착 내빈 확보',false);
}
const gateGuest2=A.S.eventGuests.find(e=>e.eventId===gateEvId&&e.protocolLevel!=='VVIP'&&e.id!==gateGuest?.id&&e.arrivalStatus==='expected');
if(gateGuest2){
  A.doCheckin(gateGuest2.id); // 게이트 없이 기존 방식으로 이미 도착 처리된 상태를 재현(VVIP 아니므로 확인 모달 없이 즉시 처리됨)
  ok('doCheckin으로 실제 도착 처리됨(테스트 전제 확인)',gateGuest2.arrivalStatus==='arrived');
  A.toggleGatePass(gateGuest2.id,'g1');
  ok('이미 도착 처리된 내빈은 게이트 토글이 무시됨',!gateGuest2.gatesPassed||!gateGuest2.gatesPassed.g1);
}else{
  ok('두 번째 게이트 테스트용 미도착 내빈 확보',false);
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.toggleGatePass is not a function` 형태의 에러로 실패

- [ ] **Step 3: 구현 추가**

`spc.html`의 `adminUndo` 함수(현재 1000~1007행) 바로 다음, `// ── 16. VVIP 영접 관리 ──` 주석 이전에 추가:

```js
function toggleGatePass(egId,gateId){
  const eg=byId(S.eventGuests,egId);if(!eg)return;
  if(!can('checkin.do')){toast('체크인 권한이 없습니다','err');return}
  if(isArrived(eg.arrivalStatus))return;
  eg.gatesPassed=eg.gatesPassed||{};
  if(eg.gatesPassed[gateId]){
    delete eg.gatesPassed[gateId];
    eg.updatedAt=now();save(['eventGuests']);
    audit('eventGuest',eg.id,'gate_undo',{gateId},null,eg.eventId);
    rerender();return;
  }
  eg.gatesPassed[gateId]={at:now(),by:CUR.name};
  eg.updatedAt=now();
  const key=uid('k');
  const logData={eventId:eg.eventId,eventGuestId:eg.id,action:'gate_pass',gateId,
    previousStatus:eg.arrivalStatus,nextStatus:eg.arrivalStatus,previousTime:null,nextTime:now(),reason:'',idempotencyKey:key};
  if(!isOnline()){const log=makeLog(logData);S.queue.push({egId:eg.id,idempotencyKey:key,log});save(['eventGuests','queue'],{silent:true})}
  else{pushCheckinLog(logData);save(['eventGuests','checkinLogs'])}
  audit('eventGuest',eg.id,'gate_pass',null,{gateId},eg.eventId);
  const ev=byId(S.events,eg.eventId);const gates=ev?.gates||[];
  const isLast=gates.length&&gates[gates.length-1].id===gateId;
  if(isLast)doCheckin(egId);
  else rerender();
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 모두 통과(마지막 게이트를 눌렀을 때 VVIP/동명이인이 아닌 일반 내빈이면 `doCheckin`이 확인 모달 없이 즉시 `arrivalStatus='arrived'`로 전환됨을 확인)

- [ ] **Step 5: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 게이트 체크인 통합 함수 toggleGatePass 추가(마지막 게이트=기존 체크인 재사용)"
```

---

### Task 4: 현장 체크인 페이지 게이트 버튼 렌더링 + 배선

**Files:**
- Modify: `spc.html:908-947` (`renderCI` 카드 렌더링을 게이트 유무에 따라 분기)
- Modify: `spc.html` (CSS `<style>` 블록 — `.ci-card:hover`/`:active` 규칙 수정, `.gate-row`/`.gate-btn`/`.ci-gate-mode` 추가)
- Modify: `spc.html` (`ACTS`에 `gate-toggle` 추가)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: Task 3의 `toggleGatePass`; `currentEvent()`,`egOf`,`guestOf`,`dispName`,`dispPos`,`avCls`,`levelBadge`,`isArrived`,`ARR_LABEL`,`fmt`,`esc`
- Produces: 없음(`renderCI`가 `PAGES.checkin`으로 이미 등록되어 있으므로 "전 역할 × 전 페이지 렌더" 테스트가 자동 커버)

- [ ] **Step 1: CSS 수정 및 추가**

`spc.html`에서 아래 두 줄을 찾아:

```css
.ci-card:hover:not(.ci-done){border-color:var(--green);box-shadow:var(--shadow);transform:translateY(-1px)}
.ci-card:active:not(.ci-done){transform:scale(.98)}
```

아래로 교체:

```css
.ci-card:hover:not(.ci-done):not(.ci-gate-mode){border-color:var(--green);box-shadow:var(--shadow);transform:translateY(-1px)}
.ci-card:active:not(.ci-done):not(.ci-gate-mode){transform:scale(.98)}
.ci-card.ci-gate-mode{cursor:default}
```

그리고 같은 CSS 블록(`.ci-hint{...}` 규칙 근처)에 추가:

```css
.gate-row{display:flex;gap:6px;flex-wrap:wrap;padding-top:9px;border-top:1px solid var(--gray2)}
.gate-btn{font-size:10.5px;font-weight:700;padding:5px 10px;border-radius:var(--rfull);border:1px solid var(--gray3);background:var(--white);color:var(--gray5);cursor:pointer}
.gate-btn:hover{border-color:var(--green)}
.gate-btn.gate-on{background:var(--green-l);border-color:var(--green-b);color:var(--green-d)}
```

- [ ] **Step 2: `renderCI` 카드 렌더링 분기**

`spc.html`의 `renderCI` 함수(908~947행)를 아래로 통째로 교체:

```js
function renderCI(){
  const ev=currentEvent();
  const right=`${eventSelector()}
    <button class="btn ${DEMO_OFFLINE?'btn-w':'btn-s'} btn-sm" data-act="demo-offline">${DEMO_OFFLINE?'오프라인 해제':'오프라인 시연'}</button>
    ${can('checkin.do')?`<button class="btn btn-s btn-sm" data-act="urgent-add">긴급 내빈 추가</button>`:''}`;
  if(!ev)return pageHead('현장 체크인','',right)+emptyState('행사를 선택하세요');
  const gates=ev.gates||[];const hasGates=gates.length>0;
  const egs=egOf(ev.id);const arr=egs.filter(g=>isArrived(g.arrivalStatus)).length;
  const pct=egs.length?Math.round(arr/egs.length*100):0;
  const q=CI_Q.toLowerCase().replace(/\s/g,'');
  let list=egs.filter(eg=>{const g=guestOf(eg);
    if(q){const hay=(g.name+g.org+g.pos+choseong(g.name)).toLowerCase().replace(/\s/g,'');if(!hay.includes(q))return false}
    if(CI_FILTER==='pending'&&isArrived(eg.arrivalStatus))return false;
    if(CI_FILTER==='arrived'&&!isArrived(eg.arrivalStatus))return false;
    if(CI_FILTER==='vvip'&&eg.protocolLevel!=='VVIP')return false;
    return true;
  }).sort(sortByOrder(ev.id));

  const cards=list.map(eg=>{const g=guestOf(eg);const done=isArrived(eg.arrivalStatus);const vv=eg.protocolLevel==='VVIP';
    const dup=S.guests.filter(x=>x.isActive&&x.name===g.name).length>1;
    const top=`<div class="ci-top"><div class="av av32 ${avCls(eg.protocolLevel)}">${esc(dispName(eg)[0]||'?')}</div>
        <div style="flex:1;min-width:0"><div class="ci-name">${esc(dispName(eg))} ${levelBadge(eg.protocolLevel)}${eg.attendanceType==='representative'?'<span class="badge brep">대리</span>':''}</div>
          <div class="ci-sub">${esc(dispPos(eg))}</div><div class="ci-sub">${esc(g.org||'')}${dup?' ⚠ 동명이인':''}</div></div></div>`;
    if(hasGates&&!done){
      const gateBtns=gates.map(gt=>{const passed=!!(eg.gatesPassed&&eg.gatesPassed[gt.id]);
        return`<button type="button" class="gate-btn ${passed?'gate-on':''}" data-act="gate-toggle" data-id="${eg.id}" data-gate="${gt.id}">${passed?'✓ ':''}${esc(gt.name)}</button>`}).join('');
      return`<div class="ci-card ci-gate-mode${vv?' ci-vv':''}">
        ${top}
        <div class="gate-row">${gateBtns}</div>
      </div>`;
    }
    return`<button class="ci-card${done?' ci-done':''}${vv?' ci-vv':''}" data-act="do-ci" data-id="${eg.id}">
      ${top}
      <div class="ci-bot">${done?`<span class="ci-time">✓ ${fmt(eg.checkedInAt)}</span><span style="font-size:11px">${esc(ARR_LABEL[eg.arrivalStatus])}</span>`
        :`<span class="ci-hint">${eg.synced===false?'기기 저장됨':'탭하여 체크인'}</span>${vv?'<span style="font-size:10px;color:var(--red);font-weight:800">VVIP 확인</span>':''}`}</div>
    </button>`}).join('');

  return pageHead('현장 체크인',`${esc(ev.title)}${hasGates?` · 게이트 ${gates.length}개`:''}`,right)
    +`<div id="conn-box" style="margin-bottom:12px"></div>
      <div class="prog"><div class="prog-top"><span>도착</span><strong>${arr} / ${egs.length}명</strong></div>
        <div class="prog-bg"><div class="prog-fill" style="width:${pct}%"></div></div></div>
      <div class="search-row">
        <div class="search-wrap"><svg viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M10 10l3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          <input class="search-inp" id="ci-q" placeholder="이름·소속·직위·초성 검색" value="${esc(CI_Q)}" data-act="ci-search"></div>
        <div class="filter-bar">
          ${['all:전체','pending:대기','arrived:도착','vvip:VVIP'].map(f=>{const[v,l]=f.split(':');
            return`<button class="ftab ${CI_FILTER===v?'on':''}" data-act="ci-filter" data-f="${v}">${l}</button>`}).join('')}
        </div></div>
      <div class="ci-grid">${cards||emptyState(egs.length?'검색 결과 없음':'배정된 내빈이 없습니다')}</div>`;
}
```

(변경 요약: `gates`/`hasGates` 계산 두 줄, `pageHead` 서브타이틀에 게이트 수 표시, 카드 렌더링에서 `top` 블록을 변수로 뽑아 게이트 모드/일반 모드가 공유하도록 함. 검색·필터·진행률 로직은 전혀 변경 없음.)

- [ ] **Step 3: ACTS에 게이트 토글 액션 추가**

`spc.html`의 `const ACTS={` 블록 안에 `'do-ci':el=>doCheckin(el.dataset.id),`(또는 동일한 위치의 체크인 관련 항목) 다음에 추가:

```js
'gate-toggle':el=>toggleGatePass(el.dataset.id,el.dataset.gate),
```

(`'do-ci'` 항목을 찾으려면 `data-act="do-ci"`를 검색하면 되고, `ACTS` 맵 안에서 `'do-ci':el=>doCheckin(el.dataset.id),` 형태의 줄을 찾으면 된다.)

- [ ] **Step 4: 테스트 추가**

`tests/run.js`의 `__API` 목록에 `renderCI`를 추가하고, `[게이트 체크인 통합]` 섹션 뒤에 추가:

```js
console.log('\n[게이트 체크인 화면]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const ciHtml=A.renderCI();
ok('게이트 있는 행사는 게이트 버튼 표시',ciHtml.includes('gate-btn'));
ok('게이트 이름이 화면에 나타남',ciHtml.includes('주차장 입장')||ciHtml.includes('건물 입장')||ciHtml.includes('행사장 입장'));
```

- [ ] **Step 5: 전체 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 통과, "전 역할 × 전 페이지 렌더" 항목도 여전히 통과(= `renderCI`가 게이트 모드에서도 모든 허용 역할에서 에러 없이 렌더링됨)

- [ ] **Step 6: 브라우저에서 육안 확인**

Run: 로컬에서 `spc.html`을 브라우저로 열거나 Claude_Browser로 연다.
Expected:
1. 현장 접수자 또는 의전 총괄로 로그인 → "현장 체크인" 페이지 진입.
2. 시드 행사에 게이트 3개(주차장 입장/건물 입장/행사장 입장)가 설정돼 있으므로, 미도착 내빈 카드마다 큰 "탭하여 체크인" 버튼 대신 작은 게이트 버튼 3개가 보인다.
3. "주차장 입장" 버튼을 누르면 그 버튼만 강조되고(초록) 도착 상태는 그대로 "미도착"이다.
4. "행사장 입장"(마지막 게이트) 버튼을 누르면 — 일반 내빈은 즉시, VVIP·동명이인은 확인 모달 후 — 기존 체크인과 동일하게 카드가 "✓ 도착 완료"로 바뀐다.
5. 행사 관리에서 새 행사를 만들 때(또는 기존 행사 수정 시) "게이트(동선)" 섹션에서 게이트를 모두 지우고 저장하면, 그 행사는 현장 체크인에서 지금까지와 동일한 큰 "탭하여 체크인" 버튼으로 돌아간다(단일화 모드).

- [ ] **Step 7: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 현장 체크인 화면에 게이트 버튼 표시, 게이트 없는 행사는 기존 방식 유지"
```

---

## Self-Review Checklist
- [x] 스펙의 "행사별 게이트 등록" → Task 2(행사 모달)
- [x] 스펙의 "게이트는 필수 순차 관문 아님, 순서 무관 토글" → Task 3(`toggleGatePass`가 어떤 게이트든 독립적으로 토글)
- [x] 스펙의 "마지막 게이트 = 기존 체크인과 동일" → Task 3(`isLast`면 `doCheckin` 그대로 호출, 로직 복제 없음)
- [x] 스펙의 "게이트 없는 행사는 기존과 100% 동일" → Task 4(`hasGates` false면 기존 카드/버튼 구조 그대로)
- [x] 스펙의 "오프라인 큐 재사용" → Task 3이 `doCheckin`과 동일한 `isOnline`/`S.queue`/`makeLog` 패턴 사용
- [x] 스펙의 "도착 취소해도 게이트 기록 유지" → Task 3에서 `undoCheckin`을 건드리지 않음(별도 수정 없음 = 기존 그대로 `gatesPassed` 보존)
- [x] 스펙의 "시드 데이터로 즉시 시연 가능" → Task 2(시드 행사에 게이트 3개)
- [x] 스펙의 "영접 관리·대시보드·통계·결과보고에는 노출 안 함" → 어떤 태스크도 해당 페이지를 건드리지 않음
- [x] 스펙의 "테스트 추가" → 각 태스크마다 TDD 사이클 반영
