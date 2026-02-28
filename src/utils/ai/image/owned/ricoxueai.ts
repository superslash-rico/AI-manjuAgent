import "../type";
import OpenAI from "openai";

export default async (input: ImageConfig, config: AIConfig): Promise<string> => {
  if (!config.model) throw new Error("缺少Model名称");
  if (!config.apiKey) throw new Error("缺少API Key");

  const apiKey = config.apiKey.replace("Bearer ", "");
  const baseURL = config.baseURL || "https://api.ricoxueai.cn/v1";

  const openai = new OpenAI({ apiKey, baseURL });

  const sizeMap: Record<string, string> = {
    "1K": "1024x1024",
    "2K": "2048x2048",
    "4K": "4096x4096",
  };

  const fullPrompt = input.systemPrompt ? `${input.systemPrompt}\n\n${input.prompt}` : input.prompt;
  const size = sizeMap[input.size] ?? "1024x1024";

  const requestBody = {
    model: config.model,
    prompt: fullPrompt,
    size: size as any,
    response_format: "b64_json" as const,
    n: 1,
  };

  console.log("[ricoxueai] 请求参数:", JSON.stringify({
    model: config.model,
    baseURL,
    url: `${baseURL}/images/generations`,
    size,
    promptLength: fullPrompt.length,
    promptPreview: fullPrompt.slice(0, 200),
  }));

  let res: OpenAI.Images.ImagesResponse;
  try {
    res = await openai.images.generate(requestBody);
  } catch (err: any) {
    console.error("[ricoxueai] 请求失败, status:", err?.status, "code:", err?.code, "message:", err?.message);
    if (err?.error) console.error("[ricoxueai] 错误详情:", JSON.stringify(err.error));
    throw err;
  }

  console.log("[ricoxueai] 响应结果:", JSON.stringify({
    created: res.created,
    dataLength: res.data?.length,
    hasB64: !!res.data?.[0]?.b64_json,
    b64Length: res.data?.[0]?.b64_json?.length,
    revisedPrompt: res.data?.[0]?.revised_prompt,
    url: res.data?.[0]?.url,
  }));

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) {
    console.error("[ricoxueai] 未返回有效数据, 完整响应:", JSON.stringify(res));
    throw new Error("图片生成失败：未返回有效数据");
  }

  console.log("[ricoxueai] 图片生成成功, base64长度:", b64.length);
  return b64;
};
