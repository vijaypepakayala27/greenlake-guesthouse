import { NextRequest, NextResponse } from "next/server";
import { query, ensureInit } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
    conditions.push(`b.check_in < $${params.length}::date + interval '1 month' AND b.check_out > $${params.length}::date`);
  }

  if (guestName) {
    params.push(`%${guestName}%`);
    conditions.push(`LOWER(b.guest_name) LIKE LOWER($${params.length})`);
  }

  if (guestPhone) {
    params.push(`%${guestPhone}%`);
    conditions.push(`b.guest_phone LIKE $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await query(
    `SELECT
       b.id, b.room_number, b.guest_name, b.guest_phone, b.guest_email,
       b.check_in::text, b.check_out::text,
       b.adults, b.children, b.status,
       b.amount::float, b.special_requests, b.notes,
       b.created_at, b.updated_at,
       r.room_type
     FROM bookings b
     LEFT JOIN rooms r ON b.room_number = r.room_number
     ${whereClause}
     ORDER BY b.created_at DESC`,
    params
  );

  // Return both camelCase (for /dashboard) and snake_case (for DashboardGrid base page)
  const bookings = rows.map((r: any) => ({
    // camelCase for /dashboard
    id: r.id,
    roomId: r.room_number,
    roomType: capitalize(r.room_type || "standard"),
    roomNumber: r.room_number,
    guestName: r.guest_name,
    guestPhone: r.guest_phone,
    guestEmail: r.guest_email,
    checkIn: r.check_in,
    checkOut: r.check_out,
    adults: r.adults || 1,
    children: r.children || 0,
    status: r.status,
    totalPrice: r.amount || 0,
    confirmationCode: `GRN-${String(r.id).slice(-4).toUpperCase()}`,
    specialRequests: r.special_requests,
    notes: r.notes,
    createdAt: r.created_at,
    // snake_case for DashboardGrid (base page)
    room_number: r.room_number,
    guest_name: r.guest_name,
    guest_phone: r.guest_phone,
    guest_email: r.guest_email,
    check_in: r.check_in,
    check_out: r.check_out,
    amount: r.amount || 0,
    special_requests: r.special_requests,
    created_at: r.created_at,
  }));

  // Compute stats
  const { rows: roomRows } = await query("SELECT COUNT(*)::int as total FROM rooms");
  const totalRooms = roomRows[0]?.total || 0;

  const today = new Date().toISOString().split("T")[0];
  const { rows: bookedRows } = await query(
    `SELECT COUNT(DISTINCT room_number)::int as booked FROM bookings
     WHERE status NOT IN ('cancelled', 'checked-out')
       AND check_in <= $1::date AND check_out > $1::date`,
    [today]
  );
  const bookedRooms = bookedRows[0]?.booked || 0;
  const available = totalRooms - bookedRooms;
  const occupancy = totalRooms > 0 ? Math.round((bookedRooms / totalRooms) * 100) : 0;

  const revenue = bookings.reduce((sum: number, b: any) => sum + (b.totalPrice || 0), 0);
  const guests = bookings
    .filter((b: any) => b.status !== "cancelled" && b.status !== "checked-out")
    .reduce((sum: number, b: any) => sum + (b.adults || 0) + (b.children || 0), 0);

  return NextResponse.json({
    bookings,
    stats: {
      totalRooms,
      bookedRooms,
      available,
      occupancy,
      revenue,
      guests,
      bookings: bookings.length,
    },
  });
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
