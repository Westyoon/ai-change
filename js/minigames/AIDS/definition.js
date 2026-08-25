export const DEFINITION = Object.freeze({
    id: 'ai-data-egg-sort',
    departmentCode: 'AIDS',
    department: '인공지능데이터사이언스학부',
    title: '인지알·데사알 분류 게임',
    goal: '떨어지는 인지알과 데사알을 판별해 올바른 상자로 분류합니다.',
    failureReason: 'LIVES_DEPLETED',

    createMetrics(status, config) {
        return {
            correctCount: 0,
            wrongCount: 0,
            lostCount: 0,
            remainingLives:
                status === 'CLEAR' && Number.isInteger(config.initialLives) ? config.initialLives : 0,
        };
    },
});

export default DEFINITION;