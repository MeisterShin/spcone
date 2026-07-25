# 좌석배치 인라인 편집모드 + 모바일 자리이동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spc.html`의 좌석배치 화면에 (1) 칸수 변경·복도 지정을 그 화면 안에서 바로 할 수 있는 "편집" 토글 모드, (2) 모바일(터치 기기) 전용 탭 기반 자리 이동을 추가한다.

**Architecture:** 편집모드는 페이지 상태 플래그(`SEAT_EDIT_MODE`) 하나로 칸수 입력란 노출과 복도 헤더 클릭 가능 여부를 함께 제어한다. 모바일 자리 이동은 `matchMedia('(pointer: coarse)')`로 터치 기기를 감지해 데스크톱의 기존 HTML5 드래그 경로와 완전히 분리된 탭-선택-탭-이동 경로를 추가하며, "탭 두 번으로 무엇을 할지 결정하는" 부분만 순수 함수 `seatTapAction`으로 분리해 자동테스트한다.

**Tech Stack:** 순수 JS(ES2019), 브라우저 네이티브 `matchMedia`(신규 라이브러리 없음).

## Global Constraints
- 새 데이터 모델 필드 없음 — 기존 `eventGuests.seat`, `events.seatConfig{cols,rows,aisleRows,aisleCols}`만 재사용. CLAUDE.md 데이터 모델 섹션 갱신 불필요.
- 이미 배치된 내빈의 `seat{row,col}` 좌표는 칸수를 줄여도 삭제하지 않는다(CLAUDE.md 규칙 2 — 삭제 대신 상태 변경 원칙과 동일 선상, 좌표 데이터 자체는 그대로 두고 화면에만 안 보이게 됨).
- 인라인 `onclick` 금지, `data-act` + `ACTS` 위임 사용. 단, 좌석 칸의 드래그/탭 이벤트는 기존 관례대로(`initSeatDnD`) `ACTS`를 거치지 않고 렌더 후 직접 `addEventListener`로 연결한다(기존 드래그 배선과 동일한 패턴).
- `matchMedia` 호출과 실제 터치 이벤트 동작은 브라우저 전용이라 Node 테스트 하니스로 자동테스트 불가능 — `seatTapAction`(탭 두 번의 결과를 결정하는 순수 함수)만 전 분기 자동테스트하고, 실제 터치 배선은 육안 확인으로 대체(사진 업로드 리사이즈 로직과 동일한 전례).
- 기능 수정 후 `node tests/run.js` 통과 필수.
- 데스크톱(비터치) 동작은 기존과 100% 동일해야 한다(회귀 없음) — `IS_TOUCH`가 false일 때 `initSeatDnD`는 지금과 똑같이 HTML5 드래그만 배선한다.

---

### Task 1: 좌석배치 인라인 편집모드 (칸수 변경 + 복도 헤더 토글 게이팅)

**Files:**
- Modify: `spc.html` — CSS(좌석 관련 규칙, 현재 296~309행 부근), `renderSeating`(현재 1398~1429행, 전체 교체), `ACTS`(`seat-toggle-row`/`seat-toggle-col` 수정 + `seat-edit-toggle`/`seat-resize-apply` 추가), 새 함수 `applySeatResize`(`moveSeatTo` 바로 다음에 추가)
- Test: `tests/run.js`

**Interfaces:**
- Produces: `let SEAT_EDIT_MODE`(boolean, 기본 false). `function applySeatResize(ev, colsRaw, rowsRaw): {cols:number, rows:number}` — `ev.seatConfig.cols`/`rows`를 1~40 범위로 clamp해 갱신하고 그 값을 반환(복도 배열은 건드리지 않음). Task 2가 이 값들에 의존하지 않으므로 별도 소비 관계 없음.

- [ ] **Step 1: CSS 추가**

`spc.html`에서 아래 줄(현재 302~303행)을 찾아:

```css
.seat-hdr-row{width:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--gray4);cursor:pointer;border:none;border-radius:4px;background:transparent;margin-right:0}
.seat-hdr-row.aisle-on{background:var(--amber-l);color:var(--amber)}
```

바로 다음 줄에 추가:

```css
.seat-hdr-col:disabled,.seat-hdr-row:disabled{cursor:default;opacity:.55}
.seat-hdr-col.editable,.seat-hdr-row.editable{box-shadow:inset 0 0 0 2px var(--green-b)}
.seat-hdr-col.editable:hover,.seat-hdr-row.editable:hover{background:var(--green-l);color:var(--green)}
```

