# AIDS_HISTORY


## 2026-08-24 (MVP 구현)

### 구현 내용
- scaffold(`createScaffoldMiniGame`) 기반 자리표시자 UI를 실제 게임플레이로 교체.
- 공통 lifecycle contract 유지: `init → start → pause ↔ resume → restart → destroy`, `getState()`.
- 1(중앙)-2(좌우)-2(좌우)-1(중앙) 다이아몬드 발판 배치.
- 중력 낙하 + 발판 위 구르기 물리(`physics.js`), 발판 상단 표면 접촉을 판정 기준점으로 사용.
- 발판 이탈 시 다음 발판/박스로 라우팅 결정(`eggs.js`의 `finalizeRelease`) — 3번째 줄에서 바깥쪽으로 이탈하면 화면 밖으로 나가는 자동 실패(`이탈`) 처리 포함.
- `MiniGameResult.metrics`(`correctCount`/`wrongCount`/`lostCount`/`remainingLives`) 실시간 집계, `onComplete`는 세션당 정확히 1회 호출.
- `shared/input-lock.js`, `shared/minigame-clock.js`, `shared/result-builder.js` 연동 — pause 중에는 `clock.getElapsedMs()`가 흐르지 않음을 자동화 테스트로 확인.
- `core/input-manager.js`의 `SELECT_LEFT`/`SELECT_RIGHT` action을 구독해 방향키·A/D 키보드 조작 추가. `core/input-manager.js`가 아직 없어도 게임이 죽지 않도록 동적 import + fallback 처리.
- 실제 `data/minigames/ai-data-egg-sort.json`(schemaVersion/gameId/implementationStatus/goal/controls) 연동 확인. 파일에 없는 balance 값은 `config.js`의 `DEFAULT_CONFIG`로 방어적으로 채움.
- scene/router 없이 게임 하나만 독립 실행해보는 개발용 harness 추가(`test/dev-harness.html`, `test/dev-harness.js`).

### 파일별 역할
| 파일 | 역할 | 비고 |
| --- | --- | --- |
| index.js | 진입점. `registry.js`가 부르는 `createMiniGame(context)`를 export. lifecycle 전체를 조율. |
| definition.js | scaffold의 `DEFINITION`을 그대로 이식. |
| config.js	| balance 기본값(`DEFAULT_CONFIG`) + 실제 config와 병합(`mergeConfig`)·검증(`validateConfig`). |
| dom-builder.js | `context.uiRoot` 안에 게임 화면(타이머·하트·발판 영역·박스·버튼)을 JS로 직접 생성. |
| styles.js | 인지데사 게임 전용 CSS를 `init()`에서 주입하고 `destroy()`에서 제거. |
| hud.js | 화면 표시 담당. 타이머 표시, 하트 생성/갱신, 박스 정답·오답 이펙트, 뜨는 텍스트 |
| platforms.js | 발판 배치 및 제어. |
| physics.js | 중력 낙하·발판 위 구르기의 순수 물리 계산. DOM은 건드리지 않음. |
| eggs.js | 알 생성, 발판 간 이동 경로 결정(`finalizeRelease`), 정답/오답/이탈 판정 + `correctCount/wrongCount/lostCount` 집계. |
| game-loop.js | 매 프레임 physics+eggs+hud를 이어붙이는 orchestrator. 타이머·spawn 스케줄도 게임 clock(`elapsedMs`) 기준이라 pause 시간이 자동으로 빠짐. |
| test/dev-harness.html, test/dev-harness.js | scene/router 없이 이 게임만 단독으로 켜보는 개발용 도구 (실제 배포엔 불필요, 삭제해도 게임 동작에 지장 없음). |
| aids-lite.html | 독립 실행 가능한 인지데사 게임 파일. |

### 기능명세서와 달라진 점
- **판정 방식**: 원문의 "0.2초 즉시 전환 + 즉시 판정" 대신, 중력·구르기 기반 물리 이동으로 대체. 기능적 의도(발판에 닿는 순간의 방향이 판정 기준)는 동일하게 유지.
- **박스 접촉 판정**: 원문 "50% 이상 접촉"을 좌표 근사(`boxes.leftPct/rightPct`)로 단순화.

### D-09 관련 수치 결정 사항
| 항목 | 상태 | 비고 |
| --- | --- | --- |
| `spawnIntervals`(3.5→2.5→1.5초) | 확정 수치 | 기능명세서와 일치 |
| `eggTypeProbability`(0.5/0.5) | 초안 | D-09 확정 전 임시값 |
| `physics`(gravity/rollAccel/maxRollSpeed/landingInertiaKeep 등) | 초안 | D-09 확정 전 임시값 |

### 앞으로 할 일
- Android, Windows 환경 테스트
- 모바일뷰 UI 수정
- 관성에 따른 물리 로직 수정 필요

### 궁금한/필요한/알아낸 것
- data 폴더 각 미니게임 json 중 implementationStatus은 값을 뭘로 바꿔야 하나요?
- 아트팀에 요청할 요소 이미지에 대한 문서 정리가 필요할까요? (요소별 사이즈, 필요 이미지 등) 혹은 아트팀에서 결정해주시면 코드에 반영하면 되는 걸까요?
- 재도전 규칙은 게임팀 전체에서 논의가 필요할 것 같습니다


## 2026-08-25 (물리 로직 수정)

### 수정 사항
- **발판 통과 버그**: 낙하 중 알을 다음 발판 쪽으로 밀어주던 로직(감쇠 없는 스프링 방식)이 gravity 등 물리값을 낮추면 목표 지점에 제때 수렴하지 못해, 발판 높이(Y)엔 도달했지만 가로 위치(X)는 이미 발판을 넘어선 채로 착지 처리되는 문제가 있었음. → "남은 낙하 시간 안에 정확히 도착"하도록 매 프레임 속도를 역산하는 방식(time-to-go guidance)으로 교체.
- **방향 전환 시 점프 현상**: 위 수정 직후, 목표 속도로 순간 전환되면서 좌우 이동 시 부자연스럽게 튀는 문제 발생 → `fallSteerAccel`(가속도 한도)을 추가해 목표 속도로 서서히 다가가도록 개선.

----