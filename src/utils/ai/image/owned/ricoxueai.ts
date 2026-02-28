import "../type";
import { generateImage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export default async (input: ImageConfig, config: AIConfig): Promise<string> => {
  if (!config.model) throw new Error("缺少Model名称");
  if (!config.apiKey) throw new Error("缺少API Key");

  const apiKey = config.apiKey.replace("Bearer ", "");
  const baseURL = config.baseURL || "https://api.ricoxueai.cn/v1";

  const provider = createOpenAICompatible({
    name: "ricoxueai",
    baseURL,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const sizeMap: Record<string, `${number}x${number}`> = {
    "1K": "1024x1024",
    "2K": "2048x2048",
    "4K": "4096x4096",
  };

  const fullPrompt = input.systemPrompt ? `${input.systemPrompt}\n\n${input.prompt}` : input.prompt;

  const { image } = await generateImage({
    model: provider.imageModel(config.model),
    prompt:
      input.imageBase64 && input.imageBase64.length
        ? { text: fullPrompt, images: input.imageBase64 }
        : fullPrompt,
    aspectRatio: input.aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
    size: sizeMap[input.size] ?? "1024x1024",
  });

  return image.base64;
};
