# ai-change

이화여자대학교 인공지능대학 축제를 탐색·대화·미니게임 경험으로 소개하는 반응형 웹게임입니다.

현재 `dev` 통합본에는 공통 화면 전환·데이터·lifecycle 스캐폴딩과 각 기능 브랜치의 구현이 함께 들어 있습니다. DS·CSE·AIDS 미니게임은 MVP, CS 미니게임은 검토 중인 규칙을 적용한 프로토타입이며, AI 미니게임은 공통 계약 확인용 스캐폴드 상태입니다. 최종 아트와 `data/drafts/`에 남은 밸런스 결정은 아직 확정되지 않았습니다.

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
  → 학과 NPC Map
  → NPC Dialogue
  → Mini Game Intro
  → 학과별 Mini Game
  → CLEAR / FAIL Result
  → Retry / Map / Menu
```

Main Menu에서는 게임 방법, 설정, Battle Coming Soon 경로도 확인할 수 있습니다.

## 미니게임 모듈

| 학과 코드 | Stable ID | 미니게임 | 상태 |
| --- | --- | --- | --- |
| `DS` | `data-number-baseball` | 숫자 야구 | MVP |
| `CS` | `cyber-click-to-purify` | CLICK to PURIFY | Prototype |
| `CSE` | `computer-code-heart` | Code Heart: Unlock! | MVP |
| `AI` | `ai-ball-classification` | AI Ball Classification Game | Scaffold |
| `AIDS` | `ai-data-egg-sort` | 인지알·데사알 분류 게임 | MVP |

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

모든 모듈은 시도 ID별 1회 완료, 중단 가능한 초기화, 일시정지·재개, 재시작, 중복 파기를 동일한 호스트 계약으로 처리합니다. AI 스캐폴드의 `개발용 CLEAR`와 `개발용 FAIL` 버튼 및 각 모듈의 `completeForDevelopment`는 result·retry·save 연결을 검증하기 위한 개발 전용 경로입니다.

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
  battle/             Story와 독립된 registry seam
data/
  departments.json    학과 코드 SSOT
  minigames.json      5개 stable registry entry
  scripts/            intro·NPC·outro data
  minigames/          runtime minigame config
  drafts/             미확정 결정값, production 비참조
assets/               자체 제작 placeholder SVG
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

## 문서

- [통합 개발 계획](./docs/AI_CHANGE_PLAN.md)
- [기획안](./docs/기획안.md)
- [실행 및 조작 방법](./docs/execution-and-controls.md)
- [리소스 출처 목록](./docs/asset-sources.md)
- [Git 브랜치 규칙](./docs/GIT_BRANCH_RULE.md)
- [브랜치 통합 기록](./History.md)

## 아직 구현하지 않은 범위

- 최종 게임명·로고·세계관·아트·사운드
- 자유 이동 tile map과 실제 충돌 처리
- 5개 미니게임의 최종 규칙·밸런스·점수 정책
- 실제 Battle 콘텐츠
- 계정, 서버 저장, 온라인 랭킹, 멀티플레이

구체적인 구현 순서와 결정 항목은 `docs/AI_CHANGE_PLAN.md`를 기준으로 진행합니다.
