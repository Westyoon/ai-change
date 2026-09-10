# ai-change MVP 개발 계획서

> - 문서 상태: 구현 전 통합 개발 계획서
> - 작성 기준일: 2026년 8월 16일
> - 프로젝트 슬러그: `ai-change`
> - 형식 참조: 요청 시 지정된 `MAEARI_PLAN.md` 양식
> - 내용 기준 문서: `docs/기획안.md`, `docs/기능명세서.md`

## 0. 문서 목적

이 문서는 인공지능대학 축제 홍보 웹게임 **ai-change**의 기획과 5개 미니게임 명세를 실제 개발 가능한 단위로 연결한 MVP 계획서입니다.

게임의 목표, MVP 범위, 기술 구조, scene 전환, 공통 input과 mini game contract, 데이터와 저장 구조, 각 미니게임의 구현 기준, 반응형·접근성·배포·검증 순서를 한 문서에서 관리합니다.

> 핵심 문장: **축제 맵을 탐색하고, 학과를 만나고, 직접 플레이하며 인공지능대학을 경험합니다.**

이 문서는 아직 구현되지 않은 기능을 완료된 것으로 기록하지 않습니다. 구현이 시작된 뒤에는 실제 코드와 검증 결과만 날짜별 반영 이력으로 추가합니다.

## 0.1 최종 반영 사항

현재 기획안과 기능 명세를 통합해 다음 기준을 반영합니다.

- 영문 프로젝트 및 파일 기준 이름을 `ai-change`로 통일합니다.
- 최종 노출 게임명과 로고는 확정 전까지 `TBD`로 유지합니다.
- 설치 없이 정적 배포 URL로 실행되는 HTML5·CSS3·JavaScript 웹게임으로 개발합니다.
- Canvas 기반 도트 맵·게임 영역과 DOM 기반 메뉴·대화·HUD를 함께 사용합니다.
- PC, 태블릿, 모바일의 키보드·마우스·터치·가상 패드 입력을 공통 명령으로 변환합니다.
- 기본 콘텐츠는 `스토리` 모드이며, `배틀` 모드는 메뉴와 확장 지점만 제공하고 1차 배포에서는 `추후 공개`로 표시할 수 있습니다.
- 2026-08-28 사용자 결정에 따라 기본 진입 흐름은 `인트로 → 학과별 맵 → 학과 카드 선택 → 미니게임 즉시 실행 → 결과 → 맵 복귀`로 적용합니다. NPC 대화와 미니게임 인트로 route·데이터는 선택형 콘텐츠 확장을 위해 유지합니다.
- 대화, 맵, NPC, 미니게임 metadata, balance parameter는 코드와 분리된 데이터로 관리합니다.
- 5개 미니게임은 서로 독립된 module로 구현하고 `init`, `start`, `pause`, `resume`, `restart`, `destroy` lifecycle과 host가 주입하는 `onComplete` result callback contract를 공유합니다.
- 미니게임 결과는 공통 result object로 상위 scene에 반환하고, 게임별 세부 기록은 `metrics`에 저장합니다.
- 완료한 NPC·미니게임, 최고 기록, 음량 설정은 browser `localStorage`에 version을 포함해 저장합니다.
- 공통 필수 asset은 초기 로딩하고, 미니게임별 asset은 해당 게임 진입 전에 지연 로딩합니다.
- resize와 orientation change는 진행 상태를 초기화하지 않고 Canvas와 DOM UI만 다시 배치합니다.
- 화면 전환·대화·제출·판정 과정의 중복 입력을 차단하고, page가 비활성화되면 진행 중인 게임을 자동 pause합니다.
- 색상 외에 icon·text를 함께 사용하고, 무음 상태에서도 필수 판정 정보를 확인할 수 있게 합니다.
- 외부 asset은 실제 파일명, resource 종류, 제작자·제공처, 원본 URL, license, 수정 여부, 사용 위치를 기록합니다.

## 0.2 문서 통합 기준과 미확정 사항

### 0.2.1 Source of truth

문서 간 책임은 다음 순서로 적용합니다.

1. 전체 사용자 흐름, 화면, 반응형, 배포 방식은 `기획안.md`를 기준으로 합니다.
2. 각 미니게임의 규칙, 고유 명칭, parameter, 성공·실패 조건은 `기능명세서.md`를 기준으로 합니다.
3. 두 문서에 없는 module contract, result schema, scene state, 저장 key, error handling은 이 PLAN의 구현 기준을 따릅니다.
4. 원문에서 `TBD`, `[작성 필요]`, `별도 정의 필요`인 내용은 이 문서에서도 임의로 확정하지 않습니다.
5. 서로 충돌하는 요구사항은 아래 decision item이 승인된 뒤 final rule로 승격합니다.

이 문서에서는 항목의 상태를 다음과 같이 구분합니다.

| 상태 | 의미 |
| --- | --- |
| 확정 | 두 기준 문서에서 일치하거나 명시적으로 정해진 요구사항 |
| 구현 기준 | 통합 개발을 위해 이 PLAN에서 정한 technical contract |
| 초안 | 원문에 수치가 있으나 playtest 후 조정 가능한 값 |
| `TBD` | 기획·아트·운영 판단이 필요해 아직 확정할 수 없는 값 |

### 0.2.2 착수 전·구현 중 결정 항목

| ID | 결정 항목 | 현재 상태 | 확정 시점 |
| --- | --- | --- | --- |
| D-01 | 최종 노출 게임명, logo, festival name, 공통 brand palette | `TBD` | 공통 UI final asset 작업 전 |
| D-02 | 메인 세계관, player character, map 크기·구역, NPC 수·위치·대사, NPC↔game 연결 cardinality와 완료 조건, story intro skip의 `introSeen` 처리, `캐릭캐릭체인지`·X알·X컴공생 설정의 전역 적용 여부 | `TBD` | map·story content 통합 전 |
| D-03 | `하트`, `정화된 알`, `수호알`을 공통 보상으로 통합할지 여부 | `TBD` | result·save schema final 고정 전 |
| D-04 | `CLICK to PURIFY`의 정화도 공식과 wave·판정 window·Miss·제한시간 등 초안 balance 승인값, 최고 기록 eligible status·metric projection·comparator·tie-break | `TBD` | cyber game final 판정 구현 전 |
| D-05 | cyber game의 동시 target 선택, ransomware lock 중 다른 적 처리, 재도전 penalty | `TBD` | cyber game playtest 전 |
| D-06 | `Code Heart: Unlock!`의 주문·시간·penalty·clear·retry, 제출 label, category·ingredient 목록, 주문별 중복 재료 허용, 빈 slot 제출, Build Error 후 reset, recipe book 중 timer, 최고 기록 eligible status·metric projection·comparator·tie-break | `TBD` | computer game play 가능한 build 전 |
| D-07 | `AI Ball Classification Game`의 최초 뚜껑 상태, 속도·간격·공 겹침, 개폐 중 입력, 제한시간, image 목록과 통합 clear 시점 변경 여부, 최고 기록 eligible status·metric projection·comparator·tie-break | `TBD` | AI game balance 적용 전 |
| D-08 | 숫자 야구의 선행 0, 삭제 방식, 제한시간, 재도전 규칙, 입력 오류 문구·시각 feedback, 최고 기록 eligible status·metric projection·comparator·tie-break | `TBD` | data science game UI 확정 전 |
| D-09 | 인지알·데사알의 생성 확률, 낙하 속도, spawn 구간 경계, 발판·box 충돌 계산, timer·life 동시 종료 우선순위, timer clear 뒤 active egg 정리 연출, 재도전 규칙, 최고 기록 eligible status·metric projection·comparator·tie-break | `TBD` | AI·data science game balance 적용 전 |
| D-10 | 최종 BGM·SFX, volume default, art asset | `TBD` | final QA 전 |
| D-11 | browser별 최소 지원 version, 기준 test device, 성능·loading·leak 합격 수치 | `TBD` | Step 1 종료 전 |
| D-12 | 팀 일정, 담당자, 배포 host와 public URL | `TBD` | 배포 작업 전 |

`D-01`, `D-02`, `D-10`, `D-12`가 미정이어도 공통 engine과 game logic 개발은 진행할 수 있습니다. 반면 `D-04`~`D-09`는 해당 미니게임의 최종 완료 판정 전에 반드시 결정해야 합니다.

## 0.3 구현 원칙

실제 구현 단계에서는 아래 원칙을 적용합니다.

```txt
1. 배포 산출물은 정적 HTML, CSS, JavaScript, JSON, asset만으로 실행합니다.
2. dialogue, map, NPC, recipe, balance 값을 game logic에 하드코딩하지 않습니다.
3. 다섯 미니게임은 서로의 내부 state나 DOM을 직접 참조하지 않습니다.
4. 모든 미니게임은 공통 lifecycle과 result contract를 지킵니다.
5. keyboard, mouse, touch 입력은 InputManager에서 공통 action으로 정규화합니다.
6. game world 계산은 viewport pixel이 아닌 기준 좌표계를 사용합니다.
7. timer와 timing 판정은 performance.now() 기반 game clock을 사용하고 pause 시간을 제외합니다.
8. scene이나 mini game 종료 시 event listener, timer, animation frame, audio를 반드시 정리합니다.
9. 미확정 parameter는 임의의 final 값으로 문서화하지 않고 배포 대상 밖의 draft config에서 TBD 상태로 관리합니다.
10. 임시 geometry나 placeholder asset은 final asset과 구분하고 최종 제출 전에 교체 여부를 검증합니다.
11. localStorage data는 version과 schema를 검증하고 손상 시 안전한 기본 상태로 복구합니다.
12. 외부 resource는 사용 전에 license를 확인하고 출처 문서에 기록합니다.
13. 색상·소리만으로 정답, 실패, 완료 상태를 전달하지 않습니다.
14. 구현 완료 표시는 code, automated check, browser QA 중 해당 검증 근거가 있을 때만 추가합니다.
```

---

## 1. 게임 개요

### 1.1 프로젝트명

- 프로젝트 슬러그 및 repository 기준명: **`ai-change`**
- 최종 사용자 노출 게임명: **`TBD`**
- 개발 문서명: `AI_CHANGE_PLAN.md`

### 1.2 게임 한 줄 설명

도트 그래픽으로 구현된 인공지능대학 축제 맵을 탐색하고, 학과별 NPC와 대화한 뒤 5개의 전공 테마 미니게임을 즐기는 반응형 웹게임입니다.

### 1.3 프로젝트 목표

ai-change는 단순한 학과 소개 page가 아니라 사용자가 직접 움직이고 선택하고 플레이하는 홍보 경험을 제공합니다.

구체적인 목표는 다음과 같습니다.

- 축제와 인공지능대학 소속 학과·전공의 특징을 짧은 play로 자연스럽게 전달합니다.
- NPC 대화와 게임 규칙을 통해 각 전공의 핵심 이미지를 기억하게 합니다.
- URL 접속만으로 여러 기기에서 즉시 실행할 수 있게 합니다.
- festival 이후에도 story, NPC, mini game, battle content를 등록 방식으로 확장할 수 있게 합니다.
- 전공 지식이 없는 사용자도 안내와 즉각적인 feedback만으로 게임을 완료할 수 있게 합니다.

### 1.4 목표 사용자

- 인공지능대학 축제에 참여하는 재학생
- 인공지능대학과 소속 학과·전공에 관심이 있는 학생
- 축제 online 홍보물이나 공유 URL로 처음 유입되는 사용자
- keyboard보다 touch input에 익숙한 mobile 사용자

### 1.5 MVP 핵심 가치

> 둘러보고, 말을 걸고, 직접 해보는 짧은 경험 안에서 다섯 전공의 개성을 구분할 수 있어야 합니다.

---

## 2. 제품 철학

## 2.1 읽는 홍보에서 플레이하는 홍보로

ai-change의 중심은 정보량이 아니라 참여 경험입니다. 사용자가 map을 탐색하고 NPC를 발견한 뒤 game을 완료하는 과정 자체가 학과 홍보가 되도록 구성합니다.

긴 설명문보다 다음 요소를 우선합니다.

- 짧고 명확한 NPC 대화
- 한 화면에서 이해할 수 있는 목표와 조작
- 입력 직후 확인 가능한 시각 feedback
- 1회 play만으로 구분되는 학과별 mechanic

## 2.2 전공 특성을 mechanic으로 표현

각 게임은 단순히 학과 이름만 바꾸지 않고 전공 이미지를 핵심 행동에 반영합니다.

| 학과·전공 | 미니게임 | 전공 표현 방식 |
| --- | --- | --- |
| 데이터사이언스전공 | 숫자 야구 | 누적 기록을 분석해 정답을 추론하고 Fit·Shift·Outlier로 판정 |
| 사이버보안학과 | CLICK to PURIFY | 악성코드 유형을 구분하고 정확한 timing으로 core를 방어 |
| 컴퓨터공학과 | Code Heart: Unlock! | 개발 요소를 올바른 순서로 조합하고 build 결과를 확인 |
| 인공지능학부 | AI Ball Classification Game | 목표 image와 같은 공만 선택적으로 분류 |
| 인공지능데이터사이언스학부 | 인지알·데사알 분류 게임 | 낙하 object를 판별해 올바른 class로 분류 |

## 2.3 쉬운 진입과 공정한 조작

사용자는 PC 또는 mobile 중 어느 환경에서도 같은 규칙으로 play할 수 있어야 합니다. 기기별 input은 다른 game logic을 실행하지 않고 공통 action으로 변환합니다.

미니게임 시작 전에는 목표, 성공·실패 조건, PC·mobile 조작을 항상 안내합니다. timing game은 rendering frame이 아니라 monotonic game clock으로 판정해 기기별 차이를 줄입니다.

## 2.4 콘텐츠와 engine의 분리

story 문구, NPC, map, game metadata와 balance parameter는 data file로 관리합니다. 새 script나 game을 추가할 때 공통 menu와 map engine을 크게 수정하지 않는 구조를 우선합니다.

## 2.5 미확정 내용을 숨기지 않는 개발

최종 세계관, 보상 체계, 일부 balance 수치는 아직 결정되지 않았습니다. 개발 편의를 위해 임시 값을 넣을 수는 있지만, 이를 기획 확정값이나 final 완료 상태로 취급하지 않습니다.

---

## 3. MVP 범위

## 3.1 MVP에서 반드시 구현할 기능

| 영역 | 기능 | 설명 |
| --- | --- | --- |
| 진입 | Loading | 공통 필수 asset 진행률, 실패 안내, retry 제공 |
| Menu | Story·Battle 분리 | `스토리`, `배틀`, `게임 방법`, `설정`을 분리해 표시 |
| Story | Story intro | 화자, 대사, portrait, 이전·다음·skip 지원 |
| Map | Dot map 탐색 | player 이동, map 경계와 obstacle collision 처리 |
| NPC | 느낌표와 상호작용 | 범위 진입 강조, click·touch·key 상호작용, 완료 상태 표시 |
| Dialogue | Data 기반 script | 최초·재방문, intro·outro, 종료 action을 data로 제어 |
| Mini game | 공통 intro | 학과명, game명, 목표, 성공·실패 조건, 기기별 조작 안내 |
| Mini game | Module registry | metadata·config와 static loader key를 등록해 기존 core·game을 수정하지 않고 신규 game을 연결하는 구조 |
| Mini game | Common contract | `init/start/pause/resume/restart/destroy` lifecycle과 host 주입 `onComplete` callback 지원 |
| 데이터사이언스 | 숫자 야구 | 3자리 추론, 9 Epoch, Fit·Shift·Outlier, 기록 누적 |
| 사이버보안 | CLICK to PURIFY | 초안 14 wave, 4종 malware, timing 판정, purification·Miss 관리 |
| 컴퓨터공학 | Code Heart: Unlock! | 주문·recipe, 4개 slot, 순서 비교, Build Error·성공 처리 |
| 인공지능 | AI Ball Classification | 정답 5·오답 25, OPEN/CLOSE, 즉시 실패 조건 처리 |
| 인공지능데이터사이언스 | 인지알·데사알 분류 | 45초, life 5, 좌우 발판, 단계별 spawn interval 처리 |
| Result | 결과·outro | clear·fail, game별 metrics, retry, map 복귀 제공 |
| Input | 반응형 입력 | keyboard, mouse, touch, virtual pad를 공통 action으로 변환 |
| Responsive | Resize·orientation | play state를 유지하면서 Canvas와 UI 재배치 |
| Help | 실행·조작 방법 | PC와 mobile 조작, game별 rule을 언제든 확인 가능 |
| Extension | Battle 확장 지점 | 1차에는 Coming Soon을 허용하되 별도 registry seam 제공 |

## 3.2 원문 권장·현재 PLAN 포함 기능

| 기능 | 설명 | 축소 시 영향 |
| --- | --- | --- |
| 진행 상태 저장 | 완료 NPC·game, 최고 기록, 설정을 `localStorage`에 저장 | 새로고침 시 진행과 설정이 초기화됨 |
| 음량 설정 | BGM·SFX volume 또는 mute 제공 | browser autoplay 대응과 사용자 선택권이 약해짐 |
| Error recovery | loading·runtime error에서 retry 또는 menu 복귀 | 단일 asset 오류가 전체 play 중단으로 이어질 수 있음 |
| 진행 HUD | map에서 학과별 완료 여부 표시 | 남은 content를 파악하기 어려움 |
| 결과 상세 | game별 핵심 metrics 표시 | retry 동기와 기록성이 낮아짐 |

기획안에서는 위 항목을 권장으로 분류하지만, 이 PLAN은 모두 1차 배포 목표에 포함합니다. 일정 때문에 제외할 때는 scope 변경과 checklist의 승인된 `N/A` 사유를 기록하며, 필수 game flow의 안정성을 해치면 optional UI부터 축소합니다.

## 3.3 MVP에서 제외하거나 후순위로 둘 기능

| 기능 | 후순위 이유 |
| --- | --- |
| 실제 Battle content | 구체적인 game 방식이 아직 `TBD`이며 1차에는 menu와 확장 지점만 필요 |
| Login·account | 기획상 browser local play로 충분하며 server 요구가 정의되지 않음 |
| Cloud save·기기 간 sync | backend, identity, privacy 정책이 추가로 필요 |
| Online ranking·competition | score normalization, abuse 방지, 운영 server가 필요 |
| 공통 reward economy | 하트·정화된 알·수호알의 관계가 확정되지 않음 |
| 분기형 장편 story | 1차에는 순차 대화와 최초·재방문 구분을 우선 |
| 다국어 | 번역 범위와 언어가 정해지지 않음 |
| Service worker·offline install | cache version 관리와 update UX가 별도로 필요 |
| Analytics·개인 식별 tracking | 수집 목적, consent, privacy 기준이 정의되지 않음 |

## 3.4 MVP 완료 범위

1차 배포 완료는 단순히 각 game 화면이 열리는 상태를 의미하지 않습니다. 다음 end-to-end flow가 PC와 mobile에서 끊김 없이 실행되어야 합니다.

```txt
Loading
  -> Main Menu
  -> Story Intro
  -> Map Explore
  -> NPC Interaction
  -> Mini Game Intro
  -> Mini Game Play
  -> Result / Outro Overlay
  -> Map Restore
```

5개 mini game 모두 위 흐름에 연결되고, game 종료 후 input·timer·animation이 정리되며, 다시 map으로 돌아왔을 때 player와 진행 상태가 유지되어야 합니다.

---

## 4. 기술 스택

## 4.1 기본 요구 스택

| 영역 | 기술 |
| --- | --- |
| Markup | HTML5 |
| Style | CSS3, CSS custom properties, responsive media query, safe-area inset |
| Application | Vanilla JavaScript ES Modules |
| Game rendering | HTML Canvas 2D |
| Menu·Dialogue·HUD | DOM UI |
| Animation loop | `requestAnimationFrame` |
| Time source | `performance.now()` 기반 game clock |
| Data | Static JSON |
| Local persistence | browser `localStorage` |
| Audio | HTMLAudioElement 또는 Web Audio API wrapper |
| Visibility | Page Visibility API |
| Delivery | Static web hosting over HTTPS |
| Target browser | Chrome·Safari의 PC·mobile 환경 |

`Unity`, `Unreal`, `React`, `Spring`, `Python`, `C++`, `C#`, `Java`, `PyTorch`, `MySQL`, `FastAPI` 등은 `Code Heart: Unlock!` 안의 recipe 재료입니다. ai-change의 구현 stack으로 사용한다는 뜻이 아닙니다.

## 4.2 스택 선택 이유

### HTML·CSS·JavaScript

- 별도 설치나 runtime server 없이 URL로 실행할 수 있습니다.
- source 기획의 정적 배포 조건을 그대로 만족합니다.
- framework lifecycle에 종속되지 않고 mini game별 resource 정리를 명시적으로 관리할 수 있습니다.

### Canvas 2D

- dot map, sprite, 이동, timing object처럼 frame 단위 rendering이 필요한 영역에 적합합니다.
- 기준 좌표계를 사용해 viewport 변화와 game physics를 분리할 수 있습니다.
- pixel art에 `image-rendering: pixelated`와 integer scale을 적용하기 쉽습니다.

### DOM UI 병행

- menu, dialogue, setting, button, help, result처럼 접근 가능한 interaction은 semantic HTML로 구현할 수 있습니다.
- text readability, keyboard focus, screen size별 재배치에 유리합니다.
- game별 Canvas 위에 공통 pause·mute·error overlay를 일관되게 표시할 수 있습니다.

### Static JSON

- dialogue와 content 수정이 logic 수정으로 번지지 않습니다.
- map, NPC, registry, recipe, balance를 각각 검증할 수 있습니다.
- 이후 CMS나 backend를 도입하더라도 동일한 schema를 유지할 수 있습니다.

### localStorage

- account 없이 현재 browser에 진행과 설정을 가볍게 저장할 수 있습니다.
- network 장애와 무관하게 동작합니다.
- 다른 기기, private browsing, browser data 삭제 시 유지되지 않는 한계를 UI에서 안내해야 합니다.

---

## 5. 전체 아키텍처

## 5.1 정적 배포 구조

MVP는 backend와 database 없이 browser 안에서 실행합니다.

```txt
User Browser
  |
  | HTTPS GET
  v
Static Host / CDN
  ├── index.html
  ├── css/*.css
  ├── js/*.js
  ├── data/*.json
  └── assets/*

Browser Runtime
  ├── App / Scene Router
  ├── Canvas Renderer
  ├── DOM UI Layer
  ├── Input / Resize / Audio / Asset Manager
  ├── Dialogue / Map / Mini Game Modules
  └── localStorage Save Data
```

개인정보, account, server score, network match는 MVP에 포함하지 않습니다. 배포 host는 정적 file과 HTTPS를 제공하면 되며 특정 vendor로 고정하지 않습니다.

## 5.2 Runtime layer

```txt
AppShell
├── SceneRouter
│   ├── LoadingScene
│   ├── MainMenuScene
│   ├── HowToScene
│   ├── SettingsScene
│   ├── StoryIntroScene
│   ├── MapScene
│   ├── DialogueScene
│   ├── MiniGameIntroScene
│   ├── MiniGameScene
│   ├── BattleComingSoonScene
│   └── ErrorScene
├── Core Services
│   ├── GameLoop
│   ├── InputManager
│   ├── ResizeManager
│   ├── AssetLoader
│   ├── AudioManager
│   ├── SaveManager
│   ├── RecordPolicies
│   └── EventBus
├── UI Components
│   └── ResultOverlay
├── Content
│   ├── Map / NPC
│   ├── Dialogue
│   ├── MiniGame Registry
│   └── Battle Registry
└── Mini Games
    ├── Number Baseball
    ├── CLICK to PURIFY
    ├── Code Heart: Unlock!
    ├── AI Ball Classification
    └── AI·Data Egg Sort
```

## 5.3 Scene 전환 흐름

```mermaid
flowchart TD
    A[Loading] --> B[Main Menu]
    B --> C[Story]
    B --> D[Battle]
    B --> E[How To / Settings]
    C --> F[Story Intro]
    F --> G[Map Explore]
    G --> H[NPC Dialogue]
    H --> I[Mini Game Intro]
    I --> J[Mini Game Play]
    I --> G
    J --> K[Result / Outro Overlay]
    K --> J
    K --> G
    D --> L[Coming Soon or Registered Battle]
    A --> M[Load Error]
    J --> N[Recoverable Error]
    M --> A
    N --> B
```

