#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)
PYTHON="$PROJECT_ROOT/.venv/bin/python"

if [ ! -x "$PYTHON" ]; then
  echo "找不到项目虚拟环境：$PYTHON" >&2
  echo "请先在项目根目录创建并安装依赖：python3 -m venv .venv && .venv/bin/python -m pip install -r test_server/requirements-test.txt" >&2
  exit 1
fi

if ! "$PYTHON" -c 'import fastapi, uvicorn' >/dev/null 2>&1; then
  echo "项目虚拟环境缺少 FastAPI 或 Uvicorn。" >&2
  echo "请运行：.venv/bin/python -m pip install -r test_server/requirements-test.txt" >&2
  exit 1
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 8000 已被占用。请先在旧服务终端按 Ctrl+C，再重新运行本脚本。" >&2
  lsof -nP -iTCP:8000 -sTCP:LISTEN >&2
  exit 1
fi

cd "$PROJECT_ROOT"
exec "$PYTHON" "$SCRIPT_DIR/test_server.py"
