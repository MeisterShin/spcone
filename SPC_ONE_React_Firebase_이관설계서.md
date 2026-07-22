# SPC ONE · React + Firebase 이관 설계서

> 본 문서는 현재 배포된 단일 HTML 완성품(`spc.html`)을 작업지시서 5장 권장 구조인 **React + TypeScript + Firebase**로 이관하기 위한 설계서다. 단일 HTML 데모에서 이미 검증한 데이터 모델·상태 전이·권한·트랜잭션·감사 규칙을 그대로 서버 강제(server-enforced) 구조로 옮기는 것을 목표로 한다.

---

## 1. 이관 원칙

핵심 업무는 규칙 기반으로 안정적으로 작동하고, 인공지능은 판단을 보조하되 최종 결정은 담당자가 수행한다는 원칙을 유지한다. 이관 시 다음을 지킨다.

1. 단일 HTML의 검증된 로직(배정 diff, 체크인 트랜잭션, 멱등 큐, 감사기록)을 순수 함수로 추출하여 그대로 재사용한다.
2. Firebase 종속 코드가 화면 전체에 퍼지지 않도록 저장소 인터페이스(`repositories/`)를 두고, 화면은 인터페이스만 의존한다.
3. 권한은 클라이언트 화면 숨김이 아니라 **Firestore Security Rules**에서 강제한다.
4. 모든 비밀키·관리자 권한은 클라이언트 코드에 포함하지 않는다.
5. 데이터 삭제보다 상태 변경과 이력 추가를 우선한다(소프트 삭제).

---

## 2. 폴더 구조

작업지시서 5.3을 따르되, 단일 HTML에서 추출한 순수 로직의 배치를 명시한다.

```text
src/
 ├─ app/
 │   ├─ router/           # 역할별 라우트 가드 (can(perm) + eventAllowed)
 │   ├─ providers/        # AuthProvider, FirestoreProvider, OfflineProvider
 │   └─ permissions/      # ROLE_PERMS 매트릭스 (spc.html의 ROLE_PERMS 이식)
 ├─ components/
 │   ├─ common/           # Badge, Stat, Toast, Modal, ConnBadge
 │   ├─ dashboard/        # RiskRadar, QualityGuardian, StatGrid
 │   ├─ checkin/          # CheckinGrid, CheckinCard, OfflineBanner
 │   ├─ protocol/         # OrderEditor(DnD), CopilotReasons
 │   └─ presenter/        # PresenterStage, NewVersionBanner
 ├─ features/
 │   ├─ auth/             # Firebase Auth 연동, 역할 클레임 로딩
 │   ├─ events/ guests/ attendance/ checkin/
 │   ├─ protocol-order/   # computeOrder, recommend (순수 함수 그대로 이식)
 │   ├─ scripts/          # scriptVersions 버전관리
 │   ├─ notifications/    # 역할 타겟 알림
 │   └─ reports/          # reportData 집계
 ├─ services/
 │   ├─ firebase/         # firebaseApp, auth, db 초기화 (env 주입)
 │   ├─ repositories/     # ★ 저장소 인터페이스 + Firestore 구현체 + Local 구현체
 │   ├─ audit/            # writeAudit()
 │   └─ ai/              # copilot(문안·근거) — 실패 시 규칙 기반 폴백
 ├─ schemas/              # zod 스키마 (입력·파일 검증)
 ├─ hooks/                # useEvent, useEventGuests(실시간), useOfflineQueue
 ├─ utils/                # esc/choseong/fmt (spc.html에서 이식)
 ├─ types/                # 아래 7장 타입 정의
 └─ tests/                # 15장 시나리오 이식 (Vitest + Playwright)
```

`services/repositories/`가 이관의 핵심이다. 단일 HTML의 `S`(메모리 배열) + `save()`(localStorage + BroadcastChannel)를 `IRepository` 인터페이스로 추상화하고, Firestore 구현체와 Local 구현체를 교체 가능하게 둔다. 이로써 향후 화성시 내부 인프라나 다른 DB로 이전할 수 있다.

```ts
export interface IRepository<T> {
  watch(query: Query): Unsubscribe;              // 실시간 리스너
  get(id: string): Promise<T | null>;
  runTransaction<R>(fn: (tx) => Promise<R>): Promise<R>;
  add(doc: T): Promise<string>;
  update(id: string, patch: Partial<T>, expectedVersion?: number): Promise<void>;
}
```

---

## 3. 기술 매핑 (단일 HTML → Firebase)

| 단일 HTML 구현 | Firebase 이관 |
| --- | --- |
| `localStorage` 컬렉션(`S`) | Cloud Firestore 컬렉션 |
| `BroadcastChannel`(탭=단말 시뮬레이션) | Firestore `onSnapshot` 실시간 리스너 |
| 오프라인 큐(`S.queue`) + `flushQueue` | Firestore 오프라인 지속성(IndexedDB) + PWA |
| `idempotencyKey` 로그 중복 방지 | Cloud Functions 트랜잭션 + 문서 ID = idempotencyKey |
| `can(perm)` 클라이언트 게이트 | Firestore Security Rules(서버 강제) + 화면 보조 |
| `audit()` | `auditLogs` 컬렉션(쓰기 전용, 삭제 불가 규칙) |
| 역할별 데모 계정 | Firebase Auth + Custom Claims(role) |

