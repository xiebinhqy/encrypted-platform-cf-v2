// rateLimit.js v1.0.0
/**
 * 请求速率限制中间件
 * 基于 KV 的滑动窗口限流，防止暴力破解和滥用
 *
 * 策略：
 * - 登录接口：5分钟内 10次
 * - 笔记接口：1分钟 60次
 * - 通用API：1分钟 120次
 * - 事件日志：1分钟 100次
 */

/**
 * 检查请求是否是否超过速率限制
 * @param {Object} env - Workers 环境变量
 * @param {string} clientId - 客户端标识（IP 或 userId）
 * @param {string} keyPrefix - 限流键前缀
 * @param {number} maxRequests - 时间期房屋最大请求数
 * @param {number} windowSeconds - 窗口时间（秒）
 * @returns {Promise<{ex:boolean限, remaining: number, resetAt: number }>}
 */
export async function checkRateLimit(env, clientId, keyPrefix, maxRequests, windowSeconds) {
  try {
    const kv = env.LOGIN_RATE_LIMIT;
    if (!kv) return { blocked: false, remaining: maxRequests, resetAt: 0 };

    const key = `${keyPrefix}:${clientId}`;
    const now = Math.floor(Date.now() / 1000);

    // 获取当前计数
    const data = await kv.get(key, "json");
    
    let count = 0;
    let windowStart = now;

    if (data) {
      windowStart = data.windowStart;
      count = data.count;
      
      // 窗口已过期，重置
      if (now - windowStart >= windowSeconds) {
        count = 0;
        windowStart = now;
      }
    }

    count++;

    // 更新 KV
    await kv.put(key, JSON.stringify({ count, windowStart }), {
      expirationTtl: windowSeconds + 60 // TTL 略大于窗口
    });

    if (count > maxRequests) {
      return {
        blocked: true,
        remaining: 0,
        resetAt: windowStart + windowSeconds
      };
    }

    return {
      blocked: false,
      remaining: maxRequests - count,
      resetAt: windowStart + windowSeconds
    };
  } catch (error) {
    // 限流失败不阻塞请求
    return { blocked: false, remaining: maxRequests, resetAt: 0 };
  }
}

/**
 * 获取速率限制响应头
 * @param {number} remaining - 剩余请求数
 * @param {number} resetAt - 窗口重置时间（时间戳）
 * @returns {Object} - 响应头对象
 */
export function getRateLimitHeaders(remaining, resetAt) {
  return {
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetAt)
  };
}

/**
 * 创建速率限制错误响应
 * @param {number} resetAt - 窗口重置时间（时间戳）
 * @returns {Response}
 */
export function rateLimitResponse(resetAt) {
  const retryAfter = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
  return new Response(
    JSON.stringify({ error: "请求过于频繁，请稍后再试", retryAfter }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Reset": String(resetAt)
      }
    }
  );
}