"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/wedding";

type GuestResponse = {
  id: string;
  invite_code: string;
  guest_name: string;
  max_guests: number;
  confirmed_guests: number | null;
  attending: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  responded_at: string | null;
  invitation_sent: boolean | null;
  has_children: boolean | null;
  children_count: number | null;
  notes?: string | null;
};

type SeatingAssignment = {
  id: number;
  name: string;
  table_number: number;
  guest_count?: number | null;
};

type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

type AdminView = "overview" | "invitations" | "seating" | "settings";
type OverviewWorkspaceTab = "pulse" | "flow" | "watchlist";
type InvitationWorkspaceTab = "manage" | "composer";
type SeatingWorkspaceTab = "board" | "totals" | "composer";
type GuestStatusFilter = "all" | "pending" | "attending" | "declined";
type GuestExtraFilter = "all" | "sent" | "not_sent" | "has_children" | "needs_seating";
type GuestSort = "recent" | "name" | "invite_code" | "largest_party";
type SeatingSort = "table" | "name";

type InlineGuestDraft = {
  guest_name: string;
  invite_code: string;
  max_guests: number;
  attending: boolean | null;
  confirmed_guests: number | null;
  invitation_sent: boolean;
  has_children: boolean;
  children_count: number;
  notes: string;
};

type InlineSeatingDraft = {
  name: string;
  table_number: number;
  guest_count: number;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "default";
  onConfirm: () => Promise<void> | void;
};

type RowMenuItem = {
  label: string;
  onSelect?: () => void;
  href?: string;
  tone?: "default" | "danger";
};

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  timestamp: string;
  sortValue: number;
};

const INVITE_BASE_URL = SITE_URL;

const pemToArrayBuffer = (pem: string) => {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
};

const encryptAdminPassword = async (password: string, publicKeyPem: string) => {
  const publicKey = await window.crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(publicKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const encodedPassword = new TextEncoder().encode(password);
  const encryptedPassword = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, encodedPassword);
  return arrayBufferToBase64(encryptedPassword);
};

const formatAdminDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const normalizeNameKey = (value?: string | null) => (value || "").trim().toLowerCase();

const getLatestGuestTimestamp = (guest: GuestResponse) => {
  const latest = [guest.responded_at, guest.updated_at, guest.created_at]
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];

  return latest ?? 0;
};

const getGuestInviteUrl = (guest: GuestResponse) => `${INVITE_BASE_URL}/${guest.invite_code.toLowerCase()}`;
const getSeatingGuestCount = (guest: GuestResponse) =>
  guest.attending === true ? Math.max(1, guest.confirmed_guests || 1) : Math.max(1, guest.max_guests || 1);

const getGuestActionIndicators = (guest: GuestResponse) => {
  const indicators: string[] = [];
  const respondedAt = formatAdminDateTime(guest.responded_at);
  const editedAt = formatAdminDateTime(guest.updated_at);
  const createdAt = formatAdminDateTime(guest.created_at);

  if (guest.attending === null) {
    indicators.push("Awaiting RSVP");
  } else {
    const responseLabel = guest.attending ? "RSVP accepted" : "RSVP declined";
    indicators.push(respondedAt ? `${responseLabel} · ${respondedAt}` : responseLabel);
  }

  if (guest.invitation_sent) {
    indicators.push("Invitation marked sent");
  }

  if (editedAt) {
    indicators.push(`Last edited · ${editedAt}`);
  } else if (createdAt) {
    indicators.push(`Created · ${createdAt}`);
  }

  return indicators;
};

const buildRecentActivity = (responses: GuestResponse[]) => {
  return responses
    .map((guest) => {
      const respondedAt = guest.responded_at ? new Date(guest.responded_at).getTime() : 0;
      const updatedAt = guest.updated_at ? new Date(guest.updated_at).getTime() : 0;
      const createdAt = guest.created_at ? new Date(guest.created_at).getTime() : 0;
      const latest = Math.max(respondedAt, updatedAt, createdAt);

      if (!latest) return null;

      if (latest === respondedAt && guest.attending !== null) {
        return {
          id: `${guest.id}-responded`,
          title: guest.attending ? "RSVP accepted" : "RSVP declined",
          detail: guest.guest_name,
          timestamp: formatAdminDateTime(guest.responded_at) ?? "Recently",
          sortValue: respondedAt,
        };
      }

      if (latest === updatedAt) {
        return {
          id: `${guest.id}-updated`,
          title: "Invitation updated",
          detail: guest.guest_name,
          timestamp: formatAdminDateTime(guest.updated_at) ?? "Recently",
          sortValue: updatedAt,
        };
      }

      return {
        id: `${guest.id}-created`,
        title: "Invitation created",
        detail: guest.guest_name,
        timestamp: formatAdminDateTime(guest.created_at) ?? "Recently",
        sortValue: createdAt,
      };
    })
    .filter((item): item is ActivityItem => Boolean(item))
    .sort((left, right) => right.sortValue - left.sortValue)
    .slice(0, 8);
};

