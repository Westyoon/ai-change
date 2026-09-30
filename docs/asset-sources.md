# ai-change 리소스 출처 목록

## 1. 기록 기준

`data/asset-manifest.json`의 모든 `sourceRef`를 이 문서에서 추적합니다. 공통 로고, 캐릭터 스프라이트, 음원 2종과 학과별 미니게임 배경은 사용자가 제공한 최종 파일을 사용합니다. 출처와 권한이 불명확했던 AI 기능 브랜치의 `sample.png`는 내부 제작 `ai-ball-sample.svg`로 교체했고 production `dist/`에서 제외합니다. JSON 콘텐츠는 프로젝트 기획 문서와 각 기능 브랜치 설정을 바탕으로 작성했습니다.

최종 이미지·음원·폰트로 교체할 때는 실제 파일명, 종류, 제작자, 원본 URL, 라이선스, 수정 내용, 사용 위치를 확인한 뒤 이 문서와 manifest를 함께 갱신해야 합니다.

## 2. 콘텐츠 데이터

| SourceRef | 실제 파일명 | 종류 | 제작자·출처 | 원본 URL | 라이선스·사용 권한 | 수정 내용 | 사용 위치 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CONTENT-COMMON-001` | `data/departments.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, 기획 문서 기반 | 해당 없음 | 프로젝트 내부 제작물 | 학과 코드·표시명 SSOT로 구조화 | 학과 표시와 참조 검증 |
| `CONTENT-COMMON-002` | `data/minigames.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 5개 미니게임 registry 스캐폴드 작성 | 미니게임 메뉴·진입 |
| `CONTENT-COMMON-003` | `data/battles.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 운영 사후 콘텐츠 5종과 5종 완료 해금 조건 등록 | Battle 목록·해금 판정 |
| `CONTENT-COMMON-004` | `data/map-data.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 5개 학과 NPC·상호작용 반경·수호알 후일담 연결 | 이동형 Story 맵 MVP |
| `CONTENT-COMMON-005` | `data/scripts/npc-dialogues.json`의 `main-story-intro` 및 5개 `*-npc-first` | JSON 대사 | 프로젝트 사용자가 제공한 스토리 원고 기반 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 제공 | 2026-09-21 프로토타입용 공통 인트로 15줄과 학과별 진입 대사 3줄씩 구조화 | Story 진입·학과별 게임 진입 대사창 |
| `CONTENT-COMMON-006` | `data/scripts/npc-dialogues.json` | JSON 대사 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | NPC 최초·재방문 및 게임 안내 문구 작성 | NPC·미니게임 안내 대화 |
| `CONTENT-COMMON-007` | `data/scripts/minigame-outros.json` | JSON 대사 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 성공·실패 개발용 문구 작성 | 결과 이후 outro |
| `CONTENT-COMMON-008` | `data/guardian-eggs.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, Story 월드 기획 기반 | 해당 없음 | 프로젝트 내부 제작물 | 5개 학과 수호알의 고정 ID·이름·색·설명·미니게임/후일담 연결을 구조화 | Story 인벤토리·수호알 획득 연출 |
| `CONTENT-DS-001` | `data/minigames/number-baseball.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | DS 숫자 야구 |
| `CONTENT-CS-001` | `data/minigames/click-to-purify.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | CS CLICK to PURIFY |
| `CONTENT-CSE-001` | `data/minigames/code-heart.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | CSE Code Heart |
| `CONTENT-AI-001` | `data/minigames/ai-ball-classification.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | AI Ball Classification |
| `CONTENT-AIDS-001` | `data/minigames/ai-data-egg-sort.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | AIDS 인지알·데사알 분류 |
| `CONTENT-BATTLE-001` | `data/battle/stat-boss.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 사후게임 통합 기준 | 해당 없음 | 프로젝트 내부 제작물 | 보스 체력·패턴 시간·조작·결과 표시 설정 구조화 | published `stat-boss` |
| `CONTENT-BATTLE-002` | `data/battle/data-sphinx.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기존 Data Sphinx 프로토타입 기반 | 해당 없음 | 프로젝트 내부 제작물 | O/X 문제·제한 시간·고정 피해·결과 표시 설정 정리 | published `data-sphinx` |
| `CONTENT-BATTLE-003` | `data/battle/control-boss.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기존 Control Boss 프로토타입 기반 | 해당 없음 | 프로젝트 내부 제작물 | 4단계 기믹·보스/플레이어 수치·조작·결과 표시 설정 정리 | published `control-boss` |
| `CONTENT-BATTLE-004` | `data/battle/xr-egg-trials.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기존 X알 미니게임 3종 기반 | 해당 없음 | 프로젝트 내부 제작물 | 무작위 시험·카드·연타 수치와 조작·결과 표시 설정 정리 | published `xr-egg-trials` |
| `CONTENT-BATTLE-005` | `data/battle/word-breaker.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 최종전 기획안 기반 | 해당 없음 | 프로젝트 내부 제작물 | 다섯 수호알 라운드·부정/회복 문장·세로 슈팅 수치 구조화 | published `word-breaker` |

