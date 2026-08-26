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
- 알아낸 것: VS Code 편집기의 초록 세로줄(Git 변경 표시)이나 전구 아이콘(코드 제안)은 에러가 아니라는 걸 확인함

---

## 2026-08-26

### 여태까지 한 일
- Canvas 렌더링 완성: SECURITY CORE, 판정 링, 위협 4종 시각화(타입별 색상), 스파이웨어 은신(투명도 연출)
- CLICK 입력 연결(onClickButton): pickTarget+judgeTiming 기반 판정, PERFECT/GOOD/MISS 카운트 반영
- 타입별 특수 연출 구현: 트로이 위장 해제 타이밍 조정(Good 판정 시점에 맞춤), 웜 미스 시 2마리 분열(정화도 미반영 처리, 분열 연출 포함), 랜섬웨어 미스 시 코어 입력 잠금(자물쇠 아이콘 표시)
- 판정 피드백 연출: 조준선(빨간 십자선), 판정 텍스트(PERFECT!/GOOD!/MISS!), 놓친 위협이 코어로 돌진하며 코어가 빨갛게 번쩍이는 피격 연출
- 너무 이르거나 늦은 클릭은 판정 없이 무시되는 clickIgnoreMs 로직 추가
- 밸런스 조정: 웨이브 수 14→22, 혼합 구간 간격/접근 속도 재조정으로 동시 등장 위협 수 확대, missLimit/ransomLockMs 등 수치 튜닝
- restart() 함수 구현, onComplete 결과를 공식 MiniGameResult 형식({miniGameId, status, score, durationMs, failureReason, metrics, reward})에 맞춰 재구성 — 계획서 9.1 라이프사이클 계약 완전 충족
- 게임 시작 전 설명 화면(반투명 오버레이, 규칙 요약) 추가
- 모바일 호환성 버그 수정: `crypto.randomUUID()`(보안 컨텍스트 전용) → 자체 id 생성 함수로 교체, JSON import assertion → `fetch` 방식으로 교체(사파리 호환)
- 첫 PR 제출 및 셀프 머지 실수 → revert → 재신청까지 완료

### 앞으로 할 일
- 게임 종료 시 `alert()` 대신 정식 결과 화면(정화도/실패 사유 + RESTART 버튼) 구현
- 팀 리뷰어 승인 대기 중 (PR 병합 전)
- 사운드 훅, 최종 아트 리소스는 추후 반영 예정

### 궁금한/필요한/알아낸 것
- 알아낸 것: iOS 사파리/크롬은 같은 WebKit 엔진을 강제로 쓰기 때문에 실질적으로 같은 테스트 결과를 준다는 것, `crypto.randomUUID()`는 HTTPS/localhost 같은 보안 컨텍스트에서만 동작한다는 것

---

## 2026-08-26 (2)

### 여태까지 한 일
- 게임 종료 시 `alert()` 대신 정식 결과 화면(성공 시 정화도 표시 / 실패 시 MISS 사유 표시) + RESTART 버튼 구현
- `checkGameOver()`의 `onComplete` 호출부에서 `miniGameResult`가 아닌 구버전 `result`를 전달하던 버그 발견 및 수정 (metrics 누락으로 인한 콘솔 에러 해결)
- 셀프 머지 실수 → revert → 재작업 브랜치(`feature/click-to-purify`)로 새 PR 재제출
- 인트로 화면 문구를 "정화(행동) + 코어 보호(목표)"가 함께 드러나도록 정리

### 앞으로 할 일
- 팀 리뷰어 승인 대기
- 승인 후 최종 병합

### 궁금한/필요한/알아낸 것
- 알아낸 것: 같은 버그를 두 번 반복해서 겪음 — 코드 수정 후엔 항상 저장 여부(탭의 저장 안 됨 표시)를 직접 확인하는 습관이 필요하다는 걸 체감함