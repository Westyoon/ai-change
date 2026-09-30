# ai-change

이화여자대학교 인공지능대학 축제를 탐색·대화·미니게임 경험으로 소개하는 반응형 웹게임입니다.

현재 통합본에는 DS·CS·CSE·AI·AIDS 사전게임 5종, 캐릭터로 입장 필드와 중심 광장을 오가는 사후 이동 월드, 사후 콘텐츠 4종(`stat-boss`, `data-sphinx`, `control-boss`, `xr-egg-trials`), 사전게임 5종 완료 뒤 Story 목록에 추가되는 이아이 결말 게임 `word-breaker`와 공용 캐릭터 모듈, Google 로그인·계정 스탯·공개 랭킹이 들어 있습니다. 로그인은 Battle 메뉴의 사후 이동 월드와 보스방에만 필요하며, `word-breaker`를 포함한 Story는 게스트로도 플레이할 수 있습니다. 로그인 사용자는 입장 필드·광장에서 다른 캐릭터를 보고, 보스별 공개 방의 이름과 1~5명 정원을 정해 만들거나 참가합니다. 방은 정원이 차도 자동으로 시작하지 않으며, 1명 이상 들어온 뒤 방장이 원하는 시점에 직접 시작합니다. 시작한 방에서는 Durable Object가 하나의 보스 HP·상태·공통 승리와 파티원의 현재·최대 HP 및 전투 불능 상태를 관리합니다. 운영 주소는 통합 Worker인 `https://ai-change.ai-change-backend.workers.dev` 하나이며 Google OAuth와 운영 D1 연결을 확인했습니다. API가 없던 기존 Cloudflare Pages 프로젝트는 2026-09-10에 폐기했습니다.

## 학과 코드

학과 표기와 코드의 단일 기준은 `data/departments.json`입니다.

| 코드 | 학과·전공 | 경로용 slug |
| --- | --- | --- |
| `AI` | 인공지능학부 | `ai` |
| `DS` | 데이터사이언스전공 | `ds` |
| `CSE` | 컴퓨터공학과 | `cse` |
| `CS` | 사이버보안학과 | `cs` |
| `AIDS` | 인공지능데이터사이언스학부 | `aids` |

저장과 대화에서 참조하는 기존 미니게임 stable ID는 변경하지 않습니다.

## 실행 방법

Node.js 22 이상이 필요합니다. 고정된 Wrangler 4.127.0이 Node.js 22 이상을 요구합니다.

### 게스트용 정적 SPA

루트 앱에는 외부 패키지 의존성이 없습니다.

```bash
npm run dev
```

기본 주소는 `http://127.0.0.1:4173`입니다. 이 모드에서는 Story·미니게임·캐릭터를 확인할 수 있지만 `/api/*`와 Durable Object가 없으므로 로그인 필수 Battle, 계정 화면, 온라인 presence·공개 방은 사용할 수 없습니다. ES module과 JSON fetch를 사용하므로 `index.html`을 `file://`로 직접 열지 않습니다.

### 로그인·D1·Durable Object를 포함한 same-origin Worker

처음 한 번 백엔드 도구를 설치하고 로컬 D1 migration을 적용합니다.

```bash
npm --prefix backend install
npm run cf:full:db:migrate:local
npm run cf:full:dev
```

`cf:full:dev`는 먼저 SPA를 `dist/`로 빌드한 다음 `backend/wrangler.toml`로 Worker를 실행합니다. Worker는 `/api/*`와 `/api/postgame/socket` WebSocket을 처리하고 그 외 요청에는 같은 origin의 `dist/` 정적 파일을 제공합니다. D1은 계정·스탯·사전게임 완료 기록·사후게임 성장 보상, 단일 SQLite-backed Durable Object는 사후 월드 presence·공개 방·방별 공유 보스 상태를 담당합니다. 터미널에 출력된 Wrangler 주소로 접속합니다.

현재 개발 명령은 SPA를 시작할 때 한 번 빌드합니다. 프런트 소스를 바꾼 뒤에는 Worker를 종료하고 `cf:full:dev`를 다시 실행합니다. 특히 Windows에서는 Wrangler가 `dist/`를 제공하는 동안 별도 `npm run build`를 동시에 실행하면 디렉터리 잠금 오류가 날 수 있습니다.

