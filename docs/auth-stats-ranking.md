# 로그인·스탯 DB·랭킹·사후게임 실시간 서버 통합

## 축제 결말과 소원 게시판 (코드 반영, 운영 배포 전)

이아이 최종전 클리어 후 `story-ending`에서 회복 대화 → 꽃잎 자물쇠 연출 → 엠브리오 등장 → 소원 저장 → 마지막 독백을 진행한다. 마지막 `축제 즐기러 가기` 버튼에서만 `festival-open`을 로컬·계정 이야기 진행에 저장하고 메인 화면으로 돌아간다. 사후게임 메뉴와 직접 진입은 이 진행 기록이 있어야 열린다. 기존 다섯 미니게임·수호알 조건도 유지한다.

`0012_wish_board.sql`은 소원 게시판을 추가한다. `GET /api/wishes`는 공개 소원과 닉네임만 반환하며, `POST /api/wishes`는 같은 출처의 300자 이내 소원과 UUID 재시도 키만 받는다. 게스트도 참여할 수 있고 닉네임이 없는 사용자는 `꿈꾸는 이화인`으로 표시한다. 계정·이메일·접속 주소·시간·내부 제한 키는 게시판에 표시하지 않는다. 로그인 계정은 10초당 새 소원 1개, 게스트는 접속 주소별 10초당 20개로 제한해 캠퍼스 Wi-Fi를 함께 쓰는 여러 참가자가 서로 막히지 않게 한다. 동일 소원의 재시도는 중복 저장하지 않는다. 운영 반영에는 migration 후 통합 Worker 배포가 필요하다. 이번 요청에서는 배포를 중단했다.

## 캐릭터 머리색 선택 (코드 반영, 운영 배포 전)

`0011_player_hair_color.sql`은 기존 계정을 보존하며 nullable `users.hair_color`를 추가한다. 운영에서는 이 migration을 먼저 적용한 뒤 Worker와 정적 파일을 함께 배포한다. 로그인한 계정은 계정 화면에서 자주색·보라색·갈색·금발 중 선택할 수 있고, 선택 기록이 없는 계정은 사후게임 최초 입장 때 선택창을 본다. 기본 선택은 보라색이다.

`PATCH /api/player-appearance`는 동일 출처·로그인 세션을 확인하고 `hairColor` 하나만 받는다. WebSocket의 머리색은 서버가 저장된 계정에서 주입하며 공개 위치 정보에는 머리색과 닉네임만 추가한다. 사후게임 필드와 보스전은 선택한 캐릭터 및 머리 위 닉네임을 사용한다. 사전게임 맵과 최종 스토리 전투는 보라색으로 고정한다. 고정 스탯을 사용하는 사후게임도 캐릭터 선택은 적용한다.

## 사후게임 입장 직후 오류 점검

- 위치 갱신 간격 수정(2026-09-30, 코드 반영): 클라이언트는 기본 90ms 간격을 실제 전송 직전에 재검사하며, 즉시 전송할 때 이전 예약을 취소한다. 취소된 타이머 콜백은 재접속 이후에도 전송하지 못한다.
- 서버는 40ms 안에 몰린 이동도 최신 좌표로 저장하지만 중복 방송만 생략한다. 정지·이동 상태 변경과 구역 전환은 즉시 방송하며, 연결당 초당 30개 메시지 제한은 유지한다. 이전 서버의 `presence_rate_limited`는 비치명적 위치 제한이므로 화면 오류로 올리지 않고, 방·인증 등 다른 오류는 보존한다. 이 항목은 운영 배포 완료를 의미하지 않는다.
- 로그인 세션 확인과 WebSocket 접속은 별개 단계다. 맵이 `잠시 멈췄어요` 화면으로 전환되면 HTTP 실패뿐 아니라 클라이언트 전역 오류 로그도 확인한다.
- `PostgameRealtimeService`가 저장하는 `setTimeout` / `clearTimeout`은 `globalThis`에 바인딩한다. 서비스 인스턴스를 호출 대상으로 넘기면 브라우저의 `Illegal invocation`으로 위치 전송·재연결·퇴장 정리가 중단될 수 있다.
- 회귀 테스트는 브라우저 호출 대상 검사를 모사하는 타이머와 실제 실시간 서비스를 함께 사용해 로그인 상태의 맵 입장, 연속 이동, 연결 끊김, 화면 종료를 검증한다. Node 기본 타이머만으로는 이 문제를 발견하지 못한다.

> 원본 기여: GitHub PR #12 `feat: add authorize, login, ranking board functionality`
>
> 통합 브랜치: `integration/after-auth-stats-ranking`
>
> 문서 상태: 2026-09-28 운영 배포 기준. 통합 Worker의 Google OAuth·D1 API에 로그인 사용자용 사후게임 WebSocket과 SQLite-backed Durable Object coordinator를 추가했다. 스탯 보스의 D1 기반 개인별 복리 공격과 소수점 이하 6자리 전투 HP 동기화, 사후게임 클리어만 지급하는 성장 보상 정책을 반영했다. 사전게임은 완료·스토리·수호알만 저장하고 경험치를 지급하지 않는다. 운영 D1에는 `0001`~`0010`이 적용되어 있으며, 아래 생성 절차는 신규 환경에만 사용한다.

## 1. 원본 PR에서 가져오는 기능

PR #12는 다음 기반을 제공했다.

- Cloudflare Worker와 D1을 이용한 Google 로그인 서버 초안
- 이용자와 `attack`·`hp`·`defense`·`clears`·`score`를 보관하는 D1 schema
- 점수 또는 클리어 횟수 기준 랭킹 조회
- 로그인·스탯 표시·랭킹보드 UI 초안

이 기여는 merge 이력에 남기되, 현재 SPA와 보안 경계에 맞춰 다시 연결한다. 원본의 독립 `public/login.html`, `public/rankingBoard.html`을 별도 서비스로 운영하지 않고 기존 scene·service 구조로 이식하는 것이 통합 기준이다.

## 2. 원본을 그대로 배포하지 않는 이유

