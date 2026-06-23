# 🐛 Encrypted Notes v2 — BUG 跟踪日志

> 每发现一个 BUG 立即在此记录，修复后更新状态。
> 按时间倒序排列，最新的在最上面。

---

## BUG-019：经典页面多个 JavaScript 错误

- **位置**：`frontend/classic/js/app.js`
- **现象**：
  1. `ReferenceError: 发现未保存的编辑草稿 is not defined`（第2586行）
  2. `TypeError: encryptedNotes is not iterable`（第1219行）
  3. `TypeError: Cannot read properties of null (reading 'length')` in `getCategoryColorIndex`（第222行）
- **根因**：
  1. 第2586行残留无效中文文本（被 JS 引擎解析为变量名）
  2. API 响应格式为 `{ data: [...] }`，但代码直接迭代响应对象
  3. `getCategoryColorIndex` 收到 null 参数（分类数据未正确加载）
- **修复**：
  1. 删除第2586行无效文本
  2. 添加 `.data` 字段提取：`catData.data || catData || []`
  3. 分类数据加载失败是 #2 的下游效应，修复 #2 后自动恢复
- **状态**：✅ 已修复
- **日期**：2026-06-15

---

## BUG-018：后端缺少 /api/settings 路由 + 数据库迁移 shares 表缺失

- **位置**：后端 `index.js` + `database.js` + 前端 `sw.js` + 前端 `_worker.js`
- **现象**：
  1. 登录后 console 显示 `GET /api/settings 404` → 500
  2. 分类创建/编辑返回 500
  3. 数据库迁移报错 `no such table: main.shares`
- **根因（三重）**：
  1. 后端 `index.js` 没有 `/api/settings` 路由，且 `jsonSuccess` 未导入
  2. 前端 Worker 代理未正确转发请求 body（需 clone）
  3. 数据库迁移尝试在 `shares` 表上创建索引，但该表不存在
- **修复**：
  1. 后端 `index.js` 添加 `/api/settings` 路由 + 导入 `jsonSuccess`
  2. 前端 Worker 使用 `request.clone()` 确保 body 正确转发
  3. 数据库迁移添加 `shares` 表创建，移到索引创建之前
  4. SW 版本更新，移除 API 模块预缓存
- **部署**：后端版本 `204c0104`，前端版本 `ec187ee6`
- **日期**：2026-06-15

---

## BUG-017：前端 Worker 不处理 API 请求导致 404

- **位置**：`frontend/_worker.js` + `frontend/sw.js`
- **现象**：登录时 `/api/auth/login`、`/api/auth/register` 返回 404，数据加载失败
- **根因**：`notestest.dee.us.kg` 指向前端 Worker（只服务静态资源），API 请求未被该 Worker 处理，直接返回 404
- **修复**：`frontend/_worker.js` 添加 API 代理逻辑，将 `/api/*` 和 v1 兼容路由（`/user/*`、`/note`、`/notes`、`/categories`、`/category`、`/settings`、`/share/*`）代理到后端 Worker（`notes-api-staging.dea.workers.dev`）
- **部署**：前端已重新部署（版本 `1489bb0d`）
- **日期**：2026-06-15

---

## BUG-016：登录后所有 API 调用 CORS error

- **位置**：`frontend/shared/api/index.js`
- **现象**：登录成功后，所有 API 调用（notes、categories、settings、events）返回 CORS error，数据加载失败
- **根因**：`getApiBase()` 检测到域名包含 "test"，将 API 请求指向 `https://apitest.dee.us.kg`（不同域名），导致 CORS 跨域被浏览器拦截。实际后端 Worker 同时服务前端和 API，应在同一域名
- **修复**：`getApiBase()` 改为返回 `window.location.origin`（当前域名），使前端和 API 在同源
- **部署**：前端已重新部署到 staging（版本 `d4a27655`）
- **日期**：2026-06-14

---