### Story mode 흐름

```txt
스토리 버튼
  -> main intro script load
  -> intro 완료 또는 skip
  -> saved map position 또는 start position 복원
  -> NPC interaction range 확인
  -> NPC dialogue 실행
  -> nextAction = openMiniGame
  -> mini game metadata와 asset load
  -> guide 표시 후 start
  -> onComplete(attemptId, result)
  -> result 저장
  -> result별 outro script 실행
  -> map scene과 player position 복원
```

### Mini game lazy loading 흐름

```txt
NPC dialogue 완료
  -> registry에서 miniGameId 조회
  -> metadata validation
  -> module import
  -> transition이 game 전용 asset group lease 획득, JSON preload
  -> createMiniGame(context)
  -> init(config, { signal: transitionSignal })
  -> 성공: lease ownership을 MiniGameHost에 transfer
  -> 취소·import·factory·init 실패: partial instance destroy 후 transition finally에서 lease release
  -> intro에서 사용자 start 입력 대기
  -> host가 attemptId 발급
  -> start({ attemptId })
  -> clear / fail: onComplete(attemptId, result)
  -> quit: host가 확인 뒤 QUIT candidate 생성
  -> common result overlay, instance는 COMPLETED 상태로 유지
  -> 다시 하기: 새 attemptId와 restart({ attemptId })로 새 session 시작
  -> map/menu 이동: destroy() 후 scene 전환
```

## 5.4 Loading 전략

- 첫 loading에서는 logo, common UI, font, main map에 필요한 필수 asset만 불러옵니다.
- 개별 mini game image와 audio는 해당 game 진입 전에 불러옵니다.
- 같은 asset은 URL 기준으로 cache하고 중복 load하지 않습니다.
- 필수 asset 하나라도 실패하면 해당 scene을 시작하지 않고 실패 file과 retry action을 표시합니다.
- optional audio가 실패한 경우 무음 상태로 계속할 수 있지만 사용자에게 audio unavailable 상태를 표시합니다.
- asset load 중 scene 이동과 start button 중복 입력을 잠급니다.

---

## 6. 프로젝트 디렉토리 구조

## 6.1 권장 구조

```text
ai-change/
├── index.html
├── css/
│   ├── common.css
│   ├── responsive.css
│   ├── dialogue.css
│   ├── map.css
│   └── minigames.css
├── js/
│   ├── app.js
│   ├── router.js
│   ├── core/
│   │   ├── game-loop.js
│   │   ├── input-manager.js
│   │   ├── resize-manager.js
│   │   ├── asset-loader.js
│   │   ├── audio-manager.js
│   │   ├── save-manager.js
│   │   ├── record-policies.js
│   │   ├── version.js
│   │   ├── event-bus.js
│   │   └── config-validator.js
│   ├── scenes/
│   │   ├── loading-scene.js
│   │   ├── main-menu-scene.js
│   │   ├── how-to-scene.js
│   │   ├── settings-scene.js
│   │   ├── story-intro-scene.js
│   │   ├── map-scene.js
│   │   ├── dialogue-scene.js
│   │   ├── minigame-intro-scene.js
│   │   ├── minigame-scene.js
│   │   ├── battle-coming-soon-scene.js
│   │   └── error-scene.js
│   ├── ui/
│   │   └── result-overlay.js
│   ├── map/
│   │   ├── map-renderer.js
│   │   ├── player.js
│   │   ├── npc.js
│   │   └── collision.js
│   ├── story/
│   │   └── dialogue-manager.js
│   ├── battle/
│   │   └── registry.js
│   └── minigames/
│       ├── registry.js
│       ├── shared/
│       │   ├── minigame-clock.js
│       │   ├── result-builder.js
│       │   └── input-lock.js
│       ├── number-baseball/
│       │   └── index.js
│       ├── click-to-purify/
│       │   └── index.js
│       ├── code-heart/
│       │   └── index.js
│       ├── ai-ball-classification/
│       │   └── index.js
│       └── ai-data-egg-sort/
│           └── index.js
├── data/
│   ├── scripts/
│   │   ├── main-story.json
│   │   ├── npc-dialogues.json
│   │   └── minigame-outros.json
│   ├── minigames/
│   │   ├── number-baseball.json
│   │   ├── click-to-purify.json
│   │   ├── code-heart.json
│   │   ├── ai-ball-classification.json
│   │   └── ai-data-egg-sort.json
│   ├── drafts/
│   │   ├── app-config.draft.json
│   │   └── minigames/
│   ├── minigames.json
│   ├── battles.json
│   ├── map-data.json
│   ├── asset-manifest.json
│   └── app-config.json
├── assets/
│   ├── images/
│   ├── sprites/
│   ├── maps/
│   ├── audio/
│   ├── fonts/
│   └── minigames/
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── integration/
│   ├── fixtures/
│   └── manual/
│       ├── visual/
│       └── browser/
├── docs/
│   ├── AI_CHANGE_PLAN.md
│   ├── 기능명세서.md
│   ├── 기획안.md
│   ├── execution-and-controls.md
│   └── asset-sources.md
└── README.md
```

## 6.2 Mini game ID와 module mapping

| Mini game ID | 학과·전공 | Module directory |
| --- | --- | --- |
| `data-number-baseball` | 데이터사이언스전공 | `js/minigames/DS/` |
| `cyber-click-to-purify` | 사이버보안학과 | `js/minigames/CS/` |
| `computer-code-heart` | 컴퓨터공학과 | `js/minigames/CSE/` |
| `ai-ball-classification` | 인공지능학부 | `js/minigames/AI/` |
| `ai-data-egg-sort` | 인공지능데이터사이언스학부 | `js/minigames/AIDS/` |

ID는 save data와 dialogue `nextAction`에서 참조하므로 배포 이후 이름을 바꾸지 않습니다. 표시 이름은 data에서 변경할 수 있지만 ID는 stable identifier로 유지합니다.

## 6.3 구조 선택 이유

- `core`는 특정 scene이나 game을 알지 못하는 공통 service만 포함합니다.
- `scenes`는 화면 전환과 공통 UI orchestration을 담당합니다.
- `map`은 player, NPC, collision과 rendering을 분리합니다.
- `story`는 script 순서와 종료 action만 처리합니다.
- 각 mini game은 자신의 state, renderer, rule을 소유하고 다른 game directory를 import하지 않습니다.
- `data`를 분리해 script와 balance 조정이 logic regression으로 이어지는 범위를 줄입니다.
- `assets/minigames`는 game별 lazy loading과 license 추적을 쉽게 합니다.
- `tests/fixtures`에는 final content와 분리된 최소 schema 검증 data만 두며, 배포 content로 사용하지 않습니다.

---

## 7. Client data 및 저장 설계

ai-change MVP는 database를 사용하지 않습니다. 따라서 template의 database 설계 영역은 static content schema, runtime state, local save schema로 대체합니다.

## 7.1 핵심 entity

| Entity | 책임 |
| --- | --- |
| `AppState` | 현재 scene, 이전 scene, loading·transition 상태, active mini game 관리 |
| `PlayerState` | map 좌표, 방향, 이동 가능 여부, animation 상태 관리 |
| `NpcDefinition` | NPC ID, 위치, interaction range, script, mini game 연결 정보 관리 |
| `DialogueScript` | 화자, portrait, text, 순서, skip, 종료 action 관리 |
| `MiniGameDefinition` | 학과, 표시 이름, module, config, asset, 공개 상태 등록 |
| `BattleDefinition` | Story와 독립된 Battle module, asset, 공개·unlock 상태 등록 |
| `MiniGameSession` | 현재 mini game lifecycle, pause, timer, metrics 관리 |
| `MiniGameResult` | clear·fail·quit·error와 공통·game별 결과 반환 |
| `SaveData` | 완료 상태, 최고 기록, 설정, schema version 저장 |
| `AssetManifest` | preload 대상, lazy load group, 필수 여부, source path 관리 |

## 7.2 App runtime state

runtime state는 memory에만 존재하며 scene 전환의 single source of truth로 사용합니다.

```js
{
  "scene": "map",
  "previousScene": "dialogue",
  "transitioning": false,
  "activeMiniGameId": null,
  "player": {
    "x": 320,
    "y": 240,
    "direction": "down",
    "canMove": true
  },
  "pendingNpcId": null,
  "lastResult": null
}
```

적용 규칙:

- scene 변경은 `SceneRouter`만 수행합니다.
- `transitioning=true`인 동안 추가 route 요청을 무시합니다.
- mini game pause는 `AppState`에 복제하지 않습니다. `MiniGameHost`가 소유한 `pauseReasons: Set`의 `size > 0`에서만 계산합니다.
- dialogue, menu, pause overlay가 열리면 `player.canMove=false`로 설정합니다.
- mini game 내부 state를 `AppState`에 복제하지 않습니다.
- map 복귀에 필요한 player 위치와 NPC ID만 route context로 보존합니다.

## 7.3 Mini game registry schema

```json
{
  "id": "data-number-baseball",
  "department": "데이터사이언스전공",
  "title": "숫자 야구",
  "introScript": "data-number-baseball-intro",
  "clearOutroScript": "data-number-baseball-clear",
  "failOutroScript": "data-number-baseball-fail",
  "module": "data-number-baseball",
  "configAssetId": "number-baseball-config",
  "thumbnailAssetId": "number-baseball-thumbnail",
  "assetGroup": "data-number-baseball",
  "recordPolicy": null,
  "status": "published",
  "unlockCondition": null
}
```

필수 field와 validation은 다음과 같습니다.

| Field | Rule |
| --- | --- |
| `id` | unique kebab-case, 배포 후 변경 금지 |
| `department` | 사용자에게 표시할 공식 학과·전공명 |
| `title` | 표시 이름, 가칭이면 content metadata에 표시 가능 |
| `introScript` | 존재하는 script ID여야 함 |
| `clearOutroScript` | clear result에 연결할 script ID |
| `failOutroScript` | fail result에 연결할 script ID |
| `module` | `registry.js`의 static module loader allowlist에 존재하는 key |
| `configAssetId` | Asset manifest에 존재하며 해당 game schema를 만족하는 required JSON asset ID |
| `thumbnailAssetId` | Asset manifest에 존재하고 alt text를 가진 image asset ID |
| `assetGroup` | `AssetLoader` manifest에 존재하는 group ID |
| `recordPolicy` | best record 비교 policy key, 미확정 game은 `null` |
| `status` | `published`, `locked`, `coming-soon` 중 하나 |
| `unlockCondition` | `locked`일 때 필요한 data 기반 조건, 그 외에는 `null` |

`registry.js`는 `data-number-baseball: () => import("./DS/index.js")`처럼 module key를 실제 relative import에 mapping합니다. JSON의 임의 문자열을 바로 `import()`하지 않습니다. Registry를 읽을 때 잘못된 항목 하나 때문에 전체 app이 멈추지 않도록 해당 game만 disabled 처리하고 error detail을 개발 console과 사용자 안내에 분리합니다.

### 7.3.1 Asset manifest schema

`data/asset-manifest.json`은 common preload와 mini game lazy-load group, asset path, alt text의 단일 source of truth입니다. Registry는 path와 alt를 복제하지 않고 `configAssetId`·`thumbnailAssetId`로 이 manifest를 참조합니다.

```json
{
  "contentVersion": 1,
  "assets": [
    {
      "id": "number-baseball-thumbnail",
      "group": "data-number-baseball",
      "type": "image",
      "src": "./assets/minigames/number-baseball/thumbnail.webp",
      "required": true,
      "alt": "숫자 야구 미니게임 미리보기",
      "sourceRef": "ASSET-DS-001"
    },
    {
      "id": "number-baseball-config",
      "group": "data-number-baseball",
      "type": "json",
      "src": "./data/minigames/number-baseball.json",
      "required": true,
      "alt": null,
      "sourceRef": "CONTENT-DS-001"
    }
  ]
}
```

- `contentVersion`은 release app config, HTML meta, JavaScript build constant와 같아야 합니다.
- `type`은 `image`, `audio`, `font`, `json` allowlist를 사용합니다.
- `required=true`인 asset 실패는 해당 scene 시작을 막고, optional asset은 fallback 정책을 적용합니다.
- `sourceRef`는 `docs/asset-sources.md`의 실제 파일명·종류·제작자·URL·license·수정·사용 위치 record와 연결합니다.
- `assets[].id`는 manifest 전체에서 반드시 unique하며 같은 ID를 두 번 선언하면 다른 field가 같아도 validation error입니다.
- 같은 `src`를 여러 semantic ID가 재사용하는 것은 context별 alt가 실제로 달라 별도 ID가 필요한 경우에만 허용합니다. 이때 `type`, `required`, `sourceRef`가 충돌하면 validation error이며, 실제 network·decode cache는 `src` 기준으로 한 번만 생성합니다.

### 7.3.2 Battle registry seam

MVP에는 실제 Battle content를 넣지 않지만 Story registry와 독립된 `js/battle/registry.js`와 `data/battles.json` loader seam을 제공합니다. Production의 `battles.json`은 빈 배열이어도 유효하며, `published` entry가 없으면 `BattleComingSoonScene`으로 이동합니다.

`BattleDefinition`은 최소한 `id`, `title`, `module`, `status`, `assetGroup`, `unlockCondition`을 가집니다. `module`은 mini game과 마찬가지로 JavaScript allowlist key만 허용하며, `coming-soon` entry는 `module=null`을 허용합니다. Contract fixture에서는 test Battle entry를 등록해 Story registry를 수정하지 않고 별도 route로 진입할 수 있는지 검증하며, 이 fixture는 production data에 배포하지 않습니다.

## 7.4 Dialogue schema

```json
{
  "id": "department-intro-01",
  "type": "dialogue",
  "skippable": true,
  "lines": [
    {
      "speaker": "[작성 필요]",
      "portraitAssetId": "npc-default-portrait",
      "text": "[작성 필요]"
    }
  ],
  "nextAction": {
    "type": "openMiniGame",
    "target": "data-number-baseball"
  }
}
```

지원해야 하는 action은 다음과 같습니다.

| Action | 처리 |
| --- | --- |
| `returnToMap` | dialogue를 닫고 이전 map state 복원 |
| `openMiniGame` | target registry를 확인하고 mini game intro로 이동 |
| `openDialogue` | 다른 script를 이어서 실행 |
| `goToMenu` | 확인 dialog 후 main menu로 이동 |
| `none` | 현재 scene에서 dialogue만 닫기 |

대화 text는 HTML로 해석하지 않고 text node로 출력합니다. 줄바꿈 등 필요한 표현은 별도 token이나 안전한 renderer로 처리합니다.

`portraitAssetId`는 asset manifest의 image ID만 참조하며 dialogue JSON에 path를 직접 넣지 않습니다. Portrait가 없는 narrator는 `null`을 허용하고, portrait asset의 alt·sourceRef·load group은 manifest에서 검증합니다.

## 7.5 Map 및 NPC data

```json
{
  "id": "festival-main-map",
  "worldSize": { "width": 1280, "height": 720 },
  "startPosition": { "x": 160, "y": 520 },
  "collisionLayers": ["bounds", "buildings", "decorations"],
  "npcs": [
    {
      "id": "npc-data-science",
      "x": 300,
      "y": 240,
      "interactionRadius": 56,
      "firstScript": "data-science-first",
      "revisitScript": "data-science-revisit",
      "miniGameId": "data-number-baseball",
      "completionRule": {
        "type": "MINIGAME_CLEAR",
        "target": "data-number-baseball"
      }
    }
  ]
}
```

위 수치와 completion rule은 schema 예시이며 final NPC 수·좌표·연결 조건이 아닙니다. `D-02`가 확정되면 실제 map data로 교체합니다.

Map data 규칙:

- render layer와 collision layer를 분리합니다.
- NPC ID는 unique해야 하고 `miniGameId`는 존재하는 registry ID를 참조해야 합니다. 여러 NPC가 같은 game을 참조하거나 한 NPC가 game 없이 story만 제공할 수 있으며 cardinality는 D-02 content data로 결정합니다.
- `completionRule`은 `MINIGAME_CLEAR`, `DIALOGUE_COMPLETE`, `STORY_FLAG` allowlist와 유효 target만 허용합니다.
- interaction range는 화면 크기와 무관한 world 좌표로 계산합니다.
- 범위 밖 click·touch는 auto path finding을 수행하지 않고 접근 안내만 표시합니다.
- 완료 NPC의 indicator는 색상뿐 아니라 shape 또는 text도 변경합니다.

## 7.6 Save data schema

`localStorage`는 origin 단위이므로 배포 channel을 key에 포함합니다. Namespace는 `ai-change:<storageChannel>`이고 현재 schema key는 `${namespace}:save:v1`입니다. Production 예시는 `ai-change:production:save:v1`이며 staging은 별도 `storageChannel`을 사용해 같은 origin의 다른 path에 배포되어도 production 진행을 공유하지 않습니다.

```json
{
  "version": 1,
  "revision": 0,
  "updatedAt": "2026-08-16T00:00:00.000Z",
  "story": {
    "introSeen": false,
    "completedNpcIds": [],
    "lastMapId": "festival-main-map",
    "lastPlayerPosition": null
  },
  "minigames": {
    "data-number-baseball": {
      "completed": false,
      "playCount": 0,
      "bestScore": null,
      "bestMetrics": null
    }
  },
  "settings": {
    "masterVolume": 1,
    "bgmVolume": 0.7,
    "sfxVolume": 0.8,
    "muted": false
  }
}
```

`updatedAt`과 volume 값은 schema 설명용 예시입니다. 실제 default volume은 `D-10` 확정 후 `app-config.json`에서 관리합니다.

저장 규칙:

- 승인된 intro 종료·skip 처리, 독립 NPC 완료, mini game 결과 확정, setting 변경 시 저장합니다.
- `lastPlayerPosition`은 매 frame 저장하지 않습니다. 위치가 바뀐 동안 최대 2초 간격의 throttled safe checkpoint와 `MapScene.deactivate()`에서 저장합니다.
- `onComplete`를 받기 전의 진행 중 mini game state는 저장하지 않습니다.
- 최고 기록 비교 방식과 기록 대상 status는 game별 `recordPolicy`를 registry에 정의합니다. Production의 5개 published Story game은 승인된 non-null policy를 가져야 합니다.
- result나 story event가 NPC의 승인된 `completionRule`도 만족하면 game record와 해당 NPC 완료를 한 memory transaction에서 갱신하고 한 번 직렬화합니다.
- localStorage write가 실패해도 memory의 현재 session 진행과 HUD는 유지하고 `저장되지 않음` 경고를 표시합니다.
- 정상 write 직전 현재 key의 `revision`을 다시 확인하고 memory revision과 같을 때 1 증가시켜 저장합니다. 다르면 감지된 stale tab으로 전환해 write를 차단합니다. 이 검사는 순차 충돌 탐지용이며 localStorage에 원자적 CAS를 제공하지 않습니다.
- 새 revision은 localStorage write가 성공한 뒤 memory의 persisted revision으로 commit합니다. 재시도 가능한 write 실패는 progression memory를 dirty 상태로 유지하되 persisted revision을 올리지 않고, 다음 safe checkpoint에서 같은 base revision을 다시 검사합니다. 저장소 접근 자체가 불가능한 오류는 10.8의 `UNAVAILABLE` 전이로 분리합니다.
- save가 손상되면 원본을 덮어쓰기 전에 같은 channel의 size-limited 최신 corrupt backup key 하나에 보존한 뒤 safe default로 시작합니다.
- 사용자가 설정에서 진행 초기화를 선택하면 확인 절차 후 story와 game record를 초기화합니다.
- 음량 설정까지 함께 초기화할지 여부는 확인 UI에서 명시합니다.

## 7.7 Game별 저장 metric

| Mini game | 저장 후보 metric | 비교 기준 |
| --- | --- | --- |
| 숫자 야구 | 사용 Epoch, history length | 최고 기록 metric·비교·동률 기준 D-08 |
| CLICK to PURIFY | purification, Perfect·Good·Miss 수, clear time | score 공식 `D-04` 확정 필요 |
| Code Heart: Unlock! | 완료 주문, Build Error, 남은 시간 | clear 기준·score `D-06` 확정 필요 |
| AI Ball Classification | 정답 수집, 처리 공 수, clear time | clear 우선, 세부 score는 `TBD` |
| 인지알·데사알 | 정답·오답 수, 남은 life | clear 우선, 남은 life 또는 정확도 비교 `TBD` |

확정되지 않은 score를 임의로 합산하지 않습니다. 공통 진행 표시에는 `completed`만 사용하고, best score는 비교 policy가 확정된 game에서만 저장합니다.

### 7.7.1 Record policy contract

`recordPolicy`는 JSON 안의 임의 함수명이 아니라 `js/core/record-policies.js` allowlist key입니다. 각 policy는 다음 고정 contract를 제공합니다.

```js
{
  eligibleStatuses: ["CLEAR"],
  project(result) {},
  compare(nextRecord, currentRecord) {},
  tieBreak: "KEEP_EXISTING"
}
```

- `eligibleStatuses`에 없는 result는 best record 후보가 아닙니다.
- Release policy의 eligible status는 `CLEAR` 또는 명시적으로 승인된 `FAIL`만 허용하며 `QUIT`·`ERROR`는 기록 후보로 금지합니다.
- `project`는 7.7의 allowlist metric만 JSON-safe record로 만들며 history, answer, DOM reference를 버립니다.
- `compare`는 `BETTER`, `EQUAL`, `WORSE` 중 하나만 반환하고 SaveManager는 `BETTER`일 때만 교체합니다.
- `tieBreak`는 명시적으로 정의합니다. 별도 승인이 없으면 같은 기록에서 먼저 저장된 값을 유지합니다.
- Registry의 `recordPolicy=null`은 best record를 계산하지 않는다는 뜻이며 completion과 play count 저장에는 영향을 주지 않습니다. 다만 `null`은 decision 전 draft·development entry에만 허용합니다.
- `MIN_EPOCHS`는 D-08에서 승인할 수 있는 PLAN 제안일 뿐 현재 release policy가 아닙니다. 승인한다면 `CLEAR`만 대상으로 `epochsUsed`가 작은 기록을 우선하고 같은 Epoch이면 기존 기록을 유지하는 contract와 test를 함께 등록합니다.
- 다른 game policy는 D-04·D-06·D-07·D-09 승인 뒤 allowlist와 contract test를 함께 추가합니다.
- Production의 5개 published Story game은 D-04·D-06·D-07·D-08·D-09에서 승인한 non-null `recordPolicy`가 모두 있어야 release됩니다. 최고 기록 저장을 제외하려면 `null`로 조용히 배포하지 않고 F-11 범위·완료 기준·사용자 안내를 함께 바꾸는 승인된 scope change를 남깁니다.

## 7.8 Data 오류와 실패 관리

| Error code | 상황 | 사용자 처리 |
| --- | --- | --- |
| `CONTENT_LOAD_FAILED` | JSON fetch 실패 | retry와 menu 이동 제공 |
| `CONTENT_SCHEMA_INVALID` | 필수 field 누락·type 오류 | 해당 content 비활성화, 일반 오류 문구 표시 |
| `MINIGAME_NOT_REGISTERED` | dialogue target이 registry에 없음 | map 복귀와 오류 안내 |
| `ASSET_LOAD_FAILED` | 필수 image·font load 실패 | 해당 scene 시작 차단 후 retry |
| `SAVE_DATA_INVALID` | localStorage parse·schema 실패 | 안전한 초기 상태로 복구 후 안내 |
| `SAVE_VERSION_UNSUPPORTED` | 현재 app보다 새로운 save version | 원본 보호, persistence read-only, update 또는 명시적 reset 안내 |
| `SAVE_STALE_TAB` | 다른 tab에서 revision 변경·reset 감지 | 현재 tab write 차단, reload 안내 |
| `SAVE_WRITE_RETRY_PENDING` | 저장소는 사용 가능하지만 단일 write가 일시 실패 | memory 진행 유지, 저장 안 됨 표시 후 다음 safe checkpoint에서 capped retry |
| `STORAGE_UNAVAILABLE` | private mode·quota·SecurityError·capability probe 실패 | 현재 session은 유지하고 자동 write를 멈춘 뒤 Settings의 명시적 재확인 제공 |

