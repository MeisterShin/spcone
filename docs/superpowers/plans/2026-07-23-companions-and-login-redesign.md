# 수행원 관리 + 로그인 화면 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spc.html`에 (1) VIP별 수행원(비서·운전기사 등) 명단 관리 기능과 (2) 로그인 화면의 다크 히어로 스타일 시각 개선을 추가한다.

**Architecture:** 수행원 관리는 순수 배열 조작 함수(`addCompanion`/`removeCompanion`/`sanitizeCompanions`) + 기존 "내빈 행사 설정" 모달 확장 + VVIP 영접 관리 표에 요약 컬럼 추가로 구성. 로그인 화면 개선은 `renderLogin()`과 관련 CSS 블록만 교체하는 순수 프레젠테이션 변경이며 로직/데이터 흐름에는 영향을 주지 않는다. 두 기능은 서로 독립적이라 태스크도 완전히 분리되어 있다.

**Tech Stack:** 순수 JS(ES2019), 인라인 SVG, 기존 CSS 토큰(`--green`,`--gray*`) 재사용. 신규 npm 의존성 없음.

## Global Constraints
- 사용자 입력을 `innerHTML`에 넣을 때는 반드시 `esc()`로 이스케이프 (CLAUDE.md 코딩 규칙 1)
- 인라인 `onclick` 금지, 클릭 액션은 전부 `data-act` + `ACTS` 위임 사용 (CLAUDE.md 코딩 규칙 5)
- 중요한 변경은 `audit()`로 기록 (CLAUDE.md 코딩 규칙 4)
- 기능 수정 후 `node tests/run.js` 통과 필수, 새 핵심 로직엔 테스트 추가 (CLAUDE.md 코딩 규칙 7)
- 새 Firestore 스키마 변경 없음 — `eventGuests`에 필드만 추가
- 로그인 화면 개선은 로그인 화면에만 한정, 내부 앱 화면의 기존 디자인 시스템(`DESIGN-notion.md`)은 변경하지 않음

---

### Task 1: 수행원 배열 조작 순수 함수

**Files:**
- Modify: `spc.html` (아래 "정확한 삽입 위치" 참고)
- Test: `tests/run.js`

**정확한 삽입 위치:** `saveEg` 함수(현재 1742행) 바로 다음에 세 함수를 추가한다.

**Interfaces:**
- Produces: `addCompanion(list:Array<{name,role,phone}>): Array<{name,role,phone}>` — 새 빈 항목을 추가한 **새 배열**을 반환(원본 불변)
- Produces: `removeCompanion(list, idx:number): Array<{name,role,phone}>` — 해당 인덱스를 제거한 **새 배열**을 반환(원본 불변)
- Produces: `sanitizeCompanions(list): Array<{name,role,phone}>` — 이름이 빈(trim 후 빈 문자열) 항목은 제외하고, 나머지는 각 필드를 trim한 새 배열을 반환
- Consumes: 없음 (순수 함수, DOM/전역 상태 비의존)

- [ ] **Step 1: 테스트 추가 (실패 상태)**

`tests/run.js`의 `globalThis.__API={...}` 목록(33행)에 `addCompanion,removeCompanion,sanitizeCompanions`를 추가한다.

`[통계 페이지]` 섹션 뒤, `// ── 클라우드 경로 ──` 주석 이전에 추가:

```js
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.addCompanion is not a function` 형태의 에러로 실패

- [ ] **Step 3: 구현 추가**

`spc.html`의 `saveEg` 함수(1742~1755행) 바로 다음에 추가:

```js
function addCompanion(list){return[...list,{name:'',role:'',phone:''}]}
function removeCompanion(list,idx){return list.filter((_,i)=>i!==idx)}
function sanitizeCompanions(list){
  return list.map(c=>({name:(c.name||'').trim(),role:(c.role||'').trim(),phone:(c.phone||'').trim()}))
    .filter(c=>c.name);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 5개 항목 모두 `✓`, 마지막 줄 `═══ 결과: N 통과 / 0 실패 ═══`(기존 33 + 5 = 38 이상)

- [ ] **Step 5: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 수행원 목록 조작 순수 함수 addCompanion/removeCompanion/sanitizeCompanions 추가"
```

