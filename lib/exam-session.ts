import type { Question, QuestionBank } from "./question-bank";
import type { StoredAnswerEvent } from "./offline-events";

export const SUBJECTS: { id: string; name: string; moduleNames: string[] }[] = [
  { id: "education", name: "教育教学知识与能力", moduleNames: ["教育学基础", "心理学基础"] },
  { id: "literacy", name: "职业素养", moduleNames: ["法律素养", "安全素养", "信息素养", "职业理念和职业道德"] },
  { id: "science", name: "专业能力", moduleNames: ["科学素养"] },
];

export type ExamSession = {
  id: string;
  subjectId: string;
  subjectName: string;
  bankVersion: string;
  startedAt: string;
  deadlineAt: string;
  questions: Question[];
  responses: Record<string, string[]>;
  eventIds: Record<string, string>;
  submittedAt?: string;
  scoring?: "weighted-150";
};

export function getSubjectQuestions(bank: QuestionBank, subjectId: string): Question[] {
  const subject = SUBJECTS.find(item => item.id === subjectId);
  if (!subject) throw new Error("请选择有效的测试科目。");
  return bank.modules.filter(module => subject.moduleNames.includes(module.name)).flatMap(module => module.questions);
}

export function createExamSession(bank: QuestionBank, subjectId: string, now = Date.now()): ExamSession {
  const pool = getSubjectQuestions(bank, subjectId);
  const questions: Question[] = [];
  for (const [type, count] of [["judge", 25], ["single", 75], ["multiple", 50]] as const) {
    const candidates = pool.filter(question => question.type === type);
    if (candidates.length < count) throw new Error(`该科目${type === "judge" ? "判断题" : type === "single" ? "单选题" : "多选题"}不足，需要 ${count} 道，当前只有 ${candidates.length} 道。`);
    for (let index = candidates.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
    }
    questions.push(...candidates.slice(0, count));
  }
  const snapshot = structuredClone(questions);
  return {
    id: crypto.randomUUID(),
    subjectId,
    subjectName: SUBJECTS.find(subject => subject.id === subjectId)!.name,
    bankVersion: bank.version,
    startedAt: new Date(now).toISOString(),
    deadlineAt: new Date(now + 60 * 60 * 1000).toISOString(),
    questions: snapshot,
    scoring: "weighted-150",
    responses: {},
    eventIds: Object.fromEntries(snapshot.map(question => [question.id, crypto.randomUUID()])),
  };
}

export function remainingSeconds(session: ExamSession, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(session.deadlineAt) - now) / 1000));
}

export function finishExam(session: ExamSession, now = Date.now()): ExamSession {
  if (session.submittedAt) return session;
  return { ...session, submittedAt: new Date(Math.min(now, Date.parse(session.deadlineAt))).toISOString() };
}

export function gradeExam(session: ExamSession): {
  score: number;
  passed: boolean;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  events: StoredAnswerEvent[];
} {
  const submittedAt = session.submittedAt;
  if (!submittedAt) throw new Error("请先交卷，再查看测试结果。");
  const events = session.questions.map(question => {
    const response = session.responses[question.id] ?? [];
    const correct = response.some(value => value.trim() !== "") && response.length === question.answer.length &&
      (question.type === "fill"
        ? response.every((value, index) => value.trim() === question.answer[index].trim())
        : question.answer.every(value => response.includes(value)));
    return { id: session.eventIds[question.id], questionId: question.id, response, correct, answeredAt: submittedAt };
  });
  const correctCount = events.filter(event => event.correct).length;
  const score = session.scoring === "weighted-150"
    ? events.reduce((sum, event, index) => sum + (event.correct ? (session.questions[index].type === "multiple" ? 1 : 0.5) : 0), 0)
    : correctCount;
  return {
    score,
    passed: score >= 90,
    correctCount,
    wrongCount: events.length - correctCount,
    unansweredCount: events.filter(event => !event.response.some(value => value.trim() !== "")).length,
    events,
  };
}

function openExamDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("exam-sessions", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("session");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadExamSession(): Promise<ExamSession | null> {
  const db = await openExamDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("session", "readonly").objectStore("session").get("latest");
    request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveExamSession(session: ExamSession): Promise<void> {
  const db = await openExamDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("session", "readwrite");
    transaction.objectStore("session").put(session, "latest");
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}