---

## 8. 진행 상태 및 browser session 설계

## 8.1 인증 범위

MVP에는 login, user account, token, server session이 없습니다. 한 browser profile의 anonymous player만 다룹니다.

따라서 다음 원칙을 적용합니다.

- 개인정보를 입력받거나 외부 server로 전송하지 않습니다.
- 진행 정보는 현재 browser의 `localStorage`에만 저장합니다.
- 다른 device나 browser로 진행을 옮길 수 없음을 setting과 help에 안내합니다.
- private browsing 또는 browser data 삭제 시 진행이 사라질 수 있음을 안내합니다.
- 여러 tab 동시 play와 progression merge는 지원하지 않으며 한 tab에서만 플레이하도록 help에 안내합니다.

## 8.2 상태 계층

```txt
Persistent Save
  ├── completed NPC / mini games
  ├── best records
  └── audio settings

Session App State
  ├── current scene
  ├── player map position
  ├── current dialogue line
  └── active mini game reference

Mini Game State
  ├── timer / score / lives
  ├── active objects
  ├── game-specific state machine
  └── pending result
```

각 mini game state는 module 내부에만 두고 `destroy()` 뒤에는 참조가 남지 않게 합니다. 상위 app에는 완료 후 생성된 immutable result만 전달합니다.

## 8.3 저장·복원 흐름

```txt
App bootstrap
  -> app-config의 storageChannel로 현재 namespace와 key 결정
  -> 현재 key와 migration 가능한 동일 channel의 구 key 조회
  -> JSON parse
  -> version·schema validation
  -> 정상: setting과 progression 복원
  -> 구 version: 순차 migration 후 현재 key에 기록
  -> 손상: raw backup 보존 + safe default 사용 + 사용자 안내
  -> 알 수 없는 미래 version: 원본 유지 + READ_ONLY_INCOMPATIBLE + update·명시적 reset 안내
  -> 지원 save: main menu 표시
  -> read-only save: play를 허용하면 session-only banner를 유지하고 모든 persistence write 차단

Attempt가 시작된 mini game terminal
  -> minigame:completed event 1회 수신
  -> result schema와 session ID validation
  -> CLEAR·FAIL: memory에서 game record 갱신, 승인 completionRule을 만족한 NPC가 있으면 함께 갱신
  -> CLEAR·FAIL: 실제 state 변화가 있으면 현재 channel key에 한 번 write
  -> CLEAR·FAIL write 실패: memory 진행 유지 + unsaved warning
  -> QUIT·ERROR: memory·localStorage no-op, revision 증가 없음
  -> CLEAR·FAIL·QUIT: result overlay 표시
  -> ERROR: instance·lease cleanup 뒤 ErrorScene 표시
```

## 8.4 완료·재방문 상태

- NPC의 최초 대화는 `completedNpcIds`에 ID가 없을 때 실행합니다.
- mini game clear가 확정되면 해당 game record를 완료 처리하고, 그 event를 조건으로 삼는 0개 이상의 NPC `completionRule`을 평가합니다.
- `CLEAR`와 `FAIL`만 play count를 1 증가시키며 `QUIT`과 `ERROR`는 증가시키지 않습니다.
- `CLEAR`만 game의 `completed=true`를 만듭니다. Best record 후보 자격은 별도의 non-null `recordPolicy.eligibleStatuses`가 결정하며, policy가 없으면 best를 갱신하지 않습니다. NPC 완료는 D-02에서 승인된 각 NPC의 `completionRule`이 별도로 결정합니다.
- 완료 NPC 재방문 시 `revisitScript`를 실행하고 재도전을 허용합니다.
- 재도전으로 더 좋은 기록을 얻으면 game별 비교 policy에 따라 best record만 갱신합니다.

`completedNpcIds`는 NPC 완료 표시·재방문의 authoritative value이고 `minigames[id].completed`는 game 완료의 authoritative value입니다. 둘은 서로를 일반적으로 덮어쓰거나 1:1로 reconcile하지 않습니다. 한 event가 양쪽 조건을 동시에 만족할 때만 같은 in-memory transaction과 save payload에 반영합니다. Load·migration은 존재하는 ID와 schema만 각각 검증하며, D-02의 명시적 migration rule 없이는 한쪽 값으로 다른 쪽을 추론하지 않습니다.

## 8.5 초기화와 migration

- key의 `v1`은 storage major version이고 payload의 `version`은 읽은 data가 기대 schema인지 확인하는 값입니다. 둘을 각각 검증합니다.
- 유효한 현재 key가 있으면 항상 우선하며 historical key는 현재 key가 없을 때만 migration source 후보가 됩니다.
- 알려진 이전 version은 순서가 고정된 pure migration function으로 기존 값을 보존하며 default를 채운 뒤 현재 key로 이동합니다.
- migration은 현재 key write와 read-back validation이 성공한 뒤에만 알려진 구 key를 삭제합니다. 실패하면 구 key를 보존하고 migration을 완료로 표시하지 않습니다.
- 알 수 없는 미래 version은 downgrade해 덮어쓰지 않습니다. SaveManager를 `READ_ONLY_INCOMPATIBLE`로 두고 update 또는 사용자가 영향 범위를 확인한 전체 reset 전까지 result·setting·map checkpoint write를 모두 차단합니다.
- 호환되지 않는 major schema는 같은 channel의 새 key를 사용하고, 배포 전 forward migration과 직전 artifact rollback read test를 수행합니다.
- corrupt raw backup은 같은 channel에 최신 1개만 보존하며 정상 save와 구분합니다. Backup 실패도 app 시작을 막지 않습니다.
- `진행만 초기화`는 story·game field를 default로 바꾼 payload를 현재 key에 다시 쓰고 settings를 보존합니다. 사용자가 settings 포함을 승인하면 default settings도 함께 씁니다.
- `전체 local data 삭제`는 현재 `ai-change:<storageChannel>` 아래 SaveManager가 아는 현재·historical save key, migration marker, corrupt backup을 allowlist로 삭제하고 origin의 다른 localStorage data나 다른 channel을 건드리지 않습니다.
- MVP는 cross-tab merge를 지원하지 않습니다. `storage` event 또는 write 전 revision mismatch를 감지하면 `STALE_TAB_WRITE_BLOCKED`로 전환해 active tab의 memory를 자동 병합하지 않고 reload를 안내합니다.
- `navigator.locks`가 D-11 target browser에서 승인된 경우 channel별 named lock 안에서 revision read→write를 직렬화합니다. 지원하지 않는 환경의 revision check는 best-effort이며 두 tab의 완전히 동시 write는 last-write-wins가 될 수 있음을 help·known issue에 명시합니다. Cross-tab 무손실 보장이 요구되면 별도 scope로 IndexedDB transaction 또는 server save를 도입합니다.

---

## 9. 내부 API 및 event 설계

정적 application이므로 HTTP API는 없습니다. 이 장의 API는 scene과 mini game module 사이의 JavaScript contract를 의미합니다.

## 9.1 Mini game lifecycle contract

각 module은 synchronous factory를 export하고 다음 lifecycle을 제공해야 합니다. `onComplete`는 반환 method가 아니라 상위 host가 `context`로 주입하는 result callback입니다.

```js
export function createMiniGame(context) {
  return {
    init,
    start,
    pause,
    resume,
    restart,
    destroy
  };
}
```

`context`는 다음 dependency만 전달합니다.

```js
{
  canvas,
  uiRoot,
  input,
  clock,
  assets,
  audio,
  events,
  onComplete,
  onError
}
```

| Method | 반환 | 책임 | 호출 규칙 |
| --- | --- | --- | --- |
| `init(config, { signal })` | `Promise<void>` | config validation, 초기 state와 UI·asset 준비 | instance당 start 전에 1회 `await`; route의 `AbortSignal` 전달 |
| `start({ attemptId })` | `void` | 현재 attempt token을 저장하고 game clock·input을 활성화 | guide 종료 후 host가 발급한 token으로 1회 |
| `pause(reason)` | `void` | clock, animation, input, audio를 정지 | host pause reason이 0→1일 때만 호출 |
| `resume()` | `void` | pause 이전 state부터 재개 | host pause reason이 1→0일 때만 호출 |
| `restart({ attemptId })` | `void` | 이전 attempt의 timer·object·input을 정리하고 새 token과 승인된 retry policy로 즉시 session 시작 | terminal overlay의 첫 retry action만 허용 |
| `destroy()` | `void` | listener, timer, RAF, DOM, audio reference 정리 | scene 이탈마다 반드시 1회, 중복 호출 안전 |
| `context.onComplete(attemptId, result)` | `void` | clear·fail 후보 result와 이를 만든 token을 host에 전달 | `CLEAR`·`FAIL` terminal 후보가 있을 때 최대 1회, `onError`와 상호 배타적 |
| `context.onError(attemptId, error)` | `void` | start 뒤 예상하지 못한 terminal error와 token을 host에 전달 | `onComplete`와 상호 배타적; init error는 `init()` Promise reject로 전달 |

`destroy()`가 끝난 instance에는 다시 `start({attemptId})`를 호출하지 않습니다. 재진입 시 새 instance를 생성합니다. Host는 `restartInProgress` guard를 두어 double click이 attempt ID를 두 번 바꾸거나 `restart({attemptId})`를 중복 호출하지 못하게 합니다.

Module은 attempt마다 받은 token을 해당 attempt에서 시작한 Promise·timer·callback closure에 capture합니다. Host는 callback의 `attemptId`가 현재 token과 다르거나 현재 state가 terminal이면 결과를 폐기하고 개발 log만 남깁니다. 따라서 이전 attempt의 지연 Promise가 retry 뒤 resolve되어도 새 attempt의 결과로 승격되지 않습니다.

`init()`은 전달받은 `signal`을 모든 취소 가능한 fetch·decode·비동기 helper에 전달하고 각 `await` 전후에 `signal.aborted`와 instance의 `disposed` flag를 검사합니다. Route 취소 시 host는 signal을 먼저 abort하고 generation을 무효화한 뒤 partial instance의 idempotent `destroy()`를 호출합니다. `destroy()`는 `disposed=true`를 동기적으로 세우며, 이후 resolve·reject한 init continuation은 DOM·listener·timer를 만들거나 asset handle을 사용하지 않고 no-op 또는 `AbortError`로 종료해야 합니다. 이 계약은 deferred Promise를 사용한 취소 contract test로 검증합니다.

## 9.2 공통 game state

```txt
CREATED
  -> INITIALIZING
  -> READY
  -> RUNNING
  <-> PAUSED
  -> RESOLVING
  -> COMPLETED
  -> RUNNING, via guarded restart({ attemptId }) with a new token
  -> DESTROYED, when leaving the mini game

INITIALIZING
  -> SETUP_ERROR
  -> DESTROYED after best-effort cleanup
  -> ErrorScene without MiniGameResult or save

RUNNING / PAUSED
  -> ERROR
  -> RESOLVING
  -> COMPLETED with ERROR result
  -> DESTROYED after loop/input stop, instance cleanup, and lease release
  -> ErrorScene
```

- `READY` 이전 input은 game logic으로 전달하지 않습니다.
- `RESOLVING` 진입 즉시 추가 판정과 중복 제출을 잠급니다.
- `CLEAR`·`FAIL`은 module callback, `QUIT`은 host의 포기 확인, start 이후 `ERROR`는 `onError` 변환을 통해 host의 단일 finalization pipeline으로 들어갑니다.
- Factory·import·`init()` 단계의 setup error에는 attempt가 없으므로 MiniGameResult, `minigame:completed`, playCount를 만들지 않습니다. Host가 부분 instance를 best-effort destroy하고 pre-mount asset lease를 release한 뒤 ErrorScene으로 이동합니다.
- `COMPLETED`에서 clear·fail·quit result UI를 표시합니다. Runtime `ERROR`는 terminal event를 확정한 직후 loop·input·audio를 멈추고 instance를 idempotent destroy한 다음 host asset lease를 release해 `DESTROYED`로 전이하고 ErrorScene을 표시합니다.
- `restart({attemptId})` 호출 전 host는 같은 instance에 새 token을 발급하고 terminal once guard와 host clock을 초기화합니다. Module이 내부 timer·object·input state를 승인된 retry policy에 맞게 재구성한 뒤 즉시 RUNNING으로 전환합니다.
- fail과 clear가 같은 frame에 후보로 발생하면 game별로 확정된 priority rule을 한 곳에서 적용합니다.

## 9.3 MiniGameResult contract

Module과 host가 finalization 전에 만드는 값은 `MiniGameCandidateResult`입니다. Candidate는 `status`, `score`, `failureReason`, `metrics`, `reward`만 가질 수 있고 host 소유 field인 `sessionId`, `miniGameId`, `durationMs`를 포함하면 validation error입니다. Module은 `CLEAR`·`FAIL` candidate만 만들고, host는 같은 candidate schema로 `QUIT`·`ERROR`를 만듭니다. Candidate validator는 status discriminator와 9.4의 game별 metric을 먼저 검증합니다.

```json
{
  "sessionId": "session-example",
  "miniGameId": "data-number-baseball",
  "status": "CLEAR",
  "score": null,
  "durationMs": 12340,
  "failureReason": null,
  "metrics": {
    "epochsUsed": 1,
    "fit": 3,
    "shift": 0,
    "outlier": 0,
    "history": [
      {
        "guess": [1, 2, 3],
        "fit": 3,
        "shift": 0,
        "outlier": 0
      }
    ]
  },
  "reward": null
}
```

| Field | Rule |
| --- | --- |
| `sessionId` | MiniGameHost가 attempt마다 발급한 `attemptId`를 검증 후 주입한 opaque ID, event·save dedupe에 사용 |
| `miniGameId` | registry ID와 일치 |
| `status` | `CLEAR`, `FAIL`, `QUIT`, `ERROR` 중 하나 |
| `score` | game별 score가 확정된 경우 number, 아니면 `null` |
| `durationMs` | guide는 제외하고 `start({attemptId})` 이후 in-game countdown은 포함하며 pause는 제외한 active game time |
| `failureReason` | fail·error의 stable code, clear·quit은 `null` 가능 |
| `metrics` | JSON serializable game별 상세 결과 |
| `reward` | 공통 보상 체계 확정 전 `null`; `D-03` 이후 schema 확장 |

result object에는 DOM node, function, timer, raw asset을 포함하지 않습니다.

Result validator는 `status`를 discriminator로 사용합니다.

| Status | 추가 validation |
| --- | --- |
| `CLEAR` | 9.4의 game별 metrics 전체 필수, `failureReason=null`, score·reward는 승인 schema 적용 |
| `FAIL` | 실패 시점에도 9.4의 counter·summary metrics 필수, stable `failureReason` 필수 |
| `QUIT` | Host가 생성하며 `score=null`, `metrics={}`, `reward=null`, `failureReason=null` |
| `ERROR` | start 이후 runtime error에만 사용하며 `score=null`, `metrics={}`, `reward=null`, stable `failureReason` 필수 |

Setup error는 MiniGameResult 자체를 만들지 않으므로 이 union에 포함하지 않습니다.

### 9.3.1 Terminal finalization pipeline

```txt
Module CLEAR / FAIL
  -> context.onComplete(attemptId, candidateResult)

User confirms leave during play
  -> host creates QUIT candidate

Module init exception
  -> init(config, { signal }) Promise reject
  -> host가 scene·instance generation으로 stale 여부 확인
  -> partial instance destroy + pre-mount lease release
  -> ErrorScene, no terminal event / result / save

Module runtime exception
  -> context.onError(attemptId, error)
  -> host creates ERROR candidate

MiniGameHost
  -> callback attemptId = current attemptId인지 확인, stale callback 폐기
  -> current sessionId와 terminal once guard 확인
  -> MiniGameCandidateResult normalize + candidate schema validation
  -> authoritative sessionId, miniGameId, durationMs 주입
  -> final MiniGameResult schema validation + deep freeze
  -> minigame:completed event 정확히 1회 발행
  -> AppShell terminal coordinator가 event 1회 소비
  -> SaveManager가 변경되는 상태만 갱신·write
  -> CLEAR·FAIL·QUIT은 ResultOverlay, ERROR는 cleanup 뒤 ErrorScene 표시
```

위 MiniGameHost terminal pipeline은 attempt가 시작된 CLEAR·FAIL·QUIT·runtime ERROR에만 적용합니다. Setup error는 이 pipeline에 합류하지 않습니다.

Module은 `minigame:completed`를 직접 emit하지 않습니다. `CLEAR`와 `FAIL`은 `playCount`를 1 증가시키고, `QUIT`과 `ERROR`는 증가시키지 않습니다. `completed=true`는 `CLEAR`에서만 수행합니다. Best record는 completion과 분리해 해당 `recordPolicy.eligibleStatuses`가 허용한 status만 후보로 삼으며 policy가 `null`이면 갱신하지 않습니다. `QUIT`·`ERROR`처럼 save state가 바뀌지 않는 terminal event는 SaveManager no-op이며 localStorage write와 revision 증가를 만들지 않습니다.

## 9.4 Game별 CLEAR·FAIL metric mapping

| Mini game ID | CLEAR·FAIL 필수 metrics |
| --- | --- |
| `data-number-baseball` | `epochsUsed`, `history`, 마지막 `fit/shift/outlier`, fail 시 공개된 answer |
| `cyber-click-to-purify` | `wavesResolved`, `purification`, `perfectCount`, `goodCount`, `missCount` |
| `computer-code-heart` | `ordersCompleted`, `ordersFailed`, `buildErrorCount`, `remainingTimeMs` |
| `ai-ball-classification` | `targetCollected`, `targetMissed`, `wrongCollected`, `ballsResolved` |
| `ai-data-egg-sort` | `correctCount`, `wrongCount`, `lostCount`, `remainingLives` |

정답 배열처럼 gameplay 중 비공개인 data는 result 확정 전 상위 app이나 save에 전달하지 않습니다. ResultOverlay는 상세 `metrics`를 사용할 수 있지만 SaveManager는 7.7의 game별 allowlist와 `recordPolicy`에 필요한 요약값만 보존하며, 숫자 야구의 전체 history와 answer는 영구 저장하지 않습니다.

## 9.5 Common event

| Event | 발생 시점 | Consumer |
| --- | --- | --- |
| `app:scene-changing` | scene 전환 시작 | input lock, transition UI |
| `app:scene-changed` | 새 scene mount 완료 | focus manager, analytics 확장 지점 |
| `asset:progress` | asset 하나 load 완료 | loading UI |
| `asset:error` | 필수·선택 asset 실패 | error boundary |
| `dialogue:line-changed` | 대사 index 변경 | portrait·text renderer, SFX |
| `dialogue:completed` | script 종료 | route action handler |
| `minigame:ready` | `init` 완료 | start button 활성화 |
| `minigame:started` | 실제 game clock 시작 | HUD, audio |
| `minigame:paused` | pause 완료 | pause overlay |
| `minigame:completed` | result 확정 | AppShell terminal coordinator |
| `save:updated` | local save 성공 | 진행 HUD |
| `save:error` | local save 실패 | non-blocking warning |

Terminal coordinator는 `minigame:completed`의 유일한 business consumer입니다. 먼저 SaveManager의 memory progression을 동기적으로 갱신하고 localStorage write를 시도한 다음 같은 immutable result로 결과 UI를 엽니다. 저장 성공·실패는 `save:updated`·`save:error`로 HUD에 알리며 result 화면을 중복 생성하지 않습니다.

`CLICK to PURIFY`는 기능 명세에 지정된 다음 hook도 그대로 제공합니다.

```txt
OnWaveSpawn
OnTrojanReveal
OnWormSplit
OnRansomLock
OnRansomUnlock
OnClickInput
OnJudgePerfect
OnJudgeGood
OnJudgeMiss
OnGameClear
OnGameOver
```

이 hook은 sound·effect trigger이며 판정 logic을 직접 변경하지 않습니다.

## 9.6 Input action contract

| Common action | PC input | Mobile·tablet input | 사용 위치 |
| --- | --- | --- | --- |
| `MOVE_UP/DOWN/LEFT/RIGHT` | 방향키, WASD | virtual pad drag·hold | map movement |
| `INTERACT` | Enter, Space, NPC click | NPC·interaction button touch | NPC dialogue 시작 |
| `NEXT_DIALOGUE` | Enter, Space, dialogue click | dialogue touch | 다음 대사 |
| `PREVIOUS_DIALOGUE` | 이전 button | 이전 button touch | intro에서 이전 대사 |
| `PAUSE` | Escape | pause button | map·mini game pause |
| `PRIMARY_ACTION` | Space·Enter·game button click | game button touch | CLICK, OPEN/CLOSE 등 |
| `SELECT_LEFT/RIGHT` | ArrowLeft·ArrowRight, A·D | 좌·우 button | egg sort 발판 |
| `DIGIT_0`~`DIGIT_9` | number row·numpad, keypad click | keypad touch | 숫자 야구 입력 |
| `DELETE_INPUT` | Backspace·Delete | 지우기 button | 숫자 야구 입력 삭제 |
| `SELECT_ITEM` | ingredient button click·focus 후 Enter/Space | ingredient button touch | Code Heart 재료 선택 |
| `RESET_SELECTION` | R 또는 초기화 button | 초기화 button touch | Code Heart 작업 slot 초기화 |
| `SUBMIT` | Enter 또는 검증·제출 button | 검증·제출 button | 숫자 야구·Code Heart |

동일 physical input이 DOM click과 keyboard handler 양쪽에서 두 번 처리되지 않도록 event source를 normalize합니다. interactive DOM element의 기본 keyboard activation은 존중하고, 전역 handler는 `event.repeat`, focus target, current scene을 확인합니다.

## 9.7 Error callback contract

```json
{
  "code": "MINIGAME_RUNTIME_ERROR",
  "miniGameId": "cyber-click-to-purify",
  "recoverable": true,
  "userMessage": "게임을 계속할 수 없습니다. 다시 시도하거나 맵으로 돌아가 주세요."
}
```

사용자에게 stack trace나 local path를 노출하지 않습니다. 개발 console에는 game ID, state, error cause를 남기되 개인정보와 대화 전체를 수집하지 않습니다.

`recoverable`은 오류가 난 instance를 재사용해도 된다는 뜻이 아닙니다. Runtime error가 terminal pipeline에 들어오면 host는 결과 발행 뒤 현재 loop·input·audio를 정지하고 `destroy()`와 asset lease release를 끝낸 후 ErrorScene으로 이동합니다. `recoverable=true`이면 `다시 시도`가 registry 조회 → asset group 재획득 → factory → abort 가능한 `init()` → 새 attempt의 전체 진입 경로를 실행하고, `false`이면 map 또는 menu 복귀만 제공합니다. 폐기된 instance에는 `restart()`를 호출하지 않습니다.

---

## 10. 공통 game system 설계

## 10.1 GameLoop와 clock

