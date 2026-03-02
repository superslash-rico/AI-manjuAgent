#!/usr/bin/env python3
"""
云雾 API 多厂商视频生成测试脚本（主入口）
支持: veo / luma / runway / minimax / doubao / sora / grok / wanx

用法:
  python test_ricoxueai_video.py              # 使用默认厂商 (veo)
  python test_ricoxueai_video.py veo          # Google Veo
  python test_ricoxueai_video.py luma         # Luma Dream Machine
  python test_ricoxueai_video.py runway       # Runway Gen-3
  python test_ricoxueai_video.py minimax      # 海螺 Minimax
  python test_ricoxueai_video.py doubao       # 豆包（字节跳动）
  python test_ricoxueai_video.py sora         # Sora (OpenAI)
  python test_ricoxueai_video.py grok         # Grok (xAI)
  python test_ricoxueai_video.py wanx         # 通义万象（阿里）

也可以直接运行各厂商独立脚本:
  python vendors/veo.py
  python vendors/luma.py
  python vendors/runway.py
  python vendors/minimax.py
  python vendors/doubao.py
  python vendors/sora.py
  python vendors/grok.py
  python vendors/wanx.py

依赖: pip install httpx
"""
import sys

try:
    import httpx
except ImportError:
    print("请先安装依赖: pip install httpx")
    sys.exit(1)

from vendors.common import API_KEY, BASE_URL, PROMPT, base_headers, log
from vendors.veo import run_veo
from vendors.luma import run_luma
from vendors.runway import run_runway
from vendors.minimax import run_minimax
from vendors.doubao import run_doubao
from vendors.sora import run_sora
from vendors.grok import run_grok
from vendors.wanx import run_wanx

# ── 厂商注册表 ─────────────────────────────────────────────────────
VENDORS = {
    "veo":     run_veo,
    "luma":    run_luma,
    "runway":  run_runway,
    "minimax": run_minimax,
    "doubao":  run_doubao,
    "sora":    run_sora,
    "grok":    run_grok,
    "wanx":    run_wanx,
}


def main() -> None:
    vendor = sys.argv[1].lower() if len(sys.argv) > 1 else "veo"
    if vendor not in VENDORS:
        print(f"未知厂商: {vendor}")
        print(f"支持: {', '.join(VENDORS)}")
        sys.exit(1)

    log("=" * 60)
    log(f"云雾 API 视频生成测试 — 厂商: {vendor.upper()}")
    log("=" * 60)
    log(f"Base URL : {BASE_URL}")
    log(f"Prompt   : {PROMPT}")
    log("-" * 60)

    if not API_KEY:
        log("错误: 未设置 RICOXUEAI_API_KEY 或 OPENAI_API_KEY 环境变量", "ERROR")
        sys.exit(1)

    with httpx.Client(headers=base_headers(), timeout=30) as client:
        try:
            VENDORS[vendor](client)
            log("=" * 60)
            log("测试通过 ✓")
        except httpx.HTTPStatusError as e:
            log(f"HTTP 错误 {e.response.status_code}: {e.response.text}", "ERROR")
            sys.exit(1)
        except Exception as e:
            log(f"失败: {e}", "ERROR")
            sys.exit(1)


if __name__ == "__main__":
    main()