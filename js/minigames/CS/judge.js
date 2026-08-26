
// judge.js
export function judgeTiming(now, targetAt, config){
    const errorMs = Math.abs(now - targetAt); // 오차(항상 양수로)

    if(errorMs <= config.perfectWindowMs) return "PERFECT"; // 오차 0.2초 이내
    if(errorMs <= config.goodWindowMs) return "GOOD"; // 오차 0.5초 이내
    return "MISS"; // 그보다 크면 실패
}

// PerfectCount: PERFECT 판정 받은 횟수
// goodCount: GOOD 판정 받은 횟수
// totalWaves: 전체 웨이브 수 (부모, 100%를 채우는 기준)
export function calculatePurification(PerfectCount, goodCount, totalWaves){
    const perfectScore = PerfectCount * 1; // PERFECT는 1점씩
    const goodScore = goodCount * 0.7; // GOOD은 0.7점씩
    const earned = perfectScore + goodScore; // 얻은 점수 합

    const purification = (earned / totalWaves) * 100; // 전체 대비 퍼센트로 환산

    return Math.min(100, Math.round(purification)); // 100% 초과하지 않도록, 정수로 반올림
}

import{ isClickable } from "./malware.js"; // 위장 중인 트로이목마는 후보에서 제외하기 위해 가져옴

// threats: 화면에 떠 있는 위협들의 배열
// now: 클릭한 시간(ms)
export function pickTarget(threats, now) {
    const candidates = threats.filter(
        (t) => !t.resolved && isClickable(t) // 이미 판정됐거나 클릭 불가능한 건 후보에서 제외
    );

    if (candidates.length === 0) return null;

    // 목표 시각(targetAt)이 지금과 가장 가까운 위협을 선택
    return candidates.reduce((closest, current) => {
        const closestDiff = Math.abs(closest.targetAt - now);
        const currentDiff = Math.abs(current.targetAt - now);
        return currentDiff < closestDiff ? current : closest;
    });
}

// missCount: 지금까지 놓친(MISS) 횟수
// allWavesSpawned: 모든 웨이브가 이미 다 등장했는지 여부
// activeThreats: 현재 화면에 남아있는 위협들의 배열
// purification: 지금까지 계산된 정화도 (결과표시용)
export function resolveTerminalState({missCount, allWavesSpawned, activeThreats, purification, config}){
    if (missCount >= config.missLimit){
        return { status: "FAIL", failureReason: "MISS_LIMIT", purification }; // 미스 한도 도달 -> 즉시 실패    
    }

    if (allWavesSpawned && activeThreats.length === 0){
        return { status: "CLEAR", purification }; // 웨이브 다 나왔고 남은 위협도 없으면 -> 클리어   
    }

    return null; // 아직 끝난게 아니면 null 반환 (게임 계속 진행)
}
