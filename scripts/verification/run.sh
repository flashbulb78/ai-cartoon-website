#!/usr/bin/env bash
#
# 回归测试运行器
#
# 被测模块：
#   lib/imageValidation.ts、lib/hostAllowlist.ts、lib/requestLimits.ts
#   lib/theme.ts、lib/authErrors.ts
# 测试文件：
#   scripts/verification/security-utils.test.js
#   scripts/verification/theme.test.js
#   scripts/verification/auth-errors.test.js
#
# 用法：bash scripts/verification/run.sh
#
# 说明：这些都是「静默失效」风险高的模块（校验失败即放行 / 主题被覆盖 / 请求体不设限），
#       改动相关代码后请跑一次本脚本。

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
  "$ROOT/lib/theme.ts" \
  "$ROOT/lib/utils.ts" \
  "$ROOT/lib/constants.ts" \
  "$ROOT/lib/siteConfig.ts" \
  "$ROOT/lib/structuredData.ts" \
  "$ROOT/lib/authErrors.ts" \
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

cp "$ROOT/scripts/verification/security-utils.test.js" "$BUILD/"
cp "$ROOT/scripts/verification/theme.test.js" "$BUILD/"
cp "$ROOT/scripts/verification/auth-errors.test.js" "$BUILD/"

STATUS=0

echo "[verify] 运行：安全工具模块测试..."
node "$BUILD/security-utils.test.js" || STATUS=1

echo "[verify] 运行：主题逻辑测试..."
node "$BUILD/theme.test.js" || STATUS=1

echo "[verify] 运行：认证错误映射测试..."
node "$BUILD/auth-errors.test.js" || STATUS=1

rm -rf "$BUILD"

if [ "$STATUS" -eq 0 ]; then
  echo "[verify] ✅ 全部通过"
else
  echo "[verify] ❌ 存在失败用例"
fi

exit "$STATUS"
