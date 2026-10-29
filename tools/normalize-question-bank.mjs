import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const inventory = [
  [30022, "教育学基础", 200], [10061, "心理学基础", 148],
  [10063, "法律素养", 120], [10065, "安全素养", 140],
  [10064, "信息素养", 62], [30009, "职业理念和职业道德", 69],
  [30010, "科学素养", 485],
];
const sha256 = value => createHash("sha256").update(value).digest("hex");
const escapeText = value => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]).replace(/\r\n?|\n/g, "<br>");

export function normalizeQuestionBank(raw, supplements = []) {
  if (!raw || !Array.isArray(raw.modules) || raw.modules.length !== 7) throw new Error("快照必须包含已核验的七个模块。");
  if (typeof raw.capturedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(raw.capturedAt) || !Number.isFinite(Date.parse(raw.capturedAt))) {
    throw new Error("采集日期无效。");
  }
  const questionIds = new Set();
  const questionMap = new Map();
  const moduleAudit = [];
  const modules = inventory.map(([classId, name, expectedCount]) => {
    const matches = raw.modules.filter(module => module?.name === name);
    if (matches.length !== 1) throw new Error(`模块名称缺失或重复：${name}。`);
    const sourceModule = matches[0];
    if (sourceModule.classId !== classId) throw new Error(`${name}分类 ID 与已核验快照不符。`);
    if (!Array.isArray(sourceModule.questions) || sourceModule.questions.length !== expectedCount) {
      throw new Error(`${name}必须有 ${expectedCount} 题。`);
    }
    const moduleId = `class-${classId}`;
    let originalExplanations = 0;
    const types = { single: 0, multiple: 0, judge: 0 };
    const questions = sourceModule.questions.map((question, index) => {
      const label = `${name}第 ${index + 1} 题（ID ${question?.testQuestionId}）`;
      if (!question || !Number.isSafeInteger(question.testQuestionId) || question.testQuestionId <= 0) throw new Error(`${label}题目 ID 无效。`);
      const id = String(question.testQuestionId);
      if (questionIds.has(id)) throw new Error(`${label}题目 ID 重复。`);
      questionIds.add(id);
      if (typeof question.topic !== "string" || !question.topic.trim()) throw new Error(`${label}题干为空。`);
      if (![1, 2, 4].includes(question.type)) throw new Error(`${label}题型未核验，不自动转换。`);
      if (!Array.isArray(question.questionOptions)) throw new Error(`${label}缺少选项数组。`);
      if (question.answerKeywords !== null && typeof question.answerKeywords !== "string") throw new Error(`${label}解析不是原站纯文本。`);

      let type, options, answer;
      if (question.type === 4) {
        type = "judge";
        if (!["true", "false"].includes(question.answer) || question.questionOptions.length !== 0) {
          throw new Error(`${label}判断题答案或选项与原站规则不符。`);
        }
        options = [{ id: "true", textHtml: "正确" }, { id: "false", textHtml: "错误" }];
        answer = [question.answer];
      } else {
        type = question.type === 1 ? "single" : "multiple";
        if (question.answer !== null || question.questionOptions.length < 2) throw new Error(`${label}选择题答案字段或选项数量异常。`);
        const optionIds = new Set();
        for (const option of question.questionOptions) {
          if (!option || !Number.isSafeInteger(option.optionId) || option.optionId <= 0) throw new Error(`${label}选项 ID 无效。`);
          const optionId = String(option.optionId);
          if (optionIds.has(optionId)) throw new Error(`${label}选项 ID 重复。`);
          optionIds.add(optionId);
          if (!Number.isFinite(option.optionSort) || typeof option.optionLabel !== "string" || !option.optionLabel.trim()) {
            throw new Error(`${label}选项排序或内容无效。`);
          }
          if (typeof option.isAnswer !== "boolean") throw new Error(`${label}isAnswer 必须是已核验的布尔值。`);
        }
        const ordered = [...question.questionOptions].sort((a, b) => a.optionSort - b.optionSort);
        options = ordered.map(option => ({ id: String(option.optionId), textHtml: option.optionLabel }));
        answer = ordered.filter(option => option.isAnswer).map(option => String(option.optionId));
        if (type === "single" && answer.length !== 1) throw new Error(`${label}单选题必须有一个正确答案。`);
        if (type === "multiple" && answer.length === 0) throw new Error(`${label}多选题缺少正确答案。`);
      }
      const hasExplanation = Boolean(question.answerKeywords?.trim());
      if (hasExplanation) originalExplanations++;
      types[type]++;
      const normalized = {
        id, moduleId, number: index + 1, type, promptHtml: question.topic, options, answer,
        explanationHtml: hasExplanation ? escapeText(question.answerKeywords) : "",
        explanationSources: [], explanationStatus: hasExplanation ? "original" : "pending",
        capturedAt: raw.capturedAt,
      };
      questionMap.set(id, normalized);
      return normalized;
    });
    moduleAudit.push({ id: moduleId, name, classId, count: expectedCount, types, originalExplanations, originallyMissingExplanations: expectedCount - originalExplanations });
    return { id: moduleId, name, questions };
  });

  if (!Array.isArray(supplements)) throw new Error("补充解析必须是数组。");
  const supplemented = new Set();
  const supplementAudit = [];
  for (const patch of supplements) {
    if (!patch || !["string", "number"].includes(typeof patch.questionId)) throw new Error("补充解析题目 ID 无效。");
    const id = String(patch.questionId);
    if (supplemented.has(id)) throw new Error(`题目 ${id} 重复补充解析。`);
    supplemented.add(id);
    const question = questionMap.get(id);
    if (!question) throw new Error(`补充解析引用未知题目 ${id}。`);
    if (question.explanationStatus !== "pending") throw new Error(`题目 ${id} 已有原有解析，禁止覆盖。`);
    if (typeof patch.explanationHtml !== "string" || !patch.explanationHtml.trim()) throw new Error(`题目 ${id} 补充解析为空。`);
    if (!Array.isArray(patch.sources) || patch.sources.length === 0) throw new Error(`题目 ${id} 补充解析缺少来源。`);
    const sources = patch.sources.map(source => {
      if (!source || typeof source.title !== "string" || !source.title.trim() ||
          typeof source.url !== "string" || !URL.canParse(source.url) || !["http:", "https:"].includes(new URL(source.url).protocol)) {
        throw new Error(`题目 ${id} 来源标题或 HTTP/HTTPS 链接无效。`);
      }
      return { title: source.title, url: source.url };
    });
    if (typeof patch.verifiedAt !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(patch.verifiedAt) ||
        !Number.isFinite(Date.parse(patch.verifiedAt)) || new Date(patch.verifiedAt).toISOString().slice(0, 10) !== patch.verifiedAt.slice(0, 10)) {
      throw new Error(`题目 ${id} 核验日期无效。`);
    }
    question.explanationHtml = patch.explanationHtml;
    question.explanationSources = sources;
    question.explanationStatus = "verified";
    supplementAudit.push({ questionId: id, verifiedAt: patch.verifiedAt });
  }

  let imageCount = 0;
  for (const module of modules) {
    const row = moduleAudit.find(item => item.id === module.id);
    row.supplementedExplanations = module.questions.filter(question => question.explanationStatus === "verified").length;
    row.pendingExplanations = row.originallyMissingExplanations - row.supplementedExplanations;
    for (const question of module.questions) {
      for (const html of [question.promptHtml, question.explanationHtml, ...question.options.map(option => option.textHtml)]) {
        imageCount += (html.match(/<(?:img|svg|image)\b/gi) ?? []).length;
      }
    }
  }
  const originalExplanations = moduleAudit.reduce((sum, module) => sum + module.originalExplanations, 0);
  const pendingQuestionIds = [...questionMap.values()].filter(question => question.explanationStatus === "pending").map(question => question.id);
  const bank = { version: `${raw.capturedAt.slice(0, 10)}-${sha256(JSON.stringify(modules)).slice(0, 16)}`, modules };
  return {
    bank,
    audit: {
      status: "valid", capturedAt: raw.capturedAt, bankVersion: bank.version,
      contentComplete: pendingQuestionIds.length === 0,
      totals: {
        modules: modules.length, questions: questionIds.size, uniqueQuestionIds: questionIds.size,
        originalExplanations, originallyMissingExplanations: questionIds.size - originalExplanations,
        supplementedExplanations: supplemented.size, pendingExplanations: pendingQuestionIds.length,
      },
      imageCount, noImages: imageCount === 0, modules: moduleAudit,
      supplements: supplementAudit, pendingQuestionIds,
    },
  };
}

