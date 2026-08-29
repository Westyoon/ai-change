# 로그인·스탯 DB·랭킹 서버 통합

> 원본 기여: GitHub PR #12 `feat: add authorize, login, ranking board functionality`
>
> 통합 브랜치: `integration/after-auth-stats-ranking`
>
> 문서 상태: 구현·검증 기준. 이 문서 작성 시점에는 운영 배포와 실제 Google OAuth 종단 간 검증을 완료했다고 간주하지 않는다.

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

하나의 Cloudflare Worker가 정적 SPA와 API를 같은 origin으로 제공한다.

```text
브라우저 · https://<대표 도메인>
  ├─ /api/*  ───────────────→ Cloudflare Worker
  │                            ├─ Google OAuth
  │                            └─ D1: users, stats, sessions, game_results
  └─ 그 외 경로 ─────────────→ Worker Static Assets의 dist/
```

- Worker는 `/api/*`에서 정적 asset보다 먼저 실행한다.
- 브라우저는 host를 하드코딩하지 않고 `/api/...` 상대 경로만 호출한다.
- 운영 환경의 `PUBLIC_ORIGIN`은 Cloudflare 일반 환경 변수로 대표 HTTPS origin 하나만 설정한다. 다른 host로 직접 접근한 API 요청은 거부한다.
- 인증 cookie는 `HttpOnly`, 운영 환경 `Secure`, `SameSite=Lax`, `Path=/`로 발급한다.
- D1에는 원본 session token이 아닌 SHA-256 hash와 만료 시각을 저장한다.
- 기존 Cloudflare Pages 주소를 계속 안내한다면 새 대표 Worker 도메인으로 이동시키거나, 동일한 기능을 제공하지 않는 구 주소임을 명확히 구분한다.

## 4. API 계약

### 공개·로그인 흐름

| Method | 경로 | 계약 |
| --- | --- | --- |
| `GET` | `/api/health` | 서버 상태 확인. 개인정보를 포함하지 않음 |
| `GET` | `/api/ranking?criteria=clears` | 표시 이름과 전체 누적 클리어만 비교 |
| `GET` | `/api/ranking?criteria=score&gameId=<id>` | 등록된 같은 미니게임의 최고 원점수끼리만 비교 |
| `GET` | `/api/auth/google` | 일회용 OAuth `state`를 만들고 Google로 이동 |
| `GET` | `/api/auth/callback` | `state` 검증, Google code 교환, 계정 upsert, session 발급 후 SPA로 이동 |

`/api/users`, `/api/stats/:userId`처럼 내부 ID나 email을 공개하는 경로는 통합 계약에 포함하지 않는다.

### session이 필요한 경로

| Method | 경로 | 계약 |
| --- | --- | --- |
| `GET` | `/api/session` | 로그인 여부와 본인의 표시 이름·스탯만 반환 |
| `POST` | `/api/auth/logout` | 현재 session을 폐기하고 cookie를 만료 |
| `POST` | `/api/results` | 본인의 CLEAR 결과를 attempt 단위로 한 번만 반영 |
| `POST` | `/api/stats/allocate` | 남은 스탯 포인트 1개를 `attack`·`hp`·`defense` 중 하나에 배분 |

결과 등록 요청 예시는 다음과 같다. `userId`, email 또는 스탯 증가량은 클라이언트가 보내지 않는다.

```json
{
  "attemptId": "host가 발급한 시도 ID",
  "gameId": "computer-code-heart",
  "status": "CLEAR",
  "score": 400
}
```

서버는 session에서 이용자를 찾고, 등록된 5개 미니게임 ID·`CLEAR` 상태·허용 범위의 정수 점수만 받는다. 같은 계정의 같은 `attemptId`는 `game_results`의 unique 제약으로 한 번만 처리한다. 최초 반영 때만 `clears`와 `unspent_points`를 1 증가시키고, 최고 점수 랭킹은 단위가 다른 게임끼리 섞지 않고 `game_results.game_id`별로 계산한다.

스탯 배분 요청은 다음처럼 선택할 항목만 보낸다.

```json
{
  "stat": "attack"
}
```

D1 transaction 안에서 `unspent_points > 0`을 확인하고 포인트 감소와 선택 스탯 증가를 함께 처리한다. 기존처럼 임의의 `newScore`, `userId`, 증가량을 받지 않는다.

