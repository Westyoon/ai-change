# ai-change 리소스 출처 목록

## 1. 기록 기준

`data/asset-manifest.json`의 모든 `sourceRef`를 이 문서에서 추적합니다. 현재 등록된 이미지 6개는 외부 에셋이 아니라 코드로 직접 작성한 SVG placeholder이며, JSON 콘텐츠는 프로젝트 기획 문서를 바탕으로 작성한 개발 스캐폴드입니다.

최종 이미지·음원·폰트로 교체할 때는 실제 파일명, 종류, 제작자, 원본 URL, 라이선스, 수정 내용, 사용 위치를 확인한 뒤 이 문서와 manifest를 함께 갱신해야 합니다.

## 2. 콘텐츠 데이터

| SourceRef | 실제 파일명 | 종류 | 제작자·출처 | 원본 URL | 라이선스·사용 권한 | 수정 내용 | 사용 위치 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CONTENT-COMMON-001` | `data/departments.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, 기획 문서 기반 | 해당 없음 | 프로젝트 내부 제작물 | 학과 코드·표시명 SSOT로 구조화 | 학과 표시와 참조 검증 |
| `CONTENT-COMMON-002` | `data/minigames.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 5개 미니게임 registry 스캐폴드 작성 | 미니게임 메뉴·진입 |
| `CONTENT-COMMON-003` | `data/battles.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | MVP용 빈 Battle registry 작성 | Battle Coming Soon 판정 |
| `CONTENT-COMMON-004` | `data/map-data.json` | JSON 콘텐츠 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 5개 학과 NPC를 임시 좌표에 배치 | 축제 맵 스캐폴드 |
| `CONTENT-COMMON-005` | `data/scripts/main-story.json` | JSON 대사 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 개발용 인트로 한 줄 작성 | Story intro |
| `CONTENT-COMMON-006` | `data/scripts/npc-dialogues.json` | JSON 대사 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | NPC 최초·재방문 및 게임 안내 문구 작성 | NPC·미니게임 안내 대화 |
| `CONTENT-COMMON-007` | `data/scripts/minigame-outros.json` | JSON 대사 | ai-change 프로젝트 자체 작성, PLAN 기반 | 해당 없음 | 프로젝트 내부 제작물 | 성공·실패 개발용 문구 작성 | 결과 이후 outro |
| `CONTENT-DS-001` | `data/minigames/number-baseball.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | DS 숫자 야구 |
| `CONTENT-CS-001` | `data/minigames/click-to-purify.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | CS CLICK to PURIFY |
| `CONTENT-CSE-001` | `data/minigames/code-heart.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | CSE Code Heart |
| `CONTENT-AI-001` | `data/minigames/ai-ball-classification.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | AI Ball Classification |
| `CONTENT-AIDS-001` | `data/minigames/ai-data-egg-sort.json` | JSON 게임 설정 | ai-change 프로젝트 자체 작성, 기능명세 기반 | 해당 없음 | 프로젝트 내부 제작물 | 목표와 PC·모바일 조작만 구조화 | AIDS 인지알·데사알 분류 |

## 3. 자체 제작 placeholder 이미지

| SourceRef | 실제 파일명 | 종류 | 제작자·출처 | 원본 URL | 라이선스·사용 권한 | 수정 내용 | 사용 위치 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ASSET-COMMON-001` | `assets/images/app-logo.svg` | SVG placeholder | ai-change 프로젝트 자체 제작, Codex 코드 스캐폴딩 | 해당 없음 | 프로젝트 내부 사용 가능, 최종 배포 정책 확인 필요 | 단순 도형과 `ai-change` 문자로 신규 작성 | 로딩·메인 로고 |
| `ASSET-DS-001` | `assets/minigames/number-baseball/thumbnail.svg` | SVG placeholder | ai-change 프로젝트 자체 제작, Codex 코드 스캐폴딩 | 해당 없음 | 프로젝트 내부 사용 가능, 최종 배포 정책 확인 필요 | 숫자 타일과 `DS` 코드로 신규 작성 | DS 미니게임 썸네일 |
| `ASSET-CS-001` | `assets/minigames/click-to-purify/thumbnail.svg` | SVG placeholder | ai-change 프로젝트 자체 제작, Codex 코드 스캐폴딩 | 해당 없음 | 프로젝트 내부 사용 가능, 최종 배포 정책 확인 필요 | 방패·커서와 `CS` 코드로 신규 작성 | CS 미니게임 썸네일 |
| `ASSET-CSE-001` | `assets/minigames/code-heart/thumbnail.svg` | SVG placeholder | ai-change 프로젝트 자체 제작, Codex 코드 스캐폴딩 | 해당 없음 | 프로젝트 내부 사용 가능, 최종 배포 정책 확인 필요 | 코드 기호·하트와 `CSE` 코드로 신규 작성 | CSE 미니게임 썸네일 |
| `ASSET-AI-001` | `assets/minigames/ai-ball-classification/thumbnail.svg` | SVG placeholder | ai-change 프로젝트 자체 제작, Codex 코드 스캐폴딩 | 해당 없음 | 프로젝트 내부 사용 가능, 최종 배포 정책 확인 필요 | 공·분류함과 `AI` 코드로 신규 작성 | AI 미니게임 썸네일 |
| `ASSET-AIDS-001` | `assets/minigames/ai-data-egg-sort/thumbnail.svg` | SVG placeholder | ai-change 프로젝트 자체 제작, Codex 코드 스캐폴딩 | 해당 없음 | 프로젝트 내부 사용 가능, 최종 배포 정책 확인 필요 | 알·상자와 `AIDS` 코드로 신규 작성 | AIDS 미니게임 썸네일 |

SVG 파일은 외부 이미지나 로고를 복제하지 않았으며, 단순 도형과 텍스트만으로 생성했습니다. 최종 디자인 자산이 제공되면 사용자에게 노출되는 placeholder를 교체합니다.

## 4. 외부 리소스 현황

현재 manifest에는 외부 이미지, 음원, 폰트, 아이콘이 등록되어 있지 않습니다. 이후 외부 리소스를 추가할 때는 아래 항목을 모두 작성한 뒤 사용합니다.

- 원본 파일명과 실제 저장 파일명
- 리소스 종류
- 제작자 또는 배포처
- 직접 연결되는 원본 URL
- 라이선스와 상업적·수정 사용 가능 여부
- crop, recolor, 압축 등 수정 내용
- 게임 안의 구체적인 사용 위치

## 5. 교체 및 검증 규칙

- manifest의 asset ID는 코드와 콘텐츠 참조에 사용되므로 가능하면 유지합니다.
- 파일을 교체하면 `src`, `alt`, `sourceRef`와 이 문서를 함께 갱신합니다.
- 같은 파일을 재사용하더라도 화면 맥락에 맞는 대체 텍스트가 필요한지 확인합니다.
- 출처나 라이선스를 확인할 수 없는 파일은 production 배포에 포함하지 않습니다.
- `data/drafts/`의 결정 추적 파일은 runtime asset과 production artifact에 포함하지 않습니다.
