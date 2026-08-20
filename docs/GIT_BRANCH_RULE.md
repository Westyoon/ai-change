# Git Branch Naming & Management Guidelines — Web Game Team



이 문서는 게임팀 레포지토리에서 사용하는 **Git 브랜치·커밋 메시지 규칙과 협업 원칙**을 정의한다.

본 프로젝트는 PC와 모바일에서 모두 실행되는 **반응형 웹게임** 개발을 전제로 한다.

목표는 다음과 같다.

* 브랜치의 작업 목적을 한눈에 파악할 수 있도록 한다.
* 팀원의 작업이 서로 충돌하거나 유실되는 것을 방지한다.
* 기능 개발, 버그 수정, 디자인·에셋 작업을 명확하게 구분한다.
* PC·모바일 환경에서 안정적으로 실행되는 웹게임을 개발한다.
* 배포 가능한 상태와 개발 중인 상태를 분리한다.

---

## 0. 빠른 시작 Workflow

### 0.1 최초 1회: 프로젝트 복제 및 설정

```bash
git clone <REPOSITORY_URL>
cd <PROJECT_NAME>

git remote -v

git checkout main
git pull origin main
```

프로젝트에 패키지 설치 과정이 있다면 다음 명령어를 실행한다.

```bash
npm install
npm run dev
```

### 0.2 브랜치 생성 후 작업 시작

> ⚠️ `main` 브랜치에서 직접 작업하지 않는다.

```bash
git checkout main
git pull origin main
git checkout -b feature/start-screen
```

---

## 1. 기본 개발 원칙

1. 모든 작업은 별도의 브랜치에서 진행한다.
2. 모든 브랜치는 목적 중심의 prefix를 사용한다.
3. 브랜치 이름은 영어 소문자와 kebab-case를 사용한다.
4. `main` 브랜치는 항상 실행 및 배포 가능한 상태를 유지한다.
5. 하나의 브랜치에서는 가능한 한 하나의 기능이나 문제만 다룬다.
6. 커밋 메시지는 변경 내용을 구체적으로 설명해야 한다.
7. PC와 모바일 환경에서 모두 정상적으로 작동하는지 확인한다.
8. 모든 Pull Request는 Owner 또는 지정된 Reviewer의 승인 후 merge한다.
9. 본인이 작성한 PR은 원칙적으로 본인이 직접 merge하지 않는다.
10. 이미지·음원·폰트 등 외부 리소스의 출처와 라이선스를 기록한다.

---

## 2. 웹게임 기본 개발 기준

### 2.1 지원 환경

게임은 별도의 설치 없이 웹 브라우저에서 실행할 수 있어야 한다.

* PC: Chrome, Edge, Safari 최신 버전
* 모바일: Android Chrome, iOS Safari
* 입력 방식:

  * PC: 마우스 및 키보드
  * 모바일: 터치
* 화면 크기에 따라 UI가 조정되는 반응형 웹 적용
* 모바일 화면에서 가로 스크롤이 발생하지 않도록 구현
* 버튼은 모바일에서 터치하기 충분한 크기로 제작
* 새로고침, 화면 회전, 창 크기 변경 시 치명적인 오류가 발생하지 않아야 함

### 2.2 기본 화면

게임 특성에 따라 달라질 수 있으나, 다음 화면을 기본으로 구성한다.

1. 로딩 화면
2. 시작 화면
3. 게임 방법 또는 튜토리얼
4. 게임 플레이 화면
5. 일시정지 화면
6. 성공·실패 또는 결과 화면
7. 재시작 및 메인 화면 이동 기능

### 2.3 반응형 화면 기준

* 화면 크기를 특정 픽셀로만 고정하지 않는다.
* 게임 영역은 화면 비율에 맞추어 확대·축소한다.
* 중요한 UI가 화면 밖으로 잘리지 않도록 한다.
* 게임 방향은 기획 단계에서 가로형 또는 세로형으로 결정한다.
* 필요하면 기기 방향 전환 안내 화면을 제공한다.
* PC의 hover 효과에만 의존하지 않는다.
* 터치 환경에서 클릭, 드래그, 길게 누르기 등의 조작을 별도로 확인한다.