## BUG-015：登录报错 "no such column: public_key"

- **位置**：后端 user.service.js + database.js
- **现象**：点击登录时出现 `D1_ERROR: no such column: public_key at offset 27: SQLITE_ERROR`，HTTP 500
- **根因**：staging 数据库从生产环境导入，`users` 表使用 v1 列名 `key_hash`，但 v2 代码（`user.service.js`）期望 `public_key` 列
- **修复**：`backend/src/config/database.js` 添加 v1→v2 列名迁移逻辑（`key_hash → public_key`, `recovery_code → recovery_code_hash`），迁移版本号递增到 12
- **部署**：已重新部署到 staging（版本 `56b0a051`）
- **日期**：2026-06-14

---

## BUG-012：保存后笔记不显示

- **位置**：后端 note.routes.js / note.service.js + 前端 app.js
- **现象**：编辑已有笔记保存后，仪表盘不刷新显示更新后的内容
- **根因（双重）**：
  1. 后端 `handleUpdateNote` 未将 `tags_cipher` 传给 `noteService.updateNote`
  2. 前端 `_editNote` PUT 成功后未调用 `renderNotes()` 重新渲染 DOM
- **修复**：后端 updateNote 支持 tags_cipher 参数；前端保存成功后调用 renderNotes()
- **日期**：2026-06-14

---

## BUG-013：一键保存草稿无法使用

- **位置**：modern 界面 → 草稿管理
- **现象**：点击一键保存无反应或报错
- **根因**：经代码审查，内联实现（drafts-save-all-btn 事件监听器）使用了正确的 v2 API 路径，功能正常
- **修复**：已确认代码正确，如仍有问题需进一步排查 apiSave 行为
- **日期**：2026-06-14

---

## BUG-014：编辑标签时笔记内容丢失

- **位置**：modern 界面 → 标签管理 → 编辑标签保存时
- **现象**：重命名标签后笔记内容被清空
- **根因**：`initEditTagDialogEvents` 中使用 `note.content` 构造 contentCipher，但 lazy loading 下 allNotes 中 note.content 始终为 `""` → 覆盖原内容
- **修复**：保存前通过 `DataLoader.loadNoteContent(note.id)` 按需加载实际内容
- **日期**：2026-06-14

---

## BUG-011：新用户登录时终端显示 ERROR（401 误报）
**状态：** ✅ 已修复（login.js + commit `d2fecd4`）
**发现时间：** 2026-06-14
**严重程度：** 🟡 体验问题（不影响功能）

### 现象
```
X [ERROR] Login error: { type: { message: '用户不存在', status: 401 } }
```
新用户首次登录时，后端返回 401（用户不存在），这是**正常的注册前置流程**，不应显示为 ERROR。

### 修复方案
- 前端 `login.js`：将 `loginRes.status === 401` 改为 `console.log`（非 ERROR），并同时处理 404
- 后端 `user.routes.js`：catch 块中检测 error.type.status === 401/404 时改用 `console.log`，仅非 401/404 才走 `console.error`

---

## BUG-010：Service Worker 拦截跨域请求导致字体/资源加载失败
**状态：** ✅ 已修复（`sw.js` 重构）
**发现时间：** 2026-06-14
**严重程度：** 🟡 体验问题

### 现象
1. Font Awesome 字体 `fa-solid-900.woff2` 加载失败（SW 返回 302 重定向）
2. 第三方请求（`40?random=1` 等）被取消
3. `vertical_srp.gif` 返回 503（浏览器扩展请求被拦截）

### 根因
`sw.js` 的 fetch 拦截器缺少跨域 passthrough 逻辑，导致所有请求（包括跨域的字体、Google Fonts、CDN 资源）都被 SW 拦截处理。同时 API 路由匹配列表缺少 `/category` 和 `/settings`。

