# 체크인 개선 3종 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `spc.html`에 (1) 명단 일괄입력·개별등록 시 기본 차량번호 입력, (2) 내빈 기본정보 사진 업로드 + 현장체크인 VIP 사진 확인 토글, (3) 행사별 게이트 모드 온/오프 스위치를 추가한다.

**Architecture:** 세 기능 모두 독립적이며 서로 다른 파일 위치를 건드린다. 차량번호는 기존 `guests`/`eventGuests` 필드 재사용 패턴을 그대로 따르고(마스터→행사 상속), 사진은 "저장할 값 결정" 순수 함수(`resolvePhotoField`)와 "파일→데이터URL 변환"(브라우저 전용, `handlePhotoFile`)을 분리해 전자만 자동테스트하고, 게이트 스위치는 이미 있는 `event.gates` 배열에 독립된 boolean 필드 하나(`gatesEnabled`)를 얹는다.

**Tech Stack:** 순수 JS(ES2019), 브라우저 네이티브 `FileReader`/`Image`/`Canvas`(신규 라이브러리 없음).

## Global Constraints
- 사용자 입력을 `innerHTML`에 넣을 때는 반드시 `esc()`로 이스케이프 (CLAUDE.md 코딩 규칙 1). 단, `photo` 필드는 우리 코드가 `canvas.toDataURL()`로만 생성하는 값이라 사용자가 직접 입력하는 텍스트가 아님 — `<img src="${g.photo}">`에 `esc()`를 적용하지 않는 것은 의도적 예외다(따옴표·꺾쇠 등이 절대 섞이지 않는 값이므로).
- 인라인 `onclick` 금지, 클릭 액션은 전부 `data-act` + `ACTS` 위임 사용. 파일 입력(`<input type=file>`)은 클릭이 아니라 `change` 이벤트이므로, 기존에 이미 있는 `document.addEventListener('change', ...)` 리스너를 확장한다(두 번째 리스너 추가 금지).
- 기능 수정 후 `node tests/run.js` 통과 필수. 사진 리사이즈(`handlePhotoFile`)는 `Image`/`Canvas`가 필요해 Node 테스트 하니스로 자동테스트할 수 없다 — 이 함수는 육안 확인으로 대체(계획에 명시, 좌석배치 드래그앤드롭 태스크와 동일한 전례). 그 대신 "저장 시 어떤 값을 쓸지 결정하는" 로직은 `resolvePhotoField(draft)`라는 순수 함수로 분리해 반드시 자동테스트한다.
- 새 Firestore 컬렉션 추가 없음 — `guests`/`events`에 필드만 추가.
- 게이트 모드 스위치(`gatesEnabled`)가 명시적으로 설정되지 않은 기존 행사는 `gates.length>0`이면 게이트 모드를 유지해야 한다(회귀 없음).
- 사진·차량번호 모두 선택 입력이며 없어도 기존과 100% 동일하게 동작해야 한다.

---

### Task 1: 차량번호 마스터 필드 + 일괄입력 파싱 + 배정 시 상속

**Files:**
- Modify: `spc.html` — `renderPaste`(현재 1145행), `parsePaste`(1159행), `commitPaste`(1191행)
- Modify: `spc.html` — `openGuestModal`(1809행), `saveGuest`(1824행)
- Modify: `spc.html` — `commitAssign`(1275행)의 `toAdd.forEach` 블록
- Test: `tests/run.js`

**Interfaces:**
- Produces: `guests[].vehicleNo:string`(기본 차량번호, 선택). `commitAssign`/`saveGuest`(긴급 내빈 추가 경로)가 신규 `eventGuests[].vehicleNo`를 이 값으로 초기화.

- [ ] **Step 1: `renderPaste` 안내문에 차량번호 열 추가**

`spc.html`의 `renderPaste` 함수에서 아래 줄을 찾아:

```js
        <p class="hint">열 순서: 이름 · 소속 · 직위 · 등급(VVIP/VIP/Guest) · 그룹. 이름만 있어도 등록됩니다. HTML·스크립트 문자열은 자동 무력화됩니다.</p>
```

아래로 교체:

```js
        <p class="hint">열 순서: 이름 · 소속 · 직위 · 등급(VVIP/VIP/Guest) · 그룹 · 차량번호(선택). 이름만 있어도 등록됩니다. HTML·스크립트 문자열은 자동 무력화됩니다.</p>
```

- [ ] **Step 2: `parsePaste`에서 6번째 열(차량번호) 파싱**

`function parsePaste(){`를 통째로 아래로 교체:

```js
function parsePaste(){
  const raw=($('paste-ta').value||'').trim();
  if(!raw){toast('텍스트를 입력하세요','err');return}
  const lines=raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const seen=new Set();pasteRows=[];
  lines.forEach(line=>{
    const sep=line.includes('\t')?'\t':',';
    const c=line.split(sep).map(x=>x.trim());
    const[name='',org='',pos='',rawLvl='',grp='',vehicleNo='']=c;
    const issues=[];
    if(!name){pasteRows.push({ok:false,name:line.slice(0,40),reason:'이름 없음'});return}
    if(/[<>]|script|onerror|onclick/i.test(line))issues.push('위험 문자 제거됨');
    if(name.length>40)issues.push('이름 길이 초과');
    const ul=rawLvl.toUpperCase();
    let lvl='Guest';if(['VVIP','VIP'].includes(ul))lvl=ul;else if(ul==='GUEST')lvl='Guest';else if(rawLvl)issues.push('등급 보정(Guest)');
    const dupInFile=seen.has(name+'|'+org);seen.add(name+'|'+org);
    const dupInDb=S.guests.some(g=>g.isActive&&g.name===name&&(g.org||'')===org);
    if(dupInFile)issues.push('파일 내 중복');
    if(dupInDb)issues.push('기존 등록 중복 후보');
    const clean=v=>String(v).replace(/[<>]/g,'').slice(0,80);
    pasteRows.push({ok:true,warn:issues.length>0,skip:dupInFile,
      name:clean(name),org:clean(org),pos:clean(pos),lvl,grp:GRP_LIST.includes(grp)?grp:'기타',vehicleNo:clean(vehicleNo),issues});
  });
  const ok=pasteRows.filter(r=>r.ok&&!r.skip).length,warn=pasteRows.filter(r=>r.warn&&!r.skip).length,sk=pasteRows.filter(r=>!r.ok||r.skip).length;
  $('prev-cnt').textContent=`정상 ${ok} · 주의 ${warn} · 제외 ${sk}`;
  $('paste-preview').innerHTML=`<div class="tbl-wrap"><table class="ptbl"><thead><tr><th>이름</th><th>소속</th><th>직위</th><th>등급</th><th>차량번호</th><th>비고</th></tr></thead>
    <tbody>${pasteRows.map(r=>`<tr class="${!r.ok||r.skip?'skip':r.warn?'warn':'ok'}">
      <td>${esc(r.name)}</td><td>${esc(r.org||'—')}</td><td>${esc(r.pos||'—')}</td><td>${r.ok?esc(r.lvl):'—'}</td><td>${esc(r.vehicleNo||'—')}</td>
      <td style="font-size:11px;color:var(--gray5)">${esc((r.reason?[r.reason]:r.issues||[]).join(', ')||'정상')}</td></tr>`).join('')}</tbody></table></div>
    <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
      <button class="btn btn-p" data-act="paste-commit">정상·주의 ${ok+warn}건 등록</button></div>`;
}
```

(변경 요약: 분해 구조에 `vehicleNo=''` 추가, `pasteRows.push`에 `vehicleNo:clean(vehicleNo)` 추가, 미리보기 표 헤더·행에 "차량번호" 열 추가. 나머지 검증 로직은 동일.)

- [ ] **Step 3: `commitPaste`에서 마스터 등록 시 차량번호 저장**