---

## 3. 브랜치 네이밍 기본 구조

```text
<prefix>/<short-description>
```

* `prefix`: 작업의 성격
* `short-description`: 작업 내용을 요약한 kebab-case 문구

### 예시

```text
feature/start-screen
feature/mobile-touch-control
fix/player-collision-error
ui/result-screen-layout
asset/player-sprite
balance/stage-one-difficulty
docs/add-game-rules
```

---

## 4. Prefix 표준

| Prefix       | 용도                          |
| ------------ | --------------------------- |
| `feature/`   | 새로운 게임 기능, 로직, 시스템 추가       |
| `fix/`       | 버그 및 실행 오류 수정               |
| `ui/`        | 화면 배치, 반응형 UI, 애니메이션 수정     |
| `asset/`     | 이미지, 스프라이트, 아이콘, 음원, 폰트 작업  |
| `balance/`   | 난이도, 점수, 속도, 출현 확률 등 밸런스 조정 |
| `refactor/`  | 동작 변화가 없는 코드 구조 정리          |
| `test/`      | 기능 검증, 기기별 테스트, 테스트 코드 추가   |
| `docs/`      | README, 게임 기획안, 회의록, 개발 가이드 |
| `infra/`     | 빌드, 배포, 패키지, 개발 환경 설정       |
| `prototype/` | 정식 반영 전 아이디어나 게임 방식 검증      |

> `Feature/`, `Fix/`, `UI/`처럼 대문자가 포함된 prefix는 사용하지 않는다.

---

## 5. Description 작성 규칙

* 영어 소문자로 작성한다.
* 단어 사이는 하이픈(`-`)으로 구분한다.
* 무엇을 개발하거나 수정하는지 드러나야 한다.
* 지나치게 긴 문장은 피한다.
* `test1`, `final`, `new`, `temp`처럼 의미가 불분명한 이름은 사용하지 않는다.

### 좋은 예시

```text
feature/add-score-system
feature/support-touch-drag
fix/mobile-audio-playback
ui/responsive-game-hud
asset/add-boss-sprites
balance/reduce-enemy-speed
prototype/rhythm-input-system
```

### 나쁜 예시

```text
feature/new
fix/fix-bug
test/test1
final/final-version
ui/change-the-position-of-the-button-on-mobile-screen
```

---

## 6. 기능별 브랜치 예시

### 6.1 게임 기능

```text
feature/player-movement
feature/stage-selection
feature-score-system
feature/pause-menu
feature/save-high-score
feature/sound-settings
```

### 6.2 모바일 및 반응형 기능

```text
feature/mobile-touch-control
ui/responsive-game-canvas
ui/mobile-button-layout
fix/ios-screen-overflow
fix/android-audio-delay
```

### 6.3 그래픽 및 음향 리소스

```text
asset/player-idle-sprite
asset/background-music
asset-stage-one-background
asset/button-icons
```

### 6.4 게임 밸런스

```text
balance/stage-one-difficulty
balance/player-movement-speed
balance/item-spawn-rate
balance-score-multiplier
```

---

## 7. 프로토타입 브랜치 운영

### 7.1 프로토타입의 성격

`prototype/` 브랜치는 새로운 게임 아이디어나 조작 방식을 빠르게 검증하기 위한 임시 브랜치다.

예시는 다음과 같다.

```text
prototype/card-battle-system
prototype/mobile-drag-control
prototype-timing-minigame
prototype-random-map-generation
```

프로토타입에서는 임시 이미지나 간단한 코드를 사용할 수 있지만, `main`에 바로 merge하지 않는다.

### 7.2 프로토타입 종료 후 처리