export default function AdminDashboardV2() {
  const [responses, setResponses] = useState<GuestResponse[]>([]);
  const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState("");

  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [overviewTab, setOverviewTab] = useState<OverviewWorkspaceTab>("pulse");
  const [invitationTab, setInvitationTab] = useState<InvitationWorkspaceTab>("manage");
  const [seatingTab, setSeatingTab] = useState<SeatingWorkspaceTab>("board");

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newLimit, setNewLimit] = useState(1);
  const [attendanceStatus, setAttendanceStatus] = useState<"pending" | "attending" | "declined">("pending");
  const [confirmedGuests, setConfirmedGuests] = useState(1);
  const [invitationSent, setInvitationSent] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
  const [childrenCount, setChildrenCount] = useState<number | "">(1);
  const [guestNotes, setGuestNotes] = useState("");
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);

  const [seatingName, setSeatingName] = useState("");
  const [tableNumber, setTableNumber] = useState(1);
  const [seatingGuestCount, setSeatingGuestCount] = useState(1);
  const [editingSeatingId, setEditingSeatingId] = useState<number | null>(null);

  const [guestSearch, setGuestSearch] = useState("");
  const [guestStatusFilter, setGuestStatusFilter] = useState<GuestStatusFilter>("all");
  const [guestExtraFilter, setGuestExtraFilter] = useState<GuestExtraFilter>("all");
  const [guestSort, setGuestSort] = useState<GuestSort>("recent");
  const deferredGuestSearch = useDeferredValue(guestSearch);

  const [seatingSearch, setSeatingSearch] = useState("");
  const [seatingSort, setSeatingSort] = useState<SeatingSort>("table");
  const [seatingTableFilter, setSeatingTableFilter] = useState<number | "all">("all");
  const [tableMoveFrom, setTableMoveFrom] = useState<number | "">("");
  const [tableMoveTo, setTableMoveTo] = useState<number | "">("");
  const deferredSeatingSearch = useDeferredValue(seatingSearch);

  const [inlineGuestEdits, setInlineGuestEdits] = useState<Record<string, InlineGuestDraft>>({});
  const [inlineSeatingEdits, setInlineSeatingEdits] = useState<Record<number, InlineSeatingDraft>>({});
  const [quickTableDrafts, setQuickTableDrafts] = useState<Record<string, number | "">>({});
  const [inlineTableEdits, setInlineTableEdits] = useState<Record<string, true>>({});
  const [selectedGuestIds, setSelectedGuestIds] = useState<string[]>([]);
  const [bulkTableNumber, setBulkTableNumber] = useState<number | "">(1);

  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);
  const [isGalleryEnabled, setIsGalleryEnabled] = useState(false);
  const [isGalleryFeedEnabled, setIsGalleryFeedEnabled] = useState(true);
  const [isHomeVenueEnabled, setIsHomeVenueEnabled] = useState(false);
  const [isHomeCarouselEnabled, setIsHomeCarouselEnabled] = useState(true);
  const [isHomeDressCodeEnabled, setIsHomeDressCodeEnabled] = useState(false);
  const [isGuestNotesAvailable, setIsGuestNotesAvailable] = useState<boolean | null>(null);
  const [isSeatingGuestCountAvailable, setIsSeatingGuestCountAvailable] = useState<boolean | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [hasRestoredWorkspaceState, setHasRestoredWorkspaceState] = useState(false);

  const invitationFormRef = useRef<HTMLElement | null>(null);
  const seatingFormRef = useRef<HTMLElement | null>(null);

  const showToast = (message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3200);
  };

  const scrollToSection = (ref: React.RefObject<HTMLElement | null>) => {
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const askConfirm = (dialog: ConfirmDialogState) => setConfirmDialog(dialog);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsAuthenticating(true);

    try {
      const publicKeyResponse = await fetch("/api/admin-public-key");
      const publicKeyResult = (await publicKeyResponse.json()) as { ok: boolean; publicKey?: string };

      if (!publicKeyResponse.ok || !publicKeyResult.ok || !publicKeyResult.publicKey) {
        setError("Admin encryption key is not configured");
        return;
      }

      const encryptedPassword = await encryptAdminPassword(passwordInput, publicKeyResult.publicKey);
      const loginResponse = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptedPassword }),
      });
      const result = (await loginResponse.json()) as { ok: boolean; error?: string };

      if (!loginResponse.ok || !result.ok) {
        setError(result.error === "missing_config" ? "Admin password is not configured" : "Incorrect password");
        setPasswordInput("");
        return;
      }

      setAuthorized(true);
      window.sessionStorage.setItem("isLoggedIn", "true");
    } catch {
      setError("Unable to verify password");
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    setAuthorized(window.sessionStorage.getItem("isLoggedIn") === "true");
    setIsCheckingSession(false);
  }, []);

  useEffect(() => {
    if (!authorized || hasRestoredWorkspaceState) return;

    const savedState = window.sessionStorage.getItem("studio_workspace_state_v1");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState) as {
          activeView?: AdminView;
          overviewTab?: OverviewWorkspaceTab;
          invitationTab?: InvitationWorkspaceTab;
          seatingTab?: SeatingWorkspaceTab;
          guestSearch?: string;
          guestStatusFilter?: GuestStatusFilter;
          guestExtraFilter?: GuestExtraFilter;
          guestSort?: GuestSort;
          seatingSearch?: string;
          seatingSort?: SeatingSort;
          seatingTableFilter?: number | "all";
        };

        if (parsed.activeView) setActiveView(parsed.activeView);
        if (parsed.overviewTab) setOverviewTab(parsed.overviewTab);
        if (parsed.invitationTab) setInvitationTab(parsed.invitationTab);
        if (parsed.seatingTab) setSeatingTab(parsed.seatingTab);
        if (parsed.guestSearch !== undefined) setGuestSearch(parsed.guestSearch);
        if (parsed.guestStatusFilter) setGuestStatusFilter(parsed.guestStatusFilter);
        if (parsed.guestExtraFilter) setGuestExtraFilter(parsed.guestExtraFilter);
        if (parsed.guestSort) setGuestSort(parsed.guestSort);
        if (parsed.seatingSearch !== undefined) setSeatingSearch(parsed.seatingSearch);
        if (parsed.seatingSort) setSeatingSort(parsed.seatingSort);
        if (parsed.seatingTableFilter !== undefined) setSeatingTableFilter(parsed.seatingTableFilter);
      } catch {
        window.sessionStorage.removeItem("studio_workspace_state_v1");
      }
    }

    setHasRestoredWorkspaceState(true);
  }, [authorized, hasRestoredWorkspaceState]);

  useEffect(() => {
    if (!authorized || !hasRestoredWorkspaceState) return;

    window.sessionStorage.setItem(
      "studio_workspace_state_v1",
      JSON.stringify({
        activeView,
        overviewTab,
        invitationTab,
        seatingTab,
        guestSearch,
        guestStatusFilter,
        guestExtraFilter,
        guestSort,
        seatingSearch,
        seatingSort,
        seatingTableFilter,
      }),
    );
  }, [
    activeView,
    authorized,
    guestExtraFilter,
    guestSearch,
    guestSort,
    guestStatusFilter,
    hasRestoredWorkspaceState,
    invitationTab,
    overviewTab,
    seatingSearch,
    seatingSort,
    seatingTab,
    seatingTableFilter,
  ]);

  const fetchResponses = useCallback(async () => {
    const { data, error: fetchError } = await supabase.from("rsvp_list").select("*").order("guest_name", { ascending: true });

    if (fetchError) {
      showToast(fetchError.message, "error");
      return;
    }

    if (data) {
      startTransition(() => {
        setResponses(data as GuestResponse[]);
      });
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from("settings")
      .select("key, value")
      .in("key", [
        "is_seating_chart_enabled",
        "is_gallery_enabled",
        "is_gallery_feed_enabled",
        "is_home_venue_enabled",
        "is_home_carousel_enabled",
        "is_home_dress_code_enabled",
      ]);

    if (fetchError) {
      showToast(fetchError.message, "error");
      return;
    }

    if (!data) return;

    const settingsMap = Object.fromEntries(data.map((setting) => [setting.key, setting.value]));

    startTransition(() => {
      setIsSeatingChartEnabled(settingsMap.is_seating_chart_enabled === "true");
      setIsGalleryEnabled(settingsMap.is_gallery_enabled === "true");
      setIsGalleryFeedEnabled(settingsMap.is_gallery_feed_enabled ? settingsMap.is_gallery_feed_enabled === "true" : true);
      setIsHomeVenueEnabled(settingsMap.is_home_venue_enabled === "true");
      setIsHomeCarouselEnabled(settingsMap.is_home_carousel_enabled ? settingsMap.is_home_carousel_enabled === "true" : true);
      setIsHomeDressCodeEnabled(settingsMap.is_home_dress_code_enabled === "true");
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
        setSeatingAssignments(data as SeatingAssignment[]);
      });
    }
  }, []);

  const detectGuestNotesColumn = useCallback(async () => {
    const { error: notesError } = await supabase.from("rsvp_list").select("notes").limit(1);
    setIsGuestNotesAvailable(!notesError);
  }, []);

  const detectSeatingGuestCountColumn = useCallback(async () => {
    const { error: guestCountError } = await supabase.from("seating").select("guest_count").limit(1);
    setIsSeatingGuestCountAvailable(!guestCountError);
  }, []);

  useEffect(() => {
    if (!authorized) return;

    const loadDashboard = async () => {
      await Promise.all([
        fetchResponses(),
        fetchSettings(),
        fetchSeatingAssignments(),
        detectGuestNotesColumn(),
        detectSeatingGuestCountColumn(),
      ]);
    };

    void loadDashboard();

    const channel = supabase
      .channel("studio_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvp_list" }, fetchResponses)
      .on("postgres_changes", { event: "*", schema: "public", table: "seating" }, fetchSeatingAssignments)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, fetchSettings)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized, detectGuestNotesColumn, detectSeatingGuestCountColumn, fetchResponses, fetchSeatingAssignments, fetchSettings]);

  useEffect(() => {
    setSelectedGuestIds((prev) => prev.filter((guestId) => responses.some((guest) => guest.id === guestId)));
  }, [responses]);

  const resetGuestForm = () => {
    setNewName("");
    setNewCode("");
    setNewLimit(1);
    setAttendanceStatus("pending");
    setConfirmedGuests(1);
    setInvitationSent(false);
    setHasChildren(false);
    setChildrenCount(1);
    setGuestNotes("");
    setEditingGuestId(null);
  };

  const resetSeatingForm = () => {
    setSeatingName("");
    setTableNumber(1);
    setSeatingGuestCount(1);
    setEditingSeatingId(null);
  };

  const addGuest = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanedName = newName.trim();
    const cleanedCode = newCode.trim();
    if (!cleanedName || !cleanedCode) return;

    const now = new Date().toISOString();
    const attendingValue = attendanceStatus === "pending" ? null : attendanceStatus === "attending";
    const maxGuests = Math.max(1, newLimit);
    const finalConfirmed =
      attendanceStatus === "pending" ? null : attendanceStatus === "attending" ? Math.max(1, Math.min(confirmedGuests, maxGuests)) : 0;

    const payload = {
      guest_name: cleanedName,
      invite_code: cleanedCode.toUpperCase(),
      max_guests: maxGuests,
      attending: attendingValue,
      confirmed_guests: finalConfirmed,
      invitation_sent: invitationSent,
      has_children: hasChildren,
      children_count: hasChildren ? Math.min(Math.max(1, Number(childrenCount) || 1), maxGuests) : 0,
      ...(isGuestNotesAvailable ? { notes: guestNotes.trim() || null } : {}),
    };

    if (editingGuestId) {
      const existingGuest = responses.find((guest) => guest.id === editingGuestId);
      const respondedAt =
        attendingValue === null
          ? null
          : existingGuest?.attending !== attendingValue || !existingGuest?.responded_at
            ? now
            : existingGuest.responded_at;

      const { error: updateError } = await supabase
        .from("rsvp_list")
        .update({
          ...payload,
          responded_at: respondedAt,
          updated_at: now,
        })
        .eq("id", editingGuestId);

      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }

      showToast("Invitation updated.", "success");
      resetGuestForm();
      return;
    }

    const { error: insertError } = await supabase.from("rsvp_list").insert([
      {
        ...payload,
        created_at: now,
        responded_at: attendingValue === null ? null : now,
      },
    ]);

    if (insertError) {
      showToast(insertError.message, "error");
      return;
    }

    showToast("Invitation added.", "success");
    resetGuestForm();
  };

  const addSeatingAssignment = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanedName = seatingName.trim();
    if (!cleanedName) return;

    const payload = {
      name: cleanedName,
      table_number: Math.max(1, tableNumber),
      ...(isSeatingGuestCountAvailable ? { guest_count: Math.max(1, seatingGuestCount || 1) } : {}),
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

  const startInlineGuestEdit = (guest: GuestResponse) => {
    setInlineTableEdits((prev) => {
      const next = { ...prev };
      delete next[guest.id];
      return next;
    });
    setInlineGuestEdits((prev) => ({
      ...prev,
      [guest.id]: {
        guest_name: guest.guest_name,
        invite_code: guest.invite_code,
        max_guests: guest.max_guests,
        attending: guest.attending,
        confirmed_guests: guest.confirmed_guests,
        invitation_sent: Boolean(guest.invitation_sent),
        has_children: Boolean(guest.has_children),
        children_count: Math.min(Math.max(1, guest.children_count || 1), Math.max(1, guest.max_guests)),
        notes: guest.notes || "",
      },
    }));
  };

  const startInlineTableEdit = (guest: GuestResponse) => {
    cancelInlineGuestEdit(guest.id);
    setInlineTableEdits((prev) => ({ ...prev, [guest.id]: true }));
    setQuickTableDrafts((prev) => ({
      ...prev,
      [guest.id]: prev[guest.id] ?? seatingLookup.get(normalizeNameKey(guest.guest_name)) ?? "",
    }));
  };

  const cancelInlineGuestEdit = (guestId: string) => {
    setInlineGuestEdits((prev) => {
      const next = { ...prev };
      delete next[guestId];
      return next;
    });
  };

  const cancelInlineTableEdit = (guestId: string) => {
    setInlineTableEdits((prev) => {
      const next = { ...prev };
      delete next[guestId];
      return next;
    });
  };

  const saveInlineGuestEdit = async (guestId: string) => {
    const draft = inlineGuestEdits[guestId];
    if (!draft) return;

    const existingGuest = responses.find((guest) => guest.id === guestId);
    const now = new Date().toISOString();
    const maxGuests = Math.max(1, draft.max_guests || 1);
    const confirmed =
      draft.attending === true
        ? Math.min(Math.max(1, draft.confirmed_guests || 1), maxGuests)
        : draft.attending === false
          ? 0
          : null;
    const children = draft.has_children ? Math.min(Math.max(1, draft.children_count || 1), maxGuests) : 0;

    const { error: updateError } = await supabase
      .from("rsvp_list")
      .update({
        guest_name: draft.guest_name.trim(),
        invite_code: draft.invite_code.trim().toUpperCase(),
        max_guests: maxGuests,
        attending: draft.attending,
        confirmed_guests: confirmed,
        invitation_sent: draft.invitation_sent,
        has_children: draft.has_children,
        children_count: children,
        ...(isGuestNotesAvailable ? { notes: draft.notes.trim() || null } : {}),
        responded_at:
          draft.attending === null
            ? null
            : existingGuest?.attending !== draft.attending || !existingGuest?.responded_at
              ? now
              : existingGuest.responded_at,
        updated_at: now,
      })
      .eq("id", guestId);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    cancelInlineGuestEdit(guestId);
    showToast("Invitation updated.", "success");
  };

  const startInlineSeatingEdit = (assignment: SeatingAssignment) => {
    setInlineSeatingEdits((prev) => ({
      ...prev,
      [assignment.id]: {
        name: assignment.name,
        table_number: assignment.table_number,
        guest_count: Math.max(1, assignment.guest_count || 1),
      },
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
        ...(isSeatingGuestCountAvailable ? { guest_count: Math.max(1, draft.guest_count || 1) } : {}),
      })
      .eq("id", assignmentId);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    cancelInlineSeatingEdit(assignmentId);
    showToast("Seating assignment updated.", "success");
  };

  const copyInviteLink = async (guest: GuestResponse) => {
    try {
      await navigator.clipboard.writeText(getGuestInviteUrl(guest));
      showToast("RSVP link copied.", "success");
    } catch (copyError) {
      showToast(copyError instanceof Error ? copyError.message : "Could not copy RSVP link.", "error");
    }
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

  const beginGuestFormEdit = (guest: GuestResponse) => {
    setEditingGuestId(guest.id);
    setNewName(guest.guest_name);
    setNewCode(guest.invite_code);
    setNewLimit(guest.max_guests);
    setAttendanceStatus(guest.attending === null ? "pending" : guest.attending ? "attending" : "declined");
    setConfirmedGuests(guest.confirmed_guests || 0);
    setInvitationSent(Boolean(guest.invitation_sent));
    setHasChildren(Boolean(guest.has_children));
    setChildrenCount(Math.min(Math.max(1, guest.children_count || 1), Math.max(1, guest.max_guests)));
    setGuestNotes(guest.notes || "");
    setActiveView("invitations");
    setInvitationTab("composer");
    scrollToSection(invitationFormRef);
  };

  const confirmRemoveGuest = (guest: GuestResponse) => {
    askConfirm({
      title: "Remove Invitation?",
      message: `${guest.guest_name} will be removed from the invitation list.`,
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
    });
  };

  const beginSeatingFormEdit = (assignment: SeatingAssignment) => {
    setEditingSeatingId(assignment.id);
    setSeatingName(assignment.name);
    setTableNumber(assignment.table_number);
    setSeatingGuestCount(Math.max(1, assignment.guest_count || 1));
    setActiveView("seating");
    setSeatingTab("composer");
    scrollToSection(seatingFormRef);
  };

  const confirmRemoveSeatingAssignment = (assignment: SeatingAssignment) => {
    askConfirm({
      title: "Remove Seating Assignment?",
      message: `${assignment.name} will be removed from table ${assignment.table_number}.`,
      actionLabel: "Remove",
      actionTone: "danger",
      onConfirm: async () => {
        const { error: deleteError } = await supabase.from("seating").delete().eq("id", assignment.id);
        if (deleteError) {
          showToast(deleteError.message, "error");
          return;
        }
        showToast("Seating assignment removed.", "success");
      },
    });
  };

  const updateSetting = async (key: string, nextValue: boolean, successMessage: string) => {
    const { error: updateError } = await supabase.from("settings").update({ value: String(nextValue) }).eq("key", key);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    if (key === "is_seating_chart_enabled") setIsSeatingChartEnabled(nextValue);
    if (key === "is_gallery_enabled") setIsGalleryEnabled(nextValue);
    if (key === "is_gallery_feed_enabled") setIsGalleryFeedEnabled(nextValue);
    if (key === "is_home_venue_enabled") setIsHomeVenueEnabled(nextValue);
    if (key === "is_home_carousel_enabled") setIsHomeCarouselEnabled(nextValue);
    if (key === "is_home_dress_code_enabled") setIsHomeDressCodeEnabled(nextValue);

    showToast(successMessage, "success");
  };

  const seatingLookup = useMemo(() => {
    const map = new Map<string, number>();
    seatingAssignments.forEach((assignment) => {
      const key = normalizeNameKey(assignment.name);
      if (key && !map.has(key)) {
        map.set(key, assignment.table_number);
      }
    });
    return map;
  }, [seatingAssignments]);

  const seatingAssignmentLookup = useMemo(() => {
    const map = new Map<string, SeatingAssignment>();
    seatingAssignments.forEach((assignment) => {
      const key = normalizeNameKey(assignment.name);
      if (key && !map.has(key)) {
        map.set(key, assignment);
      }
    });
    return map;
  }, [seatingAssignments]);

  const acceptedWithoutSeating = useMemo(() => {
    return responses.filter(
      (guest) => guest.attending === true && !seatingLookup.has(normalizeNameKey(guest.guest_name)),
    );
  }, [responses, seatingLookup]);

  const stats = useMemo(() => {
    const sentInvitations = responses.filter((guest) => guest.invitation_sent === true).length;
    const pendingInvitations = responses.filter((guest) => guest.invitation_sent !== true).length;
    const awaitingResponse = responses.filter((guest) => guest.attending === null).length;
    const declinedInvitations = responses.filter((guest) => guest.attending === false).length;
    const acceptedHouseholds = responses.filter((guest) => guest.attending === true).length;
    const acceptedGuests = responses.reduce(
      (sum, guest) => sum + (guest.attending === true ? guest.confirmed_guests || 0 : 0),
      0,
    );
    const totalInvitedGuests = responses.reduce((sum, guest) => sum + (guest.max_guests || 0), 0);
    const respondedHouseholds = responses.filter((guest) => guest.attending !== null).length;
    const householdsWithChildren = responses.filter((guest) => guest.has_children === true).length;
    const trackedChildren = responses.reduce((sum, guest) => sum + (guest.has_children ? guest.children_count || 0 : 0), 0);
    const responseRate = responses.length ? Math.round((respondedHouseholds / responses.length) * 100) : 0;
    const seatFillRate = totalInvitedGuests ? Math.round((acceptedGuests / totalInvitedGuests) * 100) : 0;
    const uniqueTables = new Set(seatingAssignments.map((assignment) => assignment.table_number)).size;
    return {
      totalInvitations: responses.length,
      totalInvitedGuests,
      sentInvitations,
      pendingInvitations,
      awaitingResponse,
      declinedInvitations,
      acceptedHouseholds,
      acceptedGuests,
      householdsWithChildren,
      trackedChildren,
      acceptedWithoutSeating: acceptedWithoutSeating.length,
      responseRate,
      seatFillRate,
      seatingAssignments: seatingAssignments.length,
      uniqueTables,
    };
  }, [acceptedWithoutSeating.length, responses, seatingAssignments]);

  const filteredResponses = useMemo(() => {
    const query = deferredGuestSearch.trim().toLowerCase();

    const byQuery = query
      ? responses.filter((guest) =>
          [guest.guest_name, guest.invite_code].some((value) => value.toLowerCase().includes(query)),
        )
      : responses;

    const byStatus = byQuery.filter((guest) => {
      if (guestStatusFilter === "all") return true;
      if (guestStatusFilter === "pending") return guest.attending === null;
      if (guestStatusFilter === "attending") return guest.attending === true;
      return guest.attending === false;
    });

    const byExtraFilter = byStatus.filter((guest) => {
      if (guestExtraFilter === "all") return true;
      if (guestExtraFilter === "sent") return guest.invitation_sent === true;
      if (guestExtraFilter === "not_sent") return guest.invitation_sent !== true;
      if (guestExtraFilter === "has_children") return guest.has_children === true;
      return guest.attending === true && !seatingLookup.has(normalizeNameKey(guest.guest_name));
    });

    const sorted = [...byExtraFilter];

    if (guestSort === "name") {
      sorted.sort((left, right) => left.guest_name.localeCompare(right.guest_name));
    } else if (guestSort === "invite_code") {
      sorted.sort((left, right) => left.invite_code.localeCompare(right.invite_code));
    } else if (guestSort === "largest_party") {
      sorted.sort((left, right) => right.max_guests - left.max_guests || left.guest_name.localeCompare(right.guest_name));
    } else {
      sorted.sort((left, right) => getLatestGuestTimestamp(right) - getLatestGuestTimestamp(left));
    }

    return sorted;
  }, [deferredGuestSearch, guestExtraFilter, guestSort, guestStatusFilter, responses, seatingLookup]);

  const filteredInvitationStats = useMemo(() => {
    const acceptedGuests = filteredResponses.reduce(
      (sum, guest) => sum + (guest.attending === true ? guest.confirmed_guests || 0 : 0),
      0,
    );
    const invitedGuests = filteredResponses.reduce((sum, guest) => sum + (guest.max_guests || 0), 0);
    const awaiting = filteredResponses.filter((guest) => guest.attending === null).length;
    const needsSeating = filteredResponses.filter(
      (guest) => guest.attending === true && !seatingLookup.has(normalizeNameKey(guest.guest_name)),
    ).length;

    return {
      invitations: filteredResponses.length,
      acceptedGuests,
      invitedGuests,
      awaiting,
      needsSeating,
    };
  }, [filteredResponses, seatingLookup]);

  const filteredSeatingAssignments = useMemo(() => {
    const query = deferredSeatingSearch.trim().toLowerCase();
    const byQuery = query
      ? seatingAssignments.filter(
          (assignment) =>
            assignment.name.toLowerCase().includes(query) || String(assignment.table_number).includes(query),
        )
      : seatingAssignments;

    const byTable =
      seatingTableFilter === "all"
        ? byQuery
        : byQuery.filter((assignment) => assignment.table_number === seatingTableFilter);

    return [...byTable].sort((left, right) =>
      seatingSort === "name"
        ? left.name.localeCompare(right.name)
        : left.table_number - right.table_number || left.name.localeCompare(right.name),
    );
  }, [deferredSeatingSearch, seatingAssignments, seatingSort, seatingTableFilter]);

  const filteredSeatingGuestCount = useMemo(
    () => filteredSeatingAssignments.reduce((sum, assignment) => sum + Math.max(1, assignment.guest_count || 1), 0),
    [filteredSeatingAssignments],
  );

  const filteredTableSeatTotals = useMemo(() => {
    const totals = new Map<number, number>();

    filteredSeatingAssignments.forEach((assignment) => {
      const currentTotal = totals.get(assignment.table_number) || 0;
      totals.set(assignment.table_number, currentTotal + Math.max(1, assignment.guest_count || 1));
    });

    return totals;
  }, [filteredSeatingAssignments]);

  const availableTableNumbers = useMemo(
    () => Array.from(new Set(seatingAssignments.map((assignment) => assignment.table_number))).sort((left, right) => left - right),
    [seatingAssignments],
  );

  useEffect(() => {
    if (availableTableNumbers.length === 0) {
      setTableMoveFrom("");
      setTableMoveTo("");
      return;
    }

    setTableMoveFrom((prev) => {
      if (typeof prev === "number" && availableTableNumbers.includes(prev)) return prev;
      return availableTableNumbers[0];
    });

    setTableMoveTo((prev) => {
      if (typeof prev === "number" && availableTableNumbers.includes(prev)) return prev;
      return availableTableNumbers.length > 1 ? availableTableNumbers[1] : availableTableNumbers[0];
    });
  }, [availableTableNumbers]);

  const recentActivity = useMemo(() => buildRecentActivity(responses), [responses]);

  const selectedVisibleGuestCount = useMemo(
    () => filteredResponses.filter((guest) => selectedGuestIds.includes(guest.id)).length,
    [filteredResponses, selectedGuestIds],
  );

  const selectedGuests = useMemo(
    () => responses.filter((guest) => selectedGuestIds.includes(guest.id)),
    [responses, selectedGuestIds],
  );

  const selectedGuestSeatCount = useMemo(
    () => selectedGuests.reduce((sum, guest) => sum + getSeatingGuestCount(guest), 0),
    [selectedGuests],
  );

  const assignGuestToTable = async (guest: GuestResponse, nextTableNumber: number) => {
    const assignmentPayload = {
      table_number: Math.max(1, nextTableNumber),
      ...(isSeatingGuestCountAvailable ? { guest_count: getSeatingGuestCount(guest) } : {}),
    };
    const existingAssignment = seatingAssignmentLookup.get(normalizeNameKey(guest.guest_name));

    if (existingAssignment) {
      const { error: updateError } = await supabase.from("seating").update(assignmentPayload).eq("id", existingAssignment.id);
      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("seating")
        .insert([{ name: guest.guest_name.trim(), ...assignmentPayload }]);
      if (insertError) {
        showToast(insertError.message, "error");
        return;
      }
    }

    setQuickTableDrafts((prev) => ({ ...prev, [guest.id]: nextTableNumber }));
    cancelInlineTableEdit(guest.id);
    showToast(`${guest.guest_name} assigned to table ${nextTableNumber}.`, "success");
  };

  const removeGuestSeating = async (guest: GuestResponse) => {
    const existingAssignment = seatingAssignmentLookup.get(normalizeNameKey(guest.guest_name));
    if (!existingAssignment) {
      showToast(`${guest.guest_name} does not have a seating assignment yet.`, "info");
      return;
    }

    const { error: deleteError } = await supabase.from("seating").delete().eq("id", existingAssignment.id);
    if (deleteError) {
      showToast(deleteError.message, "error");
      return;
    }

    setQuickTableDrafts((prev) => ({ ...prev, [guest.id]: "" }));
    cancelInlineTableEdit(guest.id);
    showToast(`Removed seating for ${guest.guest_name}.`, "success");
  };

  const toggleGuestSelection = (guestId: string) => {
    setSelectedGuestIds((prev) => (prev.includes(guestId) ? prev.filter((id) => id !== guestId) : [...prev, guestId]));
  };

  const toggleSelectAllVisibleGuests = () => {
    const visibleIds = filteredResponses.map((guest) => guest.id);
    if (visibleIds.length === 0) return;

    setSelectedGuestIds((prev) => {
      const allVisibleSelected = visibleIds.every((id) => prev.includes(id));
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const bulkMarkSelectedAsSent = async () => {
    if (selectedGuestIds.length === 0) return;

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("rsvp_list")
      .update({ invitation_sent: true, updated_at: now })
      .in("id", selectedGuestIds);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    showToast(`${selectedGuestIds.length} invitation${selectedGuestIds.length === 1 ? "" : "s"} marked sent.`, "success");
    setSelectedGuestIds([]);
  };

  const bulkAssignSelectedToTable = async () => {
    if (selectedGuests.length === 0) return;

    const nextTableNumber = Math.max(1, Number(bulkTableNumber) || 1);
    const existingAssignmentsByName = new Map(
      seatingAssignments.map((assignment) => [normalizeNameKey(assignment.name), assignment]),
    );

    for (const guest of selectedGuests) {
      const existingAssignment = existingAssignmentsByName.get(normalizeNameKey(guest.guest_name));

      if (existingAssignment) {
        const { error: updateError } = await supabase
          .from("seating")
          .update({
            table_number: nextTableNumber,
            ...(isSeatingGuestCountAvailable ? { guest_count: getSeatingGuestCount(guest) } : {}),
          })
          .eq("id", existingAssignment.id);

        if (updateError) {
          showToast(updateError.message, "error");
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from("seating")
          .insert([
            {
              name: guest.guest_name.trim(),
              table_number: nextTableNumber,
              ...(isSeatingGuestCountAvailable ? { guest_count: getSeatingGuestCount(guest) } : {}),
            },
          ]);

        if (insertError) {
          showToast(insertError.message, "error");
          return;
        }
      }
    }

    showToast(
      `${selectedGuests.length} guest${selectedGuests.length === 1 ? "" : "s"} (${selectedGuestSeatCount} seat${selectedGuestSeatCount === 1 ? "" : "s"}) assigned to table ${nextTableNumber}.`,
      "success",
    );
    setSelectedGuestIds([]);
  };

  const bulkRemoveSelectedSeating = async () => {
    if (selectedGuests.length === 0) return;

    const assignmentsToRemove = seatingAssignments.filter((assignment) =>
      selectedGuests.some((guest) => normalizeNameKey(guest.guest_name) === normalizeNameKey(assignment.name)),
    );

    if (assignmentsToRemove.length === 0) {
      showToast("None of the selected guests currently have a seating assignment.", "info");
      return;
    }

    const { error: deleteError } = await supabase
      .from("seating")
      .delete()
      .in(
        "id",
        assignmentsToRemove.map((assignment) => assignment.id),
      );

    if (deleteError) {
      showToast(deleteError.message, "error");
      return;
    }

    showToast(
      `Removed seating for ${assignmentsToRemove.length} selected guest${assignmentsToRemove.length === 1 ? "" : "s"}.`,
      "success",
    );
    setSelectedGuestIds([]);
  };

  const exportInvitationCsv = () => {
    const headers = [
      "guest_name",
      "invite_code",
      "max_guests",
      "confirmed_guests",
      "attending",
      "invitation_sent",
      "has_children",
      "children_count",
      "responded_at",
      "updated_at",
      "created_at",
      "table_number",
      "table_guest_count",
      "notes",
      "rsvp_url",
    ];

    const escapeCsv = (value: string | number | boolean | null | undefined) => {
      const stringValue = value === null || value === undefined ? "" : String(value);
      if (stringValue.includes(",") || stringValue.includes("\"") || stringValue.includes("\n")) {
        return `"${stringValue.replace(/"/g, "\"\"")}"`;
      }
      return stringValue;
    };

    const rows = filteredResponses.map((guest) => {
      const matchingAssignment = seatingAssignments.find(
        (assignment) => normalizeNameKey(assignment.name) === normalizeNameKey(guest.guest_name),
      );
      const tableNumber = matchingAssignment?.table_number ?? "";
      return [
        guest.guest_name,
        guest.invite_code,
        guest.max_guests,
        guest.confirmed_guests ?? "",
        guest.attending === null ? "pending" : guest.attending ? "attending" : "declined",
        Boolean(guest.invitation_sent),
        Boolean(guest.has_children),
        guest.children_count ?? "",
        guest.responded_at ?? "",
        guest.updated_at ?? "",
        guest.created_at ?? "",
        tableNumber,
        matchingAssignment?.guest_count ?? "",
        isGuestNotesAvailable ? guest.notes ?? "" : "",
        getGuestInviteUrl(guest),
      ]
        .map(escapeCsv)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "omar-hager-admin-invitations.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast("CSV export downloaded.", "success");
  };

  const quickJumpToNeedsSeating = () => {
    setActiveView("invitations");
    setInvitationTab("manage");
    setGuestStatusFilter("attending");
    setGuestExtraFilter("needs_seating");
  };

  const quickJumpToPendingInvites = () => {
    setActiveView("invitations");
    setInvitationTab("manage");
    setGuestStatusFilter("all");
    setGuestExtraFilter("not_sent");
  };

  const moveEntireTable = async () => {
    if (tableMoveFrom === "" || tableMoveTo === "") return;

    const sourceTable = Number(tableMoveFrom);
    const targetTable = Number(tableMoveTo);

    if (sourceTable === targetTable) {
      showToast("Choose a different destination table.", "info");
      return;
    }

    const assignmentsToMove = seatingAssignments.filter((assignment) => assignment.table_number === sourceTable);
    if (assignmentsToMove.length === 0) {
      showToast(`Table ${sourceTable} has no assignments to move.`, "info");
      return;
    }

    const seatTotal = assignmentsToMove.reduce((sum, assignment) => sum + Math.max(1, assignment.guest_count || 1), 0);

    askConfirm({
      title: `Move Table ${sourceTable} To Table ${targetTable}?`,
      message: `This will move ${assignmentsToMove.length} seating assignment${assignmentsToMove.length === 1 ? "" : "s"} covering ${seatTotal} seat${seatTotal === 1 ? "" : "s"} to table ${targetTable}.`,
      actionLabel: "Move Table",
      onConfirm: async () => {
        const { error: updateError } = await supabase
          .from("seating")
          .update({ table_number: targetTable })
          .eq("table_number", sourceTable);

        if (updateError) {
          showToast(updateError.message, "error");
          return;
        }

        setSeatingTableFilter(targetTable);
        setSeatingTab("board");
        showToast(
          `Moved ${assignmentsToMove.length} seating assignment${assignmentsToMove.length === 1 ? "" : "s"} from table ${sourceTable} to table ${targetTable}.`,
          "success",
        );
      },
    });
  };

  if (isCheckingSession) {
    return (
      <div className="wedding-shell flex items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.72),_transparent_50%)]" />
        <div className="relative z-10 w-full max-w-sm rounded-[34px] border border-white/70 bg-white/88 px-8 py-10 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto mb-6 h-16 w-16 animate-pulse rounded-full bg-stone-100" />
          <p className="wedding-kicker">Checking Access</p>
        </div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="wedding-shell flex items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.78),_transparent_50%)]" />
        <form
          onSubmit={handleLogin}
          className="relative z-10 w-full max-w-xl overflow-hidden rounded-[40px] border border-white/75 bg-white/88 px-8 py-10 text-center shadow-2xl backdrop-blur md:px-12 md:py-14"
        >
          <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(255,255,255,0))]" />
          <div className="relative">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full border border-stone-100 bg-white/90 p-4 shadow-lg">
                <Image src="/logo.png" alt="Omar & Hager logo" width={88} height={88} className="wedding-logo w-20" />
              </div>
            </div>
            <p className="wedding-kicker mb-3">Private Access</p>
            <h1 className="wedding-state-title mb-4">Admin Studio</h1>
            <div className="mx-auto mb-8 h-px w-20 bg-stone-200" />
            <p className="mx-auto mb-8 max-w-xl text-base leading-relaxed text-stone-500">
              Manage invitations, RSVPs, seating operations, and live wedding settings from one place.
            </p>

            <input
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              className="wedding-input text-center"
              placeholder="Enter password"
            />

            {error && <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-rose-600">{error}</p>}

            <button className="wedding-button-primary mt-8 w-full disabled:cursor-not-allowed disabled:opacity-50" disabled={isAuthenticating}>
              {isAuthenticating ? "Checking..." : "Enter Studio"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,_#d0e0f0_0%,_#d8e6f4_30%,_#eaf0f7_100%)] text-stone-900">
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 md:py-6">
        <header className="mb-5 rounded-[34px] border border-white/70 bg-white/88 p-5 shadow-[0_16px_40px_rgba(28,25,23,0.06)] md:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative rounded-[28px] border border-white/90 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(246,248,251,0.94))] p-2 shadow-[0_14px_28px_rgba(28,25,23,0.08)]">
                <div className="absolute inset-x-3 top-0 h-8 rounded-full bg-[radial-gradient(circle,_rgba(255,255,255,0.85),_rgba(255,255,255,0))]" />
                <div className="relative flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-[22px] border border-stone-100 bg-white shadow-inner md:h-20 md:w-20">
                  <Image
                    src="/logo.png"
                    alt="Omar & Hager logo"
                    width={72}
                    height={72}
                    className="wedding-logo w-12 md:w-16"
                  />
                </div>
              </div>
              <div>
                <p className="wedding-kicker mb-2">Omar & Hager 2026</p>
                <h1 className="font-serif text-4xl tracking-tight text-stone-900 md:text-5xl">Admin Studio</h1>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-500 md:text-base">
                  Manage invitations, seating, RSVPs, and live wedding controls from one polished workspace.
                </p>
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:w-[520px]">
              <HeroMetric label="Sent" value={stats.sentInvitations} tone="sky" />
              <HeroMetric label="Accepted Seats" value={stats.acceptedGuests} tone="emerald" />
              <HeroMetric label="Awaiting RSVP" value={stats.awaitingResponse} tone="stone" />
              <HeroMetric label="Needs Seating" value={stats.acceptedWithoutSeating} tone="amber" />
            </div>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-5 xl:self-start">
            <StudioPanel>
              <p className="wedding-kicker mb-3">Studio Navigation</p>
              <div className="space-y-2">
                <RailButton active={activeView === "overview"} label="Overview" onClick={() => setActiveView("overview")} />
                <RailButton active={activeView === "invitations"} label="Invitations" onClick={() => setActiveView("invitations")} />
                <RailButton active={activeView === "seating"} label="Seating" onClick={() => setActiveView("seating")} />
                <RailButton active={activeView === "settings"} label="Settings" onClick={() => setActiveView("settings")} />
              </div>
            </StudioPanel>

            <StudioPanel>
              <p className="wedding-kicker mb-3">Studio Shortcuts</p>
              <div className="space-y-3">
                <CompactShortcut label="Need To Send" value={stats.pendingInvitations} onClick={quickJumpToPendingInvites} />
                <CompactShortcut label="Need Seating" value={stats.acceptedWithoutSeating} onClick={quickJumpToNeedsSeating} />
                <div className="grid gap-2">
                <button
                  type="button"
                  onClick={exportInvitationCsv}
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-3 text-[9px] font-bold uppercase tracking-[0.16em] text-stone-700 shadow-sm ring-1 ring-stone-200 transition hover:text-stone-900 hover:ring-stone-300"
                >
                  Export Current CSV
                </button>
                <Link
                  href="/admin"
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-3 text-[9px] font-bold uppercase tracking-[0.16em] text-stone-700 shadow-sm ring-1 ring-stone-200 transition hover:text-stone-900 hover:ring-stone-300"
                >
                  Open Classic Admin
                </Link>
                <Link
                  href="/"
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-4 py-3 text-[9px] font-bold uppercase tracking-[0.16em] text-stone-700 shadow-sm ring-1 ring-stone-200 transition hover:text-stone-900 hover:ring-stone-300"
                >
                  Back to Home
                </Link>
                </div>
              </div>
            </StudioPanel>
          </aside>

          <main className="min-w-0 space-y-5">
            {activeView === "overview" && (
              <div className="space-y-5">
                <WorkspaceTabs
                  tabs={[
                    { key: "pulse", label: "Pulse" },
                    { key: "flow", label: "Flow" },
                    { key: "watchlist", label: "Watchlist" },
                  ]}
                  activeTab={overviewTab}
                  onChange={(nextTab) => setOverviewTab(nextTab as OverviewWorkspaceTab)}
                />

                {overviewTab === "pulse" && (
                  <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
                    <StudioPanel>
                      <SectionHeading
                        kicker="Overview"
                        title="Wedding Metrics"
                        description="A compact snapshot of invitation rollout, RSVP movement, and venue-facing guest count progress."
                      />
                      <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                        <StatTile label="Invitations Sent" value={stats.sentInvitations} tone="sky" />
                        <StatTile label="Pending Invitations" value={stats.pendingInvitations} tone="stone" />
                        <StatTile label="Accepted Guests" value={stats.acceptedGuests} tone="emerald" />
                        <StatTile label="Declined Invitations" value={stats.declinedInvitations} tone="rose" />
                        <StatTile label="Awaiting Guest Response" value={stats.awaitingResponse} tone="stone" />
                        <StatTile label="Total Invitations" value={stats.totalInvitations} tone="stone" />
                        <StatTile label="Total Invited Guests" value={stats.totalInvitedGuests} tone="stone" />
                        <StatTile label="Accepted Without Seating" value={stats.acceptedWithoutSeating} tone="amber" />
                      </div>
                    </StudioPanel>

                    <StudioPanel>
                      <SectionHeading
                        kicker="Progress"
                        title="Tracking Bars"
                        description="Quick visual progress for sending, replies, and confirmed seat fill."
                      />
                      <div className="mt-5 space-y-4">
                        <ProgressLine label="Invitation Rollout" value={stats.sentInvitations} total={stats.totalInvitations} tone="sky" />
                        <ProgressLine
                          label="RSVP Responses"
                          value={stats.totalInvitations - stats.awaitingResponse}
                          total={stats.totalInvitations}
                          tone="stone"
                        />
                        <ProgressLine label="Accepted Seats" value={stats.acceptedGuests} total={stats.totalInvitedGuests} tone="emerald" />
                        <ProgressLine label="Assigned Tables" value={stats.seatingAssignments} total={Math.max(stats.acceptedHouseholds, 1)} tone="amber" />
                      </div>
                    </StudioPanel>
                  </div>
                )}

                {overviewTab === "flow" && (
                  <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                    <StudioPanel>
                      <SectionHeading
                        kicker="Action Queue"
                        title="What Needs Attention"
                        description="The highest-signal actions so you can keep guest ops moving without digging through rows."
                      />
                      <div className="mt-5 space-y-3">
                        <AttentionItem
                          label="Pending Invitations"
                          value={stats.pendingInvitations}
                          description="Invite codes created but not sent yet."
                          tone="sky"
                          onClick={quickJumpToPendingInvites}
                        />
                        <AttentionItem
                          label="Awaiting Responses"
                          value={stats.awaitingResponse}
                          description="Guests who still have not replied."
                          tone="stone"
                          onClick={() => {
                            setActiveView("invitations");
                            setInvitationTab("manage");
                            setGuestStatusFilter("pending");
                            setGuestExtraFilter("all");
                          }}
                        />
                        <AttentionItem
                          label="Accepted Without Seating"
                          value={stats.acceptedWithoutSeating}
                          description="Guests who accepted but have no table yet."
                          tone="amber"
                          onClick={quickJumpToNeedsSeating}
                        />
                      </div>
                    </StudioPanel>

                    <StudioPanel>
                      <SectionHeading
                        kicker="Recent Activity"
                        title="Latest Guest Actions"
                        description="A rolling feed of the most recent guest or admin-side changes."
                      />
                      <div className="mt-5 space-y-3">
                        {recentActivity.length === 0 ? (
                          <EmptyState title="No activity yet" description="Guest actions will begin showing here as soon as invitations start moving." />
                        ) : (
                          recentActivity.map((item) => (
                            <ActivityRow key={item.id} title={item.title} detail={item.detail} timestamp={item.timestamp} />
                          ))
                        )}
                      </div>
                    </StudioPanel>
                  </div>
                )}

                {overviewTab === "watchlist" && (
                  <StudioPanel>
                    <SectionHeading
                      kicker="Seating Watchlist"
                      title="Accepted Guests Missing Tables"
                      description="This cross-check uses exact name matching between accepted invitation records and seating assignments."
                    />
                    <div className="mt-5 grid gap-3 lg:grid-cols-2">
                      {acceptedWithoutSeating.length === 0 ? (
                        <EmptyState
                          title="Everyone accepted has seating"
                          description="Your accepted guest list currently matches your seating assignments."
                        />
                      ) : (
                        acceptedWithoutSeating.map((guest) => (
                          <WatchlistCard
                            key={guest.id}
                            title={guest.guest_name}
                            subtitle={`Accepted ${guest.confirmed_guests || 0} seat${guest.confirmed_guests === 1 ? "" : "s"} · ${guest.invite_code}`}
                            actionLabel="Open Seating"
                            onAction={() => {
                              setActiveView("seating");
                              setSeatingTab("board");
                              setSeatingSearch(guest.guest_name);
                            }}
                          />
                        ))
                      )}
                    </div>
                  </StudioPanel>
                )}
              </div>
            )}

            {activeView === "invitations" && (
              <div className="space-y-5">
                <WorkspaceTabs
                  tabs={[
                    { key: "manage", label: "Manage Invitations" },
                    { key: "composer", label: editingGuestId ? "Edit Invitation" : "Create Invitation" },
                  ]}
                  activeTab={invitationTab}
                  onChange={(nextTab) => setInvitationTab(nextTab as InvitationWorkspaceTab)}
                />

                {invitationTab === "manage" && (
                  <div className="space-y-5 pb-32 md:pb-0">
                  <StudioPanel>
                    <SectionHeading
                      kicker="Directory"
                      title="Invitation Console"
                      description="Search, filter, bulk-select, and manage households without falling into a cramped table."
                    />

                    <div className="mt-5 space-y-4">
                      <input
                        value={guestSearch}
                        onChange={(event) => setGuestSearch(event.target.value)}
                        className="wedding-input"
                        placeholder="Search by guest name or invite code"
                      />

                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {([
                            { key: "all", label: "All" },
                            { key: "pending", label: "Pending" },
                            { key: "attending", label: "Attending" },
                            { key: "declined", label: "Declined" },
                          ] as { key: GuestStatusFilter; label: string }[]).map((item) => (
                            <Pill
                              key={item.key}
                              active={guestStatusFilter === item.key}
                              onClick={() => setGuestStatusFilter(item.key)}
                              label={item.label}
                            />
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {([
                            { key: "all", label: "Any" },
                            { key: "sent", label: "Sent" },
                            { key: "not_sent", label: "Not Sent" },
                            { key: "has_children", label: "Has Children" },
                            { key: "needs_seating", label: "Needs Seating" },
                          ] as { key: GuestExtraFilter; label: string }[]).map((item) => (
                            <Pill
                              key={item.key}
                              active={guestExtraFilter === item.key}
                              onClick={() => setGuestExtraFilter(item.key)}
                              label={item.label}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="grid gap-3 rounded-[28px] border border-stone-100 bg-stone-50 p-4 sm:grid-cols-5">
                          <MiniMetric label="Invitations" value={filteredInvitationStats.invitations} />
                          <MiniMetric label="Invited Seats" value={filteredInvitationStats.invitedGuests} />
                          <MiniMetric label="Accepted Seats" value={filteredInvitationStats.acceptedGuests} />
                          <MiniMetric label="Awaiting" value={filteredInvitationStats.awaiting} />
                          <MiniMetric label="Needs Seating" value={filteredInvitationStats.needsSeating} />
                        </div>

                        <select value={guestSort} onChange={(event) => setGuestSort(event.target.value as GuestSort)} className="wedding-select">
                          <option value="recent">Sort: Recent Activity</option>
                          <option value="name">Sort: Guest Name</option>
                          <option value="invite_code">Sort: Invite Code</option>
                          <option value="largest_party">Sort: Largest Party</option>
                        </select>
                      </div>

                      <div className="rounded-[28px] border border-stone-100 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={toggleSelectAllVisibleGuests} className="wedding-button-secondary">
                              {filteredResponses.length > 0 && selectedVisibleGuestCount === filteredResponses.length ? "Clear Visible" : "Select Visible"}
                            </button>
                            {selectedGuestIds.length > 0 && (
                              <button type="button" onClick={() => setSelectedGuestIds([])} className="wedding-button-secondary">
                                Clear Selection
                              </button>
                            )}
                            <span className="text-sm text-stone-500">
                              {selectedGuestIds.length} selected
                              {selectedVisibleGuestCount > 0 ? ` · ${selectedVisibleGuestCount} visible` : ""}
                              {selectedGuestIds.length > 0 ? ` · ${selectedGuestSeatCount} seat${selectedGuestSeatCount === 1 ? "" : "s"}` : ""}
                            </span>
                          </div>

                          <div className="flex w-full flex-col gap-3 xl:w-auto xl:items-end">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">Table</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={bulkTableNumber}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    if (nextValue === "") {
                                      setBulkTableNumber("");
                                      return;
                                    }
                                    setBulkTableNumber(Math.max(1, parseInt(nextValue, 10) || 1));
                                  }}
                                  onBlur={() => {
                                    if (bulkTableNumber === "") setBulkTableNumber(1);
                                  }}
                                  className="w-16 border-0 bg-transparent p-0 text-center text-sm font-semibold text-stone-800 outline-none"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => void bulkAssignSelectedToTable()}
                                disabled={selectedGuestIds.length === 0}
                                className="wedding-button-secondary max-w-full disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Assign Selected To Table
                              </button>
                              <button
                                type="button"
                                onClick={() => void bulkRemoveSelectedSeating()}
                                disabled={selectedGuestIds.length === 0}
                                className="wedding-button-secondary max-w-full disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Remove Selected Seating
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void bulkMarkSelectedAsSent()}
                                disabled={selectedGuestIds.length === 0}
                                className="wedding-button-primary max-w-full disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Mark Selected Sent
                              </button>
                              <button type="button" onClick={exportInvitationCsv} className="wedding-button-secondary max-w-full">
                                Export CSV
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </StudioPanel>

                  <div className="space-y-4">
                    {filteredResponses.length === 0 ? (
                      <StudioPanel>
                        <EmptyState title="No guests match this view" description="Try a different filter or search term." />
                      </StudioPanel>
                    ) : (
                      filteredResponses.map((guest) => {
                        const draft = inlineGuestEdits[guest.id];
                        const isEditing = Boolean(draft);
                        const isTableEditing = Boolean(inlineTableEdits[guest.id]);
                        const acceptedCount = guest.attending === true ? guest.confirmed_guests || 0 : 0;
                        const guestInviteUrl = getGuestInviteUrl(guest);
                        const seatingTable = seatingLookup.get(normalizeNameKey(guest.guest_name));
                        const quickTableValue = quickTableDrafts[guest.id] ?? (seatingTable || "");
                        const guestMenuItems: RowMenuItem[] = [
                          { label: "Open RSVP Page", href: guestInviteUrl },
                          { label: "Copy RSVP Link", onSelect: () => void copyInviteLink(guest) },
                          { label: "Copy Invitation", onSelect: () => void copyInvitation(guest) },
                          { label: "Open Composer", onSelect: () => beginGuestFormEdit(guest) },
                          {
                            label: seatingTable ? "Quick Edit Table Assignment" : "Assign Table in Quick Edit",
                            onSelect: () => startInlineTableEdit(guest),
                          },
                          ...(seatingTable
                            ? [{ label: "Remove Seating", onSelect: () => void removeGuestSeating(guest), tone: "danger" as const }]
                            : []),
                          { label: "Remove", onSelect: () => confirmRemoveGuest(guest), tone: "danger" },
                        ];

                        return (
                          <InvitationCard
                            key={guest.id}
                            title={guest.guest_name}
                            subtitle={guest.invite_code}
                            badges={
                              <>
                                <InvitationSentBadge sent={Boolean(guest.invitation_sent)} />
                                <StatusBadge attending={guest.attending} />
                                {Boolean(guest.has_children) && <ChildrenCountBadge count={guest.children_count || 0} />}
                              </>
                            }
                            actions={
                              <>
                                {!isEditing && (
                                  <>
                                    <button type="button" onClick={() => startInlineGuestEdit(guest)} className="wedding-button-secondary">
                                      Quick Edit
                                    </button>
                                    <a href={guestInviteUrl} target="_blank" rel="noreferrer" className="wedding-button-secondary">
                                      Open RSVP
                                    </a>
                                  </>
                                )}
                                <RowMenu label={`Actions for ${guest.guest_name}`} items={guestMenuItems} />
                              </>
                            }
                            selected={selectedGuestIds.includes(guest.id)}
                            onToggleSelected={() => toggleGuestSelection(guest.id)}
                          >
                            <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
                              <div className="rounded-[20px] border border-stone-100 bg-stone-50 p-3.5">
                                <p className="wedding-kicker mb-2">Guest Count</p>
                                <p className="font-serif text-2xl text-stone-900 md:text-3xl">
                                  <span className="text-stone-300">{guest.max_guests}</span>
                                  <span className="mx-2 text-stone-200">/</span>
                                  {acceptedCount}
                                </p>
                                <p className="mt-2 text-sm text-stone-500">Invited / accepted seats</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {seatingTable ? (
                                    <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                                      Table {seatingTable}
                                    </span>
                                  ) : guest.attending === true ? (
                                    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">
                                      Needs Seating
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
                                      Seating Later
                                    </span>
                                  )}
                                </div>
                              </div>

                              {isEditing ? (
                                <div className="space-y-3">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <input
                                      value={draft.guest_name}
                                      onChange={(event) =>
                                        setInlineGuestEdits((prev) => ({
                                          ...prev,
                                          [guest.id]: { ...prev[guest.id], guest_name: event.target.value },
                                        }))
                                      }
                                      className="wedding-inline-edit-input"
                                      placeholder="Guest name"
                                    />
                                    <input
                                      value={draft.invite_code}
                                      onChange={(event) =>
                                        setInlineGuestEdits((prev) => ({
                                          ...prev,
                                          [guest.id]: { ...prev[guest.id], invite_code: event.target.value.toUpperCase() },
                                        }))
                                      }
                                      className="wedding-inline-edit-input uppercase"
                                      placeholder="Invite code"
                                    />
                                  </div>

                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <input
                                      type="number"
                                      min={1}
                                      value={draft.max_guests}
                                      onChange={(event) =>
                                        setInlineGuestEdits((prev) => {
                                          const nextLimit = Math.max(1, parseInt(event.target.value, 10) || 1);
                                          return {
                                            ...prev,
                                            [guest.id]: {
                                              ...prev[guest.id],
                                              max_guests: nextLimit,
                                              children_count: Math.min(prev[guest.id].children_count, nextLimit),
                                            },
                                          };
                                        })
                                      }
                                      className="wedding-inline-edit-input"
                                      placeholder="Guest limit"
                                    />
                                    <select
                                      value={draft.attending === null ? "pending" : draft.attending ? "attending" : "declined"}
                                      onChange={(event) => {
                                        const nextStatus = event.target.value;
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
                                      className="wedding-inline-edit-select"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="attending">Attending</option>
                                      <option value="declined">Declined</option>
                                    </select>
                                    <input
                                      type="number"
                                      min={draft.attending === true ? 1 : 0}
                                      max={Math.max(1, draft.max_guests)}
                                      disabled={draft.attending !== true}
                                      value={draft.attending === true ? draft.confirmed_guests || 1 : 0}
                                      onChange={(event) =>
                                        setInlineGuestEdits((prev) => ({
                                          ...prev,
                                          [guest.id]: {
                                            ...prev[guest.id],
                                            confirmed_guests: parseInt(event.target.value, 10) || 0,
                                          },
                                        }))
                                      }
                                      className={`wedding-inline-edit-input ${draft.attending !== true ? "opacity-50" : ""}`}
                                      placeholder="Confirmed"
                                    />
                                    {draft.has_children ? (
                                      <input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, draft.max_guests)}
                                        value={draft.children_count}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: {
                                              ...prev[guest.id],
                                              children_count: Math.min(
                                                Math.max(1, parseInt(event.target.value, 10) || 1),
                                                Math.max(1, prev[guest.id].max_guests),
                                              ),
                                            },
                                          }))
                                        }
                                        className="wedding-inline-edit-input"
                                        placeholder="Children"
                                      />
                                    ) : (
                                      <div className="hidden xl:block" />
                                    )}
                                  </div>

                                  <div className="flex flex-wrap gap-3">
                                    <label className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600">
                                      <input
                                        type="checkbox"
                                        checked={draft.invitation_sent}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: { ...prev[guest.id], invitation_sent: event.target.checked },
                                          }))
                                        }
                                        className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
                                      />
                                      Invitation Sent
                                    </label>

                                    <label className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600">
                                      <input
                                        type="checkbox"
                                        checked={draft.has_children}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: {
                                              ...prev[guest.id],
                                              has_children: event.target.checked,
                                              children_count: event.target.checked
                                                ? Math.min(
                                                    Math.max(1, prev[guest.id].children_count || 1),
                                                    Math.max(1, prev[guest.id].max_guests),
                                                  )
                                                : 1,
                                            },
                                          }))
                                        }
                                        className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
                                      />
                                      Has Children
                                    </label>
                                  </div>

                                  {(draft.attending === true || seatingTable) && (
                                    <div className="rounded-[20px] border border-stone-100 bg-stone-50 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="wedding-kicker">Table Assignment</p>
                                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                                          {seatingTable ? `Currently Table ${seatingTable}` : "No table yet"}
                                        </p>
                                      </div>
                                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                        <input
                                          type="number"
                                          min={1}
                                          value={quickTableValue}
                                          onChange={(event) =>
                                            setQuickTableDrafts((prev) => ({
                                              ...prev,
                                              [guest.id]:
                                                event.target.value === "" ? "" : Math.max(1, parseInt(event.target.value, 10) || 1),
                                            }))
                                          }
                                          className="wedding-inline-edit-input"
                                          placeholder="Table #"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void assignGuestToTable(guest, Math.max(1, Number(quickTableValue) || 1))}
                                          className="wedding-button-secondary w-full sm:w-auto"
                                        >
                                          {seatingTable ? "Move Seating" : "Assign Seating"}
                                        </button>
                                        {seatingTable && (
                                          <button
                                            type="button"
                                            onClick={() => void removeGuestSeating(guest)}
                                            className="wedding-button-secondary w-full sm:w-auto"
                                          >
                                            Remove
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {isGuestNotesAvailable && (
                                    <textarea
                                      value={draft.notes}
                                      onChange={(event) =>
                                        setInlineGuestEdits((prev) => ({
                                          ...prev,
                                          [guest.id]: {
                                            ...prev[guest.id],
                                            notes: event.target.value,
                                          },
                                        }))
                                      }
                                      className="wedding-inline-edit-input min-h-[110px] resize-y"
                                      placeholder="Private notes"
                                    />
                                  )}

                                  <div className="flex flex-col gap-3 sm:flex-row">
                                    <button type="button" onClick={() => void saveInlineGuestEdit(guest.id)} className="wedding-button-primary">
                                      Save Quick Edit
                                    </button>
                                    <button type="button" onClick={() => cancelInlineGuestEdit(guest.id)} className="wedding-button-secondary">
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : isTableEditing ? (
                                <div className="rounded-[20px] border border-stone-100 bg-stone-50 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="wedding-kicker">Table Assignment</p>
                                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                                      {seatingTable ? `Currently Table ${seatingTable}` : "No table yet"}
                                    </p>
                                  </div>
                                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                    <input
                                      type="number"
                                      min={1}
                                      value={quickTableValue}
                                      onChange={(event) =>
                                        setQuickTableDrafts((prev) => ({
                                          ...prev,
                                          [guest.id]:
                                            event.target.value === "" ? "" : Math.max(1, parseInt(event.target.value, 10) || 1),
                                        }))
                                      }
                                      className="wedding-inline-edit-input"
                                      placeholder="Table #"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void assignGuestToTable(guest, Math.max(1, Number(quickTableValue) || 1))}
                                      className="wedding-button-secondary w-full sm:w-auto"
                                    >
                                      {seatingTable ? "Move Seating" : "Assign Seating"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => cancelInlineTableEdit(guest.id)}
                                      className="wedding-button-secondary w-full sm:w-auto"
                                    >
                                      Cancel
                                    </button>
                                    {seatingTable && (
                                      <button
                                        type="button"
                                        onClick={() => void removeGuestSeating(guest)}
                                        className="wedding-button-secondary w-full sm:w-auto"
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <InfoPanel label="Last Action" value={getGuestActionIndicators(guest)[0] ?? "No activity yet"} />
                                  <InfoPanel label="Direct RSVP Link" value={guestInviteUrl.replace(/^https?:\/\//, "")} mono />
                                  <div className="hidden sm:col-span-2 md:block">
                                    <InfoPanel
                                      label="Activity Summary"
                                      value={getGuestActionIndicators(guest).join(" • ")}
                                    />
                                  </div>
                                  {isGuestNotesAvailable && guest.notes && (
                                    <div className="sm:col-span-2">
                                      <InfoPanel label="Private Notes" value={guest.notes} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </InvitationCard>
                        );
                      })
                    )}
                  </div>
                </div>
                )}

                {invitationTab === "composer" && (
                  <StudioPanel refProp={invitationFormRef}>
                    <SectionHeading
                      kicker="Composer"
                      title={editingGuestId ? "Edit Invitation" : "Create Invitation"}
                      description="A dedicated compose panel so you can update guest records without the whole page feeling like one long form."
                    />

                    <form onSubmit={addGuest} className="mt-5 space-y-4">
                      <FormField label="Guest Name">
                        <input
                          value={newName}
                          onChange={(event) => setNewName(event.target.value)}
                          required
                          className="wedding-inline-edit-input"
                          placeholder="Household or primary guest"
                        />
                      </FormField>

                      <div className="grid gap-4 md:grid-cols-[1fr_140px]">
                        <FormField label="Invite Code">
                          <input
                            value={newCode}
                            onChange={(event) => setNewCode(event.target.value)}
                            required
                            className="wedding-inline-edit-input uppercase"
                            placeholder="OMARHAGER"
                          />
                        </FormField>
                        <FormField label="Guest Limit">
                          <input
                            type="number"
                            min={1}
                            value={newLimit}
                            onChange={(event) => {
                              const nextLimit = Math.max(1, parseInt(event.target.value, 10) || 1);
                              setNewLimit(nextLimit);
                              setChildrenCount((prev) => (prev === "" ? prev : Math.min(prev, nextLimit)));
                            }}
                            className="wedding-inline-edit-input"
                          />
                        </FormField>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField label="RSVP Status">
                          <select
                            value={attendanceStatus}
                            onChange={(event) => setAttendanceStatus(event.target.value as "pending" | "attending" | "declined")}
                            className="wedding-inline-edit-select"
                          >
                            <option value="pending">Pending</option>
                            <option value="attending">Attending</option>
                            <option value="declined">Declined</option>
                          </select>
                        </FormField>
                        <FormField label="Confirmed Guests">
                          <input
                            type="number"
                            min={attendanceStatus === "attending" ? 1 : 0}
                            max={newLimit}
                            value={attendanceStatus === "pending" ? "" : confirmedGuests}
                            onChange={(event) => setConfirmedGuests(parseInt(event.target.value, 10) || 0)}
                            disabled={attendanceStatus === "pending"}
                            className={`wedding-inline-edit-input ${attendanceStatus === "pending" ? "opacity-50" : ""}`}
                            placeholder={attendanceStatus === "pending" ? "Pending RSVP" : "Guest count"}
                          />
                        </FormField>
                      </div>

                      <div className="space-y-3">
                        <ToggleBox
                          label="Invitation Sent"
                          description="Mark once the RSVP link has been shared with this guest."
                          checked={invitationSent}
                          onChange={setInvitationSent}
                        />
                        <ToggleBox
                          label="Has Children"
                          description="Track children included inside the total invited guest count."
                          checked={hasChildren}
                          onChange={(nextValue) => {
                            setHasChildren(nextValue);
                            if (!nextValue) setChildrenCount(1);
                          }}
                        />
                      </div>

                      {hasChildren && (
                        <FormField label="Children Count Included In Guest Limit">
                          <input
                            type="number"
                            min={1}
                            max={newLimit}
                            value={childrenCount}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (nextValue === "") {
                                setChildrenCount("");
                                return;
                              }
                              setChildrenCount(Math.min(Math.max(1, parseInt(nextValue, 10) || 1), newLimit));
                            }}
                            onBlur={() => {
                              if (childrenCount === "") setChildrenCount(1);
                            }}
                            className="wedding-inline-edit-input"
                          />
                        </FormField>
                      )}

                      {isGuestNotesAvailable ? (
                        <FormField label="Private Notes">
                          <textarea
                            value={guestNotes}
                            onChange={(event) => setGuestNotes(event.target.value)}
                            className="wedding-inline-edit-input min-h-[120px] resize-y"
                            placeholder="Follow-up reminders, family notes, seating context, or anything private for admin use."
                          />
                        </FormField>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500">
                          Add a `notes` column to `public.rsvp_list` if you want private guest notes here.
                        </div>
                      )}

                      <div className="flex flex-col gap-3 pt-2">
                        <button className="wedding-button-primary w-full">
                          {editingGuestId ? "Save Invitation" : "Add Invitation"}
                        </button>
                        {editingGuestId && (
                          <button type="button" onClick={resetGuestForm} className="wedding-button-secondary w-full">
                            Cancel Edit
                          </button>
                        )}
                      </div>
                    </form>
                  </StudioPanel>
                )}
              </div>
            )}

            {activeView === "seating" && (
              <div className="space-y-5">
                <WorkspaceTabs
                  tabs={[
                    { key: "board", label: "Seating Board" },
                    { key: "totals", label: "Table Totals" },
                    { key: "composer", label: editingSeatingId !== null ? "Edit Assignment" : "Add Assignment" },
                  ]}
                  activeTab={seatingTab}
                  onChange={(nextTab) => setSeatingTab(nextTab as SeatingWorkspaceTab)}
                />

                {seatingTab === "board" && (
                  <div className="space-y-5">
                  <StudioPanel>
                    <SectionHeading
                      kicker="Assignments"
                      title="Seating Board"
                      description="Search and manage table assignments in a dedicated work area instead of a narrow utility table."
                    />

                    <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                      <input
                        value={seatingSearch}
                        onChange={(event) => setSeatingSearch(event.target.value)}
                        className="wedding-input"
                        placeholder="Search by guest or table number"
                      />
                      <select value={seatingSort} onChange={(event) => setSeatingSort(event.target.value as SeatingSort)} className="wedding-select">
                        <option value="table">Sort: Table Number</option>
                        <option value="name">Sort: Guest Name</option>
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill
                        label="All Tables"
                        active={seatingTableFilter === "all"}
                        onClick={() => setSeatingTableFilter("all")}
                      />
                      {availableTableNumbers.map((table) => (
                        <Pill
                          key={table}
                          label={`Table ${table}`}
                          active={seatingTableFilter === table}
                          onClick={() => setSeatingTableFilter(table)}
                        />
                      ))}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <MiniMetric label="Assignments" value={filteredSeatingAssignments.length} />
                      <MiniMetric
                        label={isSeatingGuestCountAvailable ? "Seated Guests" : "Tables"}
                        value={isSeatingGuestCountAvailable ? filteredSeatingGuestCount : stats.uniqueTables}
                      />
                      <MiniMetric label="Needs Seating" value={stats.acceptedWithoutSeating} />
                    </div>

                  </StudioPanel>

                  <div className="space-y-4">
                    {filteredSeatingAssignments.length === 0 ? (
                      <StudioPanel>
                        <EmptyState title="No seating matches this view" description="Try a different guest name or table number." />
                      </StudioPanel>
                    ) : (
                      filteredSeatingAssignments.map((assignment) => {
                        const draft = inlineSeatingEdits[assignment.id];
                        const isEditing = Boolean(draft);
                        const seatingMenuItems: RowMenuItem[] = [
                          { label: "Open Composer", onSelect: () => beginSeatingFormEdit(assignment) },
                          { label: "Remove", onSelect: () => confirmRemoveSeatingAssignment(assignment), tone: "danger" },
                        ];

                        return (
                          <StudioPanel key={assignment.id} dense>
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                              <div>
                                <h3 className="font-serif text-2xl tracking-tight text-stone-900">{assignment.name}</h3>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <p className="inline-flex rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700">
                                    Table {assignment.table_number}
                                  </p>
                                  {isSeatingGuestCountAvailable && (
                                    <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700">
                                      {Math.max(1, assignment.guest_count || 1)} seat{Math.max(1, assignment.guest_count || 1) === 1 ? "" : "s"}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {!isEditing && (
                                  <button type="button" onClick={() => startInlineSeatingEdit(assignment)} className="wedding-button-secondary">
                                    Quick Edit
                                  </button>
                                )}
                                <RowMenu label={`Actions for ${assignment.name}`} items={seatingMenuItems} />
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="mt-5 space-y-3">
                                <div className={`grid gap-3 ${isSeatingGuestCountAvailable ? "md:grid-cols-[minmax(0,1fr)_140px_140px]" : "md:grid-cols-[1fr_150px]"}`}>
                                  <input
                                    value={draft.name}
                                    onChange={(event) =>
                                      setInlineSeatingEdits((prev) => ({
                                        ...prev,
                                        [assignment.id]: { ...prev[assignment.id], name: event.target.value },
                                      }))
                                    }
                                    className="wedding-inline-edit-input"
                                    placeholder="Guest name"
                                  />
                                  <input
                                    type="number"
                                    min={1}
                                    value={draft.table_number}
                                    onChange={(event) =>
                                      setInlineSeatingEdits((prev) => ({
                                        ...prev,
                                        [assignment.id]: {
                                          ...prev[assignment.id],
                                          table_number: parseInt(event.target.value, 10) || 1,
                                        },
                                      }))
                                    }
                                    className="wedding-inline-edit-input"
                                    placeholder="Table"
                                  />
                                  {isSeatingGuestCountAvailable && (
                                    <input
                                      type="number"
                                      min={1}
                                      value={draft.guest_count}
                                      onChange={(event) =>
                                        setInlineSeatingEdits((prev) => ({
                                          ...prev,
                                          [assignment.id]: {
                                            ...prev[assignment.id],
                                            guest_count: Math.max(1, parseInt(event.target.value, 10) || 1),
                                          },
                                        }))
                                      }
                                      className="wedding-inline-edit-input"
                                      placeholder="Seats"
                                    />
                                  )}
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row">
                                  <button type="button" onClick={() => void saveInlineSeatingEdit(assignment.id)} className="wedding-button-primary">
                                    Save Quick Edit
                                  </button>
                                  <button type="button" onClick={() => cancelInlineSeatingEdit(assignment.id)} className="wedding-button-secondary">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </StudioPanel>
                        );
                      })
                    )}
                  </div>
                  </div>
                )}

                {seatingTab === "totals" && (
                  <StudioPanel>
                    <SectionHeading
                      kicker="Table Totals"
                      title="Seat Count By Table"
                      description="A clean rollup of how many seats are currently assigned to each visible table."
                    />

                    <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                      <input
                        value={seatingSearch}
                        onChange={(event) => setSeatingSearch(event.target.value)}
                        className="wedding-input"
                        placeholder="Search by guest or table number"
                      />
                      <select value={seatingSort} onChange={(event) => setSeatingSort(event.target.value as SeatingSort)} className="wedding-select">
                        <option value="table">Sort: Table Number</option>
                        <option value="name">Sort: Guest Name</option>
                      </select>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill
                        label="All Tables"
                        active={seatingTableFilter === "all"}
                        onClick={() => setSeatingTableFilter("all")}
                      />
                      {availableTableNumbers.map((table) => (
                        <Pill
                          key={table}
                          label={`Table ${table}`}
                          active={seatingTableFilter === table}
                          onClick={() => setSeatingTableFilter(table)}
                        />
                      ))}
                    </div>

                    {availableTableNumbers.length > 0 && (
                      <div className="mt-5 rounded-[28px] border border-stone-100 bg-white p-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                          <div>
                            <p className="wedding-kicker mb-2">Move Entire Table</p>
                            <p className="text-sm text-stone-500">
                              Move every seating assignment from one table number to another in one step.
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto]">
                            <FormField label="From Table">
                              <select
                                value={tableMoveFrom}
                                onChange={(event) => setTableMoveFrom(parseInt(event.target.value, 10) || "")}
                                className="wedding-select"
                              >
                                {availableTableNumbers.map((table) => (
                                  <option key={table} value={table}>
                                    Table {table}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <FormField label="To Table">
                              <select
                                value={tableMoveTo}
                                onChange={(event) => setTableMoveTo(parseInt(event.target.value, 10) || "")}
                                className="wedding-select"
                              >
                                {availableTableNumbers.map((table) => (
                                  <option key={table} value={table}>
                                    Table {table}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <button
                              type="button"
                              onClick={() => void moveEntireTable()}
                              disabled={tableMoveFrom === "" || tableMoveTo === "" || tableMoveFrom === tableMoveTo}
                              className="wedding-button-primary w-full self-end disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                              Move Table
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {isSeatingGuestCountAvailable && filteredTableSeatTotals.size > 0 ? (
                      <div className="mt-5 rounded-[28px] border border-stone-100 bg-[linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(241,245,249,0.86))] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="wedding-kicker">Visible Table Totals</p>
                            <p className="mt-1 text-sm text-stone-500">Tap a table card to jump back into the seating board filtered to that table.</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">
                            {filteredTableSeatTotals.size} table{filteredTableSeatTotals.size === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                          {Array.from(filteredTableSeatTotals.entries())
                            .sort((left, right) => left[0] - right[0])
                            .map(([table, seats]) => (
                              <button
                                key={table}
                                type="button"
                                onClick={() => {
                                  setSeatingTableFilter(table);
                                  setSeatingTab("board");
                                }}
                                className={`rounded-[22px] border px-4 py-4 text-left transition ${
                                  seatingTableFilter === table
                                    ? "border-stone-900 bg-stone-900 text-white"
                                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                                }`}
                              >
                                <p
                                  className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                                    seatingTableFilter === table ? "text-white/75" : "text-stone-400"
                                  }`}
                                >
                                  Table {table}
                                </p>
                                <p className="mt-2 font-serif text-3xl leading-none">
                                  {seats}
                                </p>
                                <p className={`mt-2 text-sm ${seatingTableFilter === table ? "text-white/85" : "text-stone-500"}`}>
                                  assigned seat{seats === 1 ? "" : "s"}
                                </p>
                              </button>
                            ))}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5">
                        <EmptyState
                          title={isSeatingGuestCountAvailable ? "No visible table totals yet" : "Add guest_count to seating first"}
                          description={
                            isSeatingGuestCountAvailable
                              ? "Once seating assignments are visible here, each table total will show up automatically."
                              : "Add a guest_count column to public.seating if you want table seat totals to be tracked."
                          }
                        />
                      </div>
                    )}
                  </StudioPanel>
                )}

                {seatingTab === "composer" && (
                  <StudioPanel refProp={seatingFormRef}>
                    <SectionHeading
                      kicker="Composer"
                      title={editingSeatingId !== null ? "Edit Assignment" : "Add Assignment"}
                      description="A dedicated seating composer that stays separate from the board, so the list never feels crushed."
                    />

                    <form onSubmit={addSeatingAssignment} className="mt-5 space-y-4">
                      <FormField label="Guest Name">
                        <input
                          value={seatingName}
                          onChange={(event) => setSeatingName(event.target.value)}
                          required
                          className="wedding-inline-edit-input"
                          placeholder="Guest full name"
                        />
                      </FormField>

                      <FormField label="Table Number">
                        <input
                          type="number"
                          min={1}
                          value={tableNumber}
                          onChange={(event) => setTableNumber(parseInt(event.target.value, 10) || 1)}
                          className="wedding-inline-edit-input"
                        />
                      </FormField>

                      {isSeatingGuestCountAvailable && (
                        <FormField label="Guest Count">
                          <input
                            type="number"
                            min={1}
                            value={seatingGuestCount}
                            onChange={(event) => setSeatingGuestCount(Math.max(1, parseInt(event.target.value, 10) || 1))}
                            className="wedding-inline-edit-input"
                          />
                        </FormField>
                      )}

                      <div className="flex flex-col gap-3 pt-2">
                        <button className="wedding-button-primary w-full">
                          {editingSeatingId !== null ? "Save Assignment" : "Add Assignment"}
                        </button>
                        {editingSeatingId !== null && (
                          <button type="button" onClick={resetSeatingForm} className="wedding-button-secondary w-full">
                            Cancel Edit
                          </button>
                        )}
                      </div>
                    </form>
                  </StudioPanel>
                )}
              </div>
            )}

            {activeView === "settings" && (
              <div className="space-y-5">
                <StudioPanel>
                  <SectionHeading
                    kicker="Live Controls"
                    title="Site Settings"
                    description="A dedicated settings surface for controlling the live wedding experience without interrupting invitation work."
                  />

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <ToggleTile
                      label="Homepage Carousel"
                      description="Show or hide the homepage photo carousel."
                      enabled={isHomeCarouselEnabled}
                      onToggle={() =>
                        void updateSetting(
                          "is_home_carousel_enabled",
                          !isHomeCarouselEnabled,
                          `Homepage carousel ${!isHomeCarouselEnabled ? "enabled" : "hidden"}.`,
                        )
                      }
                    />
                    <ToggleTile
                      label="Homepage Venue Section"
                      description="Show or hide venue details and map on the homepage."
                      enabled={isHomeVenueEnabled}
                      onToggle={() =>
                        void updateSetting(
                          "is_home_venue_enabled",
                          !isHomeVenueEnabled,
                          `Homepage venue section ${!isHomeVenueEnabled ? "enabled" : "hidden"}.`,
                        )
                      }
                    />
                    <ToggleTile
                      label="Homepage Dress Code"
                      description="Show or hide the dress code card on the homepage."
                      enabled={isHomeDressCodeEnabled}
                      onToggle={() =>
                        void updateSetting(
                          "is_home_dress_code_enabled",
                          !isHomeDressCodeEnabled,
                          `Homepage dress code ${!isHomeDressCodeEnabled ? "enabled" : "hidden"}.`,
                        )
                      }
                    />
                    <ToggleTile
                      label="Find Your Table"
                      description="Control whether the table lookup page is available."
                      enabled={isSeatingChartEnabled}
                      onToggle={() =>
                        void updateSetting(
                          "is_seating_chart_enabled",
                          !isSeatingChartEnabled,
                          `Find Your Table ${!isSeatingChartEnabled ? "enabled" : "disabled"}.`,
                        )
                      }
                    />
                    <ToggleTile
                      label="Guest Gallery"
                      description="Control whether guests can upload and browse photos."
                      enabled={isGalleryEnabled}
                      onToggle={() =>
                        void updateSetting(
                          "is_gallery_enabled",
                          !isGalleryEnabled,
                          `Guest Gallery ${!isGalleryEnabled ? "enabled" : "disabled"}.`,
                        )
                      }
                    />
                    <ToggleTile
                      label="Gallery Photo Wall"
                      description="Show or hide the shared photos wall under uploads."
                      enabled={isGalleryFeedEnabled}
                      onToggle={() =>
                        void updateSetting(
                          "is_gallery_feed_enabled",
                          !isGalleryFeedEnabled,
                          `Shared photos section ${!isGalleryFeedEnabled ? "enabled" : "hidden"}.`,
                        )
                      }
                    />
                  </div>
                </StudioPanel>
              </div>
            )}
          </main>
        </div>
      </div>

      {activeView === "invitations" && invitationTab === "manage" && selectedGuestIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[85] border-t border-white/70 bg-white/92 px-4 py-3 shadow-[0_-12px_30px_rgba(28,25,23,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto max-w-[1600px] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="wedding-kicker">Selected Guests</p>
                <p className="text-sm text-stone-600">
                  {selectedGuestIds.length} selected · {selectedGuestSeatCount} seat{selectedGuestSeatCount === 1 ? "" : "s"}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedGuestIds([])} className="wedding-button-secondary">
                Clear
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={bulkTableNumber}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === "") {
                    setBulkTableNumber("");
                    return;
                  }
                  setBulkTableNumber(Math.max(1, parseInt(nextValue, 10) || 1));
                }}
                onBlur={() => {
                  if (bulkTableNumber === "") setBulkTableNumber(1);
                }}
                className="wedding-inline-edit-input"
                placeholder="Table #"
              />
              <button type="button" onClick={() => void bulkAssignSelectedToTable()} className="wedding-button-primary">
                Assign
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void bulkRemoveSelectedSeating()} className="wedding-button-secondary">
                Remove Seating
              </button>
              <button type="button" onClick={() => void bulkMarkSelectedAsSent()} className="wedding-button-secondary">
                Mark Sent
              </button>
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} />

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

function StudioPanel({
  children,
  refProp,
  dense = false,
}: {
  children: ReactNode;
  refProp?: React.RefObject<HTMLElement | null>;
  dense?: boolean;
}) {
  return (
    <section
      ref={refProp}
      className={`min-w-0 rounded-[34px] border border-white/75 bg-white/88 shadow-[0_14px_34px_rgba(28,25,23,0.05)] ${
        dense ? "p-5" : "p-5 md:p-6"
      }`}
    >
      {children}
    </section>
  );
}

function SectionHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="wedding-kicker mb-2">{kicker}</p>
      <h2 className="font-serif text-3xl tracking-tight text-stone-900 md:text-4xl">{title}</h2>
      {description && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-500 md:text-base">{description}</p>}
    </div>
  );
}

function WorkspaceTabs({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  activeTab: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="rounded-[28px] border border-white/75 bg-white/88 p-3 shadow-[0_12px_28px_rgba(28,25,23,0.04)]">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-full px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors md:px-5 ${
              activeTab === tab.key ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HeroMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "stone" | "amber";
}) {
  const tones = {
    sky: "bg-sky-50 text-sky-800 border-sky-100",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-100",
    stone: "bg-stone-50 text-stone-800 border-stone-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
  }[tone];

  return (
    <div className={`min-w-0 rounded-[28px] border px-4 py-4 shadow-sm ${tones}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] opacity-70">{label}</p>
      <p className="mt-3 font-serif text-3xl leading-none">{value}</p>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "stone" | "rose" | "amber";
}) {
  const toneStyles = {
    sky: "text-sky-700",
    emerald: "text-emerald-700",
    stone: "text-stone-900",
    rose: "text-rose-700",
    amber: "text-amber-700",
  }[tone];

  return (
    <div className="rounded-[26px] border border-stone-100 bg-stone-50 px-4 py-4">
      <p className="wedding-kicker mb-2">{label}</p>
      <p className={`font-serif text-3xl leading-none ${toneStyles}`}>{value}</p>
    </div>
  );
}

function ProgressLine({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "sky" | "emerald" | "stone" | "amber";
}) {
  const percentage = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const toneStyles = {
    sky: "bg-sky-600",
    emerald: "bg-emerald-600",
    stone: "bg-stone-700",
    amber: "bg-amber-500",
  }[tone];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="font-serif text-lg text-stone-900">{label}</p>
        <p className="text-sm font-semibold text-stone-500">
          {value} / {total}
        </p>
      </div>
      <div className="h-3 rounded-full bg-stone-100">
        <div className={`h-3 rounded-full ${toneStyles}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function CompactShortcut({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-[22px] border border-stone-100 bg-stone-50 px-4 py-3 text-left transition hover:border-stone-200 hover:bg-white"
    >
      <span className="font-serif text-lg text-stone-900">{label}</span>
      <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">
        {value}
      </span>
    </button>
  );
}

function AttentionItem({
  label,
  value,
  description,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  description: string;
  tone: "sky" | "stone" | "amber";
  onClick: () => void;
}) {
  const tones = {
    sky: "border-sky-100 bg-sky-50/80 text-sky-900",
    stone: "border-stone-100 bg-stone-50 text-stone-900",
    amber: "border-amber-100 bg-amber-50/80 text-amber-900",
  }[tone];

  return (
    <button type="button" onClick={onClick} className={`w-full rounded-[26px] border px-4 py-4 text-left ${tones}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl">{label}</p>
          <p className="mt-2 text-sm leading-relaxed opacity-80">{description}</p>
        </div>
        <span className="font-serif text-3xl leading-none">{value}</span>
      </div>
    </button>
  );
}

function ActivityRow({ title, detail, timestamp }: { title: string; detail: string; timestamp: string }) {
  return (
    <div className="rounded-[26px] border border-stone-100 bg-stone-50 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl text-stone-900">{title}</p>
          <p className="mt-1 text-sm text-stone-500">{detail}</p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{timestamp}</span>
      </div>
    </div>
  );
}

function WatchlistCard({
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-stone-100 bg-stone-50 px-5 py-5">
      <p className="font-serif text-2xl text-stone-900">{title}</p>
      <p className="mt-2 text-sm text-stone-500">{subtitle}</p>
      <button type="button" onClick={onAction} className="wedding-button-secondary mt-4">
        {actionLabel}
      </button>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="wedding-kicker mb-1">{label}</p>
      <p className="font-serif text-2xl text-stone-900">{value}</p>
    </div>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
        active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
      }`}
    >
      {label}
    </button>
  );
}

function InvitationCard({
  title,
  subtitle,
  badges,
  actions,
  selected,
  onToggleSelected,
  children,
}: {
  title: string;
  subtitle: string;
  badges: ReactNode;
  actions: ReactNode;
  selected: boolean;
  onToggleSelected: () => void;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[26px] border border-white/75 bg-white/88 shadow-[0_10px_24px_rgba(28,25,23,0.05)] md:rounded-[34px]">
      <div className="border-b border-stone-100 px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <label className="mb-2 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 md:mb-3 md:gap-3 md:px-4 md:py-2 md:text-sm">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
              />
              Select for bulk actions
            </label>
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <h3 className="font-serif text-[1.55rem] tracking-tight text-stone-900 md:text-3xl">{title}</h3>
              <span className="wedding-code">{subtitle}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 md:mt-3">{badges}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      </div>
      <div className="px-4 py-4 md:px-6 md:py-5">{children}</div>
    </section>
  );
}

function InfoPanel({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-stone-100 bg-white p-4">
      <p className="wedding-kicker mb-2">{label}</p>
      <p className={`${mono ? "font-mono text-xs md:text-sm" : "text-sm md:text-base"} leading-relaxed text-stone-700`}>{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="wedding-kicker mb-2 ml-2 block">{label}</label>
      {children}
    </div>
  );
}

function ToggleBox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-[26px] border border-stone-100 bg-stone-50 px-4 py-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
      />
      <div>
        <p className="font-serif text-xl text-stone-900">{label}</p>
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      </div>
    </label>
  );
}

function ToggleTile({
  label,
  description,
  enabled,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-stone-100 bg-stone-50 px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-serif text-2xl text-stone-900">{label}</p>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full transition-colors ${
            enabled ? "bg-stone-900" : "bg-stone-300"
          }`}
        >
          <span className={`inline-block h-6 w-6 rounded-full bg-white transition-transform ${enabled ? "translate-x-9" : "translate-x-1"}`} />
        </button>
      </div>
    </div>
  );
}

function RailButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-[22px] px-4 py-3 text-left transition ${
        active ? "bg-stone-900 text-white shadow-lg" : "bg-stone-50 text-stone-700 hover:bg-white"
      }`}
    >
      <span className="font-serif text-xl">{label}</span>
      <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${active ? "text-white/80" : "text-stone-400"}`}>Open</span>
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-stone-200 bg-stone-50 px-6 py-10 text-center">
      <p className="font-serif text-2xl text-stone-900">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">{description}</p>
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
  const label = attending === null ? "Pending" : attending ? "Attending" : "Declined";

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] ${styles}`}>
      {label}
    </span>
  );
}

function InvitationSentBadge({ sent }: { sent: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] ${
        sent ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-500"
      }`}
    >
      {sent ? "Sent" : "Not Sent"}
    </span>
  );
}

function ChildrenCountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700">
      {count} {count === 1 ? "Child" : "Children"}
    </span>
  );
}

function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const gap = 8;
    const menuWidth = 240;
    const estimatedHeight = menuRef.current?.offsetHeight ?? Math.min(56 * items.length + 16, 360);

    const left = Math.min(
      Math.max(margin, rect.right - menuWidth),
      Math.max(margin, viewportWidth - menuWidth - margin),
    );

    const spaceBelow = viewportHeight - rect.bottom - margin - gap;
    const spaceAbove = rect.top - margin - gap;
    const openBelow = spaceBelow >= Math.min(estimatedHeight, 220) || spaceBelow >= spaceAbove;
    const maxHeight = Math.max(140, openBelow ? spaceBelow : spaceAbove);
    const top = openBelow
      ? Math.min(rect.bottom + gap, viewportHeight - maxHeight - margin)
      : Math.max(margin, rect.top - Math.min(estimatedHeight, maxHeight) - gap);

    setMenuStyle({ top, left, maxHeight });
  }, [items.length]);

  useEffect(() => {
    if (!isOpen) return;

    const rafId = window.requestAnimationFrame(updateMenuPosition);

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && (buttonRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    const handleViewportChange = () => {
      window.requestAnimationFrame(updateMenuPosition);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, updateMenuPosition]);

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl text-stone-500 shadow-sm ring-1 ring-stone-200 transition-colors hover:text-stone-900"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span aria-hidden="true">⋮</span>
      </button>

      {isOpen &&
        menuStyle &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[160] w-[240px] overflow-y-auto overscroll-contain rounded-2xl border border-stone-100 bg-white p-2 shadow-2xl"
            style={{ top: menuStyle.top, left: menuStyle.left, maxHeight: menuStyle.maxHeight }}
            role="menu"
            aria-label={label}
          >
            {items.map((item) =>
              item.href ? (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setIsOpen(false)}
                  className={`block rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                    item.tone === "danger" ? "text-rose-600 hover:bg-rose-50" : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    item.onSelect?.();
                  }}
                  className={`block w-full rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                    item.tone === "danger" ? "text-rose-600 hover:bg-rose-50" : "text-stone-700 hover:bg-stone-50"
                  }`}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
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
          }`}
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
      <div className="w-full max-w-md rounded-[30px] border border-stone-100 bg-white p-6 shadow-2xl md:p-8">
        <p className="wedding-kicker mb-2">Confirm Action</p>
        <h3 className="font-serif text-3xl text-stone-900">{title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-stone-600">{message}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCancel} className="wedding-button-secondary w-full sm:w-auto">
            Cancel
          </button>
          <button
            onClick={() => void onConfirm()}
            className={`wedding-button-primary w-full sm:w-auto ${actionTone === "danger" ? "bg-rose-700 hover:bg-rose-600" : ""}`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
