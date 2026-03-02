#!/usr/bin/env python3
"""
公共工具模块 — 供各厂商测试文件共享使用
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path

try:
    import httpx
except ImportError:
    import sys
    print("请先安装依赖: pip install httpx")
    sys.exit(1)

# ── 全局配置 ───────────────────────────────────────────────────────────
BASE_URL = "https://api.ricoxueai.cn"  # 替换为实际服务地址
API_KEY = (
    os.environ.get("RICOXUEAI_API_KEY")
    or os.environ.get("OPENAI_API_KEY")
    or "sk-O5QEXXZyvBKuzCW9K2PZFe56OCRBwd5zLMkNSR3o6H4pdb0G"
).replace("Bearer ", "").strip()

PROMPT = "一只可爱的橘猫在阳光下打盹，窗外是春天的草地"
POLL_INTERVAL = 5     # 秒
MAX_ATTEMPTS = 120    # 最多 120×5s = 10 分钟

OUTPUT_DIR = Path(__file__).resolve().parent.parent
# ─────────────────────────────────────────────────────────────────────


def log(msg: str, level: str = "INFO") -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}", flush=True)


def base_headers() -> dict:
    return {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}


def save_video(task_id: str, content: bytes) -> Path:
    out = OUTPUT_DIR / f"output_{task_id}.mp4"
    out.write_bytes(content)
    return out


def api_post(client: httpx.Client, url: str, payload: dict) -> dict:
    """发送 POST 请求并打印请求/响应日志。"""
    log(f">>> POST {url}")
    log(f">>> 请求载荷: {json.dumps(payload, ensure_ascii=False, indent=2)}")
    r = client.post(url, json=payload)
    log(f"<<< HTTP {r.status_code}")
    try:
        data = r.json()
        log(f"<<< 响应内容: {json.dumps(data, ensure_ascii=False, indent=2)}")
    except Exception:
        log(f"<<< 响应原文: {r.text[:2000]}")
        data = {}
    r.raise_for_status()
    return data


def api_get(client: httpx.Client, url: str, params: dict = None) -> dict:
    """发送 GET 请求并打印请求/响应日志。"""
    log(f">>> GET {url}" + (f"?{httpx.QueryParams(params)}" if params else ""))
    r = client.get(url, params=params)
    log(f"<<< HTTP {r.status_code}")
    try:
        data = r.json()
        log(f"<<< 响应内容: {json.dumps(data, ensure_ascii=False, indent=2)}")
    except Exception:
        log(f"<<< 响应原文: {r.text[:2000]}")
        data = {}
    r.raise_for_status()
    return data


def try_download_url(url: str, timeout: int = 120) -> bytes:
    """从 CDN 直链下载，不带鉴权头。"""
    log(f">>> 下载 GET {url}")
    r = httpx.get(url, follow_redirects=True, timeout=timeout)
    log(f"<<< HTTP {r.status_code} | 大小={len(r.content)} bytes")
    r.raise_for_status()
    return r.content