// Usage: node tools/normalize-question-bank.mjs [snapshot.json] [--supplements directory]
function main() {
  const output = resolve("data/raw/bank.normalized.json");
  const auditPath = resolve("outputs/bank-import-audit.json");
  let input = "data/raw/exam-all-modules-2026-10-29.json", supplementsDirectory, sourceSha256;
  try {
    let hasInput = false;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--supplements" && args[i + 1] && !supplementsDirectory) supplementsDirectory = args[++i];
      else if (!args[i].startsWith("-") && !hasInput) { input = args[i]; hasInput = true; }
      else throw new Error("用法：node tools/normalize-question-bank.mjs [snapshot.json] [--supplements directory]");
    }
    const sourceBytes = readFileSync(input);
    sourceSha256 = sha256(sourceBytes);
    const patches = [], supplementFiles = [];
    if (supplementsDirectory) {
      for (const name of readdirSync(supplementsDirectory).filter(name => name.endsWith(".json")).sort()) {
        const bytes = readFileSync(join(supplementsDirectory, name));
        const records = JSON.parse(bytes.toString("utf8"));
        if (!Array.isArray(records)) throw new Error(`补充文件 ${name} 必须包含 JSON 数组。`);
        patches.push(...records);
        supplementFiles.push({ name, sha256: sha256(bytes), records: records.length });
      }
    }
    const { bank, audit } = normalizeQuestionBank(JSON.parse(sourceBytes.toString("utf8")), patches);
    const normalizedBytes = `${JSON.stringify(bank, null, 2)}\n`;
    Object.assign(audit, { sourcePath: resolve(input), sourceSha256, normalizedSha256: sha256(normalizedBytes), supplementFiles });
    mkdirSync(dirname(output), { recursive: true });
    mkdirSync(dirname(auditPath), { recursive: true });
    writeFileSync(output, normalizedBytes);
    writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
    console.log(JSON.stringify({ ...audit.totals, noImages: audit.noImages, output, auditPath }, null, 2));
  } catch (error) {
    // Remove only this tool's generated target so an old successful file cannot be mistaken for this run.
    rmSync(output, { force: true });
    mkdirSync(dirname(auditPath), { recursive: true });
    const message = error instanceof Error ? error.message : String(error);
    writeFileSync(auditPath, `${JSON.stringify({ status: "invalid", sourcePath: resolve(input), sourceSha256, errors: [message] }, null, 2)}\n`);
    console.error(message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
