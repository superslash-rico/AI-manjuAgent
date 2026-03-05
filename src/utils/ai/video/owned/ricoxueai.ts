import "../type";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import u from "@/utils";
import { pollTask } from "@/utils/ai/utils";

const LOG = "[ricoxueai-video]";

// 查询 t_config 判断是否为内置默认视频模型
const checkDoubaoVideoModel = async (
  model: string,
): Promise<{ isDefault: boolean; isVideo: boolean }> => {
  const row = await u
    .db("t_config")
    .where("model", model)
    .where("manufacturer", "ricoxueai")
    .where("source", "default")
    .select("type")
    .first();
  if (!row) return { isDefault: false, isVideo: false };
  return { isDefault: true, isVideo: row.type === "video" };
};

// 策略一：豆包 Volc API（doubao-seedance 等豆包系列模型专用）
async function tryDoubaoVolcVideo(
  input: VideoConfig,
  apiKey: string,
  baseURL: string,
  model: string,
): Promise<string> {
  const baseOrigin = baseURL.replace(/\/v1\/?$/, "");
  const volcEndpoint = `${baseOrigin}/volc/v1/contents/generations/tasks`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // 图生视频：text 含 --ratio --dur，image_url 用 data:image/png;base64,xxx；文生视频仅 text
  const hasImage = (input.imageBase64?.length ?? 0) > 0;
  const ratio = hasImage ? "adaptive" : input.aspectRatio || "16:9";
  const textContent = `${input.prompt}  --ratio ${ratio}  --dur ${input.duration}`;
  const content: Array<{
    type: string;
    text?: string;
    image_url?: { url: string };
  }> = [{ type: "text", text: textContent }];
  (input.imageBase64 || []).forEach((img) => {
    const url =
      img.startsWith("data:") || img.startsWith("http")
        ? img
        : `data:image/png;base64,${img}`;
    content.push({ type: "image_url", image_url: { url } });
  });

  const body = { model, content };

  // 请求体日志（base64 截断避免刷屏）
  const logBody = JSON.parse(JSON.stringify(body)) as typeof body;
  logBody.content?.forEach((item) => {
    if (item.image_url?.url && item.image_url.url.length > 80) {
      item.image_url.url =
        item.image_url.url.slice(0, 80) +
        `...[省略${item.image_url.url.length - 80}字符]`;
    }
  });
  console.log(`${LOG} 豆包Volc请求地址:`, volcEndpoint);
  console.log(`${LOG} 豆包Volc请求体:`, JSON.stringify(logBody));

  const submitRes = await fetch(volcEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const submitData: any = await submitRes.json();
  console.log(`${LOG} 豆包Volc响应体:`, JSON.stringify(submitData));

  if (!submitRes.ok || !submitData.id) {
    throw new Error(
      `豆包任务提交失败: ${submitData?.error?.message || JSON.stringify(submitData)}`,
    );
  }

  const taskId = submitData.id;
  console.log(`${LOG} 豆包Volc任务已提交 | taskId=${taskId}`);

  let networkFailCount = 0;
  const maxNetworkFails = 5;
  let lastStatus = "";

  return await pollTask(async () => {
    let data: any;
    try {
      const queryRes = await fetch(`${volcEndpoint}/${taskId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
      data = await queryRes.json();
      networkFailCount = 0;
    } catch (err: any) {
      networkFailCount++;
      console.warn(
        `${LOG} 豆包轮询网络异常(${networkFailCount}/${maxNetworkFails}):`,
        err?.message,
      );
      if (networkFailCount >= maxNetworkFails) {
        return {
          completed: false,
          error: `轮询连续${maxNetworkFails}次网络异常: ${err?.message}`,
        };
      }
      return { completed: false };
    }

    const { status } = data;

    // 状态变化时打印详细日志，避免重复刷屏
    if (status !== lastStatus) {
      lastStatus = status;
      if (status === "submitted") {
        console.log(
          `${LOG} 豆包轮询 | taskId=${taskId}, status=submitted (已提交，等待调度)`,
        );
      } else if (status === "running") {
        console.log(
          `${LOG} 豆包轮询 | taskId=${taskId}, status=running, model=${data.model}, createdAt=${data.created_at}`,
        );
      } else if (status === "succeeded") {
        console.log(
          `${LOG} 豆包轮询 | taskId=${taskId}, status=succeeded, duration=${data.duration}s, resolution=${data.resolution}, fps=${data.framespersecond}, tokens=${data.usage?.total_tokens}`,
        );
      } else {
        console.log(
          `${LOG} 豆包轮询 | taskId=${taskId}, status=${status}, raw=${JSON.stringify(data)}`,
        );
      }
    }

    if (status === "succeeded") {
      const videoUrl = data.content?.video_url;
      if (!videoUrl)
        return { completed: false, error: "任务成功但content中无video_url" };
      console.log(
        `${LOG} 豆包视频生成完成 | taskId=${taskId}, videoUrl=${videoUrl.substring(0, 120)}...`,
      );
      return { completed: true, url: videoUrl };
    }
    if (status === "submitted" || status === "running") {
      return { completed: false };
    }
    // failed / cancelled / expired 或其他未知状态
    console.error(
      `${LOG} 豆包任务异常终止 | taskId=${taskId}, status=${status}, raw=${JSON.stringify(data)}`,
    );
    return { completed: false, error: `任务${status}` };
  });
}

// 策略二：OpenAI SDK（Sora 系列）
async function tryOpenAIVideos(
  input: VideoConfig,
  apiKey: string,
  baseURL: string,
  model: string,
): Promise<string> {
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

  console.log(`${LOG} OpenAI提交成功 | id=${video.id}`);

  return await pollTask(async () => {
    const status = await openai.videos.retrieve(video.id);
    console.log(
      `${LOG} OpenAI轮询 | status=${status.status}, progress=${status.progress}`,
    );

    if (status.status === "completed") {
      const res = await openai.videos.downloadContent(video.id);
      const buffer = Buffer.from(await res.arrayBuffer());
      const savePath = input.savePath.endsWith(".mp4")
        ? input.savePath
        : path.join(input.savePath, `ricoxueai_${Date.now()}.mp4`);
      fs.writeFileSync(savePath, buffer);
      console.log(`${LOG} 视频下载完成 | 大小=${buffer.length}`);
      return { completed: true, url: savePath };
    }
    if (status.status === "failed") {
      return {
        completed: false,
        error: `视频生成失败: ${status.error?.message || "未知错误"}`,
      };
    }
    return { completed: false };
  });
}

// 策略三：通用视频接口 /v1/video/create（保底）
async function tryUniversalVideoCreate(
  input: VideoConfig,
  apiKey: string,
  baseURL: string,
  model: string,
): Promise<string> {
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
  console.log(`${LOG} 通用接口返回:`, JSON.stringify(submitData));

  if (!submitRes.ok) {
    throw new Error(
      `任务提交失败: ${submitData?.error?.message || submitData?.message || JSON.stringify(submitData)}`,
    );
  }

  const taskId = submitData.id;
  if (!taskId) throw new Error("任务提交失败: 未返回任务ID");

  let networkFailCount = 0;
  const maxNetworkFails = 5;

  return await pollTask(async () => {
    let data: any;
    try {
      const queryRes = await fetch(
        `${baseURL}/video/query?id=${encodeURIComponent(taskId)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
      );
      data = await queryRes.json();
      networkFailCount = 0;
    } catch (err: any) {
      networkFailCount++;
      console.warn(
        `${LOG} 轮询网络异常(${networkFailCount}/${maxNetworkFails}):`,
        err?.message,
      );
      if (networkFailCount >= maxNetworkFails) {
        return {
          completed: false,
          error: `轮询连续${maxNetworkFails}次网络异常: ${err?.message}`,
        };
      }
      return { completed: false };
    }

    console.log(
      `${LOG} 通用接口轮询:`,
      JSON.stringify({ status: data.status, video_url: data.video_url }),
    );

    if (data.status === "completed" || data.status === "success") {
      const url = data.video_url || data.url;
      return url
        ? { completed: true, url }
        : { completed: false, error: "任务完成但未返回视频链接" };
    }
    if (data.status === "failed" || data.status === "error") {
      return {
        completed: false,
        error: `视频生成失败: ${data.error?.message || data.message || "未知错误"}`,
      };
    }
    return { completed: false };
  });
}

export default async (
  input: VideoConfig,
  config: AIConfig,
): Promise<string> => {
  if (!config.model) throw new Error("缺少Model名称");
  if (!config.apiKey) throw new Error("缺少API Key");

  const apiKey = config.apiKey.replace("Bearer ", "");
  const baseURL = config.baseURL || "https://api.ricoxueai.cn/v1";

  console.log(
    `${LOG} 提交任务:`,
    JSON.stringify({
      model: config.model,
      baseURL,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      promptLength: input.prompt.length,
      hasImage: !!input.imageBase64?.length,
    }),
  );

  const model = config.model!;

  // 策略顺序：豆包 -> OpenAI -> 通用接口

  // 1. 豆包：模型名匹配 doubao-seed* 或 t_config 内置默认
  const isDoubaoByName = /^doubao-seed/i.test(model);
  const { isDefault, isVideo } = await checkDoubaoVideoModel(model);
  const useDoubaoFirst = isDoubaoByName || (isDefault && isVideo);

  if (useDoubaoFirst) {
    if (isDefault && !isVideo) {
      console.error(
        `${LOG} 模型 ${model} 是内置默认模型但type不是video, 跳过豆包`,
      );
    } else {
      try {
        console.log(`${LOG} 优先使用豆包Volc接口 | model=${model}`);
        return await tryDoubaoVolcVideo(input, apiKey, baseURL, model);
      } catch (err: any) {
        console.warn(`${LOG} 豆包接口失败, 尝试OpenAI. 原因:`, err?.message);
      }
    }
  }

  // 2. OpenAI SDK
  try {
    console.log(`${LOG} 尝试OpenAI接口 | model=${model}`);
    return await tryOpenAIVideos(input, apiKey, baseURL, model);
  } catch (err: any) {
    console.warn(
      `${LOG} OpenAI接口失败, 切换通用接口. 原因:`,
      err?.status || err?.code,
      err?.message,
    );
  }

  // 3. 通用接口保底
  return await tryUniversalVideoCreate(input, apiKey, baseURL, model);
};