`function commitPaste(){` 안의 `S.guests.push({...})` 줄을 찾아:

```js
  items.forEach(r=>{S.guests.push({id:uid('g'),name:r.name,org:r.org,pos:r.pos,defaultLevel:r.lvl,grp:r.grp,
    namePron:'',orgPron:'',publicNote:'',privateNote:'',eventRelevanceDefault:1,isActive:true,createdAt:now(),updatedAt:now()});added++});
```

아래로 교체:

```js
  items.forEach(r=>{S.guests.push({id:uid('g'),name:r.name,org:r.org,pos:r.pos,defaultLevel:r.lvl,grp:r.grp,
    namePron:'',orgPron:'',publicNote:'',privateNote:'',vehicleNo:r.vehicleNo||'',eventRelevanceDefault:1,isActive:true,createdAt:now(),updatedAt:now()});added++});
```

- [ ] **Step 4: `openGuestModal`에 "기본 차량번호" 입력 필드 추가**

`function openGuestModal(id,urgent){` 안의 `body` 템플릿에서 `${f('이름 발음','g-pron',g?.namePron)}${f('행사 관련성(0-3)','g-rel',g?.eventRelevanceDefault??1,'number')}` 줄 바로 다음에 추가:

```js
    ${f('기본 차량번호','g-veh',g?.vehicleNo)}
```

- [ ] **Step 5: `saveGuest`에서 차량번호 저장**

`function saveGuest(){` 안의 `const d={...}` 객체 리터럴에서 `eventRelevanceDefault:clamp(parseInt($('g-rel').value)||0,0,3),` 줄 바로 다음에 추가:

```js
    vehicleNo:$('g-veh').value.trim(),
```

- [ ] **Step 6: `commitAssign`과 `saveGuest`의 긴급 내빈 추가 경로에서 마스터 차량번호 상속**

`function commitAssign(){` 안의 `toAdd.forEach` 블록에서 `receptionUserIds:[],receptionLocation:'',vehicleNo:'',parkingSpot:'',`를 찾아 `vehicleNo:''`를 `vehicleNo:g.vehicleNo||''`로 교체:

```js
        manualOrder:null,introType:'individual',receptionRequired:g.defaultLevel==='VVIP',receptionUserIds:[],receptionLocation:'',vehicleNo:g.vehicleNo||'',parkingSpot:'',
```

`function saveGuest(){` 안의 `if(URGENT){...}` 블록에서 동일한 패턴(`vehicleNo:''`)을 찾아 똑같이 `vehicleNo:g.vehicleNo||''`로 교체:

```js
        manualOrder:null,introType:'individual',receptionRequired:g.defaultLevel==='VVIP',receptionUserIds:[],receptionLocation:'',vehicleNo:g.vehicleNo||'',parkingSpot:'',
```

(두 곳 모두 같은 문자열이 나타나므로, 각 함수 안에서 정확히 그 함수에 속한 줄만 교체할 것 — `commitAssign` 안의 것과 `saveGuest` 안의 것 각각 1곳씩, 총 2곳.)

- [ ] **Step 7: 테스트 추가 (실패 상태)**

`tests/run.js`의 `[좌석배치 페이지]` 섹션 뒤, `// ── 클라우드 경로 ──` 주석 이전에 추가:

```js
console.log('\n[차량번호 마스터 상속]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const vehGid=A.uid('g');
A.S.guests.push({id:vehGid,name:'차량테스트',org:'t',pos:'과장',defaultLevel:'Guest',grp:'기타',vehicleNo:'99가 9999',isActive:true,eventRelevanceDefault:1});
const currentAssigned=A.S.eventGuests.filter(e=>e.eventId===evId&&e.arrivalStatus!=='cancelled').map(e=>({value:e.guestId}));
MOCK_QS['.asgn-cb:checked']=currentAssigned.concat([{value:vehGid}]);
A.setASGN(evId);A.commitAssign();
const addedEg=A.S.eventGuests.find(e=>e.eventId===evId&&e.guestId===vehGid);
ok('신규 배정 시 마스터 차량번호가 eventGuests.vehicleNo로 상속됨',addedEg&&addedEg.vehicleNo==='99가 9999');
```

