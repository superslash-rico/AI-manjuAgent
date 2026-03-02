import { Request, Response, NextFunction } from "express";

const LOG = "[HTTP]";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (req.method === "OPTIONS") return next();

  const startTime = Date.now();
  const { method, originalUrl, body } = req;

  console.log(`${LOG} --> ${method} ${originalUrl} | body=${JSON.stringify(body)}`);

  const originalSend = res.send.bind(res);
  res.send = (data: any) => {
    const duration = Date.now() - startTime;
    const bodyStr = typeof data === "string" ? data : JSON.stringify(data);
    const truncated = bodyStr.length > 500 ? bodyStr.substring(0, 500) + "..." : bodyStr;
    console.log(`${LOG} <-- ${method} ${originalUrl} | status=${res.statusCode} | ${duration}ms | body=${truncated}`);
    return originalSend(data);
  };

  next();
}
