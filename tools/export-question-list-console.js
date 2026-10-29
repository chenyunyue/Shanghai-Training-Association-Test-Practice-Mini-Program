// Run in the authenticated practice page's DevTools Console after storing
// the "questionList.value" array as the global variable temp1.
(() => {
  const list = temp1;
  if (!Array.isArray(list) || !list.every(q => q && q.testQuestionId != null)) {
    throw new Error("temp1 must be the questionList.value array");
  }
  const routeId = /^\/exam\/app\/train\/(\d+)\/?$/.exec(location.pathname)?.[1];
  if (!routeId) throw new Error("Open an authenticated practice page with a numeric route ID first");
  const questions = list.map(q => ({
    testQuestionId: q.testQuestionId,
    type: q.type,
    topic: q.topic,
    answerCount: q.answerCount ?? null,
    answer: q.answer ?? null,
    answerKeywords: q.answerKeywords ?? null,
    questionOptions: (q.questionOptions ?? []).map(o => ({
      optionId: o.optionId,
      optionSort: o.optionSort,
      optionLabel: o.optionLabel,
      isAnswer: o.isAnswer
    }))
  }));
  const json = JSON.stringify({ routeId, capturedAt: new Date().toISOString(), questions }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `exam-${routeId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
})();
