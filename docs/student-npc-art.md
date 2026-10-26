# 학생 NPC 전용 도트

2026-10-26 플레이어 스프라이트를 학생에게 재사용하던 방식을 제거했다. 전용 여대생 도트는 단발머리, 가디건, 치마, 에코백, 운동화 차림이다. 플레이어의 긴 머리·과잠·청바지와 다른 윤곽으로 구분한다.

운영 배포: 코드 `0955e10`, Worker `11d39b4a-3c94-4184-94d3-7f8aa6e01ebf`, https://ai-change.ai-change-backend.workers.dev . 전체 검사 528개·소스 HTTP 80개·빌드 HTTP 93개·백엔드 타입 검사를 통과했다. 최종 이미지 속성 적용 후 로컬·운영 1280px/390px에서 전용 이미지 로드, 미완료/후속 대화 대기, 로컬·계정 기록 합집합, 다섯 학과 색상, 늦은 동기화·초기화·구독 해제를 검증했다. 로컬의 학생 첫 대화·재방문/클리어 대화와 Space 대화/건물 출입 검사도 통과했다. 운영 JS·CSS·PNG는 dist와 SHA-256이 같고 API health는 `ok`다. 검증용 진행 상태는 브라우저 모의 상태이며 실제 계정 진행은 변경하지 않았다.

최종 에셋: [college-student-bob-v1.png](../assets/maps/npcs/college-student-bob-v1.png). 투명 RGBA PNG, 1024×1536, 1,111,163바이트. 맵에서는 28×42 월드 픽셀의 정적인 이미지로 표시하며 학생 버튼 32×48의 바닥에 맞춘다. 원본을 그대로 보관하고 `image-rendering: pixelated`로 렌더링한다.

실제 게임에서는 기존 진행 표현을 유지한다. 미완료는 `#1f1f1f`, 후속 이야기를 마쳐 수호알을 얻으면 각 학과 색이다. 생성 이미지의 반투명 가장자리가 실루엣에 번지지 않도록 SVG 알파 필터에 0.5 기준의 이산 임계값을 적용한다. 플레이어 외형, NPC 위치·클릭 영역·대화·수호알 판정은 유지한다.

제작에는 `imagegen` 스킬과 내장 `image_gen` 도구를 사용했다. 첫 생성 후 같은 도구로 비율을 줄이고 가장자리 정리를 요청했다. 기존 플레이어 이미지는 스타일·비율 참고 자료로만 제공했으며 수정하지 않았다. 선택한 결과를 작업 저장소에 복사했다.

## 생성 프롬프트

```text
Use case: stylized-concept. Asset type: one transparent pixel-art NPC sprite for an existing top-down Korean university campus web game. The supplied sprite sheet is a STYLE/SCALE REFERENCE ONLY, not an edit target: match its cute moderately detailed RPG character proportions, dark outlines, small eyes, pixel density and clothing shading. Create ONE entirely new adult female university student, full body, facing forward, neutral standing idle pose, centered and isolated on a genuinely transparent background. Make the silhouette clearly different from the reference long-haired player: a tidy chin-length straight dark-brown bob with side part, no long hair or ponytail; an ivory casual cardigan over a muted teal shirt, simple charcoal A-line knee-length skirt, visible separated lower legs, white sneakers, and a small rectangular canvas tote hanging at her left hip, her arms relaxed with a small transparent gap between arm and torso. Approximately 2.7 heads tall, head about 35% of height, everyday university clothes, not school uniform. Strict genuine low-resolution pixel art: one consistent square pixel grid, 1-pixel dark contour at logical 48x72 resolution, small palette of about 24 flat colors, 2-3 tones per material, hard square pixel clusters and stepped outlines, NO blurred edges, NO anti-aliasing, NO smooth vector gradients, NO painting. Render the logical sprite enlarged with nearest-neighbor square blocks. The complete sprite should occupy about 85% of canvas height and 70% of canvas width, with a little transparent padding on all sides, shoes aligned to the same baseline. This is one single front-view game character ONLY: no sprite sheet, no additional poses or characters, no scenery, no UI, no lettering, no cast shadow, no ground ellipse, no watermark, no purple hair, no varsity jacket, no long wavy hair. Preserve true alpha transparency outside the character, including the gaps between the feet and arms.
```

## 최종 보정 프롬프트

```text
Edit target: image 1, the new bob-haired university student. Image 2 is only a reference for the existing game's shorter character proportions and pixel detail. Keep the bob haircut, cardigan, teal shirt, A-line skirt, tote, forward-facing idle stance and separated legs. Make two corrections: (1) remove ALL glow, shadow, haze, fringe and translucent surrounding pixels. The outside must be truly empty alpha=0, the colored body pixel clusters fully opaque. No cast shadow or ground. Clean hard pixel-stepped contour. (2) shorten the torso and lower legs and enlarge the head slightly to the existing game proportions: about 2.7 heads tall total, head including hair about 36 percent of total sprite height. This is a compact cute RPG game sprite, not a tall fashion illustration. Use a uniform logical 48x72 pixel grid, limited flat pixel palette, 2-3 hard tones per material, no smooth shading, no antialiasing. Render crisp enlarged nearest-neighbor pixel blocks. One complete front-facing student only, full head and shoes visible with 5 percent transparent padding at top/bottom and balanced horizontal padding. No added text, UI, scenery, other characters or other poses. True transparent cutout, with clear empty alpha around and between feet/arms.
```