| 확인 항목 | 원본 상태의 영향 | 통합 기준 |
| --- | --- | --- |
| 스탯 갱신 | 요청 body의 `userId`를 신뢰해 로그인하지 않은 이용자가 다른 계정 값을 바꿀 수 있음 | 서버 session에서 계정을 결정하고 요청 body의 계정 ID는 받지 않음 |
| 개인정보 조회 | 전체 이용자 목록과 개별 조회에서 내부 ID·email이 공개됨 | 공개 API에서는 표시 이름과 랭킹 값만 반환하고 email·provider ID는 반환하지 않음 |
| OAuth `state` | 로그인 시작과 callback을 묶는 값이 없어 login CSRF 방어가 없음 | 일회용 `state`를 cookie와 callback에서 비교하고 사용 직후 폐기 |
| 로그인 cookie | 서명되지 않은 원본 `userId` cookie이며 보호 API의 인증 근거로 사용되지 않음 | 충분히 긴 무작위 session token을 발급하고 D1에는 token hash만 저장 |
| CORS | 모든 origin을 허용해 인증·변경 API의 경계가 불명확함 | 정적 앱과 API를 같은 origin에서 제공하고 변경 요청의 origin을 검사 |
| 클라이언트 주소 | UI가 `http://localhost:8787`을 고정 사용해 운영 주소에서 API 연결이 끊김 | 상대 경로 `/api/...`만 사용 |
| SPA·build | 독립 `public/` 화면이 현재 root build 산출물에 포함되지 않음 | 기존 app router, scene, CSS, `dist/` build에 포함 |

서버 오류 응답에는 Google token 응답이나 내부 예외의 상세 내용을 그대로 싣지 않는다. 화면에 서버 값을 표시할 때도 `innerHTML` 문자열 조합 대신 text node 또는 `textContent`를 사용한다.

## 3. 최종 배치 구조

하나의 Cloudflare Worker가 정적 SPA, HTTP API와 WebSocket endpoint를 같은 origin으로 제공한다.

```text
브라우저 · https://ai-change.ai-change-backend.workers.dev
  ├─ /api/*  ───────────────→ Cloudflare Worker
  │                            ├─ Google OAuth·session·ranking
  │                            ├─ D1: users, stats(level·experience 포함), sessions, game_results, story_progress, postgame_results
  │                            └─ /api/postgame/socket
  │                                  └─ 단일 PostgameCoordinator Durable Object
  │                                     ├─ entry-field·plaza presence
  │                                     ├─ 공개 보스방 directory
  │                                     └─ 방별 공유 보스 HP·상태·파티 HP·참가자별 스탯 보스 피해·revision
  └─ 그 외 경로 ─────────────→ Worker Static Assets의 dist/
```

- Worker는 `/api/*`에서 정적 asset보다 먼저 실행한다.
- 브라우저는 host를 하드코딩하지 않고 `/api/...` 상대 경로만 호출한다.
- 운영 환경의 `PUBLIC_ORIGIN`은 canonical origin인 `https://ai-change.ai-change-backend.workers.dev`로 설정한다. 다른 host로 직접 접근한 API 요청은 거부한다.
- 인증 cookie는 일반 브라우저용 `HttpOnly`, 운영 환경 `Secure`, `SameSite=Lax`, `Path=/` cookie를 기본으로 발급한다. HTTPS에서는 앱이 상위 브라우저의 별도 사이트 문맥으로 실행되는 경우를 보완하도록 이름이 다른 `SameSite=None; Secure; HttpOnly; Path=/; Partitioned` 보조 cookie도 같은 token으로 함께 발급한다. 서버는 기본 cookie를 먼저 검사하고, 없거나 만료됐으면 분할 cookie를 검사한다.
- D1에는 원본 session token이 아닌 SHA-256 hash와 만료 시각을 저장한다.
- 위치와 방 상태처럼 자주 변하는 데이터는 D1에 쓰지 않는다. WebSocket 연결별 상태는 Hibernation attachment, 공개 방 목록과 방별 공유 보스 상태는 Durable Object storage가 담당한다.
- API 없는 기존 `https://ai-change.pages.dev` 프로젝트와 과거 고정 배포는 폐기했으며 공개 주소는 canonical Worker 하나만 사용한다.

운영 게임과 로그인에 사용하는 주소는 아래 하나다.

```text
https://ai-change.ai-change-backend.workers.dev
```

2026-09-10에 `/api/session` 대신 SPA HTML을 반환하던 과거 정적 고정 배포 6개와 Pages 프로젝트 전체를 삭제했다. Pages·레거시 Static Worker의 외부 배포 명령도 제거해 API 없는 공개 앱이 다시 생성되지 않도록 했다.

브라우저 저장소도 origin별로 분리된다. 과거 고정 Pages 주소에서 이미 만든 로컬 진행은 canonical 주소가 자동으로 읽을 수 없다. 배포 링크는 canonical 주소만 안내하며, 과거 주소에 남은 진행을 살려야 할 때는 별도 내보내기·가져오기 절차가 필요하다.

Google callback이 성공한 직후에는 세션 cookie 반영이나 일시적 네트워크 지연을 견디도록 `/api/player-account`를 즉시 확인한 뒤 300ms, 1.2초 간격으로 빠르게 다시 확인한다. 각 요청에는 4초 제한 시간을 적용한다. 빠른 확인이 모두 실패해도 계정 화면에서 기본 8초 제한으로 즉시 재확인하고 1초, 3초 간격의 callback 복구를 이어 간다. 이후에도 네트워크 요청 자체가 실패한 동안에는 계정 화면이 열린 상태에서 3초, 10초, 최대 30초 간격으로 자동 재확인하며, 브라우저의 `online` 복귀나 탭 재활성화 시 즉시 다시 확인한다. `연결 다시 확인` 버튼으로 언제든 수동 재요청할 수도 있다. `/api/me`를 요청 단계에서 차단하는 브라우저 확장·보안 필터와 충돌하지 않도록 player 전용 경로를 기본으로 사용하며, 기존 `/api/me`와 `/api/session`은 호환 별칭으로 유지한다.

앱이 제3자 문맥에서 실행되어 `SameSite=Lax` cookie가 후속 `fetch`에 실리지 않는 경우를 위해 OAuth state와 로그인 session에 각각 별도 분할 cookie를 함께 사용한다. 기본 cookie와 분할 cookie의 값은 같지만 이름은 다르며, callback은 둘 중 어느 state와 일치해도 통과한다. session 조회는 기본 cookie가 오래되었거나 D1에서 찾히지 않을 때 분할 cookie까지 확인하고, 로그아웃은 둘에 해당하는 D1 session을 모두 삭제한 뒤 두 cookie를 함께 만료한다. 분할 cookie는 상위 사이트별로 격리되므로 다른 사이트의 내장 브라우저와 로그인 상태를 공유하지 않는다. 또한 외부 Chrome에서 완료한 로그인이 기존 VS Code 탭으로 이동하는 것은 아니므로 로그인한 브라우저 탭에서 게임을 계속해야 한다. 이를 우회하려고 인증 API에 wildcard CORS를 허용하지 않으며 변경 API의 정확한 `Origin` 검사도 유지한다. 배포 응답은 `frame-ancestors 'none'`과 `X-Frame-Options: DENY`를 유지하므로 일반 iframe 임베딩을 허용하는 변경은 아니다.

