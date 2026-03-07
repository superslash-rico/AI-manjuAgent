import express from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

const router = express.Router();

// 登出：删除 session，需鉴权（token 有效时才能调用）
export default router.post("/", async (req, res) => {
  const user = (req as any).user;
  const sessionId = user?.sessionId;
  if (sessionId) await u.db("t_login_session").where("sessionId", sessionId).del();
  return res.status(200).send(success(null, "已退出登录"));
});
