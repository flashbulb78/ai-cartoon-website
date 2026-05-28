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

// 人脸分析（返回配饰+性别信息）- 带超时和降级
// 使用 DetectFaceAttributes API - 更完整的属性模型
export async function analyzeFaceWithTencent(imageBase64: string) {
  console.log("[TencentSDK] DetectFaceAttributes called");

  // 5秒超时
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Tencent API timeout")), 5000);
  });

  try {
    const resp = await Promise.race([
      // @ts-ignore - DetectFaceAttributes may not exist in type definition
      client.DetectFaceAttributes({
        Image: imageBase64,
        // @ts-ignore
        FaceAttributesType: "Gender,Glass,Mask,Moustache,Hat",
        MaxFaceNum: 1,
      }),
      timeoutPromise,
    ]);

    // @ts-ignore - FaceDetailInfos 在类型定义中可能不存在但API返回
    const faceDetails = resp.FaceDetailInfos;
    if (!faceDetails || faceDetails.length === 0) {
      console.log("[TencentSDK] No face detected");
      return {
        glass: false,
        mask: false,
        beard: false,
        gender: null,
        genderConfidence: 0
      };
    }

    // @ts-ignore
    const faceDetail = faceDetails[0];
    // @ts-ignore
    const attributesInfo = faceDetail.FaceDetailAttributesInfo;

    // 解析性别: 1=男, 2=女, 0=未知
    // @ts-ignore
    const genderInfo = attributesInfo?.Gender;
    let gender: 'male' | 'female' | null = null;
    let genderConfidence = 0;

    if (genderInfo?.Type === 1) {
      gender = 'male';
      genderConfidence = genderInfo.Probability ?? 0;
    } else if (genderInfo?.Type === 2) {
      gender = 'female';
      genderConfidence = genderInfo.Probability ?? 0;
    } else {
      // 明确处理未知情况 (Type === 0 或不存在)
      gender = null;
      genderConfidence = 0;
    }

    // 解析配饰信息
    // @ts-ignore
    const hasGlasses = attributesInfo?.Glass?.Value === 1;
    // @ts-ignore
    const hasMask = attributesInfo?.Mask?.Value === 1;
    // @ts-ignore
    const hasBeard = attributesInfo?.Moustache?.Value === 1;

    // 结构化日志
    console.log("[TencentSDK] DetectFaceAttributes result", {
      genderType: genderInfo?.Type,
      genderProb: genderInfo?.Probability,
      hasGlasses,
      hasMask,
      hasBeard,
    });

    return {
      glass: hasGlasses,
      mask: hasMask,
      beard: hasBeard,
      gender,
      genderConfidence,
    };
  } catch (err) {
    console.error("[TencentSDK] Error:", (err as Error).message);
    console.warn("[TencentSDK] API 调用失败，降级使用默认值:", err);
    return {
      glass: false,
      mask: false,
      beard: false,
      gender: null,
      genderConfidence: 0
    };
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