로컬 API 개발 주소는 백엔드 `PUBLIC_ORIGIN`과 일치하는 Wrangler 주소 `http://127.0.0.1:8787`만 같은 계정 서버로 판정한다. `http://localhost:8787`, `http://[::1]:8787`, Live Server에서 흔히 쓰는 `4173`, `5500` 등의 주소는 origin이 다르거나 API가 없으므로 로그인 버튼이 canonical 운영 주소로 이동한다.

## 4. API 계약

### 공개·로그인 흐름

| Method | 경로 | 계약 |
| --- | --- | --- |
| `GET` | `/api/health` | 서버 상태 확인. 개인정보를 포함하지 않음 |
| `GET` | `/api/ranking?criteria=boss-clears&bossId=stat-boss` | 스탯 보스 파티별 누적 클리어 순위 |
| `GET` | `/api/ranking?criteria=boss-speed&bossId=control-boss` | 컨트롤 보스 파티별 최단 클리어 순위 |
| `GET` | `/api/auth/google` | 일회용 OAuth `state`를 만들고 Google로 이동 |
| `GET` | `/api/auth/callback` | `state` 검증, Google code 교환, 계정 upsert, session 발급 후 SPA로 이동 |

`/api/users`, `/api/stats/:userId`처럼 내부 ID나 email을 공개하는 경로는 통합 계약에 포함하지 않는다.

> 테스트·배포 전 개인정보 고지: Google 로그인은 계정 ID·이메일·표시 이름을 D1에 저장한다. 사용자가 설정한 닉네임이 있으면 닉네임과 게임 기록을 공개 랭킹·사후게임에 표시하며, 닉네임이 없을 때만 Google 표시 이름을 대신 사용한다. 이메일과 외부 계정 ID는 공개 응답에 포함하지 않는다. 참가자에게 수집 항목, 공개 범위, 보관·삭제 담당자를 로그인 전에 안내하고 동의한 계정만 사용한다.

### session이 필요한 경로

| Method | 경로 | 계약 |
| --- | --- | --- |
| `GET` | `/api/player-account` | 로그인 여부와 본인의 공개 표시 이름·설정 닉네임·스탯(`level`, `experience`, `nextLevelExperience` 포함), 서로 다른 완료 게임 ID 목록 `completedGameIds` 반환 |
| `PATCH` | `/api/player-account` | 본인 닉네임을 저장하고 갱신된 계정 payload 반환 |
| `GET`/`PATCH` | `/api/me` | `/api/player-account`의 기존 호환 별칭 |
| `GET` | `/api/session` | 계정 조회의 기존 호환 별칭 |
| `POST` | `/api/auth/logout` | 현재 session을 폐기하고 cookie를 만료 |
| `POST` | `/api/progress/import` | 현재 브라우저의 서로 다른 로컬 완료 게임을 본인 계정 진행에 한 번씩 병합 |
| `POST` | `/api/story-progress` | 현재 브라우저에서 이미 본 스토리 ID를 본인 계정에 멱등 병합 |
| `POST` | `/api/results` | 본인의 사전게임 CLEAR를 attempt 단위로 한 번만 완료 기록에 반영. 성장 보상 없음 |
| `POST` | `/api/postgame/results` | 본인의 `xr-egg-trials` CLEAR를 attempt 단위로 멱등 반영하고 사후게임 성장 보상 지급 |
| `POST` | `/api/stats/allocate` | 남은 스탯 포인트 1개를 `attack`·`hp`·`defense` 중 하나에 배분 |
| `GET` | `/api/postgame/socket` | same-origin `Origin`과 로그인 session을 확인한 뒤 WebSocket으로 upgrade |

닉네임 변경 body는 `{ "nickname": "이화AI" }` 한 필드만 허용한다. 서버는 NFKC Unicode 정규화, 앞뒤 공백 제거와 연속 공백 축약 뒤 2~16 Unicode code point인지 확인하고 제어·format 문자를 거부한다. 한글을 포함한 Unicode는 사용할 수 있고 서로 다른 계정이 같은 닉네임을 쓰는 것은 허용한다. 빈 값으로 지우는 동작은 제공하지 않으며, Google 재로그인으로도 이미 설정한 닉네임을 덮어쓰지 않는다. 성공 응답의 `user.name`은 닉네임 우선 실제 표시명, `user.nickname`은 저장한 닉네임이다.

### 사후게임 WebSocket 계약

클라이언트는 host를 고정하지 않고 상대 경로 `/api/postgame/socket`을 현재 페이지와 같은 origin의 `ws:` 또는 `wss:` URL로 바꿔 연결한다. 게스트, 다른 origin, WebSocket upgrade가 아닌 요청은 coordinator에 전달하지 않는다.

현재 단일 `PostgameCoordinator`가 다음 상태를 조정한다.

