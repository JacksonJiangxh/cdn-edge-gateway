#!/usr/bin/env python3
"""
cleanup-cnb-history.py — 清理 CNB 历史流水线构建日志

依据 CNB OpenAPI（https://api.cnb.cool/swagger.json）：
  GET    /{repo}/-/build/logs       列出构建记录（GetBuildLogs，需 repo-cnb-history:r）
  DELETE /{repo}/-/build/logs/{sn}  删除指定构建日志（BuildLogsDelete，需 repo-cnb-trigger:rw）

认证：HTTP 头 Authorization: Bearer <token>。
用法（在 CNB 流水线中）：
  python3 scripts/cleanup-cnb-history.py \
    --repo "$REPO_PATH" \
    --token "$CNB_TOKEN" \
    --keep 50
"""
import argparse
import json
import sys
import urllib.request
import urllib.error

API_BASE = "https://api.cnb.cool"


def call(token, method, url):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print(f"✗ HTTP {e.code} {method} {url}: {body[:300]}")
        raise SystemExit(1)


def list_builds(token, base):
    """遍历分页，返回按时间先后排列的全部构建 SN 列表（旧的在前）。"""
    sns, page, page_size = [], 1, 100
    while True:
        data = call(token, "GET", f"{base}?page={page}&page_size={page_size}")
        # 兼容 dto.BuildLogsResult 的不同字段形态：列表可能在 data /
        # data.list / data.records / data.builds / data.logs / data.items
        payload = data.get("data", data)
        lst = None
        if isinstance(payload, dict):
            for k in ("list", "records", "builds", "logs", "items"):
                v = payload.get(k)
                if isinstance(v, list):
                    lst = v
                    break
            if lst is None and isinstance(payload.get("data"), list):
                lst = payload["data"]
        elif isinstance(payload, list):
            lst = payload
        if not lst:
            break

        page_got = 0
        for item in lst:
            if not isinstance(item, dict):
                continue
            sn = (
                item.get("sn")
                or item.get("serialNo")
                or item.get("buildSn")
                or item.get("buildNo")
                or item.get("id")
            )
            if sn:
                sns.append(str(sn))
                page_got += 1

        total = None
        if isinstance(payload, dict):
            total = payload.get("total") or payload.get("totalCount") or payload.get("count")
        if isinstance(data, dict):
            total = total or data.get("total") or data.get("totalCount")
        if total is not None and len(sns) >= int(total):
            break
        if page_got < page_size:
            break
        page += 1

    # 去重、保序
    seen, uniq = set(), []
    for s in sns:
        if s not in seen:
            seen.add(s)
            uniq.append(s)
    return uniq


def main():
    parser = argparse.ArgumentParser(description="清理 CNB 历史流水线构建日志")
    parser.add_argument("--repo", required=True, help="仓库路径，形如 组织名/仓库名（不带 .git）")
    parser.add_argument("--token", required=True, help="访问令牌（CI 用 CNB_TOKEN）")
    parser.add_argument("--keep", type=int, default=10, help="保留最近 N 条，默认 50")
    parser.add_argument("--dry-run", action="store_true", help="只列出待删除，不真正删除")
    args = parser.parse_args()

    base = f"{API_BASE}/{args.repo}/-/build/logs"
    uniq = list_builds(args.token, base)
    stale = uniq[args.keep:] if len(uniq) > args.keep else []
    print(f"共 {len(uniq)} 条构建记录，保留最近 {min(args.keep, len(uniq))} 条，待删除 {len(stale)} 条")
    if stale:
        shown = ", ".join(stale[:10]) + (" ..." if len(stale) > 10 else "")
        print(f"待删除 SN: {shown}")
        if args.dry_run:
            print("（dry-run，未真正删除）")
            return
        for sn in stale:
            call(args.token, "DELETE", f"{base}/{sn}")
            print(f"  ✓ 已删除 {sn}")
    else:
        print("无历史记录需要清理")


if __name__ == "__main__":
    main()
