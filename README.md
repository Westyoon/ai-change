# ai-change

이화여자대학교 인공지능대학 축제를 탐색·대화·미니게임 경험으로 소개하는 반응형 웹게임입니다.

현재 통합본에는 DS·CS·CSE·AI·AIDS 미니게임 5종, 사후게임 공용 캐릭터 이동·충돌·기본 공격 모듈, Google 로그인·계정 스탯·공개 랭킹을 위한 SPA와 Cloudflare Worker/D1 코드가 들어 있습니다. 로그인하지 않아도 게임은 게스트 모드로 플레이할 수 있습니다. 로그인 기능의 실제 OAuth 종단 간 검증, 운영 D1 migration, 대표 주소 배포는 아직 완료로 간주하지 않습니다.

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

기본 주소는 `http://127.0.0.1:4173`입니다. 이 모드에서는 미니게임과 캐릭터 미리보기를 확인할 수 있지만 `/api/*`가 없으므로 계정 화면은 연결 불가 상태로 표시됩니다. ES module과 JSON fetch를 사용하므로 `index.html`을 `file://`로 직접 열지 않습니다.

### 로그인·D1을 포함한 same-origin Worker

처음 한 번 백엔드 도구를 설치하고 로컬 D1 migration을 적용합니다.

```bash
npm --prefix backend install
npm run cf:full:db:migrate:local
npm run cf:full:dev
```

`cf:full:dev`는 먼저 SPA를 `dist/`로 빌드한 다음 `backend/wrangler.toml`로 Worker를 실행합니다. Worker는 `/api/*`를 처리하고 그 외 요청에는 같은 origin의 `dist/` 정적 파일을 제공합니다. 터미널에 출력된 Wrangler 주소로 접속합니다.

현재 개발 명령은 SPA를 시작할 때 한 번 빌드합니다. 프런트 소스를 바꾼 뒤에는 Worker를 종료하고 `cf:full:dev`를 다시 실행합니다. 특히 Windows에서는 Wrangler가 `dist/`를 제공하는 동안 별도 `npm run build`를 동시에 실행하면 디렉터리 잠금 오류가 날 수 있습니다.

Google 로그인을 로컬에서 확인할 때만 `backend/.dev.vars.example`을 `backend/.dev.vars`로 복사하고 아래 키를 실제 값으로 채웁니다. `.dev.vars`는 Git에서 제외되며 예시나 문서에 실제 값을 적지 않습니다.

