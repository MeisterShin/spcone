# CLAUDE.md — SPC ONE 개발 가이드 (Claude Code용)

이 파일은 Claude Code가 이 프로젝트를 이어서 작업할 때 가장 먼저 읽는 지침서다.

## 프로젝트 개요
**SPC ONE · 화성시 지능형 의전 운영 플랫폼.** 행사 준비 → 도착·영접 → 소개 → 결과보고를 실시간으로 연결하는 의전 지휘 웹앱. 경진대회 시연용 고완성도 데모이며, 설치 없이 `spc.html` 하나로 동작한다. 향후 React + Firebase 이관은 `SPC_ONE_React_Firebase_이관설계서.md` 참조.

- 저장소: 브라우저 `localStorage`(컬렉션 분리 구조) + 선택적 Firebase Firestore(다기기 실시간)
- 실시간: Firestore `onSnapshot`, 미설정 시 `BroadcastChannel`(같은 브라우저 탭 간)
- 원칙: **핵심 업무는 규칙 기반으로 안정 작동, AI는 보조·최종 결정은 담당자.** 데이터는 삭제 대신 상태 변경·이력 추가.

## 빠른 시작
- 실행: `spc.html`을 브라우저로 열기 (또는 정적 호스팅에 배포)
- 로직 테스트: `node tests/run.js` — 브라우저 없이 인라인 스크립트를 격리 VM에서 로드해 배정 diff·체크인 트랜잭션·오프라인 큐·추천엔진·전 역할×전 페이지 렌더·클라우드 경로를 검증(현재 11/11 통과). **코드 수정 후 반드시 재실행.**

