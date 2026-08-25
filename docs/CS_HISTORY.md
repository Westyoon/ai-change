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
----