Firestore는 연결 기기에 실시간 변경을 전달하고, 오프라인 접근·재연결 동기화를 기본 지원한다. 다만 동일 문서 충돌은 기본적으로 마지막 쓰기 우선이므로, 체크인처럼 중요한 처리는 **트랜잭션 + `version` 필드 + 변경이력**으로 보호한다(단일 HTML에서 검증한 방식 그대로).

---

## 4. 데이터 모델 (Firestore 컬렉션)

단일 HTML의 컬렉션 구조를 그대로 사용한다. 최상위 컬렉션 + 서브컬렉션 혼합 권장.

```text
users/{uid}                     name, dept, email, role, assignedEventIds[], status, lastLoginAt
guests/{guestId}                name, org, pos, protocolGroup, defaultLevel,
                                namePronunciation, orgPronunciation,
                                publicProfile, privateNote, isActive, createdAt, updatedAt
events/{eventId}                title, eventType, date, startTime, endTime, location,
                                hostDepartment, managerUserIds[], status, retentionUntil, version
events/{eventId}/eventGuests/{egId}
                                guestId, invitationStatus, attendanceType, representativeName/Position,
                                protocolLevel, protocolGroup, eventRelevance, manualOrder, introductionType,
                                receptionRequired, receptionUserIds[], receptionLocation, expectedArrivalAt,
                                arrivalStatus, checkedInAt, checkedInBy, checkinMethod,
                                publicNote, privateNote, version, updatedAt
events/{eventId}/checkinLogs/{idempotencyKey}   ← 문서 ID를 멱등키로
                                eventGuestId, action, previousStatus, nextStatus,
                                previousTime, nextTime, reason, deviceId, userId, createdAt
events/{eventId}/scriptVersions/{svId}          versionNumber, status, guestOrderSnapshot[], scriptText, approvedBy, approvedAt
auditLogs/{logId}               entityType, entityId, action, before, after, userId, userName, deviceId, createdAt
```

`attendanceType`·`arrivalStatus` 등은 영문 코드로 저장하고 화면에서 한글로 표시한다(단일 HTML의 `ARR_LABEL`, `ATT_LABEL` 재사용).

---

## 5. 체크인 트랜잭션 (Cloud Functions / 클라이언트 트랜잭션)

단일 HTML의 원자적 처리(현재 상태 확인 → 중복 확인 → 상태 변경 → 도착시각 → 처리자 → 체크인 이력 → 감사)를 Firestore 트랜잭션으로 옮긴다. **멱등키를 로그 문서 ID로 사용**하여 중복클릭·재전송에도 이력이 1건만 생성되게 한다.

```ts
async function checkIn(eventId, egId, idempotencyKey) {
  const logRef = doc(db, `events/${eventId}/checkinLogs/${idempotencyKey}`);
  const egRef  = doc(db, `events/${eventId}/eventGuests/${egId}`);
  await runTransaction(db, async (tx) => {
    const logSnap = await tx.get(logRef);
    if (logSnap.exists()) return;               // 멱등: 이미 처리됨
    const eg = (await tx.get(egRef)).data();
    if (isArrived(eg.arrivalStatus)) throw new AlreadyArrived(eg.checkedInAt); // 덮어쓰기 금지
    tx.update(egRef, { arrivalStatus:'arrived', checkedInAt: serverTimestamp(),
                       checkedInBy: uid, version: eg.version + 1 });
    tx.set(logRef, { action:'checkin', previousStatus: eg.arrivalStatus, nextStatus:'arrived', ... });
  });
  await writeAudit('eventGuest', egId, 'checkin', ...);
}
```

오프라인 시 Firestore 지속성 큐가 재연결 시 자동 전송하며, 멱등키 문서 ID 덕분에 중복이 생기지 않는다(단일 HTML의 `flushQueue` 멱등성을 서버 레벨로 승격).

---

## 6. 배정 diff (기존 체크인 보존 — 절대 준수)

기존 배정을 통째 삭제 후 재생성하는 방식은 금지한다. 단일 HTML에서 검증(테스트 15.1 통과)한 diff 알고리즘을 Cloud Function `updateAssignment`로 이식한다.

```text
유지 = 기존 ∩ 신규   → 손대지 않음 (체크인·도착시각·메모·영접 보존)
추가 = 신규 − 기존   → 신규 eventGuest 생성
해제 = 기존 − 신규   → 미도착자만 arrivalStatus='cancelled'(이력 보존)
                       도착자 해제는 관리자 권한 + 사유 필수, auditLog 기록
```

---

## 7. Security Rules (권한 서버 강제)

