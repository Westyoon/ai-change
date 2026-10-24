# 학생문화관 유리벽과 온실 정돈

2026-10-24. 로컬 실내맵만 변경한다. 기존 야외 원본·캐릭터 크기·카메라·실내 면적은 유지한다.

학생문화관 공부 라운지의 사방 벽을 흰 금속 프레임의 유리벽으로 교체했다. 광장 쪽 두 문은 같은 계열의 닫힘/열림 에셋을 사용한다. 회색 소파는 오른쪽 등받이가 유리벽에 닿고 좌석은 광장을 향하는 새 완성형 에셋이며, 두 문 앞은 비운다. 바닥은 편집 가능한 기존 SVG의 명도를 낮추고 작은 명암 입자를 추가한 중간 회색 화강석이다.

온실은 좌우 화단의 종류와 간격을 맞추고, 단상 옆·계단 양옆·분수 주변에 낮은 고사리 화단을 정돈했다. 흩어진 작은 화분과 잎 장식은 제거했다. 테이블과 의자는 새 흰 철제 가구 에셋으로 교체하고, 계단은 얕은 세 단이 함께 그려진 단일 에셋을 사용한다. 지붕의 진입 시 투명도 변화는 유지한다.

## 생성 원본

내장 imagegen 사용. 프로젝트 에셋: `assets/maps/interior/glass-garden-v5.png` (1448×1086 RGBA). 생성 원본: `C:/Users/yoons/.codex/generated_images/01a107e2-91d4-76a0-a9a7-c432c3835d9d/exec-db3c17db-714a-4eac-b3a9-2424d975b125.png`. 원본은 보존했다. 아틀라스의 각각 완성된 객체 전체를 프레임으로 지정하며 소파 일부를 반복하지 않는다. 코드로 래스터 이미지를 편집하지 않았다.

## 프롬프트

+Create12 NEW isolated pixel-art game environment sprites, NOT a whole map. References: screenshots1&2 show current PROBLEMS (flat white furniture, awkward plants, solid brick lounge walls and sofa facing wrong side); photo3 is a medium-dark fine speckled GREY GRANITE material reference, no watermark copied. Coherent polished detailed top-down RPG pixel art, slight overhead view, small controlled clusters, neutral whites and grey metal, no yellow tint. Fixed4COLUMN x3ROW atlas requested1536x1152, each384 square cell. Every complete object stays inside its cell with minimum32px fully transparent margin, no overlap or background haze. Real transparent background including all open spaces in frames. ROW1: cell1 COMPLETE VERTICAL transparent glass wall panel, white/silver slim metal frame, clear desaturated blue glass, top-down side partition aligned vertical, straight joinable ends; cell2 COMPLETE HORIZONTAL matching glass wall panel; cell3 matching VERTICAL glass side-door CLOSED, door gap oriented for east-west walking, full white frame; cell4 EXACT SAME side-door OPEN, clear transparent passage, full frame. ROW2: cell1 one continuous long low-backed CHARCOAL GREY sofa, aligned vertically with BACKREST on its RIGHT EDGE and open SEATS facing LEFT,6small seats, unbroken base and backrest, no modular slices; cell2 a small round pale glass cafe TABLE with slim WHITE STEEL frame and legs, tabletop separate from chairs, detailed enough to match greenhouse plants, not a flat icon; cell3 single matching slim white steel cafe CHAIR front view, sage seat, complete object; cell4 matching chair BACK VIEW. ROW3: cell1 same white steel chair SIDE VIEW facing RIGHT; cell2 one complete LONG LOW LIMESTONE RAISED FERN PLANTER, horizontal, lush layered ferns and tiny white flowers, no bare soil, no separate pots; cell3 same planter VERTICALLY oriented, complete low stone border and lush greenery; cell4 one complete PALE STONE THREE-STEP STAIR FLIGHT with three shallow evenly spaced treads, subtly shaded risers, fine speckled stone texture, rectangular joining edges, wide aspect3:1, no rails or plants. Need complete deliberate game sprites with accurate proportions, good material shading, pixel clusters and light outlines, not painterly, not crude vector blocks. Existing art should not be chopped up or stretched to fake these new objects. No text, labels, grid lines, room background or shadow haze.

## 검증

실내 출입구·주요 통로의 발밑 충돌박스 경로 검사, 두 유리문 실제 통과, 지붕 아래/바깥 시야, 데스크톱·모바일 화면과 전체 배치 이미지를 확인했다. 실제 앱의 세 실내맵 직접 진입·캠퍼스 복귀 및 모바일 터치 조이스틱도 확인했다. 브라우저 오류는 없었다.

`npm run cf:full:check` 통과: 테스트 518개, 소스 HTTP 검사 80개, 빌드 결과 HTTP 검사 93개 및 백엔드 TypeScript 검사. 화면 확인용 출력은 `output/student_center_interior-overview.png`, `output/greenhouse_interior-overview.png`, `output/student-glass-garden-detail.png`, `output/greenhouse-glass-garden-detail.png`에 저장하며 커밋에는 포함하지 않는다.
