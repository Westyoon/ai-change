const GUARDIAN_MEMORIES = Object.freeze({
  DS: { department: "데이터사이언스전공", memory: "흩어진 숫자 속에서 의미를 찾던 벗의 마음이, 너를 향한 빛으로 돌아왔어." },
  CS: { department: "사이버보안학과", memory: "혼자 모든 걸 지켜야 한다는 걱정을 나누던 벗이, 이제 너의 곁을 지켜 주려 해." },
  CSE: { department: "컴퓨터공학과", memory: "오류 앞에서도 한 줄씩 다시 시작하던 벗의 마음이, 다시 나아갈 힘을 전해 줘." },
  AI: { department: "인공지능학부", memory: "빠르게 바뀌는 세상에서 자기 속도로 배우던 벗이, 너의 다음 걸음을 응원해." },
  AIDS: { department: "인공지능데이터사이언스학부", memory: "AI와 데이터 사이에서 자신의 길을 찾던 벗의 마음이, 너의 길에도 함께하고 있어." },
});

export function guardianSupportStory(round, { collectedCount, total }) {
  const memory = GUARDIAN_MEMORIES[round.guardian.code];
  const final = collectedCount >= total;
  return {
    guardian: round.guardian,
    department: memory?.department ?? round.label,
    memory: memory?.memory ?? "네가 만나 고민을 나눈 벗의 마음이, 수호알의 빛이 되어 돌아왔어.",
    voice: round.recoveryMessage,
    progress: `수호알 ${collectedCount} / ${total}`,
    final,
    bridge: final
      ? "다섯 학과의 마음이 모두 모였어. 이아이에게도 전해 주자. 이제 혼자 버티지 않아도 된다고."
      : "함께 나눈 고민이, 이제 너와 이아이를 지키는 응원이 되고 있어.",
    continueLabel: final ? "다섯 수호알과 다시 일어서기" : "응원과 함께 나아가기",
  };
}
