# ai-change 브랜치 통합 기록

## 문서 목적

이 문서는 2026-08-25에 여러 개발 브랜치를 `dev`로 통합한 과정과 충돌 해결 근거를 기록합니다. 단순한 Git 충돌 해소뿐 아니라 최신 스캐폴딩 규칙, 공통 미니게임 lifecycle, 런타임 설정, 검증 결과까지 포함합니다.

통합 전 작업 트리는 깨끗했고 로컬에는 `main`과 `feature/ai-change-scaffold`만 있었습니다. `git fetch --all --prune`으로 원격 브랜치를 갱신한 뒤 `main`에서 새 `dev` 브랜치를 만들었습니다. 원격 저장소에는 `dev`가 없었으며 이 작업에서는 push하지 않았습니다.

아래 여섯 merge commit 이후의 경로·호스트 계약·문서·테스트 보정은 통합 구현 커밋 `b91b0e9`(`feat: reconcile merged minigames with scaffold`)에 기록했습니다. 이 문서는 구현 커밋과 검증 결과를 확정한 뒤 별도 문서 커밋으로 분리했습니다.

## 통합 대상과 계보

| 구분 | 브랜치 | 통합 당시 tip | 관계·내용 |
| --- | --- | --- | --- |
| 기준 | `main` | `7466d19` | 모든 작업 브랜치의 공통 기준 |
| 스캐폴딩 | `feature/ai-change-scaffold` | `cf17764` | 공통 앱·씬·데이터·테스트와 학과 코드 폴더명 변경 |
| AIDS 기능 | `feature/aids-minigame` | `1abc737` | 인지알·데사알 분류 MVP |
| AIDS 밸런스 | `balance/aids-minigame-physics` | `1ece42c` | AIDS 기능 브랜치를 포함하는 후속 물리 보정 |
| DS 기능 | `feature/ds-minigame` | `d2be19c` | 숫자 야구 MVP |
| CS 기능 | `feature/click-to-purify-core-loop` | `e4ba6c4` | CLICK to PURIFY 판정·위협·상태 골격 |
| CSE 기능 | `prototype/cse-minigame` | `e3f94f4` | Code Heart 독립 실행 프로토타입 |

`balance/aids-minigame-physics`는 `feature/aids-minigame`의 모든 커밋을 포함하지만, 각 브랜치가 `dev` 이력에서 명확히 보이도록 기능 브랜치를 먼저 병합하고 후속 밸런스 브랜치를 별도로 병합했습니다.

## 병합 순서

| 순서 | 병합 커밋 | 대상 | 결과 |
| --- | --- | --- | --- |
| 1 | `af15fb2` | `feature/ai-change-scaffold` | 앱의 공통 기준점 확립 |
| 2 | `81edaa9` | `feature/aids-minigame` | AIDS 실제 구현 선택 및 add/add 충돌 해결 |
| 3 | `be5200f` | `balance/aids-minigame-physics` | 발판 관통·방향 전환 물리 보정 반영 |
| 4 | `10ceac7` | `feature/ds-minigame` | 숫자 야구와 설정 병합 |
| 5 | `1b647ed` | `feature/click-to-purify-core-loop` | CS 순수 판정·위협 로직 병합 |
| 6 | `94ef0e0` | `prototype/cse-minigame` | Code Heart UI·레시피·밸런스 병합 |

모든 원격 대상 브랜치는 `git branch --all --merged dev` 결과에서 `dev`에 포함됨을 확인했습니다.

## 충돌 해결 기록

### 1. AIDS 엔트리 파일

- 충돌: `js/minigames/AIDS/index.js` add/add
- 스캐폴딩 측: 공통 결과 계약을 확인하는 임시 버튼형 구현
- 기능 브랜치 측: 실제 낙하·분류 게임 구현
- 해결: 기능 브랜치 구현을 기준으로 선택하고, 공통 `InputLock`, `MiniGameClock`, `buildMiniGameCandidate` 계약을 유지했습니다.
- 후속 보정:
  - 존재하지 않는 `SELECT_LEFT`/`SELECT_RIGHT` 대신 공통 `MOVE_LEFT`/`MOVE_RIGHT` 입력 사용
  - 브라우저와 Node 환경을 모두 처리하는 frame 예약·취소 경계 추가
  - abort 가능한 초기화, stale attempt 차단, 시도별 1회 완료, 개발 완료 seam, 중복 destroy 안전성 보강

### 2. DS 설정 파일

- 충돌: `data/minigames/number-baseball.json` add/add
- 스캐폴딩 측: `schemaVersion`, `gameId`, `implementationStatus`, 목표, PC·모바일 조작
- 기능 브랜치 측: 숫자 범위, 정답 길이, 중복 허용 여부, 최대 Epoch, 미확정 밸런스
- 해결: 스캐폴딩의 안정 필드와 기능 브랜치의 `rules`·`balance`를 구조적으로 합쳤습니다. validator가 사용하는 `gameId=data-number-baseball`을 기준 ID로 유지했습니다.

### 3. CSE 공용 CSS

- 충돌: `css/minigames.css` add/add
- 해결: 스캐폴딩의 공통 미니게임·결과 UI 스타일을 유지하고 CSE의 `.code-heart-game` 스타일을 뒤에 추가했습니다.
- 독립 페이지 전용 전역 `body` 모바일 규칙은 앱 전체에 영향을 주므로 제거했습니다.
- 공통 stage 안에서 920px 고정 레이아웃이 잘리지 않도록 CSE host를 스크롤 가능한 크기로 보정했습니다.
- DS와 CS가 실제 UI를 갖게 되어 각 구현의 class 이름을 보존한 scoped 스타일도 추가했습니다.

### 4. CSE 설정 파일

- 충돌: `data/minigames/code-heart.json` add/add
- 해결: 스캐폴딩의 `schemaVersion`, stable `gameId=computer-code-heart`, 상태, 목표, 조작 정보를 유지하면서 프로토타입의 category·item·recipe·balance 데이터를 모두 추가했습니다.
- 브랜치의 별도 `id=code-heart`는 런타임 stable ID와 달라 제거했습니다.

### 5. 앱 진입점

- 충돌: 루트 `index.html` add/add
- 스캐폴딩 측: 전체 앱 shell과 `js/app.js` 라우터 진입점
- CSE 측: Code Heart만 직접 실행하는 독립 페이지
- 충돌 해결에서는 전체 앱 shell을 유지하고 CSE의 독립 실행 진입점을 제외했습니다. Code Heart는 공통 registry와 scene을 통해 실행하도록 후속 보정했으며, 페이지 제목과 build badge도 같은 통합 마무리 단계에서 갱신했습니다.

## Git이 표시하지 않은 구조 충돌

스캐폴딩의 마지막 커밋 `cf17764`는 미니게임 폴더를 아래처럼 변경했지만 registry, validator, 계획 문서의 경로는 이전 slug를 계속 가리켰습니다.

| Stable ID | 최신 런타임 경로 |
| --- | --- |
| `data-number-baseball` | `js/minigames/DS/index.js` |
| `cyber-click-to-purify` | `js/minigames/CS/index.js` |
| `computer-code-heart` | `js/minigames/CSE/index.js` |
| `ai-ball-classification` | `js/minigames/AI/index.js` |
| `ai-data-egg-sort` | `js/minigames/AIDS/index.js` |

이 변경은 파일 내용 충돌이 아니라 서로 다른 경로에 중복 구현을 만드는 논리 충돌이었습니다. 최신 스캐폴딩 변경을 기준으로 다음을 함께 고쳤습니다.

- `js/minigames/registry.js`의 모든 정적 import
- `scripts/validate.mjs`의 `EXPECTED_GAMES.modulePath`와 `REQUIRED_FILES`
- `docs/AI_CHANGE_PLAN.md`의 모듈 경로와 registry 예시
- 기능 브랜치의 구현을 학과 코드 폴더의 entry로 이식
- 이전 `number-baseball/`, `click-to-purify/`, `code-heart/` 중복 런타임 파일 제거

제거된 파일의 원본은 각 병합 커밋과 원격 브랜치 이력에 그대로 남아 있습니다.

## 미니게임별 통합 결과

### DS · 숫자 야구

