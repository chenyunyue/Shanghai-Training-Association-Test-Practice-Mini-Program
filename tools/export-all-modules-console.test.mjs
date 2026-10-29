import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const scriptFile = new URL("./export-all-modules-console.js", import.meta.url);
const origin = "https://shpxs.shtraining.org.cn";
const bundleUrl = `${origin}/exam/app/assets/index-eb07aa05.js`;
const inventory = [
  ["63203", "教育学基础", 200], ["63186", "心理学基础", 148],
  ["63187", "法律素养", 120], ["63188", "安全素养", 140],
  ["63189", "信息素养", 62], ["63190", "职业理念和职业道德", 69],
  ["63192", "科学素养", 485],
];

function harness(change = {}) {
  assert.ok(existsSync(scriptFile), "the guarded all-module exporter must exist");
  const responses = new Map();
  for (const [routeId, name, count] of inventory) {
    responses.set(`api/exam/test-user-train/open-train/${routeId}`, {
      testPaper: { classId: `class-${routeId}` }, accountData: "must not export",
    });
    responses.set(`api/category/open?ids=class-${routeId}`, {
      content: [{ id: `class-${routeId}`, label: name, other: "must not export" }],
    });
    responses.set(`api/exam/test-user-train/open-train/${routeId}/questions`,
      Array.from({ length: count }, (_, index) => ({
        testQuestionId: `${routeId}-${index}`, type: 1, topic: `<p>题目 ${index}</p>`,
        answerCount: 1, answer: null, answerKeywords: "原有解析 <不是HTML>",
        questionOptions: [
          { optionId: "a", optionSort: 1, optionLabel: "正确选项", isAnswer: true, owner: "must not export" },
          { optionId: "b", optionSort: 2, optionLabel: "干扰选项", isAnswer: false },
        ],
        token: "must not export", profile: { private: "must not export" },
      })));
  }
  change.responses?.(responses);
  const calls = [], imports = [], blobs = [], downloads = [], logs = [], delays = [];
  const client = path => ({
    get() {
      calls.push({ method: "GET", path });
      return { json: async () => {
        if (path === change.throwPath) throw new Error("raw response must not be logged");
        const supplied = change.reply?.(path, calls.filter(call => call.path === path).length);
        if (supplied !== undefined) return supplied;
        return {
          statusCode: { value: path === change.failPath ? 401 : 200 },
          error: { value: path === change.failPath ? "failed" : null },
          data: { value: structuredClone(responses.get(path)) },
        };
      } };
    },
    post() { throw new Error("POST is forbidden"); },
  });
  const document = {
    readyState: change.readyState ?? "complete",
    scripts: change.scripts ?? [{ type: "module", src: bundleUrl }],
    querySelector: selector => selector === "#app[data-v-app]" && change.mounted !== false ? {} : null,
    createElement: tag => {
      assert.equal(tag, "a");
      const link = { click: () => downloads.push({ href: link.href, name: link.download }), remove() {} };
      return link;
    },
    body: { appendChild() {} },
  };
  const context = vm.createContext({
    location: { origin: change.origin ?? origin, pathname: change.pathname ?? "/exam/app/train/63203" },
    document, Blob, URL: { createObjectURL: blob => { blobs.push(blob); return "blob:test"; }, revokeObjectURL() {} },
    console: { log: (...args) => logs.push(args) },
    setTimeout: (callback, delay) => { delays.push(delay); callback(); },
    localStorage: new Proxy({}, { get() { throw new Error("storage access is forbidden"); } }),
    sessionStorage: new Proxy({}, { get() { throw new Error("storage access is forbidden"); } }),
  });
  const script = new vm.Script(readFileSync(scriptFile, "utf8"), {
    filename: "export-all-modules-console.js",
    importModuleDynamically: async specifier => {
      imports.push(specifier);
      const module = new vm.SyntheticModule(["b"], function () { this.setExport("b", client); }, { context });
      await module.link(() => {});
      await module.evaluate();
      return module;
    },
  });
  return {
    run: () => script.runInContext(context), calls, imports, blobs, downloads, logs, delays,
    cache: () => context.__shtrainingExamExportVerifiedModulesV1,
  };
}

test("exports seven verified snapshots with GET only and strict field allowlists", async () => {
  const h = harness();
  await h.run();
  assert.deepEqual(h.imports, [bundleUrl]);
  assert.equal(h.calls.length, 21);
  assert.ok(h.calls.every(call => call.method === "GET"));
  assert.equal(h.downloads.length, 1);
  const json = await h.blobs[0].text();
  assert.ok(!json.includes("must not export"));
  const data = JSON.parse(json);
  assert.deepEqual(Object.keys(data).sort(), ["capturedAt", "modules"]);
  assert.equal(data.modules.length, 7);
  assert.equal(data.modules.reduce((sum, module) => sum + module.questions.length, 0), 1224);
  assert.deepEqual(Object.keys(data.modules[0]).sort(), ["classId", "name", "questions", "routeId"]);
  const question = data.modules[0].questions[0];
  assert.deepEqual(Object.keys(question).sort(), ["answer", "answerCount", "answerKeywords", "questionOptions", "testQuestionId", "topic", "type"]);
  assert.deepEqual(Object.keys(question.questionOptions[0]).sort(), ["isAnswer", "optionId", "optionLabel", "optionSort"]);
  assert.equal(question.answerKeywords, "原有解析 <不是HTML>");
});

