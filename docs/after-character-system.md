# 사후게임 공용 캐릭터 시스템

> 구현 브랜치: `after/character-move`
>
> 구현 기준: 2026-08-29 첨부 사후게임 기획안의 `9. 캐릭터 시스템 기획`
>
> 상태: 캐릭터 이동·기본 전투 연결 API 구현, 실제 Battle 콘텐츠·최종 아트 미연결

## 구현 범위

`js/battle/character/`는 필드, O/X 보스, 스탯 중심 보스, 컨트롤 중심 보스가 같은 캐릭터 코어를 사용하도록 만든 공용 모듈이다.

- WASD·기존 공통 이동 입력과 모바일 조이스틱을 같은 이동 벡터로 정규화
- Space와 모바일 공격 버튼을 같은 공격 명령으로 정규화
- 상·하·좌·우 방향, 마지막 방향 유지, `idle`·`walk` 표시 상태
- delta time 이동, 맵 경계, solid collider, 얇은 벽 통과 방지, 벽면 sliding
- X알·필드 미니게임·전투 입장·공격 발판·함정·회피 구역의 `enter`·`stay`·`exit` 접촉 이벤트
- `idle`, `moving`, `attacking`, `hit`, `dead`, `control-locked` 상태
- 최대·현재 체력, 외부에서 계산 완료된 피해 수신, 체력 0 사망, 피격 무적 시간 없음
- 계정 시스템의 `attack`, `defense`, `health` 값 보관. 현재 auth 브랜치의 `hp`도 `health` 입력 별칭으로 수용
- 위치·방향·이동·공격·체력·사망·외형을 포함한 JSON 직렬화 가능 snapshot
- 외부 snapshot으로 다른 이용자 캐릭터를 그리는 원격 캐릭터 view
- 방향별 `idle`·`walk` 이미지 URL을 전달할 수 있는 appearance seam과 최종 아트 전 CSS placeholder

공격 범위, 근접·원거리 방식, 타격 판정, 피해·방어·최대 체력 공식, 쿨다운, 공격 이미지·이펙트, 부활 규칙은 구현하지 않았다. 로그인·저장·실시간 통신·랭킹과 보스 승패 판정도 각 담당 시스템의 범위다.

## 빠른 확인

```text
npm run dev
→ http://127.0.0.1:4173/
→ 메인 메뉴
→ 캐릭터 시스템 (DEV PREVIEW)
```

연습장은 실제 Battle registry를 publish하지 않는 개발용 연결 화면이다. `data/battles.json=[]`와 `features.battleContent=false`는 그대로 유지되며, 기존 `배틀 · COMING SOON` 화면도 남아 있다.

PC에서는 WASD와 Space를 사용한다. 모바일 또는 폭 720px 이하 화면에서는 연습장 아래쪽에 조이스틱과 공격 버튼이 표시된다. `피격 API 테스트 · 10`의 수치는 반복 피격과 사망 상태를 확인하기 위한 fixture일 뿐 전투 밸런스가 아니다.

## 기본 사용법

```js
import {
  CHARACTER_EVENTS,
  CHARACTER_TRIGGER_KINDS,
  CharacterSystem,
} from "./character/index.js";

const system = new CharacterSystem({
  events: context.services.events,
  inputManager: context.services.input,
  character: {
    id: account.id,
    x: spawn.x,
    y: spawn.y,
    width: 34,
    height: 44,
    speed: mapConfig.characterSpeed,
    maxHealth: battleState.maxHealth,
    currentHealth: battleState.currentHealth,
    stats: {
      attack: account.attack,
      defense: account.defense,
      health: account.hp,
    },
    appearance: account.appearance,
  },
  world: {
    bounds: mapConfig.bounds,
    colliders: mapConfig.solidColliders,
    triggers: mapConfig.triggers,
  },
}).start();

context.services.events.on(CHARACTER_EVENTS.ATTACK, (command) => {
  battle.receiveCharacterAttackCommand(command);
});

context.services.events.on(CHARACTER_EVENTS.CONTACT, (contact) => {
  field.receiveCharacterContact(contact);
});

gameLoop.update = (deltaMs) => system.update(deltaMs);
```

보스나 함정이 피해량을 계산한 다음 캐릭터에는 계산 완료된 값만 전달한다.

```js
system.applyResolvedDamage(resolvedDamage, {
  sourceId: attack.id,
  metadata: { attemptId },
});
```

`defense` 값을 캐릭터가 보관하더라도 `applyResolvedDamage()` 내부에서 방어 계산을 다시 하지 않는다.

미니게임 modal, 결과 화면 등에서 캐릭터 입력만 막을 때는 전역 InputManager를 끄지 않는다.

