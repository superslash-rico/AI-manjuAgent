import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

const router = express.Router();

// 获取当前用户的全局 APIKey（登录时保存或配置时更新）
export default router.post("/", async (req, res) => {
  const userId = (req as any).user?.id ?? 1;
  const setting = await u.db("t_setting").where("userId", userId).select("apiKey").first();
  if (setting?.apiKey) {
    return res.status(200).send(success({ apiKey: setting.apiKey }));
  }
  // 若 t_setting 无 apiKey，尝试从 ricoxueai 配置中取
  const config = await u.db("t_config").where("userId", userId).where("manufacturer", "ricoxueai").select("apiKey").first();
  return res.status(200).send(success({ apiKey: config?.apiKey ?? "" }));
});