- animation은 `requestAnimationFrame`으로 구동합니다.
- update와 render를 분리합니다.
- `GameClock.now()`는 `performance.now()`에서 누적 pause 시간을 뺀 active game time을 반환하며 모든 deadline과 input timestamp의 기준입니다.
- `deltaTime` 상한은 particle 등 비판정 visual simulation에만 사용합니다.
- timing game의 object 위치와 판정 ring 도달 시각은 같은 `GameClock`의 `spawnedAt`, `targetAt`, 현재 시각으로 보간해 visual과 judge가 어긋나지 않게 합니다.
- InputManager는 browser event를 받는 즉시 `GameClock.now()` timestamp를 action에 붙입니다.
- pause 진입 시 active time offset을 보존하고, resume 뒤 pause duration을 제외합니다.
- RAF와 input handler는 먼저 `GameClock.sample(rawNow)`을 호출합니다. `rawNow - lastAcceptedRawNow`가 D-11 gap threshold를 넘으면 그 전체 gap을 pause offset에 소급 반영해 active time을 `lastAcceptedActiveNow`에 고정하고 `SYSTEM` pause를 추가합니다.
- 긴 gap을 감지한 frame·input에서는 update, deadline, collision, terminal 판정을 실행하지 않습니다. 따라서 sleep 뒤 첫 RAF 전에 input이 와도 gap 시간이 game duration이나 timing 오차에 포함되지 않습니다.
- SYSTEM pause 안내에서 사용자가 resume할 때 새 raw 기준점을 세우며, 임의 catch-up은 수행하지 않습니다.
- deadline은 `clock.now() >= deadline`, countdown·timer 종료는 `remainingMs <= 0`처럼 game별 boundary를 한 곳에서 정의합니다.
- `durationMs`는 guide를 제외하고 `start({attemptId})` 이후 countdown부터 terminal 확정까지 측정합니다.
- `document.hidden=true`가 되면 running game을 자동 pause합니다.
- Durable checkpoint는 2초 이내 throttled write, `visibilitychange`의 hidden 진입, scene `deactivate()`처럼 page가 정상 실행 중인 시점에 앞당겨 수행합니다. Web Locks 사용 환경의 모든 durable write는 lock 안에서 끝내며 unload event가 새 비동기 lock 획득을 완료하리라 가정하지 않습니다.
- `pagehide.persisted=true`에서는 `VISIBILITY` pause만 적용하고 scene을 destroy하지 않아 BFCache state를 보존합니다. 새 save write를 시작하지 않고 마지막 완료 checkpoint를 사용합니다.
- `pagehide.persisted=false`에서는 Web Locks mode라면 새 write를 생략하고, lock을 쓰지 않는 승인된 synchronous localStorage fallback에서만 revision을 다시 확인할 수 있을 때 best-effort checkpoint를 허용합니다. 그 뒤 active module을 best-effort destroy하며 unload 시 async 작업 완료에 의존하지 않습니다.
- `pageshow.persisted=true`에서는 ResizeManager·device pixel ratio·audio context·save revision을 다시 동기화하되 `VISIBILITY` pause를 유지해 사용자의 명시적 resume 전 game을 진행하지 않습니다.
- scene 이탈 시 active RAF ID를 취소하고 callback reference를 제거합니다.

### 10.1.1 Pause reason 합성

MiniGameHost는 `Set`으로 `MANUAL`, `VISIBILITY`, `MODAL`, `SYSTEM` pause reason을 관리합니다.

```txt
reason count 0 -> 1
  -> module.pause(firstReason)

reason count 1 이상
  -> game은 계속 PAUSED, 추가 pause() 호출 없음

reason count 1 -> 0
  -> module.resume()
```

- 수동 pause 중 tab이 hidden·visible로 바뀌어도 `MANUAL` reason이 남아 있으므로 자동 resume하지 않습니다.
- visibility 복귀 시 `VISIBILITY` reason을 즉시 제거하지 않고 pause overlay에서 사용자의 resume 입력을 받습니다.
- modal이 닫혀도 다른 pause reason이 남아 있으면 game을 재개하지 않습니다.
- 같은 reason의 중복 add·remove는 state를 바꾸지 않습니다.
- scene 이탈 시 pause reason set과 overlay를 함께 정리합니다.

## 10.2 InputManager

- keyboard, pointer, touch를 common action으로 변환합니다.
- button press, hold, release를 구분합니다.
- map 이동은 hold 상태를 사용하고, dialogue·submit·judge는 press edge만 사용합니다.
- touch control에 `touch-action`을 지정해 browser scroll·zoom과 충돌하지 않게 합니다.
- pointer capture가 해제되거나 touch가 취소되면 hold state를 즉시 초기화합니다.
- modal이 열리면 허용된 action 외에는 차단합니다.
- game module은 raw `keydown`, `touchstart`를 직접 등록하지 않습니다.

## 10.3 ResizeManager와 기준 좌표계

- world·physics는 game별 logical width·height 기준으로 계산합니다.
- viewport에 맞춰 uniform scale을 계산하고 남는 영역은 background 또는 letterbox로 처리합니다.
- dot asset은 가능한 integer scale을 우선하고 CSS `image-rendering: pixelated`를 사용합니다.
- high-DPI screen에서는 Canvas backing store에 device pixel ratio를 반영하되 world coordinate는 바꾸지 않습니다.
- resize와 orientation change는 state reset이 아니라 renderer layout update만 수행합니다.
- mobile safe area는 `env(safe-area-inset-*)`를 반영합니다.

## 10.4 AssetLoader

- asset manifest는 `contentVersion` envelope와 `assets[]`의 `id`, `type`, `src`, `required`, `group`, `alt`, `sourceRef`를 가집니다. Audio처럼 시각 대체 text가 필요 없는 type은 schema에서 `alt` optional 조건을 명시합니다.
- common group과 mini game group을 분리합니다.
- Registry의 `configAssetId`는 같은 game group의 required `json` entry로 resolve하고, AssetLoader가 fetch·cache한 JSON을 schema validation한 뒤 `init()`에 전달합니다. Registry와 module은 config URL을 직접 조합하지 않습니다.
- image decode 완료 후 ready로 처리합니다.
- 동일 source 요청은 같은 Promise를 공유해 중복 load를 막습니다.
- load Promise가 reject되면 cache에서 제거해 `다시 시도`가 새 request를 만들 수 있게 합니다.
- required asset 실패는 scene start를 막고 retry합니다.
- optional sound 실패는 visual feedback만으로 진행할 수 있게 degrade합니다.
- AssetLoader가 decoded resource와 object URL의 유일한 owner입니다. SceneRouter transition이 `acquireGroup()` lease를 받고 성공한 MiniGameHost에만 ownership을 transfer합니다. Module은 resource handle만 사용하고 lease나 URL을 직접 release·revoke하지 않습니다.
- Route 취소, import·factory·init 실패는 transition signal abort와 generation 무효화 뒤 partial instance를 먼저 best-effort `destroy()`하고, transition `finally`에서 아직 transfer되지 않은 lease를 release합니다. 늦게 끝난 init continuation은 9.1의 disposed·signal guard 때문에 해제된 handle을 다시 사용하지 않습니다.
- 정상 이탈은 MiniGameHost가 module `destroy()`를 호출한 뒤 보유 lease를 release합니다.
- Runtime `ERROR`도 terminal event를 확정한 뒤 정상 이탈과 같은 순서로 module `destroy()`와 host lease release를 끝내고 ErrorScene으로 이동합니다.
- Group reference count가 0이고 cache eviction 대상일 때만 AssetLoader가 object URL과 decoded resource를 해제합니다. Common group은 app 종료까지 유지하고, 공유 중인 source는 한 consumer의 destroy로 revoke하지 않습니다.

## 10.5 SceneRouter

- `mount → activate → deactivate → unmount` 순서를 보장합니다.
- current scene을 unmount하기 전에 next scene 준비 실패 가능성을 처리합니다.
- transition animation 중 route action을 잠급니다.
- route 요청마다 증가하는 transition generation ID와 `AbortController`를 만듭니다.
- 새 route나 cancel이 발생하면 JSON·asset fetch를 abort하고, `await` 뒤 generation이 달라진 stale 결과는 mount하지 않습니다.
- native dynamic `import()`는 중간 취소할 수 없으므로 늦게 resolve된 module은 generation을 확인해 instance를 만들지 않고 참조를 버립니다.
- module import 자체가 실패한 경우 동일 page에서 성공을 가장하지 않고 error scene의 `페이지 다시 불러오기`를 제공합니다. JSON·image·audio 실패 retry와 module reload 정책을 구분합니다.
- 전환이 획득한 asset lease는 mount 성공 전까지 transition 소유이며 모든 cancel·throw 경로의 `finally`에서 정확히 한 번 반환합니다.
- map → dialogue처럼 overlay로 처리 가능한 화면과 full scene 전환을 구분합니다.
- `minigame-play → result`는 active MiniGameScene을 유지하는 overlay 전환입니다. Retry는 `restart({attemptId})`, map·menu 이동은 `destroy()` 후 unmount를 사용합니다.
- ResultOverlay는 SceneRouter history에 별도 scene으로 쌓지 않고 MiniGameScene이 소유합니다. COMPLETED 뒤 mount해 focus를 가두고, retry 시 unmount 후 play focus를 복원하며, map·menu 이동 시 overlay를 먼저 닫고 module을 destroy합니다.
- main menu 이동은 진행 중 game 포기 여부를 확인한 뒤 수행합니다.

## 10.6 Map, player, collision

- player movement는 normalized vector와 `deltaTime`으로 계산해 대각선 속도를 보정합니다.
- map bounds, building, decoration collision을 별도 layer로 관리합니다.
- collision resolution은 player가 obstacle을 통과하거나 끼이지 않게 axis별로 처리합니다.
- NPC interaction 가능 여부는 world distance와 현재 scene state로 판정합니다.
- 대화나 menu가 열려 있으면 movement update를 중단합니다.
- map 복귀 시 player 위치가 collision 내부라면 가장 가까운 안전 위치로 보정합니다.

## 10.7 DialogueManager

- script ID로 data를 load하고 current line index를 관리합니다.
- intro에서는 이전·다음·skip을 지원합니다.
- NPC dialogue는 next와 종료·game start action을 지원합니다.
- 빠른 연속 입력으로 line이 건너뛰지 않도록 짧은 input lock 또는 frame lock을 둡니다.
- skip은 중간 line event를 실행하지 않고 `nextAction`만 정확히 한 번 수행합니다.
- focus는 dialogue 안에 유지하고 종료 뒤 원래 상호작용 대상 또는 Canvas로 돌려줍니다.

## 10.8 SaveManager

- read, validate, migrate, write, reset 책임을 한 module에 둡니다.
- `appId`와 `storageChannel`에서 허용된 namespace를 조합하며 임의 key prefix를 받지 않습니다.
- memory state를 먼저 갱신한 뒤 직렬화하며, write 실패가 gameplay를 crash시키거나 현재 HUD 진행을 되돌리지 않게 합니다.
- CLEAR result는 game record를 갱신하고, 승인된 NPC completionRule도 만족할 때 해당 NPC record를 같은 transaction에서 갱신해 한 번만 write합니다.
- MapScene의 변경된 위치는 throttled checkpoint와 deactivate 시점에만 write합니다.
- result가 중복 전달되어도 `playCount`가 두 번 증가하지 않게 session ID 또는 completion guard를 사용합니다.
- known version migration, corrupt backup 1개 보존, future version 보호를 담당합니다.
- 진행만 초기화하는 payload rewrite와 현재 channel 전체 local data 삭제를 별도 method로 제공합니다.
- persistence mode는 `READ_WRITE`, `UNAVAILABLE`, `READ_ONLY_INCOMPATIBLE`, `STALE_TAB_WRITE_BLOCKED` 중 하나이며 뒤 세 mode에서는 원본 key를 쓰지 않습니다.
- 각 write 전에 revision을 비교하고 성공 시 1 증가시킵니다. 승인된 환경에서는 Web Lock 안에서 수행하고, 그 외에는 `storage` event나 mismatch로 감지한 stale write만 차단합니다. LocalStorage fallback을 원자적 CAS로 설명하지 않습니다.
- `READ_WRITE`의 일시적인 단일 write 실패는 `dirty=true`로 표시하고 capped backoff를 적용해 다음 explicit result·setting·map checkpoint에서 재시도합니다. 성공 전 persisted revision은 증가시키지 않으며 매 retry에서 current revision을 다시 읽습니다.
- `QuotaExceededError`, `SecurityError`, storage capability probe 실패처럼 같은 원본 key를 안전하게 쓸 수 없는 오류는 즉시 `UNAVAILABLE`로 전환하고 자동 retry를 중단합니다. Parse·future-version·stale-tab 오류는 각각 corrupt recovery, `READ_ONLY_INCOMPATIBLE`, `STALE_TAB_WRITE_BLOCKED` 경로로 보내 `UNAVAILABLE`과 섞지 않습니다.
- `UNAVAILABLE`에서 `READ_WRITE`로 돌아가는 유일한 경로는 Settings의 명시적 `저장 다시 확인` 또는 승인된 reset action입니다. 작은 probe key의 write→read→delete가 성공하면 current key revision을 다시 load·validate한 뒤 dirty snapshot을 flush하고, 실패하면 `UNAVAILABLE`을 유지합니다. 자동 interval probe로 사용자에게 반복 prompt를 만들지 않습니다.
- Web Locks mode에서는 result·setting·throttle·deactivate·reprobe를 포함한 모든 durable write를 channel lock 안에서 수행합니다. `pagehide`는 이 invariant를 우회하는 synchronous write를 만들지 않습니다.

## 10.9 AudioManager

- browser autoplay 제한에 맞춰 최초 사용자 gesture 후 audio context를 시작합니다.
- master, BGM, SFX channel을 분리합니다.
- scene 전환 시 BGM fade 또는 정지를 일관되게 처리합니다.
- pause 시 timing이 중요한 SFX와 BGM 상태를 보존합니다.
- mute 상태에서도 판정, 위험, timer 경고를 visual cue로 제공합니다.

## 10.10 Modal과 input lock

다음 상태에서는 background input을 차단합니다.

- loading 및 asset retry
- story·NPC dialogue
- game guide
- pause menu
- recipe book이 modal로 동작하는 경우
- clear·fail result
- error recovery

lock은 reference count 또는 owner ID로 관리해 한 overlay를 닫았다고 다른 overlay의 lock까지 풀리지 않게 합니다.

## 10.11 Random과 reproducibility

- 무작위 생성은 game 시작 시 필요한 목록을 먼저 구성하고 수량 조건을 검증합니다.
- 숫자 야구는 0~9 unique sample 3개를 생성합니다.
- AI Ball은 정답 5개와 오답 25개가 정확히 포함된 spawn queue를 만듭니다.
- cyber mixed wave와 egg type은 확정된 weight를 config에서 읽습니다.
- 개발 QA에서는 선택적으로 seed를 주입해 동일 scenario를 재현할 수 있게 합니다.
- production UI에는 answer나 seed를 노출하지 않습니다.

---

## 11. 미니게임별 구현 계획

이 장은 5개 미니게임을 동일한 형식으로 정리합니다. 원문에서 확정된 rule은 그대로 유지하고, 통합에 필요한 technical contract는 구현 기준으로 명시하며, 기획 판단이 필요한 값은 `TBD`로 남깁니다.

## 11.1 데이터사이언스전공 - 숫자 야구

### 11.1.1 기본 정보

| 항목 | 내용 |
| --- | --- |
| Mini game ID | `data-number-baseball` |
| 게임명 | 숫자 야구 |
| 담당 학과·전공 | 데이터사이언스전공 |
| 작성자 | 오지우 |
| 장르 | 숫자 야구 기반 추론 mini game |
| 핵심 표현 | Strike → Fit, Ball → Shift, Out → Outlier, 시도 → Epoch |

### 11.1.2 목표와 상태 흐름

0~9에서 생성한 중복 없는 3개 숫자와 각 위치를 9 Epoch 안에 맞힙니다.

```txt
INITIALIZE_ANSWER
  -> GUIDE
  -> INPUT
  -> VALIDATE
  -> JUDGE
  -> RECORD
  -> CLEAR, if Fit = 3
  -> INPUT, if Fit < 3 and Epoch < 9
  -> FAIL, if Fit < 3 and Epoch = 9
```

### 11.1.3 핵심 state

```js
{
  answer: [],
  currentInput: [],
  history: [],
  epoch: 0,
  maxEpochs: 9,
  phase: "INPUT",
  inputLocked: false
}
```

`answer`는 game 종료 전 renderer, DOM, common event, save data에 노출하지 않습니다.

### 11.1.4 입력과 판정

1. game 시작 시 0~9에서 중복 없는 값 3개를 배열로 생성합니다.
2. 화면 keypad, keyboard number row, numpad를 같은 digit action으로 처리합니다.
3. 이미 선택한 digit은 추가하지 않고 중복 안내를 표시합니다.
4. 3개보다 적게 입력한 상태에서 `검증`을 누르면 제출을 막습니다.
5. 유효한 입력만 Epoch를 1 증가시킵니다.
6. 각 index가 같은 값은 Fit으로 계산합니다.
7. answer에 포함되지만 index가 다른 값은 Shift로 계산합니다.
8. `Outlier = 3 - Fit - Shift`로 계산합니다.
9. `Fit = 3`이면 즉시 clear합니다.
10. 9번째 유효 제출에서도 `Fit < 3`이면 answer를 공개하고 fail합니다.

판정 pseudo code:

```js
const fit = guess.filter((digit, index) => digit === answer[index]).length;
const shift = guess.filter(
  (digit, index) => digit !== answer[index] && answer.includes(digit)
).length;
const outlier = 3 - fit - shift;
```

answer와 input 모두 unique라는 validation을 통과한 뒤에만 위 식을 사용합니다.

### 11.1.5 화면 구성

| 영역 | 구성 | 처리 |
| --- | --- | --- |
| 상단 | `EPOCH n/9`, progress bar | 유효 검증 후 갱신 |
| 중앙 상단 | 3개 입력 slot | 입력 순서와 빈 slot 표시 |
| 중앙 | 과거 guess와 Fit·Shift·Outlier | Wordle형 누적, overflow 시 scroll |
| 하단 | 0~9 keypad | 선택·disabled·focus 상태 표시 |
| 하단 action | 지우기, 검증 | input validation과 중복 submit lock |

시각 원칙:

- 세로형 panel을 PC와 mobile 모두에서 유지합니다.
- background는 짙은 남색, 정보 강조는 neon 계열을 사용합니다.
- Fit은 초록, Shift는 노랑, Outlier는 분홍을 사용하되 text label과 icon을 함께 표시합니다.
- history가 추가돼도 input과 action button이 화면 밖으로 밀리지 않게 중앙 영역만 scroll합니다.

### 11.1.6 주요 parameter

| Parameter | 값 | 상태 |
| --- | --- | --- |
| digit range | 0~9 | 확정 |
| answer length | 3 | 확정 |
| duplicate | 허용하지 않음 | 확정 |
| max Epoch | 9 | 확정 |
| clear | `3 Fit` | 확정 |
| leading zero | `TBD` | D-08 |
| delete action | 마지막 digit 삭제 또는 전체 초기화 `TBD` | D-08 |
| time limit | 적용 여부 `TBD` | D-08 |
| retry penalty | `TBD` | D-08 |

### 11.1.7 예외 처리

- 빈 input이나 1~2자리 input은 Epoch를 소비하지 않습니다.
- 4번째 digit 입력은 무시하고 현재 3자리를 유지합니다.
- 중복 digit은 input 단계에서 차단하고 어느 숫자가 중복인지 알려 줍니다.
- 판정 animation 중 keypad, 검증, keyboard submit을 잠급니다.
- fail 결과에서만 answer를 공개합니다. clear에서는 player input이 answer와 같으므로 별도 비밀값 노출 문제가 없습니다.
- restart는 answer, input, history, Epoch, scroll position, input lock을 모두 초기화합니다.

### 11.1.8 완료 기준

- unique 3-digit answer를 생성합니다.
- 모든 가능한 answer·guess 조합에서 Fit·Shift·Outlier 합이 3입니다.
- invalid submit은 history와 Epoch를 변경하지 않습니다.
- 유효 결과가 순서대로 누적되고 9개까지 scroll로 확인됩니다.
- 9회 안의 `3 Fit`은 `CLEAR`, 9번째 실패는 answer 공개와 `FAIL`을 정확히 한 번 반환합니다.
- mouse, touch, keyboard digit input이 같은 state를 만듭니다.
- restart와 map 복귀 후 이전 listener가 남지 않습니다.
- D-08 결정값이 config·help text·기록 UI·record policy에 일치합니다.

---

## 11.2 사이버보안학과 - CLICK to PURIFY

### 11.2.1 기본 정보

| 항목 | 내용 |
| --- | --- |
| Mini game ID | `cyber-click-to-purify` |
| 게임명 | CLICK to PURIFY (가칭) |
| 담당 학과·전공 | 사이버보안학과 |
| 작성자 | 강초현 |
| 장르 | timing click형 defense game |
| 방어 대상 | `SECURITY CORE` |
| 악성코드 | `TROJAN`, `WORM`, `RANSOM`, `SPYWARE` |

### 11.2.2 목표와 상태 흐름

외곽 8방향에서 접근하는 악성코드를 고유 rule에 맞춰 판정 ring에서 정화하고 SECURITY CORE를 지킵니다.

```txt
READY: SYSTEM STATUS: SECURED
  -> WAVE_SPAWN
  -> APPROACH
  -> JUDGE_WINDOW
  -> RESOLVE
  -> next WAVE, while wave < TOTAL_WAVES (현재 초안 14)
  -> FINAL_JUDGE
  -> CLEAR or FAIL

Any running state
  -> FAIL, if Miss >= MISS_LIMIT (현재 초안 3)
  -> FAIL, if elapsed > TIME_LIMIT (현재 초안 약 55초)
```

### 11.2.3 Wave 구성

아래 4개 학습 + 10개 혼합 구성은 현재 balance 초안이며 D-04에서 final 값을 승인합니다.

| 구간 | Wave | 구성 |
| --- | --- | --- |
| 학습 | 1 | Trojan 단독 |
| 학습 | 2 | Worm 단독 |
| 학습 | 3 | Ransomware 단독 |
| 학습 | 4 | Spyware 단독 |
| 혼합 | 5~14 | 4종 random 조합, 후반에 속도 증가·간격 축소·Worm/Ransom 비중 증가 |

혼합 wave의 동시 object 수, type weight, Ransom 총 등장 1~2회 보장 방식은 config로 관리합니다. 최종 값은 playtest 전에 확정합니다.

### 11.2.4 Timing 판정

판정 시점은 malware가 ring 중심 판정 위치에 도달하는 target timestamp와 `PRIMARY_ACTION` timestamp의 차이로 계산합니다.

```txt
absolute error <= 0.2s        -> Perfect
0.2s < absolute error <= 0.5s -> Good
otherwise                     -> Miss
```

경계 중복을 피하기 위해 Perfect 조건을 먼저 검사합니다. 위 수치는 초안이며 playtest 결과에 따라 config에서 조정합니다.

- CLICK 가능한 active threat가 있으면 D-05에서 확정한 target selection policy로 한 대상을 고르고 timestamp 오차를 판정합니다.
- 선택된 threat가 Good 범위 밖이면 조기·지연 click 모두 Miss로 처리합니다.
- CLICK 가능한 target이 없는 상태의 click도 범위 밖 click으로 보고 Miss를 1회 반영합니다.
- 단, 위장 중인 Trojan만 존재할 때의 click은 명세의 고유 예외에 따라 무효이며 아무 판정도 만들지 않습니다.
- unresolved threat가 `targetAt + goodOuterWindow`를 지나도록 click되지 않으면 자동 Miss로 정확히 한 번 resolve합니다. 이후 Worm split, Ransom lock 등 type별 Miss 후처리를 같은 resolver에서 실행합니다.

정화도 계산은 `D-04` 확정 전까지 final rule로 구현하지 않습니다. 다음 항목을 함께 결정해야 합니다.

- Perfect와 Good의 base weight
- 모든 유효 threat의 최대 점수 합과 0~100 normalization
- Worm split child가 분모에 포함되는지 여부
- Good이 포함되어도 100% clear가 가능한지 여부
- 현재 초안의 14 wave 종료 후 정화도 100% 미만이지만 초안 Miss limit 미만일 때의 결과

### 11.2.5 악성코드별 rule

위장·분열·잠금·은신이라는 행동은 원문 요구이며, 아래 표의 횟수·시간·구간 수치는 D-04 승인이 필요한 초안입니다.

| Type | 시각·상태 | 고유 처리 |
| --- | --- | --- |
| Trojan | 녹색 정상 파일 위장 → ring 약 0.5초 전 빨간색 reveal | 위장 중 click은 무효이며 판정 없음, reveal 후 공통 판정 |
| Worm | 진한 녹색 | Miss 시 2개로 split, split 최대 1회, child Miss 후 소멸 |
| Ransomware | 보라색과 lock icon | Miss 시 약 1.5초간 CLICK input 완전 lock |
| Spyware | 회청색, 낮은 opacity | 접근 마지막 30~40%에서 점차 reveal, 공통 timing 판정 |

Worm child는 화면 밖 또는 서로 겹치는 위치에 만들지 않습니다. Ransom lock timer는 pause 동안 흐르지 않습니다.