Google 로그인을 로컬에서 확인할 때만 `backend/.dev.vars.example`을 `backend/.dev.vars`로 복사하고 아래 키를 실제 값으로 채웁니다. `.dev.vars`는 Git에서 제외되며 예시나 문서에 실제 값을 적지 않습니다.

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Google Cloud Console에는 Wrangler가 출력한 origin의 `/api/auth/callback`을 승인된 redirect URI로 정확히 등록해야 합니다. Client secret은 브라우저 코드, 저장소, 채팅에 공유하지 않습니다. secret 없이도 health·비로그인 session·공개 ranking·인증 차단 동작은 점검할 수 있습니다.

## 계정·스탯·랭킹 계약

- `GET /api/me`: 현재 로그인 상태, 공개 표시 이름·닉네임, 본인 스탯과 서로 다른 완료 게임 ID 목록 `completedGameIds`를 반환 (`/api/session`은 같은 응답의 호환 별칭)
- `PATCH /api/me`: 로그인한 본인의 공개 닉네임을 설정하고 갱신된 `/api/me` 전체 응답을 반환
- `GET /api/auth/google`, `GET /api/auth/callback`: OAuth `state`를 검증하는 Google 로그인
- `POST /api/auth/logout`: 현재 서버 session 폐기
- `GET /api/ranking?criteria=boss-clears&bossId=<id>`: 스탯·컨트롤 보스별 파티 누적 클리어 순위
- `GET /api/ranking?criteria=boss-speed&bossId=<id>`: 스탯·컨트롤 보스별 파티 최단 클리어 순위
- `POST /api/results`: 로그인한 계정의 사전게임 CLEAR를 시도 ID별 한 번 기록(경험치·레벨·스탯 포인트는 지급하지 않음)
- `POST /api/postgame/results`: 로그인 상태의 필드 X알 `xr-egg-trials` CLEAR를 멱등 기록하고 성장 보상을 지급
- `POST /api/stats/allocate`: 미사용 포인트를 공격·HP·방어 중 하나에 배분
- `GET /api/postgame/socket`: 로그인 session·same-origin 검증 뒤 입장 필드/광장 presence, 보스별 공개 방과 방별 공유 보스 상태 WebSocket으로 upgrade

브라우저에는 무작위 session token만 `HttpOnly` cookie로 전달하고 D1에는 그 SHA-256 hash와 만료 시각을 저장합니다. 외부 계정 ID나 이메일을 공개하는 users/stats API와 요청 body의 `userId`를 신뢰하는 갱신 API는 제공하지 않습니다.

> 개인정보·랭킹 고지: Google 로그인 시 Google 계정 ID·이메일·표시 이름을 계정 연결용으로 D1에 저장합니다. 이용자가 정한 닉네임이 있으면 닉네임과 게임 기록을 공개 랭킹·사후게임에 표시하고, 없으면 Google 표시 이름을 사용합니다. 이메일과 외부 계정 ID는 공개 API로 반환하지 않습니다. 테스트·배포 전 참가자에게 이 수집·공개 범위와 보관·삭제 담당자를 로그인 전에 고지하고, 동의한 계정만 사용합니다.

사전게임 5종의 CLEAR와 로그인 후 진행 병합은 스토리 완료·수호알·해금 상태만 저장하며 경험치, 레벨, 스탯 포인트를 지급하지 않습니다. 영구 성장은 로그인 상태에서 사후게임 X알 `xr-egg-trials`을 CLEAR하거나, 서버가 `data-sphinx`·`stat-boss`·`control-boss`의 공동 승리를 확정했을 때만 발생합니다. 유효한 CLEAR 1회당 경험치 100, 레벨 1, 미사용 스탯 포인트 1을 지급합니다. 실패, QR, 다른 이벤트, Story 최종전 `word-breaker`는 성장 보상을 주지 않습니다. 이 정책 적용 전에 이미 저장된 레벨·경험치·포인트는 소급해 차감하지 않고 그대로 보존합니다.

공개 랭킹은 성장 보상 대상과 별개로, 서버가 공통 보스 HP의 승리를 판정할 수 있는 `stat-boss`와 `control-boss`만 대상으로 합니다. `data-sphinx`는 성장 보상은 주지만 현재 랭킹에는 넣지 않습니다. 같은 참가자 구성은 하나의 파티로 묶고, 방 이름을 팀 이름으로 표시하며 그 아래에 클리어 당시 참가자 닉네임을 표시합니다. 1인 파티는 닉네임을 대표 이름으로 표시합니다.

