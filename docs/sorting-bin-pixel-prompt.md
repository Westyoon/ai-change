# 정보 선별 상자 픽셀아트

도구: OpenAI 내장 image_gen (style-transfer).

입력: `assets/minigames/ai-ball-classification/sorting-bin.png`.

출력: `assets/minigames/ai-ball-classification/sorting-bin-pixel.png`.

## 최종 프롬프트

Use case: style-transfer. Asset type: transparent PNG game sprite for a 2D pixel-art sorting game. Input image 1 is the edit target: a front-facing rectangular pink and purple tartan sorting box with a black heart patch, vertical black riveted strap on the right and horizontal black riveted strap along bottom. Redraw this exact object as clean deliberate 16-bit pixel art, using clearly visible square pixel clusters and crisp stepped edges, flat limited colors, no antialiasing, no blurry shading, no gradients. Preserve the straight-on view, rectangular silhouette, heart patch, strap positions, pink-magenta-purple plaid and ivory rivets. Dark plum outline, ivory pixel highlights, one-step dark lower/right shading. One box only, front face, no perspective or extra props, no text, no shadow beyond sprite. Tight framing, whole object visible filling almost the entire canvas, preserve the source approximately 256:288 aspect ratio. Background genuinely transparent, no checkerboard painted into the image. Designed to remain legible at 120px wide in game.
