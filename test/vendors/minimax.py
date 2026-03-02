#!/usr/bin/env python3
"""
厂商: 海螺 Minimax / Hailuo
端点: POST /minimax/v1/video_generation  →  GET /minimax/v1/query/video_generation?task_id={id}
文档状态值: Queueing / Processing / Success / Fail
视频链接: status_data["file"]["url"]

用法:
  python minimax.py
  VIDEO_MODEL=MiniMax-Hailuo-02 python minimax.py
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


def run_minimax(client: httpx.Client) -> None:
    model = os.environ.get("VIDEO_MODEL", "MiniMax-Hailuo-02")
    log(f"[Minimax] 模型={model}")

    # 1. 创建
    payload = {
        "model":    model,   # MiniMax-Hailuo-02 / MiniMax-Hailuo-02-Director
        "prompt":   PROMPT,
        "duration": 6,
    }
    data = api_post(client, f"{BASE_URL}/minimax/v1/video_generation", payload)
    task_id = data.get("task_id") or data.get("id")
    if not task_id:
        raise ValueError(f"未找到任务 ID: {data}")
    log(f"[Minimax] 任务已提交 task_id={task_id}")

    # 2. 轮询
    for i in range(1, MAX_ATTEMPTS + 1):
        __import__("time").sleep(POLL_INTERVAL)
        d = api_get(client, f"{BASE_URL}/minimax/v1/query/video_generation",
                   params={"task_id": task_id})
        status = d.get("status", "unknown")
        log(f"[Minimax] 轮询 #{i:03d} status={status}")

        if status in ("Success", "completed", "SUCCESS"):
            url = (
                (d.get("file") or {}).get("url")
                or d.get("video_url")
                or d.get("url")
            )
            if not url:
                raise ValueError(f"未找到视频 URL: {d}")
            out = save_video(task_id, try_download_url(url))
            log(f"[Minimax] ✓ 下载完成 → {out} ({out.stat().st_size} bytes)")
            return

        if status in ("Fail", "FAILED", "failed"):
            raise RuntimeError(d.get("error") or d.get("message") or "生成失败")

    raise TimeoutError("Minimax 轮询超时")


if __name__ == "__main__":
    log("=" * 60)
    log("云雾 API 视频生成测试 — 厂商: MINIMAX")
    log("=" * 60)
    with httpx.Client(headers=base_headers(), timeout=30) as client:
        try:
            run_minimax(client)
            log("测试通过 ✓")
        except httpx.HTTPStatusError as e:
            log(f"HTTP 错误 {e.response.status_code}: {e.response.text}", "ERROR")
            sys.exit(1)
        except Exception as e:
            log(f"失败: {e}", "ERROR")
            sys.exit(1)
