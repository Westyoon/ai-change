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
----