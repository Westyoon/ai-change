// wave.js

// 전체 웨이브 계획을 만드는 함수 (지금은 학습 구간만)
// 반환값: [{type, spawnAtMs}, ...] 형태의 배열
// spawnAtMs: 게임 시작 후 몇 ms 뒤에 이 위협이 등장하는지
export function buildWavePlan(config){
    const plan = [];
    let cursor = 0; // 다음 웨이브가 등장할 시각을 누적해서 계산하는 함수

    // 학습 구간: config.learningOrder 순서대로 1종씩 고정 등장
    for (let i = 0; i < config.learningWaveCount; i += 1) {
        const type = config.learningOrder[i];
        plan.push({ type, spawnAtMs: cursor, approachDurationMs: config.learningApproachDurationMs }); // 학습 구간은 느린 속도
        cursor += config.learningIntervalMs;
    }

    // 혼합 구간: 나머지 10웨이브
    const mixedCount = config.totalWaves - config.learningWaveCount;
    const mixedTypes = buildMixedTypeSequence(mixedCount, config); 

    for(let i = 0; i < mixedCount; i+=1){
        plan.push({ type: mixedTypes[i], spawnAtMs: cursor, approachDurationMs: config.approachDurationMs }); // 혼합 구간은 기본 속도

        // 진행률(0~1)에 따라 간격을 점점 줄임 (처음엔 느리게, 끝은 빠르게)
        const progress = i / (mixedCount - 1);
        const interval = lerp(config.mixedIntervalStartMs, config.mixedIntervalEndMs, progress);
        cursor += interval;
    }
    return plan;
}

// 혼합 구간 10웨이브의 "종류 순서"를 만드는 함수
function buildMixedTypeSequence(count, config){
    // 랜섬웨어는 1~2번 사이에서 랜덤하게 몇 번 나올지 정함
    const ransomCount = randInt(config.ransomMinCount, config.ransomMaxCount);
    const others = ["TROJAN","WORM", "SPYWARE"]; // 랜섬웨어 제외 나머지 3종

    // 일단 나머지 3종을 순서대로 채워넣음
    const sequence = [];
    for(let i = 0; i < count; i += 1){
        sequence.push(others[i % others.length]);
    }
    shuffle(sequence); // 순서대로 무작위로 섞음

    // 뒤 절반 중 랜덤한 위치에 랜섬웨어를 끼워넣음
    const lateStart = Math.floor(count / 2);
    for (let i = 0; i < ransomCount; i += 1){
        const idx = randInt(lateStart, count - 1);
        sequence[idx] = "RANSOM";
    }

    return sequence;
}

// a와 b 사이를 t(0~1) 비율로 보간하는 함수 (선형 보간)
function lerp(a, b, t) {
    return a + (b - a) * t ;
}

// min~max 사이의 정수 하나를 랜덤하게 뽑는 함수
function randInt(min, max){
    return Math.floor(Math.random() * (max - min + 1)) + min ;
}

// 배열 순서를 무작위로 섞는 함수 (Fisher-Yates 셔플)
function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}