- `entry-field`·`plaza`의 로그인 사용자 presence. 공개 payload에는 임시 플레이어 ID, 표시 이름, 구역, 정규화 좌표, 방향·이동 여부만 포함한다.
- `data-sphinx`·`stat-boss`·`control-boss`별 공개 방 목록. 생성자는 공개 방 이름과 최소 1명·최대 5명의 정원을 정한다.
- 각 보스의 UI는 자기 `battleId` 방만 표시하며 `방 목록 → 방 만들기 → 참가자 대기실`로 분리한다. 목록 카드에는 입장 가능 여부·방장·인원수를, 대기실에는 정원별 참가자 슬롯과 방장·본인 표시를 노출한다.
- 방 이름은 NFKC 정규화와 제어 문자·연속 공백 제거 후 Unicode code point 기준 1~32자만 허용한다. 기존 저장 방에 이름이 없거나 유효하지 않으면 `보스 대기실`로 복구한다.
- 방 생성·참가·이탈·시작. 정원은 참가 상한이며 최소 시작 인원은 1명이다. 정원이 차도 자동 시작하지 않고 방장만 원하는 시점에 시작할 수 있으며, 방장 이탈 시 남은 첫 참가자에게 위임한다.
- session 계정에서 파생한 내부 키로 같은 계정의 여러 탭이 방 좌석을 중복 점유하지 못하게 차단한다. 이 내부 키는 공개 payload로 보내지 않는다.
- 방 시작 시 모든 참가자에게 공통 `battleId`, `roomId`, `seed`, `startedAt`, `roster`를 보내고 시작된 방을 공개 목록에서 제거한다.
- 시작한 방마다 Durable Object가 `bossHp`·`bossMaxHp`·`status`·`revision`과 공통 승리를 소유한다. 참가자의 hit 보고는 보스별 허용 종류, 서버 결정 피해량, cooldown, action ID 중복 제거를 통과해야 같은 보스 HP에 반영된다. 데이터 스핑크스·컨트롤 보스는 보스별 고정 피해를 사용하고, 스탯 보스는 Worker가 로그인 계정의 D1 `attack`으로 계산해 방 시작 시 참가자 상태에 고정한 피해를 사용한다. 공유 보스 HP가 0이 되면 DO가 로그인한 모든 파티원의 승리와 성장 보상을 room ID 기준으로 한 번만 확정한다.
- 각 클라이언트가 전투 module 로딩을 마치고 준비를 보낸 뒤, 현재 연결된 생존 파티원 전원이 준비되어야 hit를 허용한다. 최단 기록의 서버 시간은 방 생성이나 방장 시작 시각이 아니라 이 준비 장벽이 처음 열린 순간부터 보스 처치까지다.
- Worker는 D1 스탯으로 계정 전투 최대 HP와 스탯 보스 반격 피해를 계산해 내부 전용 헤더로 coordinator에 넘긴다. 반격 피해는 `round6(10 × 1.05^attack)`이며, 브라우저가 피해량을 body나 WebSocket message로 지정하지 않는다. coordinator는 방 시작 시 보스별 규칙과 이 값을 이용해 참가자의 `hp`·`maxHp`·`statBossAttackDamage`를 초기화한다. 클라이언트의 `battle.health`는 소수점 이하 6자리로 정규화한 현재 HP 감소만 보고할 수 있고 최대 HP 변경·회복은 거부된다. roster에는 `hp`, `maxHp`, `alive`를 공개하며 HP 0은 전투 불능으로 고정해 같은 전투 중 부활과 추가 hit를 막는다.
- 진행 중 전투를 복구한 연결은 자동으로 전투 화면에 들어가지 않는다. 맵의 선택창에서 `이어하기`를 누를 때만 다시 ready 상태가 되고, `전투 나가기`는 서버 저장과 ACK가 끝날 때까지 선택창을 유지한다.
- 연결을 복구한 방 참가자에게 진행 중인 최신 battle snapshot을 다시 보내 같은 서버 상태에서 이어 간다.
- 실행 중인 방에서 전원이 끊기면 15분간 재접속을 허용하고, 종료된 방은 5분 뒤 Durable Object alarm으로 정리한다.

Durable Object는 Cloudflare Hibernation API의 WebSocket attachment로 연결별 상태를 복구하고, room directory와 공유 battle state는 Durable Object storage에 저장한다. D1은 계정·스탯·session·사전게임 `game_results`·사후게임 보상 ledger `postgame_results`·서버가 확정한 `boss_runs`·`boss_run_members`의 장기 저장소이며, 프레임 단위 위치나 진행 중 방 membership 저장소로 사용하지 않는다. 보스 기록과 보상은 DO가 room ID별로 한 번만 저장하고 브라우저가 팀 이름·시간·roster나 보스 승리를 일반 결과 API로 제출할 수 없다.

동기화 경계는 공유 보스 HP·공통 승리, D1 기반 스탯 보스 반격 피해와 파티원의 요약 HP/전투 불능 상태까지다. 전투 피해·보스 HP·현재 HP는 `round6`, 즉 소수점 이하 6자리 반올림으로 정규화한다. 세 보스의 플레이어 이동·회피, 피격 판정, 보스 기믹·phase는 각 클라이언트가 로컬로 계산하고 그 결과 HP만 서버에 보고하므로 완전한 서버 물리 시뮬레이션은 제공하지 않는다. 정상 온라인 Battle은 로그인과 실시간 방 참가가 필수이며 WebSocket이 없거나 끊기면 솔로 전투로 우회하지 않는다.

2026-09-21 운영 점검을 위해 `data/app-config.json`의 `features.guestBattleTesting`을 임시로 활성화했다. 이 플래그의 게스트는 인증 WebSocket이나 Durable Object에 연결하지 않으며, 브라우저 안의 로컬 테스트 대기실에서 방을 명시적으로 만든 뒤 1인 보스를 시작한다. 다른 사용자·서버 방·공유 HP·재접속은 제공하지 않고 계정 결과도 저장하지 않는다. 따라서 Worker의 `/api/postgame/socket` session 검증과 온라인 방 권한은 완화되지 않는다. 점검이 끝나면 이 플래그만 `false`로 바꿔 기존 로그인 필수 흐름을 복구한다.

사전게임 결과 등록 요청 예시는 다음과 같다. `userId`, email 또는 스탯 증가량은 클라이언트가 보내지 않는다.

```json
{
  "attemptId": "host가 발급한 시도 ID",
  "gameId": "computer-code-heart",
  "status": "CLEAR",
  "score": 400
}
```

서버는 session에서 이용자를 찾고, 등록된 5개 사전게임 ID·`CLEAR` 상태·허용 범위의 정수 점수만 받는다. 같은 계정의 같은 `attemptId`는 `game_results`의 unique 제약으로 한 번만 처리한다. 이 경로는 완료·스토리·수호알·해금 상태를 계정에 연결하기 위한 기록만 추가한다. `stats.clears`, 경험치, 레벨, 미사용 스탯 포인트는 변경하지 않으며 응답의 `awarded`는 `false`다.

공개 랭킹은 `stat-boss`와 `control-boss`만 제공한다. DO는 서버가 판정한 보스 HP 0 승리 시 내부 계정 ID로 참가자 구성을 정규화해 안정적인 `party_key`를 만들고, `room_id UNIQUE` 및 `INSERT OR IGNORE`로 같은 전투를 한 번만 기록한다. 누적 순위는 같은 참가자 구성의 승리 횟수를 내림차순으로, 최단 순위는 같은 구성의 최고 기록을 오름차순으로 비교한다. 2명 이상이면 방 이름을 팀 이름으로, 하단에 당시 닉네임 snapshot을 표시하며 1명은 닉네임을 대표 이름으로 표시한다. 이메일·외부 계정 ID·party key·room ID는 공개 응답에 포함하지 않는다.

영구 성장 보상은 다음 두 경로만 허용한다.

- 로그인 사용자가 필드 X알 `xr-egg-trials`을 `CLEAR`하고 `/api/postgame/results`에 고유 `attemptId`를 제출한 경우
- Durable Object가 `data-sphinx`, `stat-boss`, `control-boss`의 공유 보스 HP 0과 파티 승리를 서버에서 확정한 경우