이 테스트는 이미 존재하는 함수(`commitAssign`)만 사용하므로 `__API` 목록을 새로 추가할 필요는 없다(이미 포함돼 있음). Step 6을 적용하기 전에는 `addedEg.vehicleNo`가 `''`라서 이 테스트가 실패해야 한다 — Step 6 적용 후 다시 실행해 통과를 확인하는 순서로 진행할 것.

- [ ] **Step 8: 테스트 실행 → 실패 확인 (Step 6 적용 전)**

Run: `node tests/run.js`
Expected: `✗ 실패: 신규 배정 시 마스터 차량번호가 eventGuests.vehicleNo로 상속됨`

- [ ] **Step 9: 테스트 실행 → 통과 확인 (Step 6 적용 후)**

Run: `node tests/run.js`
Expected: 새 항목 통과, 전체 회귀 없음

- [ ] **Step 10: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 명단 일괄입력·개별등록에 기본 차량번호 추가, 행사 배정 시 상속"
```

---

### Task 2: 내빈 사진 업로드 (저장 로직 분리 + 모달 UI)

**Files:**
- Modify: `spc.html` — `openGuestModal`(Task 1 이후 줄 번호로 다시 확인), `saveGuest`
- Modify: `spc.html` — 새 함수 `resolvePhotoField`,`handlePhotoFile` 추가(`saveGuest` 함수 앞)
- Modify: `spc.html` — `document.addEventListener('change', ...)` 리스너 확장(파일 입력 처리)
- Modify: `spc.html` — `ACTS`에 `g-photo-rm` 추가
- Test: `tests/run.js`

**Interfaces:**
- Produces: `guests[].photo:string|undefined`(base64 데이터 URI, 240×240 리사이즈된 JPEG). `resolvePhotoField(draft:string|null): {photo?:string}` — `draft`가 `null`이면 빈 객체(필드 변경 없음), `''`나 데이터 URI 문자열이면 `{photo:draft}`.
- Consumes: 없음(순수 함수, Task 3이 `guests[].photo`를 읽어 씀)

- [ ] **Step 1: `resolvePhotoField` 테스트 추가 (실패 상태)**

`tests/run.js`의 `__API` 목록(33행)에 `resolvePhotoField`를 추가한다.

Task 1에서 추가한 `[차량번호 마스터 상속]` 섹션 뒤에 추가:

```js
console.log('\n[사진 저장 로직]');
ok('변경 없음(null)이면 photo 키 자체가 없음',Object.keys(A.resolvePhotoField(null)).length===0);
ok('제거(빈 문자열)면 {photo:\'\'}',A.resolvePhotoField('').photo==='');
ok('신규 교체(데이터URL)면 그 값 그대로',A.resolvePhotoField('data:image/jpeg;base64,xyz').photo==='data:image/jpeg;base64,xyz');
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.resolvePhotoField is not a function` 에러로 실패

- [ ] **Step 3: `resolvePhotoField`/`handlePhotoFile` 구현 추가**

`spc.html`의 `function saveGuest(){` 바로 앞에 추가:

```js
let GUEST_PHOTO_DRAFT=null; // null=변경 없음, ''=제거, 데이터URL=신규 교체
function resolvePhotoField(draft){return draft!==null?{photo:draft}:{}}
function handlePhotoFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const size=240;
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext('2d');
      const scale=Math.max(size/img.width,size/img.height);
      const w=img.width*scale,h=img.height*scale;
      ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);
      GUEST_PHOTO_DRAFT=canvas.toDataURL('image/jpeg',0.75);
      const prev=$('g-photo-preview');if(prev){prev.src=GUEST_PHOTO_DRAFT;prev.style.display=''}
    };
    img.src=reader.result;
  };
  reader.readAsDataURL(file);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 3개 항목 통과