for (const change of [
  { origin: "https://example.com" }, { pathname: "/exam/app/home" },
  { pathname: "/exam/app/train/99999" }, { readyState: "loading" },
  { scripts: [] }, { scripts: [{ type: "module", src: `${bundleUrl}?reload=1` }] },
  { scripts: [{ type: "text/javascript", src: bundleUrl }] }, { mounted: false },
]) {
  test(`blocks an unverified page before importing the bundle: ${JSON.stringify(change)}`, async () => {
    const h = harness(change);
    await assert.rejects(h.run());
    assert.equal(h.imports.length, 0);
    assert.equal(h.calls.length, 0);
    assert.equal(h.downloads.length, 0);
  });
}

const safetyQuestionsPath = "api/exam/test-user-train/open-train/63188/questions";
const emptySuccess = () => ({ statusCode: { value: 200 }, error: { value: null }, data: { value: null } });

test("a 200 response with cleared error and missing body reports network failure after three attempts", async () => {
  const h = harness({ reply: path => path === safetyQuestionsPath ? emptySuccess() : undefined });
  await assert.rejects(h.run(), /安全素养题目.*网络.*3 次/);
  assert.equal(h.calls.filter(call => call.path === safetyQuestionsPath).length, 3);
  assert.deepEqual(h.delays, [2000, 2000]);
  assert.equal(h.downloads.length, 0);
});

test("retries missing 200 bodies twice then exports the complete bank", async () => {
  const h = harness({ reply: (path, attempt) => path === safetyQuestionsPath && attempt < 3 ? emptySuccess() : undefined });
  await h.run();
  assert.equal(h.calls.filter(call => call.path === safetyQuestionsPath).length, 3);
  assert.deepEqual(h.delays.filter(delay => delay === 2000), [2000, 2000]);
  assert.equal(h.downloads.length, 1);
});

test("retries a thrown network failure but never logs the raw error", async () => {
  const h = harness({ reply: (path, attempt) => {
    if (path === safetyQuestionsPath && attempt < 3) throw new Error("raw response must not be logged");
  } });
  await h.run();
  assert.equal(h.calls.filter(call => call.path === safetyQuestionsPath).length, 3);
  assert.equal(h.downloads.length, 1);
  assert.ok(!JSON.stringify(h.logs).includes("raw response"));
});

test("known 4xx failures stop immediately without retrying or downloading", async () => {
  const h = harness({ failPath: safetyQuestionsPath });
  await assert.rejects(h.run(), /HTTP 401/);
  assert.equal(h.calls.filter(call => call.path === safetyQuestionsPath).length, 1);
  assert.deepEqual(h.delays, []);
  assert.equal(h.downloads.length, 0);
});

test("a real nonempty array with the wrong count is a data error and is not retried", async () => {
  const h = harness({ responses: responses => { responses.get(safetyQuestionsPath).pop(); } });
  await assert.rejects(h.run(), /题数不是已核验的 140 题/);
  assert.equal(h.calls.filter(call => call.path === safetyQuestionsPath).length, 1);
  assert.deepEqual(h.delays, []);
  assert.equal(h.downloads.length, 0);
});

test("a rerun reuses only already verified allowlisted modules from this page", async () => {
  const changes = { throwPath: safetyQuestionsPath };
  const h = harness(changes);
  await assert.rejects(h.run(), /网络.*3 次/);
  assert.equal(h.downloads.length, 0);
  assert.deepEqual(Object.keys(h.cache()), ["63186", "63187", "63203"]);
  const cached = JSON.stringify(h.cache());
  assert.ok(!cached.includes("must not export"));
  assert.ok(!cached.includes("accountData"));
  assert.ok(!cached.includes('"token"'));
  const firstRunCalls = h.calls.length;
  changes.throwPath = null;
  await h.run();
  const secondRunCalls = h.calls.slice(firstRunCalls);
  assert.equal(secondRunCalls.length, 12);
  assert.ok(secondRunCalls.every(call => !/63203|63186|63187/.test(call.path)));
  assert.equal(h.downloads.length, 1);
  const data = JSON.parse(await h.blobs[0].text());
  assert.equal(data.modules.length, 7);
  assert.equal(data.modules.reduce((sum, module) => sum + module.questions.length, 0), 1224);
});

for (const [name, change] of [
  ["request rejection", { failPath: "api/exam/test-user-train/open-train/63192/questions" }],
  ["network failure", { throwPath: "api/exam/test-user-train/open-train/63192/questions" }],
  ["wrong module name", { responses: r => { r.get("api/category/open?ids=class-63192").content[0].label = "错误模块"; } }],
  ["wrong question count", { responses: r => { r.get("api/exam/test-user-train/open-train/63192/questions").pop(); } }],
  ["missing class ID", { responses: r => { r.get("api/exam/test-user-train/open-train/63192").testPaper = {}; } }],
  ["duplicate question ID", { responses: r => { const q = r.get("api/exam/test-user-train/open-train/63192/questions"); q[1].testQuestionId = q[0].testQuestionId; } }],
  ["missing options field", { responses: r => { delete r.get("api/exam/test-user-train/open-train/63192/questions")[0].questionOptions; } }],
  ["nested data in a scalar field", { responses: r => { r.get("api/exam/test-user-train/open-train/63192/questions")[0].answer = { token: "must not export" }; } }],
]) {
  test(`does not download a partial bank after ${name}`, async () => {
    const h = harness(change);
    await assert.rejects(h.run());
    assert.equal(h.downloads.length, 0);
    assert.equal(h.blobs.length, 0);
    assert.ok(!JSON.stringify(h.logs).includes("raw response"));
  });
}