위 클리어 1회당 경험치 20과 `stats.clears` 1을 지급한다. 누적 경험치가 100 단위 경계를 넘을 때만 레벨 1과 `unspent_points` 1을 지급하므로, 클리어 5회당 스탯 포인트 1을 얻는다. 레벨은 1에서 시작하고 제품 상한은 없으며, `nextLevelExperience = level × 100`으로 다음 누적 경험치 기준을 반환한다. Worker와 Durable Object는 `backend/src/progression.ts`의 같은 보상 규칙을 사용한다. `postgame_results` 저장 행의 `awarded` 상태와 `(user_id, attempt_id)` unique 제약으로 재전송·중복 callback을 멱등 처리한다. 사전게임 5종, 실패, QR, 다른 필드 이벤트, Story 최종전 `word-breaker`는 이 보상을 만들지 않는다. 정책 변경 전에 이미 저장된 기존 계정 스탯은 차감·재계산하지 않고 그대로 보존한다.

`completedGameIds`는 해당 계정의 `game_results`에서 완료한 서로 다른 `game_id`를 조회한 값이다. 클라이언트는 이를 로컬 완료 ID와 합쳐 published 사후 콘텐츠의 공통 해금을 판단하며, 반복 CLEAR로 증가한 `clears` 합계만으로는 해금하지 않는다.

게스트로 플레이한 뒤 로그인하면 클라이언트는 로컬에서 `completed === true`인 게임 중 계정에 아직 없는 ID만 다음처럼 전송한다.

```json
{
  "completedGameIds": ["data-number-baseball", "computer-code-heart"]
}
```

서버는 session·동일 origin·JSON content type을 확인하고 등록된 5개 ID만 받는다. 이미 같은 게임의 CLEAR가 있으면 건너뛰며, 새 게임만 예약된 `guest-import-v1:` attempt로 0점 기록한다. 이 예약 attempt는 일반 `/api/results`에서 사용할 수 없다. 응답은 실제 `importedGameIds`, 계정 전체 `completedGameIds`, 변경하지 않은 최신 `stats`를 반환한다. import도 사전게임 완료 기록만 병합하며 레벨·경험치·포인트를 지급하지 않는다. 사전게임 행은 공개 보스 랭킹과 사후게임 보상 ledger에서 완전히 분리된다.

처음 한 번만 자동 재생하는 이야기 진행은 `story_progress(user_id, story_id, seen_at)`에 별도로 보관한다. 브라우저는 로컬에서 본 ID를 `/api/story-progress`에 보내고 서버는 session 계정으로만 `INSERT OR IGNORE`한다. 허용 ID는 메인 인트로, 학과별 NPC 5개, 최종전 최초 해금 안내로 제한한다. 이야기 열람·재열람과 게임 완료·사후게임 성장·랭킹은 서로 다른 기록이므로 이야기를 다시 보는 동작은 보상을 만들지 않는다. 로그인 전 열람 기록은 로그인 직후 계정 기록과 합쳐지며, 같은 계정으로 다른 기기에서 접속해도 이미 본 이야기는 자동 재생하지 않고 명시적인 `스토리 다시 보기` 버튼으로만 연다.

자동 병합 범위는 완료한 서로 다른 사전게임 ID뿐이다. 실패, 재생 횟수, 원점수, 최고 지표, NPC·맵 위치, 설정은 계정으로 보내지 않는다. 정상 CLEAR 전송이 일시적으로 실패했더라도 다음 앱 시작이나 계정 화면에서 완료 여부는 복구할 수 있지만, 당시 원점수는 복구하지 않고 0점으로 남긴다. 사전게임 병합은 어떤 포인트나 경험치도 복구·지급하지 않는다. 서버와 클라이언트 양쪽에서 중복 요청을 막으며, 로그아웃 뒤 늦게 온 응답은 화면의 guest 상태를 되돌리지 않는다.

스탯 배분 요청은 다음처럼 선택할 항목만 보낸다.

```json
{
  "stat": "attack"
}
```

D1 transaction 안에서 `unspent_points > 0`을 확인하고 포인트 감소와 선택 스탯 증가를 함께 처리한다. 기존처럼 임의의 `newScore`, `userId`, 증가량을 받지 않는다.

현재 스탯 보스의 계정 스탯 규칙은 다음과 같다.

```text
기본 HP = 100
최대 HP = 100 + 체력 투자 포인트 × 100
반격 피해 = round6(10 × 1.05 ^ 공격 투자 포인트)
받는 피해 = round6(보스 공격 피해 × (1 - min(방어 투자 포인트 × 0.02, 0.5)))
반격 가능 시간 = 경직 시작 후 1,000ms
```

D1의 `attack`·`defense`는 0부터 시작하는 투자 포인트이고 `hp`는 신규 계정에서 100으로 시작하는 실제 최대 체력값이다. HP에 포인트를 배분하면 D1 값도 `100 → 200 → 300`처럼 100씩 증가한다. 공격은 포인트마다 현재값의 5%가 다시 붙는 복리이며, 방어 감소율은 25포인트에서 50% 상한에 도달한다. 온라인 스탯 보스는 로그인 직후 Worker가 D1 값을 읽어 피해량을 계산하고 coordinator에 신뢰된 내부 헤더로 전달하므로, 클라이언트가 스탯 또는 피해량을 바꿔 보내도 공유 보스 HP에는 반영되지 않는다.

## 5. 브라우저 게임 결과의 신뢰 한계

인증, 허용값 검사, attempt 멱등성은 다른 계정 갱신과 단순 재전송을 막지만, 정적 JavaScript에서 만들어진 사전게임과 X알 CLEAR가 실제 플레이로 발생했는지까지 서버가 증명하지는 못한다. 이용자가 브라우저 요청을 직접 만들 수 있으므로 이 구조를 완전한 부정행위 방지 시스템으로 설명하면 안 된다. 보스 보상은 브라우저 결과 제출이 아니라 Durable Object의 공유 HP 0 판정으로만 생성하여 더 강한 경계를 둔다.

현재 범위에서는 다음 방어만 적용한다.

- 로그인 session과 본인 계정만 연결
- 사전게임은 공개된 5개 `gameId`, `CLEAR`, 제한된 정수 score만 허용하되 성장 보상은 지급하지 않음
- 브라우저가 제출할 수 있는 사후게임 보상 ID를 `xr-egg-trials`로만 제한하고, 보스 ID는 거부
- `postgame_results` ledger로 동일 attempt·방 보상의 중복 지급 방지
- 로컬 사전게임 진행 import는 계정별·게임별 한 번만 완료를 기록하고 경험치·랭킹에서 제외
- 계정 ID·스탯 증가량·클리어 증가량을 body에서 받지 않음

