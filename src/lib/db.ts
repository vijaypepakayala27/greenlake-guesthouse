import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(text: string, params?: any[]): Promise<{ rows: any[] }> {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

let initialized = false;

export async function ensureInit() {
  if (initialized) return;
  initialized = true;

  await query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      room_number VARCHAR(10) UNIQUE NOT NULL,
      floor INT NOT NULL,
      room_type VARCHAR(20) NOT NULL,
      price_per_night DECIMAL(10,2) NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_number VARCHAR(10) REFERENCES rooms(room_number),
      guest_name VARCHAR(100) NOT NULL,
      guest_phone VARCHAR(20),
      guest_email VARCHAR(100),
      check_in DATE NOT NULL,
      check_out DATE NOT NULL,
      adults INT DEFAULT 1,
      children INT DEFAULT 0,
      status VARCHAR(20) DEFAULT 'pending',
      amount DECIMAL(10,2),
      special_requests TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  // Fix room structure: 3 floors, 5 rooms each
  // Floor 1: Standard (R850), Floor 2: Deluxe (R1200), Floor 3: En-suite (R2500)
  const targetRooms = [
    ...Array.from({ length: 5 }, (_, i) => ({ num: `10${i + 1}`, floor: 1, type: 'standard', price: 850 })),
    ...Array.from({ length: 5 }, (_, i) => ({ num: `20${i + 1}`, floor: 2, type: 'deluxe', price: 1200 })),
    ...Array.from({ length: 5 }, (_, i) => ({ num: `30${i + 1}`, floor: 3, type: 'en-suite', price: 2500 })),
  ];
  const targetNums = new Set(targetRooms.map(r => r.num));

  // Remove rooms not in target (floors 4-5 and any extras)
  await query(`DELETE FROM bookings WHERE room_number NOT IN (${targetRooms.map((_, i) => `$${i + 1}`).join(',')})`, targetRooms.map(r => r.num));
  await query(`DELETE FROM rooms WHERE room_number NOT IN (${targetRooms.map((_, i) => `$${i + 1}`).join(',')})`, targetRooms.map(r => r.num));

  // Upsert correct rooms
  for (const r of targetRooms) {
    await query(
      `INSERT INTO rooms (room_number, floor, room_type, price_per_night) VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_number) DO UPDATE SET floor = $2, room_type = $3, price_per_night = $4`,
      [r.num, r.floor, r.type, r.price]
    );
  }
}
