@echo off
REM ============================================
REM  🔐 Encrypted Notes v2 — Docker 一键启动
REM  适用于 Windows 系统
REM ============================================

title Encrypted Notes v2 - Docker Launcher
chcp 65001 >nul

echo ====================================
echo  🔐 Encrypted Notes v2
echo  Docker 一键启动脚本
echo ====================================
echo.

REM ---- 检查 Docker 是否安装 ----
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Docker ！
    echo.
    echo 请先安装 Docker Desktop:
    echo 下载地址: https://www.docker.com/products/docker-desktop/
    echo.
    echo 安装完成后，重新运行此脚本。
    pause
    exit /b 1
)

echo [✓] Docker 已安装
echo.

REM ---- 检查 Docker 是否在运行 ----
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [注意] Docker 服务未运行，正在尝试启动...
    echo 请确保 Docker Desktop 已经启动。
    echo 如果 Docker Desktop 正在启动中，请稍候再试。
    pause
    exit /b 1
)

echo [✓] Docker 服务运行中
echo.

REM ---- 选择模式：从 GHCR 拉取 vs 本地构建 ----
echo 请选择运行模式:
echo   1. 从 GitHub Container Registry 拉取（推荐，自动获取最新版）
echo   2. 本地构建镜像（需要安装 Node.js）
echo.
set /p BUILD_MODE="输入 1 或 2 (默认 1): "
if "%BUILD_MODE%"=="" set BUILD_MODE=1

echo.

if "%BUILD_MODE%"=="2" (
    REM ---- 本地构建模式 ----
    echo [*] 采用本地构建模式...
    echo.
    
    REM ---- 检查 .env 文件 ----
    if not exist .env (
        if exist .env.example (
            echo [*] 首次运行，正在从 .env.example 创建 .env 文件...
            copy .env.example .env >nul
            echo [⚠] 重要！请修改 .env 文件中的 JWT_SECRET！
            echo     使用强随机字符串（至少 32 位字符）
            echo.
            echo 按任意键继续（或者先修改 .env 后再运行）...
            pause >nul
        ) else (
            echo [错误] 找不到 .env.example 文件
            pause
            exit /b 1
        )
    ) else (
        echo [✓] .env 文件已存在
    )
    echo.

    REM ---- 修改 docker-compose.yml 启用 build 模式 ----
    echo [*] 启用本地构建模式...
    powershell -Command "(Get-Content docker-compose.yml) -replace '# build:', 'build:' -replace '#   context:', '  context:' -replace '#   dockerfile:', '  dockerfile:' -replace 'image: ghcr.io', '# image: ghcr.io' | Set-Content docker-compose.yml"
    echo.

    REM ---- 构建 Docker 镜像 ----
    echo [*] 正在构建 Docker 镜像...
    echo   （首次构建可能需要 2-5 分钟，请耐心等待）
    echo.
    docker compose build
    if %errorlevel% neq 0 (
        echo [错误] Docker 构建失败！
        pause
        exit /b 1
    )
    echo [✓] Docker 镜像构建成功
    echo.
) else (
    REM ---- GHCR 拉取模式 ----
    echo [*] 采用从 GHCR 拉取模式...
    echo.
    echo [*] 正在拉取最新镜像...
    docker compose pull
    echo.
)

REM ---- 启动服务 ----
echo [*] 正在启动服务...
docker compose up -d
if %errorlevel% neq 0 (
    echo [错误] 服务启动失败！
    pause
    exit /b 1
)

REM ---- 等待服务就绪 ----
echo.
echo [*] 等待服务就绪...
timeout /t 5 /nobreak >nul

REM ---- 验证服务 ----
docker compose ps | findstr "Up" >nul
if %errorlevel% equ 0 (
    echo [✓] 服务已正常启动！
) else (
    echo [⚠] 服务可能尚未完全启动，请稍候检查日志
)

echo.
echo ====================================
echo  ✅ 部署完成！
echo ====================================
echo.
echo  🌐 访问地址: http://localhost:3000
echo.
echo  📖 查看日志: docker compose logs -f
echo  ⏹  停止服务: docker compose down
echo  🔄 重启服务: docker compose restart
echo.
echo  如果无法访问，请检查防火墙是否放行端口 3000
echo.
pause