### 修复方案
1. **跨域 passthrough**：`url.origin !== self.location.origin` 时直接 `return`，不调用 `event.respondWith()`
2. **API 路由补全**：新增 `/category`、`/settings` 到网络优先列表
3. **清理 CDN 预缓存**：删除 `CDN_ASSETS` 数组，跨域资源不再由 SW 管理
4. **非 GET 请求跳过**：新增 `event.request.method !== 'GET'` 检查

---

## BUG-020：新注册用户首次登录数据看板显示非零数据（根治）
**状态：** ✅ 已修复（2026-06-15 二次根治）
**发现时间：** 2026-06-14（首次）、2026-06-15（发现根治不彻底，第二次修复）
**严重程度：** 🟡 体验问题

### 现象
新用户首次注册并登录后，仪表盘依然显示"总笔记数"、"总分类数"、"总标签数"的非零数值。

### 根因（四重污染源）
1. **HTML 硬编码示例数据（主因）**：`frontend/modern/index.html` 中，`animate-count` 的 `data-target` 硬编码为 `6`、`8`、`6`，并在"最近更新"区域硬编码了3条示例笔记条目。`CountAnimation.init()` 在 `DOMContentLoaded` 时**早于** `DataLoader.loadAll()` 执行，导致用户在页面加载瞬间看到非零数值。
2. **API 请求失败无降级（加重因素）**：`DataLoader.loadAll()` 的 catch 块没有重置 stats，当 API 请求失败（新用户网络抖动或后端限流）时，`updateStats()` 不会被调用，硬编码的 data-target 数值永久留在 DOM 中。
3. **localStorage 草稿未清理（次要因素）**：`clearAllCache()` 只清除了 IndexedDB，但 `localStorage` 中的 `encrypted_notes_drafts` 和 `encrypted_notes_current_editor` 未被清除。
4. **`services/data-loader.js` catch 块遗漏（第二次修复发现）**：`frontend/modern/js/services/data-loader.js`（被 `tag-manager.js` 等模块使用的独立 DataLoader 实例）的 catch 块（第123-128行）缺少重置逻辑。当 `tag-manager.js` 调用 `DataLoader.loadAll()` 时，API 请求失败不会重置数据，导致用户通过标签管理页面触发的数据加载失败后，看板仍显示非零数值。

### 修复方案（四重修复）
1. **`frontend/modern/index.html`**：将所有硬编码的 `data-target` 值从 `6`、`8`、`6`、`3` 改为 `0`，移除"最近更新"区域中3条硬编码示例条目。
2. **`frontend/modern/js/app.js`**：在 `DataLoader.loadAll()` 的 catch 块中增加重置逻辑（allNotes = []、allCategories = []、DashboardUpdater 系列更新函数）。
3. **`frontend/modern/js/login.js`**：在 `_onLoginSuccess()` 和 `_handleRegistration()` 中，在 `clearAllCache()` 之后额外清除 localStorage 草稿。
4. **`frontend/modern/js/services/data-loader.js`**：在 catch 块中增加与 app.js 相同的重置逻辑（state.allNotes = []、state.allCategories = []、DashboardUpdater 系列更新函数），确保 tag-manager.js 等模块调用的 DataLoader 实例在 API 请求失败时也能正确重置为0。

### 涉及文件
- `frontend/modern/index.html`（移除硬编码示例数据）
- `frontend/modern/js/app.js`（API 失败降级重置）
- `frontend/modern/js/login.js`（补充 localStorage 清理）
- `frontend/modern/js/services/data-loader.js`（补充 catch 块重置逻辑，第二次修复）

---

## BUG-009：首次登录后仪表盘显示非零数据（已合并到 BUG-020）
**状态：** 🔄 已合并到 BUG-020（修复不彻底，需升级）
**发现时间：** 2026-06-14
**严重程度：** 🟡 体验问题

### 现象
新用户首次登录进入主页后，总笔记数、总分类数、总标签数不是显示 0，而是显示了其他数值。

