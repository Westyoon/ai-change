// state.js
//
// 2단계: 게임 전체 상태 머신. AI_CHANGE_PLAN.md 9.2절의 "공통 게임 상태"를 그대로 재사용한다.
// 이 상태 이름 자체가 스탯 보스만의 것이 아니라 다른 미니게임/보스도 같이 쓰는 공통 개념이라서,
// 나중에 다른 보스(OX보스·컨트롤보스)나 사전게임 미니게임 코드랑 합쳐도 상태 이름이
// 서로 다르지 않게 하려고 이 파일 하나로 관리한다.
//
// CREATED      : 인스턴스만 만들어진 직후 (아직 init() 호출 전)
// INITIALIZING : init() 호출 중, 데이터(플레이어 스탯 -> HP 계산 등) 준비 중
// READY        : 준비 완료, 아직 start() 안 함 (예: "전투 시작" 버튼을 기다리는 상태)
// RUNNING      : 실제로 시간이 흐르며 진행 중 (tick()이 의미를 가지는 유일한 상태)
// PAUSED       : RUNNING 중 일시정지 (탭 비활성화, 사용자 일시정지 버튼 등)
// RESOLVING    : 승패는 이미 갈렸지만 아직 결과 화면 전환 전 (연출 재생 등에 쓸 수 있는 완충 상태)
// COMPLETED    : 결과 확정, onComplete 호출까지 끝남
// ERROR        : 복구 불가능한 오류
// DESTROYED    : 정리(destroy) 완료, 더 이상 사용 불가
export const STATE = {
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  RESOLVING: "RESOLVING",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
  DESTROYED: "DESTROYED",
};

// 허용되는 전이만 표로 정의해둔다. 여기 없는 조합으로 전이를 시도하면 에러를 던져서
// "실수로 이상한 상태로 넘어가는" 버그를 실행 중이 아니라 코드 작성 시점에 바로 잡을 수 있게 한다.
const ALLOWED_TRANSITIONS = {
  [STATE.CREATED]: [STATE.INITIALIZING, STATE.ERROR, STATE.DESTROYED],
  [STATE.INITIALIZING]: [STATE.READY, STATE.ERROR, STATE.DESTROYED],
  [STATE.READY]: [STATE.RUNNING, STATE.ERROR, STATE.DESTROYED],
  [STATE.RUNNING]: [STATE.PAUSED, STATE.RESOLVING, STATE.ERROR, STATE.DESTROYED],
  [STATE.PAUSED]: [STATE.RUNNING, STATE.ERROR, STATE.DESTROYED],
  [STATE.RESOLVING]: [STATE.COMPLETED, STATE.ERROR, STATE.DESTROYED],
  [STATE.COMPLETED]: [STATE.READY, STATE.DESTROYED], // restart() 시 COMPLETED -> READY로 재사용
  [STATE.ERROR]: [STATE.DESTROYED],
  [STATE.DESTROYED]: [],
};

/** from -> to 전이가 허용되는지만 boolean으로 알려준다 (부수효과 없음). */
export function canTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/** 허용 안 되는 전이면 에러를 던진다. encounter.js에서 상태를 바꿀 때마다 이 함수를 통과시킨다. */
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`허용되지 않는 상태 전이: ${from} -> ${to}`);
  }
}