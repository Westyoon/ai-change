# 이아이 결말과 축제

사용자가 제공한 원고를 기준으로 다음 순서로 진행한다.

1. 게임 시작 버튼 뒤 이아이·플레이어의 도입 3줄을 클릭 또는 키보드로 진행한다.
2. 전투 중 자막은 8~12초마다 무작위로 나타나고 5초 뒤 사라진다. 한 전투에서 같은 문장을 반복하지 않으며 일시정지·종료·퇴장에서 시간을 소비하거나 남지 않는다. 자막의 난수는 전투 판정 난수와 분리한다.
3. 최종전 클리어 시 전투가 멈추고 회복 대화 4줄로 이어진다.
4. 다섯 꽃잎 자물쇠가 모이고 차례로 빛나며 사라진다. X알이 빛 속에서 사라지고 이아이가 회복된다.
5. 기존 아웃트로의 플레이어·이아이 3줄 뒤 엠브리오가 등장하고 아무의 2줄을 진행한다.
6. 지정된 제목·안내·예시·버튼을 가진 입력창에서 소원을 실제 서버에 저장한다. 실패하면 원문을 유지하고 재시도할 수 있다. 저장 성공 때 작은 빛이 엠브리오로 올라간다.
7. 도트 형태의 축제 조명이 켜지고 독백 4줄 뒤 `우리의 꿈은, 여기서 다시 시작된다.`도 같은 크기·모양의 독백 대화창으로 보여준다. 그 아래 `축제 즐기러 가기` 버튼을 보여준다.
8. 이 버튼에서만 축제 진행을 저장하고 기존 메인으로 돌아간다. 메인에 조명과 돌아다니는 이아이가 나타나며 사후게임과 엠브리오 소원 게시판을 이용할 수 있다.

이아이 이미지 교체 지점은 `js/ui/festival-art.js`의 `EIAI_IMAGE_SRC`이다. 현재 작은 불꽃으로 표시하며 이미지가 제공되면 같은 자리에 연결한다. 배경음·종소리·작은 박수는 `StorySoundtrack`의 원본 합성음이며 기존 음량·음소거 설정을 따른다.

전투 도입 대화의 X알·작은 자물쇠 5개 장식은 후속 요청으로 제거했다. 전투 오른쪽에는 큰 꽃잎 자물쇠와 수호알 5개만 표시하며 전투에서 수호알을 얻으면 해당 알이 흑백에서 본래 색으로 바뀐다. 피날레 부제와 게임 제목은 표시하지 않는다. 생명은 전체 전투 영역 우측 상단의 하트 5개로 표시한다. 실제 피격 횟수가 증가할 때마다 짧은 화면 흔들림과 지원 기기의 45ms 진동을 실행하며, 동작 줄이기 설정에서는 두 효과를 생략한다. 같은 피격의 반복 렌더링과 초기 화면은 효과를 발생시키지 않고 퇴장 시 애니메이션을 취소한다.

공격 조정: 빛의 판정만 사방 9px 확장한다. 대사는 3.2초 간격·동시 최대 3개이며 활성 대사의 중복을 막고 한 순환에서 같은 대사를 재사용하지 않는다. 노란 표적은 지정 단어의 전체 경계를 사용하며 문장 앞부분의 임의 글자 강조를 제거했다. 세로 글자 흔들림은 제거했다. 각 학과에서 대사 공격 뒤 6.5초 동안 느리고 드문 학과 공격을 섞고, 이후 대사를 거둔 뒤 학과 공격의 속도·밀도를 점차 올린다. 학과 공격 진입 14.5초 뒤에는 부술 수 있는 쇄도 3번을 거쳐 피할 수 없는 쇄도로 이어진다. 학과 공격은 낱글자 대사 대신 결측·통계 기호, 포트 번호, 재귀 괄호, AI 예측 기호, 융합 기호를 사용한다. 기존 다섯 학과의 패턴과 한 단계씩 하트가 줄어드는 수호알 회복 순서를 유지한다.

게시판은 `0012_wish_board.sql`, `0013_wish_departments.sql`과 `/api/wishes`를 사용한다. 소원을 쓸 때 다섯 학과 중 하나를 선택하며, 각 메모지의 색은 `GUARDIAN_EGGS`의 수호알 색을 그대로 사용한다. 코르크 보드에 테이프로 붙인 메모지 형태이고 전체 학과 또는 특정 학과의 소원을 볼 수 있다. 기존 소원은 삭제하지 않고 학과 미지정 메모지로 유지한다.

