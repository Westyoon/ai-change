# ai-change

이화여자대학교 인공지능대학 축제를 탐색·대화·미니게임 경험으로 소개하는 반응형 웹게임입니다.

현재 `dev` 통합본에는 공통 화면 전환·데이터·lifecycle 스캐폴딩과 각 기능 브랜치의 최신 구현이 함께 들어 있습니다. DS·CS·CSE·AI·AIDS 미니게임 5종은 모두 플레이 가능한 MVP입니다. `after/character-move`에는 사후게임의 공용 이동·방향·충돌·공격 명령·피격 상태 모듈과 개발 연습장이 추가되며, 최종 캐릭터 아트와 Battle 규칙·밸런스는 아직 확정되지 않았습니다.

## 학과 코드

학과 표기와 코드의 단일 기준은 `data/departments.json`입니다.

| 코드 | 학과·전공 | 경로용 slug |
| --- | --- | --- |
| `AI` | 인공지능학부 | `ai` |
| `DS` | 데이터사이언스전공 | `ds` |
| `CSE` | 컴퓨터공학과 | `cse` |
| `CS` | 사이버보안학과 | `cs` |
| `AIDS` | 인공지능데이터사이언스학부 | `aids` |

학과 코드는 표시·테마용 `departmentCode`로 사용합니다. 저장과 대화에서 참조하는 기존 미니게임 ID는 변경하지 않습니다.

## 실행 방법

Node.js 20 이상이 필요합니다. 외부 패키지 의존성은 없습니다.

```bash
npm run dev
```

기본 주소는 `http://127.0.0.1:4173`이며, 환경 변수 `PORT`가 설정되어 있으면 서버가 출력한 해당 포트를 사용합니다. ES module과 JSON fetch를 사용하므로 `index.html`을 `file://`로 직접 열지 않습니다.

## 공개 주소와 배포

Cloudflare Pages의 무료 고정 대표 주소는 <https://ai-change.pages.dev/>입니다. `dev`의 검증 완료 빌드를 같은 주소에 다시 배포하려면 Cloudflare 계정으로 로그인한 뒤 다음 명령을 실행합니다.

```bash
npm run cf:deploy:production
```

이 명령은 전체 source·test·smoke·production build 검사를 먼저 통과한 경우에만 `dist/`를 Pages production branch인 `dev`로 올립니다. `npm run cf:deploy:staging`은 `staging.ai-change.pages.dev` 별칭을 사용하는 별도 preview 배포입니다. 이전 Workers Static Assets 설정은 `wrangler.worker.jsonc`와 `cf:deploy:worker:*` 명령으로 보존하지만 대표 주소 배포에는 사용하지 않습니다.

## 검증 명령

```bash
npm run validate
npm test
npm run smoke
npm run check
```

- `validate`: 필수 파일, JSON, 버전, 학과 코드, registry·script·asset 참조 검사
- `test`: Node 내장 test runner로 core·data·미니게임 lifecycle 검사
- `smoke`: 임시 로컬 서버에서 HTML·CSS·JS·JSON·SVG 응답과 MIME 검사
- `check`: 위 검사를 순서대로 모두 실행

## 현재 확인 가능한 흐름

```text
Loading
  → Main Menu
  → Story Intro
  → 학과별 Mini Game Map
  → 학과 카드 선택
  → 학과별 Mini Game
  → CLEAR / FAIL Result
  → Retry / Map / Menu
```

맵의 학과 카드는 기본 흐름에서 대화·안내 화면을 거치지 않고 연결된 미니게임을 즉시 실행합니다. 기존 NPC 대화와 미니게임 안내 route·데이터는 별도 콘텐츠에서 다시 사용할 수 있도록 유지합니다.

Main Menu에서는 게임 방법, 설정, Battle Coming Soon 경로와 별도의 `캐릭터 시스템 · DEV PREVIEW` 연습장도 확인할 수 있습니다. 연습장은 실제 Battle을 publish하지 않고 공용 캐릭터 API만 검증합니다.

## 미니게임 모듈

