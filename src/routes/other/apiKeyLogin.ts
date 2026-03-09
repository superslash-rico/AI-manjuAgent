import express from "express";
import u from "@/utils";
import jwt from "jsonwebtoken";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

/**
 * 调用 AI API /v1/models 接口验证 APIKey 有效性
 * baseURL 由环境变量 AI_API_BASE_URL 控制，默认 api.yiwuxueshe.cn（可换回 api.ricoxueai.cn）
 */
async function validateApiKeyWithSuperSlash(apiKey: string): Promise<{ valid: boolean; message?: string }> {
  const keyPrefix = `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;

  if (!apiKey || !apiKey.startsWith("sk-")) {
    console.log("[apiKeyLogin] 格式校验失败:", keyPrefix);
    return { valid: false, message: "APIKey格式错误，必须以'sk-'开头" };
  }

  const base = process.env.AI_API_BASE_URL || "https://api.yiwuxueshe.cn";
  const baseURL = base.replace(/\/$/, "") + "/v1";
  const timeout = parseInt(process.env.RICOXUEAI_API_TIMEOUT || "8000", 10);
  const url = `${baseURL}/models`;

  console.log("[apiKeyLogin] 开始鉴权, key:", keyPrefix, "url:", url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json();
    console.log("[apiKeyLogin] 接口返回, status:", res.status, "data:", JSON.stringify(data).slice(0, 500));

    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
      console.error("[apiKeyLogin] 鉴权失败, key:", keyPrefix, "status:", res.status, "msg:", msg);
      if (res.status === 401) return { valid: false, message: "APIKey无效或已过期，请检查后重试" };
      if (res.status === 403) return { valid: false, message: "APIKey无权限或已被禁用" };
      if (res.status === 429) return { valid: false, message: "请求过于频繁，请稍后再试" };
      if (res.status >= 500) return { valid: false, message: "服务暂时不可用，请稍后再试" };
      return { valid: false, message: `鉴权失败: ${msg}` };
    }

    console.log("[apiKeyLogin] 鉴权成功, key:", keyPrefix);
    return { valid: true };
  } catch (err: any) {
    console.error("[apiKeyLogin] 请求异常, key:", keyPrefix, "message:", err?.message);
    if (err?.name === "AbortError") return { valid: false, message: "请求超时，请检查网络连接后重试" };
    return { valid: false, message: "鉴权失败，请联系管理员" };
  }
}

/**
 * 设置JWT Token
 */
function setToken(payload: string | object, expiresIn: string | number, secret: string): string {
  if (!payload || typeof secret !== "string" || !secret) {
    throw new Error("参数不合法");
  }
  return (jwt.sign as any)(payload, secret, { expiresIn });
}

// APIKey登录接口
export default router.post(
  "/",
  validateFields({
    apiKey: z.string(),
  }),
  async (req, res) => {
    const { apiKey } = req.body;

    // 调用超级斜杠API进行鉴权
    const validation = await validateApiKeyWithSuperSlash(apiKey);

    if (!validation.valid) {
      return res.status(400).send(error(validation.message || "鉴权失败"));
    }

    // 鉴权成功，生成Token
    // 由于APIKey登录不需要本地用户表中的用户信息，我们使用一个虚拟用户ID
    // 实际使用中，可以根据APIKey关联的用户ID来创建或更新本地用户记录

    // 检查是否存在默认用户，如果不存在则创建
    let user = await u.db("t_user").where("name", "apikey_user").first();

    if (!user) {
      // 创建默认APIKey用户
      const [userId] = await u.db("t_user").insert({
        name: "apikey_user",
        password: "apikey_login", // 占位密码，实际不使用
      });

      // 获取插入的用户记录
      user = await u.db("t_user").where("id", userId).first();

      // 为该用户创建设置记录（获取tokenKey）
      const tokenKey = Buffer.from(Date.now() + Math.random().toString()).toString("base64");
      await u.db("t_setting").insert({
        userId,
        tokenKey,
      });
    }

    if (!user) {
      return res.status(500).send(error("用户创建失败，请联系管理员"));
    }

    // 获取tokenKey
    const tokenSecret = await u.db("t_setting").where("userId", user.id).select("tokenKey").first();
    let finalTokenKey = tokenSecret?.tokenKey;

    if (!finalTokenKey) {
      finalTokenKey = Buffer.from(Date.now() + Math.random().toString()).toString("base64");
      await u.db("t_setting").insert({
        userId: user.id,
        tokenKey: finalTokenKey,
      });
    }

    // 生成JWT Token
    const token = setToken(
      {
        id: user.id,
        name: user.name,
        loginType: "apikey", // 标记登录类型
      },
      "180Days",
      finalTokenKey,
    );

    // 记录APIKey前缀用于日志（只保留前4位+后4位）
    const apiKeyPrefix = `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
    console.log(`APIKey登录成功: ${apiKeyPrefix}, 用户ID: ${user.id}`);

    return res
      .status(200)
      .send(
        success(
          {
            token: "Bearer " + token,
            name: user.name,
            id: user.id,
            loginType: "apikey",
          },
          "APIKey登录成功",
        ),
      );
  },
);