사후게임 WebSocket은 공개 방 이름(정규화 후 1~32자), 정원 1~5명, 방장의 수동 시작·이탈 시 위임, 같은 계정의 중복 좌석 차단을 처리합니다. 방 이름과 진행 중 방 상태는 Durable Object의 일시적 데이터입니다. 시작 시 모든 참가자에게 같은 `seed`·`startedAt`·`roster`를 전달하고, 방별 Durable Object가 `bossHp`·`status`·`revision`과 공통 승리를 소유합니다. 각 기기의 전투 화면 로딩이 끝나 연결된 생존 파티원 전원이 준비된 뒤에만 hit를 허용하며, 이 준비 완료 시점부터 승리까지를 최단 클리어 시간으로 계산합니다. 스탯·컨트롤 보스 승리는 room ID당 정확히 한 번 D1에 팀·참가자 snapshot과 함께 저장합니다. 각 클라이언트가 계산한 현재·최대 HP를 서버가 검증·저장해 파티 HUD에 배포하며 HP 0인 참가자는 회색 전투 불능 상태가 되고 더 공격하거나 같은 전투에서 자동 부활할 수 없습니다. 재접속 때 진행 중인 전투가 있으면 자동 입장하지 않고 `이어하기 / 전투 나가기`를 선택합니다. 실행 중 전원이 끊긴 방은 15분간 재접속을 기다리고, 종료된 방은 5분 뒤 자동 정리합니다. 플레이어 이동·회피와 보스 기믹·phase는 여전히 각 브라우저가 계산하므로 위치 동기화나 완전한 서버 물리 시뮬레이션까지 구현된 것은 아닙니다.

따라서 현재 랭킹 화면은 테스트 순위로 표시하며 실물 보상이나 공식 경쟁 결과에 사용하지 않습니다.

## 검증 명령

```bash
npm run validate
npm test
npm run smoke
npm run check
npm run cf:full:check
```

- `validate`: 필수 runtime 파일, JSON, 버전, registry·script·asset 참조 검사
- `test`: core·미니게임 lifecycle과 인증 백엔드 정적 보안 계약 검사
- `smoke`: 임시 정적 서버의 응답·MIME 검사
- `check`: 위 root 검사를 순서대로 실행
- `cf:full:check`: root release 검사와 Worker TypeScript typecheck 실행

## Cloudflare 배포 경로

배포 명령은 용도가 다르므로 구분해서 사용합니다.

| 경로 | 명령 | 용도 |
| --- | --- | --- |
| 통합 Worker | `npm run cf:full:dev` | 로컬 SPA + API + D1 + Durable Object |
| 통합 Worker | `npm run cf:deploy:production` | 대표 운영 주소의 SPA + API + D1 + Durable Object 배포 |
| 통합 Worker | `npm run cf:full:deploy` | 위 운영 배포가 호출하는 기존 호환 명령 |
| 단순 정적 서버 | `npm run dev` | 계정 API 없는 UI 로컬 확인 |
| 레거시 Static Worker | `npm run cf:dev:worker` | `wrangler.worker.jsonc`를 이용한 로컬 호환성 확인만 수행 |

로그인·서버 저장을 사용하는 canonical 주소는 `https://ai-change.ai-change-backend.workers.dev`입니다. API 없는 공개 정적 배포를 다시 만들지 않도록 Pages와 레거시 Static Worker의 외부 배포 명령을 제거했습니다.

현재 운영 Cloudflare 계정의 Worker와 D1 binding, Google OAuth secret 및 callback 연결을 완료했습니다. 사후게임 실시간 기능은 같은 Worker 환경의 `POSTGAME` Durable Object binding과 SQLite class migration이 함께 배포되어야 합니다. secret 값은 저장소에 두지 않으며, 계정 이전·secret 회전·schema 변경 때만 대상 계정과 D1·Durable Object 구성을 다시 확인합니다.

Cloudflare Worker의 `PUBLIC_ORIGIN`은 `https://ai-change.ai-change-backend.workers.dev`, Google Console의 production redirect URI는 `https://ai-change.ai-change-backend.workers.dev/api/auth/callback`으로 맞춥니다.

```bash
npm run cf:full:check
npm run cf:deploy:production
```

마지막 명령은 기존 Pages 호환 주소의 redirect 규칙을 변경할 때 실행합니다. 운영 migration, `wrangler secret put`, 배포 명령은 원격 상태를 바꾸므로 대상 계정 확인과 개인정보 고지 후 명시적으로 실행합니다.

