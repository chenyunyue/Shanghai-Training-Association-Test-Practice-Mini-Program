import assert from "node:assert/strict";
import test from "node:test";

const api = await import("./exam-session.ts").catch(() => ({}));
const now = Date.parse("2026-10-29T06:00:00.000Z");

function makeModule(id, name, count) {
  return { id, name, questions: Array.from({ length: count }, (_, index) => ({
    id: `${id}-${index}`, moduleId: id, number: index + 1, type: "single",
    promptHtml: `<p>测试题 ${index + 1}</p>`,
    options: [{ id: "a", textHtml: "正确选项" }, { id: "b", textHtml: "错误选项" }],
    answer: ["a"], explanationHtml: "仅用于测试", explanationSources: [],
    explanationStatus: "original", capturedAt: new Date(now).toISOString(),
  })) };
}

function makeBank(count = 110) {
  return { version: "test-bank-v1", modules: [
    makeModule("m1", "教育学基础", count),
    makeModule("m2", "心理学基础", 8),
    makeModule("m3", "法律素养", 110),
    makeModule("m4", "安全素养", 50),
    makeModule("m5", "信息素养", 62),
    makeModule("m6", "职业理念和职业道德", 69),
    makeModule("m7", "科学素养", 110),
  ] };
}

function createSession() {
  const questions = structuredClone(api.getSubjectQuestions(makeBank(), "education").slice(0, 100));
  return { id: crypto.randomUUID(), subjectId: "education", subjectName: "教育教学知识与能力", bankVersion: "test-bank-v1", startedAt: new Date(now).toISOString(), deadlineAt: new Date(now + 3600000).toISOString(), questions, responses: {}, eventIds: Object.fromEntries(questions.map(q => [q.id, crypto.randomUUID()])) };
}

function makeNewRulesBank() {
  const bank = makeBank(200);
  bank.modules[0].questions.forEach((question, index) => {
    question.type = index < 35 ? "judge" : index < 120 ? "single" : "multiple";
  });
  return bank;
}

test("new exams select 25 judge, 75 single and 50 multiple questions in that order", () => {
  const bank = makeNewRulesBank();
  const session = api.createExamSession(bank, "education", now);
  assert.equal(session.questions.length, 150);
  assert.deepEqual(session.questions.map(q => q.type), [
    ...Array(25).fill("judge"), ...Array(75).fill("single"), ...Array(50).fill("multiple"),
  ]);
  assert.equal(new Set(session.questions.map(q => q.id)).size, 150);
  for (const q of session.questions) assert.deepEqual(q.options, bank.modules.flatMap(m => m.questions).find(item => item.id === q.id).options);
});

test("new exams award half a point for judge and single, one for multiple, with 90 passing", () => {
  const session = api.createExamSession(makeNewRulesBank(), "education", now);
  session.responses = Object.fromEntries(session.questions.map(q => [q.id, ["a"]]));
  let result = api.gradeExam(api.finishExam(session, now));
  assert.equal(result.score, 100);
  for (const q of session.questions.slice(100, 110)) session.responses[q.id] = ["b"];
  result = api.gradeExam(api.finishExam(session, now));
  assert.equal(result.score, 90);
  assert.equal(result.passed, true);
  session.responses[session.questions[0].id] = ["b"];
  result = api.gradeExam(api.finishExam(session, now));
  assert.equal(result.score, 89.5);
  assert.equal(result.passed, false);
});

test("subjects combine their named modules without relying on module IDs", () => {
  assert.equal(typeof api.getSubjectQuestions, "function");
  assert.equal(api.SUBJECTS.length, 3);
  const bank = makeBank();
  assert.equal(api.getSubjectQuestions(bank, "education").length, 118);
  assert.equal(api.getSubjectQuestions(bank, "literacy").length, 291);
  assert.equal(api.getSubjectQuestions(bank, "science").length, 110);
  assert.throws(() => api.getSubjectQuestions(bank, "missing"), /科目/);
});

test("a new exam contains 150 unique snapshot questions and fixed UUID event IDs", () => {
  assert.equal(typeof api.createExamSession, "function");
  const bank = makeNewRulesBank();
  const before = structuredClone(bank);
  const session = api.createExamSession(bank, "education", now);
  assert.equal(session.questions.length, 150);
  assert.equal(new Set(session.questions.map(question => question.id)).size, 150);
  assert.equal(session.subjectName, "教育教学知识与能力");
  assert.equal(session.bankVersion, bank.version);
  assert.equal(session.startedAt, "2026-10-29T06:00:00.000Z");
  assert.equal(session.deadlineAt, "2026-10-29T07:00:00.000Z");
  assert.equal(new Set(Object.values(session.eventIds)).size, 150);
  assert.ok(Object.values(session.eventIds).every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)));
  assert.deepEqual(bank, before);
  const original = bank.modules.flatMap(module => module.questions).find(question => question.id === session.questions[0].id);
  original.promptHtml = "题库更新后的题干";
  assert.notEqual(session.questions[0].promptHtml, original.promptHtml);
});

