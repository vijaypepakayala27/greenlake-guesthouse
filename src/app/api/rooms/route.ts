import { NextResponse } from "next/server";
import { query, ensureInit } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureInit();
  const { rows } = await query(
    `SELECT room_number, floor, room_type, price_per_night::float
     FROM rooms
     ORDER BY floor ASC, room_number ASC`
  );
  return NextResponse.json({ rooms: rows });
}
