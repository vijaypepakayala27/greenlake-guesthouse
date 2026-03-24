"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const IVR_NUMBER = process.env.NEXT_PUBLIC_IVR_NUMBER || "+27101579079";

function IvrModal({ onClose }: { onClose: () => void }) {
  const [ivrBookings, setIvrBookings] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/bookings")
      .then(r => r.json())
      .then(d => {
        const ivr = (d.bookings || []).filter((b: any) =>
          b.notes && b.notes.toLowerCase().includes("ivr")
        ).slice(0, 5);
        setIvrBookings(ivr);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-md mx-4 border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-sm">AI Assistant Active</span>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white transition text-lg leading-none">&times;</button>
        </div>

        <div className="space-y-3 mb-5">
          <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--muted)] mb-1">Phone Number</div>
            <div className="font-mono text-lg font-semibold text-emerald-400">{IVR_NUMBER}</div>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
            <div className="text-xs font-medium text-emerald-400 mb-1">How to test</div>
            <div className="text-xs text-[var(--muted)]">Call <span className="font-mono text-emerald-400">{IVR_NUMBER}</span> and speak naturally to book a room or check a reservation.</div>
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-widest">Recent AI Bookings</div>
          {ivrBookings.length === 0 ? (
            <div className="text-xs text-[var(--muted)] py-2">No AI bookings yet</div>
          ) : (
            <div className="space-y-2">
              {ivrBookings.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
                  <div>
                    <div className="text-xs font-medium">{b.guestName}</div>
                    <div className="text-[10px] text-[var(--muted)]">{b.roomType} {b.roomNumber} · {b.checkIn} → {b.checkOut}</div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">{b.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Stats {
  totalRooms: number; bookedRooms: number; available: number;
  occupancy: number; revenue: number; guests: number; bookings: number;
}

interface RoomData {
  id: string; type: string; number: string; floor: number;
  pricePerNight: number; booked: boolean;
}

interface BookingData {
  id: string; roomId: string; roomType: string; roomNumber: string;
  guestName: string; guestPhone: string; checkIn: string; checkOut: string;
  adults: number; children: number; totalPrice: number; status: string;
  confirmationCode: string; notes: string; createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  Standard: "from-blue-500/20 to-blue-600/10 border-blue-500/20",
  Deluxe: "from-purple-500/20 to-purple-600/10 border-purple-500/20",
  Suite: "from-amber-500/20 to-amber-600/10 border-amber-500/20",
};
const TYPE_DOT: Record<string, string> = {
  Standard: "bg-blue-400", Deluxe: "bg-purple-400", Suite: "bg-amber-400",
};
const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-blue-500/15 text-blue-400 border border-blue-500/20",
  pending: "bg-yellow-500/15 text-yellow-400 border border-yellow-500/20",
  "checked-in": "bg-green-500/15 text-green-400 border border-green-500/20",
  "checked-out": "bg-zinc-500/15 text-zinc-400 border border-zinc-500/20",
  cancelled: "bg-red-500/15 text-red-400 border border-red-500/20",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [showIvr, setShowIvr] = useState(false);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, []);

  async function fetchData() {
    try {
      const [bRes, rRes] = await Promise.all([fetch("/api/bookings"), fetch("/api/rooms")]);
      const bData = await bRes.json();
      const rData = await rRes.json();
      if (bData.stats) setStats(bData.stats);
      if (bData.bookings) setBookings(bData.bookings);
      if (rData.rooms) setRooms(rData.rooms);
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    }
  }

  const floors = [5, 4, 3, 2, 1];

  return (
    <div className="min-h-screen mesh-bg">
      <nav className="fixed top-0 left-0 right-0 z-50 glass" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dim)] flex items-center justify-center text-sm font-bold text-[var(--bg)]">GL</div>
              <span className="font-display text-lg font-semibold tracking-tight">Green Lake Guest House</span>
            </Link>
            <span className="text-[var(--muted)] text-sm hidden sm:inline">/ Dashboard</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowIvr(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 transition"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium hidden sm:inline">AI Active: {IVR_NUMBER}</span>
              <span className="text-xs text-emerald-400 font-medium sm:hidden">AI</span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--green)]/10 border border-[var(--green)]/20">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
              <span className="text-xs text-[var(--green)] font-medium">Live</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 pt-20 pb-12">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
            <StatCard label="Occupancy" value={`${stats.occupancy}%`} icon={
              <div className="relative w-10 h-10">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="var(--gold)" strokeWidth="3"
                    strokeDasharray={`${stats.occupancy * 0.94} 100`} strokeLinecap="round" />
                </svg>
              </div>
            } highlight />
            <StatCard label="Revenue" value={`R${stats.revenue.toLocaleString()}`} sub="total" icon={<span className="text-2xl">💰</span>} />
            <StatCard label="Guests" value={stats.guests} sub="in-house" icon={<span className="text-2xl">👤</span>} />
            <StatCard label="Available" value={stats.available} sub={`of ${stats.totalRooms}`} icon={<span className="text-2xl">🔑</span>} />
            <StatCard label="Bookings" value={stats.bookings} sub="total" icon={<span className="text-2xl">📋</span>} />
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="glass rounded-2xl overflow-hidden glow-gold">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="font-semibold text-sm">Floor Plan</h2>
                {selectedFloor && (
                  <button onClick={() => setSelectedFloor(null)} className="text-xs text-[var(--gold)] hover:underline">All floors</button>
                )}
              </div>
              <div className="p-4 space-y-3">
                {floors.map(floor => {
                  const floorRooms = rooms.filter(r => r.floor === floor);
                  if (floorRooms.length === 0) return null;
                  const type = floorRooms[0]?.type || "";
                  const booked = floorRooms.filter(r => r.booked).length;
                  const total = floorRooms.length;
                  const isSelected = selectedFloor === floor;

                  return (
                    <button
                      key={floor}
                      onClick={() => setSelectedFloor(isSelected ? null : floor)}
                      className={`w-full text-left rounded-xl p-3 border transition ${
                        isSelected ? "border-[var(--gold)]/30 bg-[var(--gold)]/5" : "border-white/5 hover:border-white/10 bg-[var(--card)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-[var(--muted)]">F{floor}</span>
                          <span className="text-sm font-medium">{type}</span>
                        </div>
                        <span className="text-xs text-[var(--muted)]">{booked}/{total} occupied</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {floorRooms.map(room => (
                          <div
                            key={room.id}
                            className={`w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-mono transition ${
                              room.booked
                                ? `bg-gradient-to-br ${TYPE_COLORS[room.type] || TYPE_COLORS.Standard} border`
                                : "bg-white/[0.03] border border-white/5"
                            }`}
                            title={`Room ${room.number} — ${room.booked ? "Occupied" : "Available"}`}
                          >
                            {room.number.slice(-2)}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
                <div className="flex items-center gap-4 px-1 pt-2 text-[10px] text-[var(--muted)]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-white/[0.03] border border-white/10" /> Available</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-gradient-to-br from-blue-500/30 to-blue-600/20 border border-blue-500/20" /> Occupied</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="glass rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="font-semibold text-sm">Recent Bookings</h2>
                <div className="flex items-center gap-2 text-[10px] text-[var(--muted)]">
                  <div className="w-1 h-1 rounded-full bg-[var(--green)] animate-pulse" />
                  Auto-refresh
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {bookings.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-[var(--muted)]">No bookings yet</div>
                )}
                {bookings.map((b, i) => (
                  <div key={b.id} className="px-5 py-3.5 hover:bg-white/[0.015] transition animate-fadeUp" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${TYPE_DOT[b.roomType] || "bg-gray-400"}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{b.guestName}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_STYLE[b.status] || STATUS_STYLE.confirmed}`}>
                              {b.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--muted)]">
                            <span className="font-mono">{b.confirmationCode}</span>
                            <span>{b.roomType} {b.roomNumber}</span>
                            <span>{formatDate(b.checkIn)} → {formatDate(b.checkOut)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold text-sm">R{b.totalPrice?.toLocaleString()}</div>
                        <div className="text-[10px] text-[var(--muted)]">
                          {b.adults}A{b.children > 0 ? ` ${b.children}C` : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showIvr && <IvrModal onClose={() => setShowIvr(false)} />}
    </div>
  );
}

function StatCard({ label, value, sub, icon, highlight }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div className={`glass rounded-xl p-4 ${highlight ? "glow-gold border-[var(--gold)]/10" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--muted)]">{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold ${highlight ? "text-[var(--gold)]" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