### 11.2.6 핵심 state

```js
{
  phase: "READY",
  waveIndex: 0,
  activeThreats: [],
  purification: 0,
  perfectCount: 0,
  goodCount: 0,
  missCount: 0,
  clickLockedUntil: null,
  elapsedMs: 0,
  inputCooldownUntil: 0
}
```

각 threat는 unique ID, type, spawn direction, spawnedAt, targetAt, revealed, splitDepth, resolved 상태를 가집니다.

### 11.2.7 화면 구성

| 영역 | 구성 | 처리 |
| --- | --- | --- |
| 상단 좌측 | purification bar와 percentage | 판정 결과 후 갱신 |
| 상단 우측 | Miss icon 3개 | Miss마다 1개 소모, 색+문구 병행 |
| 중앙 | SECURITY CORE, judgement ring | 접근 target과 위험 상태 표시 |
| 외곽→중앙 | 4종 malware와 영문 label | 8방향 spawn과 고유 effect |
| 하단 | `CLICK` button | click·touch·keyboard primary action |
| Overlay | Ransom lock | 남은 lock 상태와 disabled 이유 표시 |

MVP logic 단계에서는 명세에 따라 단색 도형, 단순 원 ring, 기본 button으로 검증할 수 있습니다. final 제출 시 art team asset 적용 여부를 source list와 함께 확인합니다.

### 11.2.8 주요 parameter

| Parameter | 값 | 상태 |
| --- | --- | --- |
| total waves | 14, 학습 4 + 혼합 10 | 초안 |
| learning interval | 약 3초 | 초안 |
| mixed interval | 2.0~2.7초, 후반 축소 | 초안 |
| approach duration | 약 2.0초 | 초안 |
| Perfect window | ±0.2초 | 초안 |
| Good outer window | ±0.5초 | 초안 |
| Worm split max | 1회 | 초안 |
| Ransom lock | 약 1.5초 | 초안 |
| Spyware reveal | 경로 마지막 30~40% | 초안 |
| Miss limit | 3회 | 초안 |
| total time limit | 약 55초 | 초안 |
| clear | purification 100% | 초안, 계산 공식 D-04 |

### 11.2.9 Event hook

다음 hook을 정확한 state transition에서 한 번씩 발생시킵니다.

| Event | 조건 |
| --- | --- |
| `OnWaveSpawn` | threat 생성과 active list 등록 완료 |
| `OnTrojanReveal` | Trojan이 최초 reveal 상태로 바뀜 |
| `OnWormSplit` | parent resolve와 child 2개 생성 완료 |
| `OnRansomLock` | input lock 시작 |
| `OnRansomUnlock` | lock timer 종료 |
| `OnClickInput` | lock되지 않은 CLICK 입력을 판정 전에 수신한 모든 시점, 범위 밖·Trojan 위장 입력 포함 |
| `OnJudgePerfect` | Perfect 확정 |
| `OnJudgeGood` | Good 확정 |
| `OnJudgeMiss` | Miss 확정 |
| `OnGameClear` | clear result 확정 |
| `OnGameOver` | fail result 확정 |

### 11.2.10 예외 처리

- 위장 중 Trojan click은 `Miss`도 `Perfect`도 아닌 무효 입력입니다.
- target이 없거나 Good 범위 밖인 click은 Miss입니다. 위장 중인 Trojan click만 예외입니다.
- 동시에 여러 threat가 window에 들어온 경우 target selection policy를 `D-05`에서 확정합니다.
- Ransom lock 중 도달한 다른 threat 처리도 `D-05`에서 확정합니다.
- double click·연타는 cooldown 안에서 한 판정만 소비합니다.
- 한 threat는 `resolved=true`가 된 뒤 다시 판정하지 않습니다.
- 미클릭 threat는 Good window 만료 시 자동 Miss로 resolve되어 화면에 계속 남지 않습니다.
- pause 시 wave spawn, approach, judge window, Ransom lock, total timer를 모두 정지합니다.
- 승인된 Miss limit, time limit, purification clear가 같은 update에서 발생할 때 priority를 한 함수로 결정하고 test합니다.

### 11.2.11 완료 기준

- D-04에서 승인된 wave 수와 학습 순서가 적용됩니다.
- 혼합 wave가 승인된 수량·weight·interval 조건을 만족합니다.
- target timestamp 기준 Perfect·Good·Miss boundary test가 통과합니다.
- click 없이 Good window를 넘긴 threat가 Miss 1회로 resolve되고 type별 후처리가 실행됩니다.
- Trojan 위장 입력, Worm split, Ransom lock, Spyware opacity transition이 D-04 승인값대로 동작합니다.
- 승인된 Miss limit과 time limit fail이 중복 result 없이 처리됩니다.
- pause·resume 후 wave와 판정 시간이 건너뛰지 않습니다.
- 지정된 11개 event hook이 정확한 시점과 횟수로 발생합니다.
- D-04와 D-05가 확정되어 clear formula와 동시 처리 test가 통과합니다.
- clear·fail 후 모든 object, timer, input listener를 정리합니다.

---

## 11.3 컴퓨터공학과 - Code Heart: Unlock!

### 11.3.1 기본 정보

| 항목 | 내용 |
| --- | --- |
| Mini game ID | `computer-code-heart` |
| 게임명 | Code Heart: Unlock! (가칭) |
| 부제 | 꼬여버린 마음의 코드 정화소 |
| 담당 학과·전공 | 컴퓨터공학과 |
| 작성자 | 이지안 |
| 장르 | 요리·제작 simulation형 조합 game |
| 핵심 표현 | `git add`, `git push` 또는 `UNLOCK`, `Build Error`, `Open Heart` |

### 11.3.2 목표와 상태 흐름

손님의 program 주문에 필요한 개발 재료를 recipe에 적힌 순서대로 최대 4개 slot에 담고 제출해 꼬인 마음의 code를 정화합니다.

기능 명세의 배경은 축제 메인 story를 `캐릭캐릭체인지` theme로 보고, 꼬여버린 X알과 X컴공생 손님이 찾아오는 설정입니다. 전체 기획안의 세계관은 아직 `TBD`이므로 이 설정을 ai-change 전역 canon으로 사용할지, Code Heart 내부 설정으로만 유지할지는 D-02에서 확정합니다. 결정 전까지 원문 설정을 삭제하지 않고 story data 후보로 보존합니다.

```txt
CUSTOMER_IN
  -> ORDER
  -> RECIPE / SELECT
  -> STAGE
  -> SUBMIT
  -> JUDGE
  -> SUCCESS -> next CUSTOMER or FINAL_CLEAR
  -> BUILD_ERROR -> penalty -> SELECT or CUSTOMER_TIMEOUT
  -> FAIL, if total time over
```

### 11.3.3 Order와 recipe data

아래는 `data/drafts/minigames/code-heart-orders.draft.json`에 두는 의사결정용 예시입니다.

```json
{
  "id": "mobile-game-easy",
  "difficulty": "EASY",
  "customerId": "customer-01",
  "request": "인기 모바일 게임을 만들고 싶어!",
  "recipe": ["unity", "csharp", "sprite-asset"],
  "allowDuplicateIngredients": { "status": "TBD", "value": null },
  "patienceMs": { "status": "TBD", "value": null },
  "rewardId": { "status": "TBD", "value": null }
}
```

`allowDuplicateIngredients`, `patienceMs`, `rewardId`는 D-06과 D-03이 확정될 때까지 draft에서만 위 상태로 유지합니다. Release order data에는 주문별 승인 boolean과 plain value를 넣고, reward를 사용하지 않기로 결정했다면 `rewardId`가 생략 가능한 field인지 release schema에 명시합니다.

대표 recipe 초안:

| 난이도 | 주문 | 순서가 있는 recipe |
| --- | --- | --- |
| Easy | 인기 모바일 게임을 만들고 싶어! | Unity → C# → Sprite asset |
| Normal | 지능형 AI chatbot 서비스를 런칭할래! | FastAPI → Python → PyTorch |
| Normal | 안전한 web shopping mall을 구축해줘! | Spring Boot → Java → MySQL |
| Hard(Git) | 꼬인 branch를 풀고 배포해줘! | `git fetch` → `git merge` → `commit` |

화면 시안에 언급된 Unity, Unreal, React, Spring, Python, C++, C#, Java, PyTorch, MySQL, Shader, API와 recipe에 추가로 등장하는 FastAPI, Spring Boot, Sprite asset, git command를 하나의 ingredient catalog에서 관리합니다. 실제 포함 목록과 4개 category 이름은 D-06에서 확정합니다.

### 11.3.4 조합 판정

- 선택한 ingredient ID 배열과 recipe ID 배열의 길이와 순서를 모두 비교합니다.
- 정확히 일치하면 order success입니다.
- 누락, 잘못된 재료, 순서 오류, 허용되지 않은 중복은 Build Error입니다.
- 최대 4개 slot을 초과하는 입력은 제출 전 차단합니다.
- `초기화`는 현재 staged ingredient만 비우고 customer와 timer는 유지합니다.
- Build Error 뒤 staged slot을 유지할지 비울지는 D-06에 포함해 확정합니다.

### 11.3.5 화면 구성

| 영역 | 구성 | 처리 |
| --- | --- | --- |
| 상단 header | title, stage, 정화된 알 수 후보, 남은 시간 | 전체 진행과 time over 표시 |
| 좌측 상단 | customer, X알, order bubble, patience | 현재 주문과 개별 제한 표시 |
| 우측 상단 | recipe book | order별 조합과 순서를 popup으로 표시 |
| 중앙 | 최대 4개 workbench slot, 초기화 | 선택 순서 번호와 재료 이름 표시 |
| 하단 | ingredient grid | category별 재료 선택 |
| 우측 하단 | `git push` 또는 `UNLOCK` | submit과 중복 입력 lock |

Code Heart의 game 내부 시각은 원문대로 분홍·연두 계열의 casual 제작소를 유지합니다. D-01의 공통 brand palette는 이 game 고유 palette를 없애지 않는 범위에서 shell, modal, navigation에 적용합니다.

### 11.3.6 핵심 state

```js
{
  phase: "CUSTOMER_IN",
  orderIndex: 0,
  activeOrderId: null,
  stagedIngredientIds: [],
  completedOrders: 0,
  failedOrders: 0,
  buildErrorCount: 0,
  customerPatienceMs: null,
  totalRemainingMs: null,
  inputLocked: false
}
```

### 11.3.7 주요 parameter

| Parameter | 값 | 상태 |
| --- | --- | --- |
| workbench slot | 최대 4개 | 확정 |
| ingredient category | 4개 영역 | 개수만 확정, 명칭 D-06 |
| duplicate ingredient | 주문별 허용 여부 `TBD` | D-06, release order에 boolean 필수 |
| order count | `TBD` | D-06 |
| customer patience | `TBD` | D-06 |
| total time | `TBD` | D-06 |
| Build Error penalty | 시간 또는 patience 차감 `TBD` | D-06 |
| clear condition | 완료 order·정화된 알·heart 중 `TBD` | D-06 |
| submit label | `git push` 또는 `UNLOCK` | D-06 |
| reward | heart·정화된 알·경험치 등 `TBD` | D-03·D-06 |

### 11.3.8 예외 처리

- 4개 slot이 차면 추가 ingredient input을 막고 이유를 표시합니다.
- recipe 길이보다 적은 상태에서 submit을 막을지 Build Error로 처리할지 D-06에서 정합니다.
- 동일 ingredient의 중복 허용은 order data의 명시적 flag로만 허용합니다.
- recipe book을 열었을 때 customer patience와 total time을 멈출지 D-06에서 정합니다.
- 초기화·submit 연타는 한 action만 처리합니다.
- customer timeout과 submit이 같은 frame에 발생할 때 priority를 확정해 test합니다.
- Build Error effect 중 다음 submit을 차단합니다.
- order data의 ingredient가 catalog에 없으면 game 시작 전에 config error로 처리합니다.

### 11.3.9 완료 기준

- customer와 order data가 순서대로 load됩니다.
- recipe book에서 현재 order의 재료와 순서를 확인할 수 있습니다.
- ingredient 선택 순서가 최대 4개 slot에 정확히 반영됩니다.
- 초기화가 slot만 안전하게 비웁니다.
- exact array match만 success이고 누락·오재료·순서 오류는 Build Error입니다.
- 각 order의 중복 재료 허용·금지가 D-06 승인 boolean과 일치하고 허용되지 않은 중복만 Build Error입니다.
- timer와 patience가 D-06에서 확정한 pause·penalty rule을 따릅니다.
- customer timeout, total timeout, final clear가 중복 result를 만들지 않습니다.
- 비전공자 사용자가 recipe book만 보고 대표 order를 완료할 수 있는지 usability test를 수행합니다.
- D-03·D-06의 이름, 수치, 보상, clear 기준이 UI·data·result에 일치합니다.

---

## 11.4 인공지능학부 - AI Ball Classification Game

### 11.4.1 기본 정보

| 항목 | 내용 |
| --- | --- |
| Mini game ID | `ai-ball-classification` |
| 게임명 | AI Ball Classification Game (가칭) |
| 담당 학과·전공 | 인공지능학부 |
| 작성자 | 원문 미기재 |
| 장르 | image 분류 기반 timing·toggle game |
| 조작 | `OPEN/CLOSE` 1-button toggle |
| 원문 성공 UI | `클리어!`, `[수호알 획득하기]` |
| 원문 실패 UI | `실패!`, 실패 사유, `[처음부터 다시하기]` |

### 11.4.2 목표와 상태 흐름

상단의 목표 image와 같은 정답 공 5개만 분류통에 담고, 다른 image의 오답 공 25개는 통과시킵니다.

```txt
GUIDE
  -> TARGET_SELECT
  -> COUNTDOWN: 3s
  -> SPAWN / MOVE / TOGGLE / JUDGE
  -> FAIL immediately, if wrong ball collected
  -> FAIL immediately, if target ball lost
  -> CLEAR, after all 30 balls are resolved with 5 targets collected and 25 non-targets passed
  -> RESULT
```

5번째 정답 공을 먼저 수집했더라도 남은 오답 공이 있으면 계속 진행합니다. 정답 5개를 모두 수집하고 오답 25개를 모두 통과시켜 총 30개 공의 처리가 끝났을 때 clear합니다. 이는 원문의 `정답 5개 수집` 성공 조건과 `오답 25개 모두 통과`·전체 공 처리 흐름을 함께 만족시키기 위한 **통합 구현 기준**이며, 기획팀이 다른 종료 시점을 승인하면 D-07에 변경 이력을 남깁니다.

### 11.4.3 Spawn queue

1. game 시작 시 허용된 target catalog에서 목표 image 1개를 무작위로 선택합니다.
2. target과 같은 정답 object 5개, 다른 image의 오답 object 25개를 생성합니다.
3. 총 30개 object를 shuffle해 spawn queue를 만듭니다.
4. random interval 범위와 같은 type의 연속 등장 제한은 D-07에서 확정합니다.
5. queue 생성 뒤 정답·오답 수량을 다시 검증합니다.
6. countdown 종료 전에는 공을 이동시키지 않습니다.

### 11.4.4 이동과 판정

- 공은 logical world의 왼쪽 spawn point에서 오른쪽으로 일정 속도로 이동합니다.
- lid는 `OPEN`, `CLOSED`, 필요 시 `TRANSITIONING` state를 가집니다.
- button input은 state를 한 번만 toggle하고 label·color·ARIA state를 즉시 동기화합니다.
- lid는 공이 튀지 않도록 분류통 내부 방향으로 열리는 animation을 사용합니다.
- 정답 수집은 공의 center point가 정의된 bin capture region 안에 진입했을 때 확정합니다.
- 정답 공이 capture되지 않은 채 오른쪽 despawn line을 넘으면 즉시 fail합니다.
- 오답 공이 capture region에 들어가면 즉시 fail합니다.
- 오답 공이 오른쪽 despawn line을 넘으면 정상 처리 수를 증가시킵니다.
- 한 공이 capture와 despawn으로 중복 판정되지 않도록 `resolved` flag를 사용합니다.

### 11.4.5 화면 구성

| 영역 | 구성 | 처리 |
| --- | --- | --- |
| Guide overlay | rule, clear·fail 조건, start | 중앙 하단 start button |
| 상단 중앙 | 목표 image card | 3초 countdown 전부터 고정 표시 |
| 상단 | `성공: n/5`, help | target 수집 진행과 rule 재확인 |
| 중앙 | 좌→우 rail·track, moving balls | spawn, 이동, type별 image 표시 |
| 하단 우측 | bin과 내부 방향 lid | capture 영역과 OPEN/CLOSED 시각화 |
| Lid 옆 | `OPEN/CLOSE` button | lid와 같은 높이에 배치하고 현재 state text·color 동기화 |
| Result | clear 또는 fail 사유 | 원문 label, retry와 map 복귀, reward action은 D-03 적용 |

### 11.4.6 핵심 state

```js
{
  phase: "GUIDE",
  targetClassId: null,
  spawnQueue: [],
  activeBalls: [],
  lidState: initialLidStateFromConfig,
  targetCollected: 0,
  targetMissed: 0,
  wrongCollected: 0,
  ballsResolved: 0,
  countdownMs: 3000,
  inputLocked: true
}
```

`initialLidStateFromConfig`는 D-07 확정 후 release config의 `OPEN` 또는 `CLOSED`를 읽습니다. 승인 전 draft value를 runtime state에 넣지 않습니다.

### 11.4.7 주요 parameter

| Parameter | 값 | 상태 |
| --- | --- | --- |
| target class | game당 1개 | 확정 |
| target balls | 5개 | 확정 |
| non-target balls | 25개 | 확정 |
| total balls | 30개 | 확정 |
| countdown | 3초 | 확정 |
| control | 1-button toggle | 확정 |
| clear | 정답 5개 수집 + 오답 25개 통과 후 총 30개 처리 완료 | 통합 구현 기준 |
| ball speed | `TBD` | D-07 |
| spawn interval | random range `TBD` | D-07 |
| initial lid state | `TBD` | D-07 |
| target image catalog | `TBD` | D-07 |
| time limit | 적용 여부 `TBD` | D-07 |

### 11.4.8 예외 처리

- 빠른 연타에서도 lid state, animation target, button label이 서로 어긋나지 않아야 합니다.
- lid animation 중 추가 toggle을 queue할지 마지막 input만 적용할지 D-07에서 확정합니다.
- 공 center가 capture boundary에 정확히 놓인 경우 포함 여부를 collision helper 한 곳에서 처리합니다.
- 실패 확정 즉시 spawn, movement, countdown, input을 정지합니다.
- result overlay가 열린 뒤 background game input을 차단합니다.
- 여러 공이 동시에 존재할 수 있다면 최소 간격과 겹침 rule을 D-07에서 확정합니다.
- 마지막 공 처리 update에서는 먼저 해당 공의 fail 조건을 판정하고, fail이 없을 때만 전체 30개 처리와 target 5개 수집 조건으로 clear합니다.

### 11.4.9 완료 기준

- 목표 image가 game 시작마다 허용 catalog 안에서 무작위로 선택되고 상단에 고정됩니다.
- 3초 countdown 뒤에만 공이 움직입니다.
- queue에는 정답 5개와 오답 25개가 정확히 들어 있습니다.
- OPEN/CLOSE를 mouse, touch, keyboard로 조작할 수 있고 UI state와 실제 collision state가 일치합니다.
- 정답 수집, 정답 유실, 오답 통과, 오답 수집 판정이 object당 한 번만 발생합니다.
- fail 발생 후 모든 공과 입력이 즉시 정지합니다.
- retry는 target, queue, count, lid, timer를 모두 초기화합니다.
- 5번째 target을 수집해도 미처리 공이 남아 있으면 계속 진행하고, 총 30개를 올바르게 처리한 뒤에만 clear합니다.
- D-07의 speed, interval, initial state, 개폐 중 input rule이 config·help·test에 일치합니다.

---

## 11.5 인공지능데이터사이언스학부 - 인지알·데사알 분류 게임

### 11.5.1 기본 정보

| 항목 | 내용 |
| --- | --- |
| Mini game ID | `ai-data-egg-sort` |
| 게임명 | 인지알·데사알 분류 게임 (가칭) |
| 담당 학과·전공 | 인공지능데이터사이언스학부 |
| 작성자 | 허다연 |
| 장르 | 낙하 object 분류·순발력 game |
| 조작 | 좌·우 button 2개 |
| play time | 45초 |

### 11.5.2 목표와 상태 흐름

무작위로 떨어지는 인지알과 데사알을 판별하고 발판을 좌우로 기울여 인지알은 왼쪽 인지 box, 데사알은 오른쪽 데사 box로 보냅니다.

```txt
START
  -> timer = 45s, lives = 5, platform = LEFT
  -> SPAWN
  -> FALL
  -> PLATFORM_COLLISION
  -> ROLL_LEFT or ROLL_RIGHT
  -> BOX_JUDGE or LOST
  -> next SPAWN
  -> CLEAR, if timer reaches 0 with lives >= 1
  -> FAIL, if lives reaches 0
```

### 11.5.3 Spawn와 난이도

| 경과 시간 | Spawn interval | 상태 |
| --- | --- | --- |
| 0~10초 | 3.5초 | 확정 수치, boundary D-09 |
| 10~25초 | 2.5초 | 확정 수치, boundary D-09 |
| 25~45초 | 1.5초 | 확정 수치, boundary D-09 |

- 인지알·데사알 type은 config의 probability로 선택합니다.
- 정확한 probability와 fall speed는 D-09에서 확정합니다.
- 동시에 존재 가능한 egg 수와 spawn 직후 준비시간도 D-09에서 정합니다.
- spawn scheduler는 pause duration을 제외한 elapsed game time을 사용합니다.

### 11.5.4 발판과 판정

- 발판은 game 시작 시 왼쪽 방향입니다.
- 좌·우 input은 목표 방향을 바꾸고 0.2초 transition을 시작합니다.
- transition 중 추가 input이 오면 마지막 입력 기준으로 목표 상태를 갱신합니다.
- egg가 발판에 충돌하는 순간 사용할 방향은 D-09에서 `현재 물리 각도` 또는 `마지막 목표 방향` 중 하나로 확정합니다.
- 충돌 뒤 egg의 route를 확정해 같은 egg가 이후 발판 input의 영향을 받지 않게 합니다.
- 인지알이 왼쪽, 데사알이 오른쪽 box에 도착하면 correct입니다.
- 반대 box에 도착하거나 어느 box에도 들어가지 않고 화면을 벗어나면 wrong으로 처리하고 life를 1 줄입니다.
- box 접촉 50% 기준이 면적, 폭, center 중 무엇인지 D-09에서 collision rule로 확정합니다.

### 11.5.5 화면 구성

| 영역 | 구성 | 처리 |
| --- | --- | --- |
| 상단 좌측 | 45초 timer | 10초 이하에서 blink + text warning |
| 상단 우측 | heart 5개 | wrong마다 1개 감소, 남은 수 text 제공 |
| 상단 중앙 | spawn pipe | egg가 한 개씩 등장하는 기준 위치 |
| 중앙 | 0.2초 전환 platform | 좌·우 target과 current state 표현 |
| 하단 좌측 | 인지 box | 인지알 정답 위치, 고유 색+pattern+label |
| 하단 우측 | 데사 box | 데사알 정답 위치, 고유 색+pattern+label |
| 하단 control | 좌·우 button | touch·click·keyboard 대응 |

### 11.5.6 핵심 state

```js
{
  phase: "RUNNING",
  elapsedMs: 0,
  remainingMs: 45000,
  lives: 5,
  platformDirection: "LEFT",
  platformTargetDirection: "LEFT",
  platformTransitionMs: 0,
  activeEggs: [],
  correctCount: 0,
  wrongCount: 0,
  lostCount: 0,
  nextSpawnAt: 0
}
```

### 11.5.7 주요 parameter

