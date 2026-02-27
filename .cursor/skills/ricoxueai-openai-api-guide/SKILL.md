---
name: ricoxueai-openai-api-guide
description: 帮助代理在将现有基于 OpenAI 协议的大模型应用（官方 SDK、LangChain、各类开源客户端等）迁移或接入超级斜杠 API（`https://api.ricoxueai.cn`）时，给出 Base URL、API Key 与模型名称的标准配置方式，以及在 Python、Node.js、cURL、LangChain 与第三方客户端中的具体接入步骤。遇到用户提到“超级斜杠”“api.ricoxueai.cn”“切换 OpenAI 网关”“自定义 OpenAI Base URL”“接入本平台 API”等场景时使用本技能。
---

# 超级斜杠 API 开发者接入指南

本技能用于指导如何在保持 OpenAI 协议不变的前提下，将现有项目或工具快速切换到超级斜杠 API 网关（`https://api.ricoxueai.cn`）。

## 何时使用本技能

当出现以下任一信号时，应主动应用本技能：

- 用户提到：
  - “超级斜杠”、“超级斜杠 API”、“Ricoxue AI 平台”
  - 域名 `api.ricoxueai.cn`
  - “接入/迁移到本平台的大模型接口”
  - “更换 OpenAI 服务商，但继续用原来的 SDK/协议”
- 用户正在配置：
  - OpenAI 官方 SDK（Python / Node.js / 其他）
  - LangChain（`ChatOpenAI`、`OpenAI` 等）
  - 任意标称“兼容 OpenAI 协议”的第三方 SDK
  - 开源/商用客户端（如 NextChat、LobeChat、SioYuan、JetBrains AI 等）的 “OpenAI 接口” 或 “自定义接口”
- 用户遇到：
  - 切换到本平台后出现 `404 Not Found`
  - 不知道 Base URL 或模型名称应该填写什么
  - 询问是否支持 Function Calling / Vision / 工具调用

在这些场景下，优先指导用户通过“只改配置、不改业务代码”的方式完成接入。

## 核心配置规范

**1. API Key（令牌）**

- 使用在本站控制台生成的 Key，形如：`sk-xxxxxxxxxxxxxxxxxxxx`
- 在任何 SDK 或客户端中，等价于 OpenAI 的 `api_key` 或 `OPENAI_API_KEY`。

**2. Base URL（接口地址）**

- 标准形式：`https://api.ricoxueai.cn/v1`
- 说明：
  - 为兼容 OpenAI 官方 SDK，推荐地址后必须带上 `/v1`。
  - 某些第三方客户端会自动追加 `/v1`，这时可只填 `https://api.ricoxueai.cn`。
  - 如果用户遇到 `404 Not Found`，优先检查是否是 `/v1` 多写/少写导致。

**3. 模型名称（Model Name）**

- 与官方模型 ID 保持一致，例如：
  - `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`
  - `gemini-1.5-pro`, `gemini-1.5-flash`
  - `claude-3-5-sonnet-20240620`, `claude-3-opus` 等
- 引导用户访问模型广场（如：`https://api.ricoxueai.cn/pricing`）查看可用模型及其 ID。

**4. 协议兼容性**

- 完全兼容 OpenAI 风格的 Chat Completions / Completions 协议：
  - 请求字段如：`model`, `messages`, `temperature`, `stream`, `tools`, `tool_choice` 等。
- 凡是官方 API 支持的能力（Function Calling、Vision 图片理解等），在本平台上只要模型本身支持，即可透传使用。

## 使用步骤总览

在帮用户接入时，遵循以下流程回答与操作：

1. 确认场景
   - 用户使用的是什么：官方 SDK、LangChain、Web 客户端、桌面客户端还是自研后端。
2. 给出统一要改的三处配置
   - Base URL
   - API Key
   - 模型名称（Model）
3. 给出对应环境的示例代码 / 配置片段
   - Python / Node.js / cURL / LangChain / 客户端设置界面。
4. 排查常见错误
   - `404 Not Found` 多半是 Base URL 错误（有/无 `/v1`）。
   - `401` 或鉴权相关错误，多半是 Key 未生效、填错或漏写前缀 `sk-`。
5. 说明高级能力是否兼容
   - 说明 Function Calling 与 Vision 能力是与 OpenAI 协议兼容的，只需按官方参数调用。

## 语言与框架接入示例

### Python：使用 OpenAI 官方 SDK