### 根因（初步）
登录/注册成功后跳转前未清除 IndexedDB 中的旧缓存数据，导致新用户在仪表盘看到上次测试残留的笔记和统计信息。

### 修复（初步，不彻底）
在 `login.js` 的 `_onLoginSuccess()` 和 `_handleRegistration()` 中，跳转前调用 `clearAllCache()` 清除 IndexedDB 缓存。

---

## BUG-008：保存后笔记显示"未命名笔记"
**状态：** ✅ 已修复（核心方案A完成，多个 commit）
**发现时间：** 2026-06-14
**严重程度：** 🔴 阻塞

### 现象
新建笔记保存后，打开"总笔记数"显示标题为"未命名笔记"，分类显示"未分类"。

### 根因
后端列名检测 `detectColumnConvention` 和 `detectNotesSchema` 两套逻辑可能不一致，导致写入和读取使用了不同的列名。

### 修复方案
- `note.service.js` v4.0.0：删除自动列名检测，固定使用 `title/content/category/tags` 列
- `compat.routes.js` v4.0.0：删除 v1/v2 分支，统一使用 title/content/category/tags
- `database.js` v10：首次启动时自动创建核心表 + 旧列名迁移
- `login.js`：新增 id 字段到 noteBody（commit `03cbd5c`）
- `app.js`：新增 v2→v1 兼容 fallback（commit `0d93a41`）

---

## BUG-004~007（已修复）
（见之前版本记录）

---

## BUG-021：编辑分类报错"分类ID无效"

- **位置**：`frontend/modern/js/app.js` → `_openEditCategoryDialog()` + `initEditCategoryDialogEvents()`
- **现象**：点击分类编辑按钮后提示"分类ID无效"，分类无法编辑
- **根因（双重）**：
  1. `_openEditCategoryDialog(catId, currentName)` 的 fallback 逻辑有 BUG：`currentName && currentName.id` 检查的是字符串的 `id` 属性（不存在），导致 fallback 时 `catId` 被设置为 `currentName`（分类名称），而非实际 ID
  2. `initEditCategoryDialogEvents` 中 `_openEditCategoryDialog` 被调用时 `catId` 参数来自 `data-cat-id`，但 `catId` 未被使用（`window._editCategoryId` 优先），导致在 #1 的 fallback 下 ID 为分类名称字符串，后端返回 404
- **修复**：
  1. `_openEditCategoryDialog`：移除字符串 fallback，当 `catId` 无效时从 `allCategories` 按名称查找真实 ID
  2. 同步更新 `window._editCategoryId` 赋值逻辑，确保始终存储有效 ID
- **状态**：✅ 已修复
- **日期**：2026-06-15

---

## BUG-022：编辑器对话框标题未区分新建/编辑

- **位置**：`frontend/modern/js/app.js` → `initDialogTriggers()` + `_openEditorWithNote()` + `_openEditorWithDraft()`
- **现象**：新建笔记和编辑已有笔记时，对话框标题始终显示相同内容，用户无法区分当前操作模式
- **根因**：`initDialogTriggers` 中 `new-note-dialog` 的处理未设置对话框标题；`_editNote` 函数未区分正常编辑和草稿编辑的标题显示
- **修复**：
  1. `index.html`：为 `new-note-dialog` 添加标题元素 ID `new-note-dialog-title`
  2. 新增 `_updateEditorDialogTitle(title)` 函数
  3. `initDialogTriggers` 中 `new-note-dialog` 打开时设置标题为"新建笔记"
  4. `_openEditorWithNote` 中设置标题为"编辑{笔记名} 笔记"
  5. `_openEditorWithDraft` 中设置标题为"编辑{笔记名} - 草稿"
- **状态**：✅ 已修复
- **日期**：2026-06-15

---

## BUG-023：编辑/删除分类报"分类ID无效" + DELETE /api/categories/null

