import { NextResponse } from "next/server";
import { recentCalls } from "../route";

export const dynamic = "force-dynamic";

export async function GET() {
  const ivrNumber = process.env.NEXT_PUBLIC_IVR_NUMBER || "+27101579079";
  const configured = !!process.env.TELNYX_API_KEY;

  return NextResponse.json({
    active: configured,
    phone: ivrNumber,
    webhookUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "https://greenlake-guesthouse.vercel.app"}/api/ivr`,
    recentCalls: recentCalls.slice(0, 5),
  });
}