- [ ] **Step 2: `SEAT_EDIT_MODE` 상태 변수 추가**

`function renderSeating(){` 바로 앞줄에 추가:

```js
let SEAT_EDIT_MODE=false;
```

- [ ] **Step 3: `applySeatResize` 순수 함수 추가**

`function moveSeatTo(egId,row,col){...}` 함수 바로 다음(즉 `function renderSeating(){` 앞, Step 2에서 추가한 줄 앞)에 추가:

```js
function applySeatResize(ev,colsRaw,rowsRaw){
  const cols=clamp(parseInt(colsRaw)||10,1,40);
  const rows=clamp(parseInt(rowsRaw)||8,1,40);
  ev.seatConfig.cols=cols;ev.seatConfig.rows=rows;
  return{cols,rows};
}
```

- [ ] **Step 4: 테스트 추가 (실패 상태)**

`tests/run.js`의 `__API` 목록(33행)에 `applySeatResize`와 `setSeatEditMode:b=>{SEAT_EDIT_MODE=b}`를 추가한다.

`[게이트 모드 스위치]` 섹션(현재 279~288행) 뒤, `// ── 클라우드 경로 ──` 주석 이전에 추가:

```js
console.log('\n[좌석배치 인라인 편집모드]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const editEv=A.byId(A.S.events,evId);
editEv.seatConfig={cols:5,rows:4,aisleRows:[1],aisleCols:[2]};
A.setSeatEditMode(false);
const offHtml=A.renderSeating();
ok('편집모드 꺼짐 상태에서는 복도 열 헤더가 비활성화됨',offHtml.includes('data-act="seat-toggle-col" data-i="0" disabled>'));
ok('편집모드 꺼짐 상태에서는 칸수 입력란이 없음',!offHtml.includes('seat-cols-input'));
A.setSeatEditMode(true);
const onHtml=A.renderSeating();
ok('편집모드 켜짐 상태에서는 복도 열 헤더가 활성화됨',onHtml.includes('data-act="seat-toggle-col" data-i="0" >'));
ok('편집모드 켜짐 상태에서 칸수 입력란이 노출됨',onHtml.includes('seat-cols-input')&&onHtml.includes('seat-rows-input'));
ok('편집모드 켜짐 상태에서 헤더에 editable 클래스 부여',onHtml.includes('editable'));
A.setSeatEditMode(false);

const resizeResult=A.applySeatResize(editEv,'7','6');
ok('applySeatResize가 clamp된 cols/rows 반환',resizeResult.cols===7&&resizeResult.rows===6);
ok('ev.seatConfig에 반영됨',editEv.seatConfig.cols===7&&editEv.seatConfig.rows===6);
ok('복도 배열은 그대로 보존됨',editEv.seatConfig.aisleRows.length===1&&editEv.seatConfig.aisleRows[0]===1&&editEv.seatConfig.aisleCols[0]===2);
const clampResult=A.applySeatResize(editEv,'999','abc');
ok('범위를 벗어나면 40으로 clamp',clampResult.cols===40);
ok('숫자가 아니면 기본값(8) 사용',clampResult.rows===8);
```