---

### Task 2: 수행원 관리 UI (내빈 행사 설정 모달 + 영접 관리 표시)

**Files:**
- Modify: `spc.html:1613` (`EG_COMP` 상태 변수 추가)
- Modify: `spc.html:1621` (`closeModal`에서 `EG_COMP` 초기화)
- Modify: `spc.html:1720-1741` (`openEgModal`에 수행원 섹션 추가)
- Modify: `spc.html:1742-1755` (`saveEg`에서 `sanitizeCompanions` 사용해 저장)
- Modify: `spc.html` (ACTS 맵에 `eg-comp-add`/`eg-comp-rm` 추가, input 이벤트 위임에 수행원 입력 동기화 추가)
- Modify: `spc.html:979-1010` (`renderReception`에 "수행원" 컬럼 추가)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: Task 1의 `addCompanion`,`removeCompanion`,`sanitizeCompanions`
- Produces: `eventGuests[].companions: Array<{name,role,phone}>` — 이후 태스크나 다른 화면에서 이 필드를 읽을 수 있음(현재는 `renderReception`만 읽음)

- [ ] **Step 1: 상태 변수 및 모달 정리 로직 추가**

`spc.html:1613`을 아래로 교체:

```js
let CONFIRM_FN=null,REASON_FN=null,GUEST_EDIT=null,EG_EDIT=null,REC_EG=null,URGENT=false,EG_COMP=[];
```

`spc.html:1621`(`closeModal` 함수)을 아래로 교체:

```js
function closeModal(){$('modal-root').innerHTML='';CONFIRM_FN=REASON_FN=null;GUEST_EDIT=EG_EDIT=REC_EG=null;URGENT=false;EG_COMP=[]}
```

- [ ] **Step 2: `openEgModal`에 수행원 섹션 추가**

`spc.html`의 `openEgModal` 함수(1720~1741행)를 아래로 통째로 교체:

