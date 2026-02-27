# APIKey登录设计方案

## 背景与目标
- 提供一种无需用户名/密码的登录方式。
- 用户输入APIKey后，调用超级斜杠API进行鉴权。
- API返回正常响应即视为鉴权成功。

## 适用范围
- 仅覆盖APIKey登录流程。
- 账号/密码登录流程保持不变。

## 核心流程
1. 用户在登录页选择”APIKey登录”并输入APIKey。
2. 客户端校验APIKey格式（必须以`sk-`开头）。
3. 客户端发起鉴权请求：携带APIKey调用超级斜杠Chat Completions API。
4. 若返回正常响应（HTTP 200 且响应体结构符合OpenAI标准），判定鉴权成功。
5. 登录成功后进入系统，无需输入用户名和密码。

## 请求设计

### HTTP请求参数
- **URL**：`https://api.ricoxueai.cn/v1/chat/completions`
- **方法**：`POST`（推荐）
- **Headers**：
  - `Content-Type: application/json`
  - `Authorization: Bearer <APIKey>`
- **请求体**（鉴权用途的最小化请求）：
```json
{
  “model”: “gpt-3.5-turbo”,
  “messages”: [
    {
      “role”: “user”,
      “content”: “验证APIKey有效性”
    }
  ],
  “max_tokens”: 5
}
```

### 配置选项
- **超时时间**：5-10秒（建议8秒）
- **重试策略**：
  - 网络超时/连接错误：可重试1次
  - HTTP 4xx错误：不重试
  - HTTP 5xx错误：不重试，直接提示用户
- **备选认证Header**：通过配置可切换为 `X-API-Key: <APIKey>`

### 伪代码（更新版）
```ts
async function loginWithApiKey(apiKey: string) {
  // 格式校验
  if (!apiKey || !apiKey.startsWith('sk-')) {
    throw new Error(“APIKey格式错误，必须以'sk-'开头”);
  }

  const res = await fetch('https://api.ricoxueai.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: '验证APIKey有效性' }],
      max_tokens: 5,
    }),
  });

  // HTTP状态码校验
  if (res.status !== 200) {
    throw new Error(`APIKey鉴权失败: HTTP ${res.status}`);
  }

  // 响应体结构校验
  const data = await res.json();
  if (!data.id || !data.choices || !Array.isArray(data.choices)) {
    throw new Error(“API返回结构异常”);
  }

  // 鉴权成功
  return {
    ok: true,
    apiKeyPrefix: apiKey.slice(0, 4) + '****', // 仅存储前缀
    validated: true,
  };
}
```

## 成功判定
- **HTTP状态码**：必须为 `200 OK`（超级斜杠API通常返回精确状态码，不接受2xx范围）
- **响应体结构**：必须包含以下OpenAI标准字段：
  - `id`：响应唯一标识符（字符串）
  - `object`：对象类型，应为 `"chat.completion"`
  - `created`：创建时间戳（数字）
  - `model`：使用的模型名称（字符串）
  - `choices`：选择数组，至少包含一个元素
- **不依赖内容校验**：不检查返回的具体文本内容，只要结构正确即视为鉴权成功

**示例成功响应**：
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699012345,
  "model": "gpt-3.5-turbo",
  "choices": [...]
}
```

## 失败处理

### 网络层错误
- **超时**：提示”请求超时，请检查网络连接后重试”
- **连接失败/DNS解析失败**：提示”无法连接到服务器，请检查网络”
- **网络断开**：提示”网络连接已断开，请检查网络设置”

### HTTP状态码错误
| 状态码 | 场景 | 用户提示 |
|--------|------|----------|
| `400` | 请求格式错误 | “请求格式错误，请联系管理员” |
| `401` | APIKey无效或过期 | “APIKey无效或已过期，请检查后重试” |
| `403` | 权限不足或APIKey被禁用 | “APIKey无权限或已被禁用” |
| `404` | 端点不存在（URL错误） | “服务器配置错误，请联系管理员” |
| `429` | 请求过于频繁（速率限制） | “请求过于频繁，请稍后再试（建议5秒后重试）” |
| `500/502/503/504` | 服务端错误 | “服务暂时不可用，请稍后再试” |

### 业务层错误
| 错误类型 | 场景 | 用户提示 |
|----------|------|----------|
| **格式错误** | APIKey不以`sk-`开头 | “APIKey格式错误，必须以'sk-'开头” |
| **解析失败** | 响应体不是有效JSON | “服务器返回异常，请联系管理员” |
| **结构异常** | 响应体缺少必需字段 | “鉴权响应异常，请联系管理员” |
| **空响应** | 响应体为空 | “服务器返回空响应，请联系管理员” |

### 重试策略
- **可重试场景**：仅限网络超时和连接失败，最多重试1次
- **不可重试场景**：所有HTTP 4xx和5xx错误、格式错误、解析失败
- **重试间隔**：固定1秒延迟

## 安全与隐私

### 传输安全
- 仅通过HTTPS请求（超级斜杠API强制HTTPS）
- 验证服务器证书（防止中间人攻击）

### APIKey处理
- **日志安全**：不记录完整APIKey日志；展示与日志中仅保留后4位（如 `sk-****-abcd`）
- **内存安全**：鉴权后立即清除内存中的完整APIKey
- **持久化**：若需要持久化，优先使用系统安全存储：
  - Windows：Credential Manager
  - macOS：Keychain
  - Linux：KeyStore / libsecret
- **用户控制**：提供”清除APIKey”入口，允许用户主动删除存储的凭证

### 防护措施
- 实现请求签名验证（可选，增强安全性）
- 设置合理的请求频率限制（避免APIKey被盗用）
- 监控异常使用模式（频繁鉴权失败、短时间内多次重试等）

## UI/UX建议
- 登录页提供”APIKey登录/账号密码登录”切换
- APIKey输入框支持一键粘贴、显示/隐藏
- APIKey格式校验提示（必须以`sk-`开头）
- 鉴权过程中显示加载状态
- 鉴权成功后显示提示信息

## 超级斜杠API参考

### API端点
- **Base URL**：`https://api.ricoxueai.cn/v1`
- **鉴权端点**：`POST /v1/chat/completions`
- **说明**：使用标准的OpenAI Chat Completions接口进行鉴权验证

### 认证方式
- **Header格式**：`Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxx`
- **API Key格式**：以 `sk-` 开头的字符串
- **备选Header**：通过配置可切换为 `X-API-Key: <APIKey>`

### cURL请求示例
```bash
curl https://api.ricoxueai.cn/v1/chat/completions \
  -H “Content-Type: application/json” \
  -H “Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxx” \
  -d '{
    “model”: “gpt-3.5-turbo”,
    “messages”: [
      { “role”: “user”, “content”: “验证APIKey” }
    ],
    “max_tokens”: 10
  }'
```

### 参考文档
- 超级斜杠API文档：`https://api.ricoxueai.cn/pricing`
- OpenAI Chat Completions API规范：https://platform.openai.com/docs/api-reference/chat
