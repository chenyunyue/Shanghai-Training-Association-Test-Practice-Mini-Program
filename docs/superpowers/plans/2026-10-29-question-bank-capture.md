# Question Bank Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a credential-free, auditable snapshot of the seven authenticated practice modules, starting with a verified 200-question pilot.

**Architecture:** The original practice page already loads one module's full question list and logs it to the browser console. A short console snippet exports only question fields to JSON; a local Node script checks the exported shape and counts. No password, browser token, user profile, or answer submission enters the project.

**Tech Stack:** Chrome DevTools Console, Node.js 24 built-ins, PowerShell, Git.

## Global Constraints

- Keep the original site account for read-only question capture; do not submit an original-site practice session.
- Capture all seven modules selected by the user, but verify the education-basics module first. The numeric practice-page URL segment is a session ID: separate visits to education basics produced `63175` and `63182`. Record the visible module name separately; never use that number as a stable module ID.
- Export only `testQuestionId`, `type`, `topic`, `answerCount`, `answer`, `answerKeywords`, and option ID/order/label/answer flag.
- Keep original-site credentials and tokens out of files, command lines, logs, and Git. Do not read the browser profile or copy `exam-store`.
- Treat captured HTML as untrusted data. This plan audits raw content; the later import plan will sanitize it once at the boundary.
- Stop after the pilot and report the missing source requirement if authenticated capture cannot produce the expected 200-item array without changing the user's original practice results.

## File Map

- `tools/export-question-list-console.js`: one-time browser-console export snippet; no external dependencies.
- `tools/inspect-question-list.mjs`: prints module counts, field presence, ID uniqueness, and answer-field representations from local JSON.
- `data/raw/`: untracked local JSON captures; never includes tokens or user metadata.
- `docs/data-audit.md`: checked counts, observed schema, missing-analysis counts, and acquisition limits.
- `.gitignore`: ignores only raw captures in addition to the existing visual companion directory.

---

### Task 1: Export the education-basics pilot

**Files:**
- Create: `tools/export-question-list-console.js`
- Modify: `.gitignore`
- Local output: `data/raw/exam-<observed-session-ID>.json`

**Interfaces:**
- Consumes: the `questionList.value` console object emitted by the authenticated education-basics practice page `/exam/app/train/<session-ID>`.
- Produces: JSON `{ routeId: string, capturedAt: string, questions: QuestionRaw[] }`, with only the allowlisted fields. The existing `routeId` envelope field contains the observed session ID, not the module identity.

- [ ] **Step 1: Add the console snippet**

Save this exact code to `tools/export-question-list-console.js`. In Chrome DevTools, reload the authenticated practice page, find the `questionList.value` array log, use “Store as global variable” so the array is `temp1`, and paste the snippet into the Console. Before pasting, inspect `temp1.length` and `temp1[0].topic` against the current page's question count and first visible question; navigate to question 1 if needed. This prevents a stale `temp1` from a prior module being labeled with the current session ID. The user performs any login or CAPTCHA interaction; the agent never requests a password in chat.

```js
(() => {
  const list = temp1;
  if (!Array.isArray(list) || !list.every(q => q && q.testQuestionId != null)) {
    throw new Error("temp1 must be the questionList.value array");
  }
  const routeId = /^\/exam\/app\/train\/(\d+)\/?$/.exec(location.pathname)?.[1];
  if (!routeId) throw new Error("Open an authenticated practice page with a numeric route ID first");
  const questions = list.map(q => ({
    testQuestionId: q.testQuestionId,
    type: q.type,
    topic: q.topic,
    answerCount: q.answerCount ?? null,
    answer: q.answer ?? null,
    answerKeywords: q.answerKeywords ?? null,
    questionOptions: (q.questionOptions ?? []).map(o => ({
      optionId: o.optionId,
      optionSort: o.optionSort,
      optionLabel: o.optionLabel,
      isAnswer: o.isAnswer
    }))
  }));
  const json = JSON.stringify({ routeId, capturedAt: new Date().toISOString(), questions }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `exam-${routeId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
})();
```

- [ ] **Step 2: Verify the browser result**

Confirm Chrome downloaded `exam-<observed-session-ID>.json`, where the filename and `routeId` value match the current practice-page URL. Inspect its first record and count before copying it; it must contain 200 questions and no account, token, or unrelated response fields. Record the visible module name as “教育学基础” alongside this session ID. If the logged value is absent, open DevTools before reloading the practice page and inspect the console again. Do not guess another global variable or extract browser storage.

- [ ] **Step 3: Place the raw file and ignore it**

Append `data/raw/` to `.gitignore`, create `data/raw/`, and copy the verified download to the active worktree. With the normal Windows Downloads location, run from the worktree root:

```powershell
$rawDir = Join-Path (git rev-parse --show-toplevel) 'data\raw'
New-Item -ItemType Directory -Force -Path $rawDir | Out-Null
$sessionId = Read-Host 'Numeric session ID in the current education-basics practice URL'
if ($sessionId -notmatch '^\d+$') { throw 'Expected the numeric session ID from the current practice URL' }
Copy-Item -LiteralPath (Join-Path $env:USERPROFILE "Downloads\exam-$sessionId.json") -Destination (Join-Path $rawDir "exam-$sessionId.json")
git status --short
```

If Chrome reports another download path, use that exact observed path as the `Copy-Item -LiteralPath` value. The raw JSON must remain ignored. Do not delete the user's original download.

- [ ] **Step 4: Commit the reusable snippet**

Run `git add .gitignore tools/export-question-list-console.js`, then `git commit -m "Add private question capture snippet"`. The raw JSON must not appear in the commit.

### Task 2: Audit the pilot shape before normalizing

**Files:**
- Create: `tools/inspect-question-list.mjs`
- Create: `docs/data-audit.md`
- Read: the education-basics `data/raw/exam-<observed-session-ID>.json` capture.

**Interfaces:**
- Consumes: the Task 1 JSON envelope.
- Produces: a console audit and a written source-schema record for later normalization.

- [ ] **Step 1: Write the inspector**

Save this exact code to `tools/inspect-question-list.mjs`:

```js
import { readFileSync } from "node:fs";