- 기능 브랜치의 정답 생성, 키패드, Fit·Shift·Outlier, Epoch, 히스토리 형식을 유지했습니다.
- global `document`, `alert`, 개발용 정답 console 출력을 제거했습니다.
- 설정의 숫자 범위·정답 길이·최대 Epoch를 실제 로직에서 사용합니다.
- 화면 키패드와 숫자키·numpad·Backspace·Enter 입력을 연결했습니다.
- 완료 candidate에는 미니게임 소유 필드만 두고 host 소유 `miniGameId`·`durationMs`는 scene이 채우도록 경계를 바로잡았습니다.
- 결과 metrics에 히스토리와 마지막 판정, FAIL일 때의 정답을 포함합니다.

### CS · CLICK to PURIFY

- 브랜치의 `judgeTiming`, 정화도, nearest target, terminal 판정, 위협 타입별 상태를 `CS/` 아래 분리 파일로 보존했습니다.
- 웨이브 spawn, timeout, PURIFY 입력, 공통 lifecycle, 결과 callback을 연결해 플레이 가능한 프로토타입으로 만들었습니다.
- 빈 판정 후보는 `null`, 0 wave 정화도는 0, `crypto.randomUUID` 미지원 환경은 fallback ID로 처리합니다.
- 브랜치의 `perfectwindowMs` 오타는 호환 alias로 받고 canonical `perfectWindowMs`도 지원합니다.
- `implementationStatus=PROTOTYPE`인 동안에는 CLEAR 결과가 실제 학과 진행도로 저장되지 않도록 host 기록 정책을 분리했습니다.
- D-04/D-05가 미확정이므로 6 wave, 200/500ms 판정창, PERFECT/GOOD 1/0.5 가중치, nearest target, miss 3회 실패는 최종 규칙이 아닌 `PROTOTYPE` 값입니다.

### CSE · Code Heart

- 4개 category slot, 12개 재료, 4개 recipe, 임의 주문 순회, 성공 점수, 오답 시간 penalty 로직을 유지했습니다.
- 독립 클래스의 `container`·legacy event bus·내부 결과 modal 대신 공통 `createMiniGame(context)`과 host result overlay를 사용합니다.
- DOM은 기존 class 이름을 유지하면서 직접 element를 구성해 공통 테스트와 브라우저에서 같은 entry를 사용합니다.
- pause 중 입력을 잠그고 frame, attempt token, restart, listener·DOM 정리를 공통 계약에 맞췄습니다.
- 레시피 창에 dialog 이름·제목 연결, 배경 inert, 초기/복귀 focus, Escape 닫기, Tab focus 고정을 추가했습니다.
- 실제 판정은 선택 순서가 아니라 category별 선택값 비교이므로 목표 문구도 “각 범주의 재료 조합”으로 맞췄습니다.
- D-06은 draft에서 아직 TBD입니다. 현재 4개 주문·60초·오답 -5초 값은 브랜치 MVP를 보존한 통합 수치이며 최종 밸런스 확정으로 간주하지 않습니다.

### AIDS · 인지알·데사알 분류

- 기능 브랜치의 다이아몬드 발판, 알 spawn·라우팅, correct/wrong/lost/life 집계와 전용 CSS를 유지했습니다.
- 후속 balance 브랜치의 time-to-go 낙하 유도, `fallSteerAccel`, 착지 관성, 안전 속도 제한을 반영했습니다.
- 현재 spawn 간격은 최신 코드 기준 4.5초 → 3.5초 → 2.5초이며, 기존 `docs/AIDS_HISTORY.md`의 3.5초 → 2.5초 → 1.5초 설명을 통합 보정했습니다.
- runtime JSON에 현재 MVP 수치를 명시하고 `implementationStatus=MVP`로 표시했습니다.
- browser module harness는 `js/minigames/AIDS/dev/`로 이동했습니다. Node가 `test/` 아래 browser script를 자동 test로 실행하던 문제를 방지합니다.
- 대화 transcript와 오래된 physics 사본이 섞여 있던 `aids-lite.html`은 중복·오염된 개발 파일로 제거했습니다.
- retry 때 이전 시도의 알·이탈 marker·float text DOM을 제거하고, 생명과 시간이 같은 frame에 소진되면 생명 0의 FAIL을 우선하는 회귀 테스트를 추가했습니다.
- D-09의 최종 terminal 우선순위·재도전·기록 정책은 여전히 TBD이며 현재 생명 우선 처리를 최종 기획 결정으로 확정하지 않습니다.

### AI · Ball Classification

- 해당 기능 브랜치는 통합 대상에 존재하지 않았습니다.
- 최신 스캐폴딩의 공통 lifecycle 구현을 `js/minigames/AI/index.js`에 유지하고 상태를 `SCAFFOLD`로 표시했습니다.
- 설정·실행 문서의 조작 안내를 실제 scaffold가 제공하는 개발용 CLEAR/FAIL 버튼과 일치시켰습니다.

## 공통 호스트 계약 보정

통합된 모든 module은 다음 경계를 동일하게 지킵니다.

- `createMiniGame(context)`
- `init(config, { signal })`: 비동기 경계에서 abort 처리
- `start({ attemptId })`
- `pause(reason)` / `resume()`
- 완료 후 `restart({ attemptId })`
- 중복 호출에 안전한 `destroy()`
- `getState()`
- 시도 ID가 일치할 때 한 번만 `onComplete(attemptId, candidate)`
- candidate 필드: `status`, `score`, `failureReason`, `metrics`, `reward`
- host가 채우는 필드: `sessionId`, `miniGameId`, `durationMs`

host는 수동 pause와 탭 비가시성 pause를 독립된 reason으로 관리합니다. 결과의 `durationMs`에서는 겹치는 pause 시간을 제외하며, 숨겨진 탭에서 AIDS를 포함한 게임 시간이 진행되지 않도록 했습니다. QUIT과 runtime ERROR도 동일한 host 결과 구조로 확정합니다. 실제 진행도 저장은 MVP 구현에만 적용하고 PROTOTYPE·SCAFFOLD는 제외합니다.

입력 계층에서는 버튼에 focus가 있어도 `Escape`/`P` pause가 전달되도록 예외를 두었고, AIDS의 좌우 버튼을 keyboard activation이 가능한 `click`으로 연결했습니다. 앱 전체 live region은 제거해 frame 단위 타이머가 반복 낭독되지 않게 했습니다.

미니게임 안내 화면은 runtime `implementationStatus`에 따라 MVP·PROTOTYPE·SCAFFOLD 문구를 표시합니다. 공통 결과 화면은 실제 성공·실패 문구와 함께 점수, 게임별 핵심 metrics, 초 단위 플레이 시간을 표시합니다.

## 문서와 파일 정리

- 루트 `README.md`: 통합된 구현 상태와 공통 API 갱신
- `docs/execution-and-controls.md`: 학과별 MVP·Prototype·Scaffold 상태 갱신
- `docs/AIDS_HISTORY.md`: 입력 action, harness 경로, 실제 spawn 수치, 자동 검증 보정 추가
- `docs/DS_HISTORY.md`: 원본 기록의 미검증 citation·누락 harness와 통합 경로를 구분하는 주석 추가
- `docs/CS_HISTORY.md`: 원래 기능 브랜치 폴더에서 `docs/`로 이동하고 통합 기록 추가
- `js/minigames/CS/state.js`: 기능 브랜치의 상태 골격을 명시적인 전이 규칙으로 분리
- `tests/unit/integrated-minigame-logic.test.mjs`: CS 판정·target·terminal과 AIDS spawn·time-to-go 물리·동시 terminal 우선순위 회귀 테스트 추가
- 이전 slug 폴더의 중복 실행 파일 삭제

## 검증 기록

### 통합 전 기준점

스캐폴딩만 병합한 직후 `npm test` 결과는 25개 중 22개 통과, 3개 실패였습니다. `cf17764`가 폴더를 학과 코드로 변경했지만 registry를 갱신하지 않아 `number-baseball/index.js` import를 찾지 못한 것이 원인이었습니다.

### 원본 브랜치 병합 직후

- `npm run validate`: 4개 오류
  - AI·AIDS 이전 slug 경로의 required file 누락 2건
  - registry의 AI·AIDS import 미해결 2건