| 학과 코드 | Stable ID | 미니게임 | 상태 | 현재 MVP 핵심 규칙 |
| --- | --- | --- | --- | --- |
| `DS` | `data-number-baseball` | 숫자 야구 | MVP | 3자리 추론·Epoch 제한 |
| `CS` | `cyber-click-to-purify` | CLICK to PURIFY | MVP | 학습 4 + 혼합 18, 총 22 wave |
| `CSE` | `computer-code-heart` | Code Heart: Unlock! | MVP | 범주별 재료 조합·제출 |
| `AI` | `ai-ball-classification` | AI Ball Classification Game | MVP | 목표 공 5개·방해 공 25개 분류 |
| `AIDS` | `ai-data-egg-sort` | 인지알·데사알 분류 게임 | MVP | 발판 이동·알 분류·생명 관리 |

통합 화면은 기능 브랜치의 고유 UI를 공통 카드로 다시 그리지 않습니다. AI `480×640`, CS `480×480` Canvas+패널, CSE `440×920`, AIDS `390×740`의 원본 논리 배치와 색·문구를 유지하고, 공통 stage에서는 바깥 프레임의 축소·나란히/세로 배치·스크롤만 담당합니다.

각 모듈은 아래 공통 API를 노출합니다.

```text
createMiniGame(context)
  ├── init(config, { signal })
  ├── start({ attemptId })
  ├── pause(reason)
  ├── resume()
  ├── restart({ attemptId })
  ├── destroy()
  └── getState()
```

모든 모듈은 시도 ID별 1회 완료, 중단 가능한 초기화, 일시정지·재개, 재시작, 중복 파기를 동일한 호스트 계약으로 처리합니다. 각 모듈의 `completeForDevelopment`는 자동화 테스트에서 result·retry·save 연결을 검증하기 위한 개발 전용 seam이며 실제 플레이 UI에는 노출되지 않습니다.

## 주요 구조

```text
index.html
css/                  공통·반응형·대화·맵·미니게임 스타일
js/
  core/               입력, resize, asset, save, audio 등 공통 service
  scenes/             화면 단위 orchestration
  map/                map domain skeleton
  story/              dialogue domain skeleton
  minigames/          registry, shared contract, 학과별 module
  battle/             Story와 독립된 registry seam, 사후게임 공용 character core
data/
  departments.json    학과 코드 SSOT
  minigames.json      5개 stable registry entry
  scripts/            intro·NPC·outro data
  minigames/          runtime minigame config
  drafts/             미확정 결정값, production 비참조
assets/               자체 제작 placeholder SVG와 AI 기능 브랜치 PNG sample
scripts/              개발 서버·validation·smoke 도구
tests/                unit·contract·integration test
docs/                 계획·기획·실행·리소스 문서
```

## 개발 원칙

- 표시용 학과명은 `data/departments.json`, 미니게임 연결은 stable ID를 사용합니다.
- 확정되지 않은 balance 값은 runtime config에 임의로 넣지 않습니다.
- `data/drafts/`는 의사결정 기록용이며 runtime manifest에서 참조하지 않습니다.
- dialogue와 label은 HTML 문자열이 아니라 text node로 출력합니다.
- 모든 핵심 흐름은 키보드·마우스·터치 환경을 고려합니다.
- 외부 리소스를 추가하면 `docs/asset-sources.md`를 함께 갱신합니다.
- AI PNG sample은 원본·사용 권한을 확인하거나 최종 아트로 교체한 뒤 production에 사용합니다.

## 문서

- [통합 개발 계획](./docs/AI_CHANGE_PLAN.md)
- [기획안](./docs/기획안.md)
- [사후게임(Battle) 기획안](./docs/사후게임_기획안.md)
- [사후게임 공용 캐릭터 시스템](./docs/after-character-system.md)
- [실행 및 조작 방법](./docs/execution-and-controls.md)
- [리소스 출처 목록](./docs/asset-sources.md)
- [Git 브랜치 규칙](./docs/GIT_BRANCH_RULE.md)
- [브랜치 통합 기록](./History.md)

## 아직 구현하지 않은 범위

- 최종 게임명·로고·세계관·아트·사운드
- 정식 자유 이동 필드 map·콘텐츠 데이터와 최종 캐릭터 스프라이트 연결
- 5개 미니게임의 최종 규칙·밸런스·점수 정책
- 실제 Battle 보스·공격 판정·피해 공식·부활 규칙
- 계정, 서버 저장, 온라인 랭킹, 멀티플레이

구체적인 구현 순서와 결정 항목은 `docs/AI_CHANGE_PLAN.md`를 기준으로 진행합니다.