역할은 Auth Custom Claims(`request.auth.token.role`)로 검증하고, 담당 행사는 `assignedEventIds`로 제한한다.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    function role() { return request.auth.token.role; }
    function isStaff() { return role() in ['admin','chief','manager']; }
    function assigned(eid) {
      return role() in ['admin','chief']
        || eid in get(/databases/$(db)/documents/users/$(request.auth.uid)).data.assignedEventIds;
    }

    match /events/{eid} {
      allow read: if request.auth != null && assigned(eid);
      allow create, update: if isStaff() && assigned(eid);
      allow delete: if role() == 'admin';                    // 삭제는 관리자만

      match /eventGuests/{egId} {
        allow read: if assigned(eid);
        // 비공개 메모: 사회자/상황실은 애초에 클라이언트에서 필드 제외 + 규칙으로 쓰기 제한
        allow create, update: if assigned(eid)
          && role() in ['admin','chief','manager','desk','greeter'];
      }
      match /checkinLogs/{k} {
        allow read: if assigned(eid);
        allow create: if assigned(eid);
        allow update, delete: if false;                       // 로그 불변
      }
    }
    match /auditLogs/{id} {
      allow read: if isStaff();
      allow create: if request.auth != null;
      allow update, delete: if false;                         // 감사로그 불변
    }
    match /guests/{gid} {
      allow read: if request.auth != null;
      allow write: if isStaff();
    }
  }
}
```

사회자·상황실 화면에는 전화번호·비공개 메모·내부 판단내용을 클라이언트 쿼리에서 아예 제외(field mask)하고, 규칙으로도 접근을 제한한다.

---

## 8. 오프라인 · PWA

`firebase/firestore`의 `enableIndexedDbPersistence`(또는 `persistentLocalCache`)로 오프라인 지속성을 켜고, Vite PWA 플러그인으로 앱 셸을 캐시한다. 공용기기 모드에서는 메모리 캐시만 사용하고 로그아웃 시 오프라인 개인정보를 삭제한다(단일 HTML의 신뢰기기/공용기기 구분 로직 이식). 미전송 데이터가 있으면 로그아웃 전에 경고한다.

---

## 9. 마이그레이션 절차

1. 단일 HTML에서 `전체 백업`(JSON)을 내보낸다. 스키마는 `{guests, events, eventGuests, scriptVersions}`.
2. Cloud Function `importBackup`이 JSON을 zod로 검증 후 Firestore에 배치 기록한다(이름·소속 기준 중복 후보는 병합 금지, 후보로만 표시).
3. 문자열 필드는 서버에서 재차 sanitize(`< >` 제거·길이 제한)한다.
4. `localStorage` 키(`spc1_*`)는 이관 완료 후 클라이언트에서 정리한다.

---

## 10. 테스트 이관

단일 HTML용 Node 단위테스트(23케이스, 작업지시서 15.1~15.4 포함)를 Vitest로 옮기고, Playwright로 다음 E2E를 추가한다.

- 4개 브라우저 컨텍스트 동시 체크인 → 중복 없음·2초 내 반영(15.2)
- 네트워크 차단 → 체크인 → 재연결 → 무손실·무중복(15.3)
- 역할별 URL 직접 접근 차단(화면+규칙 양쪽, 15.5)
- 악성 입력 문자열 무력화(15.6)
- 시나리오 v1→v2 사회자 명시적 적용(15.7)

---

## 11. 단계별 일정 (작업지시서 20장 대응)

| 단계 | 내용 | 완료 기준 |
| --- | --- | --- |
| 1 | 순수 로직 추출(utils·computeOrder·recommend·diff)·타입·모듈 분리 | 기존 기능 동일 작동 + 기능별 분리 |
| 2 | Auth·Firestore 모델·Security Rules·실시간 리스너·감사로그 | 2기기 동시 조회 + 역할별 수정 제한 |
| 3 | 트랜잭션 체크인·멱등·실행취소·오프라인 큐 | 동시·중복·오프라인·재연결 무손실 |
| 4 | 참석확인·영접·의전순서·시나리오 버전·종료보고 | 준비→종료보고 단일 흐름 |
| 5 | 코파일럿·품질 지킴이·위험 레이더·근거 표시·AI 실패 폴백 | 근거 제시 + 사용자 최종 확정 |
| 6 | 전체 테스트·모바일 실기기·권한·개인정보 점검·시연 초기화 | 15장 전 시나리오 통과 |

---

## 부록. 단일 HTML에서 그대로 재사용 가능한 순수 함수

`esc`, `choseong`, `fmt/fmtD`, `recScore`, `recommend`, `computeOrder`, `buildScriptText`, `snapshotOrder`, 배정 diff(`commitAssign`의 유지/추가/해제 계산), `riskRadar`, `qualityIssues`, `reportData`. 이들은 DOM·Firebase 비의존 순수 함수로, `features/`·`utils/`에 이동 후 단위테스트와 함께 재사용한다.