#### 정식 기능으로 개발할 가치가 있는 경우

1. 테스트 결과와 피드백을 정리한다.
2. 필요한 코드를 정리하거나 새 `feature/` 브랜치로 옮긴다.
3. PR을 생성하여 리뷰받는다.
4. 반영이 끝나면 프로토타입 브랜치를 삭제한다.

#### 사용하지 않기로 한 경우

1. 테스트 결과와 폐기 이유를 문서에 기록한다.
2. 필요한 화면이나 영상이 있다면 별도로 보존한다.
3. PR 없이 브랜치를 삭제한다.

---

## 8. 에셋 관리 규칙

이미지·음원·폰트 등의 파일은 일정한 폴더 구조와 파일명을 사용한다.

### 8.1 권장 구조

```text
src/
  components/
  scenes/
  systems/
  styles/

public/
  assets/
    images/
      backgrounds/
      characters/
      items/
      ui/
    audio/
      bgm/
      sfx/
    fonts/

docs/
  game-design/
  test-results/
  asset-sources/
```

### 8.2 파일명 작성 규칙

* 영어 소문자와 kebab-case를 사용한다.
* 공백, 한글, 특수문자는 피한다.
* `최종`, `진짜최종`, `final2` 등의 이름은 사용하지 않는다.

### 좋은 예시

```text
player-idle-01.png
stage-one-background.webp
button-start-default.png
button-start-pressed.png
enemy-hit.wav
main-theme.mp3
```

### 나쁜 예시

```text
플레이어 최종.png
배경진짜최종2.png
image1.png
새 폴더/button.png
```

### 8.3 에셋 사용 시 확인 사항

* 직접 제작한 리소스인지 확인
* 외부 리소스라면 출처와 라이선스 기록
* 이미지 용량 최적화
* 사용하지 않는 대용량 파일 업로드 금지
* 원본 작업 파일과 실제 게임용 파일 구분
* 음원 자동 재생 제한 등 모바일 브라우저 정책 확인

---

## 9. 커밋 메시지 규칙

본 레포지토리는 Conventional Commits 형식을 기본으로 사용한다.

### 9.1 기본 형식

```text
<type>: <short-summary>
```

또는 작업 범위가 명확한 경우 다음 형식을 사용한다.

```text
<type>(<scope>): <short-summary>
```

> 콜론(`:`) 뒤에는 반드시 한 칸을 띄운다.

### 9.2 Type 표준

| Type        | 의미                  | 대응 브랜치       |
| ----------- | ------------------- | ------------ |
| `feat`      | 새로운 기능 추가           | `feature/`   |
| `fix`       | 버그 수정               | `fix/`       |
| `ui`        | UI 및 반응형 화면 변경      | `ui/`        |
| `asset`     | 이미지, 음원, 폰트 추가·수정   | `asset/`     |
| `balance`   | 게임 난이도 및 수치 조정      | `balance/`   |
| `refactor`  | 기능 변화 없는 코드 정리      | `refactor/`  |
| `test`      | 테스트 및 검증 코드         | `test/`      |
| `docs`      | 문서 수정               | `docs/`      |
| `infra`     | 빌드, 배포, 환경 설정       | `infra/`     |
| `prototype` | 아이디어 검증용 변경         | `prototype/` |
| `chore`     | 의존성, 포맷, 린트 등 기타 정리 | 필요 시         |

### 9.3 Summary 작성 규칙

* 영어 사용을 권장한다.
* 현재형 동사로 시작한다.
* 무엇을 변경했는지 구체적으로 작성한다.
* 72자 이내를 권장한다.
* 문장 끝에 마침표를 붙이지 않는다.

### 좋은 예시

```text
feat: add score and combo system
feat(input): support touch drag controls
fix(audio): prevent duplicate background music
fix(mobile): correct canvas overflow on ios
ui(result): adjust layout for narrow screens
asset(player): add walking animation sprites
balance(stage-one): reduce initial enemy speed
docs: add mobile testing checklist
infra: configure production deployment
```

