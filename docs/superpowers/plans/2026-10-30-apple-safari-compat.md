# Apple Safari Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing private PWA usable from macOS Safari and target iOS Safari 15.4+, document how to use it, publish the private Site, and push its source to the specified GitHub repository.

**Architecture:** Preserve the React/Vinext application, D1 API, IndexedDB stores, and service worker. Reduce the active page's CSS to its existing custom rules, set an explicit Safari 15.4 browser build target, and add Apple's web-app metadata. Explain the browser/installed-app storage boundary in the README.

**Tech Stack:** Vinext, Vite 8, React 19, Cloudflare Sites/D1, IndexedDB, CSS, Git.

## Global Constraints

- Target macOS Safari and iOS Safari 15.4+; this is a web/PWA deliverable, not a native app.
- Keep the existing Site owner-only and preserve answer, grading, bank, and sync behavior.
- Use the existing `README.md`, not a new `REMADE.md`.
- GitHub may receive the existing history and tracked explanation supplements; never add ignored raw-bank data or credentials.
- Do not claim Apple-device validation without a real Mac/iPhone or a matching simulator.

## File Map

- `app/globals.css`: remove unused modern Tailwind/animation/vendor imports while preserving the custom styles used by the app.
- `vite.config.ts`: set the browser build target to Safari/iOS 15.4, retaining default baseline targets for other browsers.
- `app/layout.tsx`: keep the authenticated manifest link, add Apple icon and standalone metadata, and remove the one unused Tailwind utility class.
- `components/exam-panel.tsx`: replace Android-only installation copy with concise Apple/Android instructions.
- `README.md`: explain the project, current features, login, usage, install, offline/sync, local development, privacy, and unverified Apple acceptance.
- `docs/verification.md`: append fresh verification results without rewriting historical sections.

---

### Task 1: Safari build and app metadata

**Files:** Modify `app/globals.css`, `vite.config.ts`, `app/layout.tsx`.

**Interfaces:** No new runtime interface. Existing manifest, service worker, APIs, and storage remain in place.

- [ ] **Step 1: Establish the current generated CSS and build baseline**

Run `npm run build` and record whether `dist/client/_next/static/css/*.css` contains `@property`, `oklch(`, or `color-mix(` from the unused Tailwind entry. Use `Get-ChildItem dist/client/_next/static/css -Filter *.css` and a literal text search. This is a build artifact check, not a substitute for Safari execution.

- [ ] **Step 2: Apply the narrow compatibility edit**

Remove only the first three `@import` lines from `app/globals.css`. In `vite.config.ts`, add `build: { target: ["chrome111", "edge111", "firefox114", "safari15.4", "ios15.4"] }` to the returned config. In `app/layout.tsx`, add `<link rel="apple-touch-icon" href="/icons/app-192.png" />`, `<meta name="apple-mobile-web-app-capable" content="yes" />`, and `<meta name="apple-mobile-web-app-title" content="个人练习室" />` beside the existing authenticated manifest link; remove `className="antialiased"` from `body` because `body` already has `-webkit-font-smoothing` in custom CSS. Retain the manifest `crossOrigin="use-credentials"` setting.

- [ ] **Step 3: Verify the edit and adjust only if evidence requires it**

Run `npx tsc --noEmit --incremental false`, `npm run build`, and `git diff --check`. Inspect the built CSS for remaining unsupported Tailwind output and inspect the built page's metadata. If the build rejects a target string, use the corresponding Vite/Oxc supported spelling and record the reason. If custom CSS still receives Tailwind output, remove the now-unused PostCSS plugin entry from `postcss.config.mjs` and rebuild; avoid unrelated dependency changes.

### Task 2: User instructions

**Files:** Modify `components/exam-panel.tsx`, `README.md`.

**Interfaces:** The displayed installation instructions describe the existing PWA only; no new UI state or API.

- [ ] **Step 1: Update the in-app installation sentence**

Replace the Android-only sentence in the exam introduction with short steps for iPhone Safari “分享 → 添加到主屏幕”, Mac Safari “文件 → 添加到程序坞”, and Android browser installation. Keep this as copy in the existing paragraph.

- [ ] **Step 2: Update the existing README**

At the top, explain the private 7-module, 1,224-question practice app and three 100-question timed mock exams; give the current private Site URL and sign-in/first-download steps. Document immediate feedback, wrong-book behavior, local save and sync status, Apple/Android installation steps, and the fact that Safari and an installed icon have separate IndexedDB storage. Explain that the installed copy needs its own first online login/download and that an unfinished exam stays in its original browser app. Keep the existing local development commands and owner-private bank access warning. Correct the stale Android “after publication” sentence and state Apple device checks remain outstanding.

- [ ] **Step 3: Verify text against source**

Compare the README to `app/page.tsx`, `components/exam-panel.tsx`, `lib/exam-session.ts`, `lib/question-bank.ts`, `lib/offline-events.ts`, `docs/data-audit.md`, and `docs/explanation-review.md`. Run `git diff --check`. Do not claim a platform was tested simply because its installation instructions are present.

### Task 3: Integration, publication, and evidence

**Files:** Modify `docs/verification.md`; commit all changed source/doc files.

**Interfaces:** The same commit must be pushed to the Sites source branch before an archive-backed deployment and pushed to the user-specified GitHub repository.

- [ ] **Step 1: Run fresh verification**

Run `node --test lib/exam-session.test.mjs lib/wrong-book.test.mjs lib/offline-events.test.mjs tools/normalize-question-bank.test.mjs`; run `node --experimental-vm-modules --test tools/export-all-modules-console.test.mjs`; run `npx tsc --noEmit --incremental false`, `npm run build`, and `git diff --check`. Use available local browser QA if possible. Record exactly what was tested and which Apple device checks remain pending in `docs/verification.md`.

- [ ] **Step 2: Review and commit**

Check `git status --short`, `git diff --stat`, changed content, and tracked data paths. Ensure ignored `data/raw/`, local runtime files, and credentials are absent. Commit the focused changes on `codex/apple-safari-compat`.

- [ ] **Step 3: Update the existing private Site**

Use its existing `project_id` from `.openai/hosting.json`, confirm access with Sites `get_site`, obtain source write access, synchronize the exact committed source, package the build using the Sites source helper, and deploy a saved version. Verify the returned deployment status and owner-only audience. Do not alter the site's access policy.

- [ ] **Step 4: Push the specified GitHub repository**

Verify the destination remains empty, then push the completed history to `https://github.com/chenyunyue/Shanghai-Training-Association-Test-Practice-Mini-Program.git` as its default branch. Confirm remote HEAD and the local commit match. If authentication is unavailable, report the exact blocker without claiming the push happened.

- [ ] **Step 5: Report the result**

State code/doc changes, tests/build and publication/push results, plus the precise unverified iOS 15.4/macOS Safari device flows. Cite only verified results.