`POST /api/wishes`는 `text`, `requestId`, `department`를 받는다. `GET /api/wishes`는 선택적인 `department` 및 `after` 매개변수를 받으며 학과별로도 동일한 안정적인 페이지 정렬을 사용한다. 허용 학과는 `DS`, `CS`, `CSE`, `AI`, `AIDS`이다.

2026-10-05 운영 반영 완료: 마이그레이션 0011~0013 적용, Worker 버전 `3689c3a9-8eb0-4f28-a1b3-dbbbafcb5e83`. 전체 테스트 487개, 개발 HTTP 검사 78개, 배포 빌드 HTTP 검사 91개 및 TypeScript 검사를 통과했다. 운영 메인·health·session·소원 전체/학과별 조회 응답과 주요 정적 파일 SHA-256 일치를 확인했다. 보스 랭킹의 윈도 함수 정렬에서 SELECT 별칭을 참조하던 기존 오류도 수정했으며 별도 SQL 실행 회귀 검사와 운영 두 보스의 클리어 횟수·속도 조회를 확인했다. D1 무결성 검사 정상, 외래키 오류 없음. 실제 브라우저에서의 시각 검증은 이 환경의 브라우저 연결 부재로 수행하지 못했다.

반영 전 DB 백업: `C:\Users\yoons\AppData\Local\ai-change\backups\before-wish-departments-20261005-183627.sql` (프로젝트 외부 보관).

## 자물쇠 이미지

축제 개방 후 다시 여는 소원 게시판은 엠브리오 연출 없이 화면을 채우는 메모지 보드로 표시한다. 우측 상단의 ‘새로운 소원 말하기’를 누르면 작성창이 펼쳐지고 ‘메모지 붙이기’로 저장하면 보드에 추가된 뒤 닫힌다. 닫기나 Escape는 작성 내용을 유지한다. 게시판에는 ‘돌아가기’만 제공하고 ‘축제 즐기러 가기’는 표시하지 않는다. 최초 이야기의 소원 입력과 마지막 축제 이동은 유지한다. 게시판 버튼은 공통 버튼의 글자색, 호버 및 키보드 포커스 규칙을 사용한다.

소원 화면은 엠브리오, 수호알 줄, 플레이어·이아이 줄을 분리해 서로 겹치지 않게 배치하며 입력창은 아래로 내렸다. 엠브리오는 투명 PNG `assets/images/embryo-pixel.png`를 사용한다. 내장 imagegen으로 새로 만든 픽셀아트이며 사용한 프롬프트는 다음과 같다.

최종 엠브리오는 사용자의 정정에 따라 중앙 로고·별·문양이 없는 흰색 알로 수정했다. 아래 생성 프롬프트의 중앙 별 요청은 초안 기록이며 최종 이미지에서는 제거한다. 최종 편집 프롬프트:

Edit this pixel-art ivory egg sprite. Remove the entire central gold four-point star/logo/emblem and all its detached golden mark pixels, replacing the removed marks with continuous matching ivory and cream pixel shading of the plain egg shell. The egg must have a completely plain shell with no symbol, no star, no logo, no text, no face. Preserve the complete existing egg silhouette, warm gold outer contour, ivory palette, pixel-art style, square stepped pixel edges, transparent background, composition and scale. No redesign. Only remove the central decorative symbol and its small satellite gold pixels. Transparent PNG.

Create a single game sprite: the Embryo, a luminous magical ivory-white egg with a small golden four-point sparkle emblem centered on its shell. Crisp authentic 16-bit pixel art matching a Korean campus fantasy game with pixel-art guardian eggs. Entire egg visible, upright, no face, no arms, no legs, no text. Restrained palette of ivory, cream, warm pale gold with stepped pixel shading and a gold-brown one-pixel contour, sharp square pixel edges, no smooth vector outlines, no anti-aliased painterly shapes. Shape suggests a 64 by 80 pixel original sprite scaled up using nearest neighbor. Compact transparent margin around egg, centered. Truly transparent background; no backdrop, no checkerboard, no floor, no outer glow. One sprite only.

내장 `image_gen` 도구로 첨부 자물쇠의 외부 흰 배경을 투명화했다. 결과는 `assets/images/flower-lock.png` (1122×1402, RGBA)에 저장하고 공통 asset manifest에 등록했다.

사용한 최종 프롬프트:

Edit target: the most recently attached golden padlock image with five white heart-shaped flower petals, black pixel outlines and gold center. Remove only the white background outside the padlock, preserving the white petal interiors, exact pixel art, colors, shape and detail. Produce one centered complete padlock with genuinely transparent alpha background, small transparent margins. No redesign, no extra objects, no text, no glow.