## 5. 브라우저 게임 결과의 신뢰 한계

인증, 허용값 검사, attempt 멱등성은 다른 계정 갱신과 단순 재전송을 막지만, 정적 JavaScript에서 만들어진 CLEAR 결과가 실제 플레이로 발생했는지 서버가 증명하지는 못한다. 이용자가 브라우저 요청을 직접 만들 수 있으므로 이 구조를 완전한 부정행위 방지 시스템으로 설명하면 안 된다.

현재 범위에서는 다음 방어만 적용한다.

- 로그인 session과 본인 계정만 연결
- 공개된 5개 `gameId`, `CLEAR`, 제한된 정수 score만 허용
- 동일 attempt 중복 지급 방지
- 계정 ID·스탯 증가량·클리어 증가량을 body에서 받지 않음

경쟁성 랭킹의 신뢰 수준을 높여야 할 때는 서버가 발급한 짧은 수명의 challenge, 게임별 검증 가능한 event 요약 또는 서버 권위 판정을 별도 설계해야 한다.

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
```

실제 값이 없어도 먼저 확인할 수 있는 항목은 health·비로그인 session·공개 ranking·인증 없는 변경 요청의 거부·폐기된 개인정보 API의 404이다. 실제 값이 준비된 뒤에는 OAuth `state` 불일치 거부, callback, cookie 발급, 새로고침 후 session 복구, logout, CLEAR 1회 반영, 같은 attempt 재전송 무변경, 포인트 배분까지 확인한다.

현재 CLEAR 전송은 로컬 진행 저장을 먼저 끝낸 뒤 비동기로 실행한다. 서버 장애나 탭 종료로 전송이 실패하면 로컬 결과는 유지되지만 서버 클리어·포인트는 자동 복구되지 않는다. 계정이 바뀌었을 때 다른 사용자에게 적립되지 않도록, 영속 재시도 queue는 session에 묶인 서버 발급 식별자를 설계한 뒤 추가한다.

운영 DB migration은 staging 백업과 검증을 마친 뒤에만 명시적으로 실행한다.

```powershell
cd backend
npx wrangler d1 migrations apply ai-change --remote
```

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
- production: `https://<대표 도메인>/api/auth/callback`
- 대표 도메인을 `ai-change-game.dev`로 확정한 경우: `https://ai-change-game.dev/api/auth/callback`

스킴, host, port, 경로, trailing slash가 하나라도 다르면 callback이 거부된다. Google Console에는 실제로 사용하는 origin·redirect만 등록하고 임시 프리뷰 URL을 무제한 추가하지 않는다.

## 9. staging·production 이전 체크리스트

- [ ] `wrangler whoami`로 배포 대상이 개인 테스트 계정이 아닌 운영 Cloudflare 계정인지 확인
- [ ] staging·production D1을 분리하고 각 binding의 DB 이름·ID를 운영 계정 값으로 교체
- [ ] 기존 개인 D1의 users·stats를 백업하고, Google `sub`와 스탯 값이 보존되도록 이전 rehearsal 수행
- [ ] staging에서 migration, health, session, ranking, 결과 멱등성, 포인트 원자적 배분을 먼저 검증
- [ ] `/api/users`, `/api/stats/:userId`, 인증 없는 스탯 변경이 각각 노출·허용되지 않는지 확인
- [ ] 환경별 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`을 Cloudflare secret으로 등록하고 저장소·배포 log에 값이 없는지 재확인
- [ ] staging·production의 정확한 Google Authorized origin과 redirect URI 등록
- [ ] 대표 custom domain의 DNS·TLS를 Worker에 연결하고 SPA와 `/api/*`가 같은 origin인지 확인
- [ ] 로그인 취소, 잘못된 `state`, 만료 session, logout, 새로고침, Safari cookie 동작 확인
- [ ] 랭킹 표시 이름이 text로 렌더링되고 email·provider ID가 응답에 없는지 확인
- [ ] 기존 Pages 대표 주소의 redirect 또는 종료 안내를 정해 이용자가 두 배포본으로 갈라지지 않게 함
- [ ] 운영 이전 완료 후 개인 계정 권한을 제거하고 OAuth secret을 회전
- [ ] Worker version rollback과 D1 backup 복구 절차를 배포 전에 기록
