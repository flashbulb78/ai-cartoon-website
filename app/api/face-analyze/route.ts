import { NextResponse } from "next/server";
import { analyzeFaceWithTencent } from "@/lib/tencentCloud";

// 明确阻止 Edge Runtime - 腾讯云 SDK 不能在 Edge 运行
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { imageBase64 } = await req.json();
  try {
    const result = await analyzeFaceWithTencent(imageBase64);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}