```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Google Cloud Console에는 Wrangler가 출력한 origin의 `/api/auth/callback`을 승인된 redirect URI로 정확히 등록해야 합니다. Client secret은 브라우저 코드, 저장소, 채팅에 공유하지 않습니다. secret 없이도 health·비로그인 session·공개 ranking·인증 차단 동작은 점검할 수 있습니다.

## 계정·스탯·랭킹 계약

- `GET /api/session`: 현재 로그인 상태, 표시 이름, 본인 스탯만 반환
- `GET /api/auth/google`, `GET /api/auth/callback`: OAuth `state`를 검증하는 Google 로그인
- `POST /api/auth/logout`: 현재 서버 session 폐기
- `GET /api/ranking?criteria=clears`: 전체 누적 클리어 순위
- `GET /api/ranking?criteria=score&gameId=<id>`: 같은 미니게임 안에서만 비교하는 최고 점수 순위
- `POST /api/results`: 로그인한 계정의 미니게임 CLEAR를 시도 ID별 한 번 반영
- `POST /api/stats/allocate`: 미사용 포인트를 공격·HP·방어 중 하나에 배분

브라우저에는 무작위 session token만 `HttpOnly` cookie로 전달하고 D1에는 그 SHA-256 hash와 만료 시각을 저장합니다. 외부 계정 ID나 이메일을 공개하는 users/stats API와 요청 body의 `userId`를 신뢰하는 갱신 API는 제공하지 않습니다.

미니게임마다 점수 단위가 달라 점수 순위는 요청한 `gameId`별로 분리하며, 전체 순위는 누적 클리어만 비교합니다. 미니게임 판정 자체는 현재 브라우저에서 이루어집니다. 인증·허용 목록·점수 범위·시도 ID 멱등성은 다른 계정 변조와 단순 중복 지급을 막지만, 경쟁성 점수 조작까지 완전히 검증하지는 못합니다. 정식 경쟁 랭킹 전에는 서버 challenge 또는 검증 가능한 이벤트 정책이 추가로 필요합니다.

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
| 통합 Worker | `npm run cf:full:dev` | 로컬 SPA + API + D1 |
| 통합 Worker | `npm run cf:full:deploy` | same-origin 운영 후보 배포 |
| 정적 Pages | `npm run cf:dev` | 계정 API 없는 로컬 정적 확인 |
| 정적 Pages | `npm run cf:deploy:production` | 기존 Pages production 배포 |
| 정적 Pages | `npm run cf:deploy:staging` | 기존 Pages preview 배포 |
| 레거시 Static Worker | `npm run cf:dev:worker`, `cf:deploy:worker:*` | `wrangler.worker.jsonc` 보존 경로 |

로그인·서버 저장을 사용할 대표 주소는 통합 Worker 경로여야 합니다. 정적 Pages 또는 레거시 Static Worker만 배포하면 `/api/*`가 없어 로그인·스탯·랭킹이 연결되지 않습니다.

운영 배포 전에는 Cloudflare 계정과 D1 소유권을 팀 운영 계정으로 옮기고 `backend/wrangler.toml`의 database ID를 확인해야 합니다. 그 뒤 명시적으로 다음 작업을 수행합니다.

Cloudflare Worker의 일반 환경 변수 `PUBLIC_ORIGIN`에는 실제 대표 HTTPS origin을 정확히 설정합니다. 예를 들어 대표 주소가 확정된 뒤 `https://<대표-도메인>` 형태로 넣으며 경로는 포함하지 않습니다. 이렇게 하면 `workers.dev`와 custom domain을 오가며 OAuth callback·session host가 갈리는 일을 막을 수 있습니다. Google Console의 redirect URI도 같은 origin의 `/api/auth/callback`이어야 합니다.

```bash
npm run cf:full:check
npm run cf:full:db:migrate:remote
npm --prefix backend exec -- wrangler secret put GOOGLE_CLIENT_ID
npm --prefix backend exec -- wrangler secret put GOOGLE_CLIENT_SECRET
npm run cf:full:deploy
```

`cf:full:db:migrate:remote`, `wrangler secret put`, `cf:full:deploy`는 원격 상태나 Worker version을 바꾸므로 자동 검증 과정에 포함하지 않습니다. 현재 저장소 작업에서는 이 명령들을 실행하지 않았습니다.

## 현재 확인 가능한 흐름

```text
Loading
  ├─ Main Menu → Story Intro → 학과별 Map → 미니게임 → CLEAR / FAIL
  ├─ 내 계정 → Google 로그인 / 스탯 확인·배분
  ├─ 랭킹보드 → 점수 / 클리어 공개 순위
  └─ 캐릭터 시스템 DEV PREVIEW
```

맵의 학과 카드를 선택하면 대화·안내 화면을 거치지 않고 연결된 미니게임을 즉시 실행합니다. 로그인 상태에서 CLEAR하면 session 기준으로 결과를 보내며, 게스트이거나 서버가 연결되지 않아도 로컬 게임 흐름은 계속됩니다. 계정의 `attack`·`hp`·`defense`는 캐릭터 core에 원본 스탯으로 전달하지만 실제 최대 체력·피해·방어 공식은 아직 확정하지 않았습니다.

## 미니게임 모듈

| 학과 코드 | Stable ID | 미니게임 | 상태 |
| --- | --- | --- | --- |
| `DS` | `data-number-baseball` | 숫자 야구 | MVP |
| `CS` | `cyber-click-to-purify` | CLICK to PURIFY | MVP |
| `CSE` | `computer-code-heart` | Code Heart: Unlock! | MVP |
| `AI` | `ai-ball-classification` | AI Ball Classification Game | MVP |
| `AIDS` | `ai-data-egg-sort` | 인지알·데사알 분류 게임 | MVP |

각 기능 브랜치의 색·문구·카드·버튼과 게임 규칙을 유지합니다. 모바일에서는 AI `480×640`, CSE `440×920`, AIDS `390×740` 원본 세로 프레임을 그대로 축소하고, 충분히 넓고 높은 데스크톱에서는 같은 UI 요소를 landscape 작업 공간으로 재배치합니다. AI·CS Canvas는 원본 종횡비를 유지해 늘어나며, AIDS는 필드 폭에 맞춘 발판 길이와 동일한 충돌 범위·수평 물리를 사용합니다. 각 모듈은 `init`, `start`, `pause`, `resume`, `restart`, `destroy`, `getState` 공통 lifecycle을 따릅니다.

## 주요 구조

```text
index.html
css/                  공통·반응형·게임·계정/랭킹 스타일
js/
  core/               입력·저장·asset·account 등 공통 service
  scenes/             화면 단위 orchestration과 계정·랭킹 scene
  minigames/          registry, 공통 계약, 학과별 모듈
  battle/             사후게임 공용 캐릭터 core
data/                 학과·미니게임·대화·map runtime 데이터
assets/               자체 제작 placeholder와 기능 브랜치 asset
backend/
  src/                same-origin Worker API
  migrations/         D1 schema migration
  wrangler.toml       Worker·Static Assets·D1 binding
scripts/              build·validation·smoke·정적 개발 서버
tests/                unit·contract·integration test
docs/                 계획·기획·실행·인증 통합 문서
```

## 개발 원칙

- 표시용 학과명은 `data/departments.json`, 미니게임 연결은 stable ID를 사용합니다.
- 로그인 여부나 API 장애가 게스트 게임 진행을 막지 않게 합니다.
- mutation API는 same-origin JSON 요청과 서버 session을 기준으로 계정을 결정합니다.
- 이메일·provider ID·session token·secret을 화면이나 공개 API에 노출하지 않습니다.
- dialogue, 계정 이름, 랭킹 이름은 HTML 문자열이 아니라 text node로 출력합니다.
- 확정되지 않은 balance 값은 runtime config에 임의로 넣지 않습니다.
- 외부 리소스를 추가하면 `docs/asset-sources.md`도 갱신합니다.

## 문서

- [통합 개발 계획](./docs/AI_CHANGE_PLAN.md)
- [기획안](./docs/기획안.md)
- [사후게임(Battle) 기획안](./docs/사후게임_기획안.md)
- [사후게임 공용 캐릭터 시스템](./docs/after-character-system.md)
- [로그인·스탯·랭킹 통합](./docs/auth-stats-ranking.md)
- [실행 및 조작 방법](./docs/execution-and-controls.md)
- [리소스 출처 목록](./docs/asset-sources.md)
- [Git 브랜치 규칙](./docs/GIT_BRANCH_RULE.md)
- [브랜치 통합 기록](./History.md)

## 아직 구현·검증하지 않은 범위

- 실제 Google Client ID·Secret을 사용한 OAuth callback 종단 간 검증
- staging·production D1 migration, 기존 데이터 이전, 팀 운영 계정으로 소유권 이전
- 대표 custom domain의 same-origin Worker 배포와 운영 회귀 테스트
- 브라우저 결과 조작을 판별하는 서버 권위의 점수 검증
- 일시적인 서버 장애·탭 종료 뒤에도 CLEAR를 복구하는 계정별 안전한 재시도 queue
- 최종 게임명·로고·세계관·아트·사운드
- 정식 자유 이동 필드 map과 최종 캐릭터 sprite 연결
- 5개 미니게임의 최종 balance·점수 정책
- 실제 Battle 보스·피해 공식·부활 규칙
- 멀티플레이
