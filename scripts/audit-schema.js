/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本直接在 Node 上运行（CommonJS），必须使用 require */
/**
 * schema 审计：核对「线上真实表结构」与「仓库 lib/supabase/database.sql」
 *
 * 用法：npm run audit:schema      （需要 .env.local 里有 service_role key）
 *
 * 【为什么需要这个脚本】
 *   2026-10 出过一次生产事故：database.sql 里有 profiles.username，线上却没有；
 *   而另一个迁移让 handle_new_user() 写入这一列 → **每一次新用户注册都失败**。
 *   根因就是「仓库脚本」与「线上真实结构」不一致，而当时没有任何检查能发现它。
 *
 *   本脚本从 Supabase 的 PostgREST OpenAPI 端点（GET /rest/v1/，权威的真实结构）
 *   读出全部表的列，与 database.sql 里解析出的列逐表比对，列出：
 *     · 线上有但脚本缺   → 用脚本重建库会缺列（可能导致功能坏掉）
 *     · 脚本有但线上缺   → 线上缺少脚本期望的列（正是当年事故的形态）
 *
 * 说明：只读，不修改任何数据或结构。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const SQL_FILE = path.join(ROOT, 'lib/supabase/database.sql');

/** 读取 .env.local */
function readEnv() {
  const env = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

/** 从 database.sql 里解析出每张表的列名 */
function parseSqlSchema(text) {
  const tables = {};
  const re = /CREATE TABLE (?:IF NOT EXISTS )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, name, body] = m;
    const cols = [];
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('--')) continue;
      if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\b/i.test(line)) continue;
      const col = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
      if (col) cols.push(col[1]);
    }
    tables[name] = cols;
  }
  return tables;
}

(async () => {
  const env = readEnv();
  const base = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {
    console.error('❌ .env.local 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const res = await fetch(`${base}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  });
  if (!res.ok) {
    console.error(`❌ 无法读取 OpenAPI（HTTP ${res.status}）`);
    process.exit(1);
  }

  const spec = await res.json();
  const defs = spec.definitions || spec.components?.schemas || {};
  const prod = {};
  for (const [name, def] of Object.entries(defs)) {
    prod[name] = Object.keys(def.properties || {});
  }

  const script = parseSqlSchema(fs.readFileSync(SQL_FILE, 'utf8'));

  console.log('\n================ schema 审计：线上 vs database.sql ================');
  console.log(`\n  线上表数量: ${Object.keys(prod).length}`);
  console.log(`  脚本表数量: ${Object.keys(script).length}`);

  const onlyProd = Object.keys(prod).filter((t) => !script[t]);
  const onlyScript = Object.keys(script).filter((t) => !prod[t]);

  if (onlyProd.length) console.log(`\n  ⚠️ 只在线上存在（脚本里没有）: ${onlyProd.join(', ')}`);
  if (onlyScript.length) console.log(`\n  ⚠️ 只在脚本里存在（线上没有）: ${onlyScript.join(', ')}`);
  if (!onlyProd.length && !onlyScript.length) console.log('\n  ✅ 表清单一致');

  console.log('\n  ---------------- 逐表列差异 ----------------');
  let driftTables = 0;
  for (const table of Object.keys(script).filter((t) => prod[t]).sort()) {
    const a = new Set(prod[table]);
    const b = new Set(script[table]);
    const onlyInProd = [...a].filter((c) => !b.has(c));
    const onlyInScript = [...b].filter((c) => !a.has(c));
    if (!onlyInProd.length && !onlyInScript.length) continue;
    driftTables += 1;
    console.log(`\n  🔴 ${table}`);
    if (onlyInProd.length) console.log(`     线上有、脚本缺（重建会缺列）: ${onlyInProd.join(', ')}`);
    if (onlyInScript.length) console.log(`     脚本有、线上缺（可能引发运行时错误）: ${onlyInScript.join(', ')}`);
  }

  console.log('\n  ================ 结论 ================');
  console.log(`  存在列差异的表: ${driftTables} 张`);
  if (driftTables === 0 && !onlyProd.length && !onlyScript.length) {
    console.log('  ✅ 脚本与线上完全一致 —— 可以放心用于重建\n');
    process.exit(0);
  }
  console.log('  ⚠️ 存在差异：请按上面清单修正 lib/supabase/database.sql，保持两者一致\n');
  process.exit(1);
})().catch((e) => {
  console.error('审计脚本异常:', e);
  process.exit(1);
});