- `npm test`: 26개 중 22개 통과, 4개 실패
  - AIDS browser harness가 Node test로 자동 실행됨
  - CSE가 named `createMiniGame`을 export하지 않음
  - DS가 global `document`에 의존
  - DS abort 초기화 계약 미충족

이 기준 실패들을 경로·호스트 계약·개발 harness 정리로 해결했습니다.

### 최종 자동 검증

`npm run check` 성공:

- `npm run validate`: 109개 파일, 21개 JSON 문서 검증 통과
- `npm test`: 30/30 통과(공통 25개 + CS/AIDS 통합 로직 5개)
- `npm run smoke`: 임시 로컬 서버 HTTP·MIME 검사 11/11 통과
- 구현 커밋과 문서 커밋 대상을 각각 stage한 뒤 `git diff --cached --check`: whitespace 오류 없음
- 전체 기능 브랜치가 `dev` 이력에 포함됨

로컬 개발 서버는 정상 기동됐습니다. 다만 작업 세션에 연결 가능한 인앱 브라우저가 없어 클릭·반응형 화면의 수동 QA는 실행하지 못했습니다. 실제 브라우저에서는 DS 숫자·삭제·제출, CS Space·PURIFY, CSE 긴 레이아웃 스크롤·재료 선택·레시피 focus, AIDS 방향키·터치·resize를 추가 확인해야 합니다.

## 남아 있는 결정과 후속 작업

- D-04/D-05: CS 정화도·동시 판정·retry 정책 확정
- D-06: CSE 주문 수·시간·penalty·완료 조건 확정
- D-08: DS 선행 0·제한 시간·retry penalty 확정
- D-09: AIDS spawn·physics·동시 terminal 우선순위·retry·record 정책 확정
- AI Ball Classification 실제 기능 구현
- 실제 Chrome/Safari와 모바일 기기에서 시각·입력·resize QA
- AIDS의 짧은 landscape 레이아웃과 resize 시 발판 좌표 재계산, 짧은 HUD animation timeout 정리 여부 확인
- Battle은 기존 설계대로 Coming Soon 상태 유지

## 2026-08-27 Cloudflare 공개 프리뷰 배포

배포 직전 로컬·원격 브랜치와 열린 PR을 다시 대조했습니다. 현재 `dev`가 보장하는 등록 미니게임은 6종이 아니라 5종이며, DS·CSE·AIDS는 MVP, CS는 PROTOTYPE, AI는 SCAFFOLD입니다. Battle은 빈 데이터·빈 registry·비활성 feature flag인 Coming Soon 상태입니다.

열린 PR #10(`feature/click-to-purify`)은 기존 CS의 후속 구현이고 PR #11(`prototype/ai-minigame`)은 기존 AI의 MVP 후보이므로 어느 것도 6번째 게임은 아닙니다. 두 PR 모두 독립 실행 구조와 현재 host lifecycle의 결과 callback·pause·attempt 계약이 달라 직접 merge/cherry-pick하지 않았습니다. 최신 로직은 공통 계약에 맞춰 수동 재통합하고 별도 회귀 테스트를 통과시킨 뒤 배포해야 합니다.

공개 배포에는 Cloudflare Workers Static Assets를 사용했습니다.

- `scripts/build.mjs`: `index.html`, `assets/`, `css/`, `data/`, `js/`의 런타임 파일만 `dist/`에 복사
- 제외 대상: draft JSON, `data/drafts/`, `js/**/dev/`, Markdown, 저장소 문서·테스트·도구 파일
- `dist/_headers`: CSP, MIME sniffing 차단, frame 차단, referrer·browser permission 정책 적용
- `wrangler.jsonc`: production·staging 정적 자산 환경 분리, 존재하지 않는 URL은 404 유지
- `scripts/smoke-dist.mjs`: 실제 산출물의 manifest 자산과 비공개 경로 404를 검사
- `dist/`, `.wrangler/`: Git 추적과 소스 validator 대상에서 제외

릴리스 검증 결과:

- `npm run validate`: 113개 소스 파일, 21개 JSON 문서 통과
- `npm test`: 30/30 통과
- 로컬 소스 HTTP smoke: 28/28 통과
- `dist` release HTTP smoke: 34/34 통과
- Cloudflare upload: runtime asset 79개 성공
- 공개 URL: `https://ai-change-games.deciduous-rainstorm.workers.dev`
- Cloudflare Version ID: `94ace7be-6811-49a6-898a-c4b1a20c8e54`
- 원격 확인: `/`, config·manifest·SVG는 200과 정확한 MIME; `/docs/...`, `/package.json`, 임의 누락 경로는 404; CSP와 `nosniff` 헤더 적용 확인

이번 배포는 Cloudflare 임시 계정의 공개 프리뷰입니다. 영구 운영 배포로 전환하려면 임시 계정을 제한 시간 안에 Cloudflare 계정으로 귀속하거나 기존 계정으로 로그인해야 합니다. 운영 공개 전에는 6번째 게임의 실제 소스 확인, PR #10·#11의 수동 재통합, 실제 브라우저·모바일 조작 QA, `development` 저장 채널과 개발용 badge 문구 정리가 남아 있습니다.

### 임시 계정 재발급

첫 임시 계정의 60분 귀속 기한이 지난 뒤 동일한 릴리스 검사를 다시 통과하고 새 임시 계정으로 재배포했습니다.

- 재배포 공개 URL: `https://ai-change-games.alpine-salute.workers.dev`
- 재배포 Cloudflare Version ID: `f1cb8914-d0a4-4f12-ac54-87b0af34516f`
- 재검증: 30/30 테스트, 소스 HTTP 28/28, `dist` HTTP 34/34, 원격 HTTP 200·CSP·`nosniff` 확인

## 2026-08-28 최신 CS·AI 브랜치 통합

