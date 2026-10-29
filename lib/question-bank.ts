export type Question = {
  id: string;
  moduleId: string;
  number: number;
  type: "single" | "multiple" | "judge" | "fill";
  promptHtml: string;
  options: { id: string; textHtml: string }[];
  answer: string[];
  explanationHtml: string;
  explanationSources: { title: string; url: string }[];
  explanationStatus: "original" | "verified" | "pending";
  capturedAt: string;
};

export type QuestionBank = {
  version: string;
  modules: { id: string; name: string; questions: Question[] }[];
};

function openBankDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("exam-question-bank", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("bank");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedQuestionBank(): Promise<QuestionBank | null> {
  const db = await openBankDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("bank", "readonly").objectStore("bank").get("current");
    request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function downloadQuestionBank(): Promise<QuestionBank> {
  const response = await fetch("/api/bank", { cache: "no-store" }).catch(() => {
    throw new Error("暂时无法连接题库，请检查网络后重试。");
  });
  if (!response.ok) throw new Error(response.status === 401 ? "请联网后重新登录，再下载题库。" : "题库暂时无法下载，请稍后重试。");
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("请重新登录后下载题库。");
  const bank = await response.json() as QuestionBank;
  const db = await openBankDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("bank", "readwrite");
    transaction.objectStore("bank").put(bank, "current");
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
  return bank;
}
