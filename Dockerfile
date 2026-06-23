# ============================================
#  🔐 Encrypted Notes v2 — Docker 构建文件
#  多阶段构建优化镜像大小
#  
#  构建参数：
#    BUILD_VERSION - Git commit SHA（由 GitHub Actions 传入）
#    BUILD_DATE    - 构建时间
#  
#  构建方式：
#    docker build -t encrypted-notes-v2 .
# ============================================

# ---- 构建参数 ----
ARG BUILD_VERSION=unknown
ARG BUILD_DATE=unknown

# ---- 阶段一：安装依赖 ----
FROM node:20-alpine AS builder

WORKDIR /app

# 复制后端依赖清单（利用 Docker 缓存层）
COPY backend/package*.json ./backend/

# 安装生产依赖（不安装 devDependencies）
RUN cd backend && npm install --omit=dev

# ---- 阶段二：运行镜像 ----
FROM node:20-alpine

# 安装 tini（轻量级 init 进程，正确处理 SIGTERM/SIGINT 信号）
RUN apk add --no-cache tini

# 设置构建参数为环境变量（在镜像中包含版本信息）
ARG BUILD_VERSION
ARG BUILD_DATE
ENV BUILD_VERSION=${BUILD_VERSION}
ENV BUILD_DATE=${BUILD_DATE}

WORKDIR /app

# 复制后端 node_modules
COPY --from=builder /app/backend/node_modules ./backend/node_modules

# 复制后端代码
COPY backend/package.json ./backend/
COPY backend/server.js ./backend/
COPY backend/src/ ./backend/src/
COPY backend/docker/ ./backend/docker/
COPY backend/migrations/ ./backend/migrations/

# 复制前端静态文件
COPY frontend/ ./frontend/

# 创建数据持久化目录
RUN mkdir -p /app/backend/data

# 设置工作目录为 backend
WORKDIR /app/backend

# 默认环境变量（可通过 .env 或 docker-compose -e 覆盖）
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/backend/data/notes.db

# 暴露端口
EXPOSE 3000

# 使用 tini 处理信号（确保 docker stop 能正确关闭 Node.js）
ENTRYPOINT ["/sbin/tini", "--"]

# 启动服务
CMD ["node", "server.js"]
