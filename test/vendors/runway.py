#!/usr/bin/env python3
"""
厂商: Runway Gen-3
端点: POST /runwayml/v1/image_to_video  →  GET /runwayml/v1/tasks/{id}
文档状态值: submitted / RUNNING / SUCCEEDED / FAILED
视频链接: status_data["video_url"] 或 status_data["output"][0]

用法:
  python runway.py
  VIDEO_MODEL=gen3a_turbo python runway.py
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


def run_runway(client: httpx.Client) -> None:
    model = os.environ.get("VIDEO_MODEL", "gen3a_turbo")
    log(f"[Runway] 模型={model}")

    # 1. 创建（文生视频，无垫图）
    payload = {
        "model":       model,   # gen3a_turbo / gen-3a-turbo
        "promptText":  PROMPT,
        "duration":    5,
        "ratio":       "1280:720",
    }
    data = api_post(client, f"{BASE_URL}/runwayml/v1/image_to_video", payload)
    task_id = data.get("id") or data.get("task_id")
    if not task_id:
        raise ValueError(f"未找到任务 ID: {data}")
    log(f"[Runway] 任务已提交 task_id={task_id}")

    # 2. 轮询
    for i in range(1, MAX_ATTEMPTS + 1):
        __import__("time").sleep(POLL_INTERVAL)
        d = api_get(client, f"{BASE_URL}/runwayml/v1/tasks/{task_id}")
        status = d.get("status", "unknown")
        log(f"[Runway] 轮询 #{i:03d} status={status}")

        if status in ("SUCCEEDED", "completed"):
            url = (
                d.get("video_url")
                or d.get("url")
                or (d.get("output") or [None])[0]
            )
            if not url:
                raise ValueError(f"未找到视频 URL: {d}")
            out = save_video(task_id, try_download_url(url))
            log(f"[Runway] ✓ 下载完成 → {out} ({out.stat().st_size} bytes)")
            return

        if status in ("FAILED", "failed"):
            raise RuntimeError(d.get("error") or d.get("message") or "生成失败")

    raise TimeoutError("Runway 轮询超时")


if __name__ == "__main__":
    log("=" * 60)
    log("云雾 API 视频生成测试 — 厂商: RUNWAY")
    log("=" * 60)
    with httpx.Client(headers=base_headers(), timeout=30) as client:
        try:
            run_runway(client)
            log("测试通过 ✓")
        except httpx.HTTPStatusError as e:
            log(f"HTTP 错误 {e.response.status_code}: {e.response.text}", "ERROR")
            sys.exit(1)
        except Exception as e:
            log(f"失败: {e}", "ERROR")
            sys.exit(1)
