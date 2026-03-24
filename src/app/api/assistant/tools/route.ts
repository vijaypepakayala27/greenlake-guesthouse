import { NextRequest, NextResponse } from "next/server";
import { query, ensureInit } from "@/lib/db";

// Telnyx AI Assistant webhook — handles tool calls
export async function POST(req: NextRequest) {
  await ensureInit();
  
  const body = await req.json();
  console.log("[assistant/tools] webhook:", JSON.stringify(body).slice(0, 500));

  // Detect function from body
  let functionName = body?.function_name || body?.name || body?.tool_call?.function?.name;
  
  // Auto-detect from body params if no explicit function name
  if (!functionName) {
    if (body?.confirmation_code || body?.summary) functionName = "send_confirmation";
    else if (body?.guest_name || body?.room_type) functionName = "create_booking";
    else if (body?.check_in || body?.check_out) functionName = "check_availability";
  }
  
  const args = { ...body };
  delete args.function_name;
  delete args.name;
  
  console.log("[assistant/tools] function:", functionName, "args:", JSON.stringify(args));

  try {
    if (functionName === "check_availability") {
      return handleCheckAvailability(args);
    } else if (functionName === "create_booking") {
      return handleCreateBooking(args);
    } else if (functionName === "send_confirmation") {
      return handleSendConfirmation(args);
    } else {
      return NextResponse.json({ result: "Unknown tool: " + functionName });
    }
  } catch (err: any) {
    console.error("[assistant/tools] error:", err);
    return NextResponse.json({ result: "Error: " + err.message });
  }
}

async function handleCheckAvailability(args: any) {
  const { check_in, check_out } = args;
  const checkIn = check_in;
  const checkOut = check_out;

  const d1 = new Date(checkIn);
  const d2 = new Date(checkOut);
  const nights = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));

  const { rows } = await query(
    `SELECT r.room_type, r.price_per_night::float as price, COUNT(*) as available_count
     FROM rooms r
     WHERE r.room_number NOT IN (
       SELECT b.room_number FROM bookings b
       WHERE b.status NOT IN ('cancelled')
         AND b.check_in < $2::date
         AND b.check_out > $1::date
     )
     GROUP BY r.room_type, r.price_per_night
     ORDER BY r.price_per_night ASC`,
    [checkIn, checkOut]
  );

  if (rows.length === 0) {
    return NextResponse.json({
      result: JSON.stringify({ message: "No rooms available for those dates", check_in, check_out }),
    });
  }

  const available = rows.map((r: any) => ({
    type: r.room_type,
    available_rooms: parseInt(r.available_count),
    price_per_night_rand: r.price,
    total_rand: r.price * nights,
    nights,
  }));

  return NextResponse.json({
    result: JSON.stringify({ available_rooms: available, check_in, check_out, nights }),
  });
}

async function handleCreateBooking(args: any) {
  const { guest_name, phone, room_type, check_in, check_out, adults, children } = args;

  const d1 = new Date(check_in);
  const d2 = new Date(check_out);
  const nights = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));

  // Normalize room type: "en-suite" → "suite", case insensitive
  let normalizedType = room_type?.toLowerCase().trim();
  if (normalizedType === "en-suite" || normalizedType === "ensuite") {
    normalizedType = "suite";
  }

  // Find an available room of this type
  const { rows: available } = await query(
    `SELECT room_number, price_per_night::float as price FROM rooms
     WHERE LOWER(room_type) = LOWER($1::text)
       AND room_number NOT IN (
         SELECT room_number FROM bookings
         WHERE status NOT IN ('cancelled')
           AND check_in < $3::date
           AND check_out > $2::date
       )
     ORDER BY room_number
     LIMIT 1`,
    [normalizedType, check_in, check_out]
  );

  if (available.length === 0) {
    return NextResponse.json({
      result: JSON.stringify({ error: true, message: `No ${room_type} rooms available for those dates` }),
    });
  }

  const roomNumber = available[0].room_number;
  const price = available[0].price;
  const totalPrice = price * nights;

  const { rows: inserted } = await query(
    `INSERT INTO bookings
       (room_number, guest_name, guest_phone, check_in, check_out, adults, children, status, amount, notes)
     VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, 'confirmed', $8, 'Booked via AI Assistant')
     RETURNING id`,
    [roomNumber, guest_name, phone || null, check_in, check_out, adults || 1, children || 0, totalPrice]
  );

  const bookingId = inserted[0]?.id || "0000";
  const code = "GRN-" + String(bookingId).slice(-4).toUpperCase();

  return NextResponse.json({
    result: JSON.stringify({
      success: true,
      confirmation_code: code,
      room_type,
      check_in,
      check_out,
      nights,
      guest_name,
      adults: adults || 1,
      children: children || 0,
      total_price_rand: totalPrice,
    }),
  });
}

async function handleSendConfirmation(args: any) {
  const { phone, confirmation_code, summary } = args;

  const from = process.env.TELNYX_PHONE_NUMBER;
  if (!from) {
    return NextResponse.json({ result: JSON.stringify({ sent: false, reason: "No sending number configured" }) });
  }

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: phone,
        text: `🏨 Green Lake Guest House\n\n✅ Booking Confirmed!\n📋 ${confirmation_code}\n\n${summary}\n\nWe look forward to welcoming you!`,
      }),
    });

    const data = await res.json();
    return NextResponse.json({
      result: JSON.stringify({ sent: true, message_id: data?.data?.id || "sent" }),
    });
  } catch (err: any) {
    return NextResponse.json({
      result: JSON.stringify({ sent: false, reason: err.message }),
    });
  }
}