| Parameter | 값 | 상태 |
| --- | --- | --- |
| total time | 45초 | 확정 |
| initial lives | 5 | 확정 |
| warning threshold | 남은 10초 이하 | 확정 |
| platform transition | 0.2초 | 확정 |
| initial direction | LEFT | 확정 |
| spawn interval | 3.5 → 2.5 → 1.5초 | 확정 수치, 경계 D-09 |
| box hit | 50% 이상 접촉 | 확정 표현, 계산 방식 D-09 |
| terminal rule | timer 0 시 life가 남으면 clear, life 0이면 fail | 각 조건 확정, 동시 발생 우선순위 D-09 |
| type probability | `TBD` | D-09 |
| fall speed | `TBD` | D-09 |
| retry | `TBD` | D-09 |

### 11.5.8 예외 처리

- transition 중 input과 collision이 같은 frame에 발생해도 한 번 정한 direction rule을 일관되게 적용합니다.
- 두 box의 collision region이 겹치지 않게 map validation을 수행합니다.
- egg는 `resolved` 뒤 box와 screen exit에서 다시 판정되지 않습니다.
- timer 0과 life 0이 서로 다른 update에 발생하면 먼저 도달한 terminal 조건을 즉시 적용합니다.
- timer 0과 life 0이 같은 update에 발생했을 때의 우선순위는 원문대로 D-09에서 확정합니다.
- timer 0 update에서는 같은 update의 life 0 후보와 D-09 우선순위를 먼저 적용합니다. Clear가 선택되면 즉시 result를 확정하고 spawn·movement·egg 판정을 모두 중단합니다. Active egg는 결과를 기다리거나 뒤집지 않으며, freeze·fade·즉시 제거 중 승인된 D-09 연출로만 정리합니다.
- pause 동안 timer, spawn schedule, fall, platform transition을 모두 정지합니다.
- warning blink는 motion 민감 사용자를 위해 text·color 변화와 함께 제공하고 과도한 flash를 피합니다.

### 11.5.9 완료 기준

- 45초, life 5, platform LEFT로 항상 같은 초기 state를 만듭니다.
- elapsed time 구간별 spawn interval이 정확히 바뀝니다.
- 좌·우 input 후 platform이 0.2초에 걸쳐 전환됩니다.
- collision 순간 확정된 route가 이후 input으로 바뀌지 않습니다.
- correct, wrong box, screen lost가 egg당 한 번만 판정됩니다.
- wrong마다 life가 정확히 1 감소하고 0에서 fail을 한 번 반환합니다.
- 남은 10초 이하에서 visual·text warning이 표시됩니다.
- pause·resume 후 timer와 spawn이 건너뛰지 않습니다.
- D-09의 probability, speed, spawn boundary, collision, 동시 terminal priority, retry rule이 config·help·test에 일치합니다.

---

## 11.6 공통 연결 matrix

| Mini game | Story 진입 | 주요 input | Clear outro | Fail outro | Retry |
| --- | --- | --- | --- | --- | --- |
| 숫자 야구 | 데이터사이언스 NPC | digit, delete, submit | `data-number-baseball-clear` | `data-number-baseball-fail` | D-08 반영 |
| CLICK to PURIFY | 사이버보안 NPC | primary action | `cyber-click-to-purify-clear` | `cyber-click-to-purify-fail` | 즉시 재시작, penalty 여부 D-05 |
| Code Heart | 컴퓨터공학 NPC | ingredient select, reset, submit | `computer-code-heart-clear` | `computer-code-heart-fail` | D-06 반영 |
| AI Ball Classification | 인공지능 NPC | OPEN/CLOSE toggle | `ai-ball-classification-clear` | `ai-ball-classification-fail` | 처음부터 재시작 |
| 인지알·데사알 | 인공지능데이터사이언스 NPC | left, right | `ai-data-egg-sort-clear` | `ai-data-egg-sort-fail` | D-09 반영 |

Script ID는 계획상의 stable ID입니다. 실제 JSON을 작성할 때 registry와 dialogue reference validation을 통과해야 합니다.

## 11.7 Game별 asset checklist

| Mini game | 필수 asset·시각 요소 |
| --- | --- |
| 숫자 야구 | 남색·neon panel, digit keypad, input slot, Epoch bar, Fit·Shift·Outlier record row |
| CLICK to PURIFY | SECURITY CORE, ring, 4종 malware와 label, Trojan 2상태, Worm split, Ransom lock, Spyware opacity, purification wave, Miss icon, gauge |
| Code Heart | customer·X알, order bubble, patience, recipe book, 4 slot, ingredient icon, reset·submit, Build Error·Open Heart effect |
| AI Ball | target card, 정답·오답 ball, track, inward lid, bin, OPEN/CLOSE state, countdown, result popup |
| 인지알·데사알 | 두 egg, pipe, platform, 두 box의 color·pattern·label, left·right button, timer·heart, correct·wrong effect |

Final image가 준비되지 않은 단계에서는 layout과 logic 검증을 위한 semantic geometry를 사용할 수 있습니다. 다만 final QA에서는 임시 표시가 남았는지 확인하고, 남겨야 한다면 기획 승인과 source 표기를 받습니다.

---

## 12. Frontend 화면 설계

## 12.1 주요 scene

ai-change는 하나의 `index.html` 안에서 scene을 전환하는 single-page game으로 구성합니다. 아래 이름은 top-level route 또는 MiniGameScene 내부 overlay ID이며 별도 server URL을 뜻하지 않습니다.

| Scene·overlay ID | 화면 | 핵심 기능 |
| --- | --- | --- |
| `loading` | Loading | 공통 asset 진행률, 실패 file, retry |
| `main-menu` | 초기 대기 | logo, Story, Battle, 게임 방법, 설정 |
| `how-to` | 게임 방법 | 공통 조작과 game별 안내 진입 |
| `settings` | 설정 | BGM·SFX·mute, 진행 초기화 |
| `story-intro` | Story intro | 화자·portrait·대사, 이전·다음·skip |
| `map` | Dot map 탐색 | player, collision, NPC, 느낌표, 진행 HUD |
| `dialogue` | NPC 대화 | NPC명·portrait·대사, 다음·종료·game 시작 |
| `minigame-intro` | Mini game intro | 학과·game명, 목표, 규칙, 기기별 조작 |
| `minigame-play` | Mini game play | game 영역, HUD, pause, mute |
| `result` | 결과·outro overlay | MiniGameScene 위의 clear·fail, metrics, script, retry·map 복귀 |
| `battle-coming-soon` | Battle 안내 | `추후 공개` 상태와 menu 복귀 |
| `error` | 복구 안내 | retry, map 또는 main menu 복귀 |

## 12.2 Loading 화면

- project 또는 festival logo를 표시합니다. Final logo 전에는 `ai-change` text mark를 임시로 사용하되 final asset으로 오인되지 않게 관리합니다.
- 필수 common asset의 완료 수와 전체 수로 진행률을 계산합니다.
- progress를 percentage text와 progress bar로 함께 표시합니다.
- loading 완료 전에 main menu로 전환하지 않습니다.
- 실패 시 단순 무한 spinner 대신 실패 안내와 `다시 시도`를 제공합니다.
- mini game lazy load는 같은 component를 간소화해 mini game intro 위에서 사용합니다.

## 12.3 초기 대기 화면

- game logo와 festival name
- `스토리` primary button
- `배틀` secondary button과 `추후 공개` badge 또는 안내 popup
- `게임 방법` button
- `설정` button
- mute 또는 volume quick control

Battle content가 없을 때 button을 아무 반응 없이 disabled하지 않습니다. focus 가능한 안내 button 또는 명확한 disabled 설명을 제공해 향후 공개 상태를 알립니다.

### 12.3.1 게임 방법과 설정

`게임 방법`은 main menu, map, mini game intro, pause overlay에서 열 수 있습니다. 현재 input device에 맞는 공통 이동·상호작용·pause 조작을 먼저 보여 주고, 5개 game별 목표·clear·fail 조건과 PC·mobile 조작을 registry와 같은 content source에서 표시합니다. 닫으면 호출한 scene과 원래 focus로 돌아가며, play 중 열었을 때는 `MODAL` pause reason이 해제되기 전 game을 재개하지 않습니다.

`설정`은 master·BGM·SFX volume과 mute를 즉시 preview하고 변경 즉시 memory와 현재 storage channel에 저장합니다. 진행 초기화는 영향 범위와 음량 설정 포함 여부를 설명하는 확인 dialog를 거쳐야 하며, 취소하면 어떤 key도 바꾸지 않습니다. 저장이 불가능한 환경에서는 control은 현재 session에 적용하되 미저장 상태를 알립니다.

## 12.4 Story intro

- background image 또는 짧은 dot animation
- speaker name, dialogue text, optional portrait
- 이전·다음 button
- 전체 skip button
- 현재 line progress를 알 수 있는 indicator
- 종료 뒤 map으로 이어지는 단일 action

skip 여부와 상관없이 story intro를 완료한 것으로 저장할지는 D-02에서 확정합니다. 기본 구현 contract는 어느 정책이든 skip의 next action을 한 번만 실행할 수 있게 합니다.

## 12.5 Map 탐색

Canvas layer:

- tile map과 background object
- collision object
- player sprite와 direction animation
- NPC sprite
- NPC 위 interaction indicator

DOM layer:

- 설정, 게임 방법, main menu
- optional 학과별 진행 HUD
- PC interaction key 안내 또는 mobile interaction button
- mobile virtual pad
- 접근 안내와 오류 toast

NPC interaction range에 들어오면 느낌표를 강조합니다. 완료 NPC는 다른 icon, check label 또는 상태 문구로 구분합니다.

## 12.6 NPC 대화

- NPC name과 portrait
- 짧은 dialogue text
- 다음 line button
- 대화 종료 또는 `미니게임 시작` action
- 최초 대화와 재방문 대화 구분
- dialogue 중 map 이동·NPC 중복 선택 차단

NPC가 화면 밖으로 이동하거나 map scene이 사라진 뒤에도 dialogue가 남지 않도록 route 종료 시 overlay와 focus를 정리합니다.

## 12.7 Mini game intro와 play

Intro 화면은 모든 game에서 다음 내용을 같은 순서로 표시합니다.

1. 학과·전공명과 game명
2. 짧은 story 배경
3. game 목표
4. clear 조건
5. fail 조건
6. PC 조작
7. mobile 조작
8. `게임 시작`
9. `맵으로 돌아가기`

Play 화면은 game canvas 또는 DOM play area 외에 공통 pause와 mute control을 제공합니다. Game별 HUD는 명세의 위치를 따르되 small screen에서는 play area를 가리지 않게 재배치합니다.

## 12.8 결과 및 outro

- `CLEAR`, `FAIL`, 필요 시 `QUIT` 상태를 text와 visual로 구분합니다.
- game별 핵심 metrics를 사람이 이해할 수 있는 label로 표시합니다.
- clear·fail에 맞는 별도 outro script를 실행합니다.
- `다시 하기`, `맵으로 돌아가기`를 제공합니다.
- 다음 학과 안내는 content가 확정된 경우에만 표시합니다.
- reward CTA는 D-03이 확정되기 전 공통 보상 지급을 주장하지 않습니다.

`다시 하기`는 clear·fail result overlay를 닫고 host가 새 `attemptId`를 발급한 뒤 현재 정상 instance의 `restart({attemptId})`로 terminal once guard를 초기화합니다. 초기화 범위와 penalty는 game별 승인 retry policy를 따릅니다. `맵으로 돌아가기`는 synchronous `destroy()`를 호출해 정리를 끝낸 뒤 map을 복원합니다. Runtime error instance는 항상 terminal finalization에서 폐기하므로, ErrorScene의 `다시 시도`는 `recoverable=true`일 때만 registry부터 전체 진입 경로를 실행해 새 instance와 asset lease를 만듭니다.

## 12.9 UI layer와 focus

```txt
Layer 0: page background / letterbox
Layer 1: game Canvas
Layer 2: in-game HUD
Layer 3: touch controls
Layer 4: dialogue / guide / pause / result modal
Layer 5: loading / fatal error
```

- 한 번에 하나의 top-level modal만 active합니다.
- modal open 시 첫 의미 있는 control로 focus를 옮깁니다.
- modal close 시 이전 focus target이 유효하면 복원합니다.
- Canvas 안 정보 중 진행에 필수인 값은 DOM HUD에도 제공합니다.
- icon button에는 accessible name을 제공합니다.

## 12.10 반응형 화면 원칙

- logical game aspect ratio를 유지하고 남는 영역은 background 또는 여백으로 처리합니다.
- map과 mini game은 viewport에 맞게 uniform scale합니다.
- text와 action UI는 Canvas에 bake하지 않고 DOM으로 유지해 작은 화면에서도 읽을 수 있게 합니다.
- mobile browser의 address bar 변화에는 dynamic viewport unit과 resize observer를 사용합니다.
- notch, rounded corner, home indicator는 safe-area inset으로 피합니다.
- safe-area를 사용할 수 있게 HTML viewport에 `viewport-fit=cover`를 설정하고, dynamic viewport unit을 지원하지 않는 환경에는 `vh` 기반 fallback을 둡니다.
- orientation change 뒤 game을 restart하지 않습니다.
- pixel asset을 비정수 배율로 키워야 할 때는 왜곡보다 충분한 가시 영역과 조작성을 우선합니다.

## 12.11 기기별 layout

| 환경 | Layout·input |
| --- | --- |
| PC·notebook | 중앙 game stage, keyboard 이동, mouse interaction, 좌우 여백에 help·HUD 배치 가능 |
| Tablet | 확대된 stage, touch와 keyboard 모두 지원, 방향에 따라 HUD 재배치 |
| Mobile landscape | 넓은 game area, 왼쪽 virtual pad, 오른쪽 interaction·action button |
| Mobile portrait | map 가시 영역 유지, control과 dialogue를 상하 배치하거나 필요한 game에서 landscape 권장 안내 |

가로 권장 안내가 나오더라도 사용자가 portrait에서 menu, pause, map 복귀를 할 수 있어야 합니다.

## 12.12 접근성 및 사용성

- text와 background의 충분한 contrast를 확보합니다.
- clear·fail·완료를 color만으로 구분하지 않습니다.
- touch target은 권장 최소 44 CSS pixel과 충분한 간격을 확보합니다.
- keyboard focus가 보이도록 focus style을 제거하지 않습니다.
- 빠른 animation, 과도한 screen shake, 반복 flash를 피합니다.
- mute 상태에서도 timing과 danger를 text·shape·animation으로 전달합니다.
- countdown과 time warning은 숫자 text를 함께 표시합니다.
- `prefers-reduced-motion`을 감지하면 decorative animation, shake, pulse 빈도를 줄입니다.
- clear·fail·Miss·timer 경고처럼 중요한 상태 변화는 중복 낭독을 막는 DOM `aria-live` 영역에도 전달합니다.
- game 방법은 play 전뿐 아니라 pause menu에서도 다시 열 수 있게 합니다.

---

## 13. 인프라 및 배포 설계

## 13.1 실행 환경

| 항목 | 값 |
| --- | --- |
| Application type | 정적 browser game |
| Server runtime | 없음 |
| Database | 없음 |
| Hosting | 정적 file hosting provider `TBD` |
| Transport | HTTPS |
| Entry point | `index.html` |
| Public project path | `ai-change` |
| Browser | Chrome·Safari PC·mobile |

## 13.2 Path 정책

- asset과 data URL은 배포 root가 domain root 또는 `/ai-change/` subpath인 경우 모두 대응할 수 있게 base path를 한 곳에서 관리합니다.
- source file 안에서 `/assets/...` 같은 domain-root absolute path를 무분별하게 사용하지 않습니다.
- runtime JS·CSS·JSON·image·audio filename은 lowercase kebab-case를 사용합니다. `README.md`, `AI_CHANGE_PLAN.md`, 한글 제출 문서는 이 규칙의 예외입니다.
- `js/app.js`는 `import.meta.url`에서 `releaseBaseUrl`을 한 번 계산합니다. JSON·asset `src`는 `new URL(src, releaseBaseUrl)`로 해석하고 승인된 public path 밖 URL을 거부합니다.
- dynamic module은 JSON path가 아니라 `registry.js` 안의 relative static import mapping으로 해석합니다.
- CSS `url(...)`은 해당 CSS file URL 기준이므로 CSS 이동 시 asset path test를 함께 갱신합니다.
- 한글 content는 UTF-8로 저장하고 hosting의 `Content-Type` charset을 확인합니다.
- internal scene 전환만 사용하므로 server의 SPA fallback에 의존하지 않습니다.

## 13.3 HTTPS와 response header

- production URL은 HTTPS로 제공합니다.
- 가능하면 hosting에서 `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy`를 설정합니다.
- remote script CDN을 사용하지 않는 것을 기본으로 하며 필요한 경우 version과 integrity 정책을 검토합니다.
- audio, image, font의 실제 source domain이 추가되면 CSP allowlist와 license 문서를 함께 갱신합니다.

## 13.4 Cache 정책

- Source·local 개발 server에서는 HTML, JS, CSS, JSON을 `no-cache`로 제공합니다.
- Production은 `releases/<contentVersion>/` 아래에 JS·CSS·JSON·asset 전체를 복사한 versioned release directory를 사용하며, 기존 release directory의 file을 덮어쓰지 않습니다.
- Stable `index.html`만 `no-cache`로 제공하고 정확히 한 release directory의 CSS와 module entry를 참조합니다. Versioned directory 안 file은 immutable cache를 허용합니다.
- HTML의 `ai-change-content-version` meta, `data/app-config.json`, `data/asset-manifest.json` envelope, `js/core/version.js`의 build constant가 모두 directory version과 같아야 bootstrap을 통과합니다. CSS·audio·image도 같은 directory 안에 있으므로 path 자체가 version을 식별합니다.
- 배포는 새 release directory 전체 업로드 → production-equivalent 검증 → stable `index.html` 마지막 교체 순서로 고정합니다. Hosting의 mutable file atomicity에 의존하지 않습니다.
- version mismatch를 감지하면 stale content로 진행하지 않고 hard reload 안내를 표시합니다. 반복 mismatch는 error scene에서 현재·기대 version만 노출합니다.
- Rollback은 stable index가 직전 보존 release directory를 다시 참조하게 하며, save backward compatibility test를 먼저 통과해야 합니다.
- Service Worker는 MVP 범위에서 제외해 stale cache 복잡도를 줄입니다.

## 13.5 Static hosting 실패 대응

- direct URL로 `index.html`이 열리는지 확인합니다.
- JSON, font, audio의 MIME type이 올바른지 확인합니다.
- file name의 대소문자가 다른 path를 local Windows 환경에서 놓치지 않도록 production과 같은 case-sensitive path 검증을 수행합니다.
- subpath 배포에서 asset 404가 없는지 확인합니다.
- network가 느릴 때 loading progress와 timeout·retry가 작동하는지 확인합니다.

---

## 14. Configuration 설계

## 14.1 환경 변수 사용 범위

MVP는 secret, backend URL, API key가 없으므로 `.env`를 요구하지 않습니다. 배포 경로나 공개 build metadata처럼 secret이 아닌 값만 static config로 관리합니다.

실제 외부 service가 추가되기 전에는 임의 API key나 fake endpoint를 만들지 않습니다.

## 14.2 App config

Runtime이 읽는 `data/app-config.json`은 다음 release contract를 만족해야 합니다.

| Field | Release rule |
| --- | --- |
| `appId` | 정확히 `ai-change` |
| `contentVersion` | 배포마다 관리하는 양의 integer |
| `storageChannel` | 배포별 고정 channel. Production은 `production`, staging·개발은 서로 다른 allowlisted 값 |
| `publicBasePath` | domain root 또는 승인된 `/ai-change/` subpath |
| `initialScene` | 등록된 scene ID. Production은 필수 loading·version 검증을 우회하지 않도록 `loading` 고정 |
| `mainMapId` | 존재하는 map ID |
| `defaultLocale` | `ko-KR` |
| `audio.*Volume` | D-10에서 승인된 0~1 finite number |
| `features.story` | Production MVP에서 반드시 `true` |
| `features.localSave` | 이 PLAN의 1차 배포에서는 반드시 `true` |
| `features.battleContent` | 실제 Battle entry 공개 여부. MVP Coming Soon이면 `false`; Battle menu 노출과는 별개 |

미확정 값을 기록하는 `data/drafts/app-config.draft.json`은 runtime file과 schema를 분리합니다.

```json
{
  "appId": "ai-change",
  "storageChannel": "development",
  "audio": {
    "masterVolume": { "status": "TBD", "value": null },
    "bgmVolume": { "status": "TBD", "value": null },
    "sfxVolume": { "status": "TBD", "value": null }
  }
}
```

위 draft의 `null`은 의사결정 추적용이며 runtime에 전달하지 않습니다. 승인 뒤 plain value만 가진 `data/app-config.json`을 만들고, `data/drafts/` 전체는 production artifact에서 제외합니다.

## 14.3 Balance config 원칙

- rule code와 balance number를 분리합니다.
- 확정값과 초안값을 file과 schema 수준에서 구분합니다.
- `TBD`를 숫자 `0`으로 대체하지 않습니다.
- 미확정 game parameter는 `data/drafts/minigames/*.draft.json`의 `{status, value}` wrapper로 관리합니다.
- Runtime `data/minigames/*.json`에는 승인된 plain boolean·number·string·array만 두고 blocking `TBD`·wrapper·잘못된 `null`을 허용하지 않습니다.
- 필수 parameter가 승인되지 않은 game은 release config를 만들지 않으며 final release mode로 시작하지 못하게 validation합니다.
- playtest build에서 사용한 임시 값은 별도 change log에 기록합니다.
- help text는 같은 config 또는 content source에서 값을 읽어 실제 rule과 다르지 않게 합니다.

## 14.4 Config validation

App 시작 시 다음을 검증합니다.

```txt
release app-config
├── appId = ai-change
├── contentVersion supported
├── storageChannel allowlisted and environment-specific
├── publicBasePath valid
├── production initialScene = loading and scene registered
├── main map registered
├── audio volume is finite number in 0..1
├── feature key allowlist only
├── production story = true and localSave = true
└── battleContent equals presence of a published Battle entry

mini game config
├── required fields present
├── number is finite and within allowed range
├── every asset ID is globally unique and every referenced configAssetId·thumbnailAssetId·group exists in manifest
├── referenced script / ingredient / class exists
├── recipe length <= 4 and every ingredient exists
├── every Code Heart order has approved duplicate-ingredient boolean
├── queue·spawn counts and probabilities satisfy game invariants
├── interval boundaries are ordered and map spawn is collision-safe
├── all 5 published Story entries have an approved non-null recordPolicy
└── release build has no blocking TBD
```

Draft validator는 `{status, value}`와 `null`을 의사결정 추적용으로 허용하되 production path를 참조하지 않는지 확인합니다. Release validator는 draft wrapper, `data/drafts/` reference, blocking `TBD`, 허용되지 않은 `null`을 모두 오류로 처리합니다. 개발 mode의 schema fixture와 production content도 분리하며 fixture는 사용자에게 final content처럼 노출하지 않습니다.

## 14.5 공개 상태

| Status | Menu·map 처리 |
| --- | --- |
| `published` | 정상 진입 가능 |
| `locked` | unlock condition과 안내를 함께 표시 |
| `coming-soon` | 향후 공개 안내 후 진입 차단 |
| invalid·load error | unavailable 안내와 retry·menu 복귀 제공 |

Story MVP에 필요한 5개 mini game은 final 배포 시 모두 `published`여야 합니다. `coming-soon`은 Battle content 또는 MVP 이후 항목에만 사용합니다.

---

## 15. 보안·안정성·품질 계획

## 15.1 Content 보안

- dialogue와 label은 `innerHTML` 대신 `textContent` 기반으로 출력합니다.
- JSON 안의 action은 allowlist enum만 실행하고 arbitrary function name이나 `eval`을 사용하지 않습니다.
- registry의 module key는 `registry.js`의 static loader allowlist와 일치할 때만 import합니다.
- 외부 URL을 추가할 경우 protocol과 host를 검증하고 새 tab link에는 적절한 `rel`을 설정합니다.
- user input은 숫자·button selection 중심이며 실행 가능한 code로 해석하지 않습니다.

## 15.2 Local data와 privacy

