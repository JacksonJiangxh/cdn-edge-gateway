#!/usr/bin/env python3
"""
通用云原生开发预览保活服务
============================
适用于各类云原生开发平台（CNB 仅预览模式 onlyPreview 等）的离线防关机保活程序。
任意仓库均可直接使用：启动一个 HTTP 预览页面，配合平台的 keepAliveTimeout
实现 >10 分钟的保活业务。

原理：
  云原生开发平台的仅预览模式通常通过 keepAliveTimeout 控制保活时间（默认 10 分钟），
  只要 HTTP 预览连接持续有流量，环境就不会被回收。
  从浏览器打开预览 URL 后，页面按设定间隔自动刷新产生流量，实现持续保活。

可配置项（通过环境变量）：
  KEEPALIVE_PORT       监听端口，默认 8686
  KEEPALIVE_TITLE      预览页标题 / 仓库名，默认按环境变量自动推断，否则为 "workspace"
  KEEPALIVE_REFRESH    自动刷新间隔（秒），默认 300
  KEEPALIVE_ICON       预览页图标（emoji），默认 🛡️
  KEEPALIVE_HOST       绑定地址，默认 0.0.0.0
"""
import http.server
import os
import sys
import time
from datetime import datetime

PORT = int(os.environ.get('KEEPALIVE_PORT', '8686'))
REFRESH = int(os.environ.get('KEEPALIVE_REFRESH', '300'))
HOST = os.environ.get('KEEPALIVE_HOST', '0.0.0.0')
ICON = os.environ.get('KEEPALIVE_ICON', '🛡️')

# 自动推断仓库名：优先使用常见平台的仓库环境变量，其次回退到目录名
def detect_repo_name() -> str:
    for env in (
        'CNB_REPO_NAME', 'GIT_REPO_NAME', 'REPO_NAME',
        'CI_PROJECT_NAME', 'GITHUB_REPOSITORY', 'CI_REPOSITORY',
    ):
        val = os.environ.get(env)
        if val:
            return val.split('/')[-1]
    cwd = os.path.basename(os.getcwd())
    return cwd or 'workspace'

REPO_NAME = os.environ.get('KEEPALIVE_TITLE') or detect_repo_name()
START_TIME = time.time()

PAGE_HTML = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{repo} — 保活服务</title>
<meta http-equiv="refresh" content="{refresh}">
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{
    font-family:-apple-system,BlinkMacSystemFont,"Microsoft YaHei","PingFang SC",sans-serif;
    background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);
    min-height:100vh;display:flex;align-items:center;justify-content:center
  }}
  .wrap{{width:90%;max-width:520px;padding:0 20px}}
  .card{{
    background:rgba(255,255,255,.06);backdrop-filter:blur(20px);
    border:1px solid rgba(255,255,255,.1);border-radius:24px;
    padding:48px 36px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,.3)
  }}
  .icon{{font-size:56px;margin-bottom:20px}}
  h1{{color:#e0e0e0;font-size:22px;margin-bottom:8px;font-weight:600}}
  .badge{{
    display:inline-block;background:linear-gradient(135deg,#00b894,#00cec9);
    color:#fff;padding:6px 20px;border-radius:20px;font-size:13px;font-weight:500;
    margin:16px 0;letter-spacing:.5px
  }}
  .info-grid{{
    display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0;
    text-align:left
  }}
  .info-item{{
    background:rgba(255,255,255,.04);border-radius:12px;padding:12px 16px
  }}
  .info-label{{color:#8892b0;font-size:11px;text-transform:uppercase;letter-spacing:1px}}
  .info-value{{color:#ccd6f6;font-size:15px;font-weight:500;margin-top:4px;word-break:break-all}}
  .footer{{color:#495670;font-size:12px;margin-top:24px}}
  .pulse{{animation:pulse 2s infinite}}
  @keyframes pulse{{
    0%,100%{{opacity:1}}50%{{opacity:.5}}
  }}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="icon">{icon}</div>
    <h1>{repo}</h1>
    <div class="badge"><span class="pulse">●</span>&nbsp;&nbsp;开发环境运行中</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">当前时间</div>
        <div class="info-value">{now}</div>
      </div>
      <div class="info-item">
        <div class="info-label">运行时长</div>
        <div class="info-value">{uptime}</div>
      </div>
      <div class="info-item">
        <div class="info-label">保活机制</div>
        <div class="info-value">keepAliveTimeout</div>
      </div>
      <div class="info-item">
        <div class="info-label">下次刷新</div>
        <div class="info-value">{next_refresh}</div>
      </div>
    </div>
    <div class="footer">
      页面每 {refresh} 秒自动刷新 &nbsp;|&nbsp; 保持预览连接活跃 &nbsp;|&nbsp; 端口 {port}
    </div>
  </div>
</div>
</body>
</html>"""


def format_uptime(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}h {m}m {s}s"
    if m > 0:
        return f"{m}m {s}s"
    return f"{s}s"


class KeepaliveHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        uptime = format_uptime(time.time() - START_TIME)
        next_refresh = datetime.fromtimestamp(
            time.time() + REFRESH
        ).strftime('%H:%M:%S')

        html = PAGE_HTML.format(
            repo=REPO_NAME,
            now=now,
            uptime=uptime,
            port=PORT,
            refresh=REFRESH,
            icon=ICON,
            next_refresh=next_refresh
        )

        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.end_headers()
        self.wfile.write(html.encode('utf-8'))

    def do_HEAD(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()

    def log_message(self, format, *args):
        now = datetime.now().strftime('%H:%M:%S')
        sys.stderr.write(f"[{now}] {self.client_address[0]} — {format % args}\n")


if __name__ == '__main__':
    print(f"""
╔══════════════════════════════════════════════════════╗
║  {ICON} 通用云原生开发预览保活服务                     ║
╠══════════════════════════════════════════════════════╣
║  监听端口 : {PORT:<5}                                     ║
║  绑定地址 : {HOST:<37} ║
║  仓库名称 : {REPO_NAME:<37} ║
║  启动时间 : {datetime.now().strftime('%Y-%m-%d %H:%M:%S'):<31} ║
║  自动刷新 : 每 {REFRESH} 秒                                 ║
╠══════════════════════════════════════════════════════╣
║  点击平台「预览」按钮即可打开预览页面               ║
╚══════════════════════════════════════════════════════╝
""")

    server = http.server.HTTPServer((HOST, PORT), KeepaliveHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 保活服务已停止")
        server.shutdown()
