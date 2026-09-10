# ai-change 실행 및 조작 방법

## 1. 현재 구현 상태

이 문서는 `contentVersion=1` 통합 개발본 기준입니다. 공통 화면, 학과 데이터, 맵·대화 연결과 기능 브랜치에서 합쳐진 미니게임을 확인할 수 있습니다. DS·CS·CSE·AI·AIDS 5종은 모두 MVP이며 최종 밸런스·점수·기록 정책은 아직 확정되지 않았습니다.

현재 Story 맵은 자유 이동 구현 전이므로 학과 카드를 클릭·터치하거나 키보드로 선택합니다. 카드를 선택하면 해당 학과 미니게임이 바로 시작됩니다. 사후게임은 `stat-boss`, `data-sphinx`, `control-boss`, `xr-egg-trials` 4종이 published 상태이며, 서로 다른 학과 미니게임 5종을 모두 완료하면 배틀 메뉴에서 실행할 수 있습니다. 교체된 전역 prototype과 개발 harness는 production `dist/`에 포함하지 않습니다.

학과 표기는 다음 코드를 공통으로 사용합니다.

| 코드 | 학과·전공 | 짧은 이름 |
| --- | --- | --- |
| `AI` | 인공지능학부 | 인공지능 |
| `DS` | 데이터사이언스전공 | 데이터사이언스 |
| `CSE` | 컴퓨터공학과 | 컴공 |
| `CS` | 사이버보안학과 | 사이버보안 |
| `AIDS` | 인공지능데이터사이언스학부 | 인데부 |

## 2. 로컬 실행

게스트 흐름은 별도 backend 설치가 필요 없는 정적 웹게임으로 실행할 수 있습니다. Node.js 22 이상과 저장소에 포함된 개발 서버를 사용합니다. `fetch()`로 JSON을 읽으므로 `index.html`을 파일 탐색기에서 직접 열지 말고 반드시 로컬 HTTP 서버를 사용합니다. Google 로그인·D1을 로컬에서 확인할 때는 README의 `cf:full:dev` 절차를 사용합니다.

PowerShell에서 프로젝트 루트로 이동한 뒤 다음 명령을 실행합니다.

```powershell
cd C:\Users\yoons\project\ewha-ai\ai-change
npm run dev
```

기본 주소는 다음과 같습니다.

```text
http://127.0.0.1:4173/
```

운영 기능 확인은 canonical 통합 Worker인 `https://ai-change.ai-change-backend.workers.dev`에서 수행합니다. 기존 `ai-change.pages.dev` 프로젝트는 폐기했으므로 사용하지 않습니다. Google 로그인 테스트 전에는 계정 ID·이메일·표시 이름이 D1에 저장되고 표시 이름과 게임 기록이 공개 랭킹에 노출된다는 점을 참가자에게 먼저 고지합니다.

환경 변수 `PORT`가 이미 설정된 경우에는 개발 서버가 출력한 주소를 사용합니다. 서버는 실행 중인 PowerShell에서 `Ctrl+C`를 눌러 종료합니다.

구조와 데이터까지 한 번에 검증하려면 다음 명령을 실행합니다.

```powershell
npm run check
```

## 3. 권장 실행 환경

- 최신 Chrome 또는 Safari의 PC·모바일 환경
- JavaScript 활성화
- UTF-8과 SVG를 정상 제공하는 정적 HTTP 서버
- 모바일에서는 터치 조작이 가능한 실제 기기 또는 브라우저 기기 모드

화면이 이전 상태로 보이거나 콘텐츠 버전 오류가 표시되면 강력 새로고침 후 다시 확인합니다.

## 4. 기본 진행

```text
로딩
  → 메인 메뉴
  → 스토리 시작
  → 인트로
  → 학과별 미니게임 맵
  → 학과 카드 선택 및 즉시 실행
  → 결과 확인
  → 맵 복귀
```

Battle 메뉴는 `features.battleContent=true`와 `data/battles.json`의 published 콘텐츠 4종을 사용합니다. 해금 판정은 로컬 완료 기록과 로그인 session의 `completedGameIds`를 합쳐 서로 다른 필수 5종을 모두 완료했는지 확인하며, 누적 클리어 횟수만으로는 열리지 않습니다.

## 5. 공통 조작

| 상황 | PC | 모바일 |
| --- | --- | --- |
| 학과 미니게임 선택(현재) | `Tab`으로 이동 후 `Enter`·`Space`, 또는 클릭 | 학과 카드 터치 |
| 맵 이동(후속 구현) | 방향키 또는 `WASD` | 화면 가상 방향 패드 |
| 메뉴·버튼 선택 | 마우스 클릭, 키보드 포커스 후 `Enter` | 버튼 터치 |
| `stat-boss` 이동 | 방향키 또는 `W`·`A`·`S`·`D` | 왼쪽 조이스틱 |
| `stat-boss` 경직 중 반격 | `Space` | 오른쪽 공격 버튼 |
| `data-sphinx` O/X 선택 | 방향키 또는 `W`·`A`·`S`·`D`로 영역 이동 | 가상 조이스틱으로 영역 이동 |
| `control-boss` 이동·공격 | 방향키 또는 `W`·`A`·`S`·`D`, `Space` | 가상 조이스틱, 공격 버튼 |
| `xr-egg-trials` | 선택 버튼 또는 `Tab`·`Enter`; 연타는 `Space`도 가능 | 화면의 카드·선택·연타 버튼 터치 |
| 일시정지 | `Escape` 또는 `P` | 일시정지 버튼 터치 |