로컬 완료 여부 자체는 이용자가 수정 가능한 `localStorage`에서 온 주장이다. 따라서 자동 병합도 실제 플레이를 서버가 증명하는 기능은 아니다. 또한 공용 브라우저에서는 남아 있는 로컬 진행이 다음 Google 계정에 연결될 수 있으므로, 행사 운영 시 계정 전환 전에 브라우저 진행 초기화 여부를 이용자에게 확인한다.

경쟁성 랭킹의 신뢰 수준을 높여야 할 때는 서버가 발급한 짧은 수명의 challenge, 게임별 검증 가능한 event 요약 또는 서버 권위 판정을 별도 설계해야 한다.

### 2026-09-28 운영 D1 읽기 전용 감사와 후속 migration

운영 Worker의 `DB` binding은 D1 `ai-change`(`942d8f14-dc06-4460-b6c5-dfb0c07eab78`)를 가리킨다. 원격 데이터를 변경하지 않고 migration·무결성·집계만 확인한 결과는 다음과 같다.

| 항목 | 운영 상태 |
| --- | --- |
| 감사 당시 적용 migration | `0001`~`0007` 적용 |
| 행 수 | users 9, stats 9, sessions 23, game_results 0, story_progress 0 |
| session | 활성 23 |
| nickname | 설정 계정 0 |
| 무결성 | `foreign_keys=1`, `foreign_key_check` 이상 0, `quick_check=ok`, orphan 0 |
| DB 크기 | 98,304 bytes |

위 표는 보스 랭킹·사후게임 보상 도입 전의 읽기 전용 snapshot이다. 이후 HP 단위 변환 `0008_hp_stat_unit.sql`, 보스 랭킹 `0009_boss_rankings.sql`, 사후게임 멱등 보상 ledger `0010_postgame_progression.sql`을 운영 D1에 순서대로 적용했다. `0010`은 기존 계정의 레벨·경험치·스탯·포인트를 재계산하거나 차감하지 않고 `postgame_results`만 추가한다. 정책 적용 이후의 유효한 X알·보스 클리어부터 새 ledger와 성장 보상이 채워진다.

공개 응답은 순위·팀 이름·참가자 닉네임 snapshot·누적 클리어 또는 최단 시간만 포함하며 email, Google 계정 식별자, 내부 party key와 room ID를 내보내지 않는다. 닉네임이 없으면 Google 표시 이름을 대신 snapshot하므로 로그인 고지에 이 사실을 포함한다. 공유 보스 HP와 처치 시각은 서버 권위지만 이동·회피·개별 피격은 브라우저 판정이므로 실물 보상과 연결하기 전에는 추가 부정행위 방지 정책이 필요하다.

`0007_story_progress.sql` 적용 전 운영 D1 export를 생성한 뒤 migration을 실행했고, `foreign_key_check` 이상 0건과 `quick_check=ok`를 확인했다. 이어 통합 Worker version `1c578e0d-cb4a-46da-871e-aede0e7c3c00`을 배포했다. 배포 후 `/`, `/api/health`, `/api/player-account`, 두 랭킹 경로가 정상 응답했고 `/api/auth/google`은 정확한 운영 callback 주소와 기본·partitioned OAuth state cookie를 발급하며 Google로 이동했다.

사후게임 보상 정책은 `0010_postgame_progression.sql` 적용 후 Worker version `95e1032a-a121-4299-8b26-ab2dcc344a35`에서 최초로 운영에 반영했다. 배포 직후 `/api/health`, 비로그인 `/api/session`, 최신 정적 번들, `postgame_results` 테이블을 직접 확인했다.

## 6. 캐릭터 스탯 연결 경계

계정 DB의 `attack`, `hp`, `defense`는 계산 전 원본 스탯으로 캐릭터 시스템에 전달한다.

```js
characterSystem.setAccountStats({
  attack: session.stats.attack,
  hp: session.stats.hp,
  defense: session.stats.defense,
});
```

캐릭터 core는 `hp`를 원본 `health` 스탯의 입력 별칭으로 수용한다. 그러나 이 값은 Battle의 `maxHealth` 자체가 아니며, `hp`를 곧바로 현재 체력이나 최대 체력으로 대입하지 않는다. 최대 체력·피해·방어 공식은 Battle 규칙 담당자가 별도로 계산하고, 캐릭터에는 계산된 `maxHealth`와 `applyResolvedDamage()` 값만 전달한다.

## 7. 로컬 D1·Worker 확인 절차

로컬 DB와 운영 DB를 섞지 않도록 `--local`을 명시한다. package script가 마련되기 전에도 동일한 Wrangler 명령으로 확인할 수 있다.

```powershell
# 프로젝트 루트
npm install
npm run build

cd backend
npm install
npx wrangler d1 migrations apply ai-change --local
npx wrangler dev
```