- MVP는 name, email, phone, account identifier를 수집하지 않습니다.
- local save에는 progression과 setting만 저장합니다.
- console log에 전체 dialogue, answer, device identifier를 지속적으로 남기지 않습니다.
- 향후 analytics를 넣으려면 수집 항목, 보존 기간, consent를 별도 설계합니다.
- 전체 local data reset은 현재 `ai-change:<storageChannel>` namespace에서 SaveManager가 아는 현재·historical save key, migration marker, corrupt backup만 명시적 allowlist로 삭제합니다. 다른 channel과 같은 origin의 다른 application key는 삭제하지 않습니다.

## 15.3 Runtime 안정성

- scene 전환 중 중복 click을 차단합니다.
- `onComplete`와 `onError`는 session당 한 번만 terminal state를 만들 수 있습니다.
- mini game 종료 시 key·pointer·visibility listener, timer, RAF를 해제합니다.
- page visibility change에서 자동 pause하고 사용자가 명시적으로 resume하게 합니다.
- 예상하지 못한 exception은 global boundary에서 잡아 error scene 또는 main menu 복구를 제공합니다.
- 복구 과정에서도 current mini game의 `destroy()`를 best-effort로 실행합니다.
- save 실패는 play를 중단하지 않지만 결과가 저장되지 않았음을 알립니다.

## 15.4 Performance

- 초기에는 common asset만 load하고 game asset은 lazy load합니다.
- image와 audio를 web용으로 압축하고 원본보다 큰 display size로 무리하게 사용하지 않습니다.
- object 생성·삭제가 잦은 game은 필요 시 object pool을 사용합니다.
- 매 frame DOM layout을 읽고 쓰는 작업을 피합니다.
- Canvas redraw 범위와 active object 수를 game별로 측정합니다.
- 개발 QA에서 frame time, long task, memory 증가, listener count를 확인합니다.
- 목표는 지원 device에서 조작 지연을 느끼지 않는 안정적인 animation이며, 기준 device와 수치 목표는 D-11에서 확정합니다.

## 15.5 호환성

- Chrome desktop·mobile에서 모든 필수 flow를 검수합니다.
- Safari desktop·mobile에서 touch, audio unlock, viewport resize, localStorage를 검수합니다.
- mouse가 없는 device에서 모든 menu와 game을 완료할 수 있어야 합니다.
- keyboard가 없는 device에서도 pause, dialogue, retry, map 복귀가 가능해야 합니다.
- browser autoplay 제한 때문에 audio가 재생되지 않아도 game state는 정상 진행해야 합니다.

## 15.6 Test 전략

| Layer | 대상 | 예시 |
| --- | --- | --- |
| Unit | 순수 판정·schema·timer helper | Fit·Shift 계산, recipe exact match, spawn queue 수량 |
| Contract | mini game lifecycle·result | CLEAR·FAIL candidate의 `onComplete` 최대 1회, 모든 attempt terminal event 정확히 1회, `destroy` 후 listener 0 |
| Integration | scene·registry·save 연결 | NPC → intro → game → result → map |
| Visual | responsive·safe area·pixel ratio | PC, tablet, mobile portrait·landscape |
| Browser | Chrome·Safari | keyboard, touch, audio, visibility, storage |
| Playtest | 난이도·이해도 | timing window, speed, interval, help comprehension |

Timing·same-frame terminal test는 fake clock을, random queue·spawn test는 seeded RNG를 사용해 실제 대기 없이 재현합니다. Scene integration test는 route 취소 뒤 stale async 결과가 mount되지 않는지, deferred `init()`을 abort·destroy한 뒤 늦은 continuation이 DOM·listener·asset을 다시 사용하지 않는지, rejected asset cache가 제거되어 retry가 새 request를 만드는지, module import 실패가 page reload 안내로 이어지는지 확인합니다.

Automated test runner는 구현 repository의 개발 tooling을 확정할 때 선택합니다. 배포 결과는 test runner 없이도 static file로 실행되어야 합니다.

### 15.6.1 D-11 합격 기준 matrix

D-11은 Step 1 종료 전 아래 칸을 실제 값으로 채우고 승인합니다. `동작함`, `심하지 않음`, `충분함` 같은 주관적 표현만으로 release를 통과시키지 않습니다.

| 범주 | 반드시 확정할 값·scenario |
| --- | --- |
| Browser | OS, Chrome·Safari 최소 version, desktop·mobile 조합 |
| Device | 실제 기기명 또는 성능 등급, viewport, pixel ratio, keyboard·touch 조합 |
| Rendering | 목표 frame time/FPS, 허용 long-frame 비율, SYSTEM pause를 만드는 gap threshold |
| Input | action 수신부터 visual feedback까지 허용 latency와 측정 방법 |
| Loading | initial·lazy asset timeout, retry 횟수, offline·404·decode 실패 조건 |
| Leak | 같은 game 진입·retry·map 복귀 반복 횟수와 RAF·timer·listener·memory 허용 증가량 |
| 접근성 | 승인 contrast ratio, touch target 최소 44 CSS px, keyboard focus·`aria-live` scenario |
| Viewport | portrait·landscape, safe-area, address bar resize, `viewport-fit=cover`, dynamic viewport unit fallback |
| Path·cache | domain root와 `/ai-change/` 각각의 JSON·asset·dynamic module 진입, version mismatch·reload |
| Save | empty·valid·old·corrupt·future version, transient dirty retry, quota·SecurityError와 명시적 reprobe, staging·production channel 분리, Web Locks 지원·fallback 동시-tab·pagehide 한계 |
| Pause | manual+visibility+modal 조합, long gap, `pagehide/pageshow`와 BFCache 복원 |

각 row에는 담당자, 측정 도구, 승인 수치, 결과 link 또는 screenshot 위치를 함께 기록합니다.

---

## 16. 개발 단계별 계획

공통 기반이 없는 상태에서 5개 game을 먼저 각각 구현하면 input, pause, result, resize 방식이 달라질 위험이 큽니다. 따라서 공통 contract를 먼저 고정한 뒤 game module을 병렬 개발하고 마지막에 story flow에 통합합니다.

```txt
Step 0 결정 gate
  -> Step 1 project·data 기반
  -> Step 2 AppShell·core service
  -> Step 3 map·dialogue
  -> Step 4 mini game contract·save
       ├── Step 5 숫자 야구
       ├── Step 6 CLICK to PURIFY
       ├── Step 7 Code Heart
       ├── Step 8 AI Ball Classification
       └── Step 9 인지알·데사알
  -> Step 10 전체 content·asset 통합
  -> Step 11 QA·배포·제출
```

## Step 0. 기획 결정과 release gate 정리

### 목표

구현 가능한 항목과 기획 확정이 필요한 항목을 분리해 임시 값이 final rule로 굳어지는 것을 막습니다.

### 작업 항목

- D-01~D-12 owner와 확정 기한 지정
- 5개 학과·전공의 공식 표기 확인
- final game title·logo·festival name의 제공 일정 확인
- story, player, map, NPC content 제공 형식 결정
- 공통 reward 도입 여부 결정
- 각 game의 blocking balance·priority question을 담당자와 확인
- target browser와 test device 목록 확정
- D-11 matrix의 browser version과 수치형 performance·loading·leak 기준 승인
- 배포 host, public base path, 공개 일정 확정
- 임시 geometry·asset 사용 범위와 final 교체 기준 합의

### 산출물

- 이 문서의 D-01~D-12 상태 갱신
- 승인된 game parameter 표
- content·asset 제공 checklist
- test device matrix

### 완료 기준

- 각 `TBD`에 owner와 decision date가 있습니다.
- game별 final 완료를 막는 blocking item이 구분되어 있습니다.
- 임시 값과 승인 값이 data에서 식별됩니다.
- 구현팀과 기획팀이 같은 mini game ID와 공식 이름을 사용합니다.

---

## Step 1. Project 구조와 data schema 구축

### 목표

정적 application의 directory, module entry, JSON schema, naming rule을 구성합니다.

### 작업 항목

- `index.html`, CSS, JS entry 생성
- `core`, `scenes`, `map`, `story`, `battle`, `minigames`, `data`, `assets` directory 생성
- `app-config.json`, `minigames.json`, `battles.json`, `map-data.json` schema 정의
- `asset-manifest.json` schema와 source reference 정의
- HTML meta·app config·manifest envelope·`js/core/version.js` contentVersion 일치 contract 정의
- dialogue, BattleDefinition, game별 config schema 정의
- `data/drafts/`와 runtime release config의 분리 validation 구현
- production feature invariant와 contentVersion 교차 validation 구현
- stable mini game ID 5개 등록
- asset manifest format 정의
- UTF-8, lowercase kebab-case, relative path rule 적용
- invalid JSON·missing reference를 검출하는 validator 작성
- `README.md`에 local static server 실행 방식 정리

### 산출물

- project directory structure
- `js/app.js`, `js/router.js`
- `js/core/config-validator.js`
- `js/core/version.js`
- `data/app-config.json`
- `data/minigames.json`
- `data/battles.json`, `js/battle/registry.js`
- `data/asset-manifest.json`
- 배포 제외 `data/drafts/` decision file
- 최소 schema fixture와 validation test

### 완료 기준

- `index.html`이 direct file이 아닌 local HTTP server에서 정상 load됩니다.
- 모든 JSON이 parse되고 required reference가 검증됩니다.
- 5개 registry entry가 unique ID를 가집니다.
- 빈 production Battle registry와 독립 test fixture가 schema를 통과합니다.
- release validator가 draft wrapper·blocking `TBD`·잘못된 `null`을 거부합니다.
- missing module·script·asset reference가 명확한 error로 검출됩니다.
- 배포 code에 secret이나 machine absolute path가 없습니다.

---

## Step 2. AppShell, loading, input, resize 구현

### 목표

모든 scene과 mini game이 공유할 runtime service와 responsive shell을 구현합니다.

### 작업 항목

- SceneRouter와 transition lock 구현
- LoadingScene과 rejected cache를 제거하는 AssetLoader 구현
- AssetLoader group lease·reference count·object URL owner 구현
- MainMenuScene, HowToScene, SettingsScene, ErrorScene 구현
- route generation token, fetch abort, stale async result 폐기 구현
- GameLoop와 pause 가능한 game clock 구현
- 긴 raw gap의 소급 SYSTEM pause 구현
- InputManager의 keyboard·pointer·touch normalization 구현
- mobile virtual pad와 interaction button 구현
- ResizeManager, logical coordinate, device pixel ratio 처리
- safe-area와 portrait·landscape layout 구현
- AudioManager의 최초 gesture unlock, mute, channel 구조 구현
- Page Visibility 자동 pause 구현
- `pagehide/pageshow`와 BFCache 복원 동기화 구현
- global error boundary와 recovery scene 구현
- native module import 실패 시 page reload recovery 구현

### 산출물

- `js/core/game-loop.js`
- `js/core/input-manager.js`
- `js/core/resize-manager.js`
- `js/core/asset-loader.js`
- `js/core/audio-manager.js`
- `js/scenes/loading-scene.js`
- `js/scenes/main-menu-scene.js`
- `js/scenes/how-to-scene.js`
- `js/scenes/settings-scene.js`
- `js/scenes/error-scene.js`
- 공통 menu·modal·touch control CSS

### 완료 기준

- common asset 진행률과 실패 retry가 동작합니다.
- key, mouse, touch가 같은 common action을 만듭니다.
- resize·orientation change 뒤 scene state가 유지됩니다.
- hidden tab에서 clock이 멈추고 resume 뒤 시간이 건너뛰지 않습니다.
- 긴 raw gap의 첫 frame·input이 deadline을 전진시키지 않고 SYSTEM pause됩니다.
- BFCache 복귀에서 resize·audio·save revision을 재동기화하고 명시적 resume를 기다립니다.
- transition 중 중복 route가 실행되지 않습니다.
- cancel된 route의 늦은 JSON·asset·module 결과가 새 scene을 mount하지 않습니다.
- 실패한 asset을 retry하면 rejected Promise가 재사용되지 않고 새 request가 발생합니다.
- Route cancel·import·factory·init 실패 뒤 partial instance와 pre-mount asset lease가 남지 않습니다.
- 게임 방법에서 공통·game별 PC·mobile 조작을 확인하고 닫으면 focus와 pause 상태가 복원됩니다.
- 설정 변경이 현재 session과 local save에 반영되고 진행 초기화 취소 시 data가 바뀌지 않습니다.
- 최초 사용자 입력 전 audio failure가 app을 중단하지 않습니다.

---

## Step 3. Story map과 dialogue 구현

### 목표

Story intro부터 map 탐색, NPC 대화, mini game intro 진입까지의 공통 flow를 완성합니다.

### 작업 항목

- StoryIntroScene 구현
- tile map·sprite renderer 구현
- player 이동과 normalized diagonal speed 구현
- bounds·building·decoration collision 구현
- NPC와 interaction radius 구현
- 느낌표 기본·nearby·completed 상태 구현
- click·touch·key NPC interaction 구현
- DialogueManager와 data-driven script 구현
- 이전·다음·skip, 최초·재방문 script 구현
- `nextAction.openMiniGame` route 연결
- map 위치와 NPC context 복원 구현
- 변경된 map 위치의 throttled checkpoint와 MapScene deactivate 저장 구현

### 산출물

- `js/map/*`
- `js/story/dialogue-manager.js`
- `js/scenes/story-intro-scene.js`
- `js/scenes/map-scene.js`
- `js/scenes/dialogue-scene.js`
- `data/map-data.json`
- story·NPC script JSON

### 완료 기준

- PC와 mobile에서 player가 통행 가능 영역만 이동합니다.
- range 안과 밖의 NPC interaction이 서로 다르게 처리됩니다.
- dialogue 중 player가 움직이지 않습니다.
- 연타해도 line이 중복으로 넘어가지 않습니다.
- skip과 정상 완료가 올바른 next action을 한 번만 실행합니다.
- mini game을 나갔다 돌아와도 map 위치와 NPC 상태가 유지됩니다.

---

## Step 4. Mini game contract, result, save 구현

### 목표

5개 module이 같은 방식으로 시작·pause·종료·재시작되고 결과가 progression에 반영되는 기반을 만듭니다.

### 작업 항목

- mini game factory와 lifecycle contract 구현
- attempt token 전달과 stale callback 폐기 구현
- transition `AbortSignal`을 받는 init과 disposed continuation guard 구현
- state transition guard 구현
- shared clock, input lock, result builder 구현
- registry dynamic module load 구현
- MiniGameIntroScene, MiniGameScene, ResultOverlay 구현
- `MiniGameCandidateResult` 검증 → host field 주입 → common `MiniGameResult` 최종 검증 구현
- `onComplete` once guard와 `destroy` cleanup 검증 구현
- SaveManager read·validate·migrate·write·reset 구현
- record policy allowlist·projection·comparator 구현
- 5개 published Story game의 승인된 record policy 등록과 release invariant 구현
- storage channel·revision·stale-tab 차단, transient dirty retry·storage reprobe, corrupt backup, future-version read-only 구현
- NPC별 completionRule과 game·story event mapping 구현
- development test harness에서 game ID 직접 실행 지원

### 산출물

- `js/minigames/registry.js`
- `js/minigames/shared/*`
- `js/core/record-policies.js`
- `js/scenes/minigame-intro-scene.js`
- `js/scenes/minigame-scene.js`
- `js/ui/result-overlay.js`
- `js/core/save-manager.js`
- lifecycle contract test
- record policy allowlist·projection·comparator test

### 완료 기준

- 최소 test game이 full lifecycle을 통과합니다.
- pause·resume·destroy의 중복 호출은 안전하고, retry 연타는 guard로 `restart({attemptId})`를 한 번만 호출합니다.
- terminal result는 session당 한 번만 전달됩니다.
- 이전 attempt의 지연 callback은 현재 result를 만들지 못합니다.
- 취소된 pending init의 늦은 continuation은 DOM·listener·해제된 asset을 다시 사용하지 못합니다.
- result 뒤 game completion·play count와 조건을 만족한 NPC completion이 한 번만 저장됩니다.
- CLEAR·FAIL·QUIT·ERROR별 play count와 완료 policy가 contract와 일치합니다.
- 같은 event가 game과 NPC 완료 조건을 모두 만족하면 atomically 갱신되며 서로 다른 완료 상태를 임의로 1:1 reconcile하지 않습니다.
- corrupt·old·future save와 storage write 실패에서 정해진 방식으로 복구하고 future raw data를 덮어쓰지 않습니다.
- 다른 tab의 write·reset 뒤 stale tab은 reload 전 write하지 않습니다.
- module error 후 menu 또는 map으로 복귀할 수 있습니다.
- Runtime error는 기존 instance와 lease를 항상 폐기하며 recoverable retry는 registry부터 새 instance를 생성합니다.

---

## Step 5. 숫자 야구 구현

### 목표

3자리 추론과 9 Epoch, Fit·Shift·Outlier 기록을 완성합니다.

### 작업 항목

- unique digit answer generator 구현
- digit input·duplicate prevention·delete·submit 구현
- Fit·Shift·Outlier pure function 구현
- history와 scroll UI 구현
- Epoch progress와 9회 종료 구현
- clear·fail result와 answer 공개 정책 구현
- D-08 결정값을 config·help·기록 UI·record policy에 반영
- exhaustive 또는 충분한 조합 판정 unit test 작성

### 산출물

- `js/minigames/DS/index.js`
- `data/minigames/number-baseball.json`
- game UI style과 asset
- 판정·validation test

### 완료 기준

- 11.1.8의 완료 기준을 모두 만족합니다.
- PC·mobile 세로 panel에서 9개 history를 확인할 수 있습니다.
- invalid input이 Epoch를 소비하지 않습니다.
- result가 common schema를 통과합니다.

---

## Step 6. CLICK to PURIFY 구현

### 목표

현재 14 wave 초안 config를 기반으로 4종 malware 고유 rule과 timing judge를 구현하고, D-04 승인값으로 purification·Miss flow를 final 확정합니다.

### 작업 항목

- 8방향 spawn과 target timestamp 기반 approach 구현
- learning·mixed wave scheduler 구현
- Perfect·Good·Miss judge 구현
- Good window 만료 시 미클릭 threat의 자동 Miss와 type별 후처리 구현
- Trojan disguise·reveal 구현
- Worm split depth와 child placement 구현
- Ransom input lock과 unlock 구현
- Spyware opacity reveal 구현
- purification formula와 terminal priority를 D-04·D-05 기준으로 구현
- 지정 event hook 11개 구현
- lock되지 않은 모든 CLICK 입력의 `OnClickInput` 선행 발생 구현
- pause·resume, input cooldown, simultaneous scenario test 작성

### 산출물

- `js/minigames/CS/index.js`
- `data/minigames/click-to-purify.json`
- malware geometry 또는 final asset
- timing·wave·type-specific test

### 완료 기준

- 11.2.11의 완료 기준을 모두 만족합니다.
- frame rate가 달라도 같은 timestamp input은 같은 판정을 만듭니다.
- pause 중 모든 관련 timer가 정지합니다.
- D-04·D-05 승인 없이 release 완료로 표시하지 않습니다.

---

## Step 7. Code Heart: Unlock! 구현

### 목표

data-driven order·recipe와 순서 있는 ingredient 조합, customer·timer 결과를 구현합니다.

### 작업 항목

- ingredient catalog와 category schema 작성
- order·recipe data 작성과 reference validation
- 주문별 중복 재료 허용 boolean과 judge test 작성
- customer·X알·order UI 구현
- recipe book modal 구현
- 최대 4개 staged slot과 초기화 구현
- exact recipe judge와 Build Error 구현
- patience·total timer·penalty를 D-06 기준으로 구현
- Open Heart·reward result를 D-03·D-06 기준으로 연결
- 비전공자 recipe 이해도 playtest 수행

### 산출물

- `js/minigames/CSE/index.js`
- `data/minigames/code-heart.json`
- ingredient·order data
- recipe matching·timeout test

### 완료 기준

- 11.3.9의 완료 기준을 모두 만족합니다.
- 4개 대표 recipe의 재료가 catalog에 존재합니다.
- slot overflow와 duplicate submit이 차단됩니다.
- D-03·D-06 승인값 없이 release 완료로 표시하지 않습니다.

---

## Step 8. AI Ball Classification Game 구현

### 목표

목표 image, 30개 ball queue, OPEN/CLOSE lid, strict 즉시 실패 rule을 구현합니다.

### 작업 항목

- target class와 image catalog schema, 무작위 목표 선택 구현
- 정답 5·오답 25 queue 생성과 count validation
- 3초 countdown 구현
- 좌→우 movement와 spawn scheduler 구현
- lid toggle state·animation·capture region 구현
- target collect, target lost, non-target pass·collect judge 구현
- 총 30개 처리 완료 clear와 마지막 공 fail 우선 판정 구현
- fail 즉시 freeze와 result 구현
- D-07의 speed·interval·initial state·개폐 중 input rule 반영
- rapid toggle·boundary·simultaneous test 작성

### 산출물

- `js/minigames/AI/index.js`
- `data/minigames/ai-ball-classification.json`
- target·ball·bin·lid asset
- queue·collision·terminal state test

### 완료 기준

- 11.4.9의 완료 기준을 모두 만족합니다.
- queue 수량과 즉시 실패 조건이 반복 play에서도 바뀌지 않습니다.
- lid UI와 collision state가 항상 일치합니다.
- D-07 승인값 없이 release 완료로 표시하지 않습니다.

---

## Step 9. 인지알·데사알 분류 구현

### 목표

45초 동안 가속되는 spawn, 0.2초 platform 전환, 두 box 분류와 life를 구현합니다.

### 작업 항목

- egg type generator와 spawn scheduler 구현
- fall과 platform collision 구현
- left·right target과 0.2초 transition 구현
- 충돌 순간 route lock 구현
- two box overlap judge와 screen lost 처리 구현
- timer 45초, life 5, 10초 warning 구현
- 구간별 3.5·2.5·1.5초 interval 구현
- D-09의 probability·speed·spawn boundary·collision·동시 terminal priority·terminal 후 egg 정리 연출 반영
- duplicate judge·same-frame input test 작성

### 산출물

- `js/minigames/AIDS/index.js`
- `data/minigames/ai-data-egg-sort.json`
- egg·platform·box asset
- timer·spawn·collision test

### 완료 기준

- 11.5.9의 완료 기준을 모두 만족합니다.
- 한 egg가 life를 두 번 차감하지 않습니다.
- pause와 orientation change 뒤 fall·timer state가 유지됩니다.
- D-09 승인값 없이 release 완료로 표시하지 않습니다.

---

## Step 10. 전체 content와 asset 통합

### 목표

공통 flow와 5개 game을 final story, map, dialogue, art, audio로 연결합니다.

### 작업 항목

- final title·logo·festival name 적용
- main story, player, map, NPC data 적용
- 각 NPC와 정확한 mini game ID 연결
- first·revisit·intro·clear·fail script 작성
- common·game별 image, sprite, font 적용
- BGM·SFX event mapping 적용
- Battle Coming Soon menu와 registry seam 적용
- map 진행 HUD와 완료 indicator 적용
- asset compression과 lazy group 조정
- resource source·license 문서 갱신
- 임시 text·geometry·asset 검색과 승인 여부 확인

### 산출물

- final content JSON
- `data/battles.json`, `js/battle/registry.js`
- final map·sprite·portrait·game asset
- audio mapping
- `docs/asset-sources.md`
- content integration check 결과

### 완료 기준

- D-02에서 승인된 NPC가 유효한 script·game reference를 가지며 Story flow에서 5개 mini game에 모두 진입할 수 있습니다.
- clear·fail outro가 결과에 맞게 실행됩니다.
- 없는 script·asset·ingredient·class reference가 없습니다.
- test Battle fixture를 등록해도 Story registry를 수정하지 않고 별도 route로 진입하며 production에는 fixture가 없습니다.
- final 배포에 blocking `TBD`, `[작성 필요]`, 승인 없는 placeholder가 없습니다.
- 모든 외부 resource마다 실제 파일명, 종류, 제작자·제공처, 원본 URL, license, 수정 여부, 사용 위치 7개 항목이 기록됩니다.

---

## Step 11. 최적화, QA, 배포, 제출

### 목표

지원 device와 browser에서 전체 story flow를 검증하고 정적 배포와 제출 자료를 완성합니다.

### 작업 항목

