#!/usr/bin/env python3
"""
厂商: Luma Dream Machine
端点: POST /luma/generations  →  GET /luma/generations/{id}
文档状态值: queued / dreaming / completed / failed
视频链接: status_data["artifacts"]["video"]["url"]

用法:
  python luma.py
  VIDEO_MODEL=ray-v2 python luma.py
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


def run_luma(client: httpx.Client) -> None:
    model = os.environ.get("VIDEO_MODEL", "ray-v1")
    log(f"[Luma] 模型={model}")

    # 1. 创建
    payload = {
        "user_prompt":    PROMPT,
        "model_name":     model,    # ray-v1 / ray-v2 / ray2-1080p
        "loop":           False,
        "expand_prompt":  True,
    }
    data = api_post(client, f"{BASE_URL}/luma/generations", payload)
    task_id = data.get("id") or data.get("task_id")
    if not task_id:
        raise ValueError(f"未找到任务 ID: {data}")
    log(f"[Luma] 任务已提交 task_id={task_id}")

    # 2. 轮询
    for i in range(1, MAX_ATTEMPTS + 1):
        __import__("time").sleep(POLL_INTERVAL)
        d = api_get(client, f"{BASE_URL}/luma/generations/{task_id}")
        status = d.get("state", d.get("status", "unknown"))
        log(f"[Luma] 轮询 #{i:03d} status={status}")

        if status == "completed":
            url = (
                (d.get("artifacts") or {}).get("video", {}).get("url")
                or d.get("video_url")
                or d.get("url")
            )
            if not url:
                raise ValueError(f"未找到视频 URL: {d}")
            out = save_video(task_id, try_download_url(url))
            log(f"[Luma] ✓ 下载完成 → {out} ({out.stat().st_size} bytes)")
            return

        if status == "failed":
            raise RuntimeError(d.get("failure_reason") or d.get("error") or "生成失败")

    raise TimeoutError("Luma 轮询超时")


if __name__ == "__main__":
    log("=" * 60)
    log("云雾 API 视频生成测试 — 厂商: LUMA")
    log("=" * 60)
    with httpx.Client(headers=base_headers(), timeout=30) as client:
        try:
            run_luma(client)
            log("测试通过 ✓")
        except httpx.HTTPStatusError as e:
            log(f"HTTP 错误 {e.response.status_code}: {e.response.text}", "ERROR")
            sys.exit(1)
        except Exception as e:
            log(f"失败: {e}", "ERROR")
            sys.exit(1)