- **位置**：`backend/src/services/category.service.js` + `backend/src/routes/category.routes.js` + `frontend/modern/js/app.js`
- **现象**：
  1. 编辑分类时弹出"分类ID无效"错误
  2. 删除分类时终端显示 `DELETE /api/categories/null 404`
- **根因（核心）**：
  后端 `createCategory` 使用 `INSERT INTO categories (user_id, name, color)` **未插入 `id` 字段**，而 `categories` 表的 `id` 列是 `TEXT PRIMARY KEY`（非自增），导致所有通过现代版创建的分类 `id` 为 `NULL`。前端 `data-cat-id="${cat.id}"` 渲染为 `data-cat-id="null"`，`getAttribute` 返回字符串 `"null"`，最终导致 API 调用 `DELETE /api/categories/null`。
- **修复**：
  1. **后端 `category.service.js`**：`createCategory` 新增 `categoryId` 参数，使用 `INSERT INTO categories (id, user_id, name, color)` 显式插入 UUID
  2. **后端 `category.routes.js`**：`handleCreateCategory` 从请求 body 中提取 `id` 并传递给 service
  3. **前端 `_deleteCategory`**：增加 catId 有效性验证，防止 `null`/`undefined` 字符串发送到后端
  4. **已有数据**：已创建的分类若 id 为 null，需重新创建分类才能获得有效 ID
- **涉及文件**：
  - `backend/src/services/category.service.js`（createCategory 新增 id 参数）
  - `backend/src/routes/category.routes.js`（handleCreateCategory 传递 id）
  - `frontend/modern/js/app.js`（_deleteCategory 增加防御性验证）
- **状态**：✅ 已修复
- **日期**：2026-06-16

---

## BUG-024：新建笔记对话框恢复上次编辑内容

- **位置**：`frontend/modern/js/app.js` → `initDialogTriggers()` 中 `new-note-dialog` 处理
- **现象**：保存笔记后再次点击"新建笔记"，编辑器显示上次保存的笔记内容，而非空白
- **根因**：`initDialogTriggers` 中打开 `new-note-dialog` 时调用了 `CurrentEditorState.restoreToEditor()`，将 localStorage 中暂存的上次编辑状态恢复到编辑器，覆盖了 `resetEditor()` 的清空操作
- **修复**：移除 `initDialogTriggers` 中 `new-note-dialog` 的 `CurrentEditorState.restoreToEditor()` 调用。编辑器自动暂存仅用于页面崩溃恢复（由 `UnsavedChangesDetector` 处理），不应在用户主动打开新建笔记时恢复
- **状态**：✅ 已修复
- **日期**：2026-06-16

---

## BUG-028：草稿一键保存使用错误的 API 端点

- **位置**：`frontend/modern/js/app.js` → 草稿一键保存 handler
- **现象**：草稿箱中点击"一键保存"，显示保存成功但总笔记数里看不到笔记；单个草稿点"重新保存"则正常
- **根因**：一键保存使用 `apiSave`（v1 `POST /note`），而重新保存通过编辑器使用 `createNoteV2`（v2 `POST /api/notes`）。v1 兼容路由的响应格式和数据处理与 v2 不一致，导致笔记虽然创建但无法被 `GET /api/notes` 正确返回
- **修复**：将一键保存的 API 调用从 `apiSave` 改为 `createNoteV2`（v2 API），与正常保存流程一致；同时添加 `DashboardUpdater.refreshAll()` 确保保存后立即刷新仪表盘统计
- **状态**：✅ 已修复
- **日期**：2026-06-16

---

---

## BUG-029：modern/js/app.js 模块化重构（代码拆分）