`backend/.dev.vars`에는 변수 이름만 다음과 같이 두고 각 개발자가 자신의 값을 로컬에서 입력한다. 이 파일은 Git 추적 대상이 아니어야 한다.

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
PUBLIC_ORIGIN=http://127.0.0.1:8787
```

실제 값이 없어도 먼저 확인할 수 있는 항목은 health·비로그인 session·공개 ranking·인증 없는 변경 요청의 거부·폐기된 개인정보 API의 404이다. 실제 값이 준비된 뒤에는 OAuth `state` 불일치 거부, callback, cookie 발급, 새로고침 후 session 복구, logout, 사전게임 CLEAR·import 후 스탯 무변경, X알 CLEAR 1회의 보상, 같은 attempt 재전송 무변경, 포인트 배분까지 확인한다.

실시간 기능은 로그인한 브라우저 두 개 이상으로 추가 확인한다.

1. 같은 origin의 `/api/postgame/socket`만 upgrade되고 게스트·다른 `Origin`은 거부되는지 확인한다.
2. 입장 필드와 광장에서 같은 구역 사용자만 보이고 구역 이동·연결 종료가 반영되는지 확인한다.
3. 보스별 방 목록이 분리되고 정원 1·5는 허용, 0·6은 거부되는지 확인한다.
4. 정규화된 1자·32자 방 이름은 목록과 참가 화면에 그대로 보이고, 공백뿐인 이름·33자 이름·제어 문자는 계약에 맞게 거부 또는 제거되는지 확인한다.
5. 방장이 1명부터 수동으로 시작할 수 있고, 정원이 차도 자동 시작하지 않으며, 비방장은 기다리고 방장 이탈 시 권한이 위임되는지 확인한다.
6. 같은 계정의 다른 탭이 방 좌석을 중복 점유하지 못하는지 확인한다.
7. 휴면·재기동 뒤 Hibernation attachment와 Durable Object storage로 연결·방 이름·정원·참가자·공유 battle 상태가 안전하게 정리 또는 복구되는지 확인한다.
8. 시작한 모든 참가자가 같은 `seed`·`startedAt`·`roster`를 받고, 한 참가자의 유효 hit 뒤 모든 참가자가 같은 `bossHp`·`status`·`revision`을 받는지 확인한다. 공격 포인트가 다른 두 계정은 스탯 보스에서 각각 `round6(10 × 1.05^포인트)` 피해를 주어야 한다.
9. 허용되지 않은 hit 종류·cooldown 위반·중복 action ID·클라이언트 임의 피해량이 보스 HP를 추가로 줄이지 않고, 공유 보스 HP와 파티 현재 HP가 소수점 이하 6자리보다 길게 누적되지 않는지 확인한다.
10. 진행 중 재접속한 참가자가 최신 battle snapshot을 복원하는지 확인한다.
11. WebSocket을 차단하거나 끊었을 때 로컬 솔로 전투로 우회하지 않고 연결 복구 안내가 표시되는지 확인한다.
12. 진행 중 전투 재접속 시 자동 입장하지 않고 `이어하기 / 전투 나가기`가 뜨며, 나가기 ACK 전에는 창이 닫히지 않는지 확인한다.
13. 파티원 HP 0이 서버 roster와 왼쪽 HUD에서 회색 전투 불능으로 보이고 추가 공격·자동 부활이 거부되는지 확인한다.
14. `data-sphinx`·`stat-boss`·`control-boss` 승리 시 각 로그인 파티원에게 경험치 20이 정확히 한 번만 지급되고, 경험치 100 단위 경계에서만 레벨·미사용 포인트가 1씩 오르며, 같은 room 복구·재전송이 중복 보상을 만들지 않는지 확인한다.

사전게임 CLEAR 전송은 로컬 진행 저장을 먼저 끝낸 뒤 비동기로 실행한다. 서버 장애나 탭 종료로 전송이 실패하면 로컬 결과는 유지되고, 다음 앱 시작이나 계정 화면의 완료 진행 병합으로 해금·스토리 진행만 복구한다. 사전게임 원점수는 복구하지 않으며 어떤 성장 보상도 발생하지 않는다. X알 보상 요청이 실패했을 때 나중에 자동 재전송하는 영속 outbox는 아직 없다.

운영 DB migration은 staging 백업과 검증을 마친 뒤에만 명시적으로 실행한다.

```powershell
cd backend
npx wrangler d1 migrations apply ai-change --remote
```

Worker 배포 명령은 migration을 자동 실행하지 않는다. schema 변경이 있는 릴리스만 하위 호환성과 백업을 확인한 뒤 별도로 migration을 적용한다. `0003_level_progression.sql`은 당시의 임시 레벨 10 규칙으로 `stats.level`과 `stats.experience`를 추가했던 과거 migration이다. `0004_unbounded_level_progression.sql`은 SQLite 테이블 재구성 방식으로 그 상한 CHECK만 제거하고 모든 스탯 행을 값 그대로 복사하며, `users` 외래 키의 `ON DELETE CASCADE`와 점수·클리어 인덱스도 다시 만든다. 기존 `unspent_points`는 건드리지 않아 포인트가 이중 지급되지 않는다. `0005_user_nickname.sql`은 기존 `users` 행을 재작성하지 않고 nullable `nickname` 컬럼만 추가하므로 기존 계정과 Google 표시 이름을 보존한다. `0006_hp_baseline.sql`은 같은 보존형 재구성으로 HP 기본값·최솟값을 100으로 맞추고, 과거 경로에서 100 미만으로 남은 행만 100으로 올린다. 공격·방어·레벨·경험치·점수·남은 포인트는 그대로 복사한다. `0007_story_progress.sql`은 계정별 이야기 최초 열람만 저장하는 새 테이블을 추가한다. `0008_hp_stat_unit.sql`은 기존 HP `100+n`을 투자 횟수를 보존한 실제 최대 체력 `100+n×100`으로 변환하고, `0009_boss_rankings.sql`은 스탯·컨트롤 보스 랭킹 테이블을 추가한다. `0010_postgame_progression.sql`은 X알·보스 보상을 멱등 기록하는 `postgame_results`를 추가하되 기존 stats 행은 수정하지 않는다. 운영에서는 해당 migration들을 적용한 뒤 Worker를 배포한다.

## 8. Cloudflare secret과 Google OAuth 설정

secret 값은 GitHub, PR, 문서, browser JavaScript, 채팅에 기록하지 않는다. 로컬에서는 `.dev.vars`, Cloudflare에서는 환경별 encrypted secret을 사용한다.

```powershell
cd backend
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

`wrangler secret put`도 새 Worker version을 만들고 배포할 수 있으므로 대상 계정·환경과 현재 build를 먼저 확인한 뒤 실행한다. staging과 production을 분리하면 각 환경에 별도로 등록하고, 운영 계정으로 이전할 때 Google client secret을 새 값으로 교체한다. Client ID는 OAuth 요청에 노출되는 식별자이지만 저장소에 고정하지 않고 환경 설정으로 관리하면 계정 이전과 환경 분리가 쉽다.

Google Cloud Console의 Authorized redirect URI는 실제 callback과 문자 단위로 같아야 한다.

- 로컬 예시: `http://127.0.0.1:8787/api/auth/callback`
- staging: `https://<staging-host>/api/auth/callback`
- production: `https://ai-change.ai-change-backend.workers.dev/api/auth/callback`

스킴, host, port, 경로, trailing slash가 하나라도 다르면 callback이 거부된다. 현재처럼 Worker가 authorization code를 교환하는 서버 redirect 방식에는 Authorized redirect URI가 필요하다. 브라우저 Google JavaScript SDK를 별도로 도입할 때만 Authorized JavaScript origin도 등록한다. 임시 프리뷰 URL은 callback 목록에 무제한 추가하지 않는다.

