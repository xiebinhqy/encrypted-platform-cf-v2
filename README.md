# 🔐 Encrypted Notes v2 — 端对端加密私人笔记

> **真正属于你的加密笔记空间，数据在浏览器加密，服务器只存密文，任何人都无法读取你的笔记内容。**

[![Deployed on Cloudflare Workers](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Workers-f38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://www.docker.com/)
[![Encryption](https://img.shields.io/badge/Encryption-AES--256--GCM-blue)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## 📋 目录

- [项目特色](#-项目特色)
- [技术架构](#-技术架构)
- [加密原理](#-加密原理)
- [功能特性](#-功能特性)
- [快速体验](#-快速体验)
- [部署方式](#-部署方式)
- [目录结构](#-目录结构)
- [性能指标](#-性能指标)
- [安全审计](#-安全审计)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)

---

## ✨ 项目特色

### 🛡️ 军工级端对端加密

所有笔记内容在**浏览器本地完成加密**，加密后的密文才上传到服务器。服务器仅作为加密数据的存储容器，**即使服务器被攻破、数据库被拖库，攻击者也看不到任何笔记内容**。

| 对比项 | 普通笔记应用 | Encrypted Notes v2 |
|--------|-------------|-------------------|
| 服务器是否可读内容 | ✅ 可以 | ❌ 完全不可读 |
| 数据加密方式 | TLS 传输加密 | 端对端 AES-256-GCM |
| 解密密钥存储位置 | 服务器数据库 | 仅在用户浏览器内存中 |
| 服务商能否查看 | 可以 | 绝对不行 |

### 🔑 三层密码体系

1. **登录密码** — 注册/登录验证，服务端只存 SHA-256 hash
2. **解密密码** — AES-GCM 加解密笔记内容，仅在浏览器内存中
3. **锁屏密码** — Ctrl+L 锁定/解锁，独立于解密密码

### 🎯 一次性恢复码

主密钥丢失时，可通过注册时生成的一次性恢复码重置，**每个恢复码仅能使用一次**，确保安全。

### 📦 数据自由 — 导入导出

支持**密文导出**和**明文导出**两种模式，数据始终掌握在自己手中。

### 🐳 双部署方案

- **Cloudflare Workers** — 线上服务，全球 CDN
- **Docker 本地部署** — 本地容器化运行，数据完全离线

---

## 🏗 技术架构

### Cloudflare Workers 架构

```
用户浏览器 → Cloudflare Workers → D1 (SQLite)
```

### Docker 架构

```
用户浏览器 → Docker 容器 → Node.js + Express → SQLite (持久化卷)
```

### 技术栈

| 层级 | Cloudflare 部署 | Docker 部署 |
|------|-----------------|-------------|
| 前端 | 原生 JS + Tailwind CSS + Web Crypto API | 同左 |
| 后端 | Cloudflare Workers + D1 | Node.js + Express + better-sqlite3 |
| 部署 | Wrangler CLI | Docker Compose + GitHub Actions CI/CD |

---

## 🔒 加密原理

```
用户输入主密钥
  │
  ▼
PBKDF2 密钥派生 (100000 次迭代)
  │
  ├──▶ getKeyHash() ──▶ SHA-256 ──▶ 服务器身份标识 (public_key)
  │
  └──▶ getKey() ──▶ AES-GCM 密钥 ──▶ 加密/解密笔记内容

加密：明文笔记 ──▶ AES-GCM ──▶ 密文 ──▶ HTTPS ──▶ 服务器
解密：密文 ◀── HTTPS ◀── 服务器 ◀── AES-GCM ◀── 主密钥
```

### 关键点
1. **服务器永远不存储主密钥**，只存 SHA-256 哈希
2. **加密和解密完全在浏览器端**使用 Web Crypto API
3. **Docker 部署也不改变加密体系**

---

## 🎨 功能特性

### ✅ 已完成功能

- [x] **用户认证系统** — 主密钥登录/注册
- [x] **笔记 CRUD** — 创建、编辑、删除、保存笔记
- [x] **Markdown 支持** — 笔记内容支持 Markdown 语法
- [x] **分类管理** — 创建、编辑、删除笔记分类
- [x] **标签系统** — 为笔记添加标签，按标签筛选
- [x] **笔记置顶** — 重要笔记置顶显示
- [x] **排序功能** — 按更新时间、创建时间、标题、修改次数排序
- [x] **回收站** — 删除的笔记可在 30 天内恢复
- [x] **草稿系统** — 未保存的内容自动保存为草稿
- [x] **仪表盘** — 数据总览、最近更新笔记
- [x] **知识库视图** — 飞书同款知识库浏览体验
- [x] **笔记分享** — 生成分享链接，支持过期时间和次数限制
- [x] **三层密码体系** — 登录/解密/锁屏密码分离
- [x] **恢复码重置** — 忘记密码可通过恢复码重置
- [x] **一键导入导出** — 明文/密文两种模式
- [x] **闲置自动锁定** — 防止他人使用已登录的设备
- [x] **响应式布局** — 桌面端三列布局，移动端底部导航
- [x] **暗色/亮色双主题** — CSS变量体系，一键切换
- [x] **Docker 本地部署** — Docker Compose + CI/CD 自动构建

### 🔧 开发中

- [ ] Docker 全功能集成测试验证
- [ ] Windows Electron 桌面化
- [ ] 笔记版本历史
- [ ] 全文搜索
- [ ] 批量操作

---

## 🚀 快速体验

### 在线体验

访问 **[https://notes.dee.us.kg](https://notes.dee.us.kg)** 立即使用。

> 输入任意密码（至少 8 位）即可创建你的加密空间。

### Docker 本地运行

```bash
# 1. 克隆仓库
git clone https://github.com/你的用户名/encrypted-notes-v2.git
cd encrypted-notes-v2

# 2. 一键启动（Windows）
start-docker.bat

# 3. 或手动启动
docker compose up -d

# 4. 访问 http://localhost:3000
```

### Workers 本地开发

```bash
cd backend
npm install
npx wrangler dev --port 8787
```

访问 `http://localhost:8787`。

---

## 📖 部署方式

完整的部署指南请参见 [docs/部署指南.md](docs/部署指南.md)，包含：

| 方案 | 适用场景 | 文档 |
|------|---------|------|
| **Cloudflare Workers** | 线上服务 | [docs/部署指南.md](docs/部署指南.md) |
| **Docker 本地部署** | 本地/内网使用 | [docs/部署指南.md](docs/部署指南.md) |
| **Docker + Windows 桌面化** | 个人桌面使用 | [docs/docker-windows-deployment-guide.md](docs/docker-windows-deployment-guide.md) |

---

## 📁 目录结构

```
encrypted-notes-v2/
├── backend/                       # 后端 API
│   ├── src/                       # 源代码
│   │   ├── config/               # 配置（database.js + database.docker.js）
│   │   ├── middleware/           # 中间件（CORS、认证、限流）
│   │   ├── routes/               # 路由层
│   │   ├── services/             # 业务逻辑层
│   │   └── utils/                # 工具函数
│   ├── docker/                   # Docker 适配层
│   ├── migrations/               # 数据库迁移脚本
│   ├── server.js                 # Docker/Node.js 入口
│   ├── wrangler.toml             # Cloudflare 配置
│   └── package.json              # Node.js 依赖
├── frontend/
│   ├── shared/                   # 共享核心代码（⚠️ 禁止修改加密逻辑）
│   │   ├── crypto/               # 加密核心（AES-GCM + PBKDF2）
│   │   └── api/                  # API 调用层
│   ├── classic/                  # 经典版 UI
│   └── modern/                   # 现代版 UI（开发重心）
├── docs/                         # 项目文档
│   ├── 项目上下文.md             # 全局上下文入口
│   ├── 执行计划.md               # 当前阶段执行计划
│   ├── BUG日志.md                # BUG 追踪
│   ├── 部署指南.md               # 部署文档
│   └── history/                  # 文档历史版本（永久保留）
├── Dockerfile                    # Docker 镜像构建
├── docker-compose.yml            # Docker Compose 编排
├── start-docker.bat              # Windows 一键启动
├── .env.example                  # 环境变量模板
└── README.md                     # 项目介绍（本文件）
```

---

## 📊 性能指标

| 场景 | 性能表现 |
|------|---------|
| **100+ 笔记** | 即时加载，无感知延迟 |
| **500+ 笔记** | 首次加载 < 2s，操作流畅 |
| **1000+ 笔记** | 首次加载 < 3s，需开启懒加载优化 |

**优化策略**：
- ✅ 内容按需解密（打开笔记时才解密内容）
- ✅ 并行请求（分类和笔记同时加载）
- ✅ 内存管理（解密后释放密文）
- ✅ 虚拟滚动（DOM 按需渲染）
- ✅ 乐观更新（保存后即时 UI 更新，不等后端响应）

---

## 🔍 安全审计

### 已知安全特性

- **所有笔记内容**使用 AES-256-GCM 加密，密钥由 PBKDF2 从主密钥派生
- **主密钥**仅存在于用户的浏览器内存中
- **服务器**仅存储加密后的密文和密钥哈希
- **三层密码分离**：登录/解密/锁屏各司其职
- **分享链接**支持设置过期时间和最大查看次数
- **闲置自动锁定**防止未授权访问
- **恢复码一次性使用**，用后即失效
- **Docker 部署不改变加密体系**，所有逻辑前端不变

### 安全最佳实践

1. 使用 **强密码**（建议 12 位以上，包含大小写字母、数字和特殊字符）
2. 注册时 **立即保存恢复码** 到安全的地方
3. 定期 **导出密文备份** 你的笔记数据
4. 使用完毕后 **退出登录**，尤其是在公共设备上

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出新功能建议！

### 开发流程

```bash
# 1. Fork 本仓库
# 2. 创建特性分支
git checkout -b feature/你的特性

# 3. 提交更改
git commit -m "描述你的更改"

# 4. 推送到 Fork
git push origin feature/你的特性

# 5. 创建 Pull Request
```

### 注意事项

- ⚠️ **绝对不要修改** `frontend/shared/crypto/` 目录下的任何加密代码
- 贡献新功能时请保持向后兼容
- 编写清晰的 commit message

---

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE)。

---

## 📬 联系

- **项目维护者**：deattorxb@gmail.com
- **GitHub Issues**：[提交问题](https://github.com/你的用户名/encrypted-notes-v2/issues)

---

> **Encrypted Notes v2** — 你的笔记，只有你能看。