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