## 아키텍처 (spc.html 단일 파일)
`<head>` CSS(디자인 토큰+컴포넌트) → `<body>` 최소 마크업(#login,#root,#modal-root,#pres,#toasts) → 인라인 `<script>`. 로직은 번호 섹션으로 구성:

| 섹션 | 내용 |
|---|---|
| 0 유틸 | `esc`(XSS 이스케이프·모든 사용자 입력에 필수), `choseong`, `fmt` 등 |
| 1 역할·권한 | `ROLES`, `ROLE_PERMS`, `can(perm)`, `eventAllowed(evId)` |
| 2 저장소 | `S`(메모리 컬렉션), `save(coll)`(localStorage+클라우드), 세션 |
| 4 실시간 | `BroadcastChannel`, `onRemoteUpdate` |
| 5 온·오프라인 | `isOnline`, `flushQueue`(멱등 큐), `toggleDemoOffline` |
| 6 감사·로그·알림 | `audit`, `pushCheckinLog`/`makeLog`, `notify` |
| 7 시드 | `seedIfEmpty` — **가상 인물만**(실명 금지) |
| 9~10 로그인·내비 | `renderLogin`,`login`,`logout`,`renderNav`,`nav` |
| 12 라우터 | `PAGES`, `rerender()` |
| 13 엔진 | `riskRadar`, `qualityIssues`(위험 레이더·품질 지킴이) |
| 14~25 페이지 | 대시보드/체크인/영접/내빈/일괄등록/행사/배정/의전순서/시나리오/발표/보고/통계/사용자 |
| 15 체크인 | `doCheckin`(트랜잭션·멱등·확인단계), `undoCheckin`, `adminUndo` |
| 20 배정 | `commitAssign` — **차이 반영 diff(유지/추가/해제), 기존 체크인 보존** |
| 21 코파일럿 | `recommend`(근거 포함), `computeOrder` |
| 22~23 시나리오·발표 | `latestApproved`, 버전관리, `openPresenter` |
| 26~30 모달 | `openModal`/`openConfirm`/`openReason`/각 편집 모달 |
| 32 이벤트 위임 | `ACTS` 맵 — 모든 `data-act`가 여기 연결(인라인 onclick 없음) |
| 34 클라우드 | `initCloud`,`cloudSave`,`bootstrapCloud` |

## 데이터 모델 (컬렉션 · `S` / Firestore `spc_*`)
`users, guests(내빈 기본), events, eventGuests(행사별 내빈), checkinLogs, scriptVersions, auditLogs, notif`.
- `eventGuests` 핵심 필드: `arrivalStatus`(expected→en_route→arrived→reception_complete→seated→departed, 예외 absent/cancelled), `protocolLevel`(VVIP/VIP/Guest), `attendanceType`(self/representative/companion), `manualOrder`, `introType`, `receptionUserIds[]`, `receptionLocation`, **`vehicleNo`,`parkingSpot`**, `companions[{name,role,phone}]`(수행원 명단), `synced`, `version`.
- 저장값은 영문 코드, 화면 표기는 한글(`ARR_LABEL`,`ATT_LABEL`).

## 디자인 시스템 (Notion 비즈니스 스타일)
- 참조 스펙: **`DESIGN-notion.md`** (색상·타이포·spacing·컴포넌트·Do/Don't 토큰).
- 적용 원칙: 따뜻한 종이 캔버스(`--bg #F7F6F4`)+흰색 표면, 뉴트럴 잉크 램프, 헤어라인+다층 미세 그림자(`--shadow`,`--shadow-2`), radius 체계(`--rxs`6/`--rs`8/`--rl`12/`--rxl`16/`--rfull`), Inter 타이포+음수 트래킹.
- **구조 액센트는 단 하나 — 화성 녹색(`--green`)**(CTA·링크·활성/포커스만). 상태색(위험/주의/정보)만 예외. 스티커성 색상 남발 금지.
- CSS 토큰은 `:root`에 집중. 색/모양 변경은 토큰만 수정하면 전 컴포넌트에 일관 반영.

## 실시간·오프라인·클라우드
- `FB_CONFIG`(스크립트 상단)를 채우면 Firestore 다기기 실시간이 켜지고, 비우면 로컬 모드로 정상 동작.
- 오프라인 시연 버튼: 클라우드 모드에선 Firestore 네트워크를 실제 disable/enable. 로컬 모드에선 큐+멱등 동기화.

## 배포
- GitHub Pages(정적) + Firebase Firestore(실시간). 절차는 `배포가이드_GitHubPages_Firebase.md` 참조. GitHub Pages는 `.nojekyll` 필요.

## 코딩 규칙 (반드시 준수)
1. 사용자 입력은 절대 `innerHTML`에 원문 삽입 금지 — 항상 `esc()`로 이스케이프.
2. 기존 체크인·도착 기록을 삭제하는 코드 금지. 삭제 대신 상태 변경(cancelled/undo)+이력.
3. 권한은 화면 숨김만으로 구현하지 말 것(`can()` + 서버 이관 시 Security Rules).
4. 중요한 변경은 `audit()`로 처리자·시각·전후값 기록.
5. 인라인 `onclick` 금지 — `data-act` + 섹션 32 `ACTS` 위임 사용.
6. AI(코파일럿)는 실패해도 규칙 기반 기본 기능이 계속 작동해야 함. 최종 확정은 담당자.
7. 기능 수정 후 `node tests/run.js` 통과 확인. 새 핵심 로직엔 테스트 추가.
8. 샘플·데모 데이터에 실명 금지(가상 인물만).

## 파일 맵
- `spc.html` — 앱 본체(전체 기능·디자인·로직)
- `index.html` — 접속 시 spc.html로 이동 / `.nojekyll` — GH Pages 정적 서빙
- `DESIGN-notion.md` — 디자인 시스템 스펙(디자인 작업의 기준)
- `SPC_ONE_React_Firebase_이관설계서.md` — 대규모 확장 시 React+Firestore 구조/규칙/마이그레이션
- `배포가이드_GitHubPages_Firebase.md` — 실시간 배포 절차
- `readme.md` — 사용자용 개요
- `tests/run.js` — 로직 검증 하니스(`node tests/run.js`)
- `spc_v4_backup_20260722.html` — 개선 전 원본 백업(참고용)

## 우선순위 (작업지시서 기준)
P0 데이터·보안 → P1 핵심(권한·실시간·오프라인·영접·시나리오 버전) → P2 AI 차별화(코파일럿·품질 지킴이·위험 레이더·결과보고) → P3 확장(좌석·동선·수행원·통계·조직 인증). 상세는 이관설계서.