## 현재 확인 가능한 흐름

```text
Loading
  ├─ Main Menu → Story → 공통 인트로 대사(최초 1회) → 캐릭터 이동형 Map
  │                         └─ NPC 상호작용 → 학과 도입 이야기 → 게임 방법 → 미니게임
  │                              ├─ CLEAR → 학과 마무리 이야기 → 수호알 획득 → Map
  │                              └─ FAIL → Map
  ├─ 상단 내 계정 → Google 로그인 / 스탯 확인·배분
  ├─ 랭킹보드 → 스탯·컨트롤 보스별 누적 클리어 / 최단 클리어
  └─ Battle → 5종 완료 후 활성화 → 이동 월드·사후 콘텐츠
       ├─ 로그인: 다른 캐릭터 presence·이름과 정원을 정하는 보스별 공개 방 1~5명·방장 수동 시작
       └─ 게스트·연결 장애: 로그인 또는 연결 복구 안내(솔로 우회 없음)
```

2026-09-28 Story 월드는 `1024×640` 논리 맵을 캐릭터로 직접 이동합니다. 수호자 가까이에서 PC는 `Space`·`Enter`·`E`, 모바일은 화면의 `대화` 버튼으로 상호작용합니다. 최초 상호작용은 학과 도입 이야기와 게임 방법을 거쳐 미니게임으로 이어지고, 최초 CLEAR 뒤에는 학과 마무리 이야기와 수호알 획득 연출을 완료한 후 맵으로 돌아옵니다. 얻은 알과 설명, 다시 볼 수 있는 도입·마무리 이야기는 우측 상단 수호알 인벤토리의 `우리의 기억`에서 확인합니다. 모바일 세로 화면은 플레이어 중심 카메라를 사용하고, 노트북 화면은 같은 월드를 한 화면에 맞춥니다. 로그인 상태에서 CLEAR하면 session 기준으로 결과를 보내며, 게스트이거나 서버가 연결되지 않아도 로컬 게임 흐름은 계속됩니다. 미니게임 CLEAR만으로는 수호알이 생기지 않으며, 학과 마무리 이야기의 마지막 대사까지 본 뒤 로컬·계정 `seenStoryIds`에 기록된 서로 다른 수호알 5개가 실제 Battle·최종전 해금 기준입니다.

메인 테마는 앱 로딩이 끝나면 반복 재생을 시도합니다. 브라우저가 자동재생을 막는 환경에서는 첫 클릭·터치·키 입력과 동시에 시작되며, 상단 `설정`의 전체 음량·배경음·음소거 값을 따릅니다.

## 미니게임 모듈

| 학과 코드 | Stable ID | 미니게임 | 상태 |
| --- | --- | --- | --- |
| `DS` | `data-number-baseball` | 숫자 야구 | MVP |
| `CS` | `cyber-click-to-purify` | CLICK to PURIFY | MVP |
| `CSE` | `computer-code-heart` | Code Heart: Unlock! | MVP |
| `AI` | `ai-ball-classification` | AI Ball Classification Game | MVP |
| `AIDS` | `ai-data-egg-sort` | 인지알·데사알 분류 게임 | MVP |

각 기능 브랜치의 색·문구·카드·버튼과 게임 규칙을 유지합니다. AI는 `480×640`, AIDS는 `390×740` MVP 세로 프레임 전체를 모바일에서 비례 축소하고 가용 높이가 충분한 큰 화면에서 각각 최대 약 `1.33배`·`1.35배`까지 비례 확대하므로 HUD·필드·조작부의 위치와 종횡비가 바뀌지 않습니다. CSE는 모바일에서 `440×920` 원본 세로 프레임을 유지하고 충분히 큰 데스크톱에서는 2열 작업 공간으로 재배치합니다. CS Canvas는 원본 종횡비를 유지합니다. 각 모듈은 `init`, `start`, `pause`, `resume`, `restart`, `destroy`, `getState` 공통 lifecycle을 따릅니다.

