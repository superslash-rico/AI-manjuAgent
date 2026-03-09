import * as Minio from "minio";
import { v4 as uuidv4 } from "uuid";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function getMinioClient(): Minio.Client | null {
  const endPoint = process.env.MINIO_ENDPOINT;
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  if (!endPoint || !accessKey || !secretKey) return null;
  const port = parseInt(process.env.MINIO_PORT || "9000", 10);
  const useSSL = process.env.MINIO_USE_SSL === "true";
  return new Minio.Client({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
  });
}

/** base64 或 data URL 上传至 MinIO，返回公网 URL；未配置则返回 null */
export async function uploadBase64ToMinio(
  base64OrDataUrl: string,
  prefix?: string,
): Promise<string | null> {
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET || "manju";
  if (!client) return null;

  let mimeType = "image/png";
  let base64Data = base64OrDataUrl;
  const dataUrlMatch = base64OrDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1];
    base64Data = dataUrlMatch[2];
  } else if (base64OrDataUrl.startsWith("/9j/")) {
    mimeType = "image/jpeg";
  } else if (base64OrDataUrl.startsWith("iVBORw")) {
    mimeType = "image/png";
  } else if (base64OrDataUrl.startsWith("UklGR")) {
    mimeType = "image/webp";
  }

  const buffer = Buffer.from(base64Data, "base64");
  const ext = MIME_TO_EXT[mimeType] || "png";
  const objectName =
    prefix ||
    `video-refs/${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;

  const exists = await client.bucketExists(bucket);
  if (!exists) await client.makeBucket(bucket, "us-east-1");

  await client.putObject(bucket, objectName, buffer, buffer.length, {
    "Content-Type": mimeType,
  });

  // 使用预签名 URL，无需桶公开策略，豆包等外部 API 即可访问
  const expiry = parseInt(process.env.MINIO_PRESIGNED_EXPIRY_SECONDS || "86400", 10); // 默认 24 小时
  return client.presignedGetObject(bucket, objectName, expiry);
}