### 나쁜 예시

```text
update
fix bug
final
temp
수정
feat:add things
```

---

## 10. 커밋 단위 규칙

“한 커밋은 하나의 논리적 변경”을 기본으로 한다.

서로 다른 종류의 변경은 가능한 한 분리한다.

```text
feat: add pause menu
ui: adjust pause menu for mobile screens
asset: add pause and resume icons
docs: document pause controls
```

다음과 같은 변경을 하나의 커밋에 모두 넣지 않는다.

* 게임 기능 추가
* 관련 없는 UI 수정
* 대용량 이미지 추가
* README 수정
* 패키지 업데이트

커밋 전에는 반드시 변경 파일을 확인한다.

```bash
git status
git diff
```

---

## 11. 브랜치 생성·업데이트·PR 가이드

### 11.1 브랜치 생성

```bash
git checkout main
git pull origin main
git checkout -b <prefix>/<short-description>
```

예시:

```bash
git checkout -b feature/mobile-touch-control
```

### 11.2 Commit 및 Push

```bash
git status
git add <변경한 파일>
git commit -m "feat(input): support mobile touch controls"
git push -u origin feature/mobile-touch-control
```

가능하면 습관적으로 `git add -A`를 사용하기보다, 자신이 수정한 파일을 확인한 후 선택적으로 추가한다.

```bash
git add src/input/touch-control.js
git add src/styles/mobile.css
```

> `main` 브랜치에 직접 commit하거나 push하지 않는다.

### 11.3 PR 생성

1. GitHub 레포지토리로 이동한다.
2. `Compare & pull request`를 선택한다.
3. `base`가 `main`인지 확인한다.
4. `compare`가 본인의 작업 브랜치인지 확인한다.
5. PR 제목과 설명을 작성한다.
6. Reviewer 또는 Owner를 지정한다.

### PR 제목 예시

```text
feat(input): support mobile touch controls
fix(mobile): prevent game screen overflow
ui(result): add responsive result screen
asset(audio): add stage clear sound
```

### PR 설명 권장 양식

```markdown
## What changed

- 모바일 터치 이동 기능을 추가했습니다.
- 화면을 누른 상태에서 드래그하면 캐릭터가 이동합니다.

## Why

- 기존 조작 방식이 마우스 입력만 지원하여 모바일에서 플레이할 수 없었습니다.

## How to test

1. `npm install`
2. `npm run dev`
3. 모바일 브라우저 또는 개발자 도구의 모바일 모드로 접속
4. 플레이 화면에서 드래그 조작 확인

## Test environment

- Windows / Chrome
- Android / Chrome
- iPhone / Safari

## Screenshots or video

- PC 화면:
- 모바일 화면:

## Checklist

- [ ] PC에서 정상 작동
- [ ] 모바일에서 정상 작동
- [ ] 화면 크기 변경 시 UI가 깨지지 않음
- [ ] 콘솔 오류가 없음
- [ ] 기존 기능에 영향이 없음
- [ ] 새 에셋의 출처와 라이선스를 기록함
```

---

## 12. PR 승인 및 Merge 정책

* PR은 반드시 Owner 또는 지정된 Reviewer의 승인을 받은 후 merge한다.
* PR 작성자는 본인의 PR을 직접 merge하지 않는다.
* Reviewer는 기능, 화면, 모바일 호환성, 코드 영향 범위를 확인한다.
* 기본 merge 방식은 **Squash merge**를 권장한다.
* 여러 커밋의 의미를 유지해야 하는 경우에만 Rebase merge를 사용한다.
* merge 후 불필요한 작업 브랜치는 삭제한다.

---

## 13. 최신 main 반영 방법

현재 작업 중인 브랜치에 최신 `main`의 변경 사항을 반영하려면 다음 순서로 진행한다.

```bash
git checkout <your-branch>
git fetch origin
git rebase origin/main
```

