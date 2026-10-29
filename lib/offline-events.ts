export type StoredAnswerEvent = {
  id: string;
  questionId: string;
  response: string[];
  correct: boolean;
  answeredAt: string;
};

const DATABASE = "exam-practice";
const STORE = "answer-events";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putEvents(events: readonly StoredAnswerEvent[]): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    for (const event of events) store.put(event);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export async function saveAnswerEvent(event: StoredAnswerEvent): Promise<void> {
  await putEvents([event]);
}

export async function getLocalAnswerEvents(): Promise<StoredAnswerEvent[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result as StoredAnswerEvent[]); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

/** Upload after saveAnswerEvent resolves; failed requests leave local records intact. */
export async function syncAnswerEvents(): Promise<StoredAnswerEvent[]> {
  const local = await getLocalAnswerEvents();
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: local }),
  });
  if (!response.ok) throw new Error("作答同步失败");

  const payload: unknown = await response.json();
  const events = payload && typeof payload === "object" && "events" in payload
    ? payload.events : null;
  if (!Array.isArray(events) || !events.every(event =>
    event && typeof event.id === "string" &&
    typeof event.questionId === "string" &&
    Array.isArray(event.response) && event.response.every((value: unknown) => typeof value === "string") &&
    typeof event.correct === "boolean" && typeof event.answeredAt === "string"
  )) throw new Error("同步响应无效");

  await putEvents(events);
  return getLocalAnswerEvents();
}
