import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    adminPasswordSet: !!process.env.ADMIN_PASSWORD,
    adminPasswordLength: (process.env.ADMIN_PASSWORD || "").length,
    adminPasswordFirst3: (process.env.ADMIN_PASSWORD || "fallback").substring(0, 3),
    fallback: "gre",
    nodeEnv: process.env.NODE_ENV,
  });
}