충돌이 발생하면 충돌한 파일을 수정한 뒤 다음 명령어를 실행한다.

```bash
git add <resolved-file>
git rebase --continue
```

rebase가 끝난 후 이미 원격에 올렸던 브랜치라면 다음과 같이 push한다.

```bash
git push --force-with-lease
```

> `--force`는 사용하지 않는다.
> `--force-with-lease`도 rebase한 본인의 작업 브랜치에서만 사용한다.

rebase가 익숙하지 않거나 공동 작업 중인 브랜치라면 다음 방식도 사용할 수 있다.

```bash
git checkout <your-branch>
git fetch origin
git merge origin/main
git push
```

---

## 14. 코드 리뷰 기준

### 14.1 게임 로직

* 성공·실패 조건이 기획안과 일치하는가?
* 점수 계산이 정확한가?
* 게임 시작, 종료, 재시작이 정상 작동하는가?
* 일시정지 중 게임 시간이 계속 흐르지 않는가?
* 여러 번 클릭했을 때 이벤트가 중복 실행되지 않는가?
* 프레임 속도에 따라 이동 속도가 달라지지 않는가?
* 게임 상태가 예상하지 못한 방식으로 초기화되지 않는가?

### 14.2 모바일 및 반응형 UI

* 작은 모바일 화면에서 UI가 잘리지 않는가?
* 가로 스크롤이 발생하지 않는가?
* 버튼이 손가락으로 누르기 충분한 크기인가?
* PC와 모바일에서 조작 방식이 모두 작동하는가?
* 화면 회전 또는 창 크기 변경 후에도 정상 작동하는가?
* hover에만 의존하는 기능이 없는가?
* 모바일 주소창 크기 변화로 화면이 잘리지 않는가?

### 14.3 성능

* 게임 플레이 중 끊김이나 심한 프레임 저하가 없는가?
* 매 프레임 불필요한 객체를 반복 생성하지 않는가?
* 이미지와 음원 파일의 용량이 과도하지 않은가?
* 사용하지 않는 이벤트 리스너나 타이머가 남아 있지 않은가?
* 화면을 다시 시작했을 때 객체가 중복 생성되지 않는가?
* 애니메이션과 충돌 판정이 지나치게 많은 연산을 요구하지 않는가?

### 14.4 안정성

* 브라우저 콘솔에 오류가 발생하지 않는가?
* 이미지나 음원 로딩 실패 시 게임 전체가 멈추지 않는가?
* 빠르게 여러 번 버튼을 눌러도 오류가 발생하지 않는가?
* 새로고침 후 다시 실행할 수 있는가?
* 저장 데이터가 손상되었을 때 기본값으로 복구되는가?

### 14.5 에셋 및 저작권

* 외부 이미지·음원·폰트의 출처가 기록되어 있는가?
* 상업적·비상업적 이용 조건을 확인했는가?
* 사용하지 않는 파일이 함께 업로드되지 않았는가?
* 파일명이 규칙에 맞는가?
* 이미지 해상도와 용량이 웹 사용에 적절한가?

### 14.6 코드 가독성

* 변수와 함수 이름만으로 역할을 이해할 수 있는가?
* 하나의 함수가 지나치게 많은 역할을 담당하지 않는가?
* 중복된 게임 로직이 존재하지 않는가?
* 사용하지 않는 코드와 주석이 남아 있지 않은가?
* 중요한 수치가 코드 여러 곳에 하드코딩되어 있지 않은가?
* 게임 설정값을 별도로 관리할 수 있는가?

---

## 15. 코드 리뷰 의견 작성 방식

### Major

게임 실행, 데이터 손실, 핵심 로직 오류, 모바일 플레이 불가 등 반드시 수정해야 하는 문제다.

```text
Major: 모바일 환경에서 touchstart와 click 이벤트가 모두 실행되어
게임 시작 함수가 두 번 호출됩니다. 입력 이벤트를 하나로 통합하거나
중복 실행을 방지해야 합니다.
```

