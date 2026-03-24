import { NextResponse } from "next/server";
import { query, ensureInit } from "@/lib/db";

export const dynamic = "force-dynamic";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function GET() {
  await ensureInit();

  const today = new Date().toISOString().split("T")[0];

  const { rows } = await query(
    `SELECT r.room_number, r.floor, r.room_type, r.price_per_night::float,
       CASE WHEN b.room_number IS NOT NULL THEN true ELSE false END as booked
     FROM rooms r
     LEFT JOIN (
       SELECT DISTINCT room_number FROM bookings
       WHERE status NOT IN ('cancelled', 'checked-out')
         AND check_in <= $1::date AND check_out > $1::date
     ) b ON r.room_number = b.room_number
     ORDER BY r.floor ASC, r.room_number ASC`,
    [today]
  );

  const rooms = rows.map((r: any) => ({
    // camelCase for /dashboard
    id: r.room_number,
    type: capitalize(r.room_type),
    number: r.room_number,
    floor: r.floor,
    pricePerNight: r.price_per_night,
    booked: r.booked,
    // snake_case for DashboardGrid (base page)
    room_number: r.room_number,
    room_type: r.room_type,
    price_per_night: r.price_per_night,
  }));

  return NextResponse.json({ rooms });
}
