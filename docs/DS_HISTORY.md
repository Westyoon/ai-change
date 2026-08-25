# 데이터사이언스전공 숫자 야구 (ds-minigame) MVP 개발 및 협업 히스토리

> 아래는 기능 브랜치의 원래 작업 기록입니다. `dev` 통합본은 최신 스캐폴딩에 맞춰 `js/minigames/DS/index.js`를 사용하며, 문서의 `[cite]` 표기와 실제 브랜치에 없는 `test.html` 주장은 원본 기록으로만 보존합니다. 검증된 통합 내역은 루트 [History.md](../History.md)를 참고하세요.

**작업 기간:** 2026.08.20 ~ 2026.08.24
**작업 브랜치:** `feature/ds-minigame`

## 1. 초기 환경 세팅 및 브랜치 생성
* **Git Repository 동기화 및 브랜치 생성**
  * `main` 브랜치 최신화 (`pull origin`) 후 작업 브랜치(`feature/ds-minigame`) 생성[cite: 2].
* **초기 파일 구성**
  * 미니게임 모듈 엔트리 파일(`js/minigames/number-baseball/index.js`) 및 설정 데이터 파일(`number-baseball.json`) 생성[cite: 1].
  * *협업 노트:* 신규 디렉토리 생성 시 병합(Merge) 충돌 여부에 대한 검토 진행. 각 미니게임이 독립된 폴더를 사용하므로 파일 경로가 겹치지 않아 충돌 위험이 없음을 확인하고 작업 착수.

## 2. 모듈 뼈대(Skeleton) 및 DOM 레이아웃 구성
* **공통 라이프사이클 컨트랙트 적용**
  * 기획안의 게임 시스템 설계에 따라 `createMiniGame` 팩토리 함수 내에 `init`, `start`, `pause`, `resume`, `restart`, `destroy` 메서드 뼈대 구축[cite: 1].
  * 게임 상태(State) 관리를 위한 핵심 변수(정답, 입력값, 히스토리, 시도 횟수 등) 선언.
* **동적 DOM 레이아웃 생성**
  * `index.html` 하드코딩을 배제하고, `init` 호출 시 `context.uiRoot`에 레이아웃(상단 프로그레스, 중앙 입력 슬롯 및 히스토리, 하단 숫자 키패드)을 동적으로 생성 및 부착하도록 구현[cite: 1].
  * *협업 노트:* DOM(Document Object Model)의 개념과 브라우저의 트리 구조 객체 렌더링 방식을 짚고 넘어가며, 단일 페이지 애플리케이션(SPA)에서 동적 UI 생성의 필요성 확립.

## 3. 핵심 게임 로직 구현 및 로컬 테스트 환경 구축
* **입출력 및 정답 생성 로직 구현**
  * 게임 시작 시 0~9 사이의 중복 없는 3자리 난수 정답을 생성하는 로직 구현[cite: 1].
  * 키패드를 통한 숫자 입력, 중복 입력 방지, 자리수 제한(최대 3자리) 및 지우기 기능 구현[cite: 1].
* **독립 테스트 환경(Test Harness) 구성**
  * 전체 앱 셸(AppShell) 연동 전, 로직의 독립적 검증을 위해 가상의 `context`를 주입한 `test.html`을 생성하여 로컬 테스트 수행[cite: 1].
* **Fit / Shift / Outlier 판정 로직 적용**
  * 제출(검증) 시 배열 인덱스와 값을 비교하여 Fit, Shift, Outlier를 계산하고 화면 히스토리에 누적하는 로직 구현[cite: 1].
  * 3 Fit 달성 시 `CLEAR`, 최대 시도(9 Epoch) 도달 시 `FAIL`을 반환하는 종료 처리 및 상위 시스템(`onComplete`) 결과 전달 로직 완성[cite: 1].
  * 3자리 미만 입력 시 제출을 방지하고 Epoch를 차감하지 않는 예외 처리 추가[cite: 1].

## 4. 설정 파일(JSON) 작성 및 MVP 완료
* **config JSON 작성**
  * `data/minigames/number-baseball.json` 파일에 게임 밸런스 및 규칙 설정 정의[cite: 1].
  * 기획 미확정 파라미터(선행 0 허용 여부, 제한 시간 등)는 임의의 값 대신 `TBD` 상태로 명시하여 추후 밸런스 기획 확정 시 반영하도록 조치[cite: 1].
* **향후 계획**
  * MVP 핵심 로직 및 DOM 레이아웃 구현 완료.
  * 추후 CSS 디자인 고도화(`css/minigames.css`) 및 상위 씬(Story/Map) 통합 작업 진행 예정.
