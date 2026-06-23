// event.routes.js v1.0.0
/**
 * 事件日志 API 路由
 * 
 * KV 存储近 1 个月的事件（快速读取）
 * D1 数据库存储所有历史事件（持久化）
 * 
 * 路由规则：
 * - GET  /api/events       → 获取事件历史
 * - POST /api/events       → 新增事件
 */

import { jsonSuccess, jsonError } from "../utils/response.js";
import { getRateLimitKV, getSystemEventsKV } from "../config/constants.js";

// 事件在 KV 中的 TTL：35 天（确保超过 1 个月的有效期）
const KV_EVENT_TTL = 86400 * 35;

// KV Key 前缀
const EVENTS_KEY_PREFIX = "events:";

/**
 * 处理事件路由
 */
export async function handleEventRoute(request, env, url, userId) {
  const method = request.method;

  if (method === "GET") {
    return getEvents(request, env, userId);
  }

  if (method === "POST") {
    return addEvent(request, env, userId);
  }

  return jsonError("Method not allowed", 405, env);
}

/**
 * 获取事件历史
 * 优先从 KV 读取近 1 个月的事件，同时查询 D1 中更早的事件
 */
async function getEvents(request, env, userId) {
  try {
    const DB = env.DB;
    const KV = getRateLimitKV(env);

    // 1. 从 KV 获取近 1 个月的事件
    let kvEvents = [];
    if (KV) {
      try {
        const kvData = await KV.get(`${EVENTS_KEY_PREFIX}${userId}`, "json");
        if (Array.isArray(kvData)) {
          kvEvents = kvData;
        }
      } catch (e) {
        console.warn("从 KV 读取事件失败:", e.message);
      }
    }

    // 2. 从 D1 获取 1 个月前的历史事件
    let dbEvents = [];
    try {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const cutoffTime = oneMonthAgo.toISOString();

      const result = await DB.prepare(
        "SELECT id, time, type, description, operator, status FROM event_logs WHERE user_id = ? AND time < ? ORDER BY time DESC LIMIT 500"
      ).bind(userId, cutoffTime).all();

      dbEvents = (result.results || []).map(row => ({
        id: row.id,
        time: row.time,
        type: row.type,
        description: row.description,
        operator: row.operator,
        status: row.status
      }));
    } catch (e) {
      console.warn("从 D1 读取历史事件失败:", e.message);
    }

    // 3. 合并 KV 和 DB 的事件（KV 事件在前，按时间降序）
    const allEvents = [...kvEvents, ...dbEvents]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 1000); // 限制返回数量

    return jsonSuccess({ events: allEvents }, env);
  } catch (err) {
    console.error("获取事件历史失败:", err);
    return jsonSuccess({ events: [] }, env); // 降级返回空列表，不影响前端
  }
}

/**
 * 新增事件（支持单条和批量）
 * 同时写入 KV（近 1 个月）和 D1（持久化）
 * 
 * 支持两种格式：
 * - 单条：{ time, type, description, operator, status }
 * - 批量：{ events: [{ time, type, ... }, ...] }
 */
async function addEvent(request, env, userId) {
  try {
    const body = await request.json();
    const DB = env.DB;
    const KV = getRateLimitKV(env);

    // 支持批量格式和单条格式
    let eventList = [];
    if (body.events && Array.isArray(body.events)) {
      eventList = body.events;
    } else if (body.time && body.type) {
      eventList = [body];
    } else {
      return jsonError("缺少必要字段", 400, env);
    }

    const kvKey = `${EVENTS_KEY_PREFIX}${userId}`;
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // 批量写入 D1（使用批量语句）
    const dbStatements = [];
    for (const ev of eventList.slice(0, 50)) {
      if (ev.time && ev.type && ev.description) {
        dbStatements.push(
          DB.prepare(
            "INSERT INTO event_logs (user_id, time, type, description, operator, status) VALUES (?, ?, ?, ?, ?, ?)"
          ).bind(userId, ev.time, ev.type, ev.description, ev.operator || '管理员', ev.status || '成功')
        );
      }
    }
    if (dbStatements.length > 0) {
      try {
        await DB.batch(dbStatements);
      } catch (e) {
        // 批量写入失败时逐条写入
        for (const stmt of dbStatements) {
          try { await stmt.run(); } catch (_) {}
        }
      }
    }

    // 批量更新 KV（使用 LOGIN_RATE_LIMIT 或系统默认 KV）
    if (KV) {
      try {
        const existingData = await KV.get(kvKey, "json");
        let events = Array.isArray(existingData) ? existingData : [];

        for (const ev of eventList) {
          events.unshift({
            time: ev.time,
            type: ev.type,
            description: ev.description,
            operator: ev.operator || '管理员',
            status: ev.status || '成功'
          });
        }

        // 清理过期事件
        events = events.filter(e => new Date(e.time) >= oneMonthAgo);
        if (events.length > 2000) events = events.slice(0, 2000);

        await KV.put(kvKey, JSON.stringify(events), { expirationTtl: KV_EVENT_TTL });
      } catch (e) {
        console.warn("写入 KV 事件日志失败:", e.message);
      }
    }

    // 系统级别的事件额外写入 SYSTEM_EVENTS KV（持久化存储，不限 TTL）
    const systemKV = getSystemEventsKV(env);
    if (systemKV && systemKV !== KV) {
      try {
        // 系统事件单独存储到 SYSTEM_EVENTS（按 userId 分组，持久保留）
        const sysEventsKey = `system_events:${userId}`;
        const existingSysEvents = await systemKV.get(sysEventsKey, "json");
        let sysEvents = Array.isArray(existingSysEvents) ? existingSysEvents : [];

        for (const ev of eventList) {
          // 只存储系统类型事件（系统、创建、删除、备份等）
          const eventType = (ev.type || '').toLowerCase();
          if (['系统', 'system', '创建', '删除', '备份', 'backup', '清理'].includes(eventType) || eventType.includes('备份') || eventType.includes('清理')) {
            sysEvents.unshift({
              time: ev.time,
              type: ev.type,
              description: ev.description,
              operator: ev.operator || '管理员',
              status: ev.status || '成功'
            });
          }
        }

        // 限制大小（最多 5000 条）
        if (sysEvents.length > 5000) sysEvents = sysEvents.slice(0, 5000);

        await systemKV.put(sysEventsKey, JSON.stringify(sysEvents));
        console.log(`[SYSTEM_EVENTS] 已写入 ${sysEvents.length} 条系统事件`);
      } catch (e) {
        console.warn("写入 SYSTEM_EVENTS KV 失败:", e.message);
      }
    }

    return jsonSuccess({ saved: true, count: eventList.length }, env);
  } catch (err) {
    console.error("新增事件失败:", err);
    return jsonSuccess({ saved: false }, env);
  }
}
