import { readFileSync } from "node:fs";

for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (typeof raw.routeId !== "string" || !Array.isArray(raw.questions)) {
    throw new Error(`${file}: invalid capture envelope`);
  }
  const ids = raw.questions.map(q => String(q.testQuestionId));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingId = raw.questions.filter(q => q.testQuestionId == null || String(q.testQuestionId).trim() === "").length;
  const missingTopic = raw.questions.filter(q => typeof q.topic !== "string" || !q.topic.trim()).length;
  const missingOptions = raw.questions.filter(q => !Array.isArray(q.questionOptions)).length;
  const types = Object.fromEntries([1, 2, 3, 4].map(type => [type, raw.questions.filter(q => Number(q.type) === type).length]));
  const unknownType = raw.questions.length - Object.values(types).reduce((sum, count) => sum + count, 0);
  const answerFlagValues = [...new Set(raw.questions.flatMap(q => (q.questionOptions ?? []).map(o => String(o.isAnswer))))].sort();
  const judgmentAnswers = [...new Set(raw.questions.filter(q => Number(q.type) === 4).map(q => String(q.answer)))].sort();
  const fillAnswerCounts = [...new Set(raw.questions.filter(q => Number(q.type) === 3).map(q => String(q.answerCount)))].sort();
  const missingExplanation = raw.questions.filter(q => typeof q.answerKeywords !== "string" || !q.answerKeywords.trim()).length;
  console.log(JSON.stringify({ file, routeId: raw.routeId, count: raw.questions.length, uniqueIds: new Set(ids).size, missingId, duplicateIds: [...new Set(duplicateIds)], missingTopic, missingOptions, types, unknownType, answerFlagValues, judgmentAnswers, fillAnswerCounts, missingExplanation }, null, 2));
}