```text
Major: 게임 재시작 시 기존 animation frame이 종료되지 않아
게임 루프가 중복 실행됩니다. 재시작 전에 이전 루프를 정리해야 합니다.
```

### Minor

기능은 작동하지만 유지보수성, 사용성, 성능 측면에서 개선이 필요한 문제다.

```text
Minor: 플레이어 이동 속도가 여러 파일에 직접 입력되어 있습니다.
공통 설정 파일에서 관리하면 밸런스 조정이 쉬워집니다.
```

### Nit

동작에는 영향을 주지 않는 사소한 스타일이나 명명 제안이다.

```text
nit: 변수명 `v`는 의미가 불분명하므로
`playerVelocity`로 변경하면 이해하기 쉬울 것 같습니다.
```

---

## 16. 테스트 체크리스트

PR 생성 전 최소한 다음 항목을 확인한다.

### 공통

* [ ] 게임이 정상적으로 시작됨
* [ ] 게임 방법을 확인할 수 있음
* [ ] 조작이 정상적으로 작동함
* [ ] 점수 또는 진행 상황이 정상적으로 표시됨
* [ ] 성공·실패 조건이 정상적으로 작동함
* [ ] 게임 종료 후 재시작할 수 있음
* [ ] 메인 화면으로 돌아갈 수 있음
* [ ] 콘솔에 치명적인 오류가 없음

### PC

* [ ] 마우스 조작 정상 작동
* [ ] 키보드 조작 정상 작동
* [ ] 창 크기 변경 시 화면이 깨지지 않음
* [ ] Chrome 또는 Edge에서 정상 작동

### 모바일

* [ ] 터치 조작 정상 작동
* [ ] 버튼과 글자가 잘 보임
* [ ] 화면 밖으로 UI가 잘리지 않음
* [ ] 불필요한 가로 스크롤이 없음
* [ ] Android Chrome에서 정상 작동
* [ ] iOS Safari에서 정상 작동
* [ ] 화면 방향 전환 시 치명적인 오류가 없음

### 배포

* [ ] 배포 링크에서 정상 실행됨
* [ ] 이미지와 음원이 정상적으로 로딩됨
* [ ] 파일 경로의 대소문자 문제가 없음
* [ ] 새로고침 후에도 정상 실행됨
* [ ] 개발 환경에서만 작동하는 경로가 남아 있지 않음

---

## 17. 팀 공통 완료 기준

하나의 기능은 다음 조건을 모두 만족했을 때 완료된 것으로 본다.

1. 기획안에 정의된 기능이 구현되었다.
2. PC와 모바일에서 기본 동작을 확인했다.
3. 반응형 화면에서 UI가 잘리지 않는다.
4. 콘솔에 치명적인 오류가 없다.
5. 사용한 에셋의 출처와 라이선스가 정리되어 있다.
6. 실행 및 테스트 방법이 PR에 작성되어 있다.
7. Reviewer 또는 Owner의 승인을 받았다.
8. `main`에 merge된 이후 배포 환경에서도 정상 작동한다.

---

## 18. 금지 사항

* `main` 브랜치에서 직접 작업하거나 push하는 행위
* `update`, `temp`, `final`처럼 의미 없는 커밋 메시지 사용
* 출처가 불분명한 이미지·음원·폰트 사용
* 테스트하지 않은 기능을 바로 `main`에 반영
* 다른 팀원의 코드를 확인 없이 삭제
* 개인 컴퓨터에서만 작동하는 절대경로 사용
* 비밀번호, API Key 등 민감한 정보를 코드에 업로드
* `node_modules`, 빌드 캐시 등 불필요한 대용량 파일 업로드
* 사전 협의 없는 라이브러리 또는 프레임워크 변경
* 리뷰 없이 본인의 PR을 직접 merge하는 행위
* 일반적인 `git push --force` 사용