- [ ] **Step 5: `openGuestModal`에 사진 업로드 UI 추가**

`function openGuestModal(id,urgent){` 함수 첫 줄(`GUEST_EDIT=id||null;URGENT=!!urgent;const g=id?byId(S.guests,id):null;`) 바로 다음에 추가:

```js
  GUEST_PHOTO_DRAFT=null;
```

`body` 템플릿에서 Task 1의 `${f('기본 차량번호','g-veh',g?.vehicleNo)}` 줄 바로 다음에 추가:

```js
    <div class="fl fg-full"><label>사진</label><div style="display:flex;align-items:center;gap:10px">
      <img id="g-photo-preview" src="${g?.photo||''}" style="width:56px;height:56px;border-radius:8px;object-fit:cover;background:var(--gray1);${g?.photo?'':'display:none'}">
      <input type="file" accept="image/*" id="g-photo-file" data-act="g-photo-file">
      ${g?.photo?'<button type="button" class="btn btn-g btn-xs" data-act="g-photo-rm">사진 제거</button>':''}
    </div></div>
```

- [ ] **Step 6: `saveGuest`에서 `resolvePhotoField` 사용**

`function saveGuest(){` 안의 `const d={...}` 객체 리터럴 다음 줄(객체 리터럴을 닫는 `};` 다음)에 추가:

```js
  if(GUEST_PHOTO_DRAFT!==null)Object.assign(d,resolvePhotoField(GUEST_PHOTO_DRAFT));
```

- [ ] **Step 7: `change` 리스너 확장, `g-photo-rm` ACTS 추가**

`spc.html`에서 `document.addEventListener('change',e=>{const a=e.target.dataset.act;`로 시작하는 블록을 찾아 마지막 조건 `else if(a==='rpt-privacy'){RPT_PRIVACY=e.target.checked;rerender()}});` 를 아래로 교체:

```js
  else if(a==='rpt-privacy'){RPT_PRIVACY=e.target.checked;rerender()}
  else if(a==='g-photo-file'){handlePhotoFile(e.target.files[0])}});
```

`const ACTS={` 블록 안에 `'demo-offline':()=>toggleDemoOffline(),` 항목 다음에 추가:

```js
'g-photo-rm':()=>{GUEST_PHOTO_DRAFT='';const prev=$('g-photo-preview');if(prev){prev.src='';prev.style.display='none'}},
```

- [ ] **Step 8: 전체 테스트 실행 → 회귀 없음 확인**

Run: `node tests/run.js`
Expected: 기존 통과 수 그대로 유지("전 역할 × 전 페이지 렌더" 포함, 이 태스크는 렌더 함수 자체를 바꾸지 않음).

