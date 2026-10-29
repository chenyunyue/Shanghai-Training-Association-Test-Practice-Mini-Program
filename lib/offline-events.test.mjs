import assert from "node:assert/strict";
import test from "node:test";

function installFakeIndexedDB() {
  const rows = new Map();
  globalThis.indexedDB = {
    open() {
      const request = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      request.result = {
        createObjectStore() {},
        close() {},
        transaction() {
          const transaction = {
            oncomplete: null,
            onerror: null,
            objectStore() {
              return {
                put(event) { rows.set(event.id, event); },
                getAll() {
                  const result = { result: null, onsuccess: null, onerror: null };
                  queueMicrotask(() => {
                    result.result = [...rows.values()];
                    result.onsuccess?.();
                  });
                  return result;
                },
              };
            },
          };
          queueMicrotask(() => transaction.oncomplete?.());
          return transaction;
        },
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  return rows;
}

const first = {
  id: "11111111-1111-4111-8111-111111111111",
  questionId: "q1",
  response: ["A"],
  correct: false,
  answeredAt: "2026-10-29T01:00:00.000Z",
};
const second = {
  id: "22222222-2222-4222-8222-222222222222",
  questionId: "q2",
  response: ["B"],
  correct: true,
  answeredAt: "2026-10-29T02:00:00.000Z",
};

test("a failed sync keeps a locally saved answer", async () => {
  installFakeIndexedDB();
  globalThis.fetch = async () => { throw new Error("offline"); };
  const api = await import("./offline-events.ts").catch(() => ({}));
  assert.equal(typeof api.saveAnswerEvent, "function");
  await api.saveAnswerEvent(first);
  await assert.rejects(api.syncAnswerEvents(), /offline/);
  assert.deepEqual(await api.getLocalAnswerEvents(), [first]);
});

test("sync uploads local events and merges the server's other-device events", async () => {
  installFakeIndexedDB();
  let uploaded;
  globalThis.fetch = async (_url, options) => {
    uploaded = JSON.parse(options.body).events;
    return { ok: true, json: async () => ({ events: [first, second] }) };
  };
  const api = await import("./offline-events.ts").catch(() => ({}));
  assert.equal(typeof api.saveAnswerEvent, "function");
  await api.saveAnswerEvent(first);
  const merged = await api.syncAnswerEvents();
  assert.deepEqual(uploaded, [first]);
  assert.deepEqual(merged, [first, second]);
  assert.deepEqual(await api.getLocalAnswerEvents(), [first, second]);
});
