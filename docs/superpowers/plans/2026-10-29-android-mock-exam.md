# 安卓模拟测试实施计划

**Goal:** 在现有私有应用中增加 3 科目、100 题、60 分钟、90 分及格的模拟测试，并补安卓桌面安装信息。

**Architecture:** 独立 ExamPanel 消费当前 QuestionBank；lib/exam-session.ts 保存试卷快照和固定事件 ID、执行抽样判分；交卷批量写已有本地事件存储后使用原同步接口。

**Tech Stack:** React、TypeScript、IndexedDB、Web App Manifest、现有 Vinext/D1。

## 全局约束

- 不改练习即时反馈行为；测试交卷前隐藏答案。不增加新云表或账号系统。
- 3 科目映射用原站模块名，不用动态 train 会话 ID。
- 少于 100 题明确阻止组卷。测试期限从持久化截止时间推导，后台停留不停表。
- 原站题库采集仍不提交原站练习成绩，也不存储原站凭据。

## 1. 测试核心与本地存储

- [ ] 新建 lib/exam-session.test.mjs，先运行并确认缺失实现导致失败：覆盖抽100题无重复、拒绝不足100、89/90及格线、未答/多选规则、60分钟期限及固定事件 ID。
- [ ] 新建 lib/exam-session.ts：导出 SUBJECTS、getSubjectQuestions(bank,subjectId)、createExamSession(bank,subjectId,now?)、remainingSeconds(session,now?)、gradeExam(session)、finishExam(session,now?)、loadExamSession()、saveExamSession(session)。固定 ExamSession 类型供组件使用。
- [ ] 修改 lib/offline-events.ts 暴露 saveAnswerEvents(events) 批量事务保存；单题保存保持兼容。
- [ ] 运行 node --test lib/exam-session.test.mjs lib/offline-events.test.mjs lib/wrong-book.test.mjs，结果全部通过。

## 2. 测试页面

- [ ] 新建 components/exam-panel.tsx：接收 bank 和 onSubmitted，处理选择科目、恢复试卷、截止倒计时、草稿保存、交卷确认、结果与解析。
- [ ] 更新 app/page.tsx 增加练习/测试入口；保持原 QuestionCard 与错题状态逻辑，交卷后读取本地事件并同步。
- [ ] app/globals.css 仅补测试布局与手机样式。
- [ ] 浏览器核验开始、修改答案、跳号、刷新恢复、交卷、查看解析、错题回流；倒计时到时使用纯函数测试验证期限边界。

## 3. 安卓安装与总验收

- [ ] 添加 public/manifest.webmanifest、192/512 图标，layout metadata 关联 manifest；沿用当前 service worker。
- [ ] npx tsc --noEmit、npm run build、git diff --check 全部通过；更新 docs/verification.md。
- [ ] 完整题库导入和解析补齐后发布私有版本；未取得完整题库前明确保留该阻断，不发布测试题为正式内容。
