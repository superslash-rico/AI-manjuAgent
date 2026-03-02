import express from "express";
import u from "@/utils";
import { z } from "zod";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { generateScript } from "@/utils/generateScript";
const router = express.Router();
interface NovelChapter {
  id: number;
  reel: string;
  chapter: string;
  chapterData: string;
  projectId: number;
}
function mergeNovelText(novelData: NovelChapter[]): string {
  if (!Array.isArray(novelData)) return "";
  return novelData
    .map((chap) => {
      return `${chap.chapter.trim()}\n\n${chap.chapterData.trim().replace(/\r?\n/g, "\n")}\n`;
    })
    .join("\n");
}

const LOG_PREFIX = "[generateScriptApi]";

// 生成剧本
export default router.post(
  "/",
  validateFields({
    outlineId: z.number(),
    scriptId: z.number(),
  }),
  async (req, res) => {
    const reqStartTime = Date.now();
    const { outlineId, scriptId } = req.body;
    console.log(`${LOG_PREFIX} 请求开始 | outlineId=${outlineId}, scriptId=${scriptId}`);

    console.log(`${LOG_PREFIX} 查询大纲数据 | outlineId=${outlineId}`);
    const outlineData = await u.db("t_outline").where("id", outlineId).select("*").first();
    if (!outlineData) {
      console.warn(`${LOG_PREFIX} 大纲不存在 | outlineId=${outlineId}, 耗时=${Date.now() - reqStartTime}ms`);
      return res.status(500).send(success({ message: "大纲为空" }));
    }
    console.log(`${LOG_PREFIX} 查询大纲成功 | outlineId=${outlineId}, projectId=${outlineData.projectId}`);

    const parameter = JSON.parse(outlineData.data!);
    console.log(`${LOG_PREFIX} 大纲参数解析完成 | chapterRange=${JSON.stringify(parameter.chapterRange)}, episodeIndex=${parameter.episodeIndex}, title=${parameter.title ?? "-"}`);

    console.log(`${LOG_PREFIX} 查询原文数据 | projectId=${outlineData.projectId}, chapterRange=${JSON.stringify(parameter.chapterRange)}`);
    const novelData = (await u
      .db("t_novel")
      .whereIn("chapterIndex", parameter.chapterRange)
      .where("projectId", outlineData.projectId)
      .select("*")) as NovelChapter[];

    if (novelData.length == 0) {
      console.warn(`${LOG_PREFIX} 原文为空 | projectId=${outlineData.projectId}, chapterRange=${JSON.stringify(parameter.chapterRange)}, 耗时=${Date.now() - reqStartTime}ms`);
      return res.status(500).send(success({ message: "原文为空" }));
    }
    console.log(`${LOG_PREFIX} 查询原文成功 | 章节数=${novelData.length}, 章节列表=[${novelData.map((n) => n.chapter).join(", ")}]`);

    const result: string = mergeNovelText(novelData);
    console.log(`${LOG_PREFIX} 原文合并完成 | 合并后文本长度=${result.length}字符`);

    console.log(`${LOG_PREFIX} 开始调用AI生成剧本...`);
    const aiStartTime = Date.now();
    const data = await generateScript(parameter ?? "", result ?? "");
    const aiDuration = Date.now() - aiStartTime;

    if (!data) {
      console.error(`${LOG_PREFIX} AI生成剧本失败 | AI耗时=${aiDuration}ms, 总耗时=${Date.now() - reqStartTime}ms`);
      return res.status(500).send({ message: "生成剧本失败" });
    }
    console.log(`${LOG_PREFIX} AI生成剧本成功 | AI耗时=${aiDuration}ms, 剧本长度=${data.length}字符`);

    console.log(`${LOG_PREFIX} 保存剧本到数据库 | scriptId=${scriptId}`);
    await u.db("t_script").where("id", scriptId).update({
      content: data,
    });
    console.log(`${LOG_PREFIX} 剧本保存成功 | scriptId=${scriptId}`);

    const totalDuration = Date.now() - reqStartTime;
    console.log(`${LOG_PREFIX} 请求完成 | outlineId=${outlineId}, scriptId=${scriptId}, AI耗时=${aiDuration}ms, 总耗时=${totalDuration}ms`);
    res.status(200).send(success({ message: "生成剧本成功" }));
  },
);
