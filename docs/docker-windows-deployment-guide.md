# 🐳 Docker + 🪟 Windows 桌面化部署指南

> **基于 Encrypted Notes v2 的本地化部署方案**
> **适用阶段：** 阶段二测试完成，进入阶段三"本地化部署"
> **最后更新：** 2026-06-23

---

## 📋 目录

- [一、架构分析：为什么要迁移](#一架构分析为什么要迁移)
- [二、Docker 部署方案（第一阶段）](#二docker-部署方案第一阶段)
- [三、Windows 桌面程序方案（第二阶段）](#三windows-桌面程序方案第二阶段)
- [四、数据库迁移策略](#四数据库迁移策略)
- [五、安全注意事项](#五安全注意事项)
- [六、常见问题排查](#六常见问题排查)
- [七、阶段三升级路线图](#七阶段三升级路线图)

---

## 一、架构分析：为什么要迁移

### 当前架构（Cloudflare Workers）

```
用户浏览器 → Cloudflare Workers (Serverless) → D1 (SQLite)
                  ↑                                    ↑
            需改造的部分                          需替换的部分
```

### 迁移后的架构（Docker）

```
用户浏览器 → Nginx (静态文件)         → Node.js API 服务 → SQLite 文件
               │                              │
               └──── 反向代理 ────────────────┘
```

### 需要改造的组件

| 组件 | 当前技术 | Docker 方案 | 改造难度 |
|------|---------|-------------|---------|
| **后端运行时** | Cloudflare Workers (Service Worker API) | Node.js + Express/Koa | ⭐⭐⭐ 中等 |
| **数据库** | Cloudflare D1 (Workers 绑定) | better-sqlite3 (文件型 SQLite) | ⭐⭐ 简单 |
| **环境变量** | wrangler.toml + .dev.vars | .env 文件 | ⭐ 极简 |
| **静态文件** | Workers Assets 绑定 | Nginx 或 Express 静态目录 | ⭐ 极简 |
| **部署方式** | wrangler CLI deploy | Docker Compose | ⭐⭐ 简单 |

---

## 二、Docker 部署方案（第一阶段）

### 2.1 核心改造思路

将 Cloudflare Workers 后端改为标准的 Node.js Express 服务，这是最关键的步骤。

#### 需要修改的核心文件

```
backend/
├── src/
│   ├── index.js           # ⚠️ 需改造：Workers fetch handler → Express app
│   ├── config/
│   │   └── database.js    # ⚠️ 需改造：D1 binding → better-sqlite3
│   ├── middleware/
│   │   ├── auth.js        # ✅ 无需大改：JWT 逻辑通用
│   │   ├── cors.js        # ✅ 无需大改：CORS 逻辑通用
│   │   └── rateLimit.js   # ⚠️ 需调整：移除 CF Rate Limiting API
│   ├── routes/            # ✅ 无需大改：路由逻辑通用
│   ├── services/          # ✅ 无需大改：业务逻辑通用
│   └── utils/             # ✅ 无需大改：工具函数通用
├── migrations/            # ✅ 可直接复用
└── package.json           # ⚠️ 需修改：添加 Express 依赖
```

### 2.2 详细改造步骤

#### 步骤 1：重构后端入口文件

创建 `backend/server.js` 作为 Docker 版入口：

```javascript
// backend/server.js — Docker 版入口文件
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 中间件 ==========
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// 静态文件服务（前端）
app.use(express.static(path.join(__dirname, '../frontend/modern')));

// ========== 路由挂载 ==========
app.use('/api/user', require('./routes/user.routes'));
app.use('/api/notes', require('./routes/note.routes'));
app.use('/api/categories', require('./routes/category.routes'));
app.use('/api/share', require('./routes/share.routes'));
app.use('/api/settings', require('./routes/settings.routes'));
app.use('/api/events', require('./routes/event.routes'));

// ========== SPA 回退 ==========
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/modern/index.html'));
});

// ========== 错误处理 ==========
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ========== 启动服务 ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Encrypted Notes 服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`📝 环境: ${process.env.NODE_ENV || 'development'}`);
});
```

#### 步骤 2：重写数据库配置

创建 `backend/src/config/database.docker.js`：

```javascript
// backend/src/config/database.docker.js — Docker 版数据库
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DockerDatabase {
  constructor() {
    this.dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/notes.db');
    
    // 确保数据目录存在
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');  // 启用 WAL 模式提升并发性能
    this.db.pragma('foreign_keys = ON');
    
    console.log(`📦 数据库路径: ${this.dbPath}`);
    this.runMigrations();
  }

  runMigrations() {
    const migrationsDir = path.join(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      this.db.exec(sql);
      console.log(`  ✅ 迁移执行: ${file}`);
    }
    
    console.log('🎉 数据库迁移完成');
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}

module.exports = new DockerDatabase();
```

#### 步骤 3：创建 Docker 配置文件

**Dockerfile**（项目根目录）：

```dockerfile
# backend/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖
COPY backend/package*.json ./
RUN npm install --production

# 生产镜像
FROM node:20-alpine

RUN apk add --no-cache tini

WORKDIR /app

# 复制后端代码
COPY --from=builder /app/node_modules ./node_modules
COPY backend/ .

# 复制前端静态文件
COPY frontend/ ./frontend/

# 创建数据目录
RUN mkdir -p /app/data

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

**docker-compose.yml**（项目根目录）：

```yaml
version: '3.8'

services:
  encrypted-notes:
    build:
      context: .
      dockerfile: backend/Dockerfile
    container_name: encrypted-notes
    ports:
      - "3000:3000"
    volumes:
      # 持久化 SQLite 数据
      - notes-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/notes.db
      - JWT_SECRET=${JWT_SECRET:-change-this-to-a-random-secret}
      - CORS_ORIGIN=*
      - ALLOW_PUBLIC_REGISTRATION=true
      - PBKDF2_ITERATIONS=100000
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  notes-data:
    driver: local
```

**.env.example**（项目根目录）：

```env
# 数据库路径
DB_PATH=./data/notes.db

# JWT 密钥（必须修改！）
JWT_SECRET=your-random-secret-key-here-change-it

# 服务端口
PORT=3000

# CORS 来源
CORS_ORIGIN=*

# 是否允许公开注册
ALLOW_PUBLIC_REGISTRATION=true

# PBKDF2 迭代次数
PBKDF2_ITERATIONS=100000
```

#### 步骤 4：创建健康检查路由

在 `backend/src/routes/` 下添加 `health.routes.js`：

```javascript
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;
```

并在 `server.js` 中挂载：
```javascript
app.use('/api/health', require('./routes/health.routes'));
```

### 2.3 一键启动脚本

创建 `start-docker.bat`（Windows 用户专用）：

```batch
@echo off
REM start-docker.bat — Windows 下一键启动

echo ====================================
echo  🔐 Encrypted Notes v2 — Docker 启动
echo ====================================

REM 检查 Docker 是否安装
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Docker，请先安装 Docker Desktop
    echo 下载地址: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

REM 检查 .env 文件
if not exist .env (
    if exist .env.example (
        copy .env.example .env
        echo [⚠] 已从 .env.example 创建 .env 文件，请修改 JWT_SECRET
    )
)

REM 构建并启动
echo [*] 正在构建 Docker 镜像...
docker compose build

echo [*] 正在启动服务...
docker compose up -d

echo.
echo ✅ 服务已启动！
echo 🌐 访问地址: http://localhost:3000
echo 📖 查看日志: docker compose logs -f
echo ⏹  停止服务: docker compose down
echo.
```

创建 `start-docker.sh`（Linux/Mac 用户专用）：

```bash
#!/bin/bash
# start-docker.sh — Linux/Mac 下一键启动

echo "===================================="
echo " 🔐 Encrypted Notes v2 — Docker 启动"
echo "===================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "[错误] 未检测到 Docker，请先安装"
    exit 1
fi

# 检查 .env
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "[⚠] 已创建 .env 文件，请修改 JWT_SECRET"
    fi
fi

# 构建并启动
echo "[*] 正在构建 Docker 镜像..."
docker compose build

echo "[*] 正在启动服务..."
docker compose up -d

echo ""
echo "✅ 服务已启动！"
echo "🌐 访问地址: http://localhost:3000"
echo "📖 查看日志: docker compose logs -f"
echo "⏹  停止服务: docker compose down"
echo ""
```

## 三、Windows 桌面程序方案（第二阶段）

### 3.1 技术选型：Electron

使用 **Electron** 将 Web 应用封装为 Windows 桌面程序。

#### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **Electron** | 生态成熟，社区庞大，文档丰富 | 包体积较大 (~120MB) | ⭐⭐⭐⭐⭐ |
| **Tauri** | 包体积小 (~5MB)，性能好 | Rust 学习成本，生态较小 | ⭐⭐⭐ |
| **NW.js** | Node 集成好 | 更新慢，社区小 | ⭐⭐ |

### 3.2 Electron 项目结构

```
electron-app/
├── main/                    # 主进程
│   ├── main.js              # Electron 入口
│   ├── menu.js              # 菜单配置
│   ├── tray.js              # 系统托盘
│   └── auto-updater.js      # 自动更新
│
├── renderer/                # 渲染进程（复用前端代码）
│   └── (指向 frontend/modern/ 的软链接或复制)
│
├── server/                  # 嵌入式后端
│   ├── index.js             # Express 服务启动
│   └── (指向 backend/ 的软链接或复制)
│
├── build/                   # 构建脚本
│   ├── installer.nsh        # NSIS 安装器配置
│   └── icons/               # 应用图标
│
├── package.json
└── electron-builder.yml     # 打包配置
```

### 3.3 详细实现

#### 步骤 1：初始化 Electron 项目

```bash
# 在项目根目录创建 electron-app 目录
mkdir electron-app
cd electron-app

# 初始化 package.json
npm init -y

# 安装依赖
npm install electron electron-builder --save-dev
npm install express better-sqlite3 cors --save
```

#### 步骤 2：主进程代码

```javascript
// electron-app/main/main.js
const { app, BrowserWindow, Menu, Tray, dialog } = require('electron');
const path = require('path');
const { startServer } = require('../server/index');

let mainWindow = null;
let serverInstance = null;
let tray = null;

// ========== 启动嵌入式后端 ==========
async function startBackendServer() {
  try {
    serverInstance = await startServer({
      port: 0,  // 随机端口，避免端口冲突
      dbPath: path.join(app.getPath('userData'), 'notes.db'),
    });
    console.log(`✅ 后端服务已启动, 端口: ${serverInstance.port}`);
    return serverInstance;
  } catch (err) {
    console.error('❌ 后端启动失败:', err);
    dialog.showErrorBox('启动失败', `后端服务启动失败: ${err.message}`);
    app.quit();
  }
}

// ========== 创建主窗口 ==========
function createMainWindow(serverPort) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../build/icons/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  // 加载前端页面（通过本地后端服务）
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 关闭窗口时隐藏到托盘（而非退出）
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ========== 创建系统托盘 ==========
function createTray() {
  tray = new Tray(path.join(__dirname, '../build/icons/tray-icon.png'));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '打开笔记', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Encrypted Notes');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow.show());
}

// ========== 应用生命周期 ==========
app.whenReady().then(async () => {
  const server = await startBackendServer();
  
  createMainWindow(server.port);
  createTray();
  
  // macOS: 点击 Dock 图标显示窗口
  app.on('activate', () => {
    if (mainWindow) mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  // macOS: 通常不退出
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (serverInstance) {
    serverInstance.close();
  }
});
```

#### 步骤 3：嵌入式后端启动脚本

```javascript
// electron-app/server/index.js
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * 启动嵌入式后端服务
 * @param {Object} options
 * @param {number} options.port - 端口号（0=随机）
 * @param {string} options.dbPath - 数据库文件路径
 * @returns {Promise<{server, port}>}
 */
async function startServer(options = {}) {
  const app = express();
  const port = options.port || 0;
  const dbPath = options.dbPath || path.join(__dirname, '../../data/notes.db');

  // ========== 中间件 ==========
  app.use(require('cors')({ origin: '*' }));
  app.use(express.json({ limit: '10mb' }));

  // ========== 数据库初始化 ==========
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 执行迁移
  runMigrations(db);

  // ========== 注入数据库到 req ==========
  app.use((req, res, next) => {
    req.db = db;
    req.env = {
      JWT_SECRET: process.env.JWT_SECRET || 'electron-app-secret-key',
      PBKDF2_ITERATIONS: 100000,
    };
    next();
  });

  // ========== 路由挂载 ==========
  // 将 backend/src/routes 下的路由适配到这里
  app.use('/api/user', require('../../backend/src/routes/user.routes'));
  app.use('/api/notes', require('../../backend/src/routes/note.routes'));
  app.use('/api/categories', require('../../backend/src/routes/category.routes'));
  app.use('/api/share', require('../../backend/src/routes/share.routes'));

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ========== 静态文件 ==========
  const frontendPath = path.join(__dirname, '../../frontend/modern');
  app.use(express.static(frontendPath));

  // SPA 回退
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  // ========== 错误处理 ==========
  app.use((err, req, res, next) => {
    console.error('[Server Error]', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  });

  // ========== 启动 ==========
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      console.log(`✅ 嵌入式服务启动成功: http://127.0.0.1:${actualPort}`);
      resolve({ server, port: actualPort });
    });
  });
}

function runMigrations(db) {
  const migrationsDir = path.join(__dirname, '../../backend/migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      try {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        db.exec(sql);
        console.log(`  ✅ 迁移: ${file}`);
      } catch (err) {
        console.warn(`  ⚠️  迁移跳过 ${file}: ${err.message}`);
      }
    }
    console.log('🎉 数据库初始化完成');
  }
}

module.exports = { startServer };
```

#### 步骤 4：打包配置

```yaml
# electron-app/electron-builder.yml
appId: com.encryptednotes.app
productName: Encrypted Notes
copyright: Copyright © 2026

directories:
  output: dist
  buildResources: build

files:
  - main/**/*
  - server/**/*
  - node_modules/**/*
  - "!node_modules/**/test/**"
  - "!node_modules/**/docs/**"

# 后端代码从主项目复制
extraResources:
  - from: ../backend/src
    to: backend/src
    filter:
      - "**/*"
      - "!**/node_modules/**"
  - from: ../backend/migrations
    to: backend/migrations
  - from: ../frontend/modern
    to: frontend/modern

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icons/icon.ico

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  installerIcon: build/icons/icon.ico
  uninstallerIcon: build/icons/icon.ico
  license: ../LICENSE
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Encrypted Notes
  installerSidebar: build/installer-sidebar.bmp

mac:
  target:
    - target: dmg
      arch:
        - x64
        - arm64
  icon: build/icons/icon.icns

linux:
  target:
    - target: AppImage
      arch:
        - x64
    - target: deb
      arch:
        - x64
  icon: build/icons
```

#### 步骤 5：构建脚本

创建 `electron-app/package.json`：

```json
{
  "name": "encrypted-notes-desktop",
  "version": "1.0.0",
  "description": "Encrypted Notes - Windows Desktop Application",
  "main": "main/main.js",
  "scripts": {
    "dev": "electron .",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux",
    "build:all": "electron-builder --win --mac --linux"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0"
  },
  "dependencies": {
    "express": "^4.18.0",
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5"
  }
}
```

### 3.4 Windows 安装程序制作

使用 `electron-builder` + NSIS 制作 Windows 安装包：

```bash
# 在 electron-app 目录下执行
cd electron-app

# 安装依赖
npm install

# 构建 Windows 安装程序
npm run build:win
```

构建完成后，会在 `electron-app/dist/` 目录下生成：
- `Encrypted Notes Setup 1.0.0.exe` — 安装程序
- `Encrypted Notes 1.0.0-win.zip` — 便携版（解压即可用）

#### 安装程序特性
- ✅ 自定义安装目录
- ✅ 创建桌面快捷方式
- ✅ 创建开始菜单快捷方式
- ✅ 支持静默安装 `/S`
- ✅ 自动卸载旧版本
- ✅ 应用图标

---

## 四、数据库迁移策略

### 4.1 从 Cloudflare D1 导出数据到本地 SQLite

```bash
# 1. 从 Cloudflare D1 导出数据
npx wrangler d1 execute notes-db --command="SELECT * FROM notes" --env production --json > notes_export.json

# 2. 导入到本地 SQLite（Node.js 脚本）
```

创建 `scripts/migrate-from-d1.js`：

```javascript
// scripts/migrate-from-d1.js
// 用途：将 Cloudflare D1 导出的 JSON 数据导入本地 SQLite
const Database = require('better-sqlite3');
const fs = require('fs');

const dbPath = process.argv[2] || './data/notes.db';
const exportFile = process.argv[3] || './notes_export.json';

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 读取导出数据
const data = JSON.parse(fs.readFileSync(exportFile, 'utf-8'));

// 导入笔记
const insertNote = db.prepare(`
  INSERT OR REPLACE INTO notes (id, user_id, title, content, category, tags, revision_count, is_pinned, deleted_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((notes) => {
  for (const note of notes) {
    insertNote.run(
      note.id, note.user_id, note.title, note.content,
      note.category, note.tags, note.revision_count,
      note.is_pinned, note.deleted_at, note.created_at, note.updated_at
    );
  }
});

insertMany(data);
console.log(`✅ 成功导入 ${data.length} 条笔记`);
```

---

## 五、安全注意事项

### ⚠️ 重要安全事项

1. **JWT 密钥**
   - Docker 部署：必须修改 `.env` 中的 `JWT_SECRET`
   - Windows 程序：自动生成随机密钥存储在本地
   - 线上部署：使用强随机字符串（至少 32 位）

2. **数据传输**
   - Docker 本地部署（`localhost`）：HTTP 可接受
   - Docker 远程部署：必须配置 HTTPS + 反向代理（Nginx/Caddy）

3. **数据库备份**
   - 定期备份 `data/notes.db` 文件
   - 使用应用内置的"导出"功能定期备份

4. **防火墙**
   - Docker 部署：如只需本地访问，将端口绑定到 `127.0.0.1`
   ```yaml
   # docker-compose.yml 修改
   ports:
     - "127.0.0.1:3000:3000"  # 仅本地可访问
   ```

5. **加密模块不变**
   - 所有加密逻辑（`frontend/shared/crypto/`）**完全不需要修改**
   - Docker 和 Windows 版本保持相同的加密体系

---

## 六、常见问题排查

### Q1: Docker 构建失败
**症状：** `docker compose build` 报错
**解决：**
```bash
# 检查 Docker 是否运行
docker info

# 清理 Docker 缓存后重试
docker compose build --no-cache

# 检查 Node.js 版本兼容性
node --version  # 需要 >= 18.x
```

### Q2: Windows 安装程序被杀毒软件拦截
**原因：** Electron 应用未签名
**解决：**
1. 购买代码签名证书（如 DigiCert、GlobalSign）
2. 在 `electron-builder.yml` 中配置证书：
```yaml
win:
  certificateFile: path/to/cert.pfx
  certificatePassword: your-password
```

### Q3: 数据库文件被锁定
**症状：** 启动时报 `SQLITE_BUSY`
**解决：**
```javascript
// 在 database.docker.js 中添加重试逻辑
this.db.pragma('busy_timeout = 5000');  // 等待 5 秒
```

### Q4: 端口被占用
**解决：**
```bash
# 查看端口占用
netstat -ano | findstr :3000

# 修改 PORT 环境变量
set PORT=3001
docker compose up -d -e PORT=3001
```

---

## 七、阶段三升级路线图

### 📊 实施优先级

```
第一阶段（当前）             第二阶段（1-2周）         第三阶段（3-4周）
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Docker 化部署    │    │  功能深化          │    │  多端同步          │
├─────────────────┤    ├──────────────────┤    ├──────────────────┤
│ ✅ Dockerfile    │    │ 🔄 搜索功能       │    │ 📡 多设备同步     │
│ ✅ Compose 配置  │    │ 🔄 批量操作       │    │ 🔄 冲突解决       │
│ ✅ 启动脚本      │    │ 🔄 版本历史       │    │ ☁️ WebDAV 备份   │
│ ✅ 数据持久化    │    │ 🔄 富文本编辑器    │    │ 🏢 私有化部署     │
└─────────────────┘    └──────────────────┘    └──────────────────┘

第四阶段（5-6周）             第五阶段（未来）
┌─────────────────┐    ┌──────────────────┐
│  安全增强        │    │  生态扩展          │
├─────────────────┤    ├──────────────────┤
│ 🔐 生物识别锁   │    │ 📱 移动端 App     │
│ 🔑 硬件密钥     │    │ 🔌 浏览器插件     │
│ 📋 安全审计日志  │    │ 🤖 AI 功能集成    │
└─────────────────┘    └──────────────────┘
```

### 具体实施计划

#### 第一阶段：Docker 化（1-3 天）
- [ ] 重构后端入口（Workers → Express）
- [ ] 替换数据库层（D1 binding → better-sqlite3）
- [ ] 创建 Dockerfile + docker-compose.yml
- [ ] 完善启动脚本（Windows/Linux）
- [ ] 测试：Docker 中完整功能回归

#### 第二阶段：功能深化（1-2 周）
- [ ] 全文搜索功能
- [ ] 笔记版本历史
- [ ] 批量操作（批量删除/移动/导出）
- [ ] 富文本编辑器

#### 第三阶段：Windows 桌面化（2-3 周）
- [ ] Electron 项目搭建
- [ ] 嵌入式后端服务
- [ ] 系统托盘 + 快捷键
- [ ] 自动更新机制
- [ ] 制作安装程序

#### 第四阶段：多端同步（3-4 周）
- [ ] 多设备同步协议设计
- [ ] WebDAV/Nextcloud 备份集成
- [ ] 冲突解决策略
- [ ] 同步状态 UI

---

## 🚀 快速开始（一句话总结）

### 如果你只需要 Docker：
```bash
# 1. 克隆项目
git clone <你的仓库>
cd encrypted-notes-v2

# 2. 修改 .env 中的 JWT_SECRET

# 3. 一键启动
docker compose up -d

# 4. 访问 http://localhost:3000
```

### 如果你需要 Windows 桌面版：
```bash
# 1. 进入 electron 目录
cd electron-app

# 2. 安装依赖
npm install

# 3. 构建安装包
npm run build:win

# 4. 运行 dist/ 目录下的安装程序
```

---

> **注意：** 本指南是架构性方案，具体实现时需根据实际代码结构调整。
> 建议先从 Docker 化开始，稳定后再推进 Windows 桌面化。

> **文档历史：** v1 (2026-06-23)