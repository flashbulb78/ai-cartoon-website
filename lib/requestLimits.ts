/**
 * lib/requestLimits.ts
 * 请求/响应体大小限制工具
 *
 * 背景：若直接把 Request/Response 的 body 一次性 buffer（text()/json()/arrayBuffer()），
 *       超大请求会先被完整读进内存 → 可被用来打爆内存（DoS）。
 *       这里改为「流式读取 + 超过上限立即中止」，在读取阶段就阻断。
 */

/** 默认请求体上限：12MB（约对应 8MB 图片的 base64 编码） */
export const DEFAULT_MAX_BODY_BYTES = 12 * 1024 * 1024;

/** 图片解码后的字节上限：8MB */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * content-length 预检：能在读取前快速拒绝超大请求
 * 注意：content-length 可能缺失或被伪造，因此它只是「快速失败」优化，
 *      真正的兜底是 readBodyWithLimit 的流式计数。
 */
export function exceedsContentLength(headers: Headers, maxBytes: number): boolean {
  const raw = headers.get('content-length');
  if (!raw) return false;

  const length = Number(raw);
  return Number.isFinite(length) && length > maxBytes;
}

/**
 * 以流式方式读取 body，超过 maxBytes 时立即中止并返回 null
 *
 * @param body      Request.body / Response.body
 * @param maxBytes  允许的最大字节数
 * @returns 读取到的字节；超限或无法读取时返回 null
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!body) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overflow = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        // 超限：立即中止上游读取，不再继续吃内存
        overflow = true;
        await reader.cancel().catch(() => undefined);
        break;
      }

      chunks.push(value);
    }
  } catch (error) {
    console.error('[RequestLimits] Failed to read body:', error);
    return null;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 已释放或流已关闭，忽略
    }
  }

  if (overflow) return null;

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
