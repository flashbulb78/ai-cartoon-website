import { NextResponse } from 'next/server';
import Replicate from 'replicate';

// 1. 初始化 Replicate 客户端
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN, // 确保你的 .env.local 里配置了这个 Token
});

// 2. 定义 POST 请求处理函数
export async function POST(req: Request) {
  try {
    // 3. 获取前端传来的数据 (图片 URL)
    const { image } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // 4. 调用 Replicate AI 模型 (这里用的是 ToonYou 模型作为例子)
    // 你可以换成你喜欢的任何模型
    const output = await replicate.run(
      "lucataco/toonyou:981a6d4d57316369467358822299262543643051841299055397026010249913", 
      {
        input: {
          image: image, // 传入图片
          steps: 20,    // 生成步数
          prompt: "cartoon style, disney style, high quality" // 提示词
        }
      }
    );

    // 5. 将 AI 生成的图片 URL 返回给前端
    // output 通常是一个字符串数组，取第一个即可
    return NextResponse.json({ result: output[0] });

  } catch (error) {
    console.error('AI Error:', error);
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }
}