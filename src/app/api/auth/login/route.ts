import { NextResponse } from "next/server";
import { signToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json();

  const adminPassword = process.env.ADMIN_PASSWORD || "greenlake2026";

  if (!password || password !== adminPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await signToken();

  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24h
    path: "/",
  });
  return response;
}