```js
system.setControlLocked(true, "field-minigame-modal");
system.setControlLocked(false, "field-minigame-modal");
```

잠금 상태가 바뀔 때 대기 중인 공격 명령과 조이스틱 벡터를 비워, modal을 닫은 Space 입력이 뒤늦게 공격으로 실행되지 않게 한다. 잠금 reason은 집합으로 관리되므로 각 화면은 자신이 추가한 같은 reason만 해제해야 한다.

## 이벤트 계약

| 이벤트 | 주요 값 | 담당 소비자 |
| --- | --- | --- |
| `character:attack` | `characterId`, `attackSequence`, `facingDirection`, `stats`, `source` | 현재 보스·전투 시스템 |
| `character:contact` | `characterId`, `phase`, `triggerId`, `kind`, `metadata` | 필드·보스 기믹 |
| `character:damage` | 외부 계산 피해, 이전·현재·최대 체력, source | HUD·전투 로그 |
| `character:health-change` | 이전·현재·최대 체력 | HUD |
| `character:death` | 체력을 0으로 만든 피해 정보 | 보스 공통 종료 규칙 |
| `character:state-change` | 이전·현재 상태, 방향 | renderer·상태 UI |
| `character:move` | 이전·현재 위치, 방향 | field renderer·network adapter |
| `character:stats-change` | 원본 공격·방어·체력 스탯 | account adapter·전투 준비 화면 |
| `character:control-lock-change` | 잠금 여부와 이유 | modal·scene orchestration |

`facingDirection`은 입력 당시 캐릭터가 바라보던 방향일 뿐, 공격의 판정 방향을 뜻하지 않는다. 공격 이벤트에는 origin, attack direction, target, range, damage, cooldown이 없다. 이 값이 필요해지면 보스 공통 전투 명세가 확정된 뒤 전투 시스템에서 추가한다.

## 접촉 데이터

solid collider와 trigger는 역할이 다르다.

```js
const world = {
  bounds: { x: 0, y: 0, width: 1280, height: 720 },
  colliders: [
    { x: 240, y: 160, width: 100, height: 40 },
  ],
  triggers: [
    {
      id: "field-egg-01",
      kind: CHARACTER_TRIGGER_KINDS.EGG,
      bounds: { x: 460, y: 280, width: 48, height: 48 },
      metadata: { contentId: "egg-01" },
    },
  ],
};
```

- `colliders`: 캐릭터가 통과할 수 없는 AABB 영역
- `triggers`: 통과 가능하지만 접촉 event가 필요한 영역
- `footY`: 캐릭터와 지형을 y-depth 정렬할 때 사용하는 snapshot 값
- 큰 시각 오브젝트는 전체 이미지가 아니라 발 부분만 collider로 지정하면 캐릭터가 위쪽 이미지 뒤로 이동하는 장면을 만들 수 있다.

## 캐릭터 아트 연결

최종 스프라이트가 준비되면 appearance의 `sprites`에 방향별 이미지 URL을 전달한다. 이미지 파일 자체의 asset manifest 등록과 preload는 필드·Battle asset 담당이 처리한다.

```js
system.setAppearance({
  id: "character-style-a",
  label: account.nickname,
  sprites: {
    idle: {
      up: idleUpUrl,
      down: idleDownUrl,
      left: idleLeftUrl,
      right: idleRightUrl,
    },
    walk: {
      up: walkUpUrl,
      down: walkDownUrl,
      left: walkLeftUrl,
      right: walkRightUrl,
    },
  },
});
```

공격 스프라이트는 현재 appearance 계약에 포함하지 않는다.

## 협동 연결

`system.getSnapshot()`은 서버 transport 자체가 아니다. network 담당은 필요한 주기로 snapshot을 전송하고, 수신한 다른 이용자 상태를 `RemoteCharacterView.update(remoteSnapshots)`에 전달한다. 서버 판정, 전송 주기, 보간, 재접속은 이 모듈에서 결정하지 않는다.

## 파일 구조

```text
js/battle/character/
  constants.js             상태·방향·이벤트·trigger kind
  character.js             이동·방향·체력·공격 명령 domain
  character-input.js       키보드·공통 InputManager·조이스틱 정규화
  character-controller.js  world 충돌·접촉 orchestration
  character-system.js      필드·보스가 사용하는 facade
  character-view.js        로컬 HUD·방향 이미지·원격 snapshot 표시
  virtual-joystick.js      pointer 기반 모바일 조이스틱
  index.js                 public export
js/scenes/character-preview-scene.js
css/battle-character.css
tests/unit/battle-character*.test.mjs
```