test("insufficient questions of a required type blocks starting", () => {
  assert.equal(typeof api.createExamSession, "function");
  assert.throws(() => api.createExamSession(makeBank(91), "education", now), /判断题不足/);
});

test("89 fails and 90 passes with one point per correct question", () => {
  const session = createSession();
  for (const correctCount of [89, 90]) {
    session.responses = Object.fromEntries(session.questions.map((question, index) => [question.id, index < correctCount ? ["a"] : ["b"]]));
    const result = api.gradeExam(api.finishExam(session, now + 60000));
    assert.equal(result.score, correctCount);
    assert.equal(result.correctCount, correctCount);
    assert.equal(result.wrongCount, 100 - correctCount);
    assert.equal(result.unansweredCount, 0);
    assert.equal(result.passed, correctCount >= 90);
  }
});

test("unanswered questions score zero and multiple-choice answers must fully match", () => {
  const session = createSession();
  for (const index of [0, 1, 2]) {
    session.questions[index].type = "multiple";
    session.questions[index].answer = ["a", "b"];
  }
  session.questions[3].type = "fill";
  session.questions[3].options = [];
  session.questions[3].answer = ["2", "四"];
  session.responses = {
    [session.questions[0].id]: ["b", "a"],
    [session.questions[1].id]: ["a"],
    [session.questions[2].id]: ["a", "a"],
    [session.questions[3].id]: [" 2 ", "四"],
  };
  const result = api.gradeExam(api.finishExam(session, now + 60000));
  assert.equal(result.score, 2);
  assert.equal(result.wrongCount, 98);
  assert.equal(result.unansweredCount, 96);
  assert.equal(result.events.length, 100);
  assert.equal(result.events[4].correct, false);
  assert.deepEqual(result.events[4].response, []);
});

test("deadline-based remaining time survives serialization and reaches zero at 60 minutes", () => {
  const session = JSON.parse(JSON.stringify(createSession()));
  assert.equal(api.remainingSeconds(session, now), 3600);
  assert.equal(api.remainingSeconds(session, now + 1000), 3599);
  assert.equal(api.remainingSeconds(session, now + 3599999), 1);
  assert.equal(api.remainingSeconds(session, now + 3600000), 0);
  assert.equal(api.remainingSeconds(session, now + 7200000), 0);
});

test("submission is final, preserves event IDs, and cannot grade before submission", () => {
  const session = createSession();
  assert.throws(() => api.gradeExam(session), /交卷/);
  const submitted = api.finishExam(session, now + 7200000);
  assert.equal(submitted.submittedAt, session.deadlineAt);
  assert.deepEqual(api.finishExam(submitted, now + 8000000), submitted);
  assert.equal(session.submittedAt, undefined);
  const first = api.gradeExam(submitted);
  const second = api.gradeExam(api.finishExam(submitted, now + 9000000));
  assert.deepEqual(second, first);
  assert.ok(first.events.every(event => event.id === session.eventIds[event.questionId] && event.answeredAt === submitted.submittedAt));
  assert.equal(api.finishExam(session, now + 60000).submittedAt, "2026-10-29T06:01:00.000Z");
});

function installFakeIndexedDB() {
  const databases = new Map();
  globalThis.indexedDB = {
    open(name) {
      const request = {};
      queueMicrotask(() => {
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        const stores = databases.get(name);
        request.result = {
          createObjectStore(storeName, options) { stores.set(storeName, { rows: new Map(), keyPath: options?.keyPath }); },
          close() {},
          transaction(storeName) {
            const transaction = { objectStore() {
              const store = stores.get(storeName);
              return {
                put(value, key) { store.rows.set(key ?? value[store.keyPath], structuredClone(value)); },
                get(key) {
                  const result = {};
                  queueMicrotask(() => { result.result = structuredClone(store.rows.get(key)); result.onsuccess?.(); });
                  return result;
                },
                getAll() {
                  const result = {};
                  queueMicrotask(() => { result.result = structuredClone([...store.rows.values()]); result.onsuccess?.(); });
                  return result;
                },
              };
            } };
            queueMicrotask(() => transaction.oncomplete?.());
            return transaction;
          },
        };
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

test("the latest local exam retains question snapshots, drafts, deadline and result", async () => {
  installFakeIndexedDB();
  assert.equal(typeof api.loadExamSession, "function");
  assert.equal(await api.loadExamSession(), null);
  const session = createSession();
  session.responses[session.questions[0].id] = ["a"];
  await api.saveExamSession(session);
  assert.deepEqual(await api.loadExamSession(), session);
  const submitted = api.finishExam(session, now + 60000);
  await api.saveExamSession(submitted);
  assert.deepEqual(await api.loadExamSession(), submitted);
});

test("submitting the same exam twice keeps one local event per question", async () => {
  installFakeIndexedDB();
  const offline = await import("./offline-events.ts");
  assert.equal(typeof offline.saveAnswerEvents, "function");
  const result = api.gradeExam(api.finishExam(createSession(), now + 60000));
  await offline.saveAnswerEvents(result.events);
  await offline.saveAnswerEvents(result.events);
  assert.equal((await offline.getLocalAnswerEvents()).length, 100);
});
