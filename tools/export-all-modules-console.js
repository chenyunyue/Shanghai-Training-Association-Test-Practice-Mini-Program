// Paste once into the Console of an already loaded, signed-in practice page.
// Reuses the exact existing page module; never add a query string to its URL.
// Only GET requests are made. Nothing is downloaded unless all seven pass.
(async () => {
  const origin = "https://shpxs.shtraining.org.cn";
  const inventory = [
    ["63203", "教育学基础", 200],
    ["63186", "心理学基础", 148],
    ["63187", "法律素养", 120],
    ["63188", "安全素养", 140],
    ["63189", "信息素养", 62],
    ["63190", "职业理念和职业道德", 69],
    ["63192", "科学素养", 485],
  ];
  const currentRoute = /^\/exam\/app\/train\/(\d+)\/?$/.exec(location.pathname)?.[1];
  if (location.origin !== origin || !inventory.some(([id]) => id === currentRoute)) {
    throw new Error("请在原站已登录的指定练习页面运行；未读取或下载任何题目。");
  }
  const bundleUrl = `${origin}/exam/app/assets/index-eb07aa05.js`;
  const existingBundle = Array.from(document.scripts).some(script =>
    script.type === "module" && script.src === bundleUrl);
  if (document.readyState !== "complete" || !existingBundle || !document.querySelector("#app[data-v-app]")) {
    throw new Error("无法确认指定主模块已加载并挂载；停止导出以避免重复初始化页面。");
  }
  const { b: client } = await import(bundleUrl);
  if (typeof client !== "function") throw new Error("原站读取客户端不匹配，停止导出。");

  async function getJson(path, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      let result;
      try {
        result = await client(path).get().json();
      } catch {
        // Never retain or print the raw client error or request options.
      }
      const status = result?.statusCode?.value;
      if (status >= 400 && status < 500) {
        throw new Error(`${label}读取被拒绝（HTTP ${status}）；不重试，请确认登录和练习会话仍有效。`);
      }
      // The original client can clear its error after a 2xx body-read failure.
      if (!result?.error?.value && status >= 200 && status < 300 && result?.data?.value != null) {
        return result.data.value;
      }
      if (attempt < 3) {
        console.log(`${label}网络读取失败或响应为空，2 秒后进行第 ${attempt + 1} 次尝试。`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    throw new Error(`${label}网络读取失败或响应为空（已尝试 3 次）；未生成题库文件，保留本页后重跑可继续读取。`);
  }

  // Page memory only: store successful allowlisted snapshots, never raw responses.
  const verifiedModules = globalThis.__shtrainingExamExportVerifiedModulesV1 ??= Object.create(null);
  const isId = value => (typeof value === "string" && value.trim() !== "") ||
    (typeof value === "number" && Number.isFinite(value));
  const isScalar = value => value == null || typeof value === "string" ||
    typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
  const modules = [];
  for (const [routeId, name, expectedCount] of inventory) {
    if (verifiedModules[routeId]) {
      modules.push(verifiedModules[routeId]);
      console.log(`已复用本页核验缓存 ${name}：${expectedCount} 题`);
      continue;
    }
    const path = `api/exam/test-user-train/open-train/${routeId}`;
    const metadata = await getJson(path, `${name}元信息`);
    const classId = metadata?.testPaper?.classId;
    if (!isId(classId)) throw new Error(`${name}缺少有效分类 ID；停止导出。`);
    const categories = await getJson(`api/category/open?ids=${encodeURIComponent(classId)}`, `${name}分类`);
    const matching = Array.isArray(categories?.content)
      ? categories.content.filter(item => String(item.id) === String(classId)) : [];
    if (matching.length !== 1 || matching[0].label !== name) {
      throw new Error(`会话 ${routeId} 的模块名称与 ${name} 不一致；停止导出。`);
    }
    const list = await getJson(`${path}/questions`, `${name}题目`);
    if (!Array.isArray(list) || list.length !== expectedCount) {
      throw new Error(`${name}题数不是已核验的 ${expectedCount} 题；停止导出。`);
    }
    const seen = new Set();
    const questions = list.map((question, index) => {
      if (!question || !isId(question.testQuestionId) || seen.has(String(question.testQuestionId)) ||
          ![1, 2, 3, 4].includes(question.type) || typeof question.topic !== "string" || !question.topic.trim() ||
          !isScalar(question.answerCount) || !isScalar(question.answer) ||
          !(question.answerKeywords == null || typeof question.answerKeywords === "string") ||
          !Array.isArray(question.questionOptions)) {
        throw new Error(`${name}第 ${index + 1} 题字段异常或 ID 重复；停止导出。`);
      }
      seen.add(String(question.testQuestionId));
      const questionOptions = question.questionOptions.map(option => {
        if (!option || !isId(option.optionId) || !isScalar(option.optionSort) ||
            typeof option.optionLabel !== "string" || !isScalar(option.isAnswer)) {
          throw new Error(`${name}第 ${index + 1} 题选项字段异常；停止导出。`);
        }
        return {
          optionId: option.optionId,
          optionSort: option.optionSort ?? null,
          optionLabel: option.optionLabel,
          isAnswer: option.isAnswer ?? null,
        };
      });
      return {
        testQuestionId: question.testQuestionId,
        type: question.type,
        topic: question.topic,
        answerCount: question.answerCount ?? null,
        answer: question.answer ?? null,
        answerKeywords: question.answerKeywords ?? null,
        questionOptions,
      };
    });
    const verified = { routeId, name, classId, questions };
    verifiedModules[routeId] = verified;
    modules.push(verified);
    console.log(`已核对 ${name}：${questions.length} 题`);
  }
  const capturedAt = new Date().toISOString();
  const json = JSON.stringify({ capturedAt, modules }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `exam-all-modules-${capturedAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  console.log("七个模块共 1224 题核对通过，已触发单一 JSON 文件下载。请保留该文件供后续核验。");
  return { modules: modules.length, questions: modules.reduce((sum, module) => sum + module.questions.length, 0) };
})();