- unit·contract·integration test 실행
- Chrome·Safari PC·mobile manual QA
- tablet, mobile portrait·landscape layout QA
- keyboard·mouse·touch·virtual pad 전체 조작 QA
- resize·orientation·visibility pause QA
- manual·visibility·modal pause 조합과 `pagehide/pageshow` QA
- loading failure·invalid/old/future save·storage error·runtime error recovery QA
- route cancel·stale result·asset retry·module reload recovery QA
- 5개 game의 clear·fail·retry·map return QA
- frame time, memory, listener·timer cleanup 검사
- image·audio compression과 path case 검사
- domain root와 `/ai-change/`에서 JSON·asset·dynamic module static deploy smoke test
- versioned release directory, stable index-last 전환, version mismatch, rollback 호환 QA
- `README.md`, 실행·조작 문서, source list 작성
- final 기획·기능·PLAN과 실제 rule 대조

### 산출물

- 전체 source code와 data·asset
- production URL
- test result와 known issue
- `README.md`
- `docs/execution-and-controls.md`
- `docs/asset-sources.md`
- final 기획안·기능 명세·PLAN

### 완료 기준

- 21장의 release checklist가 모두 통과하거나 승인된 예외가 기록됩니다.
- 배포 URL 접속만으로 별도 설치 없이 실행됩니다.
- 5개 game의 end-to-end flow에 치명적인 오류가 없습니다.
- D-11 matrix의 승인 수치와 반복 횟수를 모두 통과합니다.
- source, 실행 URL, resource 출처, 조작 방법이 함께 제출됩니다.

---

## 17. MVP 이후 확장 계획

## Phase 2. Story와 balance 고도화

- NPC 선택지와 분기 dialogue
- 학과별 추가 story와 재방문 event
- game 난이도 선택 또는 단계별 level
- playtest data를 바탕으로 timing·speed·interval 재조정
- 완료 collection과 reward 표현 고도화
- 접근성 setting과 motion reduction option 고도화

## Phase 3. Battle mode

- 독립 Battle registry와 entry flow
- boss battle, score attack, 반복 play형 game 검토
- Story module을 수정하지 않고 Battle module 등록으로 연결
- mode별 result와 ranking 필요 여부 검토

## Phase 4. 저장과 공유

- 사용자 동의 기반 cloud save
- 기기 간 progression sync
- score share card
- server leaderboard와 abuse prevention
- account·privacy·retention 정책

## Phase 5. 운영 도구

- content version 관리
- error monitoring
- 개인정보를 최소화한 익명 play analytics
- 학과별 completion funnel
- 운영자가 code 수정 없이 content 공개 상태를 바꾸는 관리 도구

Phase 4·5는 backend와 개인정보 설계를 새로 요구하므로 MVP static architecture에 임의로 포함하지 않습니다.

---

## 18. 예상 리스크와 대응

| 리스크 | 설명 | 대응 |
| --- | --- | --- |
| 기획 `TBD` 지연 | game별 terminal rule과 content 통합이 멈출 수 있음 | D-01~D-12 owner·기한 지정, blocking 여부 분리 |
| 공통 reward 불일치 | 하트·정화된 알·수호알이 game마다 다름 | MVP progression은 completion 중심, D-03 후 reward schema 확장 |
| cyber clear 공식 모순 | Good 일부 가중치와 purification 100% 조건이 충돌 | D-04에서 수식과 sample scenario 승인 후 구현 |
| same-frame 판정 | clear·fail, input·collision이 동시에 발생할 수 있음 | game별 terminal priority function과 deterministic test |
| timing 기기 차이 | frame drop에 따라 timing game 결과가 달라질 수 있음 | `performance.now()` game clock, frame-independent judge, device playtest |
| resize state 손실 | orientation change로 object 위치·timer가 초기화될 수 있음 | logical coordinate 유지, renderer만 resize, state regression test |
| touch 오입력 | scroll·double tap·ghost click으로 입력이 중복될 수 있음 | Pointer Event normalization, `touch-action`, cooldown, once guard |
| listener·timer 누수 | mini game 재도전 뒤 input과 loop가 중복 실행될 수 있음 | lifecycle contract, centralized cleanup, destroy contract test |
| mobile 성능 저하 | 여러 sprite·effect·DOM update로 frame이 떨어질 수 있음 | lazy asset, object count 관리, DOM write batch, 기준 device profile |
| audio autoplay 차단 | 첫 화면에서 BGM이 재생되지 않을 수 있음 | 첫 gesture 이후 unlock, mute UI, visual cue 유지 |
| local save 손실 | browser data 삭제·private mode·quota로 진행이 사라짐 | 한계 안내, schema validation, write failure warning |
| 동시 tab save 충돌 | localStorage에는 원자적 CAS가 없어 완전 동시 write가 last-write-wins가 될 수 있음 | 단일-tab 안내, revision 감지, 지원 시 Web Locks, 무손실 요구 시 IndexedDB 별도 scope |
| static path 404 | subpath와 file case 차이로 asset이 누락될 수 있음 | base path 단일화, case-sensitive deploy smoke test |
| asset license 누락 | final 제출이나 공개 배포에 문제가 생길 수 있음 | source list를 asset 추가 PR의 완료 기준으로 사용 |
| content 과다 loading | 모든 game asset을 첫 진입에 load하면 대기시간 증가 | common preload와 game lazy load 분리 |
| scope 확대 | Battle, account, ranking이 MVP 일정을 침범할 수 있음 | 3.3 제외 범위 유지, change request로 별도 승인 |
| browser 차이 | Safari audio·viewport·touch 동작이 Chrome과 다를 수 있음 | 실제 device matrix로 조기 검증, 마지막 단계에만 미루지 않음 |

---

## 19. 현재 개발 우선순위

1. D-04~D-09의 game별 blocking rule에 owner와 확정 시점을 지정합니다.
2. static data schema, stable game ID, lifecycle·result contract를 먼저 고정합니다.
3. InputManager, game clock, pause, resize, destroy 같은 공통 runtime을 구현합니다.
4. Story intro → map → NPC → mini game intro까지의 vertical slice를 만듭니다.
5. test mini game으로 result·save·map return contract를 검증합니다.
6. 5개 game module을 독립적으로 구현하되 common contract test를 동일하게 적용합니다.
7. 가장 많은 `TBD`를 가진 Code Heart와 timing 복잡도가 높은 CLICK to PURIFY를 조기에 playtest합니다.
8. final story·map·art·audio를 data와 manifest에 통합합니다.
9. Chrome·Safari와 mobile actual device QA를 진행합니다.
10. static production URL, source list, 실행·조작 문서를 함께 마감합니다.

---

## 20. 운영 적용 순서

Production 배포는 다음 순서를 따릅니다.

```txt
1. D-01~D-12 중 release blocking 항목이 모두 확정되었는지 확인
2. JSON parse와 schema·reference validation 실행
3. unit·contract·integration test 실행
4. 임시 text, [작성 필요], blocking TBD, 승인 없는 placeholder 검색
5. asset source·license 목록과 실제 file 대조
6. image·audio 최적화와 case-sensitive path 검사
7. local production-equivalent static server에서 전체 smoke test
8. 새 `releases/<contentVersion>/` artifact 전체 생성·검증
9. HTTPS static host의 staging path에 업로드
10. subpath·MIME·cache·security header 확인
11. HTML meta·app config·manifest·JS constant version 일치 확인
12. Chrome·Safari PC·mobile smoke test
13. Story intro부터 5개 game 결과·map 복귀까지 end-to-end 확인
14. 검증된 immutable release directory를 production에 보존
15. stable index를 마지막에 해당 release로 전환하고 production URL 공개
16. 공개 직후 loading, audio, local save, 각 game 진입 재확인
17. 배포 version과 known issue 기록
```

문제가 발생하면 직전 검증 완료 static artifact로 되돌릴 수 있게 이전 배포본을 보존합니다. Save schema가 바뀌는 배포는 rollback 시 이전 data와의 호환성도 확인합니다.

---

## 21. 최종 검증 체크리스트

## 21.1 기획·data gate

- [ ] Repository·document slug, release `appId`, storage namespace, public project path가 `ai-change` 계약과 일치합니다.
- [ ] Final 노출 game명, logo, festival name이 승인되었습니다.
- [ ] Main story, player, map, NPC, dialogue가 승인되었습니다.
- [ ] NPC 수, NPC↔game cardinality, NPC별 completionRule이 D-02 승인 data와 일치합니다.
- [ ] 5개 학과·전공의 공식 명칭이 확인되었습니다.
- [ ] D-03~D-09의 blocking rule이 모두 확정되었습니다.
- [ ] D-10의 audio·art·volume, D-11의 browser·device·수치형 합격 기준, D-12의 팀 일정·담당자·host·public URL이 승인되었습니다.
- [ ] Final config에 blocking `TBD`, `[작성 필요]`, 잘못된 `null`이 없습니다.
- [ ] Draft config와 fixture는 production artifact와 runtime reference에 포함되지 않습니다.
- [ ] Production feature는 `story=true`, `localSave=true`이고 `battleContent`가 published Battle entry 유무와 일치합니다.
- [ ] Production `initialScene`은 `loading`이고 필수 version·asset 검증을 우회하지 않습니다.
- [ ] Asset manifest ID는 전역 unique이고 registry의 config·thumbnail·group 및 script·map·ingredient·image class reference가 모두 유효합니다.
- [ ] Test mini game은 metadata·config asset ID·static loader key 추가만으로 기존 core와 다른 game module 수정 없이 연결됩니다.

## 21.2 Loading·menu·story

- [ ] 공통 필수 asset load 전에는 main menu가 열리지 않습니다.
- [ ] Loading progress가 text와 bar로 표시됩니다.
- [ ] 필수 asset 실패 시 retry할 수 있습니다.
- [ ] 공유 asset은 consumer lease가 남아 있는 동안 revoke되지 않고 마지막 release·eviction에서만 해제됩니다.
- [ ] Main menu에서 Story와 Battle이 분리되어 있습니다.
- [ ] Battle 미공개 상태가 명확히 안내됩니다.
- [ ] 빈 Battle registry는 Coming Soon으로 연결되고, contract fixture는 Story registry 변경 없이 별도 route를 검증합니다.
- [ ] 게임 방법에서 공통·5개 game별 PC·mobile 목표와 조작을 확인할 수 있고 호출한 화면으로 focus가 복원됩니다.
- [ ] 설정의 volume·mute가 즉시 적용·저장되며 진행만 초기화할 때는 승인 없이 settings가 지워지지 않고 영향 범위 확인·취소를 지원합니다.
- [ ] Story intro의 이전·다음·skip이 정상 작동합니다.
- [ ] Skip 뒤 잘못된 scene으로 이동하거나 action이 두 번 실행되지 않습니다.

## 21.3 Map·NPC·dialogue

- [ ] 방향키와 WASD가 같은 속도로 player를 이동시킵니다.
- [ ] Mobile virtual pad로 연속 이동할 수 있습니다.
- [ ] 대각선 이동이 직선보다 빨라지지 않습니다.
- [ ] Map 경계, 건물, 장식물 collision이 정상입니다.
- [ ] NPC interaction range 안에서 느낌표가 강조됩니다.
- [ ] 범위 밖 NPC 선택 시 강제 이동하지 않고 접근 안내를 표시합니다.
- [ ] Mouse click, touch, interaction key로 대화를 시작할 수 있습니다.
- [ ] Dialogue 중 player 이동과 NPC 중복 interaction이 차단됩니다.
- [ ] 최초·재방문 dialogue가 완료 상태에 맞게 나옵니다.
- [ ] 완료 NPC는 color 외 icon·text로도 구분됩니다.

## 21.4 공통 mini game contract

- [ ] 5개 module이 `init/start/pause/resume/restart/destroy`를 제공합니다.
- [ ] `CLEAR`·`FAIL` 후보의 `onComplete`는 최대 한 번이고, setup error를 제외한 시작된 attempt의 `CLEAR`·`FAIL`·`QUIT`·runtime `ERROR` 경로는 host의 완료 event를 session당 정확히 한 번만 발행합니다.
- [ ] Candidate는 host field를 포함하지 않는 status별 schema를 통과하고, authoritative field 주입 뒤 final result가 `MiniGameResult` schema를 통과합니다.
- [ ] Pause 중 game timer, spawn, animation, penalty가 흐르지 않습니다.
- [ ] Hidden tab에서 자동 pause됩니다.
- [ ] D-11 threshold를 넘는 sleep·frame gap은 terminal 판정 전에 소급 pause되어 active time을 전진시키지 않습니다.
- [ ] Retry 연타는 `restart({attemptId})`를 한 번만 호출하고 module은 이전 attempt의 timer·object·listener를 누수 없이 정리한 뒤 승인된 retry policy를 적용합니다.
- [ ] 이전 attempt의 지연 callback은 token mismatch로 폐기되어 현재 attempt의 result·save를 바꾸지 않습니다.
- [ ] Import·factory·init setup error는 MiniGameResult·playCount를 만들지 않고 partial instance와 pre-mount lease를 정리한 뒤 ErrorScene으로 이동합니다.
- [ ] Pending init 취소는 signal abort·disposed guard를 적용해 늦은 continuation이 DOM·listener·해제된 asset을 다시 사용하지 않습니다.
- [ ] Runtime ERROR는 event를 한 번 확정한 뒤 loop·input을 멈추고 기존 instance와 lease를 항상 폐기하며, recoverable retry는 새 instance를 생성합니다.
- [ ] Map 복귀 전에 synchronous `destroy()`가 호출되어 timer·listener·RAF 정리가 끝납니다.
- [ ] Result 뒤 완료·play count와 policy 대상 best metric이 중복 저장되지 않습니다.
- [ ] 5개 published Story game 모두 승인된 non-null recordPolicy를 가지며 eligible status, metric projection, comparator, tie-break contract test가 통과합니다.
- [ ] Corrupt save와 storage unavailable 상황에서 app이 복구되고, transient dirty retry와 명시적 storage reprobe가 mode contract를 따릅니다.
- [ ] `CLEAR`·`FAIL`만 play count를 증가시키고 `CLEAR`는 game 완료를, NPC는 승인된 completionRule 충족 시에만 완료 처리합니다.
- [ ] 상태 변화가 없는 `QUIT`·`ERROR` terminal event는 localStorage write나 revision 증가를 만들지 않습니다.
- [ ] staging·production storage channel이 분리되고 전체 local data reset은 현재 channel의 현재·historical save, migration marker, corrupt backup allowlist만 삭제합니다.
- [ ] Future-version save를 읽은 뒤 game·setting을 조작해도 명시적 reset 전 raw value가 바뀌지 않습니다.
- [ ] 감지된 다른 tab write·reset은 reload 전 stale persistence를 차단하고, 완전 동시 write의 localStorage 한계와 단일-tab 권장이 help·known issue에 기록됩니다.
- [ ] Web Locks mode의 모든 durable write는 lock 내부에서 수행되고 pagehide는 새 lock 획득이나 lock 밖 synchronous write에 의존하지 않습니다.

## 21.5 숫자 야구

- [ ] Answer와 input은 중복 없는 3개 digit입니다.
- [ ] 3개 미만·중복 input은 submit되지 않고 Epoch를 소비하지 않습니다.
- [ ] Fit·Shift·Outlier 계산 unit test가 통과합니다.
- [ ] 유효 guess와 판정이 history에 순서대로 누적됩니다.
- [ ] `EPOCH n/9`와 progress가 정확합니다.
- [ ] 9회 안의 `3 Fit` clear와 9번째 fail이 정확합니다.
- [ ] Fail에서 answer가 공개됩니다.
- [ ] D-08의 leading zero, delete, timer, retry, 최고 기록 eligible status·metric projection·comparator·tie-break가 UI·rule·recordPolicy에 일치합니다.

## 21.6 CLICK to PURIFY

- [ ] D-04에서 승인된 learning wave 수와 Trojan → Worm → Ransomware → Spyware 학습 순서가 적용됩니다.
- [ ] 승인된 mixed wave 수와 후반 난이도 변화가 config와 일치합니다.
- [ ] Perfect·Good boundary가 timestamp 기준으로 정확합니다.
- [ ] Trojan 위장 중 click은 무효이고 reveal 후에만 판정됩니다.
- [ ] Worm은 D-04 승인 최대 횟수만 split하고 child가 안전한 위치에 생성됩니다.
- [ ] Ransom Miss 뒤 D-04 승인 시간 동안 input이 lock됩니다.
- [ ] Spyware가 D-04 승인 reveal 구간에서 나타납니다.
- [ ] Double click이 판정을 두 번 소비하지 않습니다.
- [ ] 클릭하지 않은 threat가 Good window 만료 시 Miss 1회로 resolve되고 type별 후처리를 실행합니다.
- [ ] `OnClickInput`은 lock되지 않은 범위 밖·Trojan 위장 입력을 포함한 모든 CLICK에서 판정 전에 한 번 발생합니다.
- [ ] 승인된 Miss limit, time limit, purification clear의 priority가 rule과 일치합니다.
- [ ] 11개 지정 event hook이 정확한 횟수로 발생합니다.
- [ ] D-04·D-05의 공식과 예외 scenario test가 통과합니다.
- [ ] D-04의 최고 기록 eligible status·metric projection·comparator·tie-break가 recordPolicy와 일치합니다.

## 21.7 Code Heart: Unlock!

- [ ] Customer, X알, order, patience가 현재 data와 일치합니다.
- [ ] Recipe book이 현재 order의 정확한 순서를 보여 줍니다.
- [ ] Ingredient 선택 순서가 최대 4개 slot에 표시됩니다.
- [ ] Slot overflow와 submit 연타가 차단됩니다.
- [ ] 초기화가 승인 rule에 맞게 동작합니다.
- [ ] Exact recipe만 success이고 누락·오재료·순서 오류는 Build Error입니다.
- [ ] 각 order의 승인된 중복 재료 허용 boolean이 release data와 판정에 반영됩니다.
- [ ] Timeout과 penalty가 D-06과 일치합니다.
- [ ] 4개 대표 recipe의 모든 ingredient가 catalog에 있습니다.
- [ ] Clear 기준, submit label, reward가 D-03·D-06과 일치합니다.
- [ ] D-06의 최고 기록 eligible status·metric projection·comparator·tie-break가 recordPolicy와 일치합니다.

## 21.8 AI Ball Classification Game

- [ ] 목표 image가 허용 catalog에서 무작위로 정해져 시작 전에 고정 표시됩니다.
- [ ] 3초 countdown 전에는 공이 움직이지 않습니다.
- [ ] Queue가 정답 5개, 오답 25개를 정확히 포함합니다.
- [ ] 공이 왼쪽에서 오른쪽으로 승인된 속도·간격으로 이동합니다.
- [ ] Lid가 내부 방향으로 열리고 OPEN/CLOSE state가 UI와 일치합니다.
- [ ] OPEN/CLOSE button이 lid와 같은 높이에 배치되어 작은 화면에서도 관계가 명확합니다.
- [ ] 정답 수집과 오답 통과가 정상 진행됩니다.
- [ ] 정답 유실 또는 오답 수집 1회에 즉시 fail합니다.
- [ ] Fail 뒤 movement·spawn·input이 즉시 정지합니다.
- [ ] Retry가 target, queue, counter, lid state를 초기화합니다.
- [ ] 5번째 정답을 수집한 뒤에도 남은 공을 처리하고, 총 30개를 올바르게 처리한 뒤 clear합니다.
- [ ] D-07의 initial state, collision, 개폐 중 input rule이 반영되었습니다.
- [ ] D-07의 최고 기록 eligible status·metric projection·comparator·tie-break가 recordPolicy와 일치합니다.

## 21.9 인지알·데사알 분류 게임

- [ ] Timer 45초, life 5, platform LEFT로 시작합니다.
- [ ] 0~10, 10~25, 25~45초 구간의 spawn interval이 승인 boundary와 일치합니다.
- [ ] Left·right input마다 platform이 0.2초 동안 전환됩니다.
- [ ] Platform collision 순간 route가 확정되고 이후 input으로 바뀌지 않습니다.
- [ ] 인지알은 왼쪽, 데사알은 오른쪽 box에서 correct입니다.
- [ ] 반대 box와 screen exit는 life를 1만 차감합니다.
- [ ] 10초 이하 warning이 text와 visual로 표시됩니다.
- [ ] Timer 0과 life 0이 같은 update에 발생한 경우 D-09의 승인 priority를 적용합니다.
- [ ] Timer 종료 clear가 확정되면 spawn·movement·추가 판정을 즉시 중단하고 active egg는 결과에 영향을 주지 않는 D-09 정리 연출만 수행합니다.
- [ ] Pause와 orientation change 뒤 timer, egg, platform state가 유지됩니다.
- [ ] D-09의 최고 기록 eligible status·metric projection·comparator·tie-break가 recordPolicy와 일치합니다.

## 21.10 반응형·접근성·audio

- [ ] PC, notebook, tablet, mobile에서 주요 UI가 잘리지 않습니다.
- [ ] Mobile portrait와 landscape에서 pause·map 복귀가 가능합니다.
- [ ] Browser UI, notch, home bar가 control을 가리지 않습니다.
- [ ] Resize·orientation change가 game을 restart하지 않습니다.
- [ ] Dot graphic의 비율이 찌그러지지 않습니다.
- [ ] Touch target은 최소 44 CSS px이고 D-11에서 승인한 간격·contrast 기준을 만족합니다.
- [ ] Keyboard focus가 보이고 modal 안에서 올바르게 이동합니다.
- [ ] Color 없이도 clear·fail·완료·danger를 구분할 수 있습니다.
- [ ] Mute 상태에서도 모든 필수 정보를 확인할 수 있습니다.
- [ ] 첫 사용자 gesture 뒤 audio가 시작되며 실패해도 play할 수 있습니다.
- [ ] 과도한 flash·screen shake가 없습니다.
- [ ] `prefers-reduced-motion`에서 decorative motion이 줄고 중요 판정이 중복 없는 `aria-live` text로 전달됩니다.

## 21.11 Browser·performance·배포

- [ ] Chrome PC·mobile에서 전체 flow가 동작합니다.
- [ ] Safari PC·mobile에서 전체 flow가 동작합니다.
- [ ] D-11에서 승인한 반복 횟수 뒤 RAF, timer, listener, memory 증가량이 허용치 안입니다.
- [ ] 기준 device의 frame time과 input latency가 D-11 승인 수치 안입니다.
- [ ] Initial asset과 mini game lazy asset이 분리되어 있습니다.
- [ ] 모든 production path의 대소문자와 MIME type이 올바릅니다.
- [ ] Domain root와 `/ai-change/`에서 JSON·asset·dynamic module 진입에 404가 없습니다.
- [ ] Route 취소 뒤 stale async 결과가 mount되지 않고, asset retry와 module import 실패 reload가 계약대로 동작합니다.
- [ ] HTML meta·app config·manifest·JS constant의 version mismatch가 stale 실행을 막고 versioned release+stable index-last 전환과 rollback이 동작합니다.
- [ ] HTTPS URL 접속만으로 game이 실행됩니다.
- [ ] 새로고침 뒤 progression과 setting이 복원됩니다.
- [ ] Empty·old·corrupt·future save, quota·SecurityError, manual+visibility+modal pause 조합이 D-11 scenario를 통과합니다.
- [ ] 이전 검증 완료 배포본으로 rollback할 수 있습니다.

## 21.12 제출 자료

- [ ] 최종 기획안이 실제 game rule과 일치합니다.
- [ ] 전체 source code, JSON data, asset이 포함되어 있습니다.
- [ ] 실행 가능한 production URL이 있습니다.
- [ ] `README.md`에 local 실행과 project 구조가 정리되어 있습니다.
- [ ] PC·mobile 실행 및 조작 방법 문서가 있습니다.
- [ ] 외부 image·audio·font마다 실제 파일명, resource 종류, 제작자·제공처, 원본 URL, license, 수정 여부, 사용 위치 7개 항목이 기록되어 있습니다.
- [ ] 자체 제작 resource도 `자체 제작`으로 구분되어 있습니다.
- [ ] Known issue와 승인된 예외가 기록되어 있습니다.

위 checklist를 모두 만족하면 ai-change의 1차 MVP 배포가 완료된 것으로 봅니다.
