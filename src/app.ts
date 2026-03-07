import "./logger";
import "./err";
import "./env";
import express, { Request, Response, NextFunction } from "express";
import expressWs from "express-ws";
import logger from "morgan";
import cors from "cors";
import buildRoute from "@/core";
import fs from "fs";
import path from "path";
import u from "@/utils";
import jwt from "jsonwebtoken";

const app = express();
let server: ReturnType<typeof app.listen> | null = null;

export default async function startServe() {
  if (process.env.NODE_ENV == "dev") await buildRoute();

  expressWs(app);

  app.use(logger("dev"));
  app.use(cors({ origin: "*" }));
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));

  let rootDir: string;
  if (typeof process.versions?.electron !== "undefined") {
    const { app } = require("electron");
    const userDataDir: string = app.getPath("userData");
    rootDir = path.join(userDataDir, "uploads");
  } else {
    rootDir = path.join(process.cwd(), "uploads");
  }

  // 确保 uploads 目录存在
  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
  }
  console.log("文件目录:", rootDir);

  app.use(express.static(rootDir));

  app.use(async (req, res, next) => {
    // 从 header 或 query 参数获取 token
    const rawToken = req.headers.authorization || (req.query.token as string) || "";
    const token = rawToken.replace("Bearer ", "");
    // 白名单路径
    if (req.path === "/other/login" || req.path === "/other/apiKeyLogin") return next();

    if (!token) return res.status(401).send({ message: "未提供token" });

    const decodedToken = jwt.decode(token) as { id?: number } | null;
    const setting =
      (decodedToken?.id && (await u.db("t_setting").where("userId", decodedToken.id).select("tokenKey").first())) ||
      (await u.db("t_setting").where("id", 1).select("tokenKey").first());
    if (!setting?.tokenKey) return res.status(500).send({ message: "服务器未配置，请联系管理员" });

    try {
      const decoded = jwt.verify(token, setting.tokenKey as string) as { id?: number; sessionId?: string };
      const sessionId = decoded?.sessionId;
      if (!sessionId) return res.status(401).send({ message: "无效的token，请重新登录" });
      const session = await u.db("t_login_session").where("sessionId", sessionId).first();
      if (!session || (session.expiresAt && session.expiresAt < Date.now()))
        return res.status(401).send({ message: "登录已过期，请重新登录" });
      (req as any).user = decoded;
      next();
    } catch (err) {
      return res.status(401).send({ message: "无效的token" });
    }
  });

  const { requestLogger } = await import("@/middleware/requestLogger");
  app.use(requestLogger);

  const router = await import("@/router");
  await router.default(app);

  // 404 处理
  app.use((_, res, next: NextFunction) => {
    return res.status(404).send({ message: "Not Found" });
  });

  // 错误处理
  app.use((err: any, _: Request, res: Response, __: NextFunction) => {
    res.locals.message = err.message;
    res.locals.error = err;
    console.error(err);
    res.status(err.status || 500).send(err);
  });

  const port = parseInt(process.env.PORT || "60000");
  server = app.listen(port, async () => {
    const address = server?.address();
    const realPort = typeof address === "string" ? address : address?.port;
    console.log(`[服务启动成功]: http://localhost:${realPort}`);
  });
}

// 支持await关闭
export function closeServe(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (server) {
      server.close((err?: Error) => {
        if (err) return reject(err);
        console.log("[服务已关闭]");
        resolve();
      });
    } else {
      resolve();
    }
  });
}

const isElectron = typeof process.versions?.electron !== "undefined";
if (!isElectron) startServe();
