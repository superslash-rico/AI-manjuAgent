import express from "express";
import u from "@/utils";
import jwt from "jsonwebtoken";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

// APIKey鉴权接口类型定义
interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 调用超级斜杠API进行APIKey鉴权
 * @param apiKey - APIKey，格式为 sk-xxxxxxxxxxxxxxxxxxxxxxxx
 * @returns 鉴权是否成功
 */
async function validateApiKeyWithSuperSlash(apiKey: string): Promise<{ valid: boolean; message?: string }> {
  // 格式校验
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return { valid: false, message: "APIKey格式错误，必须以'sk-'开头" };
  }

  // 从环境变量读取API地址和超时配置
  const apiUrl = process.env.RICOXUEAI_API_URL || "https://api.ricoxueai.cn/v1/chat/completions";
  const timeout = parseInt(process.env.RICOXUEAI_API_TIMEOUT || "8000");

  try {
    // 创建AbortController用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "验证APIKey有效性" }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // HTTP状态码校验
    if (response.status === 401) {
      return { valid: false, message: "APIKey无效或已过期，请检查后重试" };
    }
    if (response.status === 403) {
      return { valid: false, message: "APIKey无权限或已被禁用" };
    }
    if (response.status === 404) {
      return { valid: false, message: "服务器配置错误，请联系管理员" };
    }
    if (response.status === 429) {
      return { valid: false, message: "请求过于频繁，请稍后再试（建议5秒后重试）" };
    }
    if (response.status >= 500) {
      return { valid: false, message: "服务暂时不可用，请稍后再试" };
    }
    if (response.status !== 200) {
      return { valid: false, message: `APIKey鉴权失败: HTTP ${response.status}` };
    }

    // 解析响应体
    const data: unknown = await response.json();

    // 响应体结构校验
    if (!data || typeof data !== "object") {
      return { valid: false, message: "服务器返回空响应，请联系管理员" };
    }

    const responseData = data as Partial<OpenAIChatResponse>;
    if (!responseData.id || !responseData.choices || !Array.isArray(responseData.choices)) {
      return { valid: false, message: "鉴权响应异常，请联系管理员" };
    }

    // 鉴权成功
    return { valid: true };
  } catch (err) {
    // 网络错误处理
    if (err instanceof Error) {
      if (err.name === "AbortError" || err.message.includes("timeout")) {
        return { valid: false, message: "请求超时，请检查网络连接后重试" };
      }
      if (err.message.includes("fetch failed") || err.message.includes("network")) {
        return { valid: false, message: "网络异常，请检查连接" };
      }
    }
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
