import express from "express";
import u from "@/utils";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { success, error } from "@/lib/responseFormat";
import { validateFields } from "@/middleware/middleware";
import { z } from "zod";
const router = express.Router();

const SESSION_EXPIRE_MS = 180 * 24 * 60 * 60 * 1000;

export function setToken(payload: string | object, expiresIn: string | number, secret: string): string {
  if (!payload || typeof secret !== "string" || !secret) {
    throw new Error("参数不合法");
  }
  return (jwt.sign as any)(payload, secret, { expiresIn });
}

// 登录
export default router.post(
  "/",
  validateFields({
    username: z.string(),
    password: z.string(),
  }),
  async (req, res) => {
    const { username, password } = req.body;

    const data = await u.db("t_user").where("name", "=", username).first();
    if (!data) return res.status(400).send(error("登录失败"));

    if (data!.password == password && data!.name == username) {
      const tokenSecret = await u.db("t_setting").where("userId", data.id).select("tokenKey").first();
      const sessionId = uuid();
      const now = Date.now();

      const token = setToken(
        {
          id: data!.id,
          name: data!.name,
          sessionId,
        },
        "180Days",
        tokenSecret?.tokenKey as string,
      );

      await u.db("t_login_session").insert({
        userId: data.id,
        sessionId,
        loginType: "account",
        expiresAt: now + SESSION_EXPIRE_MS,
        createdAt: now,
      });

      return res.status(200).send(success({ token: "Bearer " + token, name: data!.name, id: data!.id }, "登录成功"));
    } else {
      return res.status(400).send(error("用户名或密码错误"));
    }
  },
);
