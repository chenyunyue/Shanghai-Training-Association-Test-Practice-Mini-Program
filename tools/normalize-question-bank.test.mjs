import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptUrl = new URL("./normalize-question-bank.mjs", import.meta.url);
const inventory = [
  [30022, "教育学基础", 200, 200], [10061, "心理学基础", 148, 148],
  [10063, "法律素养", 120, 119], [10065, "安全素养", 140, 140],
  [10064, "信息素养", 62, 62], [30009, "职业理念和职业道德", 69, 69],
  [30010, "科学素养", 485, 0],
];

function fixture() {
  let id = 1000;
  return {
    capturedAt: "2026-10-29T14:46:40.977Z",
    modules: inventory.map(([classId, name, count, explained]) => ({
      classId, name, routeId: String(classId + 90000),
      questions: Array.from({ length: count }, (_, index) => {
        const type = [1, 2, 4][index % 3];
        return {
          testQuestionId: id++, type, topic: `<p>题目 ${index + 1}</p>`, answerCount: 1,
          answer: type === 4 ? "false" : null,
          answerKeywords: index < explained ? '第一行 & <符号>\r\n第二行 "引用" \'内容\'' : null,
          questionOptions: type === 4 ? [] : [
            { optionId: 20, optionSort: 2, optionLabel: "选项 B", isAnswer: type === 2 },
            { optionId: 10, optionSort: 1, optionLabel: "<b>选项 A</b>", isAnswer: true },
          ],
        };
      }),
    })),
  };
}

async function normalize(raw, supplements = []) {
  assert.ok(existsSync(scriptUrl), "the source normalizer must exist");
  return (await import(scriptUrl.href)).normalizeQuestionBank(raw, supplements);
}

