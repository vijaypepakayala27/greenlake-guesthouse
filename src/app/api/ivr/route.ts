import { NextRequest, NextResponse } from "next/server";
import { query, ensureInit } from "@/lib/db";

export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://greenlake-guesthouse.vercel.app";
const BOOKING_API_KEY = process.env.BOOKING_API_KEY || "";
const RECEPTION_NUMBER = process.env.RECEPTION_NUMBER || "";

// In-memory call log (resets on cold start — fine for serverless status display)
export const recentCalls: { ts: number; caller: string; outcome: string }[] = [];

function xml(content: string) {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

function buildUrl(path: string, params: Record<string, string>): string {
  const u = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) u.searchParams.set(k, v);
  }
  return u.toString();
}

function parseSpokenDate(input: string): string {
  if (!input) return "";
  // Remove ordinals: "5th" → "5", "1st" → "1", etc.
  const cleaned = input.replace(/(\d+)(st|nd|rd|th)/gi, "$1").trim();
  let d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  // Try appending current year
  d = new Date(`${cleaned} 2026`);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return cleaned;
}

function parseRoomType(input: string): { type: string; price: number; label: string } {
  const lower = input.toLowerCase();
  if (lower.includes("suite")) return { type: "suite", price: 2500, label: "Suite" };
  if (lower.includes("deluxe")) return { type: "deluxe", price: 1200, label: "Deluxe" };
  return { type: "standard", price: 850, label: "Standard" };
}

function parseGuests(input: string): number {
  const num = input.match(/\d+/);
  if (num) return Math.min(Math.max(parseInt(num[0]), 1), 10);
  const lower = input.toLowerCase();
  if (lower.includes("one") || lower.includes("solo") || lower.includes("just me")) return 1;
  if (lower.includes("two") || lower.includes("couple")) return 2;
  if (lower.includes("three")) return 3;
  if (lower.includes("four")) return 4;
  if (lower.includes("five")) return 5;
  return 2;
}

