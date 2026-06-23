// user.routes.js v3.0.0
/**
 * 用户路由
 * v3.0.0 变更：登录/注册成功后签发 JWT Token
 */

import { jsonSuccess, jsonError } from "../utils/response.js";
import { ERRORS } from "../utils/error.js";
import * as userService from "../services/user.service.js";
import { signToken } from "../utils/jwt.js";

/**
 * 处理用户相关路由
 * @param {Request} request - 原始请求对象
 * @param {Object} env - Workers 环境变量
 * @param {URL} url - 解析后的 URL 对象
 * @returns {Promise<Response>}
 */
export const handleUserRoute = async (request, env, url) => {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonError("无效的请求体", 400, env);
  }

  switch (url.pathname) {
    case "/api/auth/register":
      return handleRegister(env, body);
    case "/api/auth/login":
      return handleLogin(env, body);
    case "/api/auth/recover":
      return handleRecover(env, body);
    case "/api/auth/recovery-code/verify":
      return handleVerifyRecoveryCode(env, body);
    case "/api/auth/recovery-code/reset":
      return handleResetPassword(env, body);
    default:
      return jsonError(ERRORS.NOT_FOUND.message, ERRORS.NOT_FOUND.status, env);
  }
};

/**
 * 验证恢复码（一次性）
 * POST /api/auth/recovery-code/verify
 * Body: { recoveryCodeHash }
 */
const handleVerifyRecoveryCode = async (env, body) => {
  try {
    const { recoveryCodeHash } = body;
    if (!recoveryCodeHash) {
      return jsonError("缺少必填参数: recoveryCodeHash", 400, env);
    }
    const result = await userService.verifyRecoveryCode(env, recoveryCodeHash);
    // 验证成功后签发临时 token
    const token = await signToken(env, { userId: result.userId });
    return jsonSuccess({ userId: result.userId, token }, env);
  } catch (error) {
    console.error("Verify recovery code error:", error);
    if (error.type) {
      return jsonError(error.type.message, error.type.status, env);
    }
    return jsonError("验证恢复码失败: " + (error.message || JSON.stringify(error)), 500, env);
  }
};

/**
 * 重置密码（使用恢复码）
 * POST /api/auth/recovery-code/reset
 * Body: { userId, newPublicKey, newRecoveryCodeHash }
 */
const handleResetPassword = async (env, body) => {
  try {
    const { userId, newPublicKey, newRecoveryCodeHash } = body;
    if (!userId || !newPublicKey || !newRecoveryCodeHash) {
      return jsonError("缺少必填参数: userId, newPublicKey, newRecoveryCodeHash", 400, env);
    }
    const result = await userService.resetPassword(env, userId, newPublicKey, newRecoveryCodeHash);
    return jsonSuccess(result, env);
  } catch (error) {
    console.error("Reset password error:", error);
    if (error.type) {
      return jsonError(error.type.message, error.type.status, env);
    }
    return jsonError("重置密码失败: " + (error.message || JSON.stringify(error)), 500, env);
  }
};

/**
 * 处理注册请求
 * POST /api/auth/register
 * Body: { publicKey, recoveryCodeHash }
 * 返回: { success, userId, token }
 */
const handleRegister = async (env, body) => {
  try {
    const { publicKey, recoveryCodeHash } = body;
    if (!publicKey || !recoveryCodeHash) {
      return jsonError("缺少必填参数: publicKey 或 recoveryCodeHash", 400, env);
    }
    const result = await userService.registerUser(env, publicKey, recoveryCodeHash);
    // 注册成功后登录获取 userId，然后签发 JWT
    const loginResult = await userService.loginUser(env, publicKey);
    const token = await signToken(env, { userId: loginResult.userId });
    return jsonSuccess({ success: true, userId: loginResult.userId, token }, env);
  } catch (error) {
    console.error("Register error:", error);
    if (error.type) {
      return jsonError(error.type.message, error.type.status, env);
    }
    return jsonError("注册失败: " + (error.message || JSON.stringify(error)), 500, env);
  }
};

/**
 * 处理登录请求
 * POST /api/auth/login
 * Body: { publicKey }
 * 返回: { userId, token }
 */
const handleLogin = async (env, body) => {
  try {
    const { publicKey } = body;
    if (!publicKey) {
      return jsonError("缺少必填参数: publicKey", 400, env);
    }
    const result = await userService.loginUser(env, publicKey);
    // 签发 JWT Token
    const token = await signToken(env, { userId: result.userId });
    return jsonSuccess({ userId: result.userId, token }, env);
  } catch (error) {
    // 用户不存在时 loginUser 会抛出 {type: {message, status}} —— 这是正常注册流程，不是错误
    if (error?.type?.status === 401 || error?.type?.status === 404) {
      console.log("🔑 Login: user not found, will register new account");
      return jsonError(error.type.message, error.type.status, env);
    }
    console.error("Login error:", error);
    if (error.type) {
      return jsonError(error.type.message, error.type.status, env);
    }
    return jsonError("登录失败: " + (error.message || JSON.stringify(error)), 500, env);
  }
};

/**
 * 处理恢复请求
 * POST /api/auth/recover
 * Body: { publicKey, recoveryCodeHash }
 */
const handleRecover = async (env, body) => {
  try {
    const { publicKey, recoveryCodeHash } = body;
    if (!publicKey || !recoveryCodeHash) {
      return jsonError("缺少必填参数: publicKey 或 recoveryCodeHash", 400, env);
    }
    const result = await userService.recoverUser(env, publicKey, recoveryCodeHash);
    return jsonSuccess(result, env);
  } catch (error) {
    console.error("Recover error:", error);
    if (error.type) {
      return jsonError(error.type.message, error.type.status, env);
    }
    return jsonError("恢复失败: " + (error.message || JSON.stringify(error)), 500, env);
  }
};