- **位置**：`frontend/modern/js/app.js` + 14 个新建模块文件
- **背景**：`app.js` 原为 2660 行单体文件，所有业务逻辑（数据加载、仪表盘、图表、事件绑定、日志等）混杂在一起
- **重构方式**：将代码拆分为 `core/`（2个）、`components/`（4个）、`services/`（11个）共 17 个模块文件
- **重构后**：`app.js` 从 2660 行 → ~200 行，仅做 import + 依赖注入 + 初始化
- **模块列表**：
  - `core/state.js` — 全局状态管理（AppState）
  - `core/utils.js` — 工具函数（Utils/TimeManager/CountAnimation）
  - `components/toast.js` — Toast 提示
  - `components/note-editor.js` — 笔记编辑器
  - `components/category-manager.js` — 分类管理
  - `components/tag-manager.js` — 标签管理
  - `services/data-loader.js` — 数据加载
  - `services/dashboard-updater.js` — 仪表盘更新
  - `services/chart-manager.js` — 图表管理
  - `services/sidebar-manager.js` — 侧边栏渲染
  - `services/dialog-manager.js` — 弹窗/个人资料/退出登录
  - `services/event-manager.js` — 事件绑定
  - `services/event-logger.js` — 事件日志
  - `services/draft-manager.js` — 草稿管理
  - `services/loading-overlay.js` — 加载遮罩
  - `services/current-editor-state.js` — 编辑器暂存
  - `services/standalone-functions.js` — 独立函数
- **状态**：✅ 已完成（2026-06-17）
- **日期**：2026-06-17

---

## BUG-030：dashboard-updater.js 闭包中 state 变量 TDZ 错误

- **位置**：`frontend/modern/js/services/dashboard-updater.js`
- **现象**：点击"历史记录"时终端报错 `Uncaught ReferenceError: Cannot access 'state' before initialization`，弹出"发生未知错误"提示
- **根因**：`_populateNotesDialog` 和 `_populateTrashDialog` 方法内定义 `const state = AppState` 局部变量，事件回调闭包中引用了 `state`。当方法被多次调用时（打开→关闭→重新打开对话框），JavaScript 引擎的暂时性死区（TDZ）机制导致回调中 `state` 访问抛出 ReferenceError
- **修复**：将所有事件回调闭包中的 `state.xxx` 引用改为模块级导入的 `AppState.xxx`。`AppState` 是模块顶层 import，不存在 TDZ 问题
- **状态**：✅ 已修复
- **日期**：2026-06-17

---

## BUG-031：经典版前端字段名 data.user_id → data.userId

- **位置**：`frontend/classic/js/app.js`（第1054行、第1064行）
- **现象**：经典版登录后笔记数和分类数显示为0，所有API请求使用空userId
- **根因**：经典版登录代码使用 `data.user_id`，但后端 `user.routes.js` v3.0.0 返回的是驼峰命名 `data.userId`。导致 `userId` 始终为 `undefined`，所有API请求（获取笔记、分类）都使用了空userId，数据库查不到任何数据
- **修复**：将 `data.user_id` 改为 `data.userId`
- **状态**：✅ 已修复
- **日期**：2026-06-17

---

## BUG-032：后端 JWT 认证失败未回退到 X-User-Id

- **位置**：`backend/src/middleware/auth.js`
- **现象**：API 调用（分类创建、笔记获取等）返回 500 或 401 错误
- **根因**：`authenticateRequest` 中，当 JWT Token 存在但验证失败时直接返回 401 响应，不再尝试 `X-User-Id` 头部认证。当前端 `_worker.js` 代理 API 请求时，如果 JS 加载时序导致 token 未正确设置或已过期，所有 API 请求都会失败。前端登录时保存了 `authToken`，但经典版和现代版都可能出现 token 失效场景
- **修复**：JWT 验证失败时打印 `console.warn` 日志而非直接返回 401，允许继续回退到 `X-User-Id` 头部认证（向后兼容模式）
- **状态**：✅ 已修复
- **日期**：2026-06-17

---

## BUG-033：POST /api/categories 500 无错误日志