콘텐츠 registry에는 `stat-boss`, `data-sphinx`, `control-boss`, `xr-egg-trials`, `word-breaker`가 `published` 상태로 등록되어 있습니다. 앞의 세 보스는 중심 광장 북쪽의 독립 출입문이며 로그인과 보스별 공개 방을 반드시 거쳐 진입합니다. `xr-egg-trials`는 로그인 후 입장하는 필드를 걷다가 나타나는 랜덤 X알입니다. `word-breaker`는 사후 Battle이 아니라 Story의 이아이 결말 게임이며, 사전게임 5종 완료 뒤 Story 맵 위쪽 포털에서 로그인 없이 실행합니다. 필드와 광장 사이는 새로고침 없이 이동합니다. 공개 방의 참가자들은 서버가 관리하는 하나의 보스 HP와 공통 승리를 공유하고, 왼쪽 파티 HUD에서 서버에 동기화된 생명과 전투 불능 상태를 확인합니다. 이동·회피·보스 기믹과 phase 계산 자체는 각 클라이언트의 로컬 상태입니다. 교체된 전역 prototype과 개발 harness는 원본 보존·참고용으로 저장소에 남아 있으나 production `dist/`에서는 제외합니다.

## 주요 구조

```text
index.html
css/                  공통·반응형·게임·계정/랭킹 스타일
js/
  core/               입력·저장·asset·account 등 공통 service
  scenes/             화면 단위 orchestration과 계정·랭킹 scene
  minigames/          registry, 공통 계약, 학과별 모듈
  battle/             사후게임 공용 core와 published 콘텐츠 5종
data/                 학과·미니게임·대화·map runtime 데이터
assets/               자체 제작 SVG placeholder와 게임 asset
backend/
  src/                same-origin Worker API와 PostgameCoordinator
  migrations/         D1 schema migration
  wrangler.toml       Worker·Static Assets·D1·Durable Object binding/migration
scripts/              build·validation·smoke·정적 개발 서버
tests/                unit·contract·integration test
docs/                 계획·기획·실행·인증 통합 문서
```

## 개발 원칙

- 표시용 학과명은 `data/departments.json`, 미니게임 연결은 stable ID를 사용합니다.
- 로그인 여부나 API 장애가 Story·사전게임 진행을 막지 않게 하되 Battle은 로그인 session을 필수로 확인합니다.
- mutation API는 same-origin JSON 요청과 서버 session을 기준으로 계정을 결정합니다.
- 사후게임 WebSocket은 same-origin과 로그인 session을 요구하며, 연결 실패 때 로컬 보스 전투로 우회하지 않습니다.
- D1에는 계정·스탯·결과를, Durable Object에는 고빈도 presence·공개 방과 방별 공유 보스 상태를 둡니다.
- 이메일·provider ID·session token·secret을 화면이나 공개 API에 노출하지 않습니다.
- dialogue, 계정 이름, 랭킹 이름은 HTML 문자열이 아니라 text node로 출력합니다.
- 확정되지 않은 balance 값은 runtime config에 임의로 넣지 않습니다.
- 외부 리소스를 추가하면 `docs/asset-sources.md`도 갱신합니다.

## 문서

- [통합 개발 계획](./docs/AI_CHANGE_PLAN.md)
- [기획안](./docs/기획안.md)
- [사후게임(Battle) 기획안](./docs/사후게임_기획안.md)
- [5단계 생명·수호알 최종전 기획·구현 기준](./docs/final-battle-plan.md)
- [사후게임 공용 캐릭터 시스템](./docs/after-character-system.md)
- [사후게임 전투 공식 및 조정 가이드](./docs/사후게임_전투공식_및_조정가이드.md)
- [로그인·스탯·랭킹 통합](./docs/auth-stats-ranking.md)
- [실행 및 조작 방법](./docs/execution-and-controls.md)
- [리소스 출처 목록](./docs/asset-sources.md)
- [Git 브랜치 규칙](./docs/GIT_BRANCH_RULE.md)
- [브랜치 통합 기록](./History.md)

## 아직 구현·검증하지 않은 범위

- 별도 custom domain 연결과 staging 분리·백업 복구 rehearsal
- 브라우저 결과 조작을 판별하는 서버 권위의 점수 검증
- 일시적인 서버 장애·탭 종료 뒤에도 CLEAR를 복구하는 계정별 안전한 재시도 queue
- `word-breaker` 최종 자체 제작 이아이·수호알 아트와 효과음
- 사후 이동 월드의 최종 배경·문·광장 아트 교체
- 5개 미니게임의 최종 balance·점수 정책
- 사후 콘텐츠 5종의 실제 기기 플레이테스트·최종 밸런스·아트·사운드
- 플레이어 위치·회피·피격·보스 기믹·phase까지 서버에서 판정하는 완전한 위치 동기화·서버 물리 시뮬레이션
