"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  room_number: string;
  floor: number;
  room_type: string;
  price_per_night: number;
}

interface Booking {
  id: string;
  room_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  check_in: string;  // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  adults: number;
  children: number;
  status: string;
  amount: number;
  special_requests: string;
  notes: string;
  created_at: string;
}

interface BookingForm {
  room_number: string;
  room_type: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  status: string;
  amount: string;
  special_requests: string;
  notes: string;
}

interface EditForm {
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  adults: string;
  children: string;
  status: string;
  amount: string;
  special_requests: string;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FLOOR_LABEL: Record<number, string> = {
  1: "Standard", 2: "Deluxe", 3: "En-suite",
};

const STATUS_OPTIONS = [
  { value: "pending",     label: "Pending",     color: "bg-orange-100 text-orange-800 border-orange-200" },
  { value: "confirmed",   label: "Confirmed",   color: "bg-red-100 text-red-800 border-red-200" },
  { value: "paid",        label: "Paid",        color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "maintenance", label: "Maintenance", color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "cancelled",   label: "Cancelled",   color: "bg-gray-100 text-gray-500 border-gray-200" },
];

const CELL_COLORS: Record<string, string> = {
  available:   "cell-available",
  pending:     "cell-pending",
  confirmed:   "cell-confirmed",
  paid:        "cell-paid",
  maintenance: "cell-maintenance",
};

const TYPE_BADGE: Record<string, string> = {
  standard:  "bg-blue-100 text-blue-700",
  deluxe:    "bg-purple-100 text-purple-700",
  "en-suite": "bg-amber-100 text-amber-700",
  suite:     "bg-amber-100 text-amber-700",
};

const FLOOR_HEADER_BG: Record<number, string> = {
  1: "#1e40af",
  2: "#6b21a8",
  3: "#b45309",
};

const FLOOR_ROOM_LABEL_BG: Record<number, string> = {
  1: "#eff6ff",
  2: "#faf5ff",
  3: "#fffbeb",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function cellDate(ym: string, day: number): string {
  return `${ym}-${String(day).padStart(2, "0")}`;
}

function dayOfWeek(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", { weekday: "short" }).slice(0, 2);
}

function fmt(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function nightCount(checkIn: string, checkOut: string): number {
  return Math.max(0, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000));
}

function bookingToEditForm(b: Booking): EditForm {
  return {
    guest_name: b.guest_name || "",
    guest_phone: b.guest_phone || "",
    guest_email: b.guest_email || "",
    check_in: b.check_in || "",
    check_out: b.check_out || "",
    adults: String(b.adults ?? 1),
    children: String(b.children ?? 0),
    status: b.status || "pending",
    amount: b.amount != null ? String(b.amount) : "",
    special_requests: b.special_requests || "",
    notes: b.notes || "",
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardGrid() {
  const router = useRouter();

  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  // Panel / modal state
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<BookingForm | null>(null);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Edit form in side panel
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [panelError, setPanelError] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);

  const today = todayStr();

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const initialLoad = React.useRef(true);
  const fetchData = useCallback(async () => {
    if (initialLoad.current) setLoading(true);
    try {
      const [roomsRes, bookingsRes] = await Promise.all([
        fetch("/api/rooms"),
        fetch(`/api/bookings?month=${currentMonth}`),
      ]);
      if (roomsRes.status === 401 || bookingsRes.status === 401) {
        router.push("/login");
        return;
      }
      const roomsData = await roomsRes.json();
      const bookingsData = await bookingsRes.json();
      setRooms(roomsData.rooms || []);
      setBookings(bookingsData.bookings || []);
    } catch (e) {
      console.error("fetchData error:", e);
    } finally {
      setLoading(false);
      initialLoad.current = false;
    }
  }, [currentMonth, router]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 5000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // ─── Computed values ────────────────────────────────────────────────────────

  const days = useMemo(() => Array.from({ length: daysInMonth(currentMonth) }, (_, i) => i + 1), [currentMonth]);

  const bookingMap = useMemo(() => {
    const map: Record<string, Record<string, Booking>> = {};
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      if (!map[b.room_number]) map[b.room_number] = {};
      const start = new Date(b.check_in + "T12:00:00");
      const end = new Date(b.check_out + "T12:00:00");
      for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        map[b.room_number][`${yy}-${mm}-${dd}`] = b;
      }
    }
    return map;
  }, [bookings]);

  const roomsByFloor = useMemo(() => {
    const map: Record<number, Room[]> = {};
    for (const r of rooms) {
      if (!map[r.floor]) map[r.floor] = [];
      map[r.floor].push(r);
    }
    return map;
  }, [rooms]);

  const stats = useMemo(() => {
    const occupied = new Set<string>();
    let revenue = 0;
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      if (b.check_in <= today && b.check_out > today) occupied.add(b.room_number);
      if (b.status === "paid") revenue += b.amount || 0;
    }
    return {
      total: rooms.length,
      occupied: occupied.size,
      available: rooms.length - occupied.size,
      revenue,
    };
  }, [bookings, rooms, today]);

  // ─── Month navigation ───────────────────────────────────────────────────────

  function prevMonth() {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  function nextMonth() {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  // ─── Cell click ─────────────────────────────────────────────────────────────

  function handleCellClick(room: Room, day: number, booking: Booking | null) {
    if (booking) {
      setSelectedBooking(booking);
      setEditForm(bookingToEditForm(booking));
      setPanelError("");
      setShowAddModal(false);
    } else {
      const checkIn = cellDate(currentMonth, day);
      const checkOut = cellDate(currentMonth, Math.min(day + 1, daysInMonth(currentMonth)));
      setAddForm({
        room_number: room.room_number,
        room_type: room.room_type,
        guest_name: "", guest_phone: "", guest_email: "",
        check_in: checkIn,
        check_out: checkOut,
        adults: 1, children: 0,
        status: "pending",
        amount: String(room.price_per_night),
        special_requests: "", notes: "",
      });
      setFormError("");
      setSelectedBooking(null);
      setShowAddModal(true);
    }
  }

  // ─── Add booking submit ─────────────────────────────────────────────────────

  async function handleAddBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm) return;
    setFormError("");
    setFormLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addForm,
          adults: Number(addForm.adults),
          children: Number(addForm.children),
          amount: addForm.amount ? Number(addForm.amount) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to create booking");
        return;
      }
      setShowAddModal(false);
      setAddForm(null);
      fetchData();
    } catch {
      setFormError("Connection error. Please try again.");
    } finally {
      setFormLoading(false);
    }
  }

  // ─── Save all edits ─────────────────────────────────────────────────────────

  async function handleUpdateBooking() {
    if (!selectedBooking || !editForm) return;
    setPanelError("");

    // Validate dates
    if (editForm.check_out <= editForm.check_in) {
      setPanelError("Check-out must be after check-in.");
      return;
    }

    setPanelLoading(true);
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          adults: Number(editForm.adults),
          children: Number(editForm.children),
          amount: editForm.amount ? Number(editForm.amount) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPanelError(data.error || "Update failed");
        return;
      }
      setSelectedBooking(data.booking);
      setEditForm(bookingToEditForm(data.booking));
      fetchData();
    } catch {
      setPanelError("Connection error. Please try again.");
    } finally {
      setPanelLoading(false);
    }
  }

  // ─── Quick status update ────────────────────────────────────────────────────

  async function handleQuickUpdate(fields: Partial<Record<string, string | number>>) {
    if (!selectedBooking) return;
    setPanelError("");
    setPanelLoading(true);
    try {
      const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) {
        setPanelError(data.error || "Update failed");
        return;
      }
      setSelectedBooking(data.booking);
      setEditForm(bookingToEditForm(data.booking));
      fetchData();
    } finally {
      setPanelLoading(false);
    }
  }

  // ─── Cancel booking ─────────────────────────────────────────────────────────

  async function handleCancelBooking() {
    if (!selectedBooking) return;
    if (!confirm("This will mark the booking as cancelled.")) return;
    setPanelLoading(true);
    try {
      await fetch(`/api/bookings/${selectedBooking.id}`, { method: "DELETE" });
      setSelectedBooking(null);
      setEditForm(null);
      fetchData();
    } finally {
      setPanelLoading(false);
    }
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ── */}
      <header className="bg-green-900 text-white px-4 py-3 flex items-center justify-between shadow-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-display font-bold text-lg">
            GL
          </div>
          <div>
            <h1 className="font-display font-bold text-xl leading-tight">
              {process.env.NEXT_PUBLIC_HOTEL_NAME || "Green Lake Guest House"}
            </h1>
            <p className="text-green-300 text-xs">South Africa · Reservation Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5 text-sm">
            <button onClick={prevMonth} className="text-white/70 hover:text-white px-1 font-bold text-lg leading-none">‹</button>
            <span className="font-medium w-36 text-center">{monthLabel(currentMonth)}</span>
            <button onClick={nextMonth} className="text-white/70 hover:text-white px-1 font-bold text-lg leading-none">›</button>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-green-300 hover:text-white transition px-2 py-1 rounded"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Stats bar ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 sm:gap-6 flex-wrap flex-shrink-0">
        <StatBadge label="Total Rooms" value={stats.total} />
        <StatBadge label="Occupied Today" value={stats.occupied} valueClass="text-red-600 font-semibold" />
        <StatBadge label="Available Today" value={stats.available} valueClass="text-green-700 font-semibold" />
      </div>

      {/* ── Legend ── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 flex-shrink-0">
        <span className="font-semibold text-gray-700">Status:</span>
        <LegendDot color="bg-green-400" label="Available" />
        <LegendDot color="bg-red-400" label="Confirmed" />
        <LegendDot color="bg-amber-400" label="Paid" />
        <LegendDot color="bg-orange-400" label="Pending" />
        <LegendDot color="bg-gray-400" label="Maintenance" />
        <span className="mx-1 text-gray-300">|</span>
        <span className="font-semibold text-gray-700">Type:</span>
        <LegendDot color="bg-blue-400" label="Standard" />
        <LegendDot color="bg-purple-400" label="Deluxe" />
        <LegendDot color="bg-amber-600" label="En-suite" />
      </div>

      {/* ── Grid + Side Panel ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Grid scroll area */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Loading reservations…
            </div>
          ) : (
            <table className="booking-grid">
              <thead>
                <tr>
                  <th className="room-cell bg-gray-100 border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600 z-20">
                    Room
                  </th>
                  {days.map((d) => {
                    const ds = cellDate(currentMonth, d);
                    const isToday = ds === today;
                    const dow = dayOfWeek(ds);
                    return (
                      <th
                        key={d}
                        className={`day-header ${isToday ? "today" : ""}`}
                      >
                        <div>{d}</div>
                        <div style={{ fontSize: 9, fontWeight: 400, color: isToday ? "#16a34a" : "#94a3b8" }}>{dow}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((floor) => (
                  <>
                    <tr key={`floor-${floor}`}>
                      <td
                        colSpan={days.length + 1}
                        className="floor-row"
                        style={{ padding: "4px 10px", background: FLOOR_HEADER_BG[floor], color: "white", fontSize: 11, fontWeight: 600 }}
                      >
                        Floor {floor} — {FLOOR_LABEL[floor]}
                      </td>
                    </tr>

                    {(roomsByFloor[floor] || []).map((room) => (
                      <tr key={room.room_number} className="hover:bg-gray-50/80">
                        <td className="room-cell border border-gray-200 px-2 py-1" style={{ background: FLOOR_ROOM_LABEL_BG[floor] }}>
                          <div className="font-semibold text-gray-800 text-xs">{room.room_number}</div>
                          <div className={`inline-block px-1 rounded text-gray-500 mt-0.5 capitalize`} style={{ fontSize: 9 }}>
                            R{room.price_per_night.toLocaleString()}
                          </div>
                        </td>

                        {days.map((d) => {
                          const ds = cellDate(currentMonth, d);
                          const booking = bookingMap[room.room_number]?.[ds] || null;
                          const isToday = ds === today;
                          const colorClass = booking ? (CELL_COLORS[booking.status] || "cell-available") : "cell-available";
                          const isFirstDay = booking && ds === booking.check_in;

                          return (
                            <td
                              key={d}
                              className="grid-cell border border-gray-100"
                              style={isToday ? { outline: "2px solid #16a34a", outlineOffset: "-1px" } : undefined}
                              onClick={() => handleCellClick(room, d, booking)}
                              title={booking
                                ? `${booking.guest_name} (${booking.status}) — ${fmt(booking.check_in)} → ${fmt(booking.check_out)}`
                                : `Available — Room ${room.room_number}, ${ds}`}
                            >
                              <div className={`grid-cell-inner ${colorClass}`}>
                                {booking && (
                                  isFirstDay
                                    ? <span className="grid-cell-name">{booking.guest_name.split(" ")[0]}</span>
                                    : <span style={{ fontSize: 9, opacity: 0.5, lineHeight: 1 }}>›</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Side Panel ── */}
        {selectedBooking && editForm && (
          <div className="side-panel w-80 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
            {/* Panel header */}
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-800 text-sm">Edit Booking</h2>
                <p className="text-xs text-gray-500">Room {selectedBooking.room_number}</p>
              </div>
              <button
                onClick={() => { setSelectedBooking(null); setEditForm(null); }}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-4 space-y-4">

              {/* Quick status actions */}
              <div className="flex flex-wrap gap-1.5">
                {selectedBooking.status === "pending" && (
                  <button
                    onClick={() => handleQuickUpdate({ status: "confirmed" })}
                    disabled={panelLoading}
                    className="px-2 py-1 text-xs bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 rounded-md transition disabled:opacity-40"
                  >
                    Mark Confirmed
                  </button>
                )}
                {selectedBooking.status === "confirmed" && (
                  <button
                    onClick={() => handleQuickUpdate({ status: "paid" })}
                    disabled={panelLoading}
                    className="px-2 py-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 rounded-md transition disabled:opacity-40"
                  >
                    Mark Paid
                  </button>
                )}
                {selectedBooking.status === "confirmed" && (
                  <button
                    onClick={() => handleQuickUpdate({ status: "confirmed", check_in: today })}
                    disabled={panelLoading}
                    className="px-2 py-1 text-xs bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 rounded-md transition disabled:opacity-40"
                  >
                    Check In
                  </button>
                )}
                {(selectedBooking.status === "confirmed" || selectedBooking.status === "paid") && (
                  <button
                    onClick={() => handleQuickUpdate({ check_out: today })}
                    disabled={panelLoading}
                    className="px-2 py-1 text-xs bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-md transition disabled:opacity-40"
                  >
                    Check Out
                  </button>
                )}
              </div>

              {/* Guest info */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Guest</h3>
                <PanelInput
                  label="Name"
                  value={editForm.guest_name}
                  onChange={(v) => setEditForm((f) => f ? { ...f, guest_name: v } : f)}
                  placeholder="Full name"
                />
                <PanelInput
                  label="Phone"
                  value={editForm.guest_phone}
                  onChange={(v) => setEditForm((f) => f ? { ...f, guest_phone: v } : f)}
                  placeholder="+27 82 123 4567"
                  type="tel"
                />
                <PanelInput
                  label="Email"
                  value={editForm.guest_email}
                  onChange={(v) => setEditForm((f) => f ? { ...f, guest_email: v } : f)}
                  placeholder="guest@email.com"
                  type="email"
                />
                <div className="grid grid-cols-2 gap-2">
                  <PanelInput
                    label="Adults"
                    value={editForm.adults}
                    onChange={(v) => setEditForm((f) => f ? { ...f, adults: v } : f)}
                    type="number"
                    min={1}
                  />
                  <PanelInput
                    label="Children"
                    value={editForm.children}
                    onChange={(v) => setEditForm((f) => f ? { ...f, children: v } : f)}
                    type="number"
                    min={0}
                  />
                </div>
              </div>

              {/* Stay */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stay</h3>
                <div className="grid grid-cols-2 gap-2">
                  <PanelInput
                    label="Check-in"
                    value={editForm.check_in}
                    onChange={(v) => setEditForm((f) => f ? { ...f, check_in: v } : f)}
                    type="date"
                  />
                  <PanelInput
                    label="Check-out"
                    value={editForm.check_out}
                    onChange={(v) => setEditForm((f) => f ? { ...f, check_out: v } : f)}
                    type="date"
                  />
                </div>
                {editForm.check_in && editForm.check_out && editForm.check_out > editForm.check_in && (
                  <p className="text-xs text-gray-500">{nightCount(editForm.check_in, editForm.check_out)} night(s)</p>
                )}
              </div>

              {/* Status & Amount */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Booking</h3>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => f ? { ...f, status: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <PanelInput
                  label="Amount (ZAR)"
                  value={editForm.amount}
                  onChange={(v) => setEditForm((f) => f ? { ...f, amount: v } : f)}
                  type="number"
                  placeholder="0.00"
                />
              </div>

              {/* Requests & Notes */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Special Requests</label>
                  <textarea
                    value={editForm.special_requests}
                    onChange={(e) => setEditForm((f) => f ? { ...f, special_requests: e.target.value } : f)}
                    rows={2}
                    placeholder="Any special requests…"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Notes (internal)</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => f ? { ...f, notes: e.target.value } : f)}
                    rows={2}
                    placeholder="Internal staff notes…"
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                  />
                </div>
              </div>

              {/* Error */}
              {panelError && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {panelError}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleUpdateBooking}
                  disabled={panelLoading}
                  className="flex-1 bg-green-700 hover:bg-green-800 disabled:bg-gray-300 text-white text-xs font-semibold py-2 rounded-lg transition"
                >
                  {panelLoading ? "Saving…" : "Save Changes"}
                </button>
                <button
                  onClick={handleCancelBooking}
                  disabled={panelLoading || selectedBooking.status === "cancelled"}
                  className="px-3 py-2 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 text-xs rounded-lg transition"
                  title="Cancel booking"
                >
                  Cancel
                </button>
              </div>

              <p className="text-xs text-gray-400">
                Booked {new Date(selectedBooking.created_at).toLocaleDateString("en-ZA")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Add Booking Modal ── */}
      {showAddModal && addForm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="modal-content bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-green-900 text-white px-6 py-4 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-lg">New Booking</h2>
                <p className="text-green-300 text-xs mt-0.5">
                  Room {addForm.room_number} · {addForm.room_type.charAt(0).toUpperCase() + addForm.room_type.slice(1)}
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-white/70 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddBooking} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Room Type"
                  value={addForm.room_type.charAt(0).toUpperCase() + addForm.room_type.slice(1)}
                  readOnly
                  onChange={() => {}}
                />
                <FormField
                  label="Room Number"
                  value={addForm.room_number}
                  readOnly
                  onChange={() => {}}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Check-in *"
                  type="date"
                  value={addForm.check_in}
                  onChange={(v) => setAddForm((f) => f ? { ...f, check_in: v } : f)}
                  required
                />
                <FormField
                  label="Check-out *"
                  type="date"
                  value={addForm.check_out}
                  onChange={(v) => setAddForm((f) => f ? { ...f, check_out: v } : f)}
                  required
                />
              </div>

              <FormField
                label="Guest Name *"
                value={addForm.guest_name}
                onChange={(v) => setAddForm((f) => f ? { ...f, guest_name: v } : f)}
                placeholder="Full name"
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Phone (WhatsApp)"
                  value={addForm.guest_phone}
                  onChange={(v) => setAddForm((f) => f ? { ...f, guest_phone: v } : f)}
                  placeholder="+27 82 123 4567"
                  type="tel"
                />
                <FormField
                  label="Email"
                  value={addForm.guest_email}
                  onChange={(v) => setAddForm((f) => f ? { ...f, guest_email: v } : f)}
                  placeholder="guest@email.com"
                  type="email"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  label="Adults"
                  type="number"
                  value={String(addForm.adults)}
                  onChange={(v) => setAddForm((f) => f ? { ...f, adults: Number(v) } : f)}
                  min={1}
                />
                <FormField
                  label="Children"
                  type="number"
                  value={String(addForm.children)}
                  onChange={(v) => setAddForm((f) => f ? { ...f, children: Number(v) } : f)}
                  min={0}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
                  <select
                    value={addForm.status}
                    onChange={(e) => setAddForm((f) => f ? { ...f, status: e.target.value } : f)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="paid">Paid</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
                <FormField
                  label="Amount (ZAR)"
                  type="number"
                  value={addForm.amount}
                  onChange={(v) => setAddForm((f) => f ? { ...f, amount: v } : f)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                <textarea
                  value={addForm.special_requests}
                  onChange={(e) => setAddForm((f) => f ? { ...f, special_requests: e.target.value } : f)}
                  rows={2}
                  placeholder="Any special requests or requirements…"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => f ? { ...f, notes: e.target.value } : f)}
                  rows={2}
                  placeholder="Internal notes for staff…"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none"
                />
              </div>

              {formError && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium py-3 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 bg-green-900 hover:bg-green-800 disabled:bg-gray-300 text-white text-sm font-semibold py-3 rounded-xl transition"
                >
                  {formLoading ? "Creating…" : "Create Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatBadge({ label, value, valueClass = "text-gray-800 font-medium" }: {
  label: string; value: string | number; valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-500">{label}:</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block w-3 h-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function PanelRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-800 text-xs font-medium text-right">{value}</span>
    </div>
  );
}

function PanelInput({
  label, value, onChange, type = "text", placeholder, min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-600"
      />
    </div>
  );
}

function FormField({
  label, value, onChange, type = "text", placeholder, required, readOnly, min,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  readOnly?: boolean;
  min?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        min={min}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none transition ${
          readOnly
            ? "bg-gray-50 border-gray-200 text-gray-500 cursor-default"
            : "border-gray-300 focus:ring-2 focus:ring-green-600"
        }`}
      />
    </div>
  );
}
