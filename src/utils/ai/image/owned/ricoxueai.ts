import "../type";
import OpenAI from "openai";
import axios from "axios";
import u from "@/utils";

const LOG = "[ricoxueai-image]";

// 检查是否是超级斜杠豆包系模型
const checkDoubaoImageModel = async (model: string): Promise<{ isDefault: boolean; isImage: boolean }> => {
  const row = await u.db("t_config")
    .where("model", model)
    .where("manufacturer", "ricoxueai")
    .where("source", "default")
    .select("type")
    .first();
  if (!row) return { isDefault: false, isImage: false };
  return { isDefault: true, isImage: row.type === "image" };
};

const sizeMap: Record<string, string> = {
  "1K": "1024x1024",
  "2K": "2048x2048",
  "4K": "4096x4096",
};

const getDoubaoSize = (size: string, aspectRatio: string): string => {
  const base = size === "1K" ? 1024 : size === "2K" ? 2048 : 4096;
  const [wR = 1, hR = 1] = aspectRatio.split(":").map(Number);
  if (wR === 1 && hR === 1) return `${base}x${base}`;
  const w = wR >= hR ? base : Math.round((base * wR) / hR);
  const h = hR >= wR ? base : Math.round((base * hR) / wR);
  return `${w}x${h}`;
};

// 豆包系图像模型只需视觉要素，不含行为规则。根据原 systemPrompt 特征匹配合适的简化前缀
const getDoubaoVisualPrompt = (input: ImageConfig): string => {
  const sys = input.systemPrompt || "";
  const prompt = input.prompt;

  // 角色四视图：布局+姿势+背景
  if (sys.includes("Four-View") || sys.includes("Character Orthographic") || sys.includes("角色四视图")) {
    const prefix =
      "角色四视图参考表。四格布局：1)头部特写 2)正面全身 3)90°侧面全身 4)背面全身。纯白背景，无文字无道具，平淡表情，双臂自然下垂站立。";
    return `${prefix}\n\n${prompt}`;
  }
  // 场景图
  if (sys.includes("Scene Image") || sys.includes("Pure Scene") || sys.includes("场景")) {
    const prefix = "纯场景环境图，无人物，建筑/自然/光影。";
    return `${prefix}\n\n${prompt}`;
  }
  // 道具图
  if (sys.includes("Prop Image") || sys.includes("AI Prop")) {
    const prefix = "道具展示图，纯白背景，无人物无场景，道具居中完整展示。";
    return `${prefix}\n\n${prompt}`;
  }
  // 分镜图
  if (sys.includes("Storyboard Image") || sys.includes("storyboard visual")) {
    const prefix = "分镜画面，按描述构图和镜头语言生成。";
    return `${prefix}\n\n${prompt}`;
  }

  return input.systemPrompt ? `${input.systemPrompt}\n\n${prompt}` : prompt;
};

async function tryDoubaoVolcImage(input: ImageConfig, apiKey: string, baseURL: string, model: string): Promise<string> {
  const endpoint = baseURL.endsWith("/") ? `${baseURL}images/generations` : `${baseURL}/images/generations`;
  const fullPrompt = getDoubaoVisualPrompt(input);
  const size = getDoubaoSize(input.size, input.aspectRatio);
  const hasImage = !!input.imageBase64?.length;

  // 文生图：无 image 字段；图生图：有 image 字段（URL 或 data:image/xxx;base64,xxx）
  const body: Record<string, any> = {
    model,
    prompt: fullPrompt,
    size,
    sequential_image_generation: "disabled",
    stream: false,
    response_format: "url",
    watermark: false,
  };
  if (hasImage) body.image = input.imageBase64![0];
  console.log (`豆包生图 request body: ${JSON.stringify(body)}`);
  console.log(`${LOG} 豆包Volc${hasImage ? "图生图" : "文生图"} | endpoint=${endpoint}, model=${model}, size=${size}, hasImage=${hasImage}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data: any = await res.json();
  console.log(`${LOG} 豆包Volc生图结果:`, JSON.stringify({ status: res.status, hasData: !!data?.data?.[0] }));

  if (!res.ok) throw new Error(`豆包生图失败: ${data?.error?.message || JSON.stringify(data)}`);

  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw new Error("豆包生图失败：未返回图片链接");

  const imgRes = await axios.get(imageUrl, { responseType: "arraybuffer" });
  const base64 = Buffer.from(imgRes.data).toString("base64");
  const mime = imgRes.headers["content-type"] || "image/png";
  return `data:${mime};base64,${base64}`;
}

export default async (input: ImageConfig, config: AIConfig): Promise<string> => {
  if (!config.model) throw new Error("缺少Model名称");
  if (!config.apiKey) throw new Error("缺少API Key");

  const apiKey = config.apiKey.replace("Bearer ", "");
  const baseURL = config.baseURL || "https://api.ricoxueai.cn/v1";

  const { isDefault, isImage } = await checkDoubaoImageModel(config.model!);
  if (isDefault) {
    if (!isImage) {
      console.error(`${LOG} 模型 ${config.model} 是内置默认模型但type不是image, 无法生成图片`);
      throw new Error(`模型 ${config.model} 不是图片类型模型，无法用于图片生成`);
    }
    console.log(`${LOG} 检测到内置默认图片模型, 使用豆包Volc专用接口 | model=${config.model}`);
    return await tryDoubaoVolcImage(input, apiKey, baseURL, config.model!);
  }

  const openai = new OpenAI({ apiKey, baseURL });
  const fullPrompt = input.systemPrompt ? `${input.systemPrompt}\n\n${input.prompt}` : input.prompt;
  const size = sizeMap[input.size] ?? "1024x1024";

  const requestBody = {
    model: config.model,
    prompt: fullPrompt,
    size: size as any,
    response_format: "b64_json" as const,
    n: 1,
  };

  console.log(`${LOG} OpenAI生图 | model=${config.model}, size=${size}, promptLength=${fullPrompt.length}`);

  let res: OpenAI.Images.ImagesResponse;
  try {
    res = await openai.images.generate(requestBody);
  } catch (err: any) {
    console.error(`${LOG} 请求失败:`, err?.status, err?.code, err?.message);
    throw err;
  }

  const b64 = res.data?.[0]?.b64_json;
  if (!b64) {
    console.error(`${LOG} 未返回有效数据`);
    throw new Error("图片生成失败：未返回有效数据");
  }
  console.log(`${LOG} 图片生成成功, base64长度=${b64.length}`);
  return b64;
};
