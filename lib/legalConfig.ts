/**
 * lib/legalConfig.ts
 * 法律页面（/privacy、/terms）与站内页脚共用的单一配置来源
 *
 * ⚠️ 上线前必须核对下面 3 项（都已用 TODO 标出）：
 *   1. OPERATOR_NAME         你的运营主体名称
 *   2. SUPPORT_EMAIL         必须是**真实可用**的邮箱 —— 隐私政策里的数据主体请求
 *                            （访问 / 删除 / 导出）都会发到这里，邮箱失效等于无法履行义务
 *   3. GOVERNING_LAW         争议解决适用法律与管辖地
 *
 * 为什么集中在这里：隐私政策、服务条款、页脚、退订/联系入口都需要这些值，
 * 分散硬编码必然导致某处更新后其余地方不一致（法律页面出现自相矛盾是很糟的）。
 *
 * 本模块刻意保持「零依赖纯模块」，以便被 scripts/verification/ 单独编译测试。
 */

/** 运营主体名称（出现在「谁在运营本服务」一节） */
export const OPERATOR_NAME = 'Magic Cartoon Avatar';

/**
 * 联系与数据主体请求邮箱
 *
 * TODO(上线前): 确认该邮箱**真实可收信**（建议在域名 DNS 里配好或改成一个你每天会看的邮箱）。
 *               历史上站内曾出现过 support@aicartoon.com —— 那不是本站域名，已统一为本值。
 */
export const SUPPORT_EMAIL = 'support@magicyoyoyo.com';

/** 对外服务的域名（用于界定"本服务"的范围） */
export const SERVICE_DOMAIN = 'www.magicyoyoyo.com';

/**
 * 争议解决适用法律
 *
 * TODO(上线前): 建议改成你实际主体所在的具体法域，例如：
 *   "the laws of the State of Delaware, United States"
 *   "the laws of the People's Republic of China"
 * 当前默认值是中性表述（合法但不具体），不如写明法域清晰。
 */
export const GOVERNING_LAW = 'the laws of the jurisdiction in which the Operator is established';

/** 争议解决的管辖法院 */
export const JURISDICTION_VENUE =
  "the courts located in the Operator's place of establishment";

/**
 * 未使用积分的退款窗口（天）
 *
 * TODO(上线前): 这是**商业决定**，我按常见做法取了 14 天（与欧盟消费者撤回期一致）。
 *               若要改成 7 天 / 30 天 / 不支持退款，只改这个数字即可 ——
 *               服务条款里的措辞会自动带上它。
 */
export const REFUND_WINDOW_DAYS = 14;

/** 资料保留说明中引用的生成记录保留条数（与 app/api/generate/route.ts 的实现一致） */
export const GENERATION_HISTORY_LIMIT = 10;

/** 隐私政策与服务条款的生效日期 */
export const LEGAL_EFFECTIVE_DATE = new Date('2026-10-01T00:00:00.000Z');

/**
 * 生效日期的可读写法
 * 单独导出是为了避免各页面各写一份、结果出现两个不同日期
 */
export const LEGAL_EFFECTIVE_DATE_TEXT = 'October 1, 2026';

/**
 * 是否还有未替换的 TODO（供回归测试与人工检查使用）
 * 返回仍需处理的事项描述数组；为空表示已全部确认。
 */
export function getPendingLegalTodos(): string[] {
  const pending: string[] = [];

  if (!SUPPORT_EMAIL || SUPPORT_EMAIL.includes('example.com')) {
    pending.push('SUPPORT_EMAIL 无效或未填写');
  }
  if (!OPERATOR_NAME) {
    pending.push('OPERATOR_NAME 未填写');
  }
  if (GOVERNING_LAW.includes('jurisdiction in which')) {
    pending.push('GOVERNING_LAW 仍为中性默认值，建议写明具体法域');
  }
  if (!(LEGAL_EFFECTIVE_DATE instanceof Date) || Number.isNaN(LEGAL_EFFECTIVE_DATE.getTime())) {
    pending.push('LEGAL_EFFECTIVE_DATE 不是合法日期');
  }

  return pending;
}