```js
function renderCompRows(){
  if(!EG_COMP.length)return'<p class="hint">등록된 수행원 없음</p>';
  return EG_COMP.map((c,i)=>`<div class="comp-row" style="display:flex;gap:6px;margin-bottom:6px">
    <input class="inp comp-name" data-i="${i}" placeholder="이름" value="${esc(c.name)}" style="flex:1">
    <input class="inp comp-role" data-i="${i}" placeholder="역할(비서/운전기사 등)" value="${esc(c.role)}" style="flex:1">
    <input class="inp comp-phone" data-i="${i}" placeholder="연락처" value="${esc(c.phone)}" style="flex:1">
    <button type="button" class="btn btn-g btn-xs" data-act="eg-comp-rm" data-i="${i}">삭제</button></div>`).join('');
}
function refreshCompRows(){const el=$('eg-comp-list');if(el)el.innerHTML=renderCompRows()}
function openEgModal(id){
  const eg=byId(S.eventGuests,id);if(!eg)return;EG_EDIT=id;const g=guestOf(eg);
  EG_COMP=(eg.companions||[]).map(c=>({...c}));
  const greeters=S.users.filter(u=>u.role==='greeter'||u.role==='manager'||u.role==='chief');
  const body=`<div class="fg">
    <div class="fl fg-full"><label>내빈</label><input class="inp" value="${esc(g.name)} · ${esc(g.org||'')} ${esc(g.pos||'')}" disabled></div>
    <div class="fl"><label>참석 형태</label><select class="inp inp-sel" id="eg-att">${Object.entries(ATT_LABEL).map(([k,v])=>`<option value="${k}" ${eg.attendanceType===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
    <div class="fl"><label>의전 등급</label><select class="inp inp-sel" id="eg-lvl">${['VVIP','VIP','Guest'].map(l=>`<option ${eg.protocolLevel===l?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="fl"><label>대리자 이름</label><input class="inp" id="eg-repn" value="${esc(eg.repName||'')}"></div>
    <div class="fl"><label>대리자 직위</label><input class="inp" id="eg-repp" value="${esc(eg.repPos||'')}"></div>
    <div class="fl"><label>소개 방식</label><select class="inp inp-sel" id="eg-intro">${[['individual','개별소개'],['group','일괄소개'],['omitted','소개생략']].map(([k,v])=>`<option value="${k}" ${eg.introType===k?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
    <div class="fl"><label>행사 관련성(0-3)</label><input class="inp" type="number" id="eg-rel" value="${eg.eventRelevance||0}"></div>
    <div class="fl"><label>도착 예정시각</label><input class="inp" type="time" id="eg-eta" value="${eg.expectedArrivalAt?fmt(eg.expectedArrivalAt):''}"></div>
    <div class="fl"><label>영접 장소</label><input class="inp" id="eg-recloc" value="${esc(eg.receptionLocation||'')}"></div>
    <div class="fl"><label>차량번호</label><input class="inp" id="eg-veh" value="${esc(eg.vehicleNo||'')}" placeholder="예: 12가 3456"></div>
    <div class="fl"><label>주차 위치</label><input class="inp" id="eg-park" value="${esc(eg.parkingSpot||'')}"></div>
    <div class="fl fg-full"><label><input type="checkbox" id="eg-recreq" ${eg.receptionRequired?'checked':''} style="accent-color:var(--green)"> 영접 필요</label></div>
    <div class="fl fg-full"><label>영접 담당자</label><div style="display:flex;flex-wrap:wrap;gap:8px">${greeters.map(u=>`<label style="display:flex;align-items:center;gap:5px;font-size:12px;border:1px solid var(--gray3);border-radius:6px;padding:5px 9px;cursor:pointer">
      <input type="checkbox" class="eg-rec-cb" value="${u.id}" ${eg.receptionUserIds.includes(u.id)?'checked':''} style="accent-color:var(--green)">${esc(u.name)} <span style="color:var(--gray4)">(${esc(ROLES[u.role].name)})</span></label>`).join('')}</div></div>
    <div class="fl fg-full"><label>수행원</label><div id="eg-comp-list">${renderCompRows()}</div>
      <button type="button" class="btn btn-g btn-xs" data-act="eg-comp-add" style="margin-top:6px">+ 수행원 추가</button></div>
    <div class="fl fg-full"><label>공개 메모</label><input class="inp" id="eg-npub" value="${esc(eg.publicNote||'')}"></div>
  </div>`;
  openModal('내빈 행사 설정',body,[{label:'취소',cls:'btn-s',act:'close'},{label:'저장',cls:'btn-p',act:'save-eg'}]);
}
```

(변경 요약: `EG_COMP` 초기화 한 줄과, `공개 메모` 필드 앞에 `수행원` 섹션 한 블록이 추가됐을 뿐 나머지 필드는 그대로다.)

- [ ] **Step 3: `saveEg`에서 수행원 저장**

`spc.html`의 `saveEg` 함수(현재 위치, Task 1에서 그 뒤에 새 함수 3개가 추가된 상태) 중 `eg.publicNote=$('eg-npub').value.trim();` 줄 바로 다음에 한 줄 추가:

```js
eg.publicNote=$('eg-npub').value.trim();
eg.companions=sanitizeCompanions(EG_COMP);
```

- [ ] **Step 4: ACTS에 수행원 추가/삭제, input 이벤트 위임에 값 동기화 추가**

`spc.html`의 `const ACTS={` 블록(1859행) 안에 `'user-toggle'` 항목 다음 아무 곳에나 추가:

```js
'eg-comp-add':()=>{EG_COMP=addCompanion(EG_COMP);refreshCompRows()},
'eg-comp-rm':el=>{EG_COMP=removeCompanion(EG_COMP,+el.dataset.i);refreshCompRows()},
```

**주의**: `spc.html`에는 이미 `document.addEventListener('input', ...)` 리스너가 하나 있다(`ci-search`/`g-search` 검색창 입력을 처리, 현재 1924~1926행). 새 리스너를 따로 추가하지 말고 **이 기존 리스너를 확장**한다. 파일에서 `document.addEventListener('input',e=>{const a=e.target.dataset.act;if(a!=='ci-search'&&a!=='g-search')return;`를 검색해 찾은 뒤, 아래 전체 블록으로 교체:

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
  const val=t.value;if(a==='ci-search')CI_Q=val;else G_Q=val;rerender();
  const n=document.querySelector(`[data-act="${a}"]`);if(n){n.focus();try{n.setSelectionRange(val.length,val.length)}catch{}}
});
```

- [ ] **Step 5: `renderReception`에 수행원 컬럼 추가**

`spc.html`의 `renderReception` 함수(979~1010행)에서 아래 두 줄을 각각 교체한다.

교체 전(표 헤더):
```js
    <div class="card"><div class="tbl-wrap"><table class="rtbl"><thead><tr><th>내빈</th><th>예정시각</th><th>상태</th><th>차량번호</th><th>영접 장소</th><th>영접 담당</th><th class="no-print"></th></tr></thead>
      <tbody>${rows||`<tr><td colspan="7">${emptyState('영접 대상 내빈이 없습니다')}</td></tr>`}</tbody></table></div></div>`;
```
교체 후:
```js
    <div class="card"><div class="tbl-wrap"><table class="rtbl"><thead><tr><th>내빈</th><th>예정시각</th><th>상태</th><th>차량번호</th><th>영접 장소</th><th>영접 담당</th><th>수행원</th><th class="no-print"></th></tr></thead>
      <tbody>${rows||`<tr><td colspan="8">${emptyState('영접 대상 내빈이 없습니다')}</td></tr>`}</tbody></table></div></div>`;
```

교체 전(각 행의 셀들 중 "영접 담당" 셀 다음):
```js
      <td data-label="영접 담당">${esc(recNames)}</td>
      <td data-label="처리" class="no-print">
```
교체 후:
```js
      <td data-label="영접 담당">${esc(recNames)}</td>
      <td data-label="수행원">${eg.companions&&eg.companions.length?`${eg.companions.length}명`:'—'}</td>
      <td data-label="처리" class="no-print">
```

- [ ] **Step 6: 테스트 추가**

`tests/run.js`의 `__API` 목록에 `renderReception`을 추가하고, `[수행원 배열 로직]` 섹션 뒤에 추가:

```js
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
```

- [ ] **Step 7: 전체 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 통과, "전 역할 × 전 페이지 렌더" 항목도 여전히 통과(= `renderReception`이 `companions` 필드가 없는 기존 내빈에서도 에러 없이 렌더링됨 — `eg.companions&&eg.companions.length` 가드로 처리됨)

- [ ] **Step 8: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 내빈 행사 설정 모달에 수행원 입력, VVIP 영접 관리에 수행원 수 표시 추가"
```

---

### Task 3: 로그인 화면 CSS를 다크 히어로 스타일로 교체

**Files:**
- Modify: `spc.html:43-58` (로그인 CSS 블록 전체 교체)
- Test: 없음(순수 CSS, 이 태스크 자체는 시각 변경만이며 Task 4에서 실제 마크업과 함께 스모크 테스트)

**Interfaces:**
- Consumes: 없음
- Produces: `.login-card`,`.login-skyline`,`.login-badge`,`.login-logo`,`.login-t`,`.login-t2`,`.login-s`,`.login-sub`,`.demo-roles`,`.demo-role`,`.demo-role .ic`,`.demo-role .rt`,`.demo-role .rn`,`.demo-role .rd`,`.demo-role .arrow`,`.login-div`,`.login-foot` — Task 4가 이 클래스들을 사용하는 마크업을 만든다

- [ ] **Step 1: CSS 블록 교체**

`spc.html:43-58`(`/* ── LOGIN ── */` 주석부터 `.login-div::before,.login-div::after{...}` 줄까지)을 통째로 아래로 교체:

```css
/* ── LOGIN ────────────────────────────────────────── */
.login-bg{position:fixed;inset:0;background:radial-gradient(circle at 80% 0%,#0f5c3a 0%,#08301f 45%,#03130b 100%);display:flex;align-items:center;justify-content:center;padding:20px;z-index:400;overflow-y:auto}
.login-card{position:relative;overflow:hidden;background:rgba(8,42,27,.72);backdrop-filter:blur(6px);border:1px solid rgba(212,175,90,.25);border-radius:20px;width:100%;max-width:460px;padding:30px 28px;box-shadow:0 24px 70px rgba(0,0,0,.45);margin:auto;color:#F3F2ED}
.login-skyline{position:absolute;right:-10px;top:-10px;width:220px;height:120px;opacity:.35;pointer-events:none}
.login-badge{position:absolute;right:20px;top:18px;text-align:right;font-size:9.5px;color:#D4AF5A;letter-spacing:.04em;line-height:1.5}
.login-badge b{display:block;font-size:11.5px;color:#F3F2ED;font-weight:800}
.login-logo{display:flex;align-items:center;gap:10px;margin-bottom:6px;position:relative;z-index:1}
.login-logo .mk{width:40px;height:40px;background:var(--green);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.login-logo .mk svg{width:22px;height:22px}
.login-t{font-size:20px;font-weight:900;letter-spacing:-.4px;color:#F3F2ED}
.login-t2{font-size:10.5px;color:#D4AF5A;letter-spacing:.08em;margin-top:1px}
.login-s{font-size:12px;color:#B9C7BE;margin-top:2px}
.login-sub{font-size:12.5px;color:#C7D2CB;margin:14px 0 20px;line-height:1.6;position:relative;z-index:1}
.demo-roles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;position:relative;z-index:1}
.demo-role{display:flex;align-items:center;gap:10px;text-align:left;padding:11px 12px;border:1px solid rgba(255,255,255,.1);border-radius:var(--r);background:rgba(255,255,255,.04);cursor:pointer;transition:all .12s}
.demo-role:hover{border-color:#D4AF5A;background:rgba(212,175,90,.1)}
.demo-role .ic{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.demo-role .ic svg{width:16px;height:16px}
.demo-role .rt{flex:1;min-width:0}
.demo-role .rn{font-size:13px;font-weight:800;color:#F3F2ED}
.demo-role .rd{font-size:10.5px;color:#9FB0A6;margin-top:2px;line-height:1.4}
.demo-role .arrow{color:#6B8074;flex-shrink:0}
.login-div{display:flex;align-items:center;gap:10px;margin:20px 0 14px;color:#D4AF5A;font-size:11px;position:relative;z-index:1}
.login-div::before,.login-div::after{content:'';flex:1;height:1px;background:rgba(212,175,90,.3)}
.login-foot{position:relative;z-index:1}
.login-card .btn-g{color:#C7D2CB}
.login-card .btn-g:hover{background:rgba(255,255,255,.08);color:#fff}
```

- [ ] **Step 2: 테스트 실행 → 회귀 없음 확인**

Run: `node tests/run.js`
Expected: 기존 결과와 동일한 통과 수(CSS만 바뀌었으므로 로직 테스트는 전혀 영향받지 않음). 이 시점에서는 `renderLogin()`이 아직 새 클래스를 쓰는 마크업으로 바뀌지 않았으므로 시각적으로는 미완성 상태이며, Task 4에서 완성된다.

- [ ] **Step 3: 커밋**

```bash
git add spc.html
git commit -m "style: 로그인 화면 CSS를 다크 히어로 스타일로 교체"
```

---

### Task 4: 로그인 화면 마크업 개선 (스카이라인 일러스트·배지·역할 아이콘)

**Files:**
- Modify: `spc.html:379-387` (`ROLES`에 `icon` 필드 추가)
- Modify: `spc.html:614-635` (`renderLogin` 함수 교체)
- Test: `tests/run.js`

**Interfaces:**
- Consumes: Task 3의 CSS 클래스 전부
- Produces: 없음(터미널 UI 함수 — 다른 태스크가 의존하지 않음)

- [ ] **Step 1: `ROLES`에 아이콘 경로 추가**

`spc.html:379-387`을 아래로 교체:

```js
const ROLES={
  admin:{name:'시스템 관리자',desc:'전체 관리·사용자 권한',color:'#6B21A8',icon:'M8 1l6 3v4c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V4l6-3z'},
  chief:{name:'의전 총괄',desc:'행사·의전 전체 지휘',color:'#0B6E42',icon:'M3 14h10M4 14V6l4-3 4 3v8M6 14V9M10 14V9'},
  manager:{name:'행사 담당자',desc:'담당 행사 운영',color:'#1044A0',icon:'M8 8a3 3 0 100-6 3 3 0 000 6zM2 14c0-3 2.7-5 6-5s6 2 6 5'},
  desk:{name:'현장 접수자',desc:'체크인·취소',color:'#92500A',icon:'M3 8l3.5 3.5L13 4'},
  greeter:{name:'영접 담당자',desc:'VVIP 도착·영접',color:'#9B1C1C',icon:'M8 1c-2.8 0-5 2.2-5 5 0 3.5 5 9 5 9s5-5.5 5-9c0-2.8-2.2-5-5-5zM8 8a2 2 0 100-4 2 2 0 000 4z'},
  mc:{name:'사회자',desc:'확정 시나리오 조회',color:'#0F766E',icon:'M8 1a2 2 0 00-2 2v5a2 2 0 004 0V3a2 2 0 00-2-2zM4 8a4 4 0 008 0M8 12v3M6 15h4'},
  viewer:{name:'상황실 조회자',desc:'대시보드 조회 전용',color:'#57534E',icon:'M2 13h2v-5H2zM6 13h2V4H6zM10 13h2V8h-2z'},
};
```

- [ ] **Step 2: `renderLogin` 교체**

`spc.html:614-635`(`function renderLogin(){` 부터 닫는 `}`까지)을 아래로 통째로 교체:

```js
function renderLogin(){
  const shield=`<svg viewBox="0 0 16 16" fill="none"><path d="M8 1l6 3v4c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V4l6-3z" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 8l1.8 1.8L11 6" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const skyline=`<svg class="login-skyline" viewBox="0 0 220 120" fill="none" aria-hidden="true"><path d="M0 110h220" stroke="#D4AF5A" stroke-width="1"/><rect x="14" y="60" width="16" height="50" fill="#D4AF5A"/><rect x="36" y="40" width="18" height="70" fill="#F3F2ED"/><rect x="60" y="70" width="14" height="40" fill="#D4AF5A"/><rect x="80" y="30" width="20" height="80" fill="#F3F2ED"/><rect x="106" y="55" width="16" height="55" fill="#D4AF5A"/><rect x="128" y="20" width="18" height="90" fill="#F3F2ED"/><rect x="152" y="65" width="14" height="45" fill="#D4AF5A"/><rect x="172" y="45" width="18" height="65" fill="#F3F2ED"/><circle cx="185" cy="20" r="8" fill="#D4AF5A"/></svg>`;
  const roleCards=Object.entries(ROLES).map(([k,r])=>`
    <button class="demo-role" data-act="login" data-role="${k}">
      <div class="ic" style="background:${r.color}22"><svg viewBox="0 0 16 16" fill="none"><path d="${r.icon}" stroke="${r.color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="rt"><div class="rn">${esc(r.name)}</div><div class="rd">${esc(r.desc)}</div></div>
      <svg class="arrow" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`).join('');
  $('login').innerHTML=`<div class="login-card">
    ${skyline}
    <div class="login-badge"><b>화성특례시</b>HWASEONG SPECIAL CITY</div>
    <div class="login-logo"><div class="mk">${shield}</div>
      <div><div class="login-t">SPC ONE</div><div class="login-t2">Smart Protocol &amp; Courtesy</div><div class="login-s">화성시 지능형 의전 운영 플랫폼</div></div></div>
    <p class="login-sub">행사 준비부터 도착·영접·소개·결과보고까지 실시간으로 연결하는 의전 지휘 플랫폼입니다.
      아래에서 <b>역할별 데모 계정</b>으로 접속하세요. 각 탭(또는 기기)을 서로 다른 역할로 열면 실시간 협업을 시연할 수 있습니다.</p>
    <div class="login-div">역할 선택 (데모 계정)</div>
    <div class="demo-roles">${roleCards}</div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:16px;font-size:12px;color:#9FB0A6;cursor:pointer;position:relative;z-index:1">
      <input type="checkbox" id="trust-dev" style="width:16px;height:16px;accent-color:var(--green)">
      이 기기 신뢰 (로그인 유지 · 오프라인 영구저장 허용) — 공용기기에서는 체크 해제</label>
    <div class="login-foot" style="margin-top:14px;font-size:11px;color:#9FB0A6;line-height:1.6;display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span>🔒 보안 연결 · 단말: ${esc(DEV_LABEL)} · 데모 데이터는 브라우저에만 저장됩니다.</span>
      <button class="btn btn-g btn-xs" data-act="demo-reset">데모 초기화</button></div>
  </div>`;
}
```

- [ ] **Step 3: 테스트 추가 (스모크 테스트)**

`tests/run.js`의 `__API` 목록에 `renderLogin`을 추가하고, `[수행원 표시]` 섹션 뒤에 추가. `renderLogin()`은 `$('login').innerHTML=...`을 수행하는 부수효과 함수라 반환값이 없으므로, 호출 후 예외가 나지 않는지와 `fakeEl()`의 `innerHTML` 속성에 실제로 값이 쓰였는지를 확인한다:

```js
console.log('\n[로그인 화면]');
let loginThrew=false;
try{A.renderLogin()}catch(e){loginThrew=true;console.log('   ✗',e.message)}
ok('renderLogin 예외 없이 실행됨',!loginThrew);
```

(참고: 테스트 하니스의 `document.getElementById`는 매번 새 `fakeEl()`을 반환하는 목이라 `$('login').innerHTML`의 실제 문자열 내용까지는 이 하니스로 검증하기 어렵다 — 그래서 "예외 없이 실행되는지"만 확인한다. `ROLES` 전체를 순회하며 `r.icon`을 읽으므로, 아이콘 필드 오타나 `undefined` 접근이 있으면 이 테스트가 잡아낸다.)

`tests/run.js`의 `__API` 목록에 `renderLogin`을 추가하려면 33행의 목록 끝에 `,renderLogin`을 붙인다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 통과, 전체 `═══ 결과: N 통과 / 0 실패 ═══`

- [ ] **Step 5: 브라우저에서 육안 확인**

Run: 로컬에서 `spc.html`을 브라우저로 열거나 Claude_Browser로 연다(로그인 전 화면이므로 로그인 불필요).
Expected: 어두운 녹색~검정 그라디언트 배경 위에 반투명 다크 카드, 우상단 "화성특례시" 배지, 카드 우상단에 스카이라인 실루엣, "SPC ONE / Smart Protocol & Courtesy" 로고, 금색 "역할 선택" 구분선, 7개 역할 카드에 색상 원형 아이콘과 우측 화살표가 보인다. 역할 카드를 클릭하면 기존과 동일하게 로그인된다(동작 로직은 변경 없음).

- [ ] **Step 6: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 로그인 화면에 스카이라인 일러스트·배지·역할 아이콘 반영"
```

---

## Self-Review Checklist
- [x] 스펙의 "수행원 데이터 모델" → Task 1(순수 함수) + Task 2(`eg.companions` 필드, `saveEg`에서 저장)
- [x] 스펙의 "입력 UI(내빈 행사 설정 모달)" → Task 2 Step 2
- [x] 스펙의 "표시(영접 관리 페이지)" → Task 2 Step 5
- [x] 스펙의 "결과보고·통계에는 노출 안 함" → 두 화면 모두 이번 계획에서 건드리지 않음(변경 없음 자체가 준수)
- [x] 스펙의 "로그인 화면 개선 — 카드 다크 테마, 배지, 스카이라인, 역할 아이콘+화살표, 금색 구분선" → Task 3(CSS) + Task 4(마크업)
- [x] 스펙의 "내부 앱 화면 디자인 시스템 유지" → CSS 변경 범위가 `.login-*`/`.demo-role*` 셀렉터로 한정되어 다른 화면에 영향 없음
- [x] 스펙의 "테스트 추가" → 각 태스크마다 TDD 사이클 또는 스모크 테스트 반영
