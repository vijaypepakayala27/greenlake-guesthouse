import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Telnyx AI Assistant webhook — handles tool calls
export async function POST(req: NextRequest) {
  const body = await req.json();
  console.log("[assistant/tools] webhook:", JSON.stringify(body).slice(0, 500));

  // Telnyx webhook tools POST the body_parameters directly
  // Detect function from: explicit function_name field, or by checking which required params exist
  let functionName = body?.function_name || body?.name || body?.tool_call?.function?.name;
  
  // Auto-detect from body params if no explicit function name
  if (!functionName) {
    if (body?.confirmation_code || body?.summary) functionName = "send_confirmation";
    else if (body?.guest_name || body?.room_type) functionName = "create_booking";
    else if (body?.check_in || body?.check_out) functionName = "check_availability";
  }
  
  const parsedArgs = { ...body };
  delete parsedArgs.function_name;
  delete parsedArgs.name;
  
  console.log("[assistant/tools] function:", functionName, "body keys:", Object.keys(body), "args:", JSON.stringify(parsedArgs));

  try {
    if (functionName === "check_availability") {
      return handleCheckAvailability(parsedArgs);
    } else if (functionName === "create_booking") {
      return handleCreateBooking(parsedArgs);
    } else if (functionName === "send_confirmation") {
      return handleSendConfirmation(parsedArgs);
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
  const checkIn = new Date(check_in);
  const checkOut = new Date(check_out);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  // Get rooms that are NOT booked for these dates
  const bookedRoomIds = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomId: true },
  });

  const bookedIds = new Set(bookedRoomIds.map((b: any) => b.roomId));

  const allRooms = await prisma.room.findMany();
  const available: Record<string, { count: number; price: number; total: number; amenities: string }> = {};

  for (const room of allRooms) {
    if (bookedIds.has(room.id)) continue;
    if (!available[room.type]) {
      available[room.type] = {
        count: 0,
        price: room.pricePerNight,
        total: room.pricePerNight * nights,
        amenities: Array.isArray(room.amenities) ? (room.amenities as string[]).join(", ") : String(room.amenities || ""),
      };
    }
    available[room.type].count++;
  }

  const result = Object.entries(available).map(([type, info]) => ({
    type,
    available_rooms: info.count,
    price_per_night: `R${info.price}`,
    total_for_stay: `R${info.total}`,
    nights,
    amenities: info.amenities,
  }));

  return NextResponse.json({
    result: result.length > 0
      ? JSON.stringify({ available_rooms: result, check_in, check_out, nights })
      : JSON.stringify({ message: "No rooms available for those dates", check_in, check_out }),
  });
}

async function handleCreateBooking(args: any) {
  const { guest_name, phone, room_type, check_in, check_out, adults, children } = args;
  const checkIn = new Date(check_in);
  const checkOut = new Date(check_out);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  // Find an available room of this type
  const bookedRoomIds = await prisma.booking.findMany({
    where: {
      status: { not: "cancelled" },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { roomId: true },
  });

  const bookedIds = new Set(bookedRoomIds.map((b: any) => b.roomId));

  const room = await prisma.room.findFirst({
    where: {
      type: room_type,
      id: { notIn: Array.from(bookedIds) as string[] },
    },
  });

  if (!room) {
    return NextResponse.json({
      result: JSON.stringify({ error: true, message: `No ${room_type} rooms available for those dates` }),
    });
  }

  const totalPrice = room.pricePerNight * nights;
  const code = "GH-" + Math.random().toString(36).substring(2, 6).toUpperCase();

  const booking = await prisma.booking.create({
    data: {
      roomId: room.id,
      guestName: guest_name,
      guestPhone: phone,
      checkIn,
      checkOut,
      adults: adults || 1,
      children: children || 0,
      totalPrice,
      confirmationCode: code,
      status: "confirmed",
    },
  });

  return NextResponse.json({
    result: JSON.stringify({
      success: true,
      confirmation_code: code,
      room_number: room.number,
      room_type: room.type,
      floor: room.floor,
      check_in,
      check_out,
      nights,
      guest_name,
      adults: adults || 1,
      children: children || 0,
      total_price: `R${totalPrice}`,
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
