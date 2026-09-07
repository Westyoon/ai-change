// random.js
//
// 순수 로직(1단계)을 콘솔/유닛 테스트로 검증하려면 "항상 같은 결과가 나오는 난수"가 필요하다.
// 그래서 Math.random()을 아무 데서나 바로 부르지 않고, 이 파일에서 만든 random 객체를
// 함수 인자(ctx.random)로 "주입"해서 쓴다. 테스트할 땐 시드를 고정해서 넘기고,
// 실제 게임에서는 시드 없이 호출해서 진짜 랜덤을 쓰면 된다.

/**
 * 시드 기반 랜덤 생성기를 만든다.
 * @param {number} [seed] - 생략하면 매번 다른 결과(진짜 랜덤), 값을 주면 항상 같은 순서로 나옴(테스트용)
 */
export function createRandom(seed = Date.now()) {
  // xorshift32: 구현이 짧고 충분히 빠른 의사난수 생성기. 암호화 용도가 아니라
  // "게임 연출용 난수"라 이 정도면 충분하다.
  let state = seed >>> 0 || 1; // 0이면 xorshift가 계속 0만 뱉어서 1로 보정

  function next() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff; // 0 이상 1 미만 실수
  }

  return {
    /** 0 이상 1 미만의 실수 난수 */
    next,

    /** min 이상 max 이하의 정수 난수 (양 끝 포함) */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },

    /** 배열에서 랜덤으로 하나 고르기 */
    pick(list) {
      return list[this.int(0, list.length - 1)];
    },

    /** 배열에서 중복 없이 count개를 랜덤으로 뽑기 (count가 배열보다 크면 배열 전체를 반환) */
    sample(list, count) {
      const pool = [...list];
      const result = [];
      for (let i = 0; i < count && pool.length > 0; i++) {
        const idx = this.int(0, pool.length - 1);
        result.push(pool.splice(idx, 1)[0]);
      }
      return result;
    },
  };
}
