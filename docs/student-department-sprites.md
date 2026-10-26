# 학과별 학생 실루엣

2026-10-27 `imagegen` 스킬의 내장 `image_gen` 도구로 기존 대학생 캐주얼 도트를 기준으로 네 변형을 새로 제작했다. DS는 기존 묶은 머리·에코백 버전을 유지한다. 생성된 투명 RGBA PNG를 알파 수정 없이 그대로 저장했다. 플레이어 외관과 학생 위치·클릭 영역·대화·수호알 판정은 유지한다.

| 학과 | 외형 | 저장 경로 |
| --- | --- | --- |
| AI | 높은 포니테일·백팩·짧은 재킷 | [college-student-ai-v3.png](../assets/maps/npcs/college-student-ai-v3.png) |
| DS | 묶은 머리·맨투맨·와이드 청바지·에코백 | [college-student-casual-v2.png](../assets/maps/npcs/college-student-casual-v2.png) |
| CSE | 단발·노트북·맨투맨 | [college-student-cse-v3.png](../assets/maps/npcs/college-student-cse-v3.png) |
| CS | 모자·크로스백·허리에 손을 얹은 자세 | [college-student-cs-v3.png](../assets/maps/npcs/college-student-cs-v3.png) |
| AIDS | 어깨 길이 머리·긴 카디건·노트 묶음 | [college-student-aids-v3.png](../assets/maps/npcs/college-student-aids-v3.png) |

`student-sprites.js`의 NPC ID별 경로를 렌더링·입장 준비·백그라운드 미리 로딩에서 공유한다. 중복 경로는 한 번만 읽고 이미지는 병렬로 준비하며 페이지 캐시를 재사용한다. 표시 크기 28×42, 학생 버튼 32×48, 알파 임계값 0.5, 미완료 `#1f1f1f`와 완료 학과색은 유지한다.

## 최종 프롬프트

### AI

```text
Use case: precise-object-edit / pixel game NPC variant. The supplied image is an edit target and exact style/scale reference. Create ONE distinct adult female university student in everyday casual clothes for the same top-down campus RPG. Preserve front-facing full-body idle stance, roughly three-head adult-cute proportions, consistent logical 48x72 square pixel grid, chunky stepped dark outline, limited flat colors with 2-3 hard shades, the same character height, feet baseline and 2:3 portrait canvas. Full body occupies about 94% of height, centered with transparent padding. Important: this sprite is displayed as a completely single-color silhouette at 28x42 world pixels, so all differences must be in the OUTER SHAPE of hair, clothing, bag, and pose; merely changing colors is not enough. This must look like a university woman, not a schoolgirl: no uniform, sailor collar, tie, ribbon, short skirt or bare knees. Transparent background with true alpha, clear gaps between limbs and feet, no ground, no shadow, no halo, no haze, no text, no UI, no other poses or characters. Output only one newly designed sprite. Variant design: A high ponytail sweeping clearly out to the viewer's right, a short casual utility jacket over a T-shirt, ankle-length tapered trousers and sneakers. One hand holds the shoulder strap of a rounded backpack whose large curved shape is visible on the viewer's left side of her body. Slimmer legs than the reference wide jeans. Remove the reference bun and tote completely. The ponytail, backpack bulge and bent arm must form a distinctive readable outline.
```

### CSE

```text
Use case: precise-object-edit / pixel game NPC variant. The supplied image is an edit target and exact style/scale reference. Create ONE distinct adult female university student in everyday casual clothes for the same top-down campus RPG. Preserve front-facing full-body idle stance, roughly three-head adult-cute proportions, consistent logical 48x72 square pixel grid, chunky stepped dark outline, limited flat colors with 2-3 hard shades, the same character height, feet baseline and 2:3 portrait canvas. Full body occupies about 94% of height, centered with transparent padding. Important: this sprite is displayed as a completely single-color silhouette at 28x42 world pixels, so all differences must be in the OUTER SHAPE of hair, clothing, bag, and pose; merely changing colors is not enough. This must look like a university woman, not a schoolgirl: no uniform, sailor collar, tie, ribbon, short skirt or bare knees. Transparent background with true alpha, clear gaps between limbs and feet, no ground, no shadow, no halo, no haze, no text, no UI, no other poses or characters. Output only one newly designed sprite. Variant design: A neat chin-length straight blunt bob, a loose hip-length crewneck pullover, straight full-length trousers and chunky sneakers. Carry a large closed rectangular laptop under the arm on the viewer's right; its square edge protrudes clearly from the torso silhouette. The other arm is relaxed. Remove the reference bun and shoulder tote completely. Clearly separated straight legs; the squared laptop and compact bob define the silhouette.
```

### CS

```text
Use case: precise-object-edit / pixel game NPC variant. The supplied image is an edit target and exact style/scale reference. Create ONE distinct adult female university student in everyday casual clothes for the same top-down campus RPG. Preserve front-facing full-body idle stance, roughly three-head adult-cute proportions, consistent logical 48x72 square pixel grid, chunky stepped dark outline, limited flat colors with 2-3 hard shades, the same character height, feet baseline and 2:3 portrait canvas. Full body occupies about 94% of height, centered with transparent padding. Important: this sprite is displayed as a completely single-color silhouette at 28x42 world pixels, so all differences must be in the OUTER SHAPE of hair, clothing, bag, and pose; merely changing colors is not enough. This must look like a university woman, not a schoolgirl: no uniform, sailor collar, tie, ribbon, short skirt or bare knees. Transparent background with true alpha, clear gaps between limbs and feet, no ground, no shadow, no halo, no haze, no text, no UI, no other poses or characters. Output only one newly designed sprite. Variant design: A casual baseball cap with a long clearly visible brim projecting to the viewer's left, dark hair in a short low ponytail behind the opposite side, a boxy zip jacket, straight full-length jeans and sneakers. A compact crossbody satchel sits on the viewer's left hip. One arm rests on her hip to make a small triangular transparent gap. Remove the reference bun and large tote. Friendly adult university woman; the cap brim and hand-on-hip stance must give a strong distinct silhouette.
```

### AIDS

```text
Use case: precise-object-edit / pixel game NPC variant. The supplied image is an edit target and exact style/scale reference. Create ONE distinct adult female university student in everyday casual clothes for the same top-down campus RPG. Preserve front-facing full-body idle stance, roughly three-head adult-cute proportions, consistent logical 48x72 square pixel grid, chunky stepped dark outline, limited flat colors with 2-3 hard shades, the same character height, feet baseline and 2:3 portrait canvas. Full body occupies about 94% of height, centered with transparent padding. Important: this sprite is displayed as a completely single-color silhouette at 28x42 world pixels, so all differences must be in the OUTER SHAPE of hair, clothing, bag, and pose; merely changing colors is not enough. This must look like a university woman, not a schoolgirl: no uniform, sailor collar, tie, ribbon, short skirt or bare knees. Transparent background with true alpha, clear gaps between limbs and feet, no ground, no shadow, no halo, no haze, no text, no UI, no other poses or characters. Output only one newly designed sprite. Variant design: Loose straight shoulder-length hair with ends curling outward on both sides, a long open knitted cardigan reaching just below the knees over a simple shirt, full-length narrow trousers and low sneakers. Hold a small stack of notebooks against one side of her chest with a bent arm, other arm hanging beside the cardigan. No bag and no bun. The long rectangular cardigan hem, outward hair ends and notebook edge should define a silhouette clearly different from the reference short sweatshirt and wide jeans.
```

