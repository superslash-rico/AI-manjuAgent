#!/usr/bin/env python3
"""
厂商: 通义万象（阿里巴巴）
端点:
  POST /alibailian/api/v1/services/aigc/video-generation/video-synthesis
  GET  /alibailian/api/v1/services/aigc/video-generation/video-synthesis-query?task_id={id}
文档状态值: PENDING / RUNNING / SUCCEEDED / FAILED
视频链接: status_data["output"]["video_url"]

用法:
  python wanx.py
  VIDEO_MODEL=wan2.5-14b-turbo python wanx.py
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

WANX_CREATE = f"{BASE_URL}/alibailian/api/v1/services/aigc/video-generation/video-synthesis"
WANX_QUERY  = f"{BASE_URL}/alibailian/api/v1/services/aigc/video-generation/video-synthesis-query"


def run_wanx(client: httpx.Client) -> None:
    model = os.environ.get("VIDEO_MODEL", "wan2.5-turbo")
    log(f"[通义万象] 模型={model}")

    # 1. 创建
    payload = {
        "model": model,   # wan2.5-turbo / wan2.5-14b-turbo / wan2.5-i2v-preview
        "input": {"prompt": PROMPT},
        "parameters": {
            "size":     "1280*720",
            "duration": 5,
        },
    }
    data = api_post(client, WANX_CREATE, payload)
    task_id = data.get("output", {}).get("task_id") or data.get("task_id") or data.get("id")
    if not task_id:
        raise ValueError(f"未找到任务 ID: {data}")
    log(f"[通义万象] 任务已提交 task_id={task_id}")

    # 2. 轮询
    for i in range(1, MAX_ATTEMPTS + 1):
        __import__("time").sleep(POLL_INTERVAL)
        d = api_get(client, WANX_QUERY, params={"task_id": task_id})
        status = (d.get("output") or {}).get("task_status") or d.get("status", "unknown")
        log(f"[通义万象] 轮询 #{i:03d} status={status}")

        if status in ("SUCCEEDED", "completed"):
            url = (
                (d.get("output") or {}).get("video_url")
                or d.get("video_url")
                or d.get("url")
            )
            if not url:
                raise ValueError(f"未找到视频 URL: {d}")
            out = save_video(task_id, try_download_url(url))
            log(f"[通义万象] ✓ 下载完成 → {out} ({out.stat().st_size} bytes)")
            return

        if status in ("FAILED", "failed"):
            raise RuntimeError(
                (d.get("output") or {}).get("message") or d.get("message") or "生成失败"
            )

    raise TimeoutError("通义万象 轮询超时")


if __name__ == "__main__":
    log("=" * 60)
    log("云雾 API 视频生成测试 — 厂商: 通义万象")
    log("=" * 60)
    with httpx.Client(headers=base_headers(), timeout=30) as client:
        try:
            run_wanx(client)
            log("测试通过 ✓")
        except httpx.HTTPStatusError as e:
            log(f"HTTP 错误 {e.response.status_code}: {e.response.text}", "ERROR")
            sys.exit(1)
        except Exception as e:
            log(f"失败: {e}", "ERROR")
            sys.exit(1)
