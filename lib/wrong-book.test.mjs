import assert from "node:assert/strict";
import test from "node:test";
import { getWrongQuestionIds } from "./wrong-book.ts";

test("a later correct answer removes a question from the wrong book", () => {
  const events = [
    { id: "a", questionId: "q1", correct: false, answeredAt: "2026-10-29T01:00:00.000Z" },
    { id: "b", questionId: "q1", correct: true, answeredAt: "2026-10-29T02:00:00.000Z" },
  ];
  assert.deepEqual([...getWrongQuestionIds(events)], []);
});

test("a later wrong answer adds a question regardless of event input order", () => {
  const events = [
    { id: "b", questionId: "q1", correct: false, answeredAt: "2026-10-29T02:00:00.000Z" },
    { id: "a", questionId: "q1", correct: true, answeredAt: "2026-10-29T01:00:00.000Z" },
  ];
  assert.deepEqual([...getWrongQuestionIds(events)], ["q1"]);
  assert.deepEqual([...getWrongQuestionIds([...events].reverse())], ["q1"]);
});

test("event ID resolves equal answer times consistently", () => {
  const events = [
    { id: "a", questionId: "q1", correct: true, answeredAt: "2026-10-29T01:00:00.000Z" },
    { id: "b", questionId: "q1", correct: false, answeredAt: "2026-10-29T01:00:00.000Z" },
  ];
  assert.deepEqual([...getWrongQuestionIds(events)], ["q1"]);
  assert.deepEqual([...getWrongQuestionIds([...events].reverse())], ["q1"]);
});
