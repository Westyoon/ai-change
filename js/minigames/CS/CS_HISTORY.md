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

---

## 2026-08-22

### 여태까지 한 일
- judge.js: calculatePurification 구현 (Perfect 1점/Good 0.5점 기준 정화도 % 계산)
- judge.js: pickTarget 구현 (클릭 시 targetAt이 가장 가까운 위협을 판정 대상으로 선택)
- judge.js: resolveTerminalState 구현 (미스 한도 도달 시 FAIL, 모든 웨이브 소진+위협 없으면 CLEAR)
- 1단계(데이터 구조 + 판정 로직) 완료

### 앞으로 할 일
- 2단계: 웨이브 진행 구조(buildWavePlan) 및 게임 상태 흐름(RUNNING/PAUSED 등) 구현

### 궁금한/필요한/알아낸 것
- D-04(정화도 계산식), D-05(동시 판정 우선순위) 여전히 팀 미확정 — 임시 값으로 진행 중

---

## 2026-08-24

### 여태까지 한 일
- data/minigames/click-to-purify.json 설정 파일 생성 (웨이브 수, 간격, 판정 범위 등)
- wave.js: buildWavePlan 구현 — 학습 구간(1~4, 고정 순서) + 혼합 구간(5~14, 랜덤 조합 + 간격 축소, 랜섬웨어 후반부 1~2회)
- index.js: 게임 상태(CREATED/READY/RUNNING/PAUSED/COMPLETED) 전이 골격 구현 (init/start/pause/resume)
- 2단계(웨이브 진행 + 게임 상태 흐름) 대부분 완료

### 앞으로 할 일
- index.js의 start()에 buildWavePlan 연결해서 시간에 맞춰 실제로 위협이 등장하도록 연결
- 2단계 마무리 후 3단계(화면 그리기, 입력 연결)로 진행

### 궁금한/필요한/알아낸 것
- 알아낸 것: JSON 파일에는 주석을 쓸 수 없음 (데이터 전용 포맷이라 문법이 단순화됨) — 설정값 설명은 그 값을 쓰는 JS 파일 쪽에 주석으로 남기기로 함

---

## 2026-08-25

### 여태까지 한 일
- index.js: init()에 buildWavePlan 연결 — 초기화 시 웨이브 계획(wavePlan)을 미리 생성해서 저장
- index.js: start()에 웨이브 스케줄링 연결 — setTimeout으로 각 웨이브의 spawnAtMs에 맞춰 createThreat 호출, activeThreats 배열에 등록
- 2단계 진행률 약 65~70% (자동 MISS 처리, 종료 판단, destroy 정리 남음)

### 앞으로 할 일
- 판정 링 통과 후 클릭 안 하면 자동 MISS 처리 로직 추가
- resolveTerminalState 연결해서 게임 종료(COMPLETED) 판단 및 onComplete 호출
- destroy()에서 예약된 타이머 정리
- 2단계 마무리 후 3단계(화면 그리기·입력 연결) 진행

### 궁금한/필요한/알아낸 것
- 알아낸 것: VS Code 왼쪽 초록 세로줄은 "저장했지만 아직 커밋 안 한 줄"이라는 Git 변경 표시라는 걸 알게 됨 (에러아님)

---