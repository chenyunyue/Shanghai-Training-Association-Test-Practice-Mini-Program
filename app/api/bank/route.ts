import { asc } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { getDb } from "../../../db";
import { bankModules } from "../../../db/schema";

const identifier = z.string().trim().min(1);
const html = z.string().transform(value => sanitizeHtml(value, {
  allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "sub", "sup", "ul", "ol", "li", "table", "caption", "thead", "tbody", "tr", "th", "td", "img", "a", "blockquote"],
  allowedAttributes: {
    a: ["href", "title"],
    img: ["src", "alt", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https"],
  allowProtocolRelative: false,
}));

const bankSchema = z.object({
  version: identifier,
  modules: z.array(z.object({
    id: identifier,
    name: identifier,
    questions: z.array(z.object({
      id: identifier,
      moduleId: identifier,
      number: z.number().int().positive(),
      type: z.enum(["single", "multiple", "judge", "fill"]),
      promptHtml: html.refine(value => value.trim() !== "", "题干不能为空"),
      options: z.array(z.object({
        id: identifier,
        textHtml: html.refine(value => value.trim() !== "", "选项不能为空"),
      })),
      answer: z.array(z.string().min(1)).min(1),
      explanationHtml: html,
      explanationSources: z.array(z.object({
        title: identifier,
        url: z.string().url().refine(value => /^https?:\/\//i.test(value), "来源只支持 HTTP 或 HTTPS"),
      })),
      explanationStatus: z.enum(["original", "verified", "pending"]),
      capturedAt: z.string().datetime(),
    })).min(1),
  })).min(1),
}).superRefine((bank, context) => {
  const moduleIds = new Set<string>();
  const questionIds = new Set<string>();
  for (const [moduleIndex, module] of bank.modules.entries()) {
    const modulePath = ["modules", moduleIndex];
    if (moduleIds.has(module.id)) {
      context.addIssue({ code: "custom", path: [...modulePath, "id"], message: "模块 ID 重复" });
    }
    moduleIds.add(module.id);
    for (const [questionIndex, question] of module.questions.entries()) {
      const questionPath = [...modulePath, "questions", questionIndex];
      if (questionIds.has(question.id)) {
        context.addIssue({ code: "custom", path: [...questionPath, "id"], message: "题目 ID 重复" });
      }
      questionIds.add(question.id);
      if (question.moduleId !== module.id || question.number !== questionIndex + 1) {
        context.addIssue({ code: "custom", path: questionPath, message: "模块归属或连续题号不正确" });
      }
      const optionIds = new Set(question.options.map(option => option.id));
      if (optionIds.size !== question.options.length) {
        context.addIssue({ code: "custom", path: [...questionPath, "options"], message: "选项 ID 重复" });
      }
      const validAnswers = question.type === "fill"
        ? question.options.length === 0
        : question.options.length >= 2 &&
          question.answer.every(answer => optionIds.has(answer)) &&
          new Set(question.answer).size === question.answer.length &&
          (question.type === "multiple" || question.answer.length === 1) &&
          (question.type !== "judge" || question.options.length === 2);
      if (!validAnswers) {
        context.addIssue({ code: "custom", path: [...questionPath, "answer"], message: "答案与题型或选项不匹配" });
      }
      if (question.explanationStatus !== "pending" && !question.explanationHtml.trim()) {
        context.addIssue({ code: "custom", path: [...questionPath, "explanationHtml"], message: "已完成解析不能为空" });
      }
      if (question.explanationStatus === "verified" && question.explanationSources.length === 0) {
        context.addIssue({ code: "custom", path: [...questionPath, "explanationSources"], message: "补充解析需要来源" });
      }
    }
  }
});

// Shared bank access relies on the Sites owner-private gateway, including its
// service-access validation. Keep this Site private; user-owned sync uses its
// own ChatGPT identity checks in /api/sync.
export async function GET() {
  const rows = await getDb().select().from(bankModules).orderBy(asc(bankModules.position));
  return Response.json({
    version: rows[0]?.version ?? "",
    modules: rows.map(row => JSON.parse(row.content)),
  });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }
  const result = bankSchema.safeParse(payload);
  if (!result.success) {
    return Response.json({ error: "题库格式不正确", issues: result.error.issues }, { status: 400 });
  }
  const bank = result.data;
  const db = getDb();
  await db.batch([
    db.delete(bankModules),
    db.insert(bankModules).values(bank.modules.map((module, position) => ({
      id: module.id,
      position,
      version: bank.version,
      content: JSON.stringify(module),
    }))),
  ]);
  return Response.json({
    version: bank.version,
    modules: bank.modules.length,
    questions: bank.modules.reduce((count, module) => count + module.questions.length, 0),
  });
}