async function handleRequest(req: NextRequest): Promise<NextResponse> {
  const step = req.nextUrl.searchParams.get("step") || "";
  const state = req.nextUrl.searchParams.get("state") || "";

  // Parse form-encoded body (Telnyx posts application/x-www-form-urlencoded)
  let body: Record<string, string> = {};
  try {
    const text = await req.text();
    new URLSearchParams(text).forEach((v, k) => { body[k] = v; });
  } catch { /* GET requests have no body */ }

  const caller = body.From || body.Caller || "unknown";
  if (!step) {
    recentCalls.unshift({ ts: Date.now(), caller, outcome: "connected" });
    if (recentCalls.length > 20) recentCalls.pop();
  }

  // ── Initial greeting ──────────────────────────────────────────────────────
  if (!step) {
    return xml(`
      <Gather action="${BASE_URL}/api/ivr?step=menu" numDigits="1" timeout="10">
        <Say voice="Polly.Joanna">
          Welcome to Green Lake Guest House, South Africa.
          Press 1 to make a reservation.
          Press 2 to check an existing booking.
          Press 3 to speak to our reception team.
        </Say>
      </Gather>
      <Say voice="Polly.Joanna">We did not receive your input. Please call back and try again. Goodbye.</Say>
      <Hangup/>
    `);
  }

  // ── Menu routing ──────────────────────────────────────────────────────────
  if (step === "menu") {
    const digit = body.Digits || "";
    if (digit === "1") {
      return xml(`<Redirect method="POST">${BASE_URL}/api/ivr?step=res&amp;state=name</Redirect>`);
    }
    if (digit === "2") {
      return xml(`<Redirect method="POST">${BASE_URL}/api/ivr?step=check&amp;state=name</Redirect>`);
    }
    if (digit === "3") {
      if (RECEPTION_NUMBER) {
        return xml(`
          <Say voice="Polly.Joanna">Connecting you to our reception team. Please hold.</Say>
          <Dial>${RECEPTION_NUMBER}</Dial>
        `);
      }
      return xml(`
        <Gather action="${BASE_URL}/api/ivr?step=voicemail" numDigits="1" timeout="8">
          <Say voice="Polly.Joanna">
            Reception is currently unavailable. Please call back during business hours,
            or press 1 to leave a voicemail.
          </Say>
        </Gather>
        <Hangup/>
      `);
    }
    // Invalid — replay menu
    return xml(`
      <Gather action="${BASE_URL}/api/ivr?step=menu" numDigits="1" timeout="10">
        <Say voice="Polly.Joanna">
          Sorry, I did not catch that.
          Press 1 to make a reservation.
          Press 2 to check an existing booking.
          Press 3 to speak to reception.
        </Say>
      </Gather>
      <Hangup/>
    `);
  }

  // ── Voicemail ─────────────────────────────────────────────────────────────
  if (step === "voicemail") {
    if (body.Digits === "1") {
      return xml(`
        <Say voice="Polly.Joanna">Please leave your message after the tone. Press hash when done.</Say>
        <Record maxLength="120" finishOnKey="#" action="${BASE_URL}/api/ivr?step=recorded"/>
      `);
    }
    return xml(`<Say voice="Polly.Joanna">Thank you for calling Green Lake Guest House. Goodbye.</Say><Hangup/>`);
  }

  if (step === "recorded") {
    return xml(`
      <Say voice="Polly.Joanna">Thank you for your message. We will get back to you as soon as possible. Goodbye.</Say>
      <Hangup/>
    `);
  }

  // ── Reservation flow ──────────────────────────────────────────────────────
  if (step === "res") {
    const name = req.nextUrl.searchParams.get("name") || "";
    const checkin = req.nextUrl.searchParams.get("checkin") || "";
    const checkout = req.nextUrl.searchParams.get("checkout") || "";
    const roomtype = req.nextUrl.searchParams.get("roomtype") || "";
    const guests = req.nextUrl.searchParams.get("guests") || "";

    if (state === "name") {
      return xml(`
        <Gather input="speech" action="${BASE_URL}/api/ivr?step=res&amp;state=checkin"
                timeout="10" speechTimeout="auto">
          <Say voice="Polly.Joanna">What is your full name?</Say>
        </Gather>
        <Redirect method="POST">${BASE_URL}/api/ivr?step=res&amp;state=name</Redirect>
      `);
    }

    if (state === "checkin") {
      const collectedName = body.SpeechResult || "Guest";
      const nextUrl = buildUrl("/api/ivr", { step: "res", state: "checkout", name: collectedName });
      return xml(`
        <Gather input="speech" action="${nextUrl}" timeout="10" speechTimeout="auto">
          <Say voice="Polly.Joanna">
            Thank you, ${collectedName}.
            What date would you like to check in? Please say the date, for example, April the fifth.
          </Say>
        </Gather>
        <Redirect method="POST">${buildUrl("/api/ivr", { step: "res", state: "checkin" })}</Redirect>
      `);
    }

    if (state === "checkout") {
      const rawCheckin = body.SpeechResult || "";
      const parsedCheckin = parseSpokenDate(rawCheckin);
      const nextUrl = buildUrl("/api/ivr", { step: "res", state: "roomtype", name, checkin: parsedCheckin || rawCheckin });
      return xml(`
        <Gather input="speech" action="${nextUrl}" timeout="10" speechTimeout="auto">
          <Say voice="Polly.Joanna">And your check-out date?</Say>
        </Gather>
        <Redirect method="POST">${buildUrl("/api/ivr", { step: "res", state: "checkout", name })}</Redirect>
      `);
    }

    if (state === "roomtype") {
      const rawCheckout = body.SpeechResult || "";
      const parsedCheckout = parseSpokenDate(rawCheckout);
      const nextUrl = buildUrl("/api/ivr", { step: "res", state: "guests", name, checkin, checkout: parsedCheckout || rawCheckout });
      return xml(`
        <Gather input="speech" action="${nextUrl}" timeout="10" speechTimeout="auto">
          <Say voice="Polly.Joanna">
            Would you prefer a Standard room at 850 rand per night,
            Deluxe at 1200 rand per night,
            or a Suite at 2500 rand per night?
          </Say>
        </Gather>
        <Redirect method="POST">${buildUrl("/api/ivr", { step: "res", state: "roomtype", name, checkin, checkout: parsedCheckout || rawCheckout })}</Redirect>
      `);
    }

    if (state === "guests") {
      const rawRoomtype = body.SpeechResult || "standard";
      const nextUrl = buildUrl("/api/ivr", { step: "res", state: "phone", name, checkin, checkout, roomtype: rawRoomtype });
      return xml(`
        <Gather input="speech" action="${nextUrl}" timeout="10" speechTimeout="auto">
          <Say voice="Polly.Joanna">How many guests will be staying?</Say>
        </Gather>
        <Redirect method="POST">${buildUrl("/api/ivr", { step: "res", state: "guests", name, checkin, checkout, roomtype: rawRoomtype })}</Redirect>
      `);
    }

    if (state === "phone") {
      const rawGuests = body.SpeechResult || "2";
      const nextUrl = buildUrl("/api/ivr", { step: "res", state: "confirm", name, checkin, checkout, roomtype, guests: rawGuests });
      return xml(`
        <Gather input="speech" action="${nextUrl}" timeout="15" speechTimeout="auto">
          <Say voice="Polly.Joanna">What is the best phone number to reach you?</Say>
        </Gather>
        <Redirect method="POST">${buildUrl("/api/ivr", { step: "res", state: "phone", name, checkin, checkout, roomtype })}</Redirect>
      `);
    }

    if (state === "confirm") {
      const rawPhone = body.SpeechResult || "";
      const { type: roomType, price, label: roomLabel } = parseRoomType(roomtype);
      const guestCount = parseGuests(guests);

      const checkinDate = parseSpokenDate(checkin) || checkin;
      const checkoutDate = parseSpokenDate(checkout) || checkout;

      let nights = 1;
      if (checkinDate && checkoutDate) {
        const d1 = new Date(checkinDate);
        const d2 = new Date(checkoutDate);
        const diff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
        if (diff > 0) nights = diff;
      }

      await ensureInit();

      // Find an available room of the requested type
      const fallbackCheckin = checkinDate || new Date().toISOString().split("T")[0];
      const fallbackCheckout = checkoutDate || new Date(Date.now() + 86400000).toISOString().split("T")[0];

      const { rows: available } = await query(
        `SELECT room_number FROM rooms
         WHERE LOWER(room_type) = $1
           AND room_number NOT IN (
             SELECT room_number FROM bookings
             WHERE status NOT IN ('cancelled')
               AND check_in < $3::date
               AND check_out > $2::date
           )
         ORDER BY room_number
         LIMIT 1`,
        [roomType, fallbackCheckin, fallbackCheckout]
      );

      if (available.length === 0) {
        return xml(`
          <Say voice="Polly.Joanna">
            I'm sorry, we do not have any ${roomLabel} rooms available for those dates.
            Please call back to check alternative dates, or press any key to return to the main menu.
          </Say>
          <Gather action="${BASE_URL}/api/ivr?step=menu" numDigits="1" timeout="8">
            <Say voice="Polly.Joanna">Press any key to return to the menu.</Say>
          </Gather>
          <Hangup/>
        `);
      }

      const roomNumber = available[0].room_number;
      const amount = price * nights;

      const { rows: inserted } = await query(
        `INSERT INTO bookings
           (room_number, guest_name, guest_phone, check_in, check_out, adults, status, amount, notes)
         VALUES ($1, $2, $3, $4::date, $5::date, $6, 'pending', $7, 'Booked via IVR call')
         RETURNING id, room_number`,
        [roomNumber, name, rawPhone || null, fallbackCheckin, fallbackCheckout, guestCount, amount]
      );

      if (inserted.length > 0) {
        const bookingId = inserted[0].id || "0000";
        // Update call log outcome
        if (recentCalls[0]) recentCalls[0].outcome = "booked";
        return xml(`
          <Say voice="Polly.Joanna">
            Perfect! A ${roomLabel} room has been confirmed for you,
            checking in ${checkin} and checking out ${checkout},
            for ${guestCount} guest${guestCount !== 1 ? "s" : ""}.
            Your booking reference is G R N dash ${String(bookingId).slice(-4).toUpperCase()}.
            Please present this reference when you arrive.
            We look forward to welcoming you to Green Lake Guest House. Goodbye!
          </Say>
          <Hangup/>
        `);
      }

      // Insert failed — take note manually
      return xml(`
        <Say voice="Polly.Joanna">
          Thank you, ${name}. We have received your reservation request for a ${roomLabel} room
          from ${checkin} to ${checkout}.
          Our team will call you back at the number you provided to confirm.
          Thank you for choosing Green Lake Guest House. Goodbye!
        </Say>
        <Hangup/>
      `);
    }
  }

  // ── Check booking flow ────────────────────────────────────────────────────
  if (step === "check") {
    if (state === "name") {
      return xml(`
        <Gather input="speech" action="${BASE_URL}/api/ivr?step=check&amp;state=result"
                timeout="10" speechTimeout="auto">
          <Say voice="Polly.Joanna">What name is the booking under?</Say>
        </Gather>
        <Redirect method="POST">${BASE_URL}/api/ivr?step=check&amp;state=name</Redirect>
      `);
    }

    if (state === "result") {
      const guestName = body.SpeechResult || "";
      await ensureInit();

      const { rows } = await query(
        `SELECT b.room_number, b.guest_name, b.check_in::text, b.check_out::text, b.status, r.room_type
         FROM bookings b
         JOIN rooms r ON b.room_number = r.room_number
         WHERE LOWER(b.guest_name) LIKE LOWER($1)
           AND b.status NOT IN ('cancelled')
         ORDER BY b.check_in DESC
         LIMIT 1`,
        [`%${guestName}%`]
      );

      if (rows.length > 0) {
        const b = rows[0];
        return xml(`
          <Say voice="Polly.Joanna">
            I found a booking under ${b.guest_name}.
            Room ${b.room_number}, a ${b.room_type} room.
            Check in: ${b.check_in}. Check out: ${b.check_out}. Status: ${b.status}.
            Is there anything else I can help you with?
          </Say>
          <Gather action="${BASE_URL}/api/ivr?step=menu" numDigits="1" timeout="8">
            <Say voice="Polly.Joanna">Press 1 for reservations, 2 to check another booking, or 3 for reception.</Say>
          </Gather>
          <Hangup/>
        `);
      }

      return xml(`
        <Say voice="Polly.Joanna">
          I am sorry, I could not find a booking under the name ${guestName}.
          Please contact us directly if you need further assistance.
          Thank you for calling Green Lake Guest House. Goodbye.
        </Say>
        <Hangup/>
      `);
    }
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  return xml(`
    <Say voice="Polly.Joanna">We are sorry, something went wrong. Please call back and try again. Goodbye.</Say>
    <Hangup/>
  `);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

// Telnyx may follow redirects with GET in some configurations
export async function GET(req: NextRequest) {
  return handleRequest(req);
}