## 3. 브랜드·이미지·음원

| SourceRef | 실제 파일명 | 종류 | 제작자·출처 | 원본 URL | 라이선스·사용 권한 | 수정 내용 | 사용 위치 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ASSET-COMMON-001` | `assets/images/main logo.png` | PNG 브랜드 로고 | 프로젝트 사용자가 최종 원본 제공 | 해당 없음 | 프로젝트 운영 사용을 전제로 사용자 제공, 외부 재배포 권한은 사용자 확인 | 원본 그림은 수정하지 않고 비율을 유지해 반응형 축소 표시 | 로딩·메인 메뉴 |
| `ASSET-COMMON-002` | `assets/images/character-walk.png` | PNG 캐릭터 스프라이트 | 프로젝트 사용자가 운영 배포용 원본 제공 | 해당 없음 | 본 프로젝트의 공개 운영 사용 승인, 제3자 재배포는 별도 확인 | 그림은 수정하지 않고 파일명만 kebab-case로 정리, 4방향×4프레임 영역을 표시 | 공용 전투 캐릭터 이동·캐릭터 미리보기 |
| `ASSET-STORY-EGG-001` | `assets/images/story-eggs/xr-egg.png` | PNG X알 이미지 | 프로젝트 사용자가 운영 배포용 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 그림은 수정하지 않고 배포 안전성을 위해 영문 파일명으로 정리 | 사후게임 랜덤 필드 X알 조우·X알 시험 실패 결과 |
| `ASSET-STORY-EGG-002` | `assets/images/story-eggs/heart-egg.png` | PNG 마음의 알 이미지 | 프로젝트 사용자가 운영 배포용 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 그림은 수정하지 않고 배포 안전성을 위해 영문 파일명으로 정리 | X알 시험 클리어 후 마음의 알 변신 결과 |
| `ASSET-DS-001` | `assets/minigames/number-baseball/game-background.png` | PNG 게임 배경 | 프로젝트 사용자가 `데사.png` 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 원본 구도를 유지해 2048×1258로 축소 | DS 숫자 야구 게임 카드 배경 |
| `ASSET-CSE-001` | `assets/minigames/code-heart/game-background.png` | PNG 게임 배경 | 프로젝트 사용자가 `컴공.png` 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 체크무늬 구도를 유지해 2048×972로 축소 | CSE Code Heart 전체 게임 배경 |
| `ASSET-CS-001` | `assets/minigames/click-to-purify/stage-background.png` | PNG 게임 배경 | 프로젝트 사용자가 `사보1.png` 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 투명 외곽을 제외하고 2048×1253으로 축소 | CS CLICK to PURIFY 전체 스테이지 배경 |
| `ASSET-CS-002` | `assets/minigames/click-to-purify/arena-background.png` | PNG 플레이 영역 배경 | 프로젝트 사용자가 `사보2.png` 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 투명 여백을 잘라 1200×1200 플레이용 정사각형으로 축소 | CS CLICK to PURIFY 캔버스 배경 |
| `ASSET-AI-001` | `assets/minigames/ai-ball-classification/game-background.png` | PNG 게임 배경 | 프로젝트 사용자가 `인지.png` 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 오른쪽 메인 영역에서 실제 플레이 비율 구간을 잘라 960×920으로 축소 | AI Ball Classification 플레이 캔버스 배경 |
| `ASSET-AI-003` | `assets/minigames/ai-ball-classification/sorting-bin.png` | PNG 정보 선별 상자 | 프로젝트 사용자가 `인지.png` 원본 제공 | 해당 없음 | 본 프로젝트 운영 사용을 전제로 사용자 제공 | 왼쪽 아래 정보 선별 상자만 분리해 256×264로 축소 | AI Ball Classification의 충돌 판정 유지형 선별 상자 |
| `ASSET-AUDIO-001` | `assets/bgm/main-theme.mp3` | MP3 배경음 | 프로젝트 사용자가 운영 배포용 원본 제공 | 해당 없음 | 본 프로젝트의 공개 운영 사용 승인, 제3자 재배포는 별도 확인 | 음원 내용은 수정하지 않고 파일명만 kebab-case로 정리해 반복 재생 | 앱 최초 진입 이후 공통 배경음 |
| `ASSET-AUDIO-002` | `assets/bgm/intro.mp3` | MP3 인트로 음원 | 프로젝트 사용자가 운영 배포용 원본 제공 | 해당 없음 | 본 프로젝트의 공개 운영 사용 승인, 제3자 재배포는 별도 확인 | 음원 내용은 수정하지 않고 운영 파일에 포함 | 운영 배포에 보관, 현재 장면에서는 재생하지 않음 |
| `ASSET-AI-002` | `assets/images/ai-ball-sample.svg` | SVG placeholder | ai-change 프로젝트 자체 제작 | 해당 없음 | 프로젝트 내부 사용 가능, 최종 배포 정책 확인 필요 | 파란색·보라색 원과 자체 작성 gradient·path로 기존 PNG sample을 교체 | AI Ball Classification 목표 미리보기·목표 공·방해 공 |
| `ASSET-AIDS-001` | `assets/minigames/ai-data-egg-sort/game-background.png` | PNG 픽셀 아트 배경 | 사용자 제공 구도·색감 참고 이미지와 OpenAI 내장 이미지 생성 도구로 신규 제작 | 해당 없음 | 본 프로젝트 운영용 생성 자산 | 깨진 확대 도트와 우측 하단 이물 요소를 제거하고, 911×1727 세로 배경으로 재구성. 390×740 논리 프레임에 비율 유지 표시 | AIDS 인지알·데사알 분류 게임 전체 프레임 배경 |

배포되는 나머지 SVG 파일은 외부 이미지나 로고를 복제하지 않았으며, 단순 도형과 텍스트만으로 생성했습니다.

## 4. 외부 리소스 현황

### 픽셀 정보 선별 상자 (ASSET-AI-004)

- 운영 파일: `assets/minigames/ai-ball-classification/sorting-bin-pixel.png` (1182×1330 RGBA).
- 사용자 제공 `sorting-bin.png`를 OpenAI 내장 이미지 생성 도구로 픽셀아트 스타일 변환. 원본은 보관한다.
- 체크무늬, 하트 패치, 검은 스트랩과 리벳을 유지했다. 투명 여백은 게임에서 `(27, 58, 1129, 1201)` 영역을 읽어 제외하며, 기존 분류통 좌표·판정은 유지한다.
- 최근접 보간으로 게임에 표시한다. 생성 프롬프트는 `docs/sorting-bin-pixel-prompt.md`에 기록했다.
- 기존 `guardian-ai.png`와 `guardian-ds.png`는 AIDS의 인지/데사 낙하 수호알과 받는 상자의 표식에도 재사용한다. `ai-data-egg-sort` 그룹에서 두 이미지의 사전 로딩을 보장한다.

브랜드 UI 글꼴은 `Galmuri 2.40.4`의 `Galmuri11.woff2`와 `Galmuri11-Bold.woff2`를 수정 없이 자체 제공합니다. 제작자는 이민서(quiple), 라이선스는 SIL Open Font License 1.1이며 전문은 `assets/fonts/LICENSE.txt`에 함께 배포합니다. 원본은 [Galmuri 공식 v2.40.4 릴리스](https://github.com/quiple/galmuri/releases/tag/v2.40.4)이고, 불러오지 못하면 시스템 한글 글꼴로 대체합니다.

기존 `assets/images/sample.png`는 원본과 권한이 문서화되지 않은 기능 브랜치 참고 파일로만 남아 있으며 manifest와 production `dist/`에는 포함하지 않습니다. 이후 외부 리소스를 추가할 때는 아래 항목을 모두 작성한 뒤 사용합니다.

- 원본 파일명과 실제 저장 파일명
- 리소스 종류
- 제작자 또는 배포처
- 직접 연결되는 원본 URL
- 라이선스와 상업적·수정 사용 가능 여부
- crop, recolor, 압축 등 수정 내용
- 게임 안의 구체적인 사용 위치

## 5. 교체 및 검증 규칙

### ASSET-AI-005 · 분리형 정보 선별 상자

사용자가 제공한 `assets/images/인지 상자 몸통.png`(1260×1248)와 `인지 상자 뚜껑.png`(1133×232)를 원본 그대로 사용한다. AI 사전게임에서 각각 독립적으로 로드하며, 투명 여백만 렌더링 소스 좌표로 제외한다. 몸통은 원본 비율을 유지하고 뚜껑은 왼쪽 경첩을 기준으로 0.18초에 걸쳐 회전한다. 이전 일체형 이미지는 참고 원본으로 보존한다. 별도 이미지 재생성이나 원본 덮어쓰기는 하지 않는다.

- manifest의 asset ID는 코드와 콘텐츠 참조에 사용되므로 가능하면 유지합니다.
- 파일을 교체하면 `src`, `alt`, `sourceRef`와 이 문서를 함께 갱신합니다.
- 같은 파일을 재사용하더라도 화면 맥락에 맞는 대체 텍스트가 필요한지 확인합니다.
- 출처나 라이선스를 확인할 수 없는 파일은 production 배포에 포함하지 않습니다.
- `data/drafts/`의 결정 추적 파일은 runtime asset과 production artifact에 포함하지 않습니다.
