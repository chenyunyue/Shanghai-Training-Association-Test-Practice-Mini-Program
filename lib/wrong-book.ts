export type AnswerEvent = {
  id: string;
  questionId: string;
  correct: boolean;
  answeredAt: string;
};

export function getWrongQuestionIds(events: readonly AnswerEvent[]): Set<string> {
  const latest = new Map<string, AnswerEvent>();
  for (const event of events) {
    const previous = latest.get(event.questionId);
    if (
      !previous ||
      Date.parse(event.answeredAt) > Date.parse(previous.answeredAt) ||
      (event.answeredAt === previous.answeredAt && event.id > previous.id)
    ) {
      latest.set(event.questionId, event);
    }
  }
  return new Set([...latest.values()].filter(event => !event.correct).map(event => event.questionId));
}
