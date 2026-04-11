"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
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

type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

type RsvpFilter = "all" | "pending" | "attending" | "declined";
type GuestSortKey = "guest_name" | "invite_code" | "attending" | "max_guests" | "confirmed_guests";
type SortDirection = "asc" | "desc";
type AdminTab = "all" | "overview" | "invitations" | "seating";

type InlineGuestDraft = {
  guest_name: string;
  invite_code: string;
  max_guests: number;
  attending: boolean | null;
  confirmed_guests: number | null;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "default";
  onConfirm: () => Promise<void> | void;
};

const INVITE_BASE_URL = "https://omar-hager-rsvp.vercel.app";

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

  const [seatingName, setSeatingName] = useState("");
  const [tableNumber, setTableNumber] = useState(1);
  const [editingSeatingId, setEditingSeatingId] = useState<number | null>(null);

  const [guestSearch, setGuestSearch] = useState("");
  const [seatingSearch, setSeatingSearch] = useState("");
  const deferredGuestSearch = useDeferredValue(guestSearch);
  const deferredSeatingSearch = useDeferredValue(seatingSearch);

  const [rsvpFilter, setRsvpFilter] = useState<RsvpFilter>("all");
  const [activeTab, setActiveTab] = useState<AdminTab>("all");
  const [guestSort, setGuestSort] = useState<{ key: GuestSortKey; direction: SortDirection }>({
    key: "guest_name",
    direction: "asc",
  });
  const [seatingSort, setSeatingSort] = useState<{ key: "name" | "table_number"; direction: SortDirection }>({
    key: "table_number",
    direction: "asc",
  });

  const [inlineGuestEdits, setInlineGuestEdits] = useState<Record<number, InlineGuestDraft>>({});
  const [inlineSeatingEdits, setInlineSeatingEdits] = useState<Record<number, { name: string; table_number: number }>>(
    {},
  );

  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);
  const [isGalleryEnabled, setIsGalleryEnabled] = useState(false);
  const [isGalleryFeedEnabled, setIsGalleryFeedEnabled] = useState(true);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const showToast = (message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  };

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

  const fetchData = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("rsvp_list")
      .select("*")
      .order("guest_name", { ascending: true });

    if (fetchError) {
      showToast(fetchError.message, "error");
      return;
    }

    if (data) {
      startTransition(() => {
        setResponses(data);
      });
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", ["is_seating_chart_enabled", "is_gallery_enabled", "is_gallery_feed_enabled"]);

    if (fetchError) {
      showToast(fetchError.message, "error");
      return;
    }

    if (!data) return;

    const seatingSetting = data.find((setting) => setting.key === "is_seating_chart_enabled");
    const gallerySetting = data.find((setting) => setting.key === "is_gallery_enabled");
    const galleryFeedSetting = data.find((setting) => setting.key === "is_gallery_feed_enabled");

    startTransition(() => {
      setIsSeatingChartEnabled(seatingSetting?.value === "true");
      setIsGalleryEnabled(gallerySetting?.value === "true");
      setIsGalleryFeedEnabled(galleryFeedSetting ? galleryFeedSetting.value === "true" : true);
    });
  }, []);

  const fetchSeatingAssignments = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("seating")
      .select("*")
      .order("table_number", { ascending: true })
      .order("name", { ascending: true });

    if (fetchError) {
      showToast(fetchError.message, "error");
      return;
    }

    if (data) {
      startTransition(() => {
        setSeatingAssignments(data);
      });
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;

    const loadDashboard = async () => {
      await Promise.all([fetchData(), fetchSettings(), fetchSeatingAssignments()]);
    };

    void loadDashboard();

    const channel = supabase
      .channel("admin_live")
      .on("postgres_changes", { event: "*", table: "rsvp_list", schema: "public" }, fetchData)
      .on("postgres_changes", { event: "*", table: "seating", schema: "public" }, fetchSeatingAssignments)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized, fetchData, fetchSeatingAssignments, fetchSettings]);

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
    const cleanedName = newName.trim();
    const cleanedCode = newCode.trim();
    if (!cleanedName || !cleanedCode) return;

    const attendingValue = attendanceStatus === "pending" ? null : attendanceStatus === "attending";
    const finalConfirmed =
      attendanceStatus === "pending" ? null : attendanceStatus === "attending" ? Math.max(1, confirmedGuests) : 0;

    const payload = {
      guest_name: cleanedName,
      invite_code: cleanedCode.toUpperCase(),
      max_guests: Math.max(1, newLimit),
      attending: attendingValue,
      confirmed_guests: finalConfirmed,
    };

    if (editingGuestId !== null) {
      const { error: updateError } = await supabase.from("rsvp_list").update(payload).eq("id", editingGuestId);

      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }

      showToast("Invitation updated.", "success");
      resetGuestForm();
      return;
    }

    const { error: insertError } = await supabase.from("rsvp_list").insert([payload]);

    if (insertError) {
      showToast(insertError.message, "error");
      return;
    }

    showToast("Invitation added.", "success");
    resetGuestForm();
  };

  const toggleSeatingChart = async () => {
    const nextValue = !isSeatingChartEnabled;
    const { error: updateError } = await supabase
      .from("settings")
      .update({ value: nextValue.toString() })
      .eq("key", "is_seating_chart_enabled");

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    setIsSeatingChartEnabled(nextValue);
    showToast(`Find Your Table ${nextValue ? "enabled" : "disabled"}.`, "success");
  };

  const toggleGallery = async () => {
    const nextValue = !isGalleryEnabled;
    const { error: updateError } = await supabase
      .from("settings")
      .update({ value: nextValue.toString() })
      .eq("key", "is_gallery_enabled");

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    setIsGalleryEnabled(nextValue);
    showToast(`Guest Gallery ${nextValue ? "enabled" : "disabled"}.`, "success");
  };

  const toggleGalleryFeed = async () => {
    const nextValue = !isGalleryFeedEnabled;
    const { error: updateError } = await supabase
      .from("settings")
      .update({ value: nextValue.toString() })
      .eq("key", "is_gallery_feed_enabled");

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    setIsGalleryFeedEnabled(nextValue);
    showToast(`Shared photos section ${nextValue ? "enabled" : "hidden"}.`, "success");
  };

  const addSeatingAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = seatingName.trim();
    if (!cleanedName) return;

    const payload = {
      name: cleanedName,
      table_number: Math.max(1, tableNumber),
    };

    if (editingSeatingId !== null) {
      const { error: updateError } = await supabase.from("seating").update(payload).eq("id", editingSeatingId);

      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }

      showToast("Seating assignment updated.", "success");
      resetSeatingForm();
      return;
    }

    const { error: insertError } = await supabase.from("seating").insert([payload]);

    if (insertError) {
      showToast(insertError.message, "error");
      return;
    }

    showToast("Seating assignment added.", "success");
    resetSeatingForm();
  };

  const stats = useMemo(() => {
    const attendingGuests = responses.filter((guest) => guest.attending === true);
    const declinedGuests = responses.filter((guest) => guest.attending === false);
    const pendingGuests = responses.filter((guest) => guest.attending === null);
    const totalAccepted = attendingGuests.reduce((sum, guest) => sum + (guest.confirmed_guests || 0), 0);
    const totalInvitedGuests = responses.reduce((sum, guest) => sum + (guest.max_guests || 0), 0);

    return {
      invitedHouseholds: responses.length,
      invitedGuests: totalInvitedGuests,
      attendingGuests: totalAccepted,
      declinedHouseholds: declinedGuests.length,
      pendingHouseholds: pendingGuests.length,
    };
  }, [responses]);

  const filteredResponses = useMemo(() => {
    const query = deferredGuestSearch.trim().toLowerCase();
    const byQuery = query
      ? responses.filter((guest) =>
          [guest.guest_name, guest.invite_code].some((value) => value.toLowerCase().includes(query)),
        )
      : responses;

    const byStatus = byQuery.filter((guest) => {
      if (rsvpFilter === "all") return true;
      if (rsvpFilter === "pending") return guest.attending === null;
      if (rsvpFilter === "attending") return guest.attending === true;
      return guest.attending === false;
    });

    return [...byStatus].sort((a, b) => {
      const directionFactor = guestSort.direction === "asc" ? 1 : -1;

      if (guestSort.key === "guest_name" || guestSort.key === "invite_code") {
        return a[guestSort.key].localeCompare(b[guestSort.key]) * directionFactor;
      }

      if (guestSort.key === "attending") {
        const order = (value: boolean | null) => (value === true ? 2 : value === false ? 1 : 0);
        return (order(a.attending) - order(b.attending)) * directionFactor;
      }

      const left = guestSort.key === "max_guests" ? a.max_guests : a.confirmed_guests || 0;
      const right = guestSort.key === "max_guests" ? b.max_guests : b.confirmed_guests || 0;
      return (left - right) * directionFactor;
    });
  }, [deferredGuestSearch, guestSort, responses, rsvpFilter]);

  const filteredSeatingAssignments = useMemo(() => {
    const query = deferredSeatingSearch.trim().toLowerCase();
    const byQuery = query
      ? seatingAssignments.filter(
          (assignment) =>
            assignment.name.toLowerCase().includes(query) || String(assignment.table_number).includes(query),
        )
      : seatingAssignments;

    return [...byQuery].sort((a, b) => {
      const directionFactor = seatingSort.direction === "asc" ? 1 : -1;
      if (seatingSort.key === "name") return a.name.localeCompare(b.name) * directionFactor;
      return (a.table_number - b.table_number) * directionFactor;
    });
  }, [deferredSeatingSearch, seatingAssignments, seatingSort]);

  const setGuestSortKey = (key: GuestSortKey) => {
    setGuestSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
  };

  const setSeatingSortKey = (key: "name" | "table_number") => {
    setSeatingSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" },
    );
  };

  const startInlineGuestEdit = (guest: GuestResponse) => {
    setInlineGuestEdits((prev) => ({
      ...prev,
      [guest.id]: {
        guest_name: guest.guest_name,
        invite_code: guest.invite_code,
        max_guests: guest.max_guests,
        attending: guest.attending,
        confirmed_guests: guest.confirmed_guests,
      },
    }));
  };

  const cancelInlineGuestEdit = (guestId: number) => {
    setInlineGuestEdits((prev) => {
      const next = { ...prev };
      delete next[guestId];
      return next;
    });
  };

  const saveInlineGuestEdit = async (guestId: number) => {
    const draft = inlineGuestEdits[guestId];
    if (!draft) return;

    const maxGuests = Math.max(1, draft.max_guests || 1);
    const attending = draft.attending;
    const confirmed =
      attending === true
        ? Math.min(Math.max(1, draft.confirmed_guests || 1), maxGuests)
        : attending === false
          ? 0
          : null;

    const { error: updateError } = await supabase
      .from("rsvp_list")
      .update({
        guest_name: draft.guest_name.trim(),
        invite_code: draft.invite_code.trim().toUpperCase(),
        max_guests: maxGuests,
        attending,
        confirmed_guests: confirmed,
      })
      .eq("id", guestId);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    cancelInlineGuestEdit(guestId);
    showToast("Guest row updated.", "success");
  };

  const startInlineSeatingEdit = (assignment: SeatingAssignment) => {
    setInlineSeatingEdits((prev) => ({
      ...prev,
      [assignment.id]: { name: assignment.name, table_number: assignment.table_number },
    }));
  };

  const cancelInlineSeatingEdit = (assignmentId: number) => {
    setInlineSeatingEdits((prev) => {
      const next = { ...prev };
      delete next[assignmentId];
      return next;
    });
  };

  const saveInlineSeatingEdit = async (assignmentId: number) => {
    const draft = inlineSeatingEdits[assignmentId];
    if (!draft) return;

    const { error: updateError } = await supabase
      .from("seating")
      .update({
        name: draft.name.trim(),
        table_number: Math.max(1, draft.table_number || 1),
      })
      .eq("id", assignmentId);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    cancelInlineSeatingEdit(assignmentId);
    showToast("Seating row updated.", "success");
  };

  const copyInvitation = async (guest: GuestResponse) => {
    const message = `Dear ${guest.guest_name}, with great joy, Omar & Hager invite you to celebrate their wedding. Please RSVP here: ${INVITE_BASE_URL}/${guest.invite_code.toLowerCase()}`;
    try {
      await navigator.clipboard.writeText(message);
      showToast("Invitation text copied.", "success");
    } catch (copyError) {
      showToast(copyError instanceof Error ? copyError.message : "Could not copy invitation.", "error");
    }
  };

  const askConfirm = (dialog: ConfirmDialogState) => setConfirmDialog(dialog);
  const tabClass = (tab: Exclude<AdminTab, "all">) =>
    activeTab === "all" || activeTab === tab ? "block" : "hidden";

  if (!authorized) {
    return (
      <div className="wedding-shell flex items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.65),_transparent_55%)]" />
        <form
          onSubmit={handleLogin}
          className="wedding-panel wedding-animate-up relative z-10 w-full max-w-md px-8 py-10 text-center md:px-12 md:py-14"
        >
          <div className="mb-6 flex justify-center">
            <img src="/logo.png" alt="Omar & Hager logo" className="h-auto w-20" />
          </div>
          <p className="wedding-kicker mb-3">Private Access</p>
          <h1 className="wedding-state-title mb-4">Admin Login</h1>
          <div className="wedding-divider mb-8" />
          <p className="wedding-lead mb-8">Manage invitations, guest counts, and live wedding settings.</p>

          <input
            type="password"
            value={passwordInput}
            className="wedding-input text-center"
            placeholder="Enter password"
            onChange={(e) => setPasswordInput(e.target.value)}
          />

          {error && <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-rose-600">{error}</p>}

          <button className="wedding-button-primary mt-8 w-full">Access Dashboard</button>
        </form>
      </div>
    );
  }

  return (
    <div className="wedding-shell px-4 py-6 md:px-8 md:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.6),_transparent_45%)]" />
      <Toasts toasts={toasts} />

      <div className="relative z-10 mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Omar & Hager logo" className="h-auto w-14 md:w-16" />
            <div>
              <p className="wedding-kicker mb-2">Omar & Hager 2026</p>
              <h1 className="wedding-page-title">Guest Management</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="wedding-button-secondary">
              Back to Home
            </Link>
          </div>
        </div>

        <div className="sticky top-2 z-30 mb-5 rounded-2xl bg-white/88 p-1 shadow-lg ring-1 ring-stone-100 backdrop-blur">
          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`rounded-xl px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] md:text-[11px] ${
                activeTab === "all" ? "bg-stone-900 text-white" : "text-stone-600"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`rounded-xl px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] md:text-[11px] ${
                activeTab === "overview" ? "bg-stone-900 text-white" : "text-stone-600"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("invitations")}
              className={`rounded-xl px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] md:text-[11px] ${
                activeTab === "invitations" ? "bg-stone-900 text-white" : "text-stone-600"
              }`}
            >
              Invitations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("seating")}
              className={`rounded-xl px-2 py-2 text-[10px] font-bold uppercase tracking-[0.18em] md:text-[11px] ${
                activeTab === "seating" ? "bg-stone-900 text-white" : "text-stone-600"
              }`}
            >
              Seating
            </button>
          </div>
        </div>

        <section className={`wedding-panel wedding-animate-up mb-8 p-5 md:p-8 ${tabClass("overview")}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Accepted Guests" value={stats.attendingGuests} accent="text-emerald-700" />
            <StatCard label="Total Guests Invited" value={stats.invitedGuests} />
            <StatCard label="Invitations" value={stats.invitedHouseholds} />
            <StatCard label="Pending RSVPs" value={stats.pendingHouseholds} />
            <StatCard label="Declines" value={stats.declinedHouseholds} accent="text-rose-700" />
          </div>
        </section>

        <div className={`mb-8 grid gap-8 ${tabClass("overview")}`}>
          <section className="wedding-section wedding-animate-up mx-auto w-full max-w-3xl p-5 md:p-6">
            <div className="mb-6 text-center md:text-left">
              <p className="wedding-kicker mb-2">Live Controls</p>
              <h2 className="wedding-title text-2xl md:text-3xl">Site Settings</h2>
            </div>

            <div className="space-y-3">
              <ToggleRow
                label="Find Your Table"
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
              <ToggleRow
                label="Gallery Photo Wall"
                description="Show or hide the shared photos section under uploads."
                enabled={isGalleryFeedEnabled}
                onToggle={toggleGalleryFeed}
              />
            </div>
          </section>
        </div>

        <section className={`wedding-section wedding-animate-up mb-8 p-6 md:p-8 ${tabClass("invitations")}`}>
          <div className="mb-8 text-center md:text-left">
            <p className="wedding-kicker mb-2">Invitation Tools</p>
            <h2 className="wedding-title text-3xl md:text-4xl">
              {editingGuestId !== null ? "Edit Invitation" : "Add New Invitation"}
            </h2>
          </div>

          <form onSubmit={addGuest} className="space-y-4">
            <div>
              <label className="wedding-kicker mb-2 ml-2 block">Guest Name</label>
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
                <label className="wedding-kicker mb-2 ml-2 block">Invite Code</label>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  required
                  className="wedding-input uppercase"
                  placeholder="OMARHAGER"
                />
              </div>
              <div>
                <label className="wedding-kicker mb-2 ml-2 block">Guest Limit</label>
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
                <label className="wedding-kicker mb-2 ml-2 block">RSVP Status</label>
                <select
                  value={attendanceStatus}
                  onChange={(e) => setAttendanceStatus(e.target.value as "pending" | "attending" | "declined")}
                  className="wedding-select"
                >
                  <option value="pending">Pending</option>
                  <option value="attending">Attending</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
              <div>
                <label className="wedding-kicker mb-2 ml-2 block">Confirmed Guests</label>
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

            <div className="sticky bottom-3 z-20 -mx-2 rounded-3xl bg-[#D0E0F0]/90 p-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
              <div className="flex flex-col gap-3 md:flex-row">
                <button className="wedding-button-primary w-full md:w-auto">
                  {editingGuestId !== null ? "Save Changes" : "Add to List"}
                </button>
                {editingGuestId !== null && (
                  <button type="button" onClick={resetGuestForm} className="wedding-button-secondary w-full md:w-auto">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>

        <section className={`wedding-section wedding-animate-up overflow-hidden ${tabClass("invitations")}`}>
          <div className="px-6 pb-4 pt-6 md:px-8 md:pt-8">
            <p className="wedding-kicker mb-2">Responses</p>
            <h2 className="wedding-title text-3xl md:text-4xl">Guest List</h2>

            <div className="mt-5 space-y-3">
              <input
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                className="wedding-input"
                placeholder="Search by guest name or invite code"
              />
              <div className="sticky top-2 z-20 -mx-1 flex gap-2 overflow-x-auto rounded-2xl bg-white/85 p-1 backdrop-blur">
                {([
                  { key: "all", label: "All" },
                  { key: "pending", label: "Pending" },
                  { key: "attending", label: "Attending" },
                  { key: "declined", label: "Declined" },
                ] as { key: RsvpFilter; label: string }[]).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setRsvpFilter(item.key)}
                    className={`h-9 rounded-full px-4 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
                      rsvpFilter === item.key ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[880px] text-left">
              <thead className="border-y border-stone-100 bg-white/70 text-[10px] uppercase tracking-[0.25em] text-stone-400">
                <tr>
                  <SortableHead
                    className="px-6 py-4 md:px-8"
                    label="Name"
                    active={guestSort.key === "guest_name"}
                    direction={guestSort.direction}
                    onClick={() => setGuestSortKey("guest_name")}
                  />
                  <SortableHead
                    className="px-4 py-4 text-center"
                    label="Status"
                    active={guestSort.key === "attending"}
                    direction={guestSort.direction}
                    onClick={() => setGuestSortKey("attending")}
                  />
                  <SortableHead
                    className="px-4 py-4 text-center"
                    label="Invited / Accepted"
                    active={guestSort.key === "max_guests" || guestSort.key === "confirmed_guests"}
                    direction={guestSort.direction}
                    onClick={() =>
                      setGuestSortKey(guestSort.key === "max_guests" ? "confirmed_guests" : "max_guests")
                    }
                  />
                  <th className="px-4 py-4 text-center">Invite Link</th>
                  <SortableHead
                    className="px-4 py-4 text-center"
                    label="Code"
                    active={guestSort.key === "invite_code"}
                    direction={guestSort.direction}
                    onClick={() => setGuestSortKey("invite_code")}
                  />
                  <th className="px-6 py-4 text-right md:px-8">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 bg-stone-50/40">
                {filteredResponses.map((guest) => {
                  const draft = inlineGuestEdits[guest.id];
                  const isInlineEditing = Boolean(draft);
                  const acceptedCount = guest.attending ? guest.confirmed_guests || 0 : 0;

                  return (
                    <tr key={guest.id} className="align-middle">
                      <td className="px-6 py-5 md:px-8">
                        {isInlineEditing ? (
                          <input
                            value={draft.guest_name}
                            onChange={(e) =>
                              setInlineGuestEdits((prev) => ({
                                ...prev,
                                [guest.id]: { ...prev[guest.id], guest_name: e.target.value },
                              }))
                            }
                            className="wedding-input"
                          />
                        ) : (
                          <p className="wedding-subtitle text-2xl">{guest.guest_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-5 text-center">
                        {isInlineEditing ? (
                          <select
                            value={
                              draft.attending === null ? "pending" : draft.attending === true ? "attending" : "declined"
                            }
                            onChange={(e) => {
                              const nextStatus = e.target.value;
                              setInlineGuestEdits((prev) => ({
                                ...prev,
                                [guest.id]: {
                                  ...prev[guest.id],
                                  attending:
                                    nextStatus === "pending" ? null : nextStatus === "attending",
                                  confirmed_guests:
                                    nextStatus === "pending"
                                      ? null
                                      : nextStatus === "declined"
                                        ? 0
                                        : Math.max(1, prev[guest.id].confirmed_guests || 1),
                                },
                              }));
                            }}
                            className="wedding-select min-w-[170px]"
                          >
                            <option value="pending">Pending</option>
                            <option value="attending">Attending</option>
                            <option value="declined">Declined</option>
                          </select>
                        ) : (
                          <StatusBadge attending={guest.attending} />
                        )}
                      </td>
                      <td className="px-4 py-5 text-center">
                        {isInlineEditing ? (
                          <div className="mx-auto grid max-w-[180px] gap-2">
                            <input
                              type="number"
                              min={1}
                              value={draft.max_guests}
                              onChange={(e) =>
                                setInlineGuestEdits((prev) => ({
                                  ...prev,
                                  [guest.id]: {
                                    ...prev[guest.id],
                                    max_guests: parseInt(e.target.value, 10) || 1,
                                  },
                                }))
                              }
                              className="wedding-input text-center"
                            />
                            <input
                              type="number"
                              min={draft.attending === true ? 1 : 0}
                              max={Math.max(1, draft.max_guests)}
                              disabled={draft.attending !== true}
                              value={draft.attending === true ? draft.confirmed_guests || 1 : 0}
                              onChange={(e) =>
                                setInlineGuestEdits((prev) => ({
                                  ...prev,
                                  [guest.id]: {
                                    ...prev[guest.id],
                                    confirmed_guests: parseInt(e.target.value, 10) || 0,
                                  },
                                }))
                              }
                              className={`wedding-input text-center ${draft.attending !== true ? "opacity-50" : ""}`}
                            />
                          </div>
                        ) : (
                          <p className="wedding-subtitle text-2xl">
                            <span className="text-stone-300">{guest.max_guests}</span>
                            <span className="mx-2 text-stone-200">/</span>
                            {acceptedCount}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-5 text-center">
                        <button onClick={() => void copyInvitation(guest)} className="wedding-button-secondary">
                          Copy Invitation
                        </button>
                      </td>
                      <td className="px-4 py-5 text-center">
                        {isInlineEditing ? (
                          <input
                            value={draft.invite_code}
                            onChange={(e) =>
                              setInlineGuestEdits((prev) => ({
                                ...prev,
                                [guest.id]: { ...prev[guest.id], invite_code: e.target.value.toUpperCase() },
                              }))
                            }
                            className="wedding-input text-center uppercase"
                          />
                        ) : (
                          <span className="wedding-code">{guest.invite_code}</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right md:px-8">
                        {isInlineEditing ? (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => void saveInlineGuestEdit(guest.id)} className="wedding-button-primary">
                              Save
                            </button>
                            <button onClick={() => cancelInlineGuestEdit(guest.id)} className="wedding-button-secondary">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => startInlineGuestEdit(guest)}
                              className="mr-4 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 transition-colors hover:text-stone-900"
                            >
                              Quick Edit
                            </button>
                            <button
                              onClick={() => {
                                setEditingGuestId(guest.id);
                                setNewName(guest.guest_name);
                                setNewCode(guest.invite_code);
                                setNewLimit(guest.max_guests);
                                setAttendanceStatus(
                                  guest.attending === null ? "pending" : guest.attending ? "attending" : "declined",
                                );
                                setConfirmedGuests(guest.confirmed_guests || 0);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="mr-4 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 transition-colors hover:text-stone-900"
                            >
                              Form Edit
                            </button>
                            <button
                              onClick={() =>
                                askConfirm({
                                  title: "Remove Invitation?",
                                  message: `${guest.guest_name} will be deleted from RSVP list.`,
                                  actionLabel: "Remove",
                                  actionTone: "danger",
                                  onConfirm: async () => {
                                    const { error: deleteError } = await supabase
                                      .from("rsvp_list")
                                      .delete()
                                      .eq("id", guest.id);
                                    if (deleteError) {
                                      showToast(deleteError.message, "error");
                                      return;
                                    }
                                    showToast("Invitation removed.", "success");
                                  },
                                })
                              }
                              className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-500 transition-colors hover:text-rose-700"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 px-4 pb-6 md:hidden">
            {filteredResponses.length === 0 && (
              <div className="wedding-subpanel px-6 py-8 text-center">
                <p className="wedding-lead text-lg">No guests match this filter.</p>
              </div>
            )}
            {filteredResponses.map((guest) => {
              const draft = inlineGuestEdits[guest.id];
              const isInlineEditing = Boolean(draft);
              const acceptedCount = guest.attending ? guest.confirmed_guests || 0 : 0;

              return (
                <article key={guest.id} className="wedding-subpanel p-4">
                  {isInlineEditing ? (
                    <div className="space-y-3">
                      <input
                        value={draft.guest_name}
                        onChange={(e) =>
                          setInlineGuestEdits((prev) => ({
                            ...prev,
                            [guest.id]: { ...prev[guest.id], guest_name: e.target.value },
                          }))
                        }
                        className="wedding-input"
                      />
                      <input
                        value={draft.invite_code}
                        onChange={(e) =>
                          setInlineGuestEdits((prev) => ({
                            ...prev,
                            [guest.id]: { ...prev[guest.id], invite_code: e.target.value.toUpperCase() },
                          }))
                        }
                        className="wedding-input uppercase"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          min={1}
                          value={draft.max_guests}
                          onChange={(e) =>
                            setInlineGuestEdits((prev) => ({
                              ...prev,
                              [guest.id]: { ...prev[guest.id], max_guests: parseInt(e.target.value, 10) || 1 },
                            }))
                          }
                          className="wedding-input"
                        />
                        <input
                          type="number"
                          min={draft.attending === true ? 1 : 0}
                          max={Math.max(1, draft.max_guests)}
                          disabled={draft.attending !== true}
                          value={draft.attending === true ? draft.confirmed_guests || 1 : 0}
                          onChange={(e) =>
                            setInlineGuestEdits((prev) => ({
                              ...prev,
                              [guest.id]: { ...prev[guest.id], confirmed_guests: parseInt(e.target.value, 10) || 0 },
                            }))
                          }
                          className={`wedding-input ${draft.attending !== true ? "opacity-50" : ""}`}
                        />
                      </div>
                      <select
                        value={draft.attending === null ? "pending" : draft.attending ? "attending" : "declined"}
                        onChange={(e) => {
                          const nextStatus = e.target.value;
                          setInlineGuestEdits((prev) => ({
                            ...prev,
                            [guest.id]: {
                              ...prev[guest.id],
                              attending: nextStatus === "pending" ? null : nextStatus === "attending",
                              confirmed_guests:
                                nextStatus === "pending"
                                  ? null
                                  : nextStatus === "declined"
                                    ? 0
                                    : Math.max(1, prev[guest.id].confirmed_guests || 1),
                            },
                          }));
                        }}
                        className="wedding-select"
                      >
                        <option value="pending">Pending</option>
                        <option value="attending">Attending</option>
                        <option value="declined">Declined</option>
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => void saveInlineGuestEdit(guest.id)} className="wedding-button-primary w-full">
                          Save
                        </button>
                        <button onClick={() => cancelInlineGuestEdit(guest.id)} className="wedding-button-secondary w-full">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="wedding-subtitle text-xl">{guest.guest_name}</p>
                          <p className="wedding-code mt-2">{guest.invite_code}</p>
                        </div>
                        <StatusBadge attending={guest.attending} />
                      </div>
                      <div className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm text-stone-600">
                        Invited <strong>{guest.max_guests}</strong> / Accepted <strong>{acceptedCount}</strong>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => void copyInvitation(guest)} className="wedding-button-secondary w-full">
                          Copy Invite
                        </button>
                        <button onClick={() => startInlineGuestEdit(guest)} className="wedding-button-secondary w-full">
                          Quick Edit
                        </button>
                        <button
                          onClick={() => {
                            setEditingGuestId(guest.id);
                            setNewName(guest.guest_name);
                            setNewCode(guest.invite_code);
                            setNewLimit(guest.max_guests);
                            setAttendanceStatus(guest.attending === null ? "pending" : guest.attending ? "attending" : "declined");
                            setConfirmedGuests(guest.confirmed_guests || 0);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className="wedding-button-secondary w-full"
                        >
                          Form Edit
                        </button>
                        <button
                          onClick={() =>
                            askConfirm({
                              title: "Remove Invitation?",
                              message: `${guest.guest_name} will be deleted from RSVP list.`,
                              actionLabel: "Remove",
                              actionTone: "danger",
                              onConfirm: async () => {
                                const { error: deleteError } = await supabase.from("rsvp_list").delete().eq("id", guest.id);
                                if (deleteError) {
                                  showToast(deleteError.message, "error");
                                  return;
                                }
                                showToast("Invitation removed.", "success");
                              },
                            })
                          }
                          className="wedding-button-primary w-full bg-rose-700 hover:bg-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className={`wedding-section wedding-animate-up mb-8 mt-8 p-6 md:p-8 ${tabClass("seating")}`}>
          <div className="mb-8 text-center md:text-left">
            <p className="wedding-kicker mb-2">Table Management</p>
            <h2 className="wedding-title text-3xl md:text-4xl">
              {editingSeatingId !== null ? "Edit Seating Assignment" : "Add Seating Assignment"}
            </h2>
          </div>

          <form onSubmit={addSeatingAssignment} className="space-y-4">
            <div>
              <label className="wedding-kicker mb-2 ml-2 block">Guest Name</label>
              <input
                value={seatingName}
                onChange={(e) => setSeatingName(e.target.value)}
                required
                className="wedding-input"
                placeholder="Guest full name"
              />
            </div>

            <div className="max-w-sm">
              <label className="wedding-kicker mb-2 ml-2 block">Table Number</label>
              <input
                type="number"
                value={tableNumber}
                onChange={(e) => setTableNumber(parseInt(e.target.value, 10) || 1)}
                required
                min="1"
                className="wedding-input"
              />
            </div>

            <div className="sticky bottom-3 z-20 -mx-2 rounded-3xl bg-[#D0E0F0]/90 p-2 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-0">
              <div className="flex flex-col gap-3 md:flex-row">
                <button className="wedding-button-primary w-full md:w-auto">
                  {editingSeatingId !== null ? "Save Assignment" : "Add to Seating Chart"}
                </button>
                {editingSeatingId !== null && (
                  <button type="button" onClick={resetSeatingForm} className="wedding-button-secondary w-full md:w-auto">
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>

        <section className={`wedding-section wedding-animate-up overflow-hidden ${tabClass("seating")}`}>
          <div className="px-6 pb-4 pt-6 md:px-8 md:pt-8">
            <p className="wedding-kicker mb-2">Table Management</p>
            <h2 className="wedding-title text-3xl md:text-4xl">Current Assignments</h2>
            <div className="mt-5 space-y-3">
              <input
                value={seatingSearch}
                onChange={(e) => setSeatingSearch(e.target.value)}
                className="wedding-input"
                placeholder="Search by guest or table number"
              />
              <div className="flex gap-2 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setSeatingSortKey("table_number")}
                  className={`h-9 rounded-full px-4 text-[10px] font-bold uppercase tracking-[0.18em] ${
                    seatingSort.key === "table_number" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  Sort Table {seatingSort.key === "table_number" ? (seatingSort.direction === "asc" ? "↑" : "↓") : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setSeatingSortKey("name")}
                  className={`h-9 rounded-full px-4 text-[10px] font-bold uppercase tracking-[0.18em] ${
                    seatingSort.key === "name" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  Sort Name {seatingSort.key === "name" ? (seatingSort.direction === "asc" ? "↑" : "↓") : ""}
                </button>
              </div>
            </div>
          </div>

          {filteredSeatingAssignments.length === 0 ? (
            <div className="px-6 pb-8 md:px-8">
              <div className="wedding-subpanel px-6 py-8 text-center">
                <p className="wedding-lead text-lg">No matching table assignments.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[620px] text-left">
                  <thead className="border-y border-stone-100 bg-white/70 text-[10px] uppercase tracking-[0.25em] text-stone-400">
                    <tr>
                      <SortableHead
                        className="px-6 py-4 md:px-8"
                        label="Guest"
                        active={seatingSort.key === "name"}
                        direction={seatingSort.direction}
                        onClick={() => setSeatingSortKey("name")}
                      />
                      <SortableHead
                        className="px-4 py-4 text-center"
                        label="Table"
                        active={seatingSort.key === "table_number"}
                        direction={seatingSort.direction}
                        onClick={() => setSeatingSortKey("table_number")}
                      />
                      <th className="px-6 py-4 text-right md:px-8">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-stone-50/40">
                    {filteredSeatingAssignments.map((assignment) => {
                      const draft = inlineSeatingEdits[assignment.id];
                      const isInlineEditing = Boolean(draft);
                      return (
                        <tr key={assignment.id} className="align-middle">
                          <td className="px-6 py-5 md:px-8">
                            {isInlineEditing ? (
                              <input
                                value={draft.name}
                                onChange={(e) =>
                                  setInlineSeatingEdits((prev) => ({
                                    ...prev,
                                    [assignment.id]: { ...prev[assignment.id], name: e.target.value },
                                  }))
                                }
                                className="wedding-input"
                              />
                            ) : (
                              <p className="wedding-subtitle text-xl md:text-2xl">{assignment.name}</p>
                            )}
                          </td>
                          <td className="px-4 py-5 text-center">
                            {isInlineEditing ? (
                              <input
                                type="number"
                                min={1}
                                value={draft.table_number}
                                onChange={(e) =>
                                  setInlineSeatingEdits((prev) => ({
                                    ...prev,
                                    [assignment.id]: {
                                      ...prev[assignment.id],
                                      table_number: parseInt(e.target.value, 10) || 1,
                                    },
                                  }))
                                }
                                className="wedding-input mx-auto max-w-[130px] text-center"
                              />
                            ) : (
                              <span className="inline-flex rounded-full bg-stone-100 px-4 py-2 text-sm font-bold text-stone-700">
                                Table {assignment.table_number}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-5 text-right md:px-8">
                            {isInlineEditing ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => void saveInlineSeatingEdit(assignment.id)}
                                  className="wedding-button-primary"
                                >
                                  Save
                                </button>
                                <button onClick={() => cancelInlineSeatingEdit(assignment.id)} className="wedding-button-secondary">
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => startInlineSeatingEdit(assignment)}
                                  className="mr-4 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 transition-colors hover:text-stone-900"
                                >
                                  Quick Edit
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingSeatingId(assignment.id);
                                    setSeatingName(assignment.name);
                                    setTableNumber(assignment.table_number);
                                    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                                  }}
                                  className="mr-4 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 transition-colors hover:text-stone-900"
                                >
                                  Form Edit
                                </button>
                                <button
                                  onClick={() =>
                                    askConfirm({
                                      title: "Remove Seating Assignment?",
                                      message: `${assignment.name} will be removed from table ${assignment.table_number}.`,
                                      actionLabel: "Remove",
                                      actionTone: "danger",
                                      onConfirm: async () => {
                                        const { error: deleteError } = await supabase
                                          .from("seating")
                                          .delete()
                                          .eq("id", assignment.id);
                                        if (deleteError) {
                                          showToast(deleteError.message, "error");
                                          return;
                                        }
                                        showToast("Seating assignment removed.", "success");
                                      },
                                    })
                                  }
                                  className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-500 transition-colors hover:text-rose-700"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 px-4 pb-6 md:hidden">
                {filteredSeatingAssignments.map((assignment) => {
                  const draft = inlineSeatingEdits[assignment.id];
                  const isInlineEditing = Boolean(draft);
                  return (
                    <article key={assignment.id} className="wedding-subpanel p-4">
                      {isInlineEditing ? (
                        <div className="space-y-3">
                          <input
                            value={draft.name}
                            onChange={(e) =>
                              setInlineSeatingEdits((prev) => ({
                                ...prev,
                                [assignment.id]: { ...prev[assignment.id], name: e.target.value },
                              }))
                            }
                            className="wedding-input"
                          />
                          <input
                            type="number"
                            min={1}
                            value={draft.table_number}
                            onChange={(e) =>
                              setInlineSeatingEdits((prev) => ({
                                ...prev,
                                [assignment.id]: {
                                  ...prev[assignment.id],
                                  table_number: parseInt(e.target.value, 10) || 1,
                                },
                              }))
                            }
                            className="wedding-input"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => void saveInlineSeatingEdit(assignment.id)}
                              className="wedding-button-primary w-full"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => cancelInlineSeatingEdit(assignment.id)}
                              className="wedding-button-secondary w-full"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="mb-3 flex items-start justify-between gap-4">
                            <p className="wedding-subtitle text-xl">{assignment.name}</p>
                            <span className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold text-stone-700">
                              Table {assignment.table_number}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => startInlineSeatingEdit(assignment)} className="wedding-button-secondary w-full">
                              Quick Edit
                            </button>
                            <button
                              onClick={() => {
                                setEditingSeatingId(assignment.id);
                                setSeatingName(assignment.name);
                                setTableNumber(assignment.table_number);
                                window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
                              }}
                              className="wedding-button-secondary w-full"
                            >
                              Form Edit
                            </button>
                            <button
                              onClick={() =>
                                askConfirm({
                                  title: "Remove Seating Assignment?",
                                  message: `${assignment.name} will be removed from table ${assignment.table_number}.`,
                                  actionLabel: "Remove",
                                  actionTone: "danger",
                                  onConfirm: async () => {
                                    const { error: deleteError } = await supabase
                                      .from("seating")
                                      .delete()
                                      .eq("id", assignment.id);
                                    if (deleteError) {
                                      showToast(deleteError.message, "error");
                                      return;
                                    }
                                    showToast("Seating assignment removed.", "success");
                                  },
                                })
                              }
                              className="wedding-button-primary w-full bg-rose-700 hover:bg-rose-600"
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          actionLabel={confirmDialog.actionLabel}
          actionTone={confirmDialog.actionTone}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={async () => {
            await confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
        />
      )}
    </div>
  );
}

function SortableHead({
  label,
  active,
  direction,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  className: string;
}) {
  return (
    <th className={className}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-2 transition-colors hover:text-stone-700">
        {label}
        <span className={`text-[9px] ${active ? "opacity-100" : "opacity-30"}`}>{direction === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
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
    <div className="rounded-[24px] border border-stone-100 bg-stone-50 px-4 py-4 text-center md:text-left">
      <p className="wedding-kicker mb-2">{label}</p>
      <p className={`font-serif text-2xl leading-none md:text-3xl ${accent}`}>{value}</p>
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
    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-stone-100 bg-stone-50 px-4 py-4 md:px-5">
      <div>
        <p className="wedding-subtitle text-base md:text-lg">{label}</p>
        <p className="text-xs md:text-sm text-stone-500">{description}</p>
      </div>
      <button
        onClick={() => void onToggle()}
        className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full transition-colors ${
          enabled ? "bg-stone-900" : "bg-stone-300"
        }`}
        aria-pressed={enabled}
        type="button"
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-9" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function StatusBadge({ attending }: { attending: boolean | null }) {
  const styles =
    attending === null ? "bg-stone-100 text-stone-500" : attending ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700";
  const label = attending === null ? "Pending" : attending ? "Attending" : "Declined";

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] ${styles}`}>
      {label}
    </span>
  );
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] space-y-2 md:right-6 md:top-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur ${
            toast.tone === "success"
              ? "border-emerald-100 bg-emerald-50/95 text-emerald-800"
              : toast.tone === "error"
                ? "border-rose-100 bg-rose-50/95 text-rose-800"
                : "border-stone-200 bg-white/95 text-stone-700"
          } wedding-animate-up`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({
  title,
  message,
  actionLabel,
  actionTone = "default",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "default";
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-stone-900/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-stone-100 bg-white p-6 shadow-2xl md:p-8 wedding-animate-up">
        <p className="wedding-kicker mb-2">Confirm Action</p>
        <h3 className="wedding-title mb-4 text-3xl">{title}</h3>
        <p className="wedding-copy mb-6">{message}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCancel} className="wedding-button-secondary w-full sm:w-auto">
            Cancel
          </button>
          <button
            onClick={() => void onConfirm()}
            className={`wedding-button-primary w-full sm:w-auto ${
              actionTone === "danger" ? "bg-rose-700 hover:bg-rose-600" : ""
            }`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
