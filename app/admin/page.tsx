"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type GuestResponse = {
  id: number;
  guest_name: string;
  invite_code: string;
  max_guests: number;
  attending: boolean | null;
  confirmed_guests: number | null;
};

type SeatingAssignment = {
  id: number;
  name: string;
  table_number: number;
};

export default function AdminDashboard() {
  const [responses, setResponses] = useState<GuestResponse[]>([]);
  const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newLimit, setNewLimit] = useState(1);
  const [attendanceStatus, setAttendanceStatus] = useState<"pending" | "attending" | "declined">("pending");
  const [confirmedGuests, setConfirmedGuests] = useState(1);
  const [editingGuestId, setEditingGuestId] = useState<number | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [seatingName, setSeatingName] = useState("");
  const [tableNumber, setTableNumber] = useState(1);
  const [editingSeatingId, setEditingSeatingId] = useState<number | null>(null);
  const [seatingSearch, setSeatingSearch] = useState("");
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);
  const [isGalleryEnabled, setIsGalleryEnabled] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordInput === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      setAuthorized(true);
      setError("");
      return;
    }

    setError("Incorrect password");
    setPasswordInput("");
  };

  const fetchData = async () => {
    const { data } = await supabase
      .from("rsvp_list")
      .select("*")
      .order("guest_name", { ascending: true });

    if (data) {
      startTransition(() => {
        setResponses(data);
      });
    }
  };

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["is_seating_chart_enabled", "is_gallery_enabled"]);

    if (!data) return;

    const seatingSetting = data.find((setting) => setting.key === "is_seating_chart_enabled");
    const gallerySetting = data.find((setting) => setting.key === "is_gallery_enabled");

    startTransition(() => {
      setIsSeatingChartEnabled(seatingSetting?.value === "true");
      setIsGalleryEnabled(gallerySetting?.value === "true");
    });
  };

  const fetchSeatingAssignments = async () => {
    const { data } = await supabase
      .from("seating")
      .select("*")
      .order("table_number", { ascending: true })
      .order("name", { ascending: true });

    if (data) {
      startTransition(() => {
        setSeatingAssignments(data);
      });
    }
  };

  useEffect(() => {
    if (!authorized) return;

    const loadDashboard = async () => {
      await Promise.all([fetchData(), fetchSettings(), fetchSeatingAssignments()]);
    };

    void loadDashboard();

    const channel = supabase
      .channel("admin_live")
      .on(
        "postgres_changes",
        { event: "*", table: "rsvp_list", schema: "public" },
        fetchData,
      )
      .on(
        "postgres_changes",
        { event: "*", table: "seating", schema: "public" },
        fetchSeatingAssignments,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized]);

  const resetGuestForm = () => {
    setNewName("");
    setNewCode("");
    setNewLimit(1);
    setAttendanceStatus("pending");
    setConfirmedGuests(1);
    setEditingGuestId(null);
  };

  const resetSeatingForm = () => {
    setSeatingName("");
    setTableNumber(1);
    setEditingSeatingId(null);
  };

  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();

    const attendingValue =
      attendanceStatus === "pending" ? null : attendanceStatus === "attending";

    const payload = {
      guest_name: newName.trim(),
      invite_code: newCode.toUpperCase().trim(),
      max_guests: newLimit,
      attending: attendingValue,
      confirmed_guests:
        attendanceStatus === "pending"
          ? null
          : attendanceStatus === "attending"
            ? confirmedGuests
            : 0,
    };

    if (editingGuestId !== null) {
      const { error: updateError } = await supabase
        .from("rsvp_list")
        .update(payload)
        .eq("id", editingGuestId);

      if (updateError) {
        alert(`Error: ${updateError.message}`);
        return;
      }

      resetGuestForm();
      return;
    }

    const { error: insertError } = await supabase.from("rsvp_list").insert([payload]);

    if (insertError) {
      alert(`Error: ${insertError.message}`);
      return;
    }

    resetGuestForm();
  };

  const toggleSeatingChart = async () => {
    const nextValue = !isSeatingChartEnabled;
    const { error: updateError } = await supabase
      .from("settings")
      .update({ value: nextValue.toString() })
      .eq("key", "is_seating_chart_enabled");

    if (!updateError) setIsSeatingChartEnabled(nextValue);
  };

  const toggleGallery = async () => {
    const nextValue = !isGalleryEnabled;
    const { error: updateError } = await supabase
      .from("settings")
      .update({ value: nextValue.toString() })
      .eq("key", "is_gallery_enabled");

    if (!updateError) setIsGalleryEnabled(nextValue);
  };

  const addSeatingAssignment = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanedName = seatingName.trim();
    if (!cleanedName) return;

    const payload = {
      name: cleanedName,
      table_number: tableNumber,
    };

    if (editingSeatingId !== null) {
      const { error: updateError } = await supabase
        .from("seating")
        .update(payload)
        .eq("id", editingSeatingId);

      if (updateError) {
        alert(`Error: ${updateError.message}`);
        return;
      }

      resetSeatingForm();
      return;
    }

    const { error: insertError } = await supabase.from("seating").insert([payload]);

    if (insertError) {
      alert(`Error: ${insertError.message}`);
      return;
    }

    resetSeatingForm();
  };

  const stats = useMemo(() => {
    const attendingGuests = responses.filter((guest) => guest.attending === true);
    const declinedGuests = responses.filter((guest) => guest.attending === false);
    const pendingGuests = responses.filter((guest) => guest.attending === null);
    const totalAccepted = attendingGuests.reduce(
      (sum, guest) => sum + (guest.confirmed_guests || 0),
      0,
    );

    return {
      invitedHouseholds: responses.length,
      attendingGuests: totalAccepted,
      declinedHouseholds: declinedGuests.length,
      pendingHouseholds: pendingGuests.length,
    };
  }, [responses]);

  const filteredResponses = useMemo(() => {
    const query = guestSearch.trim().toLowerCase();
    if (!query) return responses;

    return responses.filter((guest) =>
      [guest.guest_name, guest.invite_code].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [guestSearch, responses]);

  const filteredSeatingAssignments = useMemo(() => {
    const query = seatingSearch.trim().toLowerCase();
    if (!query) return seatingAssignments;

    return seatingAssignments.filter((assignment) =>
      assignment.name.toLowerCase().includes(query) ||
      String(assignment.table_number).includes(query),
    );
  }, [seatingAssignments, seatingSearch]);

  if (!authorized) {
    return (
      <div className="wedding-shell flex items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.65),_transparent_55%)]" />
        <form
          onSubmit={handleLogin}
          className="wedding-panel relative z-10 w-full max-w-md px-8 py-10 md:px-12 md:py-14 text-center"
        >
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Omar & Hager logo" className="w-20 h-auto" />
          </div>
          <p className="wedding-kicker mb-3">Private Access</p>
          <h1 className="wedding-state-title mb-4">
            Admin Login
          </h1>
          <div className="wedding-divider mb-8" />
          <p className="wedding-lead mb-8">
            Manage invitations, guest counts, and live wedding settings.
          </p>

          <input
            type="password"
            value={passwordInput}
            className="wedding-input text-center"
            placeholder="Enter password"
            onChange={(e) => setPasswordInput(e.target.value)}
          />

          {error && <p className="text-rose-600 text-xs uppercase tracking-[0.2em] font-bold mt-4">{error}</p>}

          <button className="wedding-button-primary w-full mt-8">Access Dashboard</button>
        </form>
      </div>
    );
  }

  return (
    <div className="wedding-shell px-4 py-6 md:px-8 md:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.6),_transparent_45%)]" />

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between mb-8">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Omar & Hager logo" className="w-14 md:w-16 h-auto" />
            <div>
              <p className="wedding-kicker mb-2">Omar & Hager 2026</p>
              <h1 className="wedding-page-title">
                Guest Management
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/" className="wedding-button-secondary">
              Back to Home
            </Link>
          </div>
        </div>

        <section className="wedding-panel p-6 md:p-8 lg:p-10 mb-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Accepted Guests" value={stats.attendingGuests} accent="text-pink-900" />
            <StatCard label="Invitations" value={stats.invitedHouseholds} />
            <StatCard label="Pending RSVPs" value={stats.pendingHouseholds} />
            <StatCard label="Declines" value={stats.declinedHouseholds} />
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr] mb-8">
          <section className="wedding-section p-6 md:p-8">
            <div className="mb-8 text-center md:text-left">
              <p className="wedding-kicker mb-2">Live Controls</p>
              <h2 className="wedding-title text-3xl md:text-4xl">Site Settings</h2>
            </div>

            <div className="space-y-4">
              <ToggleRow
                label='Find Your Table'
                description="Show or hide the seating lookup page."
                enabled={isSeatingChartEnabled}
                onToggle={toggleSeatingChart}
              />
              <ToggleRow
                label="Guest Gallery"
                description="Control whether guests can upload and browse photos."
                enabled={isGalleryEnabled}
                onToggle={toggleGallery}
              />
            </div>
          </section>
        </div>

        <section className="wedding-section p-6 md:p-8 mb-8">
          <div className="mb-8 text-center md:text-left">
            <p className="wedding-kicker mb-2">Invitation Tools</p>
            <h2 className="wedding-title text-3xl md:text-4xl">
              {editingGuestId !== null ? "Edit Invitation" : "Add New Invitation"}
            </h2>
          </div>

          <form onSubmit={addGuest} className="space-y-4">
            <div>
              <label className="wedding-kicker block ml-2 mb-2">Guest Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="wedding-input"
                placeholder="Household or primary guest"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[1.1fr_0.7fr]">
              <div>
                <label className="wedding-kicker block ml-2 mb-2">Invite Code</label>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                  className="wedding-input uppercase"
                  placeholder="OMARHAGER"
                />
              </div>
              <div>
                <label className="wedding-kicker block ml-2 mb-2">Guest Limit</label>
                <input
                  type="number"
                  value={newLimit}
                  onChange={(e) => setNewLimit(parseInt(e.target.value, 10) || 1)}
                  required
                  className="wedding-input"
                  min="1"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="wedding-kicker block ml-2 mb-2">RSVP Status</label>
                <select
                  value={attendanceStatus}
                  onChange={(e) =>
                    setAttendanceStatus(e.target.value as "pending" | "attending" | "declined")
                  }
                  className="wedding-select"
                >
                  <option value="pending">Pending</option>
                  <option value="attending">Attending</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
              <div>
                <label className="wedding-kicker block ml-2 mb-2">Confirmed Guests</label>
                <input
                  type="number"
                  value={attendanceStatus === "pending" ? "" : confirmedGuests}
                  onChange={(e) => setConfirmedGuests(parseInt(e.target.value, 10) || 0)}
                  disabled={attendanceStatus === "pending"}
                  className={`wedding-input ${attendanceStatus === "pending" ? "opacity-50" : ""}`}
                  min={attendanceStatus === "attending" ? "1" : "0"}
                  max={newLimit}
                  placeholder={attendanceStatus === "pending" ? "Pending RSVP" : "Guest count"}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button className="wedding-button-primary w-full md:w-auto">
                {editingGuestId !== null ? "Save Changes" : "Add to List"}
              </button>
              {editingGuestId !== null && (
                <button
                  type="button"
                  onClick={resetGuestForm}
                  className="wedding-button-secondary w-full md:w-auto"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="wedding-section overflow-hidden">
          <div className="px-6 pt-6 pb-4 md:px-8 md:pt-8">
            <p className="wedding-kicker mb-2">Responses</p>
            <h2 className="wedding-title text-3xl md:text-4xl">Guest List</h2>
            <div className="mt-5">
              <input
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                className="wedding-input"
                placeholder="Search by guest name or invite code"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-[10px] uppercase tracking-[0.25em] text-stone-400 border-y border-stone-100 bg-white/70">
                <tr>
                  <th className="px-6 md:px-8 py-4">Name</th>
                  <th className="px-4 py-4 text-center">Status</th>
                  <th className="px-4 py-4 text-center">Invited / Accepted</th>
                  <th className="px-4 py-4 text-center">Invite Link</th>
                  <th className="px-4 py-4 text-center">Code</th>
                  <th className="px-6 md:px-8 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-stone-50/40">
                {filteredResponses.map((guest) => (
                  <tr key={guest.id} className="align-middle">
                    <td className="px-6 md:px-8 py-6">
                      <p className="wedding-subtitle text-2xl">{guest.guest_name}</p>
                    </td>
                    <td className="px-4 py-6 text-center">
                      <StatusBadge attending={guest.attending} />
                    </td>
                    <td className="px-4 py-6 text-center wedding-subtitle text-2xl">
                      <span className="text-stone-300">{guest.max_guests}</span>
                      <span className="mx-2 text-stone-200">/</span>
                      {guest.attending ? guest.confirmed_guests || 0 : 0}
                    </td>
                    <td className="px-4 py-6 text-center">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `Dear ${guest.guest_name}, with great joy, Omar & Hager invite you to celebrate their wedding. Please RSVP here: https://omar-hager-rsvp.vercel.app/${guest.invite_code.toLowerCase()}`,
                          );
                          alert("Invitation copied!");
                        }}
                        className="wedding-button-secondary"
                      >
                        Copy Invitation
                      </button>
                    </td>
                    <td className="px-4 py-6 text-center wedding-code">
                      {guest.invite_code}
                    </td>
                    <td className="px-6 md:px-8 py-6 text-right">
                      <button
                        onClick={() => {
                          setEditingGuestId(guest.id);
                          setNewName(guest.guest_name);
                          setNewCode(guest.invite_code);
                          setNewLimit(guest.max_guests);
                          setAttendanceStatus(
                            guest.attending === null
                              ? "pending"
                              : guest.attending
                                ? "attending"
                                : "declined",
                          );
                          setConfirmedGuests(guest.confirmed_guests || 0);
                        }}
                        className="text-[10px] uppercase tracking-[0.22em] font-bold text-stone-500 transition-colors hover:text-stone-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Remove?")) {
                            await supabase.from("rsvp_list").delete().eq("id", guest.id);
                          }
                        }}
                        className="text-[10px] uppercase tracking-[0.22em] font-bold text-rose-400 transition-colors hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="wedding-section p-6 md:p-8 mt-8 mb-8">
          <div className="mb-8 text-center md:text-left">
            <p className="wedding-kicker mb-2">Table Management</p>
            <h2 className="wedding-title text-3xl md:text-4xl">
              {editingSeatingId !== null ? "Edit Seating Assignment" : "Add Seating Assignment"}
            </h2>
          </div>

          <form onSubmit={addSeatingAssignment} className="space-y-4">
            <div>
              <label className="wedding-kicker block ml-2 mb-2">Guest Name</label>
              <input
                value={seatingName}
                onChange={(e) => setSeatingName(e.target.value)}
                required
                className="wedding-input"
                placeholder="Guest full name"
              />
            </div>

            <div className="max-w-sm">
              <label className="wedding-kicker block ml-2 mb-2">Table Number</label>
              <input
                type="number"
                value={tableNumber}
                onChange={(e) => setTableNumber(parseInt(e.target.value, 10) || 1)}
                required
                min="1"
                className="wedding-input"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <button className="wedding-button-primary w-full md:w-auto">
                {editingSeatingId !== null ? "Save Assignment" : "Add to Seating Chart"}
              </button>
              {editingSeatingId !== null && (
                <button
                  type="button"
                  onClick={resetSeatingForm}
                  className="wedding-button-secondary w-full md:w-auto"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="wedding-section overflow-hidden">
          <div className="px-6 pt-6 pb-4 md:px-8 md:pt-8">
            <p className="wedding-kicker mb-2">Table Management</p>
            <h2 className="wedding-title text-3xl md:text-4xl">Current Assignments</h2>
            <div className="mt-5">
              <input
                value={seatingSearch}
                onChange={(e) => setSeatingSearch(e.target.value)}
                className="wedding-input"
                placeholder="Search by guest or table number"
              />
            </div>
          </div>

          {filteredSeatingAssignments.length === 0 ? (
            <div className="px-6 pb-8 md:px-8">
              <div className="wedding-subpanel px-6 py-8 text-center">
                <p className="wedding-lead text-lg">No matching table assignments.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead className="text-[10px] uppercase tracking-[0.25em] text-stone-400 border-y border-stone-100 bg-white/70">
                  <tr>
                    <th className="px-6 md:px-8 py-4">Guest</th>
                    <th className="px-4 py-4 text-center">Table</th>
                    <th className="px-6 md:px-8 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-stone-50/40">
                  {filteredSeatingAssignments.map((assignment) => (
                    <tr key={assignment.id} className="align-middle">
                      <td className="px-6 md:px-8 py-5">
                        <p className="wedding-subtitle text-xl md:text-2xl">{assignment.name}</p>
                      </td>
                      <td className="px-4 py-5 text-center">
                        <span className="inline-flex rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">
                          Table {assignment.table_number}
                        </span>
                      </td>
                      <td className="px-6 md:px-8 py-5 text-right">
                        <button
                          onClick={() => {
                            setEditingSeatingId(assignment.id);
                            setSeatingName(assignment.name);
                            setTableNumber(assignment.table_number);
                          }}
                          className="text-[10px] uppercase tracking-[0.22em] font-bold text-stone-500 transition-colors hover:text-stone-900 mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm("Remove this seating assignment?")) {
                              await supabase.from("seating").delete().eq("id", assignment.id);
                            }
                          }}
                          className="text-[10px] uppercase tracking-[0.22em] font-bold text-rose-400 transition-colors hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "text-stone-900",
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-[28px] bg-stone-50 px-6 py-6 border border-stone-100 text-center md:text-left">
      <p className="wedding-kicker mb-3">{label}</p>
      <p className={`wedding-metric ${accent}`}>{value}</p>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => Promise<void>;
}) {
  return (
    <div className="rounded-[28px] border border-stone-100 bg-stone-50 px-5 py-5 md:px-6 flex items-center justify-between gap-5">
      <div>
        <p className="wedding-subtitle text-lg">{label}</p>
        <p className="text-sm text-stone-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-stone-900" : "bg-stone-300"
        }`}
        aria-pressed={enabled}
        type="button"
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-8" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function StatusBadge({ attending }: { attending: boolean | null }) {
  const styles =
    attending === null
      ? "bg-stone-100 text-stone-500"
      : attending
        ? "bg-emerald-50 text-emerald-700"
        : "bg-rose-50 text-rose-700";

  const label =
    attending === null ? "Pending" : attending ? "Attending" : "Declined";

  return (
    <span
      className={`inline-flex rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.22em] font-bold whitespace-nowrap ${styles}`}
    >
      {label}
    </span>
  );
}
