import "../type";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { pollTask } from "@/utils/ai/utils";

// 策略一：OpenAI SDK（Sora 系列）
async function tryOpenAIVideos(input: VideoConfig, apiKey: string, baseURL: string, model: string): Promise<string> {
  const openai = new OpenAI({ apiKey, baseURL });

  const sizeMap: Record<string, OpenAI.Videos.VideoSize> = {
    "16:9": "1280x720",
    "9:16": "720x1280",
  };

  const video = await openai.videos.create({
    model: model as OpenAI.Videos.VideoModel,
    prompt: input.prompt,
    size: sizeMap[input.aspectRatio] || "1280x720",
    seconds: String(input.duration) as OpenAI.Videos.VideoSeconds,
  });

  console.log("[ricoxueai-video] OpenAI 提交成功, id:", video.id);

  return await pollTask(async () => {
    const status = await openai.videos.retrieve(video.id);
    console.log("[ricoxueai-video] OpenAI 轮询:", status.status, "progress:", status.progress);

    if (status.status === "completed") {
      const res = await openai.videos.downloadContent(video.id);
      const buffer = Buffer.from(await res.arrayBuffer());
      const savePath = input.savePath.endsWith(".mp4") ? input.savePath : path.join(input.savePath, `ricoxueai_${Date.now()}.mp4`);
      fs.writeFileSync(savePath, buffer);
      console.log("[ricoxueai-video] 视频下载完成, 大小:", buffer.length);
      return { completed: true, url: savePath };
    }
    if (status.status === "failed") {
      return { completed: false, error: `视频生成失败: ${status.error?.message || "未知错误"}` };
    }
    return { completed: false };
  });
}

// 策略二：通用视频接口 /v1/video/create（保底）
async function tryUniversalVideoCreate(input: VideoConfig, apiKey: string, baseURL: string, model: string): Promise<string> {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const body: Record<string, any> = {
    model,
    prompt: input.prompt,
    enhance_prompt: true,
  };

  if (input.aspectRatio) body.aspect_ratio = input.aspectRatio;
  if (input.imageBase64?.length) body.images = input.imageBase64;

  const submitRes = await fetch(`${baseURL}/video/create`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const submitData: any = await submitRes.json();
  console.log("[ricoxueai-video] 通用接口返回:", JSON.stringify(submitData));

  if (!submitRes.ok) {
    throw new Error(`任务提交失败: ${submitData?.error?.message || submitData?.message || JSON.stringify(submitData)}`);
  }

  const taskId = submitData.id;
  if (!taskId) throw new Error("任务提交失败: 未返回任务ID");

  let networkFailCount = 0;
  const maxNetworkFails = 5;

  return await pollTask(async () => {
    let data: any;
    try {
      const queryRes = await fetch(`${baseURL}/video/query?id=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      data = await queryRes.json();
      networkFailCount = 0;
    } catch (err: any) {
      networkFailCount++;
      console.warn(`[ricoxueai-video] 轮询网络异常(${networkFailCount}/${maxNetworkFails}):`, err?.message);
      if (networkFailCount >= maxNetworkFails) {
        return { completed: false, error: `轮询连续${maxNetworkFails}次网络异常: ${err?.message}` };
      }
      return { completed: false };
    }

    console.log("[ricoxueai-video] 通用接口轮询:", JSON.stringify({ status: data.status, video_url: data.video_url }));

    if (data.status === "completed" || data.status === "success") {
      const url = data.video_url || data.url;
      return url ? { completed: true, url } : { completed: false, error: "任务完成但未返回视频链接" };
    }
    if (data.status === "failed" || data.status === "error") {
      return { completed: false, error: `视频生成失败: ${data.error?.message || data.message || "未知错误"}` };
    }
    return { completed: false };
  });
}

export default async (input: VideoConfig, config: AIConfig): Promise<string> => {
  if (!config.model) throw new Error("缺少Model名称");
  if (!config.apiKey) throw new Error("缺少API Key");

  const apiKey = config.apiKey.replace("Bearer ", "");
  const baseURL = config.baseURL || "https://api.ricoxueai.cn/v1";

  console.log("[ricoxueai-video] 提交任务:", JSON.stringify({
    model: config.model,
    baseURL,
    duration: input.duration,
    aspectRatio: input.aspectRatio,
    promptLength: input.prompt.length,
    hasImage: !!input.imageBase64?.length,
  }));

  // 先尝试 OpenAI SDK，失败后使用通用接口保底
  try {
    return await tryOpenAIVideos(input, apiKey, baseURL, config.model!);
  } catch (err: any) {
    console.warn("[ricoxueai-video] OpenAI 接口失败, 切换通用接口. 原因:", err?.status || err?.code, err?.message);
  }

  return await tryUniversalVideoCreate(input, apiKey, baseURL, config.model!);
};