이 서버 redirect 방식의 OAuth client 유형은 Android가 아니라 **Web application**이어야 한다. OAuth 동의 화면이 Testing 상태라면 사용할 Google 이메일을 Test users에 추가하거나 게시 상태를 확인한다. 현재 운영 Worker에는 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` secret이 이미 등록되어 있으므로 값이 없는 경우가 아니라면 다시 넣지 않는다.

### 신규 Cloudflare 환경에서만 D1을 만드는 순서

현재 운영 계정에는 D1 `ai-change`가 있으므로 새 DB를 만들지 않는다. 배포 대상에 아직 적용되지 않은 D1 migration만 백업·staging 검증 뒤 적용한다. 별도 staging이나 새 계정으로 처음 이전할 때만 다음 순서를 사용한다.

```powershell
cd backend
npx wrangler whoami
npx wrangler d1 create ai-change-staging
# 출력된 database_id를 해당 환경의 wrangler 설정에 반영
npx wrangler d1 migrations apply ai-change-staging --remote --config wrangler.toml
```

위 명령은 staging D1과 schema만 만들며 staging Worker 연결까지 만들지는 않는다. 먼저 `backend/wrangler.toml`에 `[env.staging]`과 별도 D1 binding을 정의하거나 별도 staging config를 만들고, 그 환경을 명시해 secret·`PUBLIC_ORIGIN`·deploy를 실행한다. 운영 DB와 staging DB는 같은 이름·ID를 재사용하지 않는다.

Durable Object는 D1과 별도다. 새 환경의 Wrangler 설정에는 `POSTGAME` binding과 `PostgameCoordinator` class, SQLite-backed class를 만드는 `new_sqlite_classes` migration tag가 모두 있어야 한다. 이 migration은 `wrangler d1 migrations apply` 대상이 아니라 Worker 배포 시 Cloudflare가 적용하는 Durable Object class migration이다. 하나의 전역 이름(`festival-v1`)으로 coordinator instance를 조회하므로 임의로 여러 shard 이름을 만들지 않는다.

## 9. staging·production 재배포 체크리스트

운영 계정의 Worker·D1·Google OAuth 연결은 완료된 상태다. 사후게임 실시간 기능은 `POSTGAME` binding과 Durable Object class migration까지 배포되어야 동작한다. 아래 항목은 환경 이전이나 재배포 때 다시 확인하며, 체크 결과와 개인정보 고지 담당자를 배포 기록에 남긴다.

통합 운영 배포는 프로젝트 루트의 `npm run cf:deploy:production`만 사용한다. 이 명령은 검사와 build 뒤 `backend/wrangler.toml`의 ASSETS·D1·OAuth·Durable Object 통합 Worker를 배포한다. API 없는 레거시 정적 Pages·`wrangler.worker.jsonc` 명령을 운영 로그인 배포에 사용하지 않는다.

- [ ] `wrangler whoami`로 배포 대상이 개인 테스트 계정이 아닌 운영 Cloudflare 계정인지 확인
- [ ] 배포 대상의 D1 binding이 운영 DB 이름·ID를 가리키는지 확인하고 staging을 사용할 때는 별도 DB로 분리
- [ ] `POSTGAME` binding, `PostgameCoordinator` export와 SQLite-backed Durable Object migration tag가 같은 환경에 연결되는지 확인
- [ ] 기존 개인 D1의 users·stats를 백업하고, Google `sub`와 스탯 값이 보존되도록 이전 rehearsal 수행
- [ ] staging에서 migration, health, session, ranking, 사후게임 보상 멱등성, 포인트 원자적 배분을 먼저 검증
- [ ] 게스트 사전게임 완료 1~2개 후 로그인해 `/api/progress/import`가 한 번만 호출되고, 완료 ID는 병합되되 경험치·레벨·포인트는 전혀 변하지 않는지 확인
- [ ] 사전게임 `game_results`와 import 기록이 보스 랭킹 응답에 절대 포함되지 않는지 확인
- [ ] X알 CLEAR와 세 보스 서버 승리만 20 XP를 지급하고 클리어 5회당 레벨 1·포인트 1을 얻으며, 실패·QR·`word-breaker`·기타 이벤트는 stats를 변경하지 않는지 확인
- [ ] `0009_boss_rankings.sql` 적용 뒤 stat/control 각각 누적·최단 응답, data-sphinx 거부, room ID 중복 저장 방지를 확인
- [ ] `/api/users`, `/api/stats/:userId`, 인증 없는 스탯 변경이 각각 노출·허용되지 않는지 확인
- [ ] 환경별 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 Cloudflare secret으로 등록하고 저장소·배포 log에 값이 없는지 재확인
- [ ] staging·production의 정확한 Google Authorized redirect URI 등록
- [ ] canonical Worker에서 SPA와 `/api/*`가 같은 origin인지 확인하고 custom domain을 추가할 때만 DNS·TLS와 `PUBLIC_ORIGIN`을 함께 변경
- [ ] 로그인 WebSocket의 same-origin·session 거부, 두 구역 presence, 보스별 공개 방, 방 이름 1~32자 정규화, 1~5명 경계, 같은 계정 중복 좌석 차단과 방장 위임을 staging에서 확인
- [ ] 방이 가득 차도 자동 시작하지 않고 방장만 1명 이상인 방을 수동 시작할 수 있으며, 비방장은 시작할 수 없는지 확인
- [ ] Durable Object 휴면·재기동 뒤 attachment·방 directory·공유 battle 상태가 복구되고, 시작 참가자들이 같은 `seed`·`startedAt`·`roster`와 최신 snapshot을 받는지 확인
- [ ] WebSocket 장애·게스트 상태에서 Battle 진입을 차단하고 로그인·연결 복구 안내를 표시하며 솔로 우회가 없는지 확인
- [ ] 공격 포인트가 다른 두 계정의 유효 hit가 D1 기반 5% 복리 피해로 동일한 보스 HP·revision에 누적되고 공통 승리로 끝나며, 잘못된 종류·cooldown 위반·중복 action ID·임의 피해량은 반영되지 않는지 확인
- [ ] 방어 공식으로 소수 HP가 생겨도 client·WebSocket·Durable Object 복구 snapshot이 같은 6자리 현재 HP를 유지하고 최대 HP 변경·회복은 거부하는지 확인
- [ ] 공유 보스 HP·공통 승리와 로컬 이동·회피·플레이어 HP·기믹·phase의 경계를 UI·운영 문서에서 과장하지 않는지 확인
- [ ] 로그인 취소, 잘못된 `state`, 만료 session, logout, 새로고침, Safari cookie 동작 확인
- [ ] 로그인 전에 닉네임(미설정 시 Google 표시 이름)의 공개 랭킹·사후게임 노출과 D1 수집·보관·삭제 범위를 고지하고 동의를 확인
- [ ] 닉네임과 랭킹 표시 이름이 text로 렌더링되고 email·provider ID가 응답에 없는지 확인
- [ ] 안내 링크·QR이 canonical Worker만 가리키고 폐기한 Pages 주소가 다시 생성되지 않았는지 확인
- [ ] 운영 이전 완료 후 개인 계정 권한을 제거하고 OAuth secret을 회전
- [ ] Worker version rollback과 D1 backup 복구 절차를 배포 전에 기록