- [ ] **Step 5: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.setSeatEditMode is not a function`(또는 `A.applySeatResize is not a function`) 에러로 실패

- [ ] **Step 6: `renderSeating` 전체 교체 (편집모드 UI 반영)**

`function renderSeating(){`부터 다음 함수 시작 전까지(현재 1398~1429행) 전체를 아래로 교체:

```js
function renderSeating(){
  const ev=currentEvent();
  const canEdit=can('seating.edit');
  const right=`${eventSelector()}${canEdit?`<button class="btn btn-s btn-sm" data-act="seat-auto">추천배치 적용</button>
    <button class="btn ${SEAT_EDIT_MODE?'btn-w':'btn-s'} btn-sm" data-act="seat-edit-toggle">${SEAT_EDIT_MODE?'편집 종료':'편집'}</button>`:''}`;
  if(!ev)return pageHead('좌석배치','',right)+emptyState('행사를 선택하세요');
  if(!ev.seatConfig||!ev.seatConfig.cols||!ev.seatConfig.rows)
    return pageHead('좌석배치',esc(ev.title),right)+emptyState('행사 수정에서 가로·세로 칸수를 먼저 설정하세요');
  const{cols,rows,aisleRows=[],aisleCols=[]}=ev.seatConfig;
  const ar=new Set(aisleRows),ac=new Set(aisleCols);
  const egs=egOf(ev.id);
  const byPos={};egs.forEach(eg=>{if(eg.seat)byPos[`${eg.seat.row}_${eg.seat.col}`]=eg});
  const capacity=seatPriorityCoords(cols,rows,aisleRows,aisleCols).length;
  const overflow=Math.max(0,egs.length-capacity);
  const editOn=canEdit&&SEAT_EDIT_MODE;
  const resizePanel=editOn?`<div class="card" style="margin-bottom:12px"><div class="card-body" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
    <div class="fl"><label>가로 칸수</label><input class="inp" type="number" id="seat-cols-input" value="${cols}" min="1" style="width:90px"></div>
    <div class="fl"><label>세로 칸수</label><input class="inp" type="number" id="seat-rows-input" value="${rows}" min="1" style="width:90px"></div>
    <button class="btn btn-p btn-sm" data-act="seat-resize-apply">적용</button>
    <span class="hint" style="margin:0">칸수를 바꿔 적용하거나, 아래 복도 번호를 클릭해 복도를 지정하세요</span>
  </div></div>`:'';
  const colHdrs=`<div class="seat-hdrs"><div class="seat-hdr-row"></div>${Array.from({length:cols},(_,c)=>
    `<button class="seat-hdr-col ${ac.has(c)?'aisle-on':''}${editOn?' editable':''}" data-act="seat-toggle-col" data-i="${c}" ${editOn?'':'disabled'}>${c+1}</button>`).join('')}</div>`;
  const bodyRows=Array.from({length:rows},(_,r)=>{
    const cells=Array.from({length:cols},(_,c)=>{
      if(ar.has(r)||ac.has(c))return'<div class="seat-cell seat-aisle"></div>';
      const eg=byPos[`${r}_${c}`];
      if(eg){const g=guestOf(eg);
        return`<div class="seat-cell seat-occ av ${avCls(eg.protocolLevel)}${TAP_SEAT_EG===eg.id?' seat-selected':''}" draggable="${canEdit}" data-eg="${eg.id}" data-row="${r}" data-col="${c}" title="${esc(dispName(eg))} · ${esc(g.org||'')}">${esc(dispName(eg).slice(0,3)||'?')}</div>`;
      }
      return`<div class="seat-cell seat-empty" data-row="${r}" data-col="${c}"></div>`;
    }).join('');
    return`<div class="seat-row"><button class="seat-hdr-row ${ar.has(r)?'aisle-on':''}${editOn?' editable':''}" data-act="seat-toggle-row" data-i="${r}" ${editOn?'':'disabled'}>${r+1}</button>${cells}</div>`;
  }).join('');
  return pageHead('좌석배치',`${esc(ev.title)} · ${egs.length}명${overflow?` · 배치 안 됨 ${overflow}명`:''}`,right)
    +`<div class="card"><div class="card-body">
      ${resizePanel}
      <div class="seat-stage">무대</div>
      <div class="seat-wrap">${colHdrs}${bodyRows}</div>
      ${IS_TOUCH?'<p class="hint" style="margin-top:8px">자리를 탭해 선택한 뒤, 이동할 자리를 다시 탭하세요.</p>':''}
    </div></div>`;
}
```

**주의:** 이 코드는 `TAP_SEAT_EG`와 `IS_TOUCH`를 참조하는데, 이 두 값은 Task 2에서 추가된다. Task 1만 단독으로 적용하면 `ReferenceError`가 나므로, Task 1의 이 Step 6을 적용한 직후 바로 Step 7(아래)에서 두 변수를 최소 형태로 먼저 선언해 Task 1 자체가 완결되도록 한다(Task 2에서 `IS_TOUCH`의 실제 계산식과 `TAP_SEAT_EG`를 사용하는 탭 로직을 마저 채운다).

- [ ] **Step 7: Task 2 선행 변수 임시 선언 (Task 1을 독립적으로 완결시키기 위함)**

`let dragEg=null;` 바로 앞(현재 1465행 앞)에 추가:

```js
let TAP_SEAT_EG=null;
const IS_TOUCH=false;
```

(Task 2에서 `const IS_TOUCH=false;`를 실제 감지 로직으로 교체한다.)

- [ ] **Step 8: `ACTS`에 편집모드 토글·칸수 적용 액션 추가, 복도 토글 액션에 편집모드 가드 추가**

`const ACTS={` 블록 안의 아래 두 항목(`seat-toggle-row`, `seat-toggle-col`)을 찾아:

```js
  'seat-toggle-row':el=>{if(!can('seating.edit'))return;const ev=currentEvent();if(!ev||!ev.seatConfig)return;
    const i=+el.dataset.i;const idx=ev.seatConfig.aisleRows.indexOf(i);
    if(idx===-1)ev.seatConfig.aisleRows.push(i);else ev.seatConfig.aisleRows.splice(idx,1);
    save(['events']);audit('event',ev.id,'seat_aisle_toggle',null,{row:i,on:idx===-1},ev.id);rerender()},
  'seat-toggle-col':el=>{if(!can('seating.edit'))return;const ev=currentEvent();if(!ev||!ev.seatConfig)return;
    const i=+el.dataset.i;const idx=ev.seatConfig.aisleCols.indexOf(i);
    if(idx===-1)ev.seatConfig.aisleCols.push(i);else ev.seatConfig.aisleCols.splice(idx,1);
    save(['events']);audit('event',ev.id,'seat_aisle_toggle',null,{col:i,on:idx===-1},ev.id);rerender()},
```

아래로 교체:

```js
  'seat-toggle-row':el=>{if(!can('seating.edit')||!SEAT_EDIT_MODE)return;const ev=currentEvent();if(!ev||!ev.seatConfig)return;
    const i=+el.dataset.i;const idx=ev.seatConfig.aisleRows.indexOf(i);
    if(idx===-1)ev.seatConfig.aisleRows.push(i);else ev.seatConfig.aisleRows.splice(idx,1);
    save(['events']);audit('event',ev.id,'seat_aisle_toggle',null,{row:i,on:idx===-1},ev.id);rerender()},
  'seat-toggle-col':el=>{if(!can('seating.edit')||!SEAT_EDIT_MODE)return;const ev=currentEvent();if(!ev||!ev.seatConfig)return;
    const i=+el.dataset.i;const idx=ev.seatConfig.aisleCols.indexOf(i);
    if(idx===-1)ev.seatConfig.aisleCols.push(i);else ev.seatConfig.aisleCols.splice(idx,1);
    save(['events']);audit('event',ev.id,'seat_aisle_toggle',null,{col:i,on:idx===-1},ev.id);rerender()},
  'seat-edit-toggle':()=>{SEAT_EDIT_MODE=!SEAT_EDIT_MODE;rerender()},
  'seat-resize-apply':()=>{if(!can('seating.edit'))return;const ev=currentEvent();if(!ev||!ev.seatConfig)return;
    const{cols,rows}=applySeatResize(ev,$('seat-cols-input').value,$('seat-rows-input').value);
    save(['events']);audit('event',ev.id,'seat_resize',null,{cols,rows},ev.id);rerender()},
```

- [ ] **Step 9: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 전부 통과, "전 역할 × 전 페이지 렌더" 포함 회귀 없음(시드 행사는 `SEAT_EDIT_MODE` 기본값 false라 기존과 동일하게 렌더링됨).

- [ ] **Step 10: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 좌석배치 화면에 인라인 편집모드 추가(칸수 변경·복도 토글을 그 화면에서 직접)"
```

---

### Task 2: 모바일 전용 탭 기반 자리 이동

**Files:**
- Modify: `spc.html` — CSS(선택 좌석 강조, `.seat-cell.over` 규칙 부근), `IS_TOUCH` 계산식 교체(Task 1 Step 7에서 임시로 넣은 `const IS_TOUCH=false;`), 새 함수 `seatTapAction`(`initSeatDnD` 바로 앞), `initSeatDnD` 전체 교체
- Test: `tests/run.js`

**Interfaces:**
- Consumes: `swapSeats(evId,egIdA,egIdB)`, `moveSeatTo(egId,row,col)`(기존 함수, 시그니처 변경 없음), `TAP_SEAT_EG`(Task 1에서 선언됨)
- Produces: `function seatTapAction(selectedEgId, tappedEgId, tappedRow, tappedCol): {action:'select'|'deselect'|'swap'|'move'|'none', ...}` — 순수 함수, DOM/터치 이벤트와 무관.

- [ ] **Step 1: CSS 추가**

`spc.html`에서 아래 줄(현재 309행)을 찾아:

```css
.seat-cell.over{outline:2px solid var(--green);outline-offset:1px}
```

바로 다음 줄에 추가:

```css
.seat-cell.seat-selected{outline:2px solid var(--green);outline-offset:1px}
```

- [ ] **Step 2: 테스트 추가 (실패 상태)**

`tests/run.js`의 `__API` 목록(33행)에 `seatTapAction`을 추가한다.

Task 1에서 추가한 `[좌석배치 인라인 편집모드]` 섹션 뒤에 추가:

```js
console.log('\n[좌석 탭 이동 로직]');
ok('선택 없음 + 사람 있는 칸 탭 → select',JSON.stringify(A.seatTapAction(null,'egA',1,1))===JSON.stringify({action:'select',egId:'egA'}));
ok('선택 없음 + 빈 칸 탭 → none',A.seatTapAction(null,null,1,1).action==='none');
ok('선택된 자리를 다시 탭 → deselect',A.seatTapAction('egA','egA',1,1).action==='deselect');
ok('선택 있음 + 다른 사람 자리 탭 → swap',JSON.stringify(A.seatTapAction('egA','egB',2,2))===JSON.stringify({action:'swap',a:'egA',b:'egB'}));
ok('선택 있음 + 빈 자리 탭 → move',JSON.stringify(A.seatTapAction('egA',null,3,3))===JSON.stringify({action:'move',egId:'egA',row:3,col:3}));
ok('선택 있음 + 복도 칸(행/열 정보 없음) 탭 → none(선택 유지)',A.seatTapAction('egA',null,null,null).action==='none');
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.seatTapAction is not a function` 에러로 실패

- [ ] **Step 4: `seatTapAction` 순수 함수 추가**

`function initSeatDnD(){` 바로 앞에 추가:

```js
function seatTapAction(selectedEgId,tappedEgId,tappedRow,tappedCol){
  if(selectedEgId==null)return tappedEgId?{action:'select',egId:tappedEgId}:{action:'none'};
  if(tappedEgId===selectedEgId)return{action:'deselect'};
  if(tappedEgId)return{action:'swap',a:selectedEgId,b:tappedEgId};
  if(tappedRow!=null&&tappedCol!=null)return{action:'move',egId:selectedEgId,row:tappedRow,col:tappedCol};
  return{action:'none'};
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 6개 항목 통과

- [ ] **Step 6: `IS_TOUCH` 실제 감지식으로 교체**

Task 1 Step 7에서 추가한 아래 줄을 찾아:

```js
const IS_TOUCH=false;
```

아래로 교체:

```js
const IS_TOUCH=typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(pointer: coarse)').matches;
```

(Node 테스트 하니스의 가짜 `window` 객체에는 `matchMedia`가 없으므로 `typeof window.matchMedia==='function'`에서 안전하게 `false`로 단락되어 하니스가 깨지지 않는다.)

- [ ] **Step 7: `initSeatDnD` 전체 교체 (터치 분기 추가)**

`function initSeatDnD(){`부터 다음 함수 시작 전까지(현재 1477~1491행) 전체를 아래로 교체:

```js
function initSeatDnD(){
  if(IS_TOUCH){
    document.querySelectorAll('.seat-cell[data-row]').forEach(cell=>{
      cell.addEventListener('click',()=>{
        const row=cell.dataset.row!=null?+cell.dataset.row:null;
        const col=cell.dataset.col!=null?+cell.dataset.col:null;
        const act=seatTapAction(TAP_SEAT_EG,cell.dataset.eg||null,row,col);
        if(act.action==='select'){TAP_SEAT_EG=act.egId;rerender()}
        else if(act.action==='deselect'){TAP_SEAT_EG=null;rerender()}
        else if(act.action==='swap'){swapSeats(currentEventId(),act.a,act.b);TAP_SEAT_EG=null;rerender()}
        else if(act.action==='move'){moveSeatTo(act.egId,act.row,act.col);TAP_SEAT_EG=null;rerender()}
      });
    });
    return;
  }
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

- [ ] **Step 8: 전체 테스트 실행 → 회귀 없음 확인**

Run: `node tests/run.js`
Expected: 기존 통과 수 그대로 유지. `IS_TOUCH`가 하니스에서 항상 `false`로 평가되므로 "전 역할 × 전 페이지 렌더"를 포함해 어떤 렌더 함수도 `initSeatDnD`를 직접 호출하지 않아(라우터의 `rerender()`를 거치지 않고 각 페이지 렌더 함수만 직접 호출) 영향 없음.

- [ ] **Step 9: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 모바일(터치 기기) 전용 탭 기반 좌석 이동 추가(데스크톱 드래그는 그대로 유지)"
```

- [ ] **Step 10: 브라우저에서 육안 확인**

Run: 로컬에서 `spc.html`을 열거나 Claude_Browser로 연다.
Expected:
1. **인라인 편집모드**: 좌석배치 화면에서 "편집" 버튼을 누르면 상단에 가로/세로 칸수 입력란이 나타나고, 복도 헤더 숫자가 눈에 띄게 강조된 스타일로 바뀌며 클릭하면 복도가 토글된다. "편집 종료"를 누르면 입력란이 사라지고 헤더가 다시 정적으로 보인다. 칸수를 바꾸고 "적용"을 누르면 그리드 크기가 즉시 바뀌고 새로고침해도 유지된다.
2. **모바일 탭 이동**: 브라우저 창을 모바일 크기로 줄이거나 실제 터치 기기(또는 Chrome DevTools 기기 시뮬레이션 — `pointer: coarse` 매체 쿼리가 실제로 적용되는 모드)에서 좌석배치 화면을 열면 안내 문구가 보이고, 자리를 탭하면 하이라이트되며, 다른 자리를 탭하면 이동/교체된다. 데스크톱(마우스)에서는 기존처럼 드래그로 자리를 옮길 수 있다.

---

### Task 3: 최종 리뷰 + 병합 + 배포 확인

**Files:** 없음(리뷰·병합·배포 작업)

- [ ] **Step 1: 전체 테스트 재확인**

Run: `node tests/run.js`
Expected: 전체 통과, 0 실패

- [ ] **Step 2: 최종 브랜치 리뷰**

Task 1~2의 전체 diff(merge-base 대비)를 최종 리뷰한다. 이번 기능은 새 데이터 모델 필드가 없으므로 CLAUDE.md 갱신은 필요 없음 — 리뷰에서 "새 필드가 실제로 없는지"만 한 번 더 확인한다.

- [ ] **Step 3: main 병합 + push**

```bash
git checkout main
git merge --no-ff <feature-branch> -m "Merge: 좌석배치 인라인 편집모드 + 모바일 자리이동 추가"
node tests/run.js
git push origin main
```

- [ ] **Step 4: GitHub Pages 배포 확인**

`gh run list -R MeisterShin/spcone --json headSha,status,conclusion -L 3`로 최신 커밋의 배포가 `completed`/`success`인지 확인한다.

- [ ] **Step 5: 배포된 사이트에서 육안 확인**

Task 2 Step 10과 동일한 시나리오를 실제 배포된 사이트(`https://meistershin.github.io/spcone/`)에서 다시 확인한다(데스크톱 뷰 + 모바일 뷰 리사이즈 모두).

## Self-Review Checklist
- [x] 스펙의 "편집 토글 → 칸수 입력란 등장" → Task 1
- [x] 스펙의 "복도 헤더가 편집모드일 때만 눈에 띄게 클릭 가능" → Task 1 Step 1(CSS)·Step 6(editOn 조건)
- [x] 스펙의 "좌석 이동은 편집모드와 무관하게 항상 가능" → Task 1에서 좌석 셀 자체의 draggable/클릭 로직은 건드리지 않음(Task 2에서만 확장)
- [x] 스펙의 "데스크톱 드래그 그대로 유지, 모바일만 탭 추가" → Task 2의 `IS_TOUCH` 분기
- [x] 스펙의 "탭 5분기(select/deselect/swap/move/none) 순수 함수로 테스트 가능" → Task 2의 `seatTapAction` + 6개 테스트(공백/복도 두 가지 none 케이스 포함)
- [x] 스펙의 "matchMedia/터치 이벤트는 브라우저 전용, 자동테스트 대상 아님" → Task 2 Step 6 주석 + Global Constraints에 명시
- [x] 스펙의 "칸수 줄여도 기존 좌석 데이터 삭제 안 함" → `applySeatResize`가 `seat` 필드를 전혀 건드리지 않음(Global Constraints에 명시)
- [x] 새 데이터 모델 필드 없음 → CLAUDE.md 갱신 태스크 없음(Task 3에서 확인만)
