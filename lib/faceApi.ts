/**
 * lib/faceApi.ts
 * face-api.js 的**懒加载器**（全项目唯一入口）
 *
 * 【为什么需要这个模块】
 *   face-api.js 是一个约 730KB（gzip 181KB）的库。此前它被 4 个模块
 *   `import * as faceapi from 'face-api.js'` **静态导入**，
 *   于是整块被打进首屏 bundle —— 而它真正的用途只有一个：
 *   「用户选中照片后，在浏览器本地做一次人脸检测」。
 *   改为按需 `import()` 之后，没上传照片的访客完全不必下载它。
 *
 * 【为什么用「缓存 Promise」而不是 boolean 标志】
 *   并发调用时（cropFace 与 analyzeFace 可能同时触发）用 boolean 会
 *   重复发起 import；缓存 Promise 则天然去重，且失败后可以重置重试。
 *
 * 【类型从哪来】
 *   本模块同时导出 FaceApiModule 类型，供其他模块用 `import type` 引用，
 *   这样类型注解不会把 face-api 拉回 bundle（类型在编译期被擦除）。
 */
export type FaceApiModule = typeof import('face-api.js');

let loadingPromise: Promise<FaceApiModule> | null = null;

/**
 * 按需加载 face-api.js。
 * 多次调用共享同一个 Promise，因此只会真正加载一次。
 */
export function loadFaceApi(): Promise<FaceApiModule> {
  if (!loadingPromise) {
    loadingPromise = import('face-api.js').catch((error) => {
      // 失败时重置，允许调用方重试（否则一次网络抖动就永久失败）
      loadingPromise = null;
      throw error;
    });
  }
  return loadingPromise;
}

/**
 * 两个模型权重是否都已就绪。
 *
 * 用途：避免**重复下载模型权重**（约 550KB）。
 * 历史上 useFaceCrop 用 `nets.*.loadFromUri` 加载一次，
 * faceAnalysis 又用自己的 modelsLoaded 标志再加载一次 —— 两套标志互不知情，
 * 于是每次生成都要多走一轮权重请求。用 face-api 自身的 isLoaded 判断即可消除。
 */
export async function areModelsLoaded(): Promise<boolean> {
  const faceapi = await loadFaceApi();
  return faceapi.nets.tinyFaceDetector.isLoaded && faceapi.nets.faceLandmark68Net.isLoaded;
}
