# CS_HISTORY — 사보(사이버보안학과) / CLICK to PURIFY

기록 형식: 여태까지 한 일 / 앞으로 할 일 / 궁금한·필요한·알아낸 것.

---

## 2026-08-20

### 여태까지 한 일
- `feature/click-to-purify-core-loop` 브랜치 생성, `js/minigames/click-to-purify/` 폴더 구성
- `judge.js`: `judgeTiming` 구현 — 오차 0.2초 이내 PERFECT, 0.5초 이내 GOOD, 그 외 MISS
- `malware.js`: `createThreat`(타입별 고유 필드: TROJAN revealed / WORM splitDepth / RANSOM locked / SPYWARE opacity) + `isClickable` 구현

### 앞으로 할 일
- 정화도 계산 로직 구현
- 다중 위협 중 판정 대상 선택 로직 구현
- 클리어/실패 조건 판정 로직 구현 (1단계 마무리)
- 이후 웨이브 진행 구조, 게임 상태(RUNNING/PAUSED 등) 구현 (2단계)

### 궁금한/필요한/알아낸 것
- D-04(정화도 계산식), D-05(동시 판정 우선순위, 랜섬 잠금 중 다른 위협 처리) 팀 미확정 — 임시 값으로 진행 중

## 2026-08-25 (dev 통합)

- 최신 스캐폴딩의 학과 코드 폴더 규칙에 맞춰 구현을 `js/minigames/CS/`로 옮겼습니다.
- 기존 `judge.js`와 `malware.js`의 판정·위협 모델을 유지하면서 공통 lifecycle, 웨이브 진행, 입력, 완료 결과, 재시작·정리 경계를 연결했습니다.
- D-04/D-05가 미확정이므로 6 wave, PERFECT/GOOD 1/0.5 가중치, nearest target, miss 3회 실패 등의 값은 `PROTOTYPE` 가정으로만 사용합니다.
- 빈 판정 후보, 0 wave 분모, UUID 미지원 환경, legacy `perfectwindowMs` 키를 방어하도록 보강했습니다.

## 2026-08-26 (기능 브랜치 MVP)

- `feature/click-to-purify-core-loop`에서 Canvas 기반 SECURITY CORE·판정 링·위협 이동을 구현했습니다.
- 학습 4 wave와 혼합 구간을 합친 22 wave, 진행에 따른 등장 간격 단축을 적용했습니다.
- TROJAN 위장 해제, WORM 미스 시 분열, RANSOM 미스 시 입력 잠금, SPYWARE 접근 투명도를 추가했습니다.
- PERFECT·GOOD·MISS 피드백, 코어 피격, 정화도 HUD, 모바일 CLICK 버튼과 결과 화면을 구현했습니다.
- 모바일의 `crypto.randomUUID()`와 JSON import 호환 문제를 수정하고 `feature/click-to-purify` PR #10으로 다시 제출했습니다.
- 최종 기능 tip은 `61a3070`, 문서 보정까지 포함한 branch tip은 `02d63d5`입니다.

## 2026-08-27 (최신 MVP 재통합)

- `origin/feature/click-to-purify` 전체 이력을 merge commit으로 `dev`에 포함했습니다. 이 merge에는 최신 core-loop, `main`의 최초 merge와 revert, 재적용 이력이 모두 들어 있습니다.
- 기능 브랜치의 독립 harness용 API를 그대로 덮지 않고, 기존 `dev`의 attempt ID·AbortSignal·pause clock·결과 candidate·중복 완료 차단 계약을 기준으로 화면과 게임 규칙을 이식했습니다.
- stable ID는 앱 전체에서 사용하는 `cyber-click-to-purify`를 유지했습니다.
- 브랜치의 22 wave, Canvas HUD, 네 악성코드 특수효과를 반영하고 모든 spawn·판정·잠금 시간을 active game clock 기준으로 계산해 pause 중 진행되지 않게 했습니다.
- 480×480 고정 좌표는 host canvas 크기에 비례하는 좌표로 바꾸고, route 종료·재시작 때 frame과 입력 listener가 남지 않도록 정리했습니다.
- 설정은 공통 metadata와 브랜치 MVP 수치를 합쳤습니다. D-04가 아직 최종 확정되지 않아 GOOD 가중치는 기존 통합값 0.5를 명시적으로 유지하고 `openBalanceDecisions`에 D-04·D-05를 기록했습니다.
- 기능 브랜치의 범용 `dev/test.html`은 production build에서 제외되는 CS 전용 harness 경로로 정리했습니다.
