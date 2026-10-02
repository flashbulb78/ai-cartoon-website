#!/usr/bin/env bash
#
# 安全工具模块回归测试运行器
#
# 被测模块：lib/imageValidation.ts、lib/hostAllowlist.ts、lib/requestLimits.ts
# 用法：    bash scripts/verification/run.sh
#
# 说明：这三个模块是「防止接口被滥用 / 被当作跳板」的关键防线，
#       被改坏时会静默失效（校验失败即放行），因此改动后请跑一次本脚本。

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD="$ROOT/.verify-build"

echo "[verify] 项目根目录: $ROOT"
echo "[verify] 编译被测模块..."

rm -rf "$BUILD"
mkdir -p "$BUILD"

if ! npx tsc \
  "$ROOT/lib/hostAllowlist.ts" \
  "$ROOT/lib/requestLimits.ts" \
  "$ROOT/lib/imageValidation.ts" \
  --outDir "$BUILD" \
  --module commonjs \
  --target es2022 \
  --lib es2023,dom \
  --skipLibCheck \
  --moduleResolution node
then
  echo "[verify] ❌ 编译失败"
  rm -rf "$BUILD"
  exit 1
fi

echo "[verify] 运行测试..."
cp "$ROOT/scripts/verification/security-utils.test.js" "$BUILD/"
node "$BUILD/security-utils.test.js"
STATUS=$?

rm -rf "$BUILD"
exit "$STATUS"
