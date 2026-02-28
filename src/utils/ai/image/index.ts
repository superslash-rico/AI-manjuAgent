import "./type";
import u from "@/utils";
import modelList, { getRicoxueaiModels } from "./modelList";
import axios from "axios";

import volcengine from "./owned/volcengine";
import kling from "./owned/kling";
import vidu from "./owned/vidu";
import runninghub from "./owned/runninghub";
import apimart from "./owned/apimart";
import other from "./owned/other";
import gemini from "./owned/gemini";
import ricoxueai from "./owned/ricoxueai";

const urlToBase64 = async (url: string): Promise<string> => {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const base64 = Buffer.from(res.data).toString("base64");
  const mimeType = res.headers["content-type"] || "image/png";
  return `data:${mimeType};base64,${base64}`;
};

const modelInstance = {
  gemini: gemini,
  volcengine: volcengine,
  kling: kling,
  vidu: vidu,
  runninghub: runninghub,
  ricoxueai: ricoxueai,
  // apimart: apimart,
  other,
} as const;

export default async (input: ImageConfig, config: AIConfig) => {
  console.log("%c Line:32 🥪 config", "background:#33a5ff", config);
  const { model, apiKey, baseURL, manufacturer } = { ...config };
  if (!config || !config?.model || !config?.apiKey || !config?.manufacturer) throw new Error("请检查模型配置是否正确");

  const manufacturerFn = modelInstance[manufacturer as keyof typeof modelInstance];
  if (!manufacturerFn) if (!manufacturerFn) throw new Error("不支持的图片厂商");
  if (manufacturer !== "other") {
    if (manufacturer === "ricoxueai") {
      const ricoxueaiModels = getRicoxueaiModels();
      if (!ricoxueaiModels.includes(model!)) throw new Error("不支持的模型");
    } else {
      const owned = modelList.find((m) => m.model === model);
      if (!owned) throw new Error("不支持的模型");
    }
  }

  // 补充图片的 base64 内容类型字符串
  if (input.imageBase64 && input.imageBase64.length > 0) {
    input.imageBase64 = input.imageBase64.map((img) => {
      if (img.startsWith("data:image/")) {
        return img;
      }
      // 根据 base64 头部判断图片类型
      if (img.startsWith("/9j/")) {
        return `data:image/jpeg;base64,${img}`;
      }
      if (img.startsWith("iVBORw")) {
        return `data:image/png;base64,${img}`;
      }
      if (img.startsWith("R0lGOD")) {
        return `data:image/gif;base64,${img}`;
      }
      if (img.startsWith("UklGR")) {
        return `data:image/webp;base64,${img}`;
      }
      // 默认使用 png
      return `data:image/png;base64,${img}`;
    });
  }

  let imageUrl = await manufacturerFn(input, { model, apiKey, baseURL });
  console.log("%c Line:68 🍷 imageUrl", "background:#4fff4B", imageUrl);
  if (!input.resType) input.resType = "b64";
  if (input.resType === "b64" && imageUrl.startsWith("http")) imageUrl = await urlToBase64(imageUrl);
  return imageUrl;
};
