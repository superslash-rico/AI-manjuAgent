#!/usr/bin/env python3
"""
厂商: Veo (Google)
端点: POST /v1/videos  →  GET /v1/videos/{id}  →  GET /v1/videos/{id}/content
文档状态值: pending / video_generating / completed / failed

用法:
  python veo.py
  VIDEO_MODEL=veo3-fast python veo.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from vendors.common import (
    BASE_URL, MAX_ATTEMPTS, POLL_INTERVAL, PROMPT,
    api_get, api_post, base_headers, log, save_video, try_download_url,
)


def run_veo(client: httpx.Client) -> None:
    model = os.environ.get("VIDEO_MODEL", "veo3-fast")
    log(f"[Veo] 模型={model}")

    # 1. 创建
    payload = {
        "model":   model,
        "prompt":  PROMPT,
        "size":    "1280x720",
        "seconds": 5,
    }
    data = api_post(client, f"{BASE_URL}/v1/videos", payload)
    task_id = data.get("id") or data.get("task_id")
    if not task_id:
        raise ValueError(f"未找到任务 ID: {data}")
    log(f"[Veo] 任务已提交 task_id={task_id}")

    # 2. 轮询
    for i in range(1, MAX_ATTEMPTS + 1):
        __import__("time").sleep(POLL_INTERVAL)
        d = api_get(client, f"{BASE_URL}/v1/videos/{task_id}")
        status = d.get("status", "unknown")
        progress = d.get("progress", 0)
        log(f"[Veo] 轮询 #{i:03d} status={status} progress={progress}%")

        if status == "completed":
            # 优先走 /content 接口
            try:
                cr = client.get(f"{BASE_URL}/v1/videos/{task_id}/content",
                                follow_redirects=True, timeout=120)
                cr.raise_for_status()
                out = save_video(task_id, cr.content)
            except Exception as e:
                log(f"[Veo] /content 下载失败，尝试 url 字段: {e}", "WARN")
                url = d.get("url") or d.get("video_url")
                if not url:
                    raise ValueError(f"未找到视频 URL: {d}")
                out = save_video(task_id, try_download_url(url))
            log(f"[Veo] ✓ 下载完成 → {out} ({out.stat().st_size} bytes)")
            return

        if status == "failed":
            raise RuntimeError(d.get("error") or d.get("message") or "生成失败")

    raise TimeoutError("Veo 轮询超时")


if __name__ == "__main__":
    log("=" * 60)
    log("云雾 API 视频生成测试 — 厂商: VEO")
    log("=" * 60)
    with httpx.Client(headers=base_headers(), timeout=30) as client:
        try:
            run_veo(client)
            log("测试通过 ✓")
        except httpx.HTTPStatusError as e:
            log(f"HTTP 错误 {e.response.status_code}: {e.response.text}", "ERROR")
            sys.exit(1)
        except Exception as e:
            log(f"失败: {e}", "ERROR")
            sys.exit(1)
