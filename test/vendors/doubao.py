#!/usr/bin/env python3
"""
厂商: 豆包（字节跳动）
端点: POST /volc/v1/contents/generations/tasks  →  GET /volc/v1/contents/generations/tasks/{id}
文档状态值: pending / processing / completed / failed
视频链接: status_data["video_url"] 或 status_data["content"]["video_url"]

用法:
  python doubao.py
  VIDEO_MODEL=doubao-video-generation python doubao.py
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


def run_doubao(client: httpx.Client) -> None:
    model = os.environ.get("VIDEO_MODEL", "doubao-video-generation")
    log(f"[豆包] 模型={model}")

    # 1. 创建
    payload = {
        "model":   model,
        "content": [{"type": "text", "text": PROMPT}],
        "req_key": "high_aes_general_v21_L20",
        "ratio":   "16:9",
    }
    data = api_post(client, f"{BASE_URL}/volc/v1/contents/generations/tasks", payload)
    task_id = data.get("id") or data.get("task_id")
    if not task_id:
        raise ValueError(f"未找到任务 ID: {data}")
    log(f"[豆包] 任务已提交 task_id={task_id}")

    # 2. 轮询
    for i in range(1, MAX_ATTEMPTS + 1):
        __import__("time").sleep(POLL_INTERVAL)
        d = api_get(client, f"{BASE_URL}/volc/v1/contents/generations/tasks/{task_id}")
        status = d.get("status", "unknown")
        log(f"[豆包] 轮询 #{i:03d} status={status}")

        if status == "completed":
            url = (
                d.get("video_url")
                or (d.get("content") or {}).get("video_url")
                or d.get("url")
            )
            if not url:
                raise ValueError(f"未找到视频 URL: {d}")
            out = save_video(task_id, try_download_url(url))
            log(f"[豆包] ✓ 下载完成 → {out} ({out.stat().st_size} bytes)")
            return

        if status == "failed":
            raise RuntimeError(d.get("error") or d.get("message") or "生成失败")

    raise TimeoutError("豆包 轮询超时")


if __name__ == "__main__":
    log("=" * 60)
    log("云雾 API 视频生成测试 — 厂商: 豆包")
    log("=" * 60)
    with httpx.Client(headers=base_headers(), timeout=30) as client:
        try:
            run_doubao(client)
            log("测试通过 ✓")
        except httpx.HTTPStatusError as e:
            log(f"HTTP 错误 {e.response.status_code}: {e.response.text}", "ERROR")
            sys.exit(1)
        except Exception as e:
            log(f"失败: {e}", "ERROR")
            sys.exit(1)
