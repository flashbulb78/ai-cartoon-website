'use client';

import { useState } from 'react';

export default function Home() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 当用户选择图片时
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImage(file);
      setPreview(URL.createObjectURL(file)); // 显示本地预览
      setResult(null); // 重置上一次的结果
    }
  };

  // 上传图片并调用 AI
  const transformImage = async () => {
    if (!image) return;
    setLoading(true);
  
    try {
      // 发送请求到刚才建的 API
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // 关键：把预览图的 URL 传给后端
        body: JSON.stringify({ image: preview }), 
      });
  
      const data = await response.json();
  
      if (data.result) {
        setResult(data.result); // 设置 AI 生成的结果图
      } else {
        alert('生成失败：' + data.error);
      }
  
    } catch (error) {
      console.error(error);
      alert('出错了');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="z-10 w-full max-w-2xl items-center justify-between font-mono text-sm lg:max-w-4xl">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          AI 卡通头像生成器
        </h1>

        {/* 上传区域 */}
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center justify-center w-full">
            <label
              htmlFor="dropzone-file"
              className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                {preview ? (
                  <img src={preview} alt="Preview" className="h-full object-contain" />
                ) : (
                  <>
                    <svg
                      className="w-8 h-8 mb-4 text-gray-500"
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 20 16"
                    >
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                      />
                    </svg>
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-semibold">点击上传图片</span> 或拖拽
                    </p>
                    <p className="text-xs text-gray-500">JPG, PNG (推荐正方形图片)</p>
                  </>
                )}
              </div>
              <input
                id="dropzone-file"
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageChange}
              />
            </label>
          </div>

          {/* 风格选择（演示用） */}
          {preview && (
            <div className="flex gap-4">
              <button className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                迪士尼风格
              </button>
              <button className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                皮克斯风格
              </button>
              <button className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                吉卜力风格
              </button>
            </div>
          )}

          {/* 生成按钮 */}
          <button
            onClick={transformImage}
            disabled={!image || loading}
            className={`w-full px-6 py-3 text-white rounded-lg font-bold transition-colors ${
              !image || loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? '正在施法中...' : '生成卡通图 (消耗 1 点数)'}
          </button>

          {/* 结果展示 */}
          {result && (
            <div className="mt-8 p-4 border rounded-lg bg-white shadow-sm w-full">
              <h2 className="text-xl font-bold mb-4 text-center">生成结果</h2>
              <img src={result} alt="Result" className="w-full rounded-lg" />
              <p className="text-center mt-2 text-sm text-gray-500">
                生成成功！这是你的新头像。
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}