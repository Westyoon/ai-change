# 사전게임 스토리 구성과 편집 안내

## 작업 브랜치

이 스토리 변경은 `feature/pre-game-story-intro` 브랜치에만 둔다. 운영 `main`과 분리되어 있으므로 검토 후 합치거나 브랜치 자체를 삭제할 수 있다.

## 현재 연결된 흐름

```text
메인 메뉴의 게임 시작
  → 마음의 알 인트로 12단계
  → 학과 선택 맵과 수호알 N / 5
  → 학과 캐릭터의 고민 3문장
  → 기존 미니게임 안내
  → 기존 미니게임
  → CLEAR 결과
  → 회복 대사 3문장과 수호알 획득
  → 맵 복귀와 진행 수 갱신
```

- 인트로는 `data/scripts/main-story.json`의 `main-story-intro`를 순서대로 읽는다.
- 학과별 게임 전 대사는 `data/scripts/npc-dialogues.json`의 `*-npc-first`에 있다.
- CLEAR 후 대사는 `data/scripts/minigame-outros.json`의 `*-clear`에 있다.
- 재방문과 실패 문구는 사용자 원고에 별도 내용이 없어 기존 문구를 유지한다.
- 완료 수는 게스트 로컬 저장과 로그인 계정의 `completedGameIds`를 합쳐 서로 다른 5개 게임 기준으로 센다.
- 5 / 5가 되면 현재 실행 가능한 사후게임 목록으로 이동할 수 있다. 이아이 최종 이야기 자체는 아래와 같이 원고만 준비된 단계다.

## 원고 ID 대응표

| 학과 | 게임 전 이야기 | CLEAR 후 이야기 |
| --- | --- | --- |
| 인공지능학부 | `ai-npc-first` | `ai-ball-classification-clear` |
| 데이터사이언스전공 | `ds-npc-first` | `data-number-baseball-clear` |
| 컴퓨터공학과 | `cse-npc-first` | `computer-code-heart-clear` |
| 사이버보안학과 | `cs-npc-first` | `cyber-click-to-purify-clear` |
| 인공지능데이터사이언스학부 | `aids-npc-first` | `ai-data-egg-sort-clear` |

대사를 수정할 때 `id`와 `nextAction.target`은 stable ID이므로 바꾸지 않는다. 화면 문구는 각 `lines` 항목의 `speaker`, `text`, `stageDirection`만 수정하면 된다. 원고의 `(클릭)` 표기는 UI 동작이므로 대사에 넣지 않았다.

## 인트로 시각 상태

새 일러스트가 없는 상태에서도 흐름을 확인할 수 있도록 `css/dialogue.css`의 CSS 도형과 색으로 다음 상태를 표현한다.

1. `egg-outline`: 검은 화면과 알 윤곽
2. `egg-glow`: 빛나는 마음의 알
3. `students`: 해 질 무렵 ECC와 세 학생
4. `fog`: 학생들에게서 모이는 검은 안개
5. `iai-flame`, `iai-fade`: 이아이와 작아지는 불꽃
6. `x-egg`: 일그러진 캠퍼스와 X알
7. `amu`: 아무의 등장
8. `locks`: 꽃잎 자물쇠 다섯 개

장면을 추가할 때는 JSON의 `visual` 값과 `INTRO_VISUAL_STATES` 및 대응 CSS를 함께 추가해야 한다. 자동 재생은 사용하지 않으며 명시적인 다음 버튼을 클릭·터치하거나 키보드로 선택해 넘긴다. 동작 감소 설정에서는 불꽃 애니메이션과 전환을 끈다.

## 후속 원고와 아직 연결하지 않은 범위

사용자가 제공한 이아이 최종전, 전투 중 대사 10개, 클리어 대화, 소원 질문, 아웃트로는 유실되지 않도록 `main-story.json`에 아래 ID로 구조화했다.

- `iai-battle-intro`
- `iai-battle-subtitles`
- `iai-battle-clear`
- `main-story-outro`

이 네 스크립트는 `implementationStatus: NARRATIVE_READY`이며 현재 배틀 런타임에는 아직 연결하지 않는다. 기존 사후게임 4종 중 어느 전투를 이아이 최종전으로 확정할지, 이아이·수호캐릭터·엠브리오 아트와 음원의 사용 권리가 확정되기 전에 기존 전투를 덮어쓰지 않기 위해서다.

전투 자막 설정은 원고대로 8~12초 간격, 5초 노출, 한 전투 안에서 중복 없음, 전투 종료 시 중단으로 기록했다. 실제 연결 시에는 배틀 모듈 내부가 아니라 pause/retry/unmount를 아는 공통 battle host에서 타이머를 관리한다.

## 색상 기준

| 역할 | 색상 |
| --- | --- |
| 주 강조색 | `#d82f76` |
| 보조 마젠타 | `#e333bb` |
| 기본 패널·짙은 보라 | `#363367` |
| 포커스·빛·진행 강조 | `#2ab5e4` |

위 네 색은 `css/common.css`의 공통 변수에 모아 두었다. 화면별 색을 바꿀 때 하드코딩을 늘리지 말고 공통 변수를 우선 사용한다.

## 음원과 이미지

현재 manifest에는 인트로·학과 스토리 전용 음원이나 캐릭터 일러스트가 없다. 따라서 이번 브랜치는 승인되지 않은 곡을 포함하지 않고 CSS 연출만 사용한다. 특정 작품의 곡이나 캐릭터를 공개 운영본에 넣기 전에는 사용 권리를 확인하고, 가능하면 축제용 오리지널 음원·캐릭터 자산으로 교체한다.

소원 문구도 현재 D1이나 브라우저 저장소에 저장하지 않는다. 이를 계정에 저장하려면 수집 동의, 길이 제한, 보관·삭제 정책, 공개 여부와 악성 문구 처리를 먼저 정해야 한다.

## 브랜치 제거

아직 합치지 않았다면 다음 두 명령으로 로컬·원격 기능 브랜치만 제거할 수 있다. 실행 전 다른 브랜치로 이동한다.

```powershell
git switch main
git branch -D feature/pre-game-story-intro
git push origin --delete feature/pre-game-story-intro
```
