export const EIAI_BATTLE_INTRO = Object.freeze([
  { speaker: "이아이", text: "여기까지 왜 왔어. 너희도 충분히 힘들잖아." },
  { speaker: "플레이어", text: "이번엔 네 이야기를 들으러 왔어." },
  { speaker: "이아이", text: "괜찮은 척하는 것도… 이제 너무 지쳐." },
  { speaker: "플레이어", text: "우리가 만난 벗들의 마음이 수호알에 담겨 있어. 이번엔 그 응원을 너에게 전해 줄게." },
]);

export const EIAI_RECOVERY = Object.freeze([
  { speaker: "이아이", text: "…나도 힘들다고 말하고 싶었어." },
  { speaker: "이아이", text: "그런데 내가 힘들다고 하면… 너희는 누가 지켜줘?" },
  { speaker: "플레이어", text: "이아이. 네가 우리 몫까지 다 견딜 필요는 없어." },
  { speaker: "플레이어", text: "지금은 우리가 여기 있잖아." },
]);

export const EIAI_BATTLE_CAPTIONS = Object.freeze([
  "오늘도 하루 종일 바빴는데… 끝낸 건 왜 아무것도 없지.",
  "과제 하나 끝내면 또 하나야. 나는 언제 쉬어?",
  "휴학하고 싶은데… 쉬는 동안 다들 나만 빼고 앞으로 가겠지.",
  "등록금까지 이렇게 드는데… 내가 제대로 하고 있는 건가.",
  "친구가 잘돼서 기쁜데, 집에 오면 자꾸 나랑 비교하게 돼.",
  "다들 힘들다는데… 나 정도로 힘들다고 해도 되나.",
  "자꾸 괜찮다고 했더니, 정말 괜찮은 줄 알아.",
  "누워 있어도 내일 해야 할 일만 생각나.",
  "뭐가 되고 싶냐고 묻지 마. 오늘 해야 할 일도 벅차.",
  "열심히 했다고 말하고 싶은데… 보여줄 결과가 없어.",
]);

// Advances only with the running game loop: pauses never consume dialogue time.
export class BattleCaptionDeck {
  constructor({ random = Math.random, onCaption = () => {} } = {}) {
    this.random = random;
    this.onCaption = onCaption;
    this.reset();
  }
  reset() {
    this.remaining = [...EIAI_BATTLE_CAPTIONS];
    this.elapsed = 0;
    this.hideAt = null;
    this.nextAt = 8000 + this.random() * 4000;
    this.stopped = false;
  }
  update(deltaMs) {
    if (this.stopped) return;
    this.elapsed += Math.max(0, Number(deltaMs) || 0);
    if (this.hideAt !== null && this.elapsed >= this.hideAt) {
      this.onCaption("");
      this.hideAt = null;
    }
    if (this.remaining.length && this.elapsed >= this.nextAt) {
      const index = Math.min(this.remaining.length - 1, Math.floor(this.random() * this.remaining.length));
      this.onCaption(this.remaining.splice(index, 1)[0]);
      this.hideAt = this.elapsed + 6500;
      this.nextAt = this.elapsed + 8000 + this.random() * 4000;
    }
  }
  stop() { this.stopped = true; this.onCaption(""); }
}