이 절은 위의 2026-08-27 배포 이후 상태 변경을 기록하며, 당시의 CS Prototype·AI Scaffold 및 PR 미통합 상태를 대체합니다. 원격 브랜치 이력을 다시 감사한 결과, `dev`에 실제로 반영되지 않은 최신 tip은 CS의 `origin/feature/click-to-purify@02d63d5`(PR #10)와 AI의 `origin/prototype/ai-minigame@ebfda86`(PR #11)뿐이었습니다. 기존 문서에서 언급한 6번째 게임은 집계 오류이며, 실제 고유 미니게임은 5종입니다.

| 영역 | 확인한 최신 tip | 이번 처리 |
| --- | --- | --- |
| 공통 scaffold | `cf17764` | 이미 `dev` 조상이라 중복 병합하지 않음 |
| DS | `d2be19c` | 이미 `dev` 조상, 기존 MVP 유지 |
| CS | `02d63d5` | `cc54b6a` 2-parent merge로 최신 MVP 통합 |
| CSE | `e3f94f4` | 이미 `dev` 조상, 기존 MVP 유지 |
| AI | `ebfda86` | `57e0a5c` 2-parent merge로 최신 MVP 통합 |
| AIDS | `1abc737`, balance `1ece42c` | 모두 `dev` 조상, 최신 balance 포함 MVP 유지 |

CS는 true merge 커밋 `cc54b6a`로 통합했습니다. 충돌 해결 시 `dev`의 공통 host lifecycle, attempt, pause, result 계약을 유지하면서 기능 브랜치의 22개 wave(learning 4개 + mixed 18개), malware별 효과, Canvas 표현과 입력 처리를 반영했습니다. 개발용 harness는 production 산출물에서 제외했고, `implementationStatus`는 `MVP`로 올렸습니다.

AI는 true merge 커밋 `57e0a5c`로 통합했습니다. 루트 `index.html`은 기존 통합 shell을 유지하고 AI 전용 CSS 링크만 추가했으며, 중복 standalone entry와 dependency-free 저장소 계약에 맞지 않는 `package-lock.json`은 제외했습니다. 기능 코드는 공통 `createMiniGame` adapter로 이관해 target 5개와 non-target 25개, 3초 countdown, Space/버튼 조작, Canvas 표현을 반영했습니다. 실패 사유는 `WRONG_BALL`과 `MISSED_TARGET`으로 안정화했고, result once, error 처리와 cleanup도 공통 계약에 맞췄습니다. `implementationStatus`는 `MVP`입니다.

AI의 `assets/images/sample.png`는 asset manifest에 `ASSET-AI-002`로 등록했습니다. 다만 원본 출처와 라이선스가 기록되어 있지 않으므로 production 사용 전 권리를 확인하거나 출처가 명확한 자산으로 교체해야 합니다.

현재 등록된 5종은 모두 `MVP`이고 `scaffold`는 모두 `false`입니다. Battle은 `battles=[]`, feature flag `false`인 `Coming Soon` 상태를 유지합니다.

최종 `npm run check:release` 검증 결과는 다음과 같습니다.

- source validation: 119개 파일·21개 JSON 문서 통과
- Node test: 38/38 통과
- source HTTP·MIME smoke: 30/30 통과
- production build: `dist/` runtime 파일 83개 생성
- release HTTP·보안 경로 smoke: 36/36 통과

### Cloudflare 프리뷰 갱신

- 기존 임시 프리뷰 `https://ai-change-games.alpine-salute.workers.dev`에 최신 runtime asset을 재배포했습니다.
- Cloudflare Version ID: `c9974780-3af3-47ca-a8bd-c57aa9599173`
- AI CSS·PNG·module, AI/CS config와 registry를 포함한 변경 asset 14개를 업로드했습니다.
- 원격에서 HTML, CSS, PNG, JS, JSON의 HTTP 200과 정확한 MIME을 확인했습니다.
- 원격 config에서 게임 5종·전 항목 `scaffold=false`, AI `MVP`·5/25 공, CS `MVP`·22 wave를 확인했습니다.
- CSP와 `X-Content-Type-Options: nosniff`를 확인했고 `History.md`, `package.json`, 임의 누락 경로는 HTTP 404였습니다.
- 작업 세션에 연결 가능한 브라우저가 없어 클릭·반응형 시각 QA는 실행하지 못했으며 실제 Chrome·Safari 기기 QA는 후속 확인 대상으로 남깁니다.

## 2026-08-28 맵 학과 카드의 미니게임 직접 실행

사용자 결정에 따라 기본 Story 진입 흐름을 `인트로 → 학과별 맵 → 학과 카드 → 미니게임`으로 단축했습니다. `js/scenes/map-scene.js`의 학과 카드가 더 이상 `dialogue`와 `minigame-intro`를 순서대로 열지 않고, 각 NPC에 등록된 stable `miniGameId`를 사용해 `minigame` scene으로 직접 이동합니다.

- AI, DS, CSE, CS, AIDS 카드 5개 모두 `data/map-data.json`의 기존 `miniGameId` 연결을 그대로 사용합니다.
- 카드의 제목·설명·접근성 이름을 NPC 대화가 아니라 미니게임 바로 실행 기준으로 바꿨습니다.
- 같은 카드 또는 서로 다른 카드를 빠르게 연속 선택해도 첫 navigation만 처리하는 scene 단위 guard를 추가했습니다.
- native button의 클릭·Enter·Space·모바일 터치 경로는 그대로 유지합니다.
- NPC 대화와 미니게임 상세 안내 route·스크립트·asset loading 코드는 선택형 콘텐츠와 게임 방법 화면에서 재사용할 수 있도록 삭제하지 않았습니다.
- Story intro, 게임 방법, README, 실행 문서와 통합 계획의 기본 흐름 설명을 현재 동작과 맞췄습니다.

검증 결과:

- source validation: 120개 파일·21개 JSON 문서 통과
- Node test: 41/41 통과(5개 직접 route 매핑, 누락 ID 방어, 연속 선택 1회 처리 포함)
- source HTTP·MIME smoke: 30/30 통과
- production build: runtime 파일 83개
- release smoke: 36/36 통과
- Cloudflare preview: `https://ai-change-games.dot-pluto.workers.dev`
- Cloudflare Version ID: `fcb9608d-a028-47a8-98b9-8e3f85493a79`
- 원격 module에서 직접 `minigame` route, `dialogue` 우회, 카드 click 연결과 CSP·`nosniff`를 확인했습니다.

## 2026-08-28 AI 원본 충실 복원

Git 이력을 다시 대조한 결과 `origin/prototype/ai-minigame@ebfda86`는 AI 통합 커밋 `57e0a5c`의 실제 두 번째 parent였습니다. 따라서 문제는 브랜치가 병합되지 않은 것이 아니라, 이전 통합 과정에서 기능 코드를 공통 adapter로 옮기며 원본 UI와 실제 물리를 필요 이상으로 다시 작성한 데 있었습니다.

이번에는 해당 브랜치의 플레이 화면과 동작을 기준으로 AI 미니게임을 다시 맞췄습니다.

- 원본의 `480×640` 세로형 구조와 상단 정보·`480×460` Canvas·하단 조작 영역 비율을 복원했습니다.
- Canvas의 중앙 목표 이미지, 레일, 분류함, 뚜껑, 공의 외곽선과 이미지 표현을 원본 흐름에 맞췄습니다.
- 목표 공과 방해 공 모두 기능 브랜치가 제공한 `assets/images/sample.png`를 사용하는 원래 표현을 복원했습니다.
- 시작 countdown, 목표 안내, 진행 문구와 `OPEN`·`CLOSE` 버튼 상태 문구를 원본 기준으로 되돌렸습니다.
- 원본 코드가 실제로 사용한 가로 속도 `width × 0.8`과 이동 시간의 절반인 생성 간격을 유지했습니다. 기준 폭 `480`에서는 이동 시간이 `1.25초`, 생성 간격이 `0.625초`입니다.

통합 웹앱에서 필요한 공통 host 계약만 유지했습니다. `createMiniGame` 생명주기, attempt 식별, pause·resume, 공통 result 반환, 오류·cleanup 처리는 기존 host에 연결하고, AI 스타일은 다른 scene과 미니게임에 영향을 주지 않도록 범위를 AI root 아래로 제한했습니다. 독립 실행용 root entry나 AI 전용 결과 popup을 되살리는 대신, 게임 고유 화면·Canvas 렌더링·물리·문구는 원본 브랜치에 충실하게 복원했습니다.

검증 결과는 runtime 파일 `120개`와 JSON 문서 `21개` 검증, 전체 단위·계약 테스트 `44/44`, source HTTP smoke `30건`, production build `83개` 파일, dist HTTP smoke `36건` 모두 통과했습니다. 또한 AI 전용 계약 테스트로 원본 shell class와 `480×460` Canvas가 mount되고 destroy 시 공통 host class·`960×540` 크기로 되돌아오는 과정까지 고정했습니다.

- 구현 커밋: `79c6d2e` (`fix: restore AI prototype visuals and mechanics`)
- Cloudflare preview: `https://ai-change-games.towering-hisser.workers.dev`
- Cloudflare Version ID: `f90ee9df-d8e6-4ba1-b197-da7cce8d74fa`
- 원격 root·AI module·CSS·config의 HTTP `200`, CSP·`nosniff`, 원본 class·Canvas 크기·생성 간격·동일 sample asset 설정을 확인했습니다.

## 2026-08-28 전체 브랜치 원본 UI 재감사와 반응형 크기 조정

사용자 피드백에 따라 통합본을 다시 공통 디자인으로 바꾸지 않고, 각 기능 브랜치가 만든 프론트·색·문구·Canvas 효과와 내부 좌표를 기준으로 복원했습니다. 2026-08-28 재수행한 `git fetch --all --prune` 기준으로 scaffold `cf17764`, DS `d2be19c`, CS `02d63d5`와 이전 core-loop `724481a`, CSE `e3f94f4`, AI `ebfda86`, AIDS `1abc737`와 balance `1ece42c`는 모두 이미 `dev`의 조상입니다. 새 브랜치를 빠뜨린 문제가 아니라 이전 host 이관 과정에서 일부 원본 표현을 단순화하거나 다시 그린 것이 차이의 원인이었습니다.

이번 수정 원칙은 다음과 같습니다.

- 게임 내부의 논리 크기·물리 좌표·색·마크업·문구를 원본 기준으로 유지합니다.
- PC·태블릿·모바일 대응은 내부 요소를 다시 배치하지 않고, 바깥 viewport 축소·데스크톱 나란히 배치·모바일 세로 배치·필요한 세로 스크롤로 처리합니다.
- 공통 host의 attempt ID, pause/resume, 1회 완료, save, 오류 처리, Retry/Map/Menu 결과 이동과 idempotent cleanup은 유지합니다.
- Battle·보스·6번째 미니게임 등 원본 브랜치에 없는 콘텐츠는 추가하지 않았습니다. 등록 게임은 계속 5종입니다.

### 게임별 반영 내용

| 게임 | 원본 유지·복원 | 크기 처리 |
| --- | --- | --- |
| AI Ball Classification | 원본 규칙 overlay와 `게임 시작`, 3초 목표 확인, `480×460` Canvas, 상·하단 HUD, 보라/민트/빨강 palette, OPEN/CLOSE 문구, SUCCESS/GAME OVER 결과 문구 | 원본 `480×640` 비율을 stage의 폭·높이에 맞춰 비례 축소하고 실제 버튼은 최소 44px을 유지 |
| CLICK to PURIFY | 원본 `✕ → 패널 START → 실제 시작` 2단계, CORE·판정 ring·십자선·4종 threat label, WORM 분열, RANSOM 잠금, SPYWARE 0.1→0.6, impact/flash와 판정 text, CLICK HUD, 성공·실패 결과 문구 | PC는 `480×480` Canvas와 최대 `300px` 패널을 나란히, 폭 600px 이하는 세로로 배치; bitmap 480×480은 변경하지 않음 |
| Code Heart | `data-cat` 4색 재료, 레시피 book icon/text, UNLOCK span/small, 상세 recipe row, 원본 빌드 오류·성공 문구와 shake 복원 | `440×920` 고정 논리 frame을 폭 기준으로만 축소하고 긴 화면은 host 안에서 세로 스크롤 |
| 숫자 야구 | history의 Fit 초록·Shift 노랑·Outlier 분홍 분리 표시와 원본 정답/시도 횟수 결과 문구 복원 | 기존 반응형 keypad layout 유지 |
| 인지알·데사알 | 원본 알·발판·상자·HUD·버튼과 물리값 유지, 최신 balance 브랜치의 timer/life 동시 종료 시 CLEAR 우선순위 복원 | `390×740` 고정 논리 frame 전체를 contain 방식으로만 축소해 물리 좌표와 DOM 좌표를 일치시킴 |

CS의 GOOD 가중치는 최신 기능 브랜치의 `0.7`을 config와 판정 함수에 연결했습니다. WORM 부모가 놓쳐 생성된 두 분열체도 원본처럼 각각 일반 MISS에 포함하며 별도 `splitChildMissCount`도 결과 metric에 남깁니다. AI와 CS의 규칙 화면 대기 시간은 플레이 시간에 포함하지 않도록 `hasInternalStartGate`와 attempt 단위 `onGameplayStart` 경계를 추가했습니다. 내부 START 뒤에만 host 시간이 시작되고 retry에서도 같은 규칙을 적용합니다.

공통 결과창은 게임별 `resultPresentation`을 읽어 원본 제목·설명·RESTART 문구를 표시합니다. AI·CS·Code Heart는 원본 색으로 범위를 제한해 꾸미고, 숫자 야구는 배열 정답을 쉼표 없이 원래 숫자열로 표시합니다. 실제 보상 지급 기능이 아직 없으므로 AI 성공 버튼은 동작을 과장하는 `수호알 획득하기` 대신 실제 동작인 `맵으로 돌아가기`로 명확히 했습니다. 모든 AI 결과 metric에는 사용자용 한글 label을 추가했고, 짧은 모바일 화면에서는 결과 card 자체가 스크롤됩니다.

### 스캐폴딩·공통 코드 변경

- `js/minigames/shared/fixed-frame-scaler.js`: 논리 frame은 고정하고 바깥 viewport와 CSS transform만 resize하는 공통 helper 추가
- `js/ui/result-overlay.js`: game ID scope, 게임별 결과 문구, metric interpolation과 배열 join 지원
- `js/scenes/minigame-scene.js`: 내부 START gate가 있는 게임의 안내 대기 시간을 `durationMs`에서 제외
- `css/click-to-purify.css`: CS 원본 화면만 담당하는 전용 scoped stylesheet 추가
- `css/minigames.css`: CSE 고정 frame, DS 결과 색, Code Heart 결과 card와 짧은 결과 화면 scroll 보완
- `README.md`, `docs/execution-and-controls.md`: 원본 frame 정책과 실제 START/CLICK 조작으로 갱신

### 검증 결과

- source validation: 127개 파일·21개 JSON 문서 통과
- Node 단위·계약·원본 충실도 회귀 테스트: 58/58 통과
- source HTTP·MIME smoke: 31/31 통과
- production build: `dist/` runtime 파일 85개 생성
- release HTTP·보안 경로 smoke: 37/37 통과
- 로컬 서버 `http://127.0.0.1:3000/`: 새 CS·AI stylesheet HTTP 200, 정확한 CSS MIME과 데스크톱/모바일 rule 제공 확인
- 자동 브라우저 인스턴스가 이 작업 세션에 연결되지 않아 실제 screenshot·pointer 조작 QA는 수행하지 못했습니다. 따라서 Chrome/Safari 실제 기기의 시각 확인은 별도 수동 QA 항목으로 남깁니다.

### Cloudflare 프리뷰 재배포

- 구현 커밋: `5217439` (`fix: preserve original minigame layouts responsively`)
- 공개 URL: `https://ai-change-games.towering-hisser.workers.dev`
- Cloudflare Version ID: `17a2a77c-409f-4a17-8b8c-f43dba07d861`
- 변경 runtime asset 21개를 업로드했고 기존 asset 64개를 재사용했습니다.
- 원격 root·CS/AI CSS·CS/AI/CSE/AIDS module·공통 scaler·CS/AI config는 HTTP 200과 정확한 MIME을 반환했습니다.
- root와 핵심 CSS·JS·JSON 8개는 로컬 `dist/`와 원격 응답의 SHA-256이 모두 일치했습니다.
- 원격 AI config의 목표 5개·방해 25개·`맵으로 돌아가기`, CS config의 GOOD 가중치 0.7을 확인했습니다.
- CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`를 확인했고 `History.md`, `package.json`, 임의 누락 경로는 HTTP 404였습니다.
- 이번 URL은 Cloudflare 임시 계정 프리뷰이므로 영구 운영 전 계정 귀속 또는 정식 Cloudflare 계정 배포가 필요합니다.

## 2026-08-28 Cloudflare Pages 무료 고정 대표 주소 배포

매번 다른 임시 Cloudflare 계정으로 Workers Static Assets를 배포하면서 `*.workers.dev`의 계정 subdomain이 바뀌던 문제를 정리했습니다. 정식 Cloudflare 계정을 인증하고 무료 Pages 프로젝트 `ai-change`를 생성해, 앞으로 동일하게 유지되는 production 대표 주소를 확보했습니다.

- 대표 주소: `https://ai-change.pages.dev/`
- production branch: `dev`
- 최초 Pages deployment: `https://64c80fb8.ai-change.pages.dev/`
- Pages 설정 반영 후 production deployment: `https://46b57876.ai-change.pages.dev/`
- 업로드 산출물: 검증 완료된 `dist/` runtime 파일 85개
- 배포 전 검증: source validation 128개 파일·21개 JSON, Node test 58/58, source smoke 31/31, release smoke 37/37 통과
- 원격 확인: root, `index.html`, 공통 app module, 학과 데이터와 AI·AIDS·CS·CSE·DS 게임 module 모두 HTTPS 200 및 올바른 MIME 반환
- 대표 주소의 root·공통 CSS·app·학과 데이터·게임 5종 module 등 핵심 runtime 파일 10개는 로컬 `dist/`와 원격 응답의 SHA-256이 모두 일치

기본 `wrangler.jsonc`는 Pages의 `ai-change` 프로젝트와 `dist/` output을 가리키도록 전환했습니다. `npm run cf:deploy:production`은 전체 release 검사를 통과한 뒤 `dev`를 production으로 배포하고, staging은 별도 branch alias로 분리합니다. 기존 Workers Static Assets 구성은 `wrangler.worker.jsonc`로 옮겨 프리뷰·이전 배포 경로를 잃지 않게 했습니다. 자동 브라우저가 연결되지 않은 환경이므로 실제 pointer·touch 시각 QA는 남아 있지만, 공개 대표 주소와 핵심 runtime 경로의 외부 HTTPS 응답은 확인했습니다.

## 2026-08-28 CSE 레시피 모달 조작 불능 수정

CSE Code Heart가 시작부터 조작되지 않는 것처럼 보이던 원인은 배포 누락이나 module 오류가 아니라 레시피 모달의 숨김 상태와 CSS 표시 규칙의 충돌이었습니다. CSE module은 모달의 `hidden` property를 `true`로 설정했지만 `.ch-modal-backdrop`의 `display: flex`가 이를 덮을 수 있었고, 기존 `display: none !important` 규칙은 원본 prototype의 `.hidden` class에만 적용돼 있었습니다. 그 결과 레시피 backdrop이 `z-index: 100`으로 게임을 덮고 닫은 뒤에도 남아 재료 선택과 UNLOCK 조작을 막을 수 있었습니다.

- `.code-heart-game .ch-modal-backdrop[hidden]`에 `display: none !important`를 적용해 원본 UI·크기·색·배치를 바꾸지 않고 표시 상태만 바로잡았습니다.
- CSE fidelity 검사에 시작 시 숨김, 레시피 열기, 닫기, `[hidden]` CSS 계약을 추가해 같은 회귀를 고정했습니다.
- 배포 source·`dist/`·기존 원격 CSE JS/CSS/JSON/thumbnail의 SHA-256과 HTTP·MIME을 비교해 배포 파일 누락이 아님을 확인했습니다.
- 전체 검증: source validation 128개 파일·21개 JSON, Node test 58/58, source smoke 31/31, production build 85개 파일, release smoke 37/37 통과
- Production deployment: `https://b5a718fd.ai-change.pages.dev/` (source `98ad465`)
- 대표 주소 `https://ai-change.pages.dev/`의 원격 CSS에서 `[hidden]` 보정 규칙을 확인했고 CSE CSS·JS·JSON의 SHA-256이 로컬 `dist/`와 모두 일치했습니다.
- 자동 브라우저가 연결되지 않아 실제 pointer·touch 캡처는 수행하지 못했습니다. CSE 정답 4개 주문은 DOM 상호작용 검사에서 `CLEAR`, 400점, 완료 callback 1회를 확인했습니다.

### CSE 레시피 상세 글자색 원본 복원

사용자 화면 확인 결과 레시피 제목은 보이지만 각 주문의 언어·엔진·라이브러리·도구 상세 문구가 밝은 카드에서 사라져 있었습니다. 데이터나 DOM이 누락된 것은 아니며, 상세 `span`과 원본 레시피 값은 모두 렌더링되고 있었습니다.

원본 `origin/prototype/cse-minigame`은 `index.html`에서 저장소에 존재하지 않는 `css/common.css`를 요청했기 때문에 standalone 화면에서 브라우저 기본 검정 글자색을 사용했습니다. 통합본의 실제 `css/common.css`는 공통 다크 테마를 위해 `body`에 밝은 `--text` 색을 지정하고, CSE 레시피 상세에는 별도 색이 없어 흰색 모달·밝은 회색 레시피 카드 위로 해당 색이 상속됐습니다.

- CSE의 흰색 `.ch-modal-card`에 원본 기본 글자색에 해당하는 `#333`을 component 범위로 지정했습니다.
- 분홍 레시피 제목, 보라색 모달 제목, 흰색 닫기 버튼과 원본 크기·간격·마크업은 변경하지 않았습니다.
- CSE fidelity 검사에 밝은 모달의 어두운 글자색 계약을 추가했습니다.
- 전체 검증: source validation 128개 파일·21개 JSON, Node test 58/58, source smoke 31/31, production build 85개 파일, release smoke 37/37 통과
- Production deployment: `https://4ca5a6d4.ai-change.pages.dev/` (source `040ba07`)
- 대표 주소의 원격 CSS에서 모달 `color: #333`과 `[hidden]` 규칙을 모두 확인했고, 원격 CSS의 SHA-256이 로컬 `dist/`와 일치했습니다.

## 2026-08-29 사후게임 캐릭터 이동·기본 전투 연결 시스템 구현

최신 첨부 기획안에서 담당 범위로 지정된 `캐릭터 이동`과 `캐릭터 (기본 전투 시스템)`을 구현하기 위해 최신 `dev`의 `a431795`에서 `after/character-move` 브랜치를 생성했습니다. 작업 시작 시 로컬·원격에 기존 `after/*` 브랜치가 없었고, `after/character-move`와 `dev`의 차이도 0이었습니다. 실제 Battle은 계속 빈 registry, `battles=[]`, `features.battleContent=false`인 Coming Soon 상태로 유지했습니다.

### 공용 character core

- `CharacterSystem` facade 아래 캐릭터 domain, input adapter, world controller, DOM view, 모바일 조이스틱을 분리했습니다.
- PC WASD와 모바일 조이스틱을 길이 1 이하의 같은 이동 벡터로 정규화하고, delta time 기반 이동과 상·하·좌·우 마지막 방향을 유지합니다.
- 기존 공통 InputManager의 `Space = CONFIRM`은 바꾸지 않았습니다. 캐릭터 장면에서만 `code=Space`인 CONFIRM을 공격으로 해석하고, 모바일 `ATTACK` 버튼과 같은 명령 queue로 합쳐 AI·CS의 기존 Space 조작을 보존했습니다.
- `idle`, `moving`, `attacking`, `hit`, `dead`, `control-locked` 상태와 중첩 가능한 reason 기반 조작 잠금을 구현했습니다.
- 맵 경계와 AABB solid collider, 축별 wall sliding을 유지하면서 큰 frame delta에도 얇은 벽을 건너뛰지 않도록 연속 substep 충돌 resolver를 공통 map collision scaffold에 추가했습니다.
- X알, 필드 미니게임, 전투 입장, 공격 발판, 함정, 회피 구역은 콘텐츠 규칙 없이 `enter`·`stay`·`exit` 접촉 event만 제공합니다. 같은 시스템의 world를 교체할 때 기존 접점의 `exit`도 먼저 보냅니다.
- 캐릭터 snapshot에 위치·방향·이동·공격 순간·체력·사망·외형·`footY`를 남겨 y-depth 정렬과 원격 캐릭터 표시가 가능하게 했습니다.

### 기본 전투 경계

- Space·모바일 버튼 입력은 `character:attack` event를 한 번 발생시키고 바로 기본 상태로 돌아옵니다.
- event에는 character ID, sequence, 당시 바라보던 방향, 원본 account stats와 입력 source만 전달합니다. 바라보던 방향은 공격 판정 방향이 아닙니다.
- 근접·원거리 여부, 공격 origin·방향·범위·target, 타격 판정, damage·defense·max HP 공식, cooldown, 공격 아트·effect는 추가하지 않았습니다.
- 외부 보스·함정·서버가 이미 계산한 피해만 `applyResolvedDamage()`로 받고, 매 피격에 즉시 현재 체력을 줄입니다. 별도 무적 시간은 없고 체력 0에서 사망 event는 한 번만 발생합니다.
- 계정 시스템의 `attack`, `defense`, `health`를 공식 없이 보관하며, 현재 `feature/auth-stats-ranking` 브랜치가 사용하는 `hp`도 `health` 별칭으로 받을 수 있게 했습니다. 로그인·저장·랭킹·실시간 통신은 병합하지 않았습니다.

### 화면·아트 연결

- 메인 메뉴에 실제 Battle과 분리된 `캐릭터 시스템 · DEV PREVIEW` 연습장을 추가했습니다. 기존 `배틀 · COMING SOON` 카드와 route는 그대로 남겼습니다.
- 연습장에서 경계·solid·depth object와 기획에 명시된 접점 hook, HP, 상태·방향·위치, 공격·피격 event log, 조작 잠금, 원격 snapshot 예시를 확인할 수 있습니다.
- 모바일·좁은 화면에는 왼쪽 조이스틱과 오른쪽 공격 버튼을 표시하고, logical world의 9:5 비율은 PC·모바일 모두 유지합니다.
- 최종 캐릭터 이미지는 아직 제공되지 않아 기존 다크·민트 디자인 안의 명시적인 CSS placeholder를 사용했습니다. `appearance.sprites.idle|walk.up|down|left|right`에 최종 8개 이미지 URL을 전달하면 같은 view가 방향별 이미지를 교체합니다. 공격 이미지·effect slot은 만들지 않았습니다.

### 스캐폴딩·문서 변경

- `INPUT_ACTIONS.ATTACK`을 추가하되 전역 key binding은 추가하지 않았습니다.
- `scripts/validate.mjs`와 production build의 필수 runtime 목록에 character core·scene·CSS를 등록했습니다.
- `README.md`, `docs/execution-and-controls.md`, `docs/사후게임_기획안.md`를 현재 구현 상태로 갱신하고, 팀 간 연결 계약을 `docs/after-character-system.md`에 정리했습니다.
- 캐릭터 이동·충돌·입력·공격 경계·피격·사망·stats·접촉·원격 snapshot을 고정하는 단위 테스트 11개를 추가했습니다.

### 검증 결과

- source validation: 141개 파일·21개 JSON 문서 통과
- 전체 Node 단위·계약·원본 충실도 회귀 테스트: 69/69 통과
- source HTTP·MIME smoke: 32/32 통과
- production build: 95개 runtime 파일 생성
- release HTTP·보안 경로 smoke: 38/38 통과
- 로컬 서버 `http://127.0.0.1:3000/`: root, character CSS, preview scene, character public export·facade 모두 HTTP 200과 올바른 MIME 확인
- 이 세션에 연결 가능한 인앱 브라우저 인스턴스가 없어 실제 screenshot·WASD·Space·pointer·touch 조작 QA는 수행하지 못했습니다. Chrome·Safari 실제 기기의 조이스틱 동시 입력과 화면 회전은 수동 QA로 남깁니다.

## 2026-08-30 로그인·스탯 DB·랭킹 서버 통합 기준 정리

GitHub PR #12 `feat: add authorize, login, ranking board functionality`에서 Cloudflare Worker·D1, Google 로그인, 이용자 스탯과 랭킹의 초안을 가져와 현재 SPA 및 사후게임 캐릭터 시스템과 연결하는 통합 작업을 시작했습니다. 원본 PR의 기여와 merge 이력은 유지하되, 독립 `public/` 화면을 그대로 배포하지 않고 기존 app router·scene·service와 같은 origin API 구조로 이식하는 방식을 택했습니다.

원본을 그대로 운영하지 않은 이유는 다음과 같습니다.

- 인증 없이 body의 `userId`를 받아 다른 이용자의 스탯을 바꿀 수 있었습니다.
- 전체 이용자·개별 스탯 API가 내부 provider ID와 email을 공개했습니다.
- Google OAuth `state` 검증이 없고, 발급 cookie는 서명되지 않은 원본 ID였으며 보호 API의 인증 근거로 쓰이지 않았습니다.
- 모든 origin을 허용하는 CORS와 프론트의 `http://localhost:8787` 고정 주소 때문에 운영 인증 경계와 실제 연결이 맞지 않았습니다.
- 별도 `public/login.html`, `public/rankingBoard.html`은 현재 root production build에 포함되지 않아 기존 SPA와 분리돼 있었습니다.

통합 기준은 하나의 Cloudflare Worker가 `/api/*`를 먼저 처리하고 나머지 경로에서는 `dist/` Static Assets를 제공하는 same-origin 구조입니다. session은 무작위 token을 `HttpOnly`·`SameSite=Lax` cookie로 전달하고 D1에는 token hash와 만료 시각만 저장합니다. 공개 API는 health·Google 로그인 시작/callback·표시 이름과 점수/클리어만 담은 ranking으로 제한하며, 본인 session 조회·logout·CLEAR 결과 등록·스탯 포인트 배분은 인증된 경로로 분리합니다. 공개 users와 ID 기반 stats 조회는 통합 계약에서 제외합니다.

미니게임 완료 시 host의 `attemptId`, 등록된 `gameId`, `CLEAR`, 제한된 score만 서버에 보내고 계정은 session에서 결정합니다. 같은 계정·attempt는 한 번만 반영해 `clears`와 미배분 포인트의 중복 지급을 막습니다. 다만 게임 판정 자체가 브라우저 JavaScript에서 발생하므로 인증과 멱등성만으로 조작을 완전히 막을 수 없으며, 경쟁성 랭킹에는 추후 서버 challenge나 검증 가능한 event 정책이 필요합니다.

계정의 `attack`·`hp`·`defense`는 계산 전 원본 스탯으로 캐릭터 core에 연결합니다. `hp`는 `health` 입력 별칭이지만 Battle의 `maxHealth` 공식이나 현재 체력을 의미하지 않습니다. 최대 체력·피해·방어 공식은 Battle 규칙에서 별도로 계산해야 합니다.

세부 API 계약, 로컬 D1 migration·Worker 실행, `.dev.vars`와 Cloudflare secret 배치, Google redirect URI, 개인 Cloudflare/D1에서 운영 계정으로 옮기는 절차는 `docs/auth-stats-ranking.md`에 정리했습니다. secret 실제 값은 어떤 문서에도 기록하지 않습니다.

이 기록 시점에는 다음 항목을 완료로 표시하지 않습니다.

- 실제 Google Client ID·Secret을 사용한 로그인 callback 종단 간 검증
- staging·production D1 migration과 데이터 이전
- 대표 custom domain의 same-origin Worker 배포
- 운영 환경에서의 session·logout·랭킹·CLEAR 멱등성·스탯 배분 회귀 확인
- 네트워크 실패 후 계정 귀속을 보존하는 CLEAR 재시도 queue

### 통합 구현 결과

- 원본 PR #12의 13개 커밋을 `after/character-move` 위 통합 merge 이력으로 보존했습니다. PR이 오래된 `main`을 대상으로 하고 있어 원본 브랜치를 직접 수정하지 않고 `integration/after-auth-stats-ranking`에서 최신 스캐폴드에 이식했습니다.
- Google OAuth `state`, 만료되는 opaque session과 token hash 저장, 로그아웃, 본인 session 기반 스탯 조회·배분을 Worker에 구현했습니다. 공개 users·ID 기반 stats와 인증 없는 기존 `PUT /api/stats`는 제거했습니다.
- D1 baseline과 보안 확장을 두 migration으로 나눠 기존 users·stats를 보존하면서 `unspent_points`, `sessions`, `game_results`를 추가할 수 있게 했습니다.
- 독립 `public/` 로그인·랭킹 페이지는 기존 dark/pixel SPA의 account·ranking scene과 same-origin AccountService로 이식한 뒤 제거했습니다. Google 표시 이름의 공개 랭킹 사용을 로그인 화면에 고지하고 email·외부 계정 ID는 응답과 화면에서 제외했습니다.
- 실제 MVP 미니게임의 `CLEAR`만 `attemptId`와 함께 서버에 전송합니다. 최초 시도만 클리어·미사용 포인트를 올리고 재전송은 중복 응답으로 끝납니다. 게스트 또는 API 장애 시 기존 로컬 결과 화면과 저장은 계속 동작합니다.
- CSE 최대 400, AI·CS 최대 100처럼 서로 다른 점수 단위를 한 줄로 비교하지 않도록 점수 랭킹을 `gameId`별로 분리하고, 전체 랭킹의 기본 화면은 누적 클리어로 변경했습니다. 점수가 없는 DS·AIDS는 현재 점수 선택 목록에서 제외했습니다.
- 계정의 `attack`·`hp`·`defense`를 캐릭터 raw stats에 연결했으며 연습장의 `100 / 100` 체력 fixture와 미확정 Battle 공식은 변경하지 않았습니다.

### 로컬 검증 결과

- source validation: 157개 파일·24개 JSON 문서 통과
- 전체 Node 단위·계약·원본 충실도 회귀 테스트: 86/86 통과
- source HTTP·MIME smoke: 33/33 통과
- production build: 99개 runtime 파일 생성
- release HTTP·보안 경로 smoke: 39/39 통과
- Backend TypeScript typecheck, Wrangler Static Assets+D1 dry-run, 로컬 D1 migration 통과
- 로컬 Worker에서 SPA·account asset·health·session·ranking 200, 폐기 API 404, 외부 Origin 403, 미인증 결과 등록 401을 확인했습니다.
- 이 세션에는 제어 가능한 브라우저가 제공되지 않아 실제 화면 클릭·스크린샷과 Google 계정 OAuth E2E는 수행하지 못했습니다.

## 2026-08-30 사전 미니게임 5종 반응형 표시 보정

기존 기능 브랜치의 디자인과 게임 판정을 유지하면서 모바일 크기에서만 멈추던 표시 상한과 좁은 화면의 잘림을 보정했습니다. 게임 내부 좌표를 화면 크기에 따라 다시 계산하지 않고 각 원본 논리 프레임과 Canvas 해상도를 유지해, 리사이즈 도중에도 속도·배치·충돌 판정이 달라지지 않게 했습니다.

- AI: 원본 `480×640` 프레임과 `480×460` Canvas는 유지하고 표시 프레임만 최대 `640px`까지 확대합니다. HUD·안내·카운트다운 글자도 같은 비율로 커지며, 높이가 짧은 가로 화면에서는 기존처럼 화면 높이에 맞춰 축소합니다.
- CS: 고정 2열 grid를 원본 prototype의 `flex-wrap` 구조로 복원했습니다. `480×480` Canvas와 `300px` 패널을 기준으로 최대 `600px`·`375px`까지 함께 커지고, 중간 폭·모바일에서는 내부 요소를 찌그러뜨리지 않고 위아래로 줄바꿈합니다.
- CSE: 원본 `440×920` 내부 UI와 세로 스크롤을 그대로 두고 바깥 배율 상한만 `1.25`로 열어 태블릿·PC에서 최대 `550×1150`으로 표시합니다.
- DS: 카드 최대 폭을 넓히고 5열 키패드를 `minmax(0, 1fr)`로 바꿨습니다. 320~375px에서도 5열·색·버튼 순서는 유지하면서 가로 잘림 없이 줄어들고, 짧은 화면에서는 DS UI만 스크롤됩니다. 초기화 도중 DOM 생성이나 listener 연결이 실패해도 전용 host class와 부분 UI를 되돌립니다.
- AIDS: 원본 `390×740` 논리 프레임의 최대 배율을 `1.35`로 열었습니다. 발판 외곽은 `84 × scale`, 실제 공이 굴러가는 면과 충돌 폭은 `80 × scale`로 함께 바뀝니다. `platformHalfLen=40`에서 CSS 외곽 폭을 계산하도록 단일화해 설정을 바꿔도 보이는 길이와 물리 판정이 어긋나지 않습니다. 플레이 중 resize에서는 발판을 다시 생성하지 않아 random jitter와 진행 중인 공의 target 참조를 보존합니다.

반응형 계약 테스트에는 AI 표시 상한·3:4 비율·짧은 가로 화면, CS 원본 기준 flex wrapping, CSE 확대 후 재축소, DS 좁은 화면 5열·host class 정리·초기화 rollback, AIDS `0.5→1.35` 배율·발판 외곽/충돌 길이·굴림 이탈 경계를 추가했습니다. 전체 검증은 source validation 157개 파일·24개 JSON, Node 테스트 91/91, source smoke 33/33, production build 99개 파일, release smoke 39/39, Worker TypeScript 검사를 통과했습니다. 이 세션에는 연결 가능한 브라우저 인스턴스가 없어 screenshot 기반 QA는 수행하지 못했으며, 로컬 서버 응답과 논리 배율·가짜 DOM·CSS 계약 테스트로 검증했습니다.

## 2026-08-30 사전 미니게임 데스크톱 레이아웃 재구성

직전 반응형 보정은 모바일 원본 프레임을 비례 확대하는 방식이어서, 넓은 데스크톱 stage 안에서도 세로형 게임과 큰 좌우 여백이 남았습니다. 기능 브랜치를 다시 대조한 결과 이는 통합 누락이 아니라 원본 구현에도 데스크톱 구성이 없었기 때문이었습니다.

- AI `origin/prototype/ai-minigame@ebfda86`: `480×640` 고정 카드와 `480×460` Canvas만 제공하고 desktop breakpoint가 없었습니다.
- CS `origin/feature/click-to-purify@02d63d5`: `480×480` Canvas와 `300px` 패널을 나란히 두고 `600px` 이하에서 세로로 바꾸는 축소 규칙만 있었습니다.
- CSE `origin/prototype/cse-minigame@e3f94f4`: 주석의 PC 기준도 `440×920`인 고정 세로 화면이었습니다.
- DS `origin/feature/ds-minigame@d2be19c`: 전용 CSS 없이 DOM과 임시 history inline style만 있었습니다.
- AIDS `origin/feature/aids-minigame@1abc737`와 balance `origin/balance/aids-minigame-physics@1ece42c`: `390×740` 세로 화면과 고정 `84px` 발판이며 desktop field·physics 재계산은 없었습니다.

모바일 원형을 바꾸지 않고 충분히 넓고 높은 host에서만 전용 desktop class를 활성화하도록 공통 fixed-frame scaler를 확장했습니다. 일반 scene의 `1120px` 폭은 그대로 두고 미니게임 scene만 최대 `1440px`을 사용할 수 있습니다.

- AI: 기존 상단 HUD를 전체 폭에 유지하고 `480:460` Canvas를 원형 왜곡 없이 최대 `720×690`으로 확대했습니다. 기존 하단 조작부는 오른쪽 sidebar로 옮겨 전체 게임이 최대 `1000×750` landscape frame을 사용합니다. 시작·카운트다운 overlay와 게임 판정은 같은 DOM·논리 Canvas를 사용합니다.
- CS: 원본 `480 + 300` 구성을 `8:5` 비율로 최대 `720 + 450`까지 함께 확대하고 gauge·글자·버튼·설명창도 같은 표시 배율을 적용했습니다. desktop 경계에서는 좌우 padding과 gap을 폭 계산에서 먼저 제외하며, tablet·mobile·짧은 landscape의 기존 wrapping 규칙은 유지합니다.
- CSE: 모바일은 기존 `440×920` fixed frame과 세로 scroll을 유지합니다. desktop에서는 같은 header·손님·주문·작업대·feedback·재료·UNLOCK 카드를 2열 landscape workspace로 재배치하고 내부 세로 scrollbar를 제거했습니다. 레시피 modal의 기존 내용과 조작은 유지합니다.
- DS: 기존 네온 카드와 5열 keypad를 유지하면서 desktop에서 입력·조작 영역과 history를 2열로 배치하고 최대 `1200px` 폭과 가용 높이를 사용합니다. 좁은 화면의 5열 overflow 보정은 그대로 적용됩니다.
- AIDS: 모바일에서는 `390×740`, 기준 field `362×490`, 기존 물리값을 유지하고 desktop에서는 같은 HUD·field·상자·좌우 버튼이 전체 frame을 사용합니다. field 폭에서 발판 half-length를 계산해 표시 길이와 착지·굴림 경계를 일치시키며 수평 가속도·속도·이탈 속도·miss 여백도 같은 비율로 바꿉니다. field 높이는 중력 비율에 반영합니다. 실행 중 resize는 발판 객체와 random jitter를 재생성하지 않고 공의 위치·속도를 새 field로 변환해 `platform`·`targetPlatform` 참조를 보존합니다. 상자 중심도 physics의 `22% / 78%` 목표 좌표와 같은 field 폭을 사용합니다.

공통 scaler, 게임별 desktop CSS, CSE fluid 전환과 AIDS responsive physics에 회귀 테스트를 추가했습니다. 자동 검증은 source validation `157`개 파일·`24`개 JSON, Node 테스트 `95/95`, source HTTP smoke `33/33`, production build `99`개 runtime 파일, release HTTP smoke `39/39`, Backend TypeScript 검사를 모두 통과했습니다. 로컬 서버는 정상 기동했지만 이 세션에 연결 가능한 브라우저가 없어 실제 screenshot·pointer·touch 시각 QA는 별도 실제 브라우저 확인 대상으로 남깁니다.
