// judge.js
export function judgeTiming(now, targetAt, config){
    const errorMs = Math.abs(now - targetAt); // 오차(항상 양수로)

    if(errorMs <= config.perfectwindowMs) return "PERFECT"; // 오차 0.2초 이내
    if(errorMs <= config.goodWindowMs) return "GOOD"; // 오차 0.5초 이내
    return "MISS"; // 그보다 크면 실패
}
