// 👉 官方正确导入
import * as tencentcloud from "tencentcloud-sdk-nodejs";

// 提取 Client 类
const FaceClient = tencentcloud.iai.v20180301.Client;

// 初始化国际版客户端
const client = new FaceClient({
  credential: {
    secretId: process.env.TENCENT_SECRET_ID!,
    secretKey: process.env.TENCENT_SECRET_KEY!,
  },
  region: "ap-guangzhou",
});

// 人脸分析（返回配饰信息）- 带超时和降级
export async function analyzeFaceWithTencent(imageBase64: string) {
  console.log("[TencentSDK] AnalyzeFace called");

  // 5秒超时
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Tencent API timeout")), 5000);
  });

  try {
    const resp = await Promise.race([
      client.AnalyzeFace({
        Image: imageBase64,
        FaceAttributesType: "Glass,Mask,Moustache,Hat",
      }),
      timeoutPromise,
    ]);

    // @ts-ignore - FaceShape 在类型定义中可能不存在但API返回
    if (!resp.FaceShape || resp.FaceShape.length === 0) {
      return { glass: false, mask: false, beard: false };
    }
    // @ts-ignore
    const face = resp.FaceShape[0];
    return {
      // @ts-ignore
      glass: face.Accessories?.Glass === 1,
      // @ts-ignore
      mask: face.Mask === 1,
      // @ts-ignore
      beard: face.Beard === 1,
    };
  } catch (err) {
    console.error("[TencentSDK] Error:", (err as Error).message);
    console.warn("[Tencent] API 调用失败，降级使用默认值:", err);
    return { glass: false, mask: false, beard: false };
  }
}

// 兼容函数
export async function detectFaceWithTencent(imageBase64: string) {
  return null;
}

export function initTencentCloudConfig() {}
export function isTencentCloudConfigured() {
  return !!process.env.TENCENT_SECRET_ID;
}