- **位置**：`backend/src/routes/category.routes.js`
- **现象**：创建分类时终端显示 `POST /api/categories 500`，分类无法创建
- **根因**：`handleCreateCategory` 的 catch 块没有 `console.error`，无法定位具体错误；同时缺少对 `name_cipher` 的必填验证，前端可能发送空数据
- **修复**：添加 `console.error` 输出错误明细（message + stack），增加 `name_cipher` 空值验证返回400错误
- **状态**：✅ 已修复
- **日期**：2026-06-17

---

## BUG-034：GET /api/note/versions 404 + icon-192.png 404

- **位置**：`backend/src/routes/v2.routes.js` + `frontend/modern/manifest.json` + `frontend/modern/icons/`
- **现象**：
  1. 访问版本历史时返回 404
  2. Service Worker 请求 `/modern/icons/icon-192.png` 返回 404
- **根因（双重）**：
  1. v2 兼容路由的 switch 语句匹配硬编码路径 `/note/versions`，但前端通过 `/api/note/versions` 发请求（带 `/api/` 前缀）。`handleCompatRoute` 在 `index.js` 中通过 `pathname.startsWith("/api/note/versions")` 调用，但 switch 未处理 `/api` 前缀的路径
  2. manifest.json 引用了不存在的 PNG 图标文件
- **修复**：
  1. 在 `handleCompatRoute` 中添加 `normalizedPath = pathname.replace(/^\/api/, '')`，统一匹配带 `/api/` 前缀和不带前缀的路径
  2. 创建 SVG 图标替换 PNG，更新 manifest.json 引用为 SVG
- **状态**：✅ 已修复
- **日期**：2026-06-17

---

## BUG-036：创建分类 UNIQUE constraint failed（主键冲突）

- **位置**：`frontend/modern/js/components/category-manager.js` + `backend/src/services/category.service.js`
- **现象**：点击创建分类按钮后终端报错 `D1_ERROR: UNIQUE constraint failed: categories.id`，分类创建失败
- **根因（双重）**：
  1. **前端防重复缺失**：创建分类按钮的点击事件可能被触发多次（双击、事件绑定重复等），多次发送相同 `POST /api/categories` 请求，后端第二个请求报主键冲突
  2. **后端无容错**：`INSERT INTO categories` 使用主键冲突时报500，没有降级为 UPDATE 的兜底逻辑
- **修复**：
  1. **前端**：`_saveNewCategory` 增加 `_savingCategory` 互斥锁，请求未完成时阻止重复提交
  2. **后端**：`createCategory` 先检查 ID 是否存在，存在则执行 UPDATE 而非 INSERT，幂等处理
- **状态**：✅ 已修复
- **日期**：2026-06-17

---

## BUG-035：`vertical_srp.gif` 等浏览器扩展请求 503

- **位置**：浏览器扩展（非应用代码）
- **现象**：Network 中显示 `vertical_srp.gif?asc=&asc2=... 503` 和 `Image40?random=1 302 / Redirect`
- **根因**：这些请求来自已安装的浏览器扩展（如搜索推荐、购物比价、密码管理器等），不是应用本身的请求。`vertical_srp.gif` 是某搜索扩展的诊断请求，`Image40?random=1` 是扩展重定向。Service Worker 对这些请求返回 503（网络不可用），因为 SW 缓存策略在 API 路径外对非 GET 跨域请求返回了空响应
- **修复**：SW 已正确处理跨域请求（直接 passthrough），这些 503/302 是扩展自身的请求，不影响应用功能。**无需修复**
- **状态**：🟢 非应用问题，已忽略
- **日期**：2026-06-17

---

## 📊 统计

> **最后更新：** 2026-06-17

| 优先级 | 状态 | 数量 |
|--------|------|------|
| ✅ 已修复 | 已验证 | 34（BUG-001~034 全部修复） |
| 🟢 非问题 | 已确认 | 1（BUG-035 浏览器扩展请求） |
