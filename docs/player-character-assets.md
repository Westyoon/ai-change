# 플레이어 캐릭터 이미지

최신 교체본: 19열×4행 시트, 2171×724 RGBA. 저장 경로는 `assets/images/character-hair-colors.png`이다. 내장 image_gen의 투명 PNG 출력으로 최신 첨부 디자인과 순서를 유지했다. 정면 대기는 0열, 후면 대기는 1열이고 오른쪽 걷기는 2~4열, 왼쪽은 5~9열, 아래쪽은 10~14열, 위쪽은 15~18열이다. 프레임마다 간격과 폭이 달라 좌표·배경 크기를 개별 계산하고 단계 애니메이션으로 넘긴다. 머리색 선택 카드·대기실은 정면 대기 프레임을 사용한다.

이번 편집 프롬프트:

Edit target: latest attached 2172 by 724 character sprite sheet. Preserve this entire sprite sheet exactly: all 76 characters, four hair-color rows magenta/purple/brown/blonde, and all 19 columns in their original positions and order. Only ensure the empty background is alpha-transparent. Do not redraw, recolor, resize, rearrange, clean edges, add padding, remove frames or invent frames. Keep exact 3:1 landscape shape and original sprite positions. The columns are front idle, back idle, 3 right walk frames, 5 left walk frames, 5 front walk frames, 4 back walk frames. Keep that precise 19-column layout and original pixel artwork. Output the full sheet as a transparent PNG at the source size.

아래는 이전 교체본 기록이다.

2026-10-05 최신 첨부 시트로 교체: `assets/images/character-hair-colors.png`, 2172×724 RGBA. 내장 image_gen 편집 결과를 사용했다. 14개 열·4개 머리색 행이며 위/아래/왼쪽은 3프레임, 오른쪽은 4프레임으로 걷는다. 간격이 일정하지 않은 열은 각각의 실제 X 좌표를 사용하는 CSS 단계 애니메이션으로 표시한다. 프레임은 138×181px이며 행 Y는 0/181/362/543, 열 X는 `[27,166,307,486,644,799,930,1098,1244,1397,1544,1723,1866,2005]`이다. 사전게임 기본 보라색과 계정 머리색 선택은 유지한다.

최신 편집 프롬프트:

Edit target: the latest attached wide character sprite sheet, four hair-color rows and fourteen character poses per row. Produce a game-ready transparent sprite atlas preserving the exact supplied character design, green varsity jacket, pale blue jeans, four hair colors magenta/purple/brown/blonde in that row order, and every pose, pixel-art style and overall 3:1 landscape aspect ratio. Remove only stray red/blue/yellow/cyan edge halos outside character silhouettes. Preserve character outlines, clothes, faces and pose details; do not redraw or invent different characters. Keep EXACTLY 14 evenly spaced columns and 4 evenly spaced rows, each sprite fully contained inside its cell with transparent small margins and no clipping or touching adjacent sprites. Column order must remain exactly as supplied: 0-2 front/down walking three frames, 3-5 side/left walking three frames, 6 a front-side transitional pose, 7-10 side/right walking four frames, 11-13 back/up walking three frames. No labels, grid lines, checkerboard or background. Transparent PNG, clean crisp pixel edges. Save the full wide sheet, not a cropped individual character.

이하 이전 시트 작업 기록:

- 실행: 내장 `image_gen` 도구, 첨부 캐릭터 시트 편집, 투명 배경 요청.
- 저장: `assets/images/character-hair-colors.png` (1254×1254, RGBA).
- 용도: 자주색·보라색·갈색·금발 네 색의 정면/후면/좌우 걷기. 게임 코드의 실제 프레임 좌표로 각 캐릭터의 머리와 발이 잘리지 않게 표시한다.

실제 출력된 시트는 열 간격이 완전히 일정하지 않으므로, 209px 고정 간격으로 잘라 쓰면 오른쪽 걷기 두 번째 프레임의 머리카락이 잘리고 첫 번째 프레임에 옆 캐릭터가 섞인다. 프레임 시작 X 좌표는 `[18, 210, 407, 607, 829, 1025]`, 영역 크기는 209×300px로 설정했다. 걷기 애니메이션도 실제 두 프레임 간격을 사용한다. 시트 렌더링의 기본 캐릭터 테두리를 제거하고 머리색 선택 미리보기에도 같은 좌표 계산을 사용한다.

2026-10-05 수정본 운영 배포: `c51baac3-54ff-474b-80ac-988355836cd9`. 테스트 489개와 HTTP 검사 78개/91개 통과, 수정된 운영 JS·CSS와 빌드 파일의 SHA-256 일치 확인. 연결된 브라우저가 없어 실제 화면에서의 시각 확인은 수행하지 못했다.

## 사용한 최종 프롬프트

Edit target: attached character sprite sheet. Make the solid black background genuinely alpha-transparent, preserving the four hair colors and all 24 pixel-art character frames, green jackets, blue jeans, faces, colors, hard pixel edges, pose orientations exactly without redrawing. Repack for reliable game animation into ONE regular 6-column by 4-row transparent atlas, with every equal-sized cell containing exactly one full character. Rows from top: magenta hair, purple hair (default), brown hair, blonde hair. Columns: front idle, back idle, right walking pose 1, right walking pose 2, left walking pose 1, left walking pose 2. Keep the two distinct walking poses from the source, don't duplicate or invent frames. All characters have matching body scale, centered horizontal and feet aligned consistently near each cell's bottom, ample transparency around each character. No black or checkerboard background, no labels, no additional poses. Sprite sheet canvas 1536x1536, each cell 256x384, exact equal 6x4 grid.


## Latest atlas: 22 poses per hair color (2026-10-05)

Asset: `assets/images/character-hair-colors.png`, 2171 x 724 RGBA.
Four rows; down 0-3, right 4-9, left 10-17, up 18-21.
Measured transparent body boundaries across all four rows determine variable crop widths, rather than dividing the image into equal columns. Walking supports 4, 6 and 8 frames; idle uses the first pose of its direction. Account, lobby and ending portraits share this asset. Alpha inspection found no pixels above 127 on any internal crop boundary. Faint source edge artifacts below this threshold are retained.

Generated source: `C:/Users/yoons/.codex/generated_images/01a107e2-91d4-76a0-a9a7-c432c3835d9d/exec-3ed78523-3b07-4a1b-95e3-6ff15ba4016f.png`.
The generator preserved the uneven source spacing, so runtime crop coordinates were measured separately.

Imagegen prompt:
> Edit target: latest attached character sprite sheet. It contains EXACTLY 22 columns and 4 hair-color rows (88 poses). Preserve every character's exact pixel art, clothing, colors, facial details, pose and row/column order. Repack this atlas into an exact regular 22-column by 4-row transparent grid, one complete character in each equal-sized cell, with at least 8 percent transparent padding on all four sides of each pose. All sprites must fit completely with hair and shoes visible; no clipping at cell edges and no adjacent character overlap. Four rows are magenta, purple, brown, blonde. Columns 0-3 are front/down walking, 4-9 are right walking, 10-17 are left walking, 18-21 are back/up walking. Do not add, remove, duplicate, reinterpret or redraw poses. Keep crisp source pixel artwork. Plain alpha-transparent background, no grid lines, no labels, no checkerboard. Full landscape sheet at 3:1 aspect ratio, all 22 columns fully visible. Align the feet and match sprite scale across every cell.
