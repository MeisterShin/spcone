# SPC ONE 실시간 배포 가이드 (GitHub Pages + Firebase Firestore)

폰·PC 등 **서로 다른 기기 간 실시간 동기화**되는 데모를 배포하는 순서다.
구조: **GitHub Pages**가 화면(`spc.html`)을 URL로 서빙하고, 화면 안의 **Firebase Firestore**가 기기 간 실시간 데이터 동기화를 담당한다.

소요 시간 약 15분. 개발 지식 없이 웹 화면 조작만으로 가능하다.

---

## 순서 요약

1. Firebase 프로젝트 만들기 → Firestore + 익명 로그인 켜기 → config 복사
2. `spc.html`의 `FB_CONFIG`에 config 붙여넣기
3. GitHub 저장소 만들기 → 파일 업로드 → Pages 켜기
4. 폰·PC에서 같은 URL 접속해 실시간 확인

---

## A. Firebase (실시간 백엔드) 설정

### A-1. 프로젝트 생성
1. https://console.firebase.google.com 접속 → 구글 로그인
2. **프로젝트 추가** → 이름(예: `spc-one`) 입력 → 생성 (Google 애널리틱스는 꺼도 됨)

### A-2. Firestore 데이터베이스 만들기
1. 왼쪽 메뉴 **빌드 > Firestore Database** → **데이터베이스 만들기**
2. 위치는 `asia-northeast3 (서울)` 권장 → **프로덕션 모드**로 시작
3. 만들어지면 상단 **규칙(Rules)** 탭에서 아래로 교체 후 **게시**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;   // 로그인(익명 포함)한 경우만 허용
    }
  }
}
```

> 이 규칙은 데모용이다. 로그인한 클라이언트에 전체 접근을 허용하므로, 실제 운영 전에는
> `SPC_ONE_React_Firebase_이관설계서.md` 7장의 역할 기반 규칙으로 교체할 것.

### A-3. 익명 로그인 켜기
1. **빌드 > Authentication** → **시작하기**
2. **로그인 방법** 탭 → **익명(Anonymous)** → 사용 설정 → 저장

### A-4. 웹앱 config 복사
1. 좌측 상단 **⚙️ 프로젝트 설정** → 아래로 스크롤 **내 앱**
2. **웹(</>)** 아이콘 클릭 → 앱 닉네임 입력 → 등록
3. 나타나는 `firebaseConfig` 값을 복사 (apiKey, authDomain, projectId 등)

---

## B. `spc.html`에 config 붙여넣기

`spc.html`을 메모장/편집기로 열고 상단 부근의 아래 블록을 찾아 값을 채운다.

```js
const FB_CONFIG={
  apiKey:"",          // ← 여기에 붙여넣기
  authDomain:"",
  projectId:"",
  storageBucket:"",
  messagingSenderId:"",
  appId:""
};
```

예:

```js
const FB_CONFIG={
  apiKey:"AIzaSyXXXXXXXXXXXXXXXXXXXX",
  authDomain:"spc-one.firebaseapp.com",
  projectId:"spc-one",
  storageBucket:"spc-one.appspot.com",
  messagingSenderId:"1234567890",
  appId:"1:1234567890:web:abcdef123456"
};
```

저장한다. (비워두면 자동으로 오프라인 로컬 모드로 동작한다.)

---

## C. GitHub Pages 배포

### 방법 1. 웹 화면 업로드 (권장 · 개발 지식 불필요)
1. https://github.com 로그인 → 우측 상단 **+** → **New repository**
2. 이름(예: `spc-one`) 입력 → **Public** 선택 → **Create repository**
3. 생성된 저장소에서 **uploading an existing file** 클릭
4. 이 폴더에서 아래 파일을 끌어다 놓기(드래그):
   - `spc.html` (필수 · config 채운 것)
   - `index.html` (필수 · 접속 시 spc.html로 자동 이동)
   - `.nojekyll` (필수 · 정적 파일 그대로 서빙)
   - `readme.md`, 설계서 md (선택)
   - ※ `.git` 폴더, `_redirects.txt`, `firebase.json`은 GitHub Pages에 불필요(올리지 않아도 됨). `.git` 폴더는 삭제해도 된다.
5. 아래 **Commit changes** 클릭
6. 상단 **Settings > Pages** → **Build and deployment > Source: Deploy from a branch**
   → Branch: **main** / 폴더 **/(root)** → **Save**
7. 1~3분 후 페이지 상단에 표시되는 주소로 접속:
   `https://<깃허브아이디>.github.io/spc-one/`
   → `index.html`이 자동으로 `spc.html`로 이동한다.

### 방법 2. git 명령 (개발자용)
```bash
cd <이 폴더>
# 기존 .git 폴더가 있으면 먼저 삭제 후 진행
git init && git branch -M main
git add spc.html index.html .nojekyll readme.md *.md
git commit -m "SPC ONE 배포"
git remote add origin https://github.com/<아이디>/spc-one.git
git push -u origin main
```
이후 Settings > Pages에서 방법 1의 6~7단계와 동일하게 설정.

---

## D. 실시간 동작 확인

1. **PC**에서 배포 URL 접속 → 예: **의전 총괄**로 로그인
2. **스마트폰**에서 같은 URL 접속 → **현장 접수자**로 로그인
3. 화면 좌하단 연결 표시가 **클라우드 실시간**이면 성공
4. 폰에서 내빈 **체크인** → PC **대시보드**에 즉시 반영되면 실시간 동기화 정상
5. 대시보드·체크인 상단 **오프라인 시연** 버튼을 누르면 Firestore 네트워크를 실제로 끊었다가
   다시 켜며 재연결 자동 동기화를 시연할 수 있다.

---

## E. 확인 · 문제해결

- **연결 표시가 "정상/오프라인"(로컬)로만 뜬다** → `FB_CONFIG`가 안 채워졌거나 오타. 브라우저 개발자도구(F12) 콘솔에서 `클라우드 초기화 실패` 로그 확인. config를 다시 붙여넣고 재배포.
- **데이터가 안 보인다** → Firestore 규칙 미게시 또는 익명 로그인 미설정. A-2, A-3 재확인.
- **여러 기기 데이터가 다르다** → 서로 다른 Firebase 프로젝트를 쓰는 경우. 모두 같은 `FB_CONFIG`인지 확인.
- **처음 접속한 기기 하나가 시드 데이터를 클라우드에 자동 업로드**한다. 이후 접속 기기는 클라우드 데이터를 함께 본다.

## F. 보안 · 개인정보 주의

- 공개 URL이므로 **실명·연락처 등 실제 개인정보를 넣지 말 것**(데모 데이터는 모두 가상 인물).
- 데모용 규칙은 로그인한 사용자에게 전체 접근을 허용한다. 대회·시연 종료 후에는 Firestore에서 데이터를 삭제하거나 규칙을 잠글 것.
- 운영 배포 시에는 이관 설계서의 역할 기반 Security Rules + 실제 인증으로 전환한다.