- [ ] **Step 9: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 내빈 기본정보에 사진 업로드 추가(브라우저 리사이즈, resolvePhotoField로 저장 로직 분리)"
```

---

### Task 3: 현장 체크인 VIP 사진 확인 토글

**Files:**
- Modify: `spc.html:913` (`CI_SHOW_PHOTO` 상태 변수 추가)
- Modify: `spc.html` — `renderCI` 함수(토글 버튼 + 아바타 분기)
- Modify: `spc.html` — `ACTS`에 `ci-toggle-photo` 추가
- Test: `tests/run.js`

**Interfaces:**
- Consumes: `guests[].photo`(Task 2)
- Produces: 없음(터미널 UI — 다른 태스크가 의존하지 않음)

- [ ] **Step 1: `CI_SHOW_PHOTO` 상태 변수 추가**

`spc.html:913`을 찾아:

```js
let CI_FILTER='all',CI_Q='';
```

아래로 교체:

```js
let CI_FILTER='all',CI_Q='',CI_SHOW_PHOTO=false;
```

- [ ] **Step 2: 테스트 추가 (실패 상태)**

`tests/run.js`의 `__API` 목록에 `setShowPhoto:b=>{CI_SHOW_PHOTO=b}`를 추가한다(다른 setter들처럼 인라인 화살표 함수로 추가 — `setOffline`과 같은 패턴).

Task 2의 `[사진 저장 로직]` 섹션 뒤에 추가:

```js
console.log('\n[VIP 사진 토글]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const photoGid=A.uid('g');
A.S.guests.push({id:photoGid,name:'사진테스트',org:'t',pos:'과장',defaultLevel:'VIP',grp:'기타',photo:'data:image/jpeg;base64,ABCDEF',isActive:true,eventRelevanceDefault:1});
const currentAssigned2=A.S.eventGuests.filter(e=>e.eventId===evId&&e.arrivalStatus!=='cancelled').map(e=>({value:e.guestId}));
MOCK_QS['.asgn-cb:checked']=currentAssigned2.concat([{value:photoGid}]);
A.setASGN(evId);A.commitAssign();
A.setShowPhoto(true);
ok('사진 표시 켜면 VIP 사진 데이터가 렌더링됨',A.renderCI().includes('data:image/jpeg;base64,ABCDEF'));
A.setShowPhoto(false);
ok('사진 표시 끄면 기존처럼 이니셜만(사진 데이터 노출 안 됨)',!A.renderCI().includes('data:image/jpeg;base64,ABCDEF'));
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: `A.setShowPhoto is not a function` 에러로 실패

- [ ] **Step 4: `renderCI`에 토글 버튼 + 아바타 분기 추가**

`function renderCI(){` 안의 `right` 템플릿에서 아래 줄:

```js
  const right=`${eventSelector()}
    <button class="btn ${DEMO_OFFLINE?'btn-w':'btn-s'} btn-sm" data-act="demo-offline">${DEMO_OFFLINE?'오프라인 해제':'오프라인 시연'}</button>
    ${can('checkin.do')?`<button class="btn btn-s btn-sm" data-act="urgent-add">긴급 내빈 추가</button>`:''}`;
```

아래로 교체:

```js
  const right=`${eventSelector()}
    <button class="btn ${DEMO_OFFLINE?'btn-w':'btn-s'} btn-sm" data-act="demo-offline">${DEMO_OFFLINE?'오프라인 해제':'오프라인 시연'}</button>
    <button class="btn ${CI_SHOW_PHOTO?'btn-w':'btn-s'} btn-sm" data-act="ci-toggle-photo">${CI_SHOW_PHOTO?'사진 숨기기':'VIP 사진 표시'}</button>
    ${can('checkin.do')?`<button class="btn btn-s btn-sm" data-act="urgent-add">긴급 내빈 추가</button>`:''}`;
```

같은 함수 안의 카드 렌더링에서 아래 줄:

```js
  const cards=list.map(eg=>{const g=guestOf(eg);const done=isArrived(eg.arrivalStatus);const vv=eg.protocolLevel==='VVIP';
    const dup=S.guests.filter(x=>x.isActive&&x.name===g.name).length>1;
    const top=`<div class="ci-top"><div class="av av32 ${avCls(eg.protocolLevel)}">${esc(dispName(eg)[0]||'?')}</div>
```

아래로 교체:

```js
  const cards=list.map(eg=>{const g=guestOf(eg);const done=isArrived(eg.arrivalStatus);const vv=eg.protocolLevel==='VVIP';
    const dup=S.guests.filter(x=>x.isActive&&x.name===g.name).length>1;
    const showPhoto=CI_SHOW_PHOTO&&(eg.protocolLevel==='VVIP'||eg.protocolLevel==='VIP')&&g.photo;
    const avatarHtml=showPhoto?`<img class="av av32" src="${g.photo}" style="object-fit:cover">`:`<div class="av av32 ${avCls(eg.protocolLevel)}">${esc(dispName(eg)[0]||'?')}</div>`;
    const top=`<div class="ci-top">${avatarHtml}
```

(나머지 `top` 템플릿의 이름·소속·직위 부분은 그대로 둔다 — 아바타 한 줄만 변수로 대체.)

- [ ] **Step 5: `ACTS`에 토글 액션 추가**

`const ACTS={` 블록 안에 Task 2에서 추가한 `'g-photo-rm':...,` 항목 다음에 추가:

```js
'ci-toggle-photo':()=>{CI_SHOW_PHOTO=!CI_SHOW_PHOTO;rerender()},
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 항목 통과, "전 역할 × 전 페이지 렌더" 여전히 0건 오류(사진 없는 기존 내빈들은 `g.photo`가 `undefined`라 `showPhoto`가 항상 falsy — 기존 이니셜 렌더링과 동일하게 동작).

- [ ] **Step 7: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 현장 체크인에 VIP 사진 확인 토글 추가"
```

---

### Task 4: 행사별 게이트 모드 온/오프 스위치

**Files:**
- Modify: `spc.html` — `openEventModal`(게이트 섹션에 체크박스 추가), `saveEvent`(`gatesEnabled` 저장)
- Modify: `spc.html` — `renderCI`의 `hasGates` 계산식
- Test: `tests/run.js`

**Interfaces:**
- Produces: `events[].gatesEnabled:boolean`(명시적으로 `false`가 아니면 게이트 모드 활성 — 기존 행사와의 호환을 위해 미설정 시 `gates.length>0`으로 판단)

- [ ] **Step 1: 테스트 추가 (실패 상태)**

Task 3의 `[VIP 사진 토글]` 섹션 뒤에 추가:

```js
console.log('\n[게이트 모드 스위치]');
A.setCUR({id:'u1',role:'chief',name:'검증자',assignedEventIds:[]});
const switchEv=A.byId(A.S.events,evId);
switchEv.gates=[{id:'sw1',name:'테스트게이트'}];
switchEv.gatesEnabled=false;
ok('gatesEnabled=false면 게이트가 있어도 단일 체크인 모드(gate-btn 없음)',!A.renderCI().includes('gate-btn'));
switchEv.gatesEnabled=true;
ok('gatesEnabled=true(명시)면 게이트 모드',A.renderCI().includes('gate-btn'));
delete switchEv.gatesEnabled;
ok('gatesEnabled 미설정(기존 행사)이고 게이트가 있으면 기본적으로 게이트 모드(회귀 없음)',A.renderCI().includes('gate-btn'));
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node tests/run.js`
Expected: 첫 번째 새 항목(`gatesEnabled=false`)이 실패(현재 `hasGates`는 `gates.length>0`만 보고 `gatesEnabled`를 무시하므로 `gate-btn`이 여전히 나타남)

- [ ] **Step 3: `renderCI`의 `hasGates` 계산식 수정**

`function renderCI(){` 안의 아래 줄을 찾아:

```js
  const gates=ev.gates||[];const hasGates=gates.length>0;
```

아래로 교체:

```js
  const gates=ev.gates||[];const hasGates=gates.length>0&&ev.gatesEnabled!==false;
```

- [ ] **Step 4: `openEventModal`에 게이트 모드 체크박스 추가**

`function openEventModal(id){` 안의 `body` 템플릿에서 아래 줄을 찾아:

```js
    <div class="fl fg-full"><label>게이트(동선)</label><div id="evt-gate-list">${renderGateRows()}</div>
      <button type="button" class="btn btn-g btn-xs" data-act="evt-gate-add" style="margin-top:6px">+ 게이트 추가</button></div>
```

아래로 교체:

```js
    <div class="fl fg-full"><label>게이트(동선)</label>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12.5px;color:var(--gray6)">
        <input type="checkbox" id="e-gates-on" ${ev?.gatesEnabled!==false?'checked':''} style="accent-color:var(--green)">
        게이트 모드 사용 — 끄면 현장 체크인에서 단일 체크인 버튼만 표시</label>
      <div id="evt-gate-list">${renderGateRows()}</div>
      <button type="button" class="btn btn-g btn-xs" data-act="evt-gate-add" style="margin-top:6px">+ 게이트 추가</button></div>
```

- [ ] **Step 5: `saveEvent`에서 `gatesEnabled` 저장**

`function saveEvent(){` 안의 `const d={...}` 객체 리터럴에서 `gates:sanitizeGates(EVT_GATES),updatedAt:now()};`를 찾아 아래로 교체:

```js
    gates:sanitizeGates(EVT_GATES),gatesEnabled:$('e-gates-on').checked,updatedAt:now()};
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `node tests/run.js`
Expected: 새 3개 항목 모두 통과, 전체 회귀 없음("전 역할 × 전 페이지 렌더" 포함 — 시드 행사는 `gatesEnabled` 미설정 상태로 남아있지만 `gates.length>0`이라 여전히 게이트 모드로 렌더링되어 기존 동작 유지).

- [ ] **Step 7: 브라우저에서 육안 확인**

Run: 로컬에서 `spc.html`을 브라우저로 열거나 Claude_Browser로 연다.
Expected:
1. **차량번호**: 명단 일괄등록에서 "이름,소속,직위,VIP,산업계,12가3456" 형식으로 붙여넣고 검증하면 미리보기에 차량번호 열이 보이고, 등록 후 그 내빈을 행사에 배정하면 내빈 행사 설정 모달의 "차량번호" 필드에 자동으로 채워져 있다.
2. **사진**: 내빈 기본정보에서 VIP 내빈을 수정 → 사진 파일 선택 → 미리보기가 뜬다 → 저장. 현장 체크인 페이지에서 "VIP 사진 표시" 버튼을 누르면 그 내빈의 카드 아바타가 사진으로 바뀌고, 다시 누르면 이니셜로 돌아온다. Guest 등급 내빈은 토글과 무관하게 항상 이니셜이다.
3. **게이트 모드 스위치**: 게이트가 설정된 행사를 수정 화면에서 열어 "게이트 모드 사용" 체크를 끄고 저장하면, 현장 체크인이 즉시 단일 큰 체크인 버튼 모드로 바뀐다. 다시 체크해서 저장하면 게이트 버튼들이 돌아오고, 그동안 등록해뒀던 게이트 목록 자체는 지워지지 않고 그대로 남아 있다.

- [ ] **Step 8: 커밋**

```bash
git add spc.html tests/run.js
git commit -m "feat: 행사별 게이트 모드 온/오프 스위치 추가(게이트 목록 유지한 채 전환)"
```

---

## Self-Review Checklist
- [x] 스펙의 "일괄입력 차량번호" → Task 1
- [x] 스펙의 "마스터→행사 상속, 행사별 개별 수정 가능" → Task 1 Step 6(상속) + 기존 "내빈 행사 설정" 모달(변경 없음, 행사별 개별 수정 그대로 유지됨)
- [x] 스펙의 "사진은 내빈 기본정보에서 추가" → Task 2
- [x] 스펙의 "체크박스로 사진 확인, 언체크시 지금처럼" → Task 3(페이지 전체 토글 1개, 사용자 확인 사항대로)
- [x] 스펙의 "VVIP+VIP 둘 다 적용" → Task 3의 `showPhoto` 조건
- [x] 스펙의 "게이트 목록을 지우지 않고 모드 전환, 행사에 저장" → Task 4
- [x] 스펙의 "기존 행사 회귀 없음(gatesEnabled 미설정 시 게이트 있으면 게이트 모드)" → Task 4 Step 3의 `!==false` 조건 + 테스트로 명시적 검증
- [x] 스펙의 "사진 리사이즈는 브라우저 전용, 저장 로직만 테스트" → Task 2의 `resolvePhotoField`/`handlePhotoFile` 분리
- [x] 스펙의 "회귀 없음(선택 입력)" → 세 기능 모두 필드가 없거나 꺼져 있으면 기존과 동일하게 렌더링되도록 각 태스크에서 조건부 처리