test("normalizes the seven verified modules without changing answers or original explanation text", async () => {
  const raw = fixture();
  const before = JSON.stringify(raw);
  const { bank, audit } = await normalize(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(bank.modules.length, 7);
  assert.equal(bank.modules[0].id, "class-30022");
  const [single, multiple, judge] = bank.modules[0].questions;
  assert.equal(single.id, "1000");
  assert.equal(single.number, 1);
  assert.equal(single.moduleId, "class-30022");
  assert.equal(single.type, "single");
  assert.deepEqual(single.options.map(option => option.id), ["10", "20"]);
  assert.deepEqual(single.answer, ["10"]);
  assert.deepEqual(multiple.answer, ["10", "20"]);
  assert.equal(judge.type, "judge");
  assert.deepEqual(judge.options, [{ id: "true", textHtml: "正确" }, { id: "false", textHtml: "错误" }]);
  assert.deepEqual(judge.answer, ["false"]);
  assert.equal(single.explanationHtml, "第一行 &amp; &lt;符号&gt;<br>第二行 &quot;引用&quot; &#39;内容&#39;");
  assert.equal(single.explanationStatus, "original");
  assert.equal(single.capturedAt, raw.capturedAt);
  assert.equal(bank.modules[6].questions[0].explanationStatus, "pending");
  assert.equal(bank.modules[6].questions[0].explanationHtml, "");
  assert.deepEqual(audit.totals, { modules: 7, questions: 1224, uniqueQuestionIds: 1224, originalExplanations: 738, originallyMissingExplanations: 486, supplementedExplanations: 0, pendingExplanations: 486 });
  assert.equal(audit.imageCount, 0);
  assert.equal(audit.noImages, true);
  assert.equal(audit.contentComplete, false);
});

for (const [name, mutate, pattern] of [
  ["missing module", raw => raw.modules.pop(), /七个模块/],
  ["wrong name", raw => { raw.modules[0].name = "错误模块"; }, /模块名称/],
  ["wrong count", raw => raw.modules[0].questions.pop(), /200/],
  ["wrong class ID", raw => { raw.modules[0].classId = 10061; }, /分类 ID/],
  ["duplicate question ID", raw => { raw.modules[1].questions[0].testQuestionId = 1000; }, /题目 ID 重复/],
  ["duplicate option ID", raw => { raw.modules[0].questions[0].questionOptions[0].optionId = 10; }, /选项 ID 重复/],
  ["two single answers", raw => { raw.modules[0].questions[0].questionOptions[0].isAnswer = true; }, /单选.*正确答案/],
  ["no multiple answer", raw => { raw.modules[0].questions[1].questionOptions.forEach(o => { o.isAnswer = false; }); }, /多选.*正确答案/],
  ["nonboolean answer flag", raw => { raw.modules[0].questions[0].questionOptions[0].isAnswer = "false"; }, /isAnswer/],
  ["boolean judge answer", raw => { raw.modules[0].questions[2].answer = false; }, /判断.*答案/],
  ["unverified fill type", raw => { raw.modules[0].questions[0].type = 3; }, /题型/],
]) {
  test(`rejects ${name} instead of guessing a repair`, async () => {
    const raw = fixture();
    mutate(raw);
    await assert.rejects(normalize(raw), pattern);
  });
}

function supplement(questionId) {
  return { questionId, explanationHtml: "<p>有来源的补充解析。</p>", sources: [{ title: "来源", url: "https://example.org/source" }], verifiedAt: "2026-10-29" };
}

test("supplements only missing explanations and records verification dates without overriding answers", async () => {
  const raw = fixture();
  const original = await normalize(raw);
  const id = String(raw.modules[6].questions[0].testQuestionId);
  const patch = { ...supplement(id), answer: ["do-not-copy"] };
  const { bank, audit } = await normalize(raw, [patch]);
  const question = bank.modules[6].questions[0];
  assert.equal(question.explanationHtml, patch.explanationHtml);
  assert.deepEqual(question.explanationSources, patch.sources);
  assert.equal(question.explanationStatus, "verified");
  assert.deepEqual(question.answer, original.bank.modules[6].questions[0].answer);
  assert.equal(audit.totals.supplementedExplanations, 1);
  assert.equal(audit.totals.pendingExplanations, 485);
  assert.deepEqual(audit.supplements, [{ questionId: id, verifiedAt: "2026-10-29" }]);
  assert.notEqual(bank.version, original.bank.version);
});

for (const [name, patches, pattern] of [
  ["unknown question", () => [supplement("unknown")], /未知题目/],
  ["duplicate patch", id => [supplement(id), supplement(id)], /重复补充/],
  ["existing explanation", () => [supplement("1000")], /原有解析/],
  ["missing source", id => [{ ...supplement(id), sources: [] }], /来源/],
  ["unsafe source URL", id => [{ ...supplement(id), sources: [{ title: "来源", url: "javascript:alert(1)" }] }], /来源/],
  ["missing verification date", id => [{ ...supplement(id), verifiedAt: "" }], /核验日期/],
]) {
  test(`rejects supplement with ${name}`, async () => {
    const raw = fixture();
    const id = String(raw.modules[6].questions[0].testQuestionId);
    await assert.rejects(normalize(raw, patches(id)), pattern);
  });
}

test("CLI merges JSON supplement files and writes hashes; invalid input leaves only a failed audit", t => {
  assert.ok(existsSync(scriptUrl), "the source normalizer must exist");
  const root = mkdtempSync(join(tmpdir(), "exam-normalize-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, "data/raw/exam-all-modules-2026-10-29.json");
  const output = join(root, "data/raw/bank.normalized.json");
  const auditFile = join(root, "outputs/bank-import-audit.json");
  mkdirSync(dirname(input), { recursive: true });
  mkdirSync(join(root, "supplements"));
  const raw = fixture();
  writeFileSync(input, JSON.stringify(raw));
  writeFileSync(join(root, "supplements/one.json"), JSON.stringify([supplement(String(raw.modules[6].questions[0].testQuestionId))]));
  const args = [fileURLToPath(scriptUrl), "--supplements", "supplements"];
  const first = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  const audit = JSON.parse(readFileSync(auditFile, "utf8"));
  assert.equal(audit.status, "valid");
  assert.equal(audit.sourceSha256, createHash("sha256").update(readFileSync(input)).digest("hex"));
  assert.equal(audit.normalizedSha256, createHash("sha256").update(readFileSync(output)).digest("hex"));
  assert.equal(audit.supplementFiles.length, 1);
  assert.equal(audit.totals.supplementedExplanations, 1);
  raw.modules[0].questions[0].questionOptions[0].isAnswer = true;
  writeFileSync(input, JSON.stringify(raw));
  const failed = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.equal(existsSync(output), false);
  assert.equal(JSON.parse(readFileSync(auditFile, "utf8")).status, "invalid");
});
