import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";

const router = express.Router();

// 持久化当前用户的全局 APIKey
export default router.post(
  "/",
  validateFields({ apiKey: z.string() }),
  async (req, res) => {
    const userId = (req as any).user?.id ?? 1;
    const { apiKey } = req.body;
    const setting = await u.db("t_setting").where("userId", userId).first();
    if (setting) {
      await u.db("t_setting").where("userId", userId).update({ apiKey });
    } else {
      const tokenKey = Buffer.from(Date.now() + Math.random().toString()).toString("base64");
      await u.db("t_setting").insert({ userId, tokenKey, apiKey });
    }
    res.status(200).send(success("保存成功"));
  },
);
