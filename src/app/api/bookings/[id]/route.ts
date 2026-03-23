import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

// PATCH /api/bookings/:id — update booking fields
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "guest_name", "guest_phone", "guest_email",
    "check_in", "check_out", "adults", "children",
    "status", "amount", "special_requests", "notes",
  ];

  // Conflict check if dates are changing
  if ("check_in" in body || "check_out" in body) {
    const { rows: current } = await query(
      `SELECT room_number, check_in::text, check_out::text FROM bookings WHERE id = $1`,
      [id]
    );
    if (current.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const room = current[0].room_number;
    const newCheckIn = body.check_in || current[0].check_in;
    const newCheckOut = body.check_out || current[0].check_out;

    const { rows: conflicts } = await query(
      `SELECT id, guest_name, check_in::text, check_out::text
       FROM bookings
       WHERE room_number = $1
         AND id != $2
         AND status != 'cancelled'
         AND check_in < $3
         AND check_out > $4`,
      [room, id, newCheckOut, newCheckIn]
    );

    if (conflicts.length > 0) {
      const c = conflicts[0];
      return NextResponse.json({
        error: `Room ${room} already booked by ${c.guest_name} from ${c.check_in} to ${c.check_out}`,
      }, { status: 409 });
    }
  }

  const setClauses: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const field of allowed) {
    if (field in body) {
      setClauses.push(`${field} = $${idx++}`);
      values.push(body[field]);
    }
  }

  if (setClauses.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  setClauses.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await query(
    `UPDATE bookings SET ${setClauses.join(", ")}
     WHERE id = $${idx}
     RETURNING id, room_number, guest_name, guest_phone, guest_email,
               check_in::text, check_out::text, adults, children,
               status, amount::float, special_requests, notes, updated_at`,
    values
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ booking: rows[0] });
}

// DELETE /api/bookings/:id — cancel booking
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { rows } = await query(
    `UPDATE bookings SET status = 'cancelled', updated_at = now()
     WHERE id = $1
     RETURNING id, status`,
    [id]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id });
}