适用场景：使用 `openai` 或 `openai>=1.x` 官方 SDK，想直接迁移到本平台。

关键点：初始化 `OpenAI` 客户端时，同时设置 `api_key` 与 `base_url`。

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-xxxxxxxxxxxxxxxxxxxxxxxx",  # 本站生成的 API Key
    base_url="https://api.ricoxueai.cn/v1",  # 修改为本平台地址（注意带 /v1）
)

response = client.chat.completions.create(
    model="gpt-4o",  # 也可以使用 gemini、claude 系列等已支持的模型 ID
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "你好，请介绍一下你自己。"},
    ],
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="")
```

### Node.js / TypeScript：使用 OpenAI 官方 SDK

适用场景：Node 环境使用 `openai` 官方 SDK。

```ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',      // 本站 API Key
  baseURL: 'https://api.ricoxueai.cn/v1',     // 注意字段为 baseURL，末尾带 /v1
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',                   // 可替换为任意支持的模型 ID
    messages: [{ role: 'user', content: '讲一个简短的笑话' }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main();
```

### cURL：命令行 / 调试场景

适用场景：快速测试连通性、调试请求。

```bash
curl https://api.ricoxueai.cn/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "model": "gpt-4-turbo",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'
```

### LangChain（Python）

适用场景：使用 LangChain，通过 OpenAI 兼容接口调用。

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    openai_api_key="sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    openai_api_base="https://api.ricoxueai.cn/v1",
    model_name="gpt-4",
)

response = llm.invoke("为我写一首关于AI的诗")
print(response.content)
```

## 第三方客户端接入指引

当用户使用 NextChat、LobeChat、SioYuan、JetBrains AI 等“OpenAI 兼容”客户端时：

1. 找到 OpenAI / 自定义接口设置页
   - 一般会有字段：`Base URL` / `API Base` / `自定义 API 地址`。
2. 填写接口地址（Base URL）
   - 首选：`https://api.ricoxueai.cn`。
   - 若客户端提示需要填写带 `/v1` 的完整路径，或连接报错：
     - 让用户尝试：`https://api.ricoxueai.cn/v1`。
3. 填写 API Key
   - 使用本站生成的 `sk-...` 密钥。
4. 配置模型名称
   - 在模型下拉或“自定义模型名称”处填写相应 ID，例如：`gpt-4o`, `gemini-1.5-pro`, `claude-3-5-sonnet-20240620` 等。
   - 如果客户端内置列表中没有对应模型，引导用户使用“自定义模型名称”手动输入。

## 常见问题与排查

**Q：模型名称（Model Name）应该填什么？**

- 填写各大厂商的标准模型 ID：
  - OpenAI：`gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo` 等
  - Google Gemini：`gemini-1.5-pro`, `gemini-1.5-flash` 等
  - Anthropic Claude：`claude-3-5-sonnet-20240620`, `claude-3-opus` 等
- 建议引导用户访问模型广场（如：`https://api.ricoxueai.cn/pricing`）查看最新支持列表与价格。

**Q：为什么报错 `404 Not Found`？**

- 首先检查 Base URL 是否正确：
  - 对于官方 SDK，通常需要末尾为 `/v1`：`https://api.ricoxueai.cn/v1`。
  - 对于部分第三方客户端：
    - 可能只需要域名：`https://api.ricoxueai.cn`。
    - 或客户端内部自动追加 `/v1`。
- 建议做法：
  - 如果当前配置是带 `/v1` 且报 `404`，尝试去掉 `/v1`。
  - 如果当前无 `/v1` 且报 `404`，尝试加上 `/v1`。

**Q：是否支持 Function Calling 与 Vision（视觉识别）？**

- 支持，与 OpenAI 官方 API 行为保持一致：
  - Function Calling / 工具调用：继续使用 `tools` / `tool_choice` 等字段。
  - Vision / 图片理解：在 `messages` 中传入图片 URL 或 base64，遵循 OpenAI 官方图片输入格式。
- 需要关注的是：所选模型本身是否支持该能力。

## 回答风格建议

- 优先给“改配置”的答案，不要求用户大幅重写代码。
- 回答结构建议：
  1. 先给出一句话总结：只需要改 Base URL + API Key + Model 名称。
  2. 接着给出对应语言 / 框架的最小可运行示例。
  3. 最后附上一小段 FAQ 样式的注意事项（如 `/v1` 与 `404` 问题）。
- 所有 URL 与 Key 示例中使用占位符或非真实密钥，避免泄露风险。

