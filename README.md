# 个人练习室

私有考试练习网页，基于 Vinext、React、Cloudflare D1 与 IndexedDB。现有七个模块共 **1,224 道题**，支持练习、错题复习和三科模拟测试。面向 Windows、Android 浏览器及 macOS Safari，iPhone PWA 兼容目标为 **iOS Safari 15.4+**；这是网页/PWA，不是原生应用。

## 打开与首次使用

站点：[个人练习室](https://yunyue-exam-practice-20261029.yunyueyunyue317.chatgpt.site)。站点仅限所有者访问，首次请联网，用拥有该站点访问权限的 ChatGPT 账号登录。链接不是公开题库入口。

打开后会自动下载题库。桌面看到“已缓存 1224 道题”、手机看到模块和题目后，即可开始练习；手机可用模块下拉框和“题号”按钮跳转。若下载失败，联网后点击“重试下载”，必要时使用“重新登录”。

## 练习与模拟测试

- **练习与错题：** 单选、判断题点击选项后显示结果；多选、填空题确认后显示结果。答错进入错题本，之后答对自动移出。当前导入题库实际包含单选、多选和判断题，没有填空题。
- **模拟测试：** 教育教学知识与能力、职业素养、专业能力三科分别组卷，每场随机抽取 150 道不重复题，依次为判断题 15 道、单选题 90 道和多选题 45 道。每题 1 分，满分 150 分，限时 60 分钟，90 分及格。交卷前可修改答案，交卷后统一查看成绩、原站答案与解析；答错及未答题进入错题本。
- **本机试卷：** 试卷、答案与截止时间自动保存在本机，刷新可恢复；切换页面或进入后台仍会计时，到时交卷。仅保留当前或最近一场测试，不提供跨设备接续未交试卷。

原题 ID、选项和判分答案保持原站内容。现有原站解析 738 条、补充有来源解析 316 条，仍有 170 道科学素养题显示“待核实”。原站答案有疑点时在解析中说明，不静默修改判分；详见 [题库核验记录](docs/data-audit.md) 与 [解析核验记录](docs/explanation-review.md)。

## 安装到手机或桌面

安装前先在浏览器联网打开站点并登录。菜单名称可能随系统版本变化。

- **iPhone：** 用 Safari 打开站点，点“分享 → 添加到主屏幕 → 添加”，再从主屏幕图标打开。
- **Mac：** macOS Sonoma 14 或更新版本可在 Safari 选择“文件 → 添加到程序坞”；没有该选项时，仍可直接在 Safari 使用网页。参见 [Apple 网页 App 说明](https://support.apple.com/en-ca/104996)。
- **Android：** 在支持安装的浏览器菜单选择“安装应用”或“添加到主屏幕”，再从桌面图标打开。

Safari 网页与主屏幕/程序坞安装版应按独立的 IndexedDB 本地存储使用，不能依赖它们自动共享题库、练习记录或试卷。**安装版首次打开也要单独联网登录、下载题库并同步记录**。未交试卷保留在创建它的原浏览器或安装版中；请回到原入口继续，安装不会搬走该试卷。

## 离线保存与同步

首次联网完成题库下载及页面缓存后，可以在原入口离线练习和模拟测试。作答先存入 IndexedDB，联网后同步到当前账号；页面显示“离线练习”“待同步”“同步中”或“已同步”，联网时也可点击顶部状态手动同步。模拟测试的作答记录在交卷后进入同步流程，未交试卷不上传为可跨设备恢复的试卷。

“已保存到本机”不等于“已同步”。换设备或换入口前，请联网确认已同步；新入口首次仍需下载题库。同步失败会保留本地作答记录，恢复网络或登录后重试。清除网站数据会删除该入口的本地题库、未同步记录和试卷，请先完成交卷及同步。

## 开发与验证

需要 Node.js 22.13.0 或更新版本。本地主要命令：

~~~sh
npm run install:ci
npm run dev
npx tsc --noEmit --incremental false
npm run build
npm start
~~~

dev 启动本地开发服务；start 仅预览已构建的 Worker，不会部署站点。本地 D1 迁移与模拟登录方式见下方框架说明。本地预览不复现托管站点的私有访问网关。

自动化检查：

~~~sh
node --test lib/exam-session.test.mjs lib/wrong-book.test.mjs lib/offline-events.test.mjs tools/normalize-question-bank.test.mjs
node --experimental-vm-modules --test tools/export-all-modules-console.test.mjs
~~~

题库归一化：`node tools/normalize-question-bank.mjs --supplements data/supplements`。原始快照和导入文件位于 Git 忽略的 `data/raw/`；解析补丁位于 `data/supplements/`。原始与归一化题库不进入 Git 或公开静态资源，通过私有题库接口单独导入。

历史本地核验覆盖真实题库、错题流转、100 题模拟测试、服务断开后练习及恢复同步，详见 [核验记录](docs/verification.md)。**尚未完成真实 iPhone/macOS Safari 的安装、登录、离线重开与同步验收，也未完成真实 Android 安装及双设备验收。** Safari 构建目标和安装说明不能代替 Apple 设备测试；iOS 15.4+ 的完整体验仍需实机或相应模拟器确认。

以下保留 Sites 框架的运行、权限与发布说明。

## Private exam bank access

This application is configured for the owner-private Sites project `appgprj_6ae2c87a2d5081918984430d6c2d1bc5`. Keep its audience owner-private. Both `GET /api/bank` and `POST /api/bank` serve the shared question bank and rely on the Sites gateway to authorize owner browser sessions or Site service access. The application does not create an additional import key or require visitor identity on these shared endpoints, because Sites service access does not inject a visitor identity.

`/api/sync` separately requires ChatGPT user identity and restricts answer records to that user. Changing the Site audience requires reviewing the bank endpoints first; the application must not be published publicly with this shared-update policy. Local development does not reproduce the hosted private gateway.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git and `tar` (including Windows `tar.exe`) are required for publishing; portable publication does not require Bash

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

Publish archives outside the source checkout or under its ignored `outputs/` directory. Local `.env*`, `.dev.vars*`, TypeScript build state, and tool runtime directories are ignored; keep the hosting manifest, migrations, and authored scripts in source control.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For managed Linux browser QA, follow the Sites skill's managed preview reference. The daemon runs the project's Vite dev script with `--host 0.0.0.0 --port 4173 --strictPort`; use the CLI's returned URL. The ignored local profile survives the daemon's cleared environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `worker/index.ts` is the production Worker entrypoint and preserves request-scoped connector bindings
- `scripts/vite/` contains the maintained Vite integrations and the vendored Sites plugin license
- `scripts/connector-preview/` contains the local connector preview Worker and session helpers
- the remaining `scripts/` files select execution profiles and run installation, development, and builds; the plugin's helpers orchestrate the Sites lifecycle
- `dist/` contains generated deployment output; `.vinext/`, `.wrangler/`, and `.sites-runtime/` contain ignored local tool state
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