for (const file of process.argv.slice(2)) {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (typeof raw.routeId !== "string" || !Array.isArray(raw.questions)) {
    throw new Error(`${file}: invalid capture envelope`);
  }
  const ids = raw.questions.map(q => String(q.testQuestionId));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingId = raw.questions.filter(q => q.testQuestionId == null || String(q.testQuestionId).trim() === "").length;
  const missingTopic = raw.questions.filter(q => typeof q.topic !== "string" || !q.topic.trim()).length;
  const missingOptions = raw.questions.filter(q => !Array.isArray(q.questionOptions)).length;
  const types = Object.fromEntries([1, 2, 3, 4].map(type => [type, raw.questions.filter(q => Number(q.type) === type).length]));
  const unknownType = raw.questions.length - Object.values(types).reduce((sum, count) => sum + count, 0);
  const answerFlagValues = [...new Set(raw.questions.flatMap(q => (q.questionOptions ?? []).map(o => String(o.isAnswer))))].sort();
  const judgmentAnswers = [...new Set(raw.questions.filter(q => Number(q.type) === 4).map(q => String(q.answer)))].sort();
  const fillAnswerCounts = [...new Set(raw.questions.filter(q => Number(q.type) === 3).map(q => String(q.answerCount)))].sort();
  const missingExplanation = raw.questions.filter(q => typeof q.answerKeywords !== "string" || !q.answerKeywords.trim()).length;
  console.log(JSON.stringify({ file, routeId: raw.routeId, count: raw.questions.length, uniqueIds: new Set(ids).size, missingId, duplicateIds: [...new Set(duplicateIds)], missingTopic, missingOptions, types, unknownType, answerFlagValues, judgmentAnswers, fillAnswerCounts, missingExplanation }, null, 2));
}
```

- [ ] **Step 2: Run the pilot audit**

Run from the active worktree root returned by `git rev-parse --show-toplevel`, with the session ID from the verified filename:

```powershell
$sessionId = Read-Host 'Education-basics capture session ID'
node tools/inspect-question-list.mjs (Join-Path 'data\raw' "exam-$sessionId.json")
```

Expected: `routeId` matches that file's observed session ID, `count` and `uniqueIds` are both `200`, `missingId` and `unknownType` are `0`, `duplicateIds` is `[]`, `missingTopic` and `missingOptions` are `0`. Record the actual `types`, `answerFlagValues`, `judgmentAnswers`, `fillAnswerCounts`, and `missingExplanation`; those values cannot be assumed from the public script.

- [ ] **Step 3: Record verified observations**

Write `docs/data-audit.md` with the visible module name, observed session ID, page-visible count, exported count, unique ID count, type distribution, option answer-flag representation, missing-analysis count, capture date, and any anomalies. State explicitly that only the pilot module has been verified.

- [ ] **Step 4: Commit audit code and report**

Run `git add tools/inspect-question-list.mjs docs/data-audit.md`, then `git commit -m "Audit first practice module snapshot"`.

### Task 3: Capture and audit the six remaining modules

**Files:**
- Local output: six further JSON files in `data/raw/`, each named with the session ID observed in its practice-page URL.
- Modify: `docs/data-audit.md`.

**Interfaces:**
- Consumes: the Task 1 snippet and Task 2 inspector.
- Produces: a verified seven-module inventory for the normalization and app plans.

- [ ] **Step 1: Capture each module through its visible Start Practice control**

For each of the six remaining module rows in `/exam/app/dashboard/train`, open the practice page, note its visible module name, session ID, and page-visible question count, then repeat the Task 1 console export. The page may open a practice session; do not use “结束练习” or submit answers. Each exported filename is determined by the current session ID in the page URL; keep the name-to-session mapping in `docs/data-audit.md`.

- [ ] **Step 2: Audit every exported file**

Run this PowerShell command from the project root:

```powershell
Get-ChildItem -LiteralPath 'data\raw' -Filter 'exam-*.json' | ForEach-Object { node tools/inspect-question-list.mjs $_.FullName }
```

Expected: seven verified module snapshots, each exported count equal to its named module's page count, unique IDs equal to that count, no missing topic or option array. If a module was recaptured, audit the extra file but select one verified snapshot for its module; do not mistake two session IDs for two modules. Note any type-specific answer irregularity instead of silently normalizing it.

- [ ] **Step 3: Update and commit the inventory**

Add the seven module names, observed session IDs, counts, missing-analysis counts, and anomalies to `docs/data-audit.md`; run `git diff --check`, then stage only `docs/data-audit.md` and run `git commit -m "Record seven practice module inventory"`.

## Handoff to subsequent plans

After all seven captures pass count and shape checks, write a separate normalization/content plan using the observed schema, then a separate private PWA/sync plan using the normalized dataset. The already approved design document remains the scope contract. If any module fails the capture gate, report the exact failed module and stop data-dependent implementation until an official export or another authorized source is available.
