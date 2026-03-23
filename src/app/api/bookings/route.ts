import { NextRequest, NextResponse } from "next/server";
import { query, ensureInit } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/bookings?month=YYYY-MM&guest_name=...&guest_phone=...
export async function GET(req: NextRequest) {
  await ensureInit();
  const month = req.nextUrl.searchParams.get("month");
  const guestName = req.nextUrl.searchParams.get("guest_name");
  const guestPhone = req.nextUrl.searchParams.get("guest_phone");

  const conditions: string[] = [];
  const params: any[] = [];

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    params.push(`${month}-01`);
    conditions.push(`check_in < $${params.length}::date + interval '1 month' AND check_out > $${params.length}::date`);
  }

  if (guestName) {
    params.push(`%${guestName}%`);
    conditions.push(`LOWER(guest_name) LIKE LOWER($${params.length})`);
  }

  if (guestPhone) {
    params.push(`%${guestPhone}%`);
    conditions.push(`guest_phone LIKE $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT
       id, room_number, guest_name, guest_phone, guest_email,
       check_in::text, check_out::text,
       adults, children, status,
       amount::float, special_requests, notes,
       created_at, updated_at
     FROM bookings
     ${whereClause}
     ORDER BY check_in ASC`,
    params
  );

  return NextResponse.json({ bookings: rows });
}

// POST /api/bookings — requires auth (API key or JWT session)
export async function POST(req: NextRequest) {
  await ensureInit();
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    room_number, guest_name, guest_phone, guest_email,
    check_in, check_out, adults, children,
    status, amount, special_requests, notes,
  } = body;

  if (!room_number || !guest_name || !check_in || !check_out) {
    return NextResponse.json({ error: "Missing required fields: room_number, guest_name, check_in, check_out" }, { status: 400 });
  }

  // Verify room exists
  const { rows: roomRows } = await query("SELECT room_number FROM rooms WHERE room_number = $1", [room_number]);
  if (roomRows.length === 0) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // Check for conflicting bookings
  const { rows: conflicts } = await query(
    `SELECT id FROM bookings
     WHERE room_number = $1
       AND status NOT IN ('cancelled')
       AND check_in < $3::date
       AND check_out > $2::date`,
    [room_number, check_in, check_out]
  );
  if (conflicts.length > 0) {
    return NextResponse.json({ error: "Room is already booked for those dates" }, { status: 409 });
  }

  const { rows } = await query(
    `INSERT INTO bookings
       (room_number, guest_name, guest_phone, guest_email, check_in, check_out,
        adults, children, status, amount, special_requests, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, room_number, guest_name, guest_phone, guest_email,
               check_in::text, check_out::text, adults, children,
               status, amount::float, special_requests, notes, created_at`,
    [
      room_number, guest_name, guest_phone || null, guest_email || null,
      check_in, check_out, adults || 1, children || 0,
      status || "pending", amount || null, special_requests || null, notes || null,
    ]
  );

  return NextResponse.json({ booking: rows[0] }, { status: 201 });
}