설정, 일시정지 또는 결과 화면이 열려 있을 때는 뒤쪽 맵·게임 입력이 차단됩니다.

## 6. 미니게임별 조작

설정 파일의 `implementationStatus`는 실제 통합 수준에 따라 `MVP`, `PROTOTYPE`, `SCAFFOLD`로 구분합니다. 아래 조작 계약은 유지하되 `data/drafts/`의 미확정 규칙과 밸런스는 후속 결정에 따라 바뀔 수 있습니다.

| 코드 | 미니게임 | 상태 | PC | 모바일 |
| --- | --- | --- | --- | --- |
| `DS` | 숫자 야구 | MVP | 숫자 키·화면 키패드 입력, `Backspace` 삭제, `Enter` 제출 | 화면 키패드, 지우기·제출 버튼 |
| `CS` | CLICK to PURIFY · 22 wave | MVP | 설명창의 `✕` → `START` 후 `Space` 또는 `CLICK` 버튼으로 정화 | 설명창의 `✕` → `START` 후 `CLICK` 버튼 터치 |
| `CSE` | Code Heart: Unlock! | MVP | 마우스로 재료·초기화·제출 선택 | 해당 버튼 터치 |
| `AI` | AI Ball Classification · 목표 5/방해 25 | MVP | `게임 시작`과 3초 확인 후 `Space` 또는 `OPEN·CLOSE` 버튼으로 분류통 뚜껑 전환 | `게임 시작`과 3초 확인 후 `OPEN·CLOSE` 버튼 터치 |
| `AIDS` | 인지알·데사알 분류 게임 | MVP | 방향키 또는 `A`·`D`로 발판 조작 | 왼쪽·오른쪽 버튼 터치 |

모바일에서는 AI `480×640`, CSE `440×920`, AIDS `390×740` 원본 세로 프레임을 유지해 비례 축소합니다. 데스크톱에서는 AI의 HUD·Canvas·조작부를 가로 프레임으로, CSE의 손님·작업대·재료 카드를 2열로, DS의 입력·기록 영역을 2열로 재배치합니다. CS의 `480×480` Canvas와 `300px` 조작 패널은 같은 비율로 최대 `720px`·`450px`까지 커지고, 공간이 부족하면 원래 prototype처럼 위아래로 줄바꿈됩니다. AIDS는 넓어진 필드 폭에 따라 발판의 보이는 길이, 공의 착지·굴림 경계, 수평 속도·가속도를 같은 비율로 계산하며 실행 중 resize에서도 진행 중인 공의 target을 유지합니다.

## 7. 로컬 데이터

- 현재 저장 namespace는 `ai-change:production`이며 save schema key는 `ai-change:production:save:v1`입니다.
- 현재 key가 비어 있고 같은 origin에 기존 `ai-change:development:save:v1` 기록이 있으면 최초 로드에서 production key로 한 번 복사하며, legacy 기록은 삭제하지 않습니다.
- 브라우저 저장소를 삭제하면 로컬 진행과 설정이 초기화될 수 있습니다.
- 계정, 개인정보, 서버 점수는 브라우저 저장소에 저장하지 않고 로그인한 운영 Worker/D1에서 관리합니다.
- 로그인 session이 반환한 `completedGameIds`는 로컬 완료 기록과 합쳐 배틀 해금에 사용합니다.

## 8. 문제 해결

| 증상 | 확인 사항 |
| --- | --- |
| 빈 화면 또는 JSON 요청 오류 | `file://`이 아닌 `npm run dev`가 출력한 HTTP 주소로 접속했는지 확인 |
| 이미지·JSON 404 | 프로젝트 루트에서 서버를 실행했는지 확인 |
| 콘텐츠 버전 불일치 | 강력 새로고침 후 HTML·app config·manifest가 모두 version 1인지 확인 |
| 키 입력이 동작하지 않음 | 대화·설정·결과 modal을 먼저 닫고 게임 영역에 focus |
| 모바일 버튼이 보이지 않음 | 브라우저 기기 모드 또는 실제 터치 기기에서 다시 확인 |
| Battle 카드가 `LOCKED`로 표시됨 | 로컬 기록과 로그인 계정 기록을 합쳐 서로 다른 필수 미니게임 5종을 모두 완료했는지 확인 |
| 예전 Pages 주소가 열리지 않음 | 해당 프로젝트는 폐기했으므로 canonical 통합 Worker 주소로 다시 접속 |
