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
