"use client";

import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, WheelEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { SITE_URL } from "@/lib/wedding";
import { DatabaseEnvironmentBadge } from "./DatabaseEnvironmentBadge";

type GuestResponse = {
  id: string;
  invite_code: string;
  guest_name: string;
  phone_number?: string | null;
  email?: string | null;
  request_contact_details?: boolean | null;
  max_guests: number;
  confirmed_guests: number | null;
  attending: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  responded_at: string | null;
  invitation_sent: boolean | null;
  invitation_sent_at?: string | null;
  virtual_guest?: boolean | null;
  has_children: boolean | null;
  children_count: number | null;
  notes?: string | null;
};

type SeatingAssignment = {
  id: number;
  name: string;
  name_aliases?: string | null;
  invite_code?: string | null;
  table_number: number;
  guest_count?: number | null;
};

type Toast = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

type AdminView = "overview" | "invitations" | "seating" | "settings";
type OverviewWorkspaceTab = "summary" | "follow_up" | "needs_seating" | "activity" | "checks";
type ChecksWorkspaceTab = "seating" | "rsvp" | "records";
type InvitationWorkspaceTab = "manage" | "bulk" | "composer";
type SeatingWorkspaceTab = "board" | "tables" | "composer";
type SeatingBoardMode = "assignments" | "invites";
type GuestStatusFilter = "pending" | "attending" | "declined";
type GuestExtraFilter = "sent" | "not_sent" | "has_children" | "virtual" | "needs_seating" | "sent_awaiting_response";
type GuestSort = "recent" | "name" | "invite_code" | "largest_party";
type SeatingSort = "table" | "name";
type SeatingTableFilter = number[] | "all";

type InlineGuestDraft = {
  guest_name: string;
  invite_code: string;
  phone_number: string;
  email: string;
  request_contact_details: boolean;
  max_guests: number | "";
  attending: boolean | null;
  confirmed_guests: number | "" | null;
  invitation_sent: boolean;
  virtual_guest: boolean;
  has_children: boolean;
  children_count: number | "";
  notes: string;
};

type InlineSeatingDraft = {
  name: string;
  name_aliases: string;
  invite_code: string;
  table_number: number | "";
  guest_count: number | "";
};

type ConfirmDialogState = {
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "default";
  onConfirm: () => Promise<void> | void;
  secondaryActionLabel?: string;
  secondaryActionTone?: "danger" | "default";
  onSecondaryAction?: () => Promise<void> | void;
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

type WorkspaceLocation = {
  activeView: AdminView;
  overviewTab: OverviewWorkspaceTab;
  checksTab: ChecksWorkspaceTab;
  invitationTab: InvitationWorkspaceTab;
  seatingTab: SeatingWorkspaceTab;
  seatingBoardMode: SeatingBoardMode;
};

const INVITE_BASE_URL = SITE_URL.replace(/\/+$/, "");
const INVITATION_IMAGE_PATH = "/O&H_invitation.jpeg";

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
  const latest = [guest.responded_at, guest.invitation_sent_at, guest.updated_at, guest.created_at]
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];

  return latest ?? 0;
};

const getGuestInviteUrl = (guest: GuestResponse) => `${INVITE_BASE_URL}/${guest.invite_code.toLowerCase()}`;
const getSeatingGuestCount = (guest: GuestResponse) =>
  guest.virtual_guest === true ? 0 : guest.attending === true ? Math.max(1, guest.confirmed_guests || 1) : Math.max(1, guest.max_guests || 1);
const normalizeInviteCode = (value?: string | null) => (value || "").trim().toUpperCase();
const normalizePhoneForSmsLink = (value?: string | null) => (value || "").replace(/[^\d+]/g, "");
const parseNameAliases = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const buildGuestInviteMessage = (guest: GuestResponse) =>
  `Dear ${guest.guest_name}, with great joy, Omar & Hager invite you to celebrate their wedding. Please RSVP here: ${getGuestInviteUrl(guest)}`;

const buildGuestReminderMessage = (guest: GuestResponse) =>
  `Dear ${guest.guest_name}, this is a kind reminder from Omar & Hager to please RSVP when you have a moment. You can reply here: ${getGuestInviteUrl(guest)}`;

const formatPhoneNumberInput = (value?: string | null) => {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  const normalized = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (!normalized) return "";
  if (normalized.length <= 3) return normalized;
  if (normalized.length <= 6) return `(${normalized.slice(0, 3)}) ${normalized.slice(3)}`;
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6, 10)}`;
};

const escapeClipboardHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const blobToDataUrl = async (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not prepare the invitation image."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not prepare the invitation image."));
    reader.readAsDataURL(blob);
  });

let invitationImageBlobPromise: Promise<Blob> | null = null;
let invitationImageDataUrlPromise: Promise<string> | null = null;

const getClipboardReadyInvitationImageBlob = async () => {
  if (!invitationImageBlobPromise) {
    invitationImageBlobPromise = (async () => {
      const response = await fetch(INVITATION_IMAGE_PATH, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error("Could not load the invitation image.");
      }

      const sourceBlob = await response.blob();
      if (sourceBlob.type === "image/png") return sourceBlob;

      const bitmap = await createImageBitmap(sourceBlob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Could not prepare the invitation image.");
      }

      context.drawImage(bitmap, 0, 0);

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }

          reject(new Error("Could not prepare the invitation image."));
        }, "image/png");
      });
    })().catch((error) => {
      invitationImageBlobPromise = null;
      throw error;
    });
  }

  return invitationImageBlobPromise;
};

const getClipboardReadyInvitationImageDataUrl = async () => {
  if (!invitationImageDataUrlPromise) {
    invitationImageDataUrlPromise = getClipboardReadyInvitationImageBlob()
      .then((blob) => blobToDataUrl(blob))
      .catch((error) => {
        invitationImageDataUrlPromise = null;
        throw error;
      });
  }

  return invitationImageDataUrlPromise;
};

const preventNumberInputScroll = (event: WheelEvent<HTMLInputElement>) => {
  if (document.activeElement === event.currentTarget) {
    event.preventDefault();
  }
};

const getInvitationSentAtValue = ({
  nextInvitationSent,
  existingGuest,
  now,
}: {
  nextInvitationSent: boolean;
  existingGuest?: GuestResponse | null;
  now: string;
}) => {
  if (!nextInvitationSent) return null;
  if (existingGuest?.invitation_sent_at) return existingGuest.invitation_sent_at;
  return now;
};

const getGuestActionIndicators = (guest: GuestResponse) => {
  const indicators: string[] = [];
  const respondedAt = formatAdminDateTime(guest.responded_at);
  const invitationSentAt = formatAdminDateTime(guest.invitation_sent_at);
  const editedAt = formatAdminDateTime(guest.updated_at);
  const createdAt = formatAdminDateTime(guest.created_at);

  if (guest.attending === null && guest.invitation_sent) {
    indicators.push(invitationSentAt ? `Invitation sent · ${invitationSentAt} · Awaiting RSVP` : "Invitation sent · Awaiting RSVP");
  } else if (guest.attending === null) {
    indicators.push("Awaiting RSVP");
  } else {
    const responseLabel = guest.attending ? "RSVP accepted" : "RSVP declined";
    indicators.push(respondedAt ? `${responseLabel} · ${respondedAt}` : responseLabel);
  }

  if (guest.invitation_sent && guest.attending !== null) {
    indicators.push(invitationSentAt ? `Invitation sent · ${invitationSentAt}` : "Invitation sent");
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
      const invitationSentAt = guest.invitation_sent_at ? new Date(guest.invitation_sent_at).getTime() : 0;
      const updatedAt = guest.updated_at ? new Date(guest.updated_at).getTime() : 0;
      const createdAt = guest.created_at ? new Date(guest.created_at).getTime() : 0;
      const latest = Math.max(respondedAt, invitationSentAt, updatedAt, createdAt);
      const initialCreateWindowMs = 10 * 1000;

      if (!latest) return null;

      const responseHappenedLater = respondedAt > createdAt;
      const sentHappenedLater = invitationSentAt > createdAt;
      const updateHappenedLater = updatedAt > createdAt + initialCreateWindowMs;
      const isInitialCreate = createdAt > 0 && !responseHappenedLater && !sentHappenedLater && !updateHappenedLater;

      if (isInitialCreate) {
        return {
          id: `${guest.id}-created`,
          title: "Invitation created",
          detail: guest.guest_name,
          timestamp: formatAdminDateTime(guest.created_at) ?? "Recently",
          sortValue: createdAt,
        };
      }

      if (latest === respondedAt && guest.attending !== null) {
        return {
          id: `${guest.id}-responded`,
          title: guest.attending ? "RSVP accepted" : "RSVP declined",
          detail: guest.guest_name,
          timestamp: formatAdminDateTime(guest.responded_at) ?? "Recently",
          sortValue: respondedAt,
        };
      }

      if (latest === invitationSentAt && guest.invitation_sent) {
        return {
          id: `${guest.id}-sent`,
          title: "Invitation sent",
          detail: guest.guest_name,
          timestamp: formatAdminDateTime(guest.invitation_sent_at) ?? "Recently",
          sortValue: invitationSentAt,
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

export default function StudioProPage() {
  const [responses, setResponses] = useState<GuestResponse[]>([]);
  const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [passwordInput, setPasswordInput] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState("");

  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [overviewTab, setOverviewTab] = useState<OverviewWorkspaceTab>("summary");
  const [checksTab, setChecksTab] = useState<ChecksWorkspaceTab>("seating");
  const [invitationTab, setInvitationTab] = useState<InvitationWorkspaceTab>("manage");
  const [seatingTab, setSeatingTab] = useState<SeatingWorkspaceTab>("board");

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [requestContactDetails, setRequestContactDetails] = useState(false);
  const [newLimit, setNewLimit] = useState<number | "">(1);
  const [attendanceStatus, setAttendanceStatus] = useState<"pending" | "attending" | "declined">("pending");
  const [confirmedGuests, setConfirmedGuests] = useState(1);
  const [invitationSent, setInvitationSent] = useState(false);
  const [isVirtualGuest, setIsVirtualGuest] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
  const [childrenCount, setChildrenCount] = useState<number | "">(1);
  const [guestNotes, setGuestNotes] = useState("");
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);

  const [seatingName, setSeatingName] = useState("");
  const [seatingNameAliases, setSeatingNameAliases] = useState("");
  const [seatingInviteCode, setSeatingInviteCode] = useState("");
  const [tableNumber, setTableNumber] = useState<number | "">(1);
  const [seatingGuestCount, setSeatingGuestCount] = useState<number | "">(1);
  const [editingSeatingId, setEditingSeatingId] = useState<number | null>(null);

  const [guestSearch, setGuestSearch] = useState("");
  const [guestStatusFilters, setGuestStatusFilters] = useState<GuestStatusFilter[]>([]);
  const [guestExtraFilters, setGuestExtraFilters] = useState<GuestExtraFilter[]>([]);
  const [guestSort, setGuestSort] = useState<GuestSort>("name");
  const deferredGuestSearch = useDeferredValue(guestSearch);

  const [seatingSearch, setSeatingSearch] = useState("");
  const [seatingSort, setSeatingSort] = useState<SeatingSort>("table");
  const [seatingTableFilter, setSeatingTableFilter] = useState<SeatingTableFilter>("all");
  const [seatingBoardMode, setSeatingBoardMode] = useState<SeatingBoardMode>("assignments");
  const [tableMoveFrom, setTableMoveFrom] = useState<number | "">("");
  const [tableMoveTo, setTableMoveTo] = useState<number | "">("");
  const [tableMoveMode, setTableMoveMode] = useState<"move" | "swap">("swap");
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
  const [isLivestreamEnabled, setIsLivestreamEnabled] = useState(false);
  const [livestreamEmbedUrl, setLivestreamEmbedUrl] = useState("");
  const [isHomeVenueEnabled, setIsHomeVenueEnabled] = useState(false);
  const [isHomeCarouselEnabled, setIsHomeCarouselEnabled] = useState(true);
  const [isHomeDressCodeEnabled, setIsHomeDressCodeEnabled] = useState(false);
  const [isGuestNotesAvailable, setIsGuestNotesAvailable] = useState<boolean | null>(null);
  const [isSeatingGuestCountAvailable, setIsSeatingGuestCountAvailable] = useState<boolean | null>(null);
  const [isSeatingAliasesAvailable, setIsSeatingAliasesAvailable] = useState<boolean | null>(null);
  const [isInvitationSentAtAvailable, setIsInvitationSentAtAvailable] = useState<boolean | null>(null);
  const [isGuestPhoneAvailable, setIsGuestPhoneAvailable] = useState<boolean | null>(null);
  const [isGuestEmailAvailable, setIsGuestEmailAvailable] = useState<boolean | null>(null);
  const [isRequestContactDetailsAvailable, setIsRequestContactDetailsAvailable] = useState<boolean | null>(null);
  const [isVirtualGuestAvailable, setIsVirtualGuestAvailable] = useState<boolean | null>(null);
  const [isSeatingInviteCodeAvailable, setIsSeatingInviteCodeAvailable] = useState<boolean | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [hasRestoredWorkspaceState, setHasRestoredWorkspaceState] = useState(false);
  const [guestFiltersOpen, setGuestFiltersOpen] = useState(true);
  const [guestSummaryOpen, setGuestSummaryOpen] = useState(false);
  const [seatingControlsOpen, setSeatingControlsOpen] = useState(true);
  const [tableToolsOpen, setTableToolsOpen] = useState(false);
  const [followUpSentBefore, setFollowUpSentBefore] = useState("");
  const [guestComposerReturnLocation, setGuestComposerReturnLocation] = useState<WorkspaceLocation | null>(null);
  const [seatingComposerReturnLocation, setSeatingComposerReturnLocation] = useState<WorkspaceLocation | null>(null);

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

    const savedState = window.sessionStorage.getItem("studio_pro_workspace_state_v1");
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState) as {
          activeView?: AdminView;
          overviewTab?: OverviewWorkspaceTab;
          checksTab?: ChecksWorkspaceTab;
          invitationTab?: InvitationWorkspaceTab;
          seatingTab?: SeatingWorkspaceTab;
          seatingBoardMode?: SeatingBoardMode;
          guestSearch?: string;
          guestStatusFilters?: GuestStatusFilter[];
          guestExtraFilters?: GuestExtraFilter[];
          guestSort?: GuestSort;
        seatingSearch?: string;
        seatingSort?: SeatingSort;
          seatingTableFilter?: SeatingTableFilter | number;
          guestFiltersOpen?: boolean;
          guestSummaryOpen?: boolean;
          seatingControlsOpen?: boolean;
          tableToolsOpen?: boolean;
          followUpSentBefore?: string;
      };

        if (parsed.activeView) setActiveView(parsed.activeView);
        if (parsed.overviewTab) setOverviewTab(parsed.overviewTab);
        if (parsed.checksTab) setChecksTab(parsed.checksTab);
        if (parsed.invitationTab) setInvitationTab(parsed.invitationTab);
        if (parsed.seatingTab) setSeatingTab(parsed.seatingTab);
        if (parsed.seatingBoardMode) setSeatingBoardMode(parsed.seatingBoardMode);
        if (parsed.guestSearch !== undefined) setGuestSearch(parsed.guestSearch);
        if (Array.isArray(parsed.guestStatusFilters)) setGuestStatusFilters(parsed.guestStatusFilters);
        if (Array.isArray(parsed.guestExtraFilters)) setGuestExtraFilters(parsed.guestExtraFilters);
        if (parsed.guestSort) setGuestSort(parsed.guestSort);
        if (parsed.seatingSearch !== undefined) setSeatingSearch(parsed.seatingSearch);
        if (parsed.seatingSort) setSeatingSort(parsed.seatingSort);
        if (parsed.seatingTableFilter !== undefined) {
          if (parsed.seatingTableFilter === "all") {
            setSeatingTableFilter("all");
          } else if (typeof parsed.seatingTableFilter === "number") {
            setSeatingTableFilter([parsed.seatingTableFilter]);
          } else if (Array.isArray(parsed.seatingTableFilter)) {
            setSeatingTableFilter(
              parsed.seatingTableFilter
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
                .sort((left, right) => left - right),
            );
          }
        }
        if (parsed.guestFiltersOpen !== undefined) setGuestFiltersOpen(parsed.guestFiltersOpen);
        if (parsed.guestSummaryOpen !== undefined) setGuestSummaryOpen(parsed.guestSummaryOpen);
        if (parsed.seatingControlsOpen !== undefined) setSeatingControlsOpen(parsed.seatingControlsOpen);
        if (parsed.tableToolsOpen !== undefined) setTableToolsOpen(parsed.tableToolsOpen);
        if (typeof parsed.followUpSentBefore === "string") setFollowUpSentBefore(parsed.followUpSentBefore);
      } catch {
        window.sessionStorage.removeItem("studio_pro_workspace_state_v1");
      }
    }

    setHasRestoredWorkspaceState(true);
  }, [authorized, hasRestoredWorkspaceState]);

  useEffect(() => {
    if (!authorized || !hasRestoredWorkspaceState) return;

    window.sessionStorage.setItem(
      "studio_pro_workspace_state_v1",
      JSON.stringify({
        activeView,
        overviewTab,
        checksTab,
        invitationTab,
        seatingTab,
        seatingBoardMode,
        guestSearch,
        guestStatusFilters,
        guestExtraFilters,
        guestSort,
        seatingSearch,
        seatingSort,
        seatingTableFilter,
        guestFiltersOpen,
        guestSummaryOpen,
        seatingControlsOpen,
        tableToolsOpen,
        followUpSentBefore,
      }),
    );
  }, [
    activeView,
    authorized,
    guestExtraFilters,
    guestSearch,
    guestSort,
    guestStatusFilters,
    hasRestoredWorkspaceState,
    checksTab,
    overviewTab,
    invitationTab,
    seatingSearch,
    seatingSort,
    seatingTab,
    seatingBoardMode,
    seatingTableFilter,
    guestFiltersOpen,
    guestSummaryOpen,
    seatingControlsOpen,
    tableToolsOpen,
    followUpSentBefore,
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
        "is_livestream_enabled",
        "livestream_embed_url",
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
      setIsLivestreamEnabled(settingsMap.is_livestream_enabled === "true");
      setLivestreamEmbedUrl(settingsMap.livestream_embed_url || "");
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

  const detectSeatingAliasesColumn = useCallback(async () => {
    const { error: aliasesError } = await supabase.from("seating").select("name_aliases").limit(1);
    setIsSeatingAliasesAvailable(!aliasesError);
  }, []);

  const detectInvitationSentAtColumn = useCallback(async () => {
    const { error: invitationSentAtError } = await supabase.from("rsvp_list").select("invitation_sent_at").limit(1);
    setIsInvitationSentAtAvailable(!invitationSentAtError);
  }, []);

  const detectGuestPhoneColumn = useCallback(async () => {
    const { error: phoneError } = await supabase.from("rsvp_list").select("phone_number").limit(1);
    setIsGuestPhoneAvailable(!phoneError);
  }, []);

  const detectGuestEmailColumn = useCallback(async () => {
    const { error: emailError } = await supabase.from("rsvp_list").select("email").limit(1);
    setIsGuestEmailAvailable(!emailError);
  }, []);

  const detectRequestContactDetailsColumn = useCallback(async () => {
    const { error: requestContactDetailsError } = await supabase.from("rsvp_list").select("request_contact_details").limit(1);
    setIsRequestContactDetailsAvailable(!requestContactDetailsError);
  }, []);

  const detectVirtualGuestColumn = useCallback(async () => {
    const { error: virtualGuestError } = await supabase.from("rsvp_list").select("virtual_guest").limit(1);
    setIsVirtualGuestAvailable(!virtualGuestError);
  }, []);

  const detectSeatingInviteCodeColumn = useCallback(async () => {
    const { error: inviteCodeError } = await supabase.from("seating").select("invite_code").limit(1);
    setIsSeatingInviteCodeAvailable(!inviteCodeError);
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
        detectSeatingAliasesColumn(),
        detectInvitationSentAtColumn(),
        detectGuestPhoneColumn(),
        detectGuestEmailColumn(),
        detectRequestContactDetailsColumn(),
        detectVirtualGuestColumn(),
        detectSeatingInviteCodeColumn(),
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
  }, [
    authorized,
    detectGuestNotesColumn,
    detectGuestEmailColumn,
    detectGuestPhoneColumn,
    detectInvitationSentAtColumn,
    detectRequestContactDetailsColumn,
    detectVirtualGuestColumn,
    detectSeatingInviteCodeColumn,
    detectSeatingAliasesColumn,
    detectSeatingGuestCountColumn,
    fetchResponses,
    fetchSeatingAssignments,
    fetchSettings,
  ]);

  useEffect(() => {
    if (!authorized) return;

    const prewarm = window.setTimeout(() => {
      void getClipboardReadyInvitationImageDataUrl().catch(() => {
        // Best effort only. If this fails, the copy flow still falls back safely.
      });
    }, 250);

    return () => {
      window.clearTimeout(prewarm);
    };
  }, [authorized]);

  useEffect(() => {
    setSelectedGuestIds((prev) => prev.filter((guestId) => responses.some((guest) => guest.id === guestId)));
  }, [responses]);

  useEffect(() => {
    if (!(activeView === "invitations" && invitationTab === "composer") && guestComposerReturnLocation) {
      setGuestComposerReturnLocation(null);
    }
  }, [activeView, guestComposerReturnLocation, invitationTab]);

  useEffect(() => {
    if (!(activeView === "seating" && seatingTab === "composer") && seatingComposerReturnLocation) {
      setSeatingComposerReturnLocation(null);
    }
  }, [activeView, seatingComposerReturnLocation, seatingTab]);

  const captureWorkspaceLocation = useCallback(
    (): WorkspaceLocation => ({
      activeView,
      overviewTab,
      checksTab,
      invitationTab,
      seatingTab,
      seatingBoardMode,
    }),
    [activeView, checksTab, invitationTab, overviewTab, seatingBoardMode, seatingTab],
  );

  const restoreWorkspaceLocation = useCallback((location: WorkspaceLocation | null) => {
    if (!location) return;

    setActiveView(location.activeView);
    setOverviewTab(location.overviewTab);
    setChecksTab(location.checksTab);
    setInvitationTab(location.invitationTab);
    setSeatingTab(location.seatingTab);
    setSeatingBoardMode(location.seatingBoardMode);
  }, []);

  const resetGuestForm = () => {
    setNewName("");
    setNewCode("");
    setNewPhoneNumber("");
    setNewEmail("");
    setRequestContactDetails(false);
    setNewLimit(1);
    setAttendanceStatus("pending");
    setConfirmedGuests(1);
    setInvitationSent(false);
    setIsVirtualGuest(false);
    setHasChildren(false);
    setChildrenCount(1);
    setGuestNotes("");
    setEditingGuestId(null);
    setGuestComposerReturnLocation(null);
  };

  const resetSeatingForm = () => {
    setSeatingName("");
    setSeatingNameAliases("");
    setSeatingInviteCode("");
    setTableNumber(1);
    setSeatingGuestCount(1);
    setEditingSeatingId(null);
    setSeatingComposerReturnLocation(null);
  };

  const cancelGuestComposer = () => {
    const returnLocation = guestComposerReturnLocation;
    resetGuestForm();
    restoreWorkspaceLocation(returnLocation);
  };

  const cancelSeatingComposer = () => {
    const returnLocation = seatingComposerReturnLocation;
    resetSeatingForm();
    restoreWorkspaceLocation(returnLocation);
  };

  const findGuestByInviteCode = useCallback(
    (inviteCode: string) => responses.find((guest) => normalizeInviteCode(guest.invite_code) === normalizeInviteCode(inviteCode)) ?? null,
    [responses],
  );

  const findLinkedGuestForSeating = useCallback(
    ({ inviteCode }: { inviteCode?: string | null }) => {
      const cleanedInviteCode = normalizeInviteCode(inviteCode);
      if (!cleanedInviteCode) return null;
      return findGuestByInviteCode(cleanedInviteCode);
    },
    [findGuestByInviteCode],
  );

  const addGuest = async (event: React.FormEvent) => {
    event.preventDefault();

    const cleanedName = newName.trim();
    const cleanedCode = newCode.trim();
    if (!cleanedName || !cleanedCode) return;

    const now = new Date().toISOString();
    const attendingValue = attendanceStatus === "pending" ? null : attendanceStatus === "attending";
    const maxGuests = Math.max(1, Number(newLimit) || 1);
    const finalConfirmed =
      attendanceStatus === "pending" ? null : attendanceStatus === "attending" ? Math.max(1, Math.min(confirmedGuests, maxGuests)) : 0;

    const payload = {
      guest_name: cleanedName,
      invite_code: cleanedCode.toUpperCase(),
      ...(isGuestPhoneAvailable ? { phone_number: formatPhoneNumberInput(newPhoneNumber) || null } : {}),
      ...(isGuestEmailAvailable ? { email: newEmail.trim() || null } : {}),
      ...(isRequestContactDetailsAvailable ? { request_contact_details: requestContactDetails } : {}),
      max_guests: maxGuests,
      attending: attendingValue,
      confirmed_guests: finalConfirmed,
      invitation_sent: invitationSent,
      ...(isInvitationSentAtAvailable ? { invitation_sent_at: getInvitationSentAtValue({ nextInvitationSent: invitationSent, now }) } : {}),
      ...(isVirtualGuestAvailable ? { virtual_guest: isVirtualGuest } : {}),
      has_children: hasChildren,
      children_count: hasChildren ? Math.min(Math.max(1, Number(childrenCount) || 1), maxGuests) : 0,
      ...(isGuestNotesAvailable ? { notes: guestNotes.trim() || null } : {}),
    };

    const persistGuestComposerUpdate = async ({
      existingGuest,
      removeSeatingAfterSave,
    }: {
      existingGuest: GuestResponse;
      removeSeatingAfterSave: boolean;
    }) => {
      const respondedAt =
        attendingValue === null
          ? null
          : existingGuest.attending !== attendingValue || !existingGuest.responded_at
            ? now
            : existingGuest.responded_at;

      const { error: updateError } = await supabase
        .from("rsvp_list")
        .update({
          ...payload,
          ...(isInvitationSentAtAvailable
            ? {
                invitation_sent_at: getInvitationSentAtValue({
                  nextInvitationSent: invitationSent,
                  existingGuest,
                  now,
                }),
              }
            : {}),
          responded_at: respondedAt,
          updated_at: now,
        })
        .eq("id", existingGuest.id);

      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }

      if (removeSeatingAfterSave) {
        const deleteError = await removeSeatingAssignmentsForGuest(existingGuest);
        if (deleteError) {
          showToast("Invitation updated, but seating could not be removed.", "error");
          return;
        }
      } else if (
        normalizeNameKey(existingGuest.guest_name) !== normalizeNameKey(cleanedName) ||
        normalizeInviteCode(existingGuest.invite_code) !== normalizeInviteCode(cleanedCode)
      ) {
        const renameError = await syncSeatingAssignmentsForGuest(existingGuest, cleanedCode);
        if (renameError) {
          showToast("Invitation updated, but seating could not be kept in sync with the new guest details.", "error");
          return;
        }
      }

      showToast("Invitation updated.", "success");
      resetGuestForm();
    };

    if (editingGuestId) {
      const existingGuest = responses.find((guest) => guest.id === editingGuestId);
      if (!existingGuest) {
        showToast("Invitation could not be found.", "error");
        return;
      }

      const hasSeating = getSeatingAssignmentsForGuest(existingGuest).length > 0;
      if (hasSeating && attendingValue !== true) {
        askConfirm({
          title: "Guest Still Has Seating Assigned",
          message: `${existingGuest.guest_name} still has a table assignment. You can keep it as-is, or remove it while saving this RSVP change.`,
          actionLabel: "Save & Keep Seating",
          actionTone: "default",
          onConfirm: async () => {
            await persistGuestComposerUpdate({ existingGuest, removeSeatingAfterSave: false });
          },
          secondaryActionLabel: "Save & Remove Seating",
          secondaryActionTone: "danger",
          onSecondaryAction: async () => {
            await persistGuestComposerUpdate({ existingGuest, removeSeatingAfterSave: true });
          },
        });
        return;
      }

      await persistGuestComposerUpdate({ existingGuest, removeSeatingAfterSave: false });
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

    const cleanedInviteCode = normalizeInviteCode(seatingInviteCode);
    if (isSeatingInviteCodeAvailable !== true) {
      showToast("Add an invite_code column to seating before creating linked table assignments.", "error");
      return;
    }

    if (!cleanedInviteCode) {
      showToast("Seating assignments must include an RSVP code.", "error");
      return;
    }

    const matchingGuestByCode = findGuestByInviteCode(cleanedInviteCode);
    if (!matchingGuestByCode) {
      showToast("No invitation matches that RSVP code yet.", "error");
      return;
    }

    const capacityCheck = getSeatingCapacityCheck({
      inviteCode: cleanedInviteCode,
      guestCount: seatingGuestCount,
      editingAssignmentId: editingSeatingId,
    });

    if (capacityCheck?.wouldExceed) {
      showToast(
        `This would assign ${capacityCheck.totalAfterSave} seats to ${capacityCheck.linkedGuest.guest_name}, but only ${capacityCheck.allowedSeats} are allowed.`,
        "error",
      );
      return;
    }

    const payload = {
      name: cleanedName,
      ...(isSeatingAliasesAvailable ? { name_aliases: seatingNameAliases.trim() || null } : {}),
      invite_code: cleanedInviteCode,
      table_number: Math.max(1, Number(tableNumber) || 1),
      ...(isSeatingGuestCountAvailable ? { guest_count: Math.max(1, Number(seatingGuestCount) || 1) } : {}),
    };
    const returnLocation = seatingComposerReturnLocation;

    if (editingSeatingId !== null) {
      const { error: updateError } = await supabase.from("seating").update(payload).eq("id", editingSeatingId);

      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }

      showToast("Seating assignment updated.", "success");
      resetSeatingForm();
      restoreWorkspaceLocation(returnLocation);
      return;
    }

    const { error: insertError } = await supabase.from("seating").insert([payload]);

    if (insertError) {
      showToast(insertError.message, "error");
      return;
    }

    showToast("Seating assignment added.", "success");
    resetSeatingForm();
    restoreWorkspaceLocation(returnLocation);
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
        phone_number: formatPhoneNumberInput(guest.phone_number || ""),
        email: guest.email || "",
        request_contact_details: Boolean(guest.request_contact_details),
        max_guests: guest.max_guests,
        attending: guest.attending,
        confirmed_guests: guest.attending === true ? Math.max(1, guest.confirmed_guests || 1) : guest.confirmed_guests,
        invitation_sent: Boolean(guest.invitation_sent),
        virtual_guest: Boolean(guest.virtual_guest),
        has_children: Boolean(guest.has_children),
        children_count: Math.min(Math.max(1, guest.children_count || 1), Math.max(1, guest.max_guests)),
        notes: guest.notes || "",
      },
    }));
  };

  const startInlineTableEdit = (guest: GuestResponse) => {
    if (getSeatingAssignmentsForGuest(guest).length > 1) {
      openSeatingBoardForGuest(guest);
      showToast("This invitation has seating on multiple tables. Review it from the seating board.", "info");
      return;
    }
    cancelInlineGuestEdit(guest.id);
    setInlineTableEdits((prev) => ({ ...prev, [guest.id]: true }));
    setQuickTableDrafts((prev) => ({
      ...prev,
      [guest.id]: prev[guest.id] ?? getTableForGuest(guest) ?? "",
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
    if (!existingGuest) {
      showToast("Invitation could not be found.", "error");
      return;
    }
    const now = new Date().toISOString();
    const maxGuests = Math.max(1, draft.max_guests || 1);
    const confirmed =
      draft.attending === true
        ? Math.min(Math.max(1, draft.confirmed_guests || 1), maxGuests)
        : draft.attending === false
          ? 0
          : null;
    const children = draft.has_children ? Math.min(Math.max(1, draft.children_count || 1), maxGuests) : 0;
    const nextInvitationSentAt = getInvitationSentAtValue({
      nextInvitationSent: draft.invitation_sent,
      existingGuest,
      now,
    });
    const nextGuestName = draft.guest_name.trim();

    const persistInlineGuestUpdate = async (removeSeatingAfterSave: boolean) => {
      const { error: updateError } = await supabase
        .from("rsvp_list")
        .update({
          guest_name: nextGuestName,
          invite_code: draft.invite_code.trim().toUpperCase(),
          ...(isGuestPhoneAvailable ? { phone_number: formatPhoneNumberInput(draft.phone_number) || null } : {}),
          ...(isGuestEmailAvailable ? { email: draft.email.trim() || null } : {}),
          ...(isRequestContactDetailsAvailable ? { request_contact_details: draft.request_contact_details } : {}),
          max_guests: maxGuests,
          attending: draft.attending,
          confirmed_guests: confirmed,
          invitation_sent: draft.invitation_sent,
          ...(isInvitationSentAtAvailable ? { invitation_sent_at: nextInvitationSentAt } : {}),
          ...(isVirtualGuestAvailable ? { virtual_guest: draft.virtual_guest } : {}),
          has_children: draft.has_children,
          children_count: children,
          ...(isGuestNotesAvailable ? { notes: draft.notes.trim() || null } : {}),
          responded_at:
            draft.attending === null
              ? null
              : existingGuest.attending !== draft.attending || !existingGuest.responded_at
                ? now
                : existingGuest.responded_at,
          updated_at: now,
        })
        .eq("id", guestId);

      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }

      if (removeSeatingAfterSave) {
        const deleteError = await removeSeatingAssignmentsForGuest(existingGuest);
        if (deleteError) {
          showToast("Invitation updated, but seating could not be removed.", "error");
          return;
        }
      } else if (
        normalizeNameKey(existingGuest.guest_name) !== normalizeNameKey(nextGuestName) ||
        normalizeInviteCode(existingGuest.invite_code) !== normalizeInviteCode(draft.invite_code)
      ) {
        const renameError = await syncSeatingAssignmentsForGuest(existingGuest, draft.invite_code);
        if (renameError) {
          showToast("Invitation updated, but seating could not be kept in sync with the new guest details.", "error");
          return;
        }
      }

      cancelInlineGuestEdit(guestId);
      showToast("Invitation updated.", "success");
    };

    const hasSeating = getSeatingAssignmentsForGuest(existingGuest).length > 0;
    if (hasSeating && draft.attending !== true) {
      askConfirm({
        title: "Guest Still Has Seating Assigned",
        message: `${existingGuest.guest_name} still has a table assignment. You can keep it as-is, or remove it while saving this RSVP change.`,
        actionLabel: "Save & Keep Seating",
        actionTone: "default",
        onConfirm: async () => {
          await persistInlineGuestUpdate(false);
        },
        secondaryActionLabel: "Save & Remove Seating",
        secondaryActionTone: "danger",
        onSecondaryAction: async () => {
          await persistInlineGuestUpdate(true);
        },
      });
      return;
    }

    await persistInlineGuestUpdate(false);
  };

  const startInlineSeatingEdit = (assignment: SeatingAssignment) => {
    setInlineSeatingEdits((prev) => ({
      ...prev,
      [assignment.id]: {
        name: assignment.name,
        name_aliases: assignment.name_aliases || "",
        invite_code: normalizeInviteCode(assignment.invite_code),
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
    const cleanedInviteCode = normalizeInviteCode(draft.invite_code);

    if (isSeatingInviteCodeAvailable !== true) {
      showToast("Add an invite_code column to seating before editing linked table assignments.", "error");
      return;
    }

    if (!cleanedInviteCode) {
      showToast("Seating assignments must include an RSVP code.", "error");
      return;
    }

    const matchingGuestByCode = findGuestByInviteCode(cleanedInviteCode);
    if (!matchingGuestByCode) {
      showToast("No invitation matches that RSVP code yet.", "error");
      return;
    }

    const capacityCheck = getSeatingCapacityCheck({
      inviteCode: cleanedInviteCode,
      guestCount: draft.guest_count,
      editingAssignmentId: assignmentId,
    });

    if (capacityCheck?.wouldExceed) {
      showToast(
        `This would assign ${capacityCheck.totalAfterSave} seats to ${capacityCheck.linkedGuest.guest_name}, but only ${capacityCheck.allowedSeats} are allowed.`,
        "error",
      );
      return;
    }

    const { error: updateError } = await supabase
      .from("seating")
      .update({
        name: draft.name.trim(),
        ...(isSeatingAliasesAvailable ? { name_aliases: draft.name_aliases.trim() || null } : {}),
        invite_code: cleanedInviteCode,
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

  const copyInvitationToClipboard = async (guest: GuestResponse) => {
    const message = buildGuestInviteMessage(guest);

    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        const invitationImageDataUrl = await getClipboardReadyInvitationImageDataUrl();
        const html = `
          <div style="font-family: ui-serif, Georgia, serif; color: #1c1917; line-height: 1.6;">
            <img
              src="${invitationImageDataUrl}"
              alt="Omar & Hager invitation"
              style="display: block; max-width: 100%; height: auto; border-radius: 16px;"
            />
            <p style="margin: 16px 0 0 0;">${escapeClipboardHtml(message)}</p>
          </div>
        `.trim();
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([message], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
        return { mode: "rich_html" as const };
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error;
        }
      }
    }

    await navigator.clipboard.writeText(message);
    return { mode: "text" as const };
  };

  const copyInvitation = async (guest: GuestResponse) => {
    try {
      const result = await copyInvitationToClipboard(guest);
      showToast(
        result.mode === "rich_html" ? "Invitation image and text copied." : "Invitation text copied. Attach the image manually if needed.",
        result.mode === "rich_html" ? "success" : "info",
      );
    } catch (copyError) {
      showToast(copyError instanceof Error ? copyError.message : "Could not copy invitation.", "error");
    }
  };

  const openInvitationImage = () => {
    window.open(INVITATION_IMAGE_PATH, "_blank", "noopener,noreferrer");
  };

  const textGuestFromPhone = async (guest: GuestResponse) => {
    const rawPhone = guest.phone_number?.trim();
    if (!rawPhone) {
      showToast("No phone number is saved for this guest yet.", "info");
      return;
    }

    const isReminder = Boolean(guest.invitation_sent);
    const message = isReminder ? buildGuestReminderMessage(guest) : buildGuestInviteMessage(guest);

    try {
      if (isReminder) {
        await navigator.clipboard.writeText(message);
        showToast("Reminder text copied. Opening Messages now.", "success");
      } else {
        const result = await copyInvitationToClipboard(guest);
        showToast(
          result.mode === "rich_html"
            ? "Invitation image and text copied. Opening Messages now."
            : "Invitation text copied. Opening Messages now.",
          "success",
        );
      }
    } catch {
      showToast("Opening Messages now. Copy the message manually if needed.", "info");
    }

    const smsTarget = normalizePhoneForSmsLink(rawPhone);
    window.setTimeout(() => {
      window.location.href = `sms:${smsTarget}`;
    }, 120);
  };

  const beginGuestFormEdit = (guest: GuestResponse) => {
    setGuestComposerReturnLocation(
      activeView === "invitations" && invitationTab === "composer" ? null : captureWorkspaceLocation(),
    );
    setEditingGuestId(guest.id);
    setNewName(guest.guest_name);
    setNewCode(guest.invite_code);
    setNewPhoneNumber(formatPhoneNumberInput(guest.phone_number || ""));
    setNewEmail(guest.email || "");
    setRequestContactDetails(Boolean(guest.request_contact_details));
    setNewLimit(guest.max_guests);
    setAttendanceStatus(guest.attending === null ? "pending" : guest.attending ? "attending" : "declined");
    setConfirmedGuests(guest.confirmed_guests || 0);
    setInvitationSent(Boolean(guest.invitation_sent));
    setIsVirtualGuest(Boolean(guest.virtual_guest));
    setHasChildren(Boolean(guest.has_children));
    setChildrenCount(Math.min(Math.max(1, guest.children_count || 1), Math.max(1, guest.max_guests)));
    setGuestNotes(guest.notes || "");
    setActiveView("invitations");
    setInvitationTab("composer");
    scrollToSection(invitationFormRef);
  };

  const confirmRemoveGuest = (guest: GuestResponse) => {
    const hasLinkedSeating = getSeatingAssignmentsForGuest(guest).length > 0;

    askConfirm({
      title: "Remove Invitation?",
      message: hasLinkedSeating
        ? `${guest.guest_name} will be removed from the invitation list. This guest also has linked table assignments.`
        : `${guest.guest_name} will be removed from the invitation list.`,
      actionLabel: hasLinkedSeating ? "Remove Invitation & Seating" : "Remove",
      actionTone: "danger",
      onConfirm: async () => {
        const { error: deleteError } = await supabase.from("rsvp_list").delete().eq("id", guest.id);
        if (deleteError) {
          showToast(deleteError.message, "error");
          return;
        }

        if (hasLinkedSeating) {
          const seatingDeleteError = await removeSeatingAssignmentsForGuest(guest);
          if (seatingDeleteError) {
            showToast("Invitation removed, but linked seating could not be removed.", "error");
            return;
          }
          showToast("Invitation and linked seating removed.", "success");
          return;
        }

        showToast("Invitation removed.", "success");
      },
      ...(hasLinkedSeating
        ? {
            secondaryActionLabel: "Remove Invitation Only",
            onSecondaryAction: async () => {
              const { error: deleteError } = await supabase.from("rsvp_list").delete().eq("id", guest.id);
              if (deleteError) {
                showToast(deleteError.message, "error");
                return;
              }

              showToast("Invitation removed. Linked seating was kept.", "success");
            },
          }
        : {}),
    });
  };

  const beginSeatingFormEdit = (assignment: SeatingAssignment) => {
    setSeatingComposerReturnLocation(
      activeView === "seating" && seatingTab === "composer" ? null : captureWorkspaceLocation(),
    );
    setEditingSeatingId(assignment.id);
    setSeatingName(assignment.name);
    setSeatingNameAliases(assignment.name_aliases || "");
    setSeatingInviteCode(normalizeInviteCode(assignment.invite_code));
    setTableNumber(assignment.table_number);
    setSeatingGuestCount(Math.max(1, assignment.guest_count || 1));
    setActiveView("seating");
    setSeatingTab("composer");
    scrollToSection(seatingFormRef);
  };

  const beginSeatingCreateForGuest = (guest: GuestResponse, options?: { guestCount?: number | ""; tableNumber?: number | "" }) => {
    if (guest.virtual_guest === true) {
      showToast("Virtual guests do not need seating.", "info");
      return;
    }

    setSeatingComposerReturnLocation(
      activeView === "seating" && seatingTab === "composer" ? null : captureWorkspaceLocation(),
    );
    setEditingSeatingId(null);
    setSeatingName(guest.guest_name);
    setSeatingNameAliases("");
    setSeatingInviteCode(normalizeInviteCode(guest.invite_code));
    setTableNumber(options?.tableNumber ?? 1);
    setSeatingGuestCount(options?.guestCount ?? getSeatingGuestCount(guest));
    setSeatingSearch("");
    setActiveView("seating");
    setSeatingTab("composer");
    scrollToSection(seatingFormRef);
  };

  const beginSeatingPlacementForGuest = (guest: GuestResponse) => {
    const accepted = guest.attending === true ? Math.max(1, guest.confirmed_guests || 1) : getSeatingGuestCount(guest);
    const assigned = getAssignedSeatCountForGuest(guest);
    const remaining = Math.max(0, accepted - assigned);

    if (remaining > 0) {
      beginSeatingCreateForGuest(guest, { guestCount: remaining });
      return;
    }

    beginSeatingCreateForGuest(guest);
  };

  const confirmRemoveSeatingAssignment = (assignment: SeatingAssignment) => {
    askConfirm({
      title: "Remove Table Assignment?",
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

  const getSeatingAssignmentsForGuest = useCallback(
    (guest: GuestResponse) => {
      if (isSeatingInviteCodeAvailable !== true) return [];
      const guestInviteCode = normalizeInviteCode(guest.invite_code);
      if (!guestInviteCode) return [];
      return seatingAssignments.filter((assignment) => normalizeInviteCode(assignment.invite_code) === guestInviteCode);
    },
    [isSeatingInviteCodeAvailable, seatingAssignments],
  );

  const getSeatingCapacityCheck = useCallback(
    ({
      inviteCode,
      guestCount,
      editingAssignmentId,
    }: {
      inviteCode?: string | null;
      guestCount: number | "";
      editingAssignmentId?: number | null;
    }) => {
      if (!isSeatingGuestCountAvailable) return null;

      const linkedGuest = findLinkedGuestForSeating({ inviteCode });
      if (!linkedGuest) return null;

      const allowedSeats =
        linkedGuest.attending === true ? Math.max(1, linkedGuest.confirmed_guests || 1) : Math.max(1, linkedGuest.max_guests || 1);
      const requestedSeats = Math.max(1, Number(guestCount) || 1);
      const alreadyAssignedSeats = getSeatingAssignmentsForGuest(linkedGuest)
        .filter((assignment) => assignment.id !== editingAssignmentId)
        .reduce((sum, assignment) => sum + Math.max(1, assignment.guest_count || 1), 0);
      const totalAfterSave = alreadyAssignedSeats + requestedSeats;

      return {
        linkedGuest,
        allowedSeats,
        alreadyAssignedSeats,
        requestedSeats,
        totalAfterSave,
        overflow: Math.max(0, totalAfterSave - allowedSeats),
        wouldExceed: totalAfterSave > allowedSeats,
      };
    },
    [findLinkedGuestForSeating, getSeatingAssignmentsForGuest, isSeatingGuestCountAvailable],
  );

  const getAssignedSeatCountForGuest = useCallback(
    (guest: GuestResponse) => {
      const assignments = getSeatingAssignmentsForGuest(guest);
      if (assignments.length === 0) return 0;

      if (isSeatingGuestCountAvailable) {
        return assignments.reduce((sum, assignment) => sum + Math.max(1, assignment.guest_count || 1), 0);
      }

      return Math.max(1, guest.confirmed_guests || guest.max_guests || 1);
    },
    [getSeatingAssignmentsForGuest, isSeatingGuestCountAvailable],
  );

  const getTableNumbersForGuest = useCallback(
    (guest: GuestResponse) =>
      Array.from(new Set(getSeatingAssignmentsForGuest(guest).map((assignment) => assignment.table_number))).sort((left, right) => left - right),
    [getSeatingAssignmentsForGuest],
  );

  const getTableLabelForGuest = useCallback(
    (guest: GuestResponse) => {
      const tableNumbers = getTableNumbersForGuest(guest);
      if (tableNumbers.length === 0) return null;
      if (tableNumbers.length === 1) return `Table ${tableNumbers[0]}`;
      return `Tables ${tableNumbers.join(", ")}`;
    },
    [getTableNumbersForGuest],
  );

  const removeSeatingAssignmentsForGuest = useCallback(
    async (guest: GuestResponse) => {
      const matchingAssignments = getSeatingAssignmentsForGuest(guest);
      if (matchingAssignments.length === 0) return null;

      const { error: deleteError } = await supabase
        .from("seating")
        .delete()
        .in(
          "id",
          matchingAssignments.map((assignment) => assignment.id),
        );

      return deleteError;
    },
    [getSeatingAssignmentsForGuest],
  );

  const syncSeatingAssignmentsForGuest = useCallback(
    async (guest: GuestResponse, nextInviteCode: string) => {
      const matchingAssignments = getSeatingAssignmentsForGuest(guest);
      if (matchingAssignments.length === 0) return null;

      const { error: syncError } = await supabase
        .from("seating")
        .update({
          ...(isSeatingInviteCodeAvailable ? { invite_code: normalizeInviteCode(nextInviteCode) || null } : {}),
        })
        .in(
          "id",
          matchingAssignments.map((assignment) => assignment.id),
        );

      return syncError;
    },
    [getSeatingAssignmentsForGuest, isSeatingInviteCodeAvailable],
  );

  const openSeatingBoardForGuest = useCallback(
    (guest: GuestResponse) => {
      const guestTables = getTableNumbersForGuest(guest);
      setActiveView("seating");
      setSeatingTab("board");
      if (guestTables.length > 1) {
        setSeatingBoardMode("invites");
      }
      setSeatingTableFilter(guestTables.length > 0 ? guestTables : "all");
      setSeatingSearch(normalizeInviteCode(guest.invite_code));
    },
    [getTableNumbersForGuest],
  );

  const updateSetting = async (key: string, nextValue: boolean, successMessage: string) => {
    const { error: updateError } = await supabase.from("settings").update({ value: String(nextValue) }).eq("key", key);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    if (key === "is_seating_chart_enabled") setIsSeatingChartEnabled(nextValue);
    if (key === "is_gallery_enabled") setIsGalleryEnabled(nextValue);
    if (key === "is_gallery_feed_enabled") setIsGalleryFeedEnabled(nextValue);
    if (key === "is_livestream_enabled") setIsLivestreamEnabled(nextValue);
    if (key === "is_home_venue_enabled") setIsHomeVenueEnabled(nextValue);
    if (key === "is_home_carousel_enabled") setIsHomeCarouselEnabled(nextValue);
    if (key === "is_home_dress_code_enabled") setIsHomeDressCodeEnabled(nextValue);

    showToast(successMessage, "success");
  };

  const updateTextSetting = async (key: string, nextValue: string, successMessage: string) => {
    const { error: updateError } = await supabase.from("settings").update({ value: nextValue }).eq("key", key);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    if (key === "livestream_embed_url") setLivestreamEmbedUrl(nextValue);
    showToast(successMessage, "success");
  };

  const getTableForGuest = useCallback(
    (guest: GuestResponse) => {
      const tableNumbers = getTableNumbersForGuest(guest);
      return tableNumbers[0];
    },
    [getTableNumbersForGuest],
  );

  const acceptedGuestsNeedingSeating = useMemo(() => {
    return responses
      .filter((guest) => guest.attending === true && guest.virtual_guest !== true)
      .flatMap((guest) => {
        const assignments = getSeatingAssignmentsForGuest(guest);
        const assignment = assignments[0];
        const accepted = Math.max(1, guest.confirmed_guests || 1);
        const assigned = getAssignedSeatCountForGuest(guest);
        const remaining = Math.max(0, accepted - assigned);
        const tableNumbers = Array.from(new Set(assignments.map((item) => item.table_number))).sort((left, right) => left - right);

        if (remaining === 0) return [];

        const item: {
          guest: GuestResponse;
          assignments: SeatingAssignment[];
          assignment: SeatingAssignment | undefined;
          accepted: number;
          assigned: number;
          remaining: number;
          tableNumbers: number[];
        } = {
          guest,
          assignments,
          assignment,
          accepted,
          assigned,
          remaining,
          tableNumbers,
        };

        return [item];
      });
  }, [getAssignedSeatCountForGuest, getSeatingAssignmentsForGuest, responses]);

  const guestsNeedingSeatingKeys = useMemo(
    () => new Set(acceptedGuestsNeedingSeating.map(({ guest }) => normalizeNameKey(guest.guest_name))),
    [acceptedGuestsNeedingSeating],
  );

  const seatedPendingOrDeclinedGuests = useMemo(() => {
    return responses
      .filter((guest) => guest.attending !== true && guest.virtual_guest !== true)
      .flatMap((guest) => {
        const assignments = getSeatingAssignmentsForGuest(guest);
        const assignment = assignments[0];
        if (!assignment) return [];

        const item: {
          guest: GuestResponse;
          assignments: SeatingAssignment[];
          assignment: SeatingAssignment;
          assigned: number;
          tableNumbers: number[];
        } = {
          guest,
          assignments,
          assignment,
          assigned: getAssignedSeatCountForGuest(guest),
          tableNumbers: Array.from(new Set(assignments.map((item) => item.table_number))).sort((left, right) => left - right),
        };

        return [item];
      });
  }, [getAssignedSeatCountForGuest, getSeatingAssignmentsForGuest, responses]);

  const seatedPendingOrDeclinedKeys = useMemo(
    () => new Set(seatedPendingOrDeclinedGuests.map(({ guest }) => normalizeNameKey(guest.guest_name))),
    [seatedPendingOrDeclinedGuests],
  );

  const acceptedSeatOverages = useMemo(() => {
    return responses
      .filter((guest) => guest.attending === true && guest.virtual_guest !== true)
      .flatMap((guest) => {
        const assignments = getSeatingAssignmentsForGuest(guest);
        const assignment = assignments[0];
        if (!assignment) return [];

        const accepted = Math.max(1, guest.confirmed_guests || 1);
        const assigned = getAssignedSeatCountForGuest(guest);
        if (assigned <= accepted) return [];

        const item: {
          guest: GuestResponse;
          assignments: SeatingAssignment[];
          assignment: SeatingAssignment;
          accepted: number;
          assigned: number;
          overflow: number;
          tableNumbers: number[];
        } = {
          guest,
          assignments,
          assignment,
          accepted,
          assigned,
          overflow: assigned - accepted,
          tableNumbers: Array.from(new Set(assignments.map((item) => item.table_number))).sort((left, right) => left - right),
        };

        return [item];
      });
  }, [getAssignedSeatCountForGuest, getSeatingAssignmentsForGuest, responses]);

  const acceptedSeatOverageKeys = useMemo(
    () => new Set(acceptedSeatOverages.map(({ guest }) => normalizeNameKey(guest.guest_name))),
    [acceptedSeatOverages],
  );

  const guestCountIntegrityIssues = useMemo(() => {
    return responses.filter((guest) => {
      const confirmedTooHigh = typeof guest.confirmed_guests === "number" && guest.confirmed_guests > guest.max_guests;
      const childrenTooHigh = typeof guest.children_count === "number" && guest.children_count > guest.max_guests;
      return confirmedTooHigh || childrenTooHigh;
    });
  }, [responses]);

  const guestCountIntegrityIssueKeys = useMemo(
    () => new Set(guestCountIntegrityIssues.map((guest) => normalizeNameKey(guest.guest_name))),
    [guestCountIntegrityIssues],
  );

  const seatingWithoutMatchingInvite = useMemo(
    () =>
      seatingAssignments.filter((assignment) => {
        const assignmentInviteCode = normalizeInviteCode(assignment.invite_code);
        if (!assignmentInviteCode) return true;
        return !responses.some((guest) => normalizeInviteCode(guest.invite_code) === assignmentInviteCode);
      }),
    [responses, seatingAssignments],
  );

  const integrityIssueCount =
    acceptedGuestsNeedingSeating.length +
    seatedPendingOrDeclinedGuests.length +
    acceptedSeatOverages.length +
    guestCountIntegrityIssues.length +
    seatingWithoutMatchingInvite.length;

  const toggleGuestStatusFilter = (filter: GuestStatusFilter) => {
    setGuestStatusFilters((prev) =>
      prev.includes(filter) ? prev.filter((value) => value !== filter) : [...prev, filter],
    );
  };

  const toggleGuestExtraFilter = (filter: GuestExtraFilter) => {
    setGuestExtraFilters((prev) => {
      if (prev.includes(filter)) {
        return prev.filter((value) => value !== filter);
      }

      let next = [...prev];
      if (filter === "sent") {
        next = next.filter((value) => value !== "not_sent");
      }
      if (filter === "not_sent") {
        next = next.filter((value) => value !== "sent" && value !== "sent_awaiting_response");
      }
      if (filter === "sent_awaiting_response") {
        next = next.filter((value) => value !== "not_sent");
      }

      next.push(filter);
      return next;
    });
  };

  const clearGuestStatusFilters = () => setGuestStatusFilters([]);
  const clearGuestExtraFilters = () => setGuestExtraFilters([]);

  const stats = useMemo(() => {
    const physicalResponses = responses.filter((guest) => guest.virtual_guest !== true);
    const virtualResponses = responses.filter((guest) => guest.virtual_guest === true);
    const sentInvitations = physicalResponses.filter((guest) => guest.invitation_sent === true).length;
    const pendingInvitations = physicalResponses.filter((guest) => guest.invitation_sent !== true).length;
    const awaitingResponse = physicalResponses.filter((guest) => guest.attending === null).length;
    const declinedInvitations = physicalResponses.filter((guest) => guest.attending === false).length;
    const acceptedGuests = physicalResponses.reduce(
      (sum, guest) => sum + (guest.attending === true ? guest.confirmed_guests || 0 : 0),
      0,
    );
    const acceptedGuestsSeated = physicalResponses.reduce((sum, guest) => {
      if (guest.attending !== true) return sum;
      const confirmed = Math.max(1, guest.confirmed_guests || 1);
      const seatedCount = getAssignedSeatCountForGuest(guest);
      return sum + Math.min(confirmed, seatedCount);
    }, 0);
    const totalInvitedGuests = physicalResponses.reduce((sum, guest) => sum + (guest.max_guests || 0), 0);
    const virtualAccepted = virtualResponses.filter((guest) => guest.attending === true).length;
    const virtualDeclined = virtualResponses.filter((guest) => guest.attending === false).length;
    const virtualAwaiting = virtualResponses.filter((guest) => guest.attending === null).length;
    const uniqueTables = new Set(seatingAssignments.map((assignment) => assignment.table_number)).size;
    return {
      totalInvitations: physicalResponses.length,
      totalInvitedGuests,
      virtualInvitations: virtualResponses.length,
      virtualAccepted,
      virtualDeclined,
      virtualAwaiting,
      sentInvitations,
      pendingInvitations,
      awaitingResponse,
      declinedInvitations,
      acceptedGuests,
      acceptedGuestsSeated,
      acceptedNeedingSeating: acceptedGuestsNeedingSeating.length,
      uniqueTables,
    };
  }, [acceptedGuestsNeedingSeating.length, getAssignedSeatCountForGuest, responses, seatingAssignments]);

  const filteredResponses = useMemo(() => {
    const query = deferredGuestSearch.trim().toLowerCase();

    const byQuery = query
      ? responses.filter((guest) =>
          [guest.guest_name, guest.invite_code].some((value) => value.toLowerCase().includes(query)),
        )
      : responses;

    const byStatus = byQuery.filter((guest) => {
      if (guestStatusFilters.length === 0) return true;

      return guestStatusFilters.some((filter) => {
        if (filter === "pending") return guest.attending === null;
        if (filter === "attending") return guest.attending === true;
        return guest.attending === false;
      });
    });

    const byExtraFilter = byStatus.filter((guest) => {
      if (guestExtraFilters.length === 0) return true;

      return guestExtraFilters.every((filter) => {
        if (filter === "sent") return guest.invitation_sent === true;
        if (filter === "not_sent") return guest.invitation_sent !== true;
        if (filter === "has_children") return guest.has_children === true;
        if (filter === "sent_awaiting_response") return guest.invitation_sent === true && guest.attending === null;
        if (filter === "virtual") return guest.virtual_guest === true;
        return guestsNeedingSeatingKeys.has(normalizeNameKey(guest.guest_name));
      });
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
  }, [deferredGuestSearch, guestExtraFilters, guestSort, guestStatusFilters, guestsNeedingSeatingKeys, responses]);

  const filteredInvitationStats = useMemo(() => {
    const physicalResponses = filteredResponses.filter((guest) => guest.virtual_guest !== true);
    const virtualResponses = filteredResponses.filter((guest) => guest.virtual_guest === true);
    const acceptedGuests = physicalResponses.reduce(
      (sum, guest) => sum + (guest.attending === true ? guest.confirmed_guests || 0 : 0),
      0,
    );
    const invitedGuests = physicalResponses.reduce((sum, guest) => sum + (guest.max_guests || 0), 0);
    const awaiting = physicalResponses.filter((guest) => guest.attending === null).length;
    const declined = physicalResponses.filter((guest) => guest.attending === false).length;
    const needsSeating = physicalResponses.filter((guest) => guestsNeedingSeatingKeys.has(normalizeNameKey(guest.guest_name))).length;
    const virtualAccepted = virtualResponses.filter((guest) => guest.attending === true).length;
    const virtualDeclined = virtualResponses.filter((guest) => guest.attending === false).length;
    const virtualAwaiting = virtualResponses.filter((guest) => guest.attending === null).length;

    return {
      invitations: physicalResponses.length,
      acceptedGuests,
      invitedGuests,
      awaiting,
      declined,
      needsSeating,
      virtual: virtualResponses.length,
      virtualAccepted,
      virtualDeclined,
      virtualAwaiting,
    };
  }, [filteredResponses, guestsNeedingSeatingKeys]);

  const filteredSeatingAssignments = useMemo(() => {
    const query = deferredSeatingSearch.trim().toLowerCase();
    const byQuery = query
      ? seatingAssignments.filter(
          (assignment) => {
            const linkedGuestName =
              findLinkedGuestForSeating({
                inviteCode: assignment.invite_code,
              })?.guest_name.toLowerCase() || "";

            return (
              assignment.name.toLowerCase().includes(query) ||
              linkedGuestName.includes(query) ||
              parseNameAliases(assignment.name_aliases).some((alias) => alias.toLowerCase().includes(query)) ||
              normalizeInviteCode(assignment.invite_code).toLowerCase().includes(query) ||
              String(assignment.table_number).includes(query)
            );
          },
        )
      : seatingAssignments;

    const byTable =
      seatingTableFilter === "all"
        ? byQuery
        : byQuery.filter((assignment) => seatingTableFilter.includes(assignment.table_number));

    return [...byTable].sort((left, right) =>
      seatingSort === "name"
        ? left.name.localeCompare(right.name)
        : left.table_number - right.table_number || left.name.localeCompare(right.name),
    );
  }, [deferredSeatingSearch, findLinkedGuestForSeating, seatingAssignments, seatingSort, seatingTableFilter]);

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

  const groupedSeatingAssignments = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        inviteCode: string | null;
        linkedGuest: GuestResponse | null;
        displayName: string;
        assignments: SeatingAssignment[];
        tableNumbers: number[];
        assignedSeats: number;
      }
    >();

    filteredSeatingAssignments.forEach((assignment) => {
      const inviteCode = normalizeInviteCode(assignment.invite_code) || null;
      const key = inviteCode ? `invite:${inviteCode}` : `unlinked:${assignment.id}`;
      const existing = grouped.get(key);
      const linkedGuest =
        existing?.linkedGuest ||
        findLinkedGuestForSeating({
          inviteCode,
        });
      const nextAssignments = [...(existing?.assignments || []), assignment];
      const nextTableNumbers = Array.from(new Set(nextAssignments.map((item) => item.table_number))).sort((left, right) => left - right);
      const assignedSeats = nextAssignments.reduce((sum, item) => sum + Math.max(1, item.guest_count || 1), 0);

      grouped.set(key, {
        key,
        inviteCode,
        linkedGuest,
        displayName: linkedGuest?.guest_name || assignment.name,
        assignments: nextAssignments.sort((left, right) => left.table_number - right.table_number || left.name.localeCompare(right.name)),
        tableNumbers: nextTableNumbers,
        assignedSeats,
      });
    });

    return Array.from(grouped.values()).sort((left, right) => {
      const leftPrimaryTable = left.tableNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      const rightPrimaryTable = right.tableNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      return leftPrimaryTable - rightPrimaryTable || left.displayName.localeCompare(right.displayName);
    });
  }, [filteredSeatingAssignments, findLinkedGuestForSeating]);

  const selectedSeatingTableNumbers = useMemo(
    () => (seatingTableFilter === "all" ? [] : seatingTableFilter),
    [seatingTableFilter],
  );

  const isSeatingTableSelected = useCallback(
    (table: number) => seatingTableFilter !== "all" && seatingTableFilter.includes(table),
    [seatingTableFilter],
  );

  const toggleSeatingTableFilter = useCallback((table: number) => {
    setSeatingTableFilter((prev) => {
      if (prev === "all") return [table];
      if (prev.includes(table)) {
        const next = prev.filter((value) => value !== table);
        return next.length === 0 ? "all" : next;
      }
      return [...prev, table].sort((left, right) => left - right);
    });
  }, []);

  useEffect(() => {
    if (availableTableNumbers.length === 0) {
      setSeatingTableFilter("all");
      setTableMoveFrom("");
      setTableMoveTo("");
      return;
    }

    setSeatingTableFilter((prev) => {
      if (prev === "all") return prev;
      const next = prev.filter((table) => availableTableNumbers.includes(table));
      return next.length === 0 ? "all" : next;
    });

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

  const followUpGuests = useMemo(() => {
    const sentBeforeTimestamp =
      followUpSentBefore.trim().length > 0
        ? new Date(`${followUpSentBefore}T23:59:59`).getTime()
        : null;

    return responses
      .filter((guest) => guest.invitation_sent === true && guest.attending === null)
      .filter((guest) => {
        if (sentBeforeTimestamp === null) return true;
        if (!guest.invitation_sent_at) return false;
        const sentAt = new Date(guest.invitation_sent_at).getTime();
        return !Number.isNaN(sentAt) && sentAt <= sentBeforeTimestamp;
      })
      .sort((left, right) => {
        const leftSentAt = left.invitation_sent_at ? new Date(left.invitation_sent_at).getTime() : 0;
        const rightSentAt = right.invitation_sent_at ? new Date(right.invitation_sent_at).getTime() : 0;
        return leftSentAt - rightSentAt || left.guest_name.localeCompare(right.guest_name);
      });
  }, [followUpSentBefore, responses]);

  const seatingComposerCapacityCheck = getSeatingCapacityCheck({
    inviteCode: seatingInviteCode,
    guestCount: seatingGuestCount,
    editingAssignmentId: editingSeatingId,
  });

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
    if (guest.virtual_guest === true) {
      showToast("Virtual guests do not need seating.", "info");
      return;
    }

    if (isSeatingInviteCodeAvailable !== true) {
      showToast("Add an invite_code column to seating before assigning tables.", "error");
      return;
    }

    const guestInviteCode = normalizeInviteCode(guest.invite_code);
    if (!guestInviteCode) {
      showToast("This invitation needs an RSVP code before it can be seated.", "error");
      return;
    }

    const matchingAssignments = getSeatingAssignmentsForGuest(guest);
    if (matchingAssignments.length > 1) {
      openSeatingBoardForGuest(guest);
      showToast("This invitation has multiple table assignments. Update it from the seating board.", "info");
      return;
    }

    const assignmentPayload = {
      invite_code: guestInviteCode,
      table_number: Math.max(1, nextTableNumber),
    };
    const existingAssignment = matchingAssignments[0];

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
    const matchingAssignments = getSeatingAssignmentsForGuest(guest);
    if (matchingAssignments.length === 0) {
      showToast(`${guest.guest_name} does not have a table assignment yet.`, "info");
      return;
    }

    const { error: deleteError } = await supabase
      .from("seating")
      .delete()
      .in(
        "id",
        matchingAssignments.map((assignment) => assignment.id),
      );
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

    await bulkMarkGuestsAsSent(selectedGuestIds);
    setSelectedGuestIds([]);
  };

  const bulkMarkGuestsAsSent = async (guestIds: string[]) => {
    if (guestIds.length === 0) return;

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("rsvp_list")
      .update({
        invitation_sent: true,
        ...(isInvitationSentAtAvailable ? { invitation_sent_at: now } : {}),
        updated_at: now,
      })
      .in("id", guestIds);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    showToast(`${guestIds.length} invitation${guestIds.length === 1 ? "" : "s"} marked sent.`, "success");
  };

  const bulkMarkSelectedAsNotSent = async () => {
    if (selectedGuestIds.length === 0) return;

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("rsvp_list")
      .update({
        invitation_sent: false,
        ...(isInvitationSentAtAvailable ? { invitation_sent_at: null } : {}),
        updated_at: now,
      })
      .in("id", selectedGuestIds);

    if (updateError) {
      showToast(updateError.message, "error");
      return;
    }

    showToast(`${selectedGuestIds.length} invitation${selectedGuestIds.length === 1 ? "" : "s"} marked not sent.`, "success");
    setSelectedGuestIds([]);
  };

  const copySelectedInviteLinks = async () => {
    if (selectedGuests.length === 0) return;

    const links = selectedGuests.map((guest) => getGuestInviteUrl(guest)).join("\n");

    try {
      await navigator.clipboard.writeText(links);
      showToast(`${selectedGuests.length} RSVP link${selectedGuests.length === 1 ? "" : "s"} copied.`, "success");
    } catch (copyError) {
      showToast(copyError instanceof Error ? copyError.message : "Could not copy RSVP links.", "error");
    }
  };

  const copySelectedInvitations = async () => {
    if (selectedGuests.length === 0) return;

    const invitations = selectedGuests.map((guest) => buildGuestInviteMessage(guest)).join("\n\n");

    try {
      await navigator.clipboard.writeText(invitations);
      showToast(`${selectedGuests.length} invitation message${selectedGuests.length === 1 ? "" : "s"} copied.`, "success");
    } catch (copyError) {
      showToast(copyError instanceof Error ? copyError.message : "Could not copy invitation messages.", "error");
    }
  };

  const bulkResetSelectedRsvpToPending = async () => {
    if (selectedGuestIds.length === 0) return;

    const seatedSelectedGuests = selectedGuests.filter((guest) => getSeatingAssignmentsForGuest(guest).length > 0);
    const resetSelectedRsvps = async (removeSeatingAfterSave: boolean) => {
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("rsvp_list")
        .update({
          attending: null,
          confirmed_guests: null,
          responded_at: null,
          updated_at: now,
        })
        .in("id", selectedGuestIds);

      if (updateError) {
        showToast(updateError.message, "error");
        return;
      }

      if (removeSeatingAfterSave && seatedSelectedGuests.length > 0) {
        const seatingDeleteError = await supabase
          .from("seating")
          .delete()
          .in(
            "id",
            Array.from(
              new Map(
                seatedSelectedGuests
                  .flatMap((guest) => getSeatingAssignmentsForGuest(guest))
                  .map((assignment) => [assignment.id, assignment]),
              ).values(),
            ).map((assignment) => assignment.id),
          );

        if (seatingDeleteError.error) {
          showToast("RSVPs were reset, but seating could not be removed.", "error");
          return;
        }

        showToast(
          `${selectedGuestIds.length} RSVP${selectedGuestIds.length === 1 ? "" : "s"} reset to pending and seating removed.`,
          "success",
        );
      } else {
        showToast(
          `${selectedGuestIds.length} RSVP${selectedGuestIds.length === 1 ? "" : "s"} reset to pending.`,
          "success",
        );
      }

      setSelectedGuestIds([]);
    };

    if (seatedSelectedGuests.length > 0) {
      askConfirm({
        title: "Selected Invitations Still Have Seats Assigned",
        message: `${seatedSelectedGuests.length} selected invitation${seatedSelectedGuests.length === 1 ? "" : "s"} still has assigned seats. You can reset their RSVP to pending and keep those seats, or remove those table assignments too.`,
        actionLabel: "Reset & Keep Seating",
        actionTone: "default",
        onConfirm: async () => {
          await resetSelectedRsvps(false);
        },
        secondaryActionLabel: "Reset & Remove Seating",
        secondaryActionTone: "danger",
        onSecondaryAction: async () => {
          await resetSelectedRsvps(true);
        },
      });
      return;
    }

    await resetSelectedRsvps(false);
  };

  const bulkAssignSelectedToTable = async () => {
    if (selectedGuests.length === 0) return;
    if (isSeatingInviteCodeAvailable !== true) {
      showToast("Add an invite_code column to seating before assigning tables.", "error");
      return;
    }

    const physicalSelectedGuests = selectedGuests.filter((guest) => guest.virtual_guest !== true);
    if (physicalSelectedGuests.length === 0) {
      showToast("Virtual guests do not need seating.", "info");
      return;
    }

    const nextTableNumber = Math.max(1, Number(bulkTableNumber) || 1);

    for (const guest of physicalSelectedGuests) {
      const guestInviteCode = normalizeInviteCode(guest.invite_code);
      if (!guestInviteCode) {
        showToast(`${guest.guest_name} needs an RSVP code before they can be seated.`, "error");
        return;
      }

      const existingAssignments = getSeatingAssignmentsForGuest(guest);
      const existingAssignment = existingAssignments[0];

      if (existingAssignment) {
        const { error: updateError } = await supabase
          .from("seating")
          .update({
            invite_code: guestInviteCode,
            table_number: nextTableNumber,
          })
          .in(
            "id",
            existingAssignments.map((assignment) => assignment.id),
          );

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
              invite_code: guestInviteCode,
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

    const assignedSeatCount = physicalSelectedGuests.reduce((sum, guest) => sum + getSeatingGuestCount(guest), 0);
    const skippedVirtualCount = selectedGuests.length - physicalSelectedGuests.length;
    showToast(
      `${physicalSelectedGuests.length} guest${physicalSelectedGuests.length === 1 ? "" : "s"} (${assignedSeatCount} seat${assignedSeatCount === 1 ? "" : "s"}) assigned to table ${nextTableNumber}.${skippedVirtualCount > 0 ? ` ${skippedVirtualCount} virtual skipped.` : ""}`,
      "success",
    );
    setSelectedGuestIds([]);
  };

  const bulkRemoveSelectedSeating = async () => {
    if (selectedGuests.length === 0) return;

    const assignmentsToRemove = Array.from(
      new Map(
        selectedGuests
          .flatMap((guest) => getSeatingAssignmentsForGuest(guest))
          .map((assignment) => [assignment.id, assignment]),
      ).values(),
    );

    if (assignmentsToRemove.length === 0) {
      showToast("None of the selected invitations currently have assigned seats.", "info");
      return;
    }
    const invitationsAffected = selectedGuests.filter((guest) => getSeatingAssignmentsForGuest(guest).length > 0).length;
    const totalSeatsAffected = assignmentsToRemove.reduce((sum, assignment) => sum + Math.max(1, assignment.guest_count || 1), 0);

    askConfirm({
      title: "Remove Selected Seating?",
      message: `This will remove seats for ${invitationsAffected} invitation${invitationsAffected === 1 ? "" : "s"} across ${assignmentsToRemove.length} table assignment${
        assignmentsToRemove.length === 1 ? "" : "s"
      }, covering ${totalSeatsAffected} seat${totalSeatsAffected === 1 ? "" : "s"}.`,
      actionLabel: "Remove Seating",
      actionTone: "danger",
      onConfirm: async () => {
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
          `Removed seats for ${invitationsAffected} invitation${invitationsAffected === 1 ? "" : "s"}.`,
          "success",
        );
        setSelectedGuestIds([]);
      },
    });
  };

  const exportInvitationCsv = () => {
    const headers = [
      "guest_name",
      "invite_code",
      ...(isGuestPhoneAvailable ? ["phone_number"] : []),
      ...(isGuestEmailAvailable ? ["email"] : []),
      ...(isRequestContactDetailsAvailable ? ["request_contact_details"] : []),
      "max_guests",
      "confirmed_guests",
      "attending",
      "invitation_sent",
      "invitation_sent_at",
      "virtual_guest",
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
      const matchingAssignments = getSeatingAssignmentsForGuest(guest);
      const tableNumber = Array.from(new Set(matchingAssignments.map((assignment) => assignment.table_number)))
        .sort((left, right) => left - right)
        .join(", ");
      return [
        guest.guest_name,
        guest.invite_code,
        ...(isGuestPhoneAvailable ? [guest.phone_number ?? ""] : []),
        ...(isGuestEmailAvailable ? [guest.email ?? ""] : []),
        ...(isRequestContactDetailsAvailable ? [Boolean(guest.request_contact_details)] : []),
        guest.max_guests,
        guest.confirmed_guests ?? "",
        guest.attending === null ? "pending" : guest.attending ? "attending" : "declined",
        Boolean(guest.invitation_sent),
        guest.invitation_sent_at ?? "",
        Boolean(guest.virtual_guest),
        Boolean(guest.has_children),
        guest.children_count ?? "",
        guest.responded_at ?? "",
        guest.updated_at ?? "",
        guest.created_at ?? "",
        tableNumber,
        matchingAssignments.length > 0 ? getAssignedSeatCountForGuest(guest) : "",
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
      message: `This will move ${assignmentsToMove.length} table assignment${assignmentsToMove.length === 1 ? "" : "s"} covering ${seatTotal} seat${seatTotal === 1 ? "" : "s"} to table ${targetTable}.`,
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

        setSeatingTableFilter([targetTable]);
        setSeatingTab("board");
        showToast(
          `Moved ${assignmentsToMove.length} table assignment${assignmentsToMove.length === 1 ? "" : "s"} from table ${sourceTable} to table ${targetTable}.`,
          "success",
        );
      },
    });
  };

  const swapTables = async () => {
    if (tableMoveFrom === "" || tableMoveTo === "") return;

    const firstTable = Number(tableMoveFrom);
    const secondTable = Number(tableMoveTo);

    if (firstTable === secondTable) {
      showToast("Choose two different tables to swap.", "info");
      return;
    }

    const firstAssignments = seatingAssignments.filter((assignment) => assignment.table_number === firstTable);
    const secondAssignments = seatingAssignments.filter((assignment) => assignment.table_number === secondTable);

    if (firstAssignments.length === 0 || secondAssignments.length === 0) {
      showToast("Both tables need guests before they can be swapped.", "info");
      return;
    }

    const firstSeatTotal = firstAssignments.reduce((sum, assignment) => sum + Math.max(1, assignment.guest_count || 1), 0);
    const secondSeatTotal = secondAssignments.reduce((sum, assignment) => sum + Math.max(1, assignment.guest_count || 1), 0);

    askConfirm({
      title: `Swap Tables ${firstTable} And ${secondTable}?`,
      message: `This will move table ${firstTable}'s ${firstSeatTotal} seat${firstSeatTotal === 1 ? "" : "s"} to table ${secondTable}, and table ${secondTable}'s ${secondSeatTotal} seat${secondSeatTotal === 1 ? "" : "s"} to table ${firstTable}.`,
      actionLabel: "Swap Tables",
      onConfirm: async () => {
        const { error: firstStepError } = await supabase
          .from("seating")
          .update({ table_number: secondTable })
          .in(
            "id",
            firstAssignments.map((assignment) => assignment.id),
          );

        if (firstStepError) {
          showToast(firstStepError.message, "error");
          return;
        }

        const { error: secondStepError } = await supabase
          .from("seating")
          .update({ table_number: firstTable })
          .in(
            "id",
            secondAssignments.map((assignment) => assignment.id),
          );

        if (secondStepError) {
          showToast(secondStepError.message, "error");
          return;
        }

        setSeatingTableFilter([firstTable, secondTable]);
        setSeatingTab("board");
        showToast(`Swapped tables ${firstTable} and ${secondTable}.`, "success");
      },
    });
  };

  if (isCheckingSession) {
    return (
      <div className="wedding-shell flex items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.72),_transparent_50%)]" />
        <div className="relative z-10 w-full max-w-sm rounded-[34px] border border-white/70 bg-white/88 px-8 py-10 text-center shadow-xl">
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
          className="relative z-10 w-full max-w-xl overflow-hidden rounded-[40px] border border-white/75 bg-white/88 px-8 py-10 text-center shadow-xl md:px-12 md:py-14"
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
              Manage invitations, seating, RSVPs, and live wedding controls.
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
    <div className="min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,_#d6e3f1_0%,_#e8eef5_42%,_#f5f7fa_100%)] text-stone-900">
      <div className="mx-auto max-w-[1500px] px-3 py-3 md:px-5 md:py-5">
        <header className="rounded-[28px] border border-white/85 bg-white/92 p-4 text-stone-900 shadow-sm md:rounded-[34px] md:p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-stone-200 bg-stone-50 md:h-16 md:w-16">
                    <Image src="/logo.png" alt="Omar & Hager logo" width={64} height={64} className="wedding-logo w-10 md:w-12" />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.26em] text-stone-400">Omar & Hager 2026</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="font-serif text-3xl tracking-tight text-stone-900 md:text-4xl">Admin Studio</h1>
                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">
                        Pro
                      </span>
                      <DatabaseEnvironmentBadge />
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-500">
                      Manage invitations, seating, RSVPs, and live wedding controls.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openInvitationImage}
                className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-700 transition hover:bg-white"
              >
                Open Invitation Image
              </button>
              <button
                type="button"
                onClick={exportInvitationCsv}
                className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-700 transition hover:bg-white"
              >
                Export CSV
              </button>
            </div>
          </div>
        </header>

        <div className="mt-3">
          <WorkspaceTabs
            tabs={[
              { key: "overview", label: "Overview" },
              { key: "invitations", label: "Guests" },
              { key: "seating", label: "Seating" },
              { key: "settings", label: "Settings" },
            ]}
            activeTab={activeView}
            onChange={(nextTab) => setActiveView(nextTab as AdminView)}
          />
        </div>

        <main className="mt-4 min-w-0 space-y-4 pb-8 md:space-y-5">
            {activeView === "overview" && (
              <div className="space-y-5">
                <WorkspaceTabs
                  tabs={[
                    { key: "summary", label: "Overview" },
                    { key: "follow_up", label: "Follow Up" },
                    { key: "needs_seating", label: `Seats Needed (${stats.acceptedNeedingSeating})` },
                    { key: "activity", label: "Recent Activity" },
                    { key: "checks", label: `Checks (${integrityIssueCount})` },
                  ]}
                  activeTab={overviewTab}
                  onChange={(nextTab) => setOverviewTab(nextTab as OverviewWorkspaceTab)}
                />

                {overviewTab === "summary" && (
                  <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                    <StudioPanel>
                      <SectionHeading
                        kicker="Overview"
                        title="Overview"
                        description="In-person and virtual RSVP numbers are separated so seating work stays focused on guests attending in person."
                      />
                      <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        <MetricGroup title="On-Site">
                          <StatTile label="Invitations Total" value={stats.totalInvitations} tone="stone" />
                          <StatTile label="Invitations Sent" value={stats.sentInvitations} tone="sky" />
                          <StatTile label="Invitations Not Sent" value={stats.pendingInvitations} tone="stone" />
                          <StatTile label="Invitations Awaiting Reply" value={stats.awaitingResponse} tone="stone" />
                          <StatTile label="Guests Attending" value={stats.acceptedGuests} tone="emerald" />
                          <StatTile label="Invitations Declined" value={stats.declinedInvitations} tone="rose" />
                          <StatTile label="Guests Invited" value={stats.totalInvitedGuests} tone="stone" />
                          <StatTile label="Seats Needed" value={stats.acceptedNeedingSeating} tone="amber" />
                        </MetricGroup>

                        <MetricGroup title="Virtual">
                          <StatTile label="Invitations Total" value={stats.virtualInvitations} tone="sky" />
                          <StatTile label="Invitations Attending" value={stats.virtualAccepted} tone="emerald" />
                          <StatTile label="Invitations Declined" value={stats.virtualDeclined} tone="rose" />
                          <StatTile label="Invitations Awaiting Reply" value={stats.virtualAwaiting} tone="stone" />
                        </MetricGroup>
                      </div>
                    </StudioPanel>

                    <StudioPanel>
                      <SectionHeading
                        kicker="Progress"
                        title="Progress"
                        description="A quick read on invitation sending, guest headcount, and seat coverage."
                      />
                      <div className="mt-5 space-y-4">
                        <ProgressLine label="On-Site Invitations Sent" value={stats.sentInvitations} total={stats.totalInvitations} tone="sky" />
                        <ProgressLine
                          label="On-Site RSVP Replies Received"
                          value={stats.totalInvitations - stats.awaitingResponse}
                          total={stats.totalInvitations}
                          tone="stone"
                        />
                        <ProgressLine label="On-Site Guests Attending" value={stats.acceptedGuests} total={stats.totalInvitedGuests} tone="emerald" />
                        <ProgressLine
                          label="On-Site Guests Seated"
                          value={stats.acceptedGuestsSeated}
                          total={Math.max(stats.acceptedGuests, 1)}
                          tone="amber"
                        />
                      </div>
                    </StudioPanel>
                  </div>
                )}

                {overviewTab === "follow_up" && (
                  <StudioPanel>
                    <SectionHeading
                      kicker="Follow Up"
                      title="Sent But Still Awaiting Reply"
                      description="Review invitations that have been sent but have not been answered yet."
                    />

                    <div className="mt-5 grid min-w-0 gap-3 rounded-[22px] border border-stone-100 bg-stone-50 p-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:items-end">
                      <FormField label="Invitation Sent On Or Before">
                        <input
                          type="date"
                          value={followUpSentBefore}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(event) => setFollowUpSentBefore(event.target.value)}
                          className="wedding-inline-edit-input min-w-0"
                        />
                      </FormField>
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          onClick={() => setFollowUpSentBefore("")}
                          className="wedding-button-secondary w-full sm:w-auto"
                        >
                          Show All Sent
                        </button>
                        <span className="inline-flex w-full items-center justify-center rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-600 sm:w-auto">
                          {followUpGuests.length} awaiting reply
                        </span>
                      </div>
                    </div>

                    {isInvitationSentAtAvailable === false && (
                      <div className="mt-4">
                        <EmptyState
                          title="Add invitation_sent_at to use sent-date filtering"
                          description="The follow-up date filter works from the invitation_sent_at column."
                        />
                      </div>
                    )}

                    <div className="mt-5 grid gap-3">
                      {followUpGuests.length === 0 ? (
                        <EmptyState
                          title="No sent invitations match this follow-up view"
                          description={
                            followUpSentBefore
                              ? "Try a different sent date or clear the filter."
                              : "Sent invitations waiting for a reply will appear here."
                          }
                        />
                      ) : (
                        followUpGuests.map((guest) => (
                          <div key={guest.id} className="rounded-[22px] border border-stone-100 bg-stone-50 px-4 py-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-serif text-xl text-stone-900">{guest.guest_name}</p>
                                  <span className="wedding-code">{guest.invite_code}</span>
                                </div>
                                <p className="mt-1.5 text-sm text-stone-500">
                                  Sent {formatAdminDateTime(guest.invitation_sent_at) ?? "recently"} · Invited {guest.max_guests} guest
                                  {guest.max_guests === 1 ? "" : "s"}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => void copyInviteLink(guest)} className="wedding-button-secondary">
                                  Copy RSVP Link
                                </button>
                                <button type="button" onClick={() => void copyInvitation(guest)} className="wedding-button-secondary">
                                  Copy Invitation
                                </button>
                                {isGuestPhoneAvailable && guest.phone_number ? (
                                  <button type="button" onClick={() => void textGuestFromPhone(guest)} className="wedding-button-secondary">
                                    Send Reminder
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </StudioPanel>
                )}

                {overviewTab === "needs_seating" && (
                  <StudioPanel>
                    <SectionHeading
                      kicker="Seats Needed"
                      title="On-Site Invitations Still Needing Seats"
                      description="On-site invitations that replied yes and still need seats added to their table assignment."
                    />
                    <div className="mt-5 grid gap-3">
                      {acceptedGuestsNeedingSeating.length === 0 ? (
                        <EmptyState
                          title="All attending guests are fully seated"
                          description="Your current table assignments cover every on-site guest attending."
                        />
                      ) : (
                        acceptedGuestsNeedingSeating.map(({ guest, assignment, accepted, assigned, remaining }) => (
                          <WatchlistCard
                            key={guest.id}
                            title={guest.guest_name}
                            subtitle={
                              assignment
                                ? `${accepted} guest${accepted === 1 ? "" : "s"} attending · ${assigned} seat${assigned === 1 ? "" : "s"} assigned · ${remaining} seat${remaining === 1 ? "" : "s"} needed · ${getTableLabelForGuest(guest)}`
                                : `${accepted} guest${accepted === 1 ? "" : "s"} attending · ${remaining} seat${remaining === 1 ? "" : "s"} needed · ${guest.invite_code}`
                            }
                            actionLabel={assigned > 0 ? "Add Remaining Seating" : "Add Seating"}
                            onAction={() => beginSeatingPlacementForGuest(guest)}
                          />
                        ))
                      )}
                    </div>
                  </StudioPanel>
                )}

                {overviewTab === "activity" && (
                  <StudioPanel>
                    <SectionHeading
                      kicker="Recent Activity"
                      title="Recent Activity"
                      description="Recent invitation updates, sent invitations, and RSVP replies."
                    />
                    <div className="mt-5 space-y-3">
                      {recentActivity.length === 0 ? (
                        <EmptyState title="No activity yet" description="Activity will appear here as guests respond and records are updated." />
                      ) : (
                        recentActivity.map((item) => (
                          <ActivityRow key={item.id} title={item.title} detail={item.detail} timestamp={item.timestamp} />
                        ))
                      )}
                    </div>
                  </StudioPanel>
                )}

                {overviewTab === "checks" && (
                  <StudioPanel>
                    <SectionHeading
                      kicker="Checks"
                      title="Integrity Checks"
                      description="Use this tab to catch seating and RSVP states that need attention before they turn into planning mistakes."
                    />

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <StatTile label="Invitations Needing Seats" value={acceptedGuestsNeedingSeating.length} tone="amber" />
                      <StatTile label="Invitations Seated While Pending/Declined" value={seatedPendingOrDeclinedGuests.length} tone="rose" />
                      <StatTile label="Assigned Seats Over Guest Count" value={acceptedSeatOverages.length} tone="rose" />
                      <StatTile label="Guest Count Issues" value={guestCountIntegrityIssues.length} tone="rose" />
                      <StatTile label="Seating Without Invite" value={seatingWithoutMatchingInvite.length} tone="rose" />
                    </div>

                    <div className="mt-5">
                      <WorkspaceTabs
                        tabs={[
                          { key: "seating", label: `Seating (${acceptedGuestsNeedingSeating.length + acceptedSeatOverages.length})` },
                          { key: "rsvp", label: `RSVP (${seatedPendingOrDeclinedGuests.length + guestCountIntegrityIssues.length})` },
                          { key: "records", label: `Records (${seatingWithoutMatchingInvite.length})` },
                        ]}
                        activeTab={checksTab}
                        onChange={(nextTab) => setChecksTab(nextTab as ChecksWorkspaceTab)}
                      />
                    </div>

                    <div className="mt-4 space-y-4">
                      {checksTab === "seating" && (
                        <>
                          <IntegritySection
                            title="On-Site Invitations Still Needing Seats"
                            subtitle="Attending guest counts that are not fully covered by assigned seats yet."
                            emptyTitle="No seating gaps"
                            emptyDescription="All attending guest counts are fully covered."
                          >
                            {acceptedGuestsNeedingSeating.map(({ guest, assignment, accepted, assigned, remaining }) => (
                              <IssueCard
                                key={`needs-${guest.id}`}
                                title={guest.guest_name}
                                detail={
                                  assignment
                                    ? `${accepted} guests attending · ${assigned} seats assigned · ${remaining} seats needed · ${getTableLabelForGuest(guest)}`
                                    : `${accepted} guests attending · no table yet · ${remaining} seats needed`
                                }
                                primaryActionLabel={assigned > 0 ? "Add Remaining Seating" : "Add Seating"}
                                onPrimaryAction={() => beginSeatingPlacementForGuest(guest)}
                              />
                            ))}
                          </IntegritySection>

                          <IntegritySection
                            title="Assigned Seats Over Guest Count"
                            subtitle="Table assignments with more assigned seats than the RSVP guest count currently allows."
                            emptyTitle="No seat count overages"
                            emptyDescription="Assigned seats do not exceed attending guest counts."
                          >
                            {acceptedSeatOverages.map(({ guest, accepted, assigned, overflow }) => (
                              <IssueCard
                                key={`over-${guest.id}`}
                                title={guest.guest_name}
                                detail={`${accepted} guests attending · ${assigned} seats assigned · ${overflow} too many · ${getTableLabelForGuest(guest)}`}
                                primaryActionLabel="Review Seating"
                                onPrimaryAction={() => openSeatingBoardForGuest(guest)}
                                secondaryActionLabel="Open Invitation"
                                onSecondaryAction={() => beginGuestFormEdit(guest)}
                              />
                            ))}
                          </IntegritySection>
                        </>
                      )}

                      {checksTab === "rsvp" && (
                        <>
                          <IntegritySection
                            title="Seated While Pending Or Declined"
                            subtitle="Guests who are not attending right now but still have seats assigned."
                            emptyTitle="No stale table assignments"
                            emptyDescription="Pending and declined guests are not holding any seats."
                          >
                            {seatedPendingOrDeclinedGuests.map(({ guest, assigned }) => (
                              <IssueCard
                                key={`stale-${guest.id}`}
                                title={guest.guest_name}
                                detail={`${guest.attending === false ? "Declined" : "Pending"} · ${getTableLabelForGuest(guest)} · ${assigned} assigned seat${
                                  assigned === 1 ? "" : "s"
                                }`}
                                primaryActionLabel="Remove Seating"
                                onPrimaryAction={() => void removeGuestSeating(guest)}
                                secondaryActionLabel="Open Invitation"
                                onSecondaryAction={() => beginGuestFormEdit(guest)}
                              />
                            ))}
                          </IntegritySection>

                          <IntegritySection
                            title="Guest Count Issues"
                            subtitle="Invitation counts that do not line up cleanly."
                            emptyTitle="No invitation count issues"
                            emptyDescription="Guest limits, confirmed guests, and children counts look consistent."
                          >
                            {guestCountIntegrityIssues.map((guest) => {
                              const issueParts: string[] = [];
                              if (typeof guest.confirmed_guests === "number" && guest.confirmed_guests > guest.max_guests) {
                                issueParts.push(`Confirmed ${guest.confirmed_guests} exceeds limit ${guest.max_guests}`);
                              }
                              if (typeof guest.children_count === "number" && guest.children_count > guest.max_guests) {
                                issueParts.push(`Children ${guest.children_count} exceeds limit ${guest.max_guests}`);
                              }

                              return (
                                <IssueCard
                                  key={`count-${guest.id}`}
                                  title={guest.guest_name}
                                  detail={issueParts.join(" · ")}
                                  primaryActionLabel="Open Invitation"
                                  onPrimaryAction={() => beginGuestFormEdit(guest)}
                                />
                              );
                            })}
                          </IntegritySection>
                        </>
                      )}

                      {checksTab === "records" && (
                        <>
                          <IntegritySection
                            title="Seating Without Matching Invitation"
                            subtitle="Seating rows that do not have an RSVP code, or whose RSVP code does not match a current invitation."
                            emptyTitle="No orphan table assignments"
                            emptyDescription="Every table assignment is linked by RSVP code."
                          >
                            {seatingWithoutMatchingInvite.map((assignment) => (
                              <IssueCard
                                key={`orphan-${assignment.id}`}
                                title={assignment.name}
                                detail={`Table ${assignment.table_number} · ${Math.max(1, assignment.guest_count || 1)} assigned seat${
                                  Math.max(1, assignment.guest_count || 1) === 1 ? "" : "s"
                                }`}
                                primaryActionLabel="Open Seating"
                                onPrimaryAction={() => beginSeatingFormEdit(assignment)}
                                secondaryActionLabel="Remove"
                                onSecondaryAction={() => confirmRemoveSeatingAssignment(assignment)}
                                secondaryTone="danger"
                              />
                            ))}
                          </IntegritySection>
                        </>
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
                    { key: "manage", label: "Invitation List" },
                    { key: "bulk", label: `Bulk (${selectedGuestIds.length})` },
                    { key: "composer", label: editingGuestId ? "Edit Invitation" : "New Invitation" },
                  ]}
                  activeTab={invitationTab}
                  onChange={(nextTab) => setInvitationTab(nextTab as InvitationWorkspaceTab)}
                />

                {invitationTab === "manage" && (
                  <div className="space-y-4">
                  <StudioPanel>
                    <SectionHeading
                      kicker="Guest Workspace"
                      title="Invitation List"
                      description="Search, filter, and manage invitation records in one place."
                    />

                    <div className="mt-5 space-y-4">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                        <input
                          type="search"
                          value={guestSearch}
                          onChange={(event) => setGuestSearch(event.target.value)}
                          autoComplete="off"
                          enterKeyHint="search"
                          className="wedding-input caret-stone-900 text-stone-900 focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                          placeholder="Search by guest name or invite code"
                        />
                        <select value={guestSort} onChange={(event) => setGuestSort(event.target.value as GuestSort)} className="wedding-select">
                          <option value="recent">Sort: Recent Activity</option>
                          <option value="name">Sort: Guest Name</option>
                          <option value="invite_code">Sort: Invite Code</option>
                          <option value="largest_party">Sort: Largest Party</option>
                        </select>
                      </div>

                      <CompactDisclosure
                        title="Filters"
                        subtitle="You can combine multiple chips here when the filters make sense together."
                        open={guestFiltersOpen}
                        onToggle={() => setGuestFiltersOpen((prev) => !prev)}
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Pill
                              active={guestStatusFilters.length === 0}
                              onClick={clearGuestStatusFilters}
                              label="All"
                            />
                            {([
                              { key: "pending", label: "Pending" },
                              { key: "attending", label: "Attending" },
                              { key: "declined", label: "Declined" },
                            ] as { key: GuestStatusFilter; label: string }[]).map((item) => (
                              <Pill
                                key={item.key}
                                active={guestStatusFilters.includes(item.key)}
                                onClick={() => toggleGuestStatusFilter(item.key)}
                                label={item.label}
                              />
                            ))}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Pill
                              active={guestExtraFilters.length === 0}
                              onClick={clearGuestExtraFilters}
                              label="Any"
                            />
                            {([
                              { key: "sent", label: "Sent" },
                              { key: "not_sent", label: "Not Sent" },
                              { key: "sent_awaiting_response", label: "Sent + Awaiting Reply" },
                              { key: "has_children", label: "Has Children" },
                              { key: "virtual", label: "Virtual" },
                              { key: "needs_seating", label: "Seats Needed" },
                            ] as { key: GuestExtraFilter; label: string }[]).map((item) => (
                              <Pill
                                key={item.key}
                                active={guestExtraFilters.includes(item.key)}
                                onClick={() => toggleGuestExtraFilter(item.key)}
                                label={item.label}
                              />
                            ))}
                          </div>
                        </div>
                      </CompactDisclosure>

                      <CompactDisclosure
                        title="Visible Summary"
                        subtitle={`${filteredInvitationStats.invitations} on-site invitation${filteredInvitationStats.invitations === 1 ? "" : "s"} in this view.`}
                        open={guestSummaryOpen}
                        onToggle={() => setGuestSummaryOpen((prev) => !prev)}
                      >
                        <div className="grid gap-2 rounded-[22px] border border-stone-100 bg-stone-50 p-3 sm:grid-cols-2 lg:grid-cols-6">
                          <MiniMetric label="On-Site Invitations" value={filteredInvitationStats.invitations} />
                          <MiniMetric label="On-Site Guests Invited" value={filteredInvitationStats.invitedGuests} />
                          <MiniMetric label="On-Site Guests Attending" value={filteredInvitationStats.acceptedGuests} />
                          <MiniMetric label="On-Site Invitations Declined" value={filteredInvitationStats.declined} />
                          <MiniMetric label="Virtual Invitations" value={filteredInvitationStats.virtual} />
                          <MiniMetric label="Virtual Invitations Declined" value={filteredInvitationStats.virtualDeclined} />
                          <MiniMetric label="On-Site Awaiting Reply" value={filteredInvitationStats.awaiting} />
                          <MiniMetric label="Seats Needed" value={filteredInvitationStats.needsSeating} />
                        </div>
                      </CompactDisclosure>

                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] border border-stone-100 bg-stone-50 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" onClick={toggleSelectAllVisibleGuests} className="wedding-button-secondary">
                            {filteredResponses.length > 0 && selectedVisibleGuestCount === filteredResponses.length ? "Clear Visible" : "Select Visible"}
                          </button>
                          {selectedGuestIds.length > 0 && (
                            <button type="button" onClick={() => setSelectedGuestIds([])} className="wedding-button-secondary">
                              Clear Selection
                            </button>
                          )}
                        </div>
                        <span className="text-sm text-stone-500">
                          {selectedGuestIds.length} invitation{selectedGuestIds.length === 1 ? "" : "s"} selected
                          {selectedVisibleGuestCount > 0
                            ? ` · ${selectedVisibleGuestCount} visible invitation${selectedVisibleGuestCount === 1 ? "" : "s"}`
                            : ""}
                          {selectedGuestIds.length > 0 ? ` · ${selectedGuestSeatCount} seats` : ""}
                        </span>
                      </div>
                    </div>
                  </StudioPanel>

                  <div className="space-y-4">
                    {filteredResponses.length === 0 ? (
                      <StudioPanel>
                        <EmptyState title="No invitations match this view" description="Try a different filter or search term." />
                      </StudioPanel>
                    ) : (
                      filteredResponses.map((guest) => {
                        const draft = inlineGuestEdits[guest.id];
                        const isEditing = Boolean(draft);
                        const isTableEditing = Boolean(inlineTableEdits[guest.id]);
                        const acceptedCount = guest.attending === true ? guest.confirmed_guests || 0 : 0;
                        const guestInviteUrl = getGuestInviteUrl(guest);
                        const guestAssignments = getSeatingAssignmentsForGuest(guest);
                        const seatingTable = guestAssignments[0]?.table_number;
                        const tableLabel = getTableLabelForGuest(guest);
                        const hasSplitSeating = guestAssignments.length > 1;
                        const assignedSeatCount = getAssignedSeatCountForGuest(guest);
                        const quickTableValue = quickTableDrafts[guest.id] ?? (seatingTable || "");
                        const guestMenuItems: RowMenuItem[] = [
                          { label: "Open RSVP Page", href: guestInviteUrl },
                          { label: "Copy RSVP Link", onSelect: () => void copyInviteLink(guest) },
                          { label: "Copy Invitation", onSelect: () => void copyInvitation(guest) },
                          ...(isGuestPhoneAvailable && guest.phone_number
                            ? [
                                {
                                  label: guest.invitation_sent ? "Send Reminder" : "Send Invite Text",
                                  onSelect: () => void textGuestFromPhone(guest),
                                },
                              ]
                            : []),
                          ...(!guest.invitation_sent
                            ? [{ label: "Mark Invite Sent", onSelect: () => void bulkMarkGuestsAsSent([guest.id]) }]
                            : []),
                          { label: "Open Composer", onSelect: () => beginGuestFormEdit(guest) },
                          {
                            label: hasSplitSeating
                              ? "Review Table Assignments"
                              : seatingTable
                                ? "Quick Edit Table Assignment"
                                : "Assign Table in Quick Edit",
                            onSelect: () => {
                              if (hasSplitSeating) {
                                openSeatingBoardForGuest(guest);
                                return;
                              }
                              startInlineTableEdit(guest);
                            },
                          },
                          ...(guestAssignments.length > 0
                            ? [
                                {
                                  label: hasSplitSeating ? "Remove All Seating" : "Remove Seating",
                                  onSelect: () => void removeGuestSeating(guest),
                                  tone: "danger" as const,
                                },
                              ]
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
                                {Boolean(guest.virtual_guest) && <VirtualGuestBadge />}
                                {Boolean(guest.has_children) && <ChildrenCountBadge count={guest.children_count || 0} />}
                                {guestsNeedingSeatingKeys.has(normalizeNameKey(guest.guest_name)) && <IssueBadge label="Seats Needed" tone="amber" />}
                                {seatedPendingOrDeclinedKeys.has(normalizeNameKey(guest.guest_name)) && (
                                  <IssueBadge label={guest.attending === false ? "Seated While Declined" : "Seated While Pending"} tone="rose" />
                                )}
                                {acceptedSeatOverageKeys.has(normalizeNameKey(guest.guest_name)) && <IssueBadge label="Seat Mismatch" tone="rose" />}
                                {guestCountIntegrityIssueKeys.has(normalizeNameKey(guest.guest_name)) && (
                                  <IssueBadge label="Count Check" tone="rose" />
                                )}
                              </>
                            }
                            actions={
                              <>
                                {!isEditing && !isTableEditing && (
                                  <button type="button" onClick={() => startInlineGuestEdit(guest)} className="wedding-button-secondary">
                                    Quick Edit
                                  </button>
                                )}
                                <RowMenu label={`Actions for ${guest.guest_name}`} items={guestMenuItems} />
                              </>
                            }
                            selected={selectedGuestIds.includes(guest.id)}
                            onToggleSelected={() => toggleGuestSelection(guest.id)}
                          >
                            <div className="space-y-3">
                              {isEditing ? (
                                <div className="space-y-3">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
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
                                      <InlineFieldHint text="Guest or household name" />
                                    </div>
                                    <div className="space-y-1">
                                      <input
                                        value={draft.invite_code}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: { ...prev[guest.id], invite_code: event.target.value.toUpperCase() },
                                          }))
                                        }
                                        autoCapitalize="characters"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        className="wedding-inline-edit-input uppercase"
                                        placeholder="Invite code"
                                      />
                                      <InlineFieldHint text="Unique RSVP code" />
                                    </div>
                                  </div>

                                  {isGuestPhoneAvailable && (
                                    <div className="space-y-1">
                                      <input
                                        type="tel"
                                        value={draft.phone_number}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: { ...prev[guest.id], phone_number: formatPhoneNumberInput(event.target.value) },
                                          }))
                                        }
                                        inputMode="tel"
                                        autoComplete="tel"
                                        className="wedding-inline-edit-input"
                                        placeholder="Phone number"
                                      />
                                      <InlineFieldHint text="For text reminders and follow-up" />
                                    </div>
                                  )}

                                  {isGuestEmailAvailable && (
                                    <div className="space-y-1">
                                      <input
                                        type="email"
                                        value={draft.email}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: { ...prev[guest.id], email: event.target.value },
                                          }))
                                        }
                                        autoComplete="email"
                                        className="wedding-inline-edit-input"
                                        placeholder="Email address"
                                      />
                                      <InlineFieldHint text="Optional for wedding updates" />
                                    </div>
                                  )}

                                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="space-y-1">
                                      <input
                                        type="number"
                                        onWheel={preventNumberInputScroll}
                                        min={1}
                                        value={draft.max_guests}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => {
                                            if (event.target.value === "") {
                                              return {
                                                ...prev,
                                                [guest.id]: {
                                                  ...prev[guest.id],
                                                  max_guests: "",
                                                },
                                              };
                                            }

                                            const nextLimit = Math.max(1, parseInt(event.target.value, 10) || 1);
                                            return {
                                              ...prev,
                                              [guest.id]: {
                                                ...prev[guest.id],
                                                max_guests: nextLimit,
                                                children_count:
                                                  prev[guest.id].children_count === ""
                                                    ? ""
                                                    : Math.min(Number(prev[guest.id].children_count) || 1, nextLimit),
                                              },
                                            };
                                          })
                                        }
                                        onBlur={() =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: {
                                              ...prev[guest.id],
                                              max_guests: prev[guest.id].max_guests === "" ? 1 : prev[guest.id].max_guests,
                                              children_count:
                                                prev[guest.id].children_count === ""
                                                  ? 1
                                                  : Math.min(
                                                      Number(prev[guest.id].children_count) || 1,
                                                      Number(prev[guest.id].max_guests === "" ? 1 : prev[guest.id].max_guests) || 1,
                                                    ),
                                            },
                                          }))
                                        }
                                        className="wedding-inline-edit-input"
                                        placeholder="Guest limit"
                                      />
                                      <InlineFieldHint text="Total invited guests" />
                                    </div>
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
                                    <div className="space-y-1">
                                      <input
                                        type="number"
                                        onWheel={preventNumberInputScroll}
                                        min={draft.attending === true ? 1 : 0}
                                        max={Math.max(1, Number(draft.max_guests) || 1)}
                                        disabled={draft.attending !== true}
                                        value={draft.attending === true ? (draft.confirmed_guests ?? "") : 0}
                                        onChange={(event) =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: {
                                              ...prev[guest.id],
                                              confirmed_guests:
                                                event.target.value === ""
                                                  ? ""
                                                  : Math.max(1, parseInt(event.target.value, 10) || 1),
                                            },
                                          }))
                                        }
                                        onBlur={() =>
                                          setInlineGuestEdits((prev) => ({
                                            ...prev,
                                            [guest.id]: {
                                              ...prev[guest.id],
                                              confirmed_guests:
                                                prev[guest.id].attending === true && prev[guest.id].confirmed_guests === ""
                                                  ? 1
                                                  : prev[guest.id].confirmed_guests,
                                            },
                                          }))
                                        }
                                        className={`wedding-inline-edit-input ${draft.attending !== true ? "opacity-50" : ""}`}
                                        placeholder="Confirmed"
                                      />
                                      <InlineFieldHint text="Guests attending" />
                                    </div>
                                    {draft.has_children ? (
                                      <div className="space-y-1">
                                        <input
                                          type="number"
                                          onWheel={preventNumberInputScroll}
                                          min={1}
                                          max={Math.max(1, Number(draft.max_guests) || 1)}
                                          value={draft.children_count}
                                          onChange={(event) =>
                                            setInlineGuestEdits((prev) => {
                                              if (event.target.value === "") {
                                                return {
                                                  ...prev,
                                                  [guest.id]: {
                                                    ...prev[guest.id],
                                                    children_count: "",
                                                  },
                                                };
                                              }

                                              return {
                                                ...prev,
                                                [guest.id]: {
                                                  ...prev[guest.id],
                                                  children_count: Math.min(
                                                    Math.max(1, parseInt(event.target.value, 10) || 1),
                                                    Math.max(1, Number(prev[guest.id].max_guests) || 1),
                                                  ),
                                                },
                                              };
                                            })
                                          }
                                          onBlur={() =>
                                            setInlineGuestEdits((prev) => ({
                                              ...prev,
                                              [guest.id]: {
                                                ...prev[guest.id],
                                                children_count:
                                                  prev[guest.id].children_count === ""
                                                    ? 1
                                                    : Math.min(
                                                        Number(prev[guest.id].children_count) || 1,
                                                        Math.max(1, Number(prev[guest.id].max_guests) || 1),
                                                      ),
                                              },
                                            }))
                                          }
                                          className="wedding-inline-edit-input"
                                          placeholder="Children"
                                        />
                                        <InlineFieldHint text="Children included" />
                                      </div>
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

                                    {isRequestContactDetailsAvailable && (
                                      <label className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600">
                                        <input
                                          type="checkbox"
                                          checked={draft.request_contact_details}
                                          onChange={(event) =>
                                            setInlineGuestEdits((prev) => ({
                                              ...prev,
                                              [guest.id]: {
                                                ...prev[guest.id],
                                                request_contact_details: event.target.checked,
                                              },
                                            }))
                                          }
                                          className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
                                        />
                                        Request Contact Details
                                      </label>
                                    )}

                                    {isVirtualGuestAvailable && (
                                      <label className="inline-flex items-center gap-3 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-700">
                                        <input
                                          type="checkbox"
                                          checked={draft.virtual_guest}
                                          onChange={(event) =>
                                            setInlineGuestEdits((prev) => ({
                                              ...prev,
                                              [guest.id]: {
                                                ...prev[guest.id],
                                                virtual_guest: event.target.checked,
                                              },
                                            }))
                                          }
                                          className="h-4 w-4 rounded border-sky-300 text-sky-700 focus:ring-sky-300"
                                        />
                                        Virtual Guest
                                      </label>
                                    )}

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
                                                    Math.max(1, Number(prev[guest.id].max_guests) || 1),
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

                                  {(draft.attending === true || guestAssignments.length > 0) && (
                                    <div className="rounded-[20px] border border-stone-100 bg-stone-50 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="wedding-kicker">Table Assignment</p>
                                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-stone-500">
                                          {tableLabel ? `Currently ${tableLabel}` : "No table yet"}
                                        </p>
                                      </div>
                                      {hasSplitSeating ? (
                                        <div className="mt-3 space-y-3">
                                          <p className="text-sm text-stone-600">
                                            This invitation is currently split across {guestAssignments.length} table assignments.
                                          </p>
                                          <div className="flex flex-col gap-2 sm:flex-row">
                                            <button
                                              type="button"
                                              onClick={() => openSeatingBoardForGuest(guest)}
                                              className="wedding-button-secondary w-full sm:w-auto"
                                            >
                                              Review Seating Board
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => void removeGuestSeating(guest)}
                                              className="wedding-button-secondary w-full sm:w-auto"
                                            >
                                              Remove All Seating
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                          <div className="min-w-0 flex-1 space-y-1">
                                            <input
                                              type="number"
                                              onWheel={preventNumberInputScroll}
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
                                            <InlineFieldHint text="Enter the table number" />
                                          </div>
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
                                      )}
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
                                      {tableLabel ? `Currently ${tableLabel}` : "No table yet"}
                                    </p>
                                  </div>
                                  {hasSplitSeating ? (
                                    <div className="mt-3 space-y-3">
                                      <p className="text-sm text-stone-600">
                                        This invitation is split across {guestAssignments.length} table assignments. Review it from the seating board.
                                      </p>
                                      <div className="flex flex-col gap-2 sm:flex-row">
                                        <button
                                          type="button"
                                          onClick={() => openSeatingBoardForGuest(guest)}
                                          className="wedding-button-secondary w-full sm:w-auto"
                                        >
                                          Review Seating Board
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => cancelInlineTableEdit(guest.id)}
                                          className="wedding-button-secondary w-full sm:w-auto"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void removeGuestSeating(guest)}
                                          className="wedding-button-secondary w-full sm:w-auto"
                                        >
                                          Remove All Seating
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <input
                                          type="number"
                                          onWheel={preventNumberInputScroll}
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
                                        <InlineFieldHint text="Enter the table number" />
                                      </div>
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
                                  )}
                                </div>
                              ) : (
                                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                                  <InfoPanel label="Guests Invited" value={`${guest.max_guests} guest${guest.max_guests === 1 ? "" : "s"}`} />
                                  <InfoPanel
                                    label="Guests Attending"
                                    value={
                                      guest.attending === true
                                        ? `${acceptedCount} guest${acceptedCount === 1 ? "" : "s"}`
                                        : guest.attending === false
                                          ? "Declined"
                                          : "Awaiting reply"
                                    }
                                  />
                                  <InfoPanel
                                    label="Seating"
                                    value={
                                      tableLabel
                                        ? guest.attending === true
                                          ? `${tableLabel} · ${assignedSeatCount} of ${acceptedCount} seated`
                                          : `${tableLabel} · ${assignedSeatCount} seat${assignedSeatCount === 1 ? "" : "s"}`
                                        : guest.attending === true
                                          ? "Needs seating"
                                          : "Seat later"
                                    }
                                  />
                                  <InfoPanel label="Last Action" value={getGuestActionIndicators(guest)[0] ?? "No activity yet"} />
                                  {isGuestPhoneAvailable && guest.phone_number && (
                                    <InfoPanel label="Phone" value={formatPhoneNumberInput(guest.phone_number)} />
                                  )}
                                  {isGuestEmailAvailable && guest.email && <InfoPanel label="Email" value={guest.email} />}
                                  {isGuestNotesAvailable && guest.notes && (
                                    <div className="sm:col-span-2 xl:col-span-4">
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

                {invitationTab === "bulk" && (
                  <div className="space-y-4">
                    <StudioPanel>
                      <SectionHeading
                        kicker="Bulk Actions"
                        title="Bulk Actions"
                        description="Use bulk actions here for sending, follow-up, table assignment, seating cleanup, and export."
                      />

                      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="rounded-[22px] border border-stone-100 bg-stone-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="wedding-kicker mb-1">Selection Summary</p>
                              <p className="font-serif text-3xl text-stone-900">{selectedGuestIds.length}</p>
                              <p className="mt-1 text-sm text-stone-500">
                                invitation{selectedGuestIds.length === 1 ? "" : "s"} selected · {selectedGuestSeatCount} seat{selectedGuestSeatCount === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button type="button" onClick={toggleSelectAllVisibleGuests} className="wedding-button-secondary">
                                {filteredResponses.length > 0 && selectedVisibleGuestCount === filteredResponses.length ? "Clear Visible" : "Select Visible"}
                              </button>
                              <button type="button" onClick={() => setSelectedGuestIds([])} className="wedding-button-secondary">
                                Clear Selection
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)]">
                            <div className="rounded-[18px] border border-stone-200 bg-white px-3 py-3">
                              <p className="wedding-kicker mb-1">Table</p>
                                <input
                                  type="number"
                                  onWheel={preventNumberInputScroll}
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
                                className="w-full border-0 bg-transparent p-0 text-2xl font-serif text-stone-900 outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => void bulkAssignSelectedToTable()}
                              disabled={selectedGuestIds.length === 0}
                              className="wedding-button-primary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Assign Selected Invitations To Table
                            </button>
                            <button
                              type="button"
                              onClick={() => void bulkRemoveSelectedSeating()}
                              disabled={selectedGuestIds.length === 0}
                              className="wedding-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Remove Seating For Selected
                            </button>
                          </div>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => void bulkMarkSelectedAsSent()}
                              disabled={selectedGuestIds.length === 0}
                              className="wedding-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Mark Selected Invitations Sent
                            </button>
                            <button
                              type="button"
                              onClick={() => void bulkMarkSelectedAsNotSent()}
                              disabled={selectedGuestIds.length === 0}
                              className="wedding-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Mark Selected Invitations Not Sent
                            </button>
                            <button
                              type="button"
                              onClick={() => void bulkResetSelectedRsvpToPending()}
                              disabled={selectedGuestIds.length === 0}
                              className="wedding-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Reset Selected Invitations To Pending
                            </button>
                            <button
                              type="button"
                              onClick={() => void copySelectedInviteLinks()}
                              disabled={selectedGuestIds.length === 0}
                              className="wedding-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Copy Selected Invitation Links
                            </button>
                            <button
                              type="button"
                              onClick={() => void copySelectedInvitations()}
                              disabled={selectedGuestIds.length === 0}
                              className="wedding-button-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Copy Selected Invitation Messages
                            </button>
                            <button type="button" onClick={exportInvitationCsv} className="wedding-button-secondary">
                              Export Current CSV
                            </button>
                          </div>
                        </div>

                        <div className="rounded-[22px] border border-stone-100 bg-white p-4">
                          <p className="wedding-kicker mb-3">Selected Invitations</p>
                          <div className="space-y-2">
                            {selectedGuests.length === 0 ? (
                              <EmptyState
                                title="No invitations selected"
                                description="Select invitations from Invitation List, then come here to run bulk actions."
                              />
                            ) : (
                              selectedGuests.slice(0, 10).map((guest) => (
                                <div key={guest.id} className="rounded-[18px] border border-stone-100 bg-stone-50 px-3 py-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate font-serif text-xl text-stone-900">{guest.guest_name}</p>
                                      <p className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-stone-400">{guest.invite_code}</p>
                                    </div>
                                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-600 ring-1 ring-stone-200">
                                      {getSeatingGuestCount(guest)} seat{getSeatingGuestCount(guest) === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                            {selectedGuests.length > 10 && (
                              <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                                + {selectedGuests.length - 10} more invitation{selectedGuests.length - 10 === 1 ? "" : "s"} selected
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </StudioPanel>
                  </div>
                )}

                {invitationTab === "composer" && (
                  <StudioPanel refProp={invitationFormRef}>
                    <SectionHeading
                      kicker="Composer"
                      title={editingGuestId ? "Edit Invitation" : "Create Invitation"}
                      description="Add a new invitation or update an existing one."
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

                      <div
                        className={`grid gap-4 ${
                          isGuestPhoneAvailable || isGuestEmailAvailable
                            ? "md:grid-cols-2 xl:grid-cols-4"
                            : "md:grid-cols-[1fr_140px]"
                        }`}
                      >
                        <FormField label="Invite Code">
                          <input
                            value={newCode}
                            onChange={(event) => setNewCode(event.target.value)}
                            required
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            className="wedding-inline-edit-input uppercase"
                            placeholder="OMARHAGER"
                          />
                        </FormField>
                        {isGuestPhoneAvailable && (
                          <FormField label="Phone Number">
                            <input
                              type="tel"
                              value={newPhoneNumber}
                              onChange={(event) => setNewPhoneNumber(formatPhoneNumberInput(event.target.value))}
                              inputMode="tel"
                              autoComplete="tel"
                              className="wedding-inline-edit-input"
                              placeholder="For texts and reminders"
                            />
                          </FormField>
                        )}
                        {isGuestEmailAvailable && (
                          <FormField label="Email (Optional)">
                            <input
                              type="email"
                              value={newEmail}
                              onChange={(event) => setNewEmail(event.target.value)}
                              autoComplete="email"
                              className="wedding-inline-edit-input"
                              placeholder="For updates"
                            />
                          </FormField>
                        )}
                        <FormField label="Guest Limit">
                          <input
                            type="number"
                            onWheel={preventNumberInputScroll}
                            min={1}
                            value={newLimit}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (nextValue === "") {
                                setNewLimit("");
                                return;
                              }

                              const nextLimit = Math.max(1, parseInt(nextValue, 10) || 1);
                              setNewLimit(nextLimit);
                              setChildrenCount((prev) => (prev === "" ? prev : Math.min(prev, nextLimit)));
                            }}
                            onBlur={() => {
                              if (newLimit === "") {
                                setNewLimit(1);
                                setChildrenCount((prev) => (prev === "" ? prev : Math.min(prev, 1)));
                              }
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
                            onWheel={preventNumberInputScroll}
                            min={attendanceStatus === "attending" ? 1 : 0}
                            max={Math.max(1, Number(newLimit) || 1)}
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
                        {isRequestContactDetailsAvailable && (
                          <ToggleBox
                            label="Request Contact Details"
                            description="Ask for phone number and optional email on the RSVP page when this guest accepts."
                            checked={requestContactDetails}
                            onChange={setRequestContactDetails}
                          />
                        )}
                        {isVirtualGuestAvailable ? (
                          <ToggleBox
                            label="Virtual Guest"
                            description="Show a virtual RSVP flow, count this guest separately, and replace venue details with livestream details."
                            checked={isVirtualGuest}
                            onChange={setIsVirtualGuest}
                          />
                        ) : (
                          <div className="rounded-[24px] border border-dashed border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-700">
                            Add a `virtual_guest` column to `public.rsvp_list` to enable virtual invite controls.
                          </div>
                        )}
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
                            onWheel={preventNumberInputScroll}
                            min={1}
                            max={Math.max(1, Number(newLimit) || 1)}
                            value={childrenCount}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (nextValue === "") {
                                setChildrenCount("");
                                return;
                              }
                              setChildrenCount(
                                Math.min(Math.max(1, parseInt(nextValue, 10) || 1), Math.max(1, Number(newLimit) || 1)),
                              );
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
                        {(editingGuestId || guestComposerReturnLocation) && (
                          <button type="button" onClick={cancelGuestComposer} className="wedding-button-secondary w-full">
                            {editingGuestId ? "Cancel Edit" : "Cancel"}
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
                    { key: "tables", label: "Table Tools" },
                    { key: "composer", label: editingSeatingId !== null ? "Edit Assignment" : "New Assignment" },
                  ]}
                  activeTab={seatingTab}
                  onChange={(nextTab) => setSeatingTab(nextTab as SeatingWorkspaceTab)}
                />

                {seatingTab === "board" && (
                  <div className="space-y-4">
                  <StudioPanel>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <SectionHeading
                        kicker="Seating Workspace"
                        title="Seating Board"
                        description="Search, filter, and update table assignments by guest or table number."
                      />
                      <Link href="/studio-pro/seat-management" className="wedding-button-primary shrink-0">
                        Seat Management
                      </Link>
                    </div>

                    <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                      <input
                        type="search"
                        value={seatingSearch}
                        onChange={(event) => setSeatingSearch(event.target.value)}
                        autoComplete="off"
                        enterKeyHint="search"
                        className="wedding-input caret-stone-900 text-stone-900 focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                        placeholder="Search by guest or table number"
                      />
                      <select value={seatingSort} onChange={(event) => setSeatingSort(event.target.value as SeatingSort)} className="wedding-select">
                        <option value="table">Sort: Table Number</option>
                        <option value="name">Sort: Guest Name</option>
                      </select>
                    </div>

                    <div className="mt-4">
                      <WorkspaceTabs
                        tabs={[
                          { key: "assignments", label: "By Assignment" },
                          { key: "invites", label: "By Invitation" },
                        ]}
                        activeTab={seatingBoardMode}
                        onChange={(nextTab) => setSeatingBoardMode(nextTab as SeatingBoardMode)}
                      />
                    </div>

                    <div className="mt-4">
                      <CompactDisclosure
                        title="Table Filters"
                        subtitle={
                          seatingTableFilter === "all"
                            ? `${availableTableNumbers.length} table${availableTableNumbers.length === 1 ? "" : "s"} available. Select one or more.`
                            : `Showing ${selectedSeatingTableNumbers.length} selected table${
                                selectedSeatingTableNumbers.length === 1 ? "" : "s"
                              }.`
                        }
                        open={seatingControlsOpen}
                        onToggle={() => setSeatingControlsOpen((prev) => !prev)}
                      >
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Pill
                              label="All Tables"
                              active={seatingTableFilter === "all"}
                              onClick={() => setSeatingTableFilter("all")}
                            />
                            {availableTableNumbers.map((table) => (
                              <Pill
                                key={table}
                                label={`Table ${table}`}
                                active={isSeatingTableSelected(table)}
                                onClick={() => toggleSeatingTableFilter(table)}
                              />
                            ))}
                          </div>

                          <div className="grid gap-2 rounded-[22px] border border-stone-100 bg-stone-50 p-3 sm:grid-cols-3">
                            <MiniMetric label="Table Assignments" value={filteredSeatingAssignments.length} />
                            <MiniMetric
                              label={isSeatingGuestCountAvailable ? "Assigned Seats" : "Tables"}
                              value={isSeatingGuestCountAvailable ? filteredSeatingGuestCount : stats.uniqueTables}
                            />
                            <MiniMetric label="Invitations Needing Seats" value={stats.acceptedNeedingSeating} />
                          </div>
                        </div>
                      </CompactDisclosure>
                    </div>

                  </StudioPanel>

                  <div className="space-y-4">
                    {(seatingBoardMode === "assignments" ? filteredSeatingAssignments.length === 0 : groupedSeatingAssignments.length === 0) ? (
                      <StudioPanel>
                        <EmptyState title="No seating matches this view" description="Try a different guest name or table number." />
                      </StudioPanel>
                    ) : seatingBoardMode === "assignments" ? (
                      filteredSeatingAssignments.map((assignment) => {
                        const draft = inlineSeatingEdits[assignment.id];
                        const isEditing = Boolean(draft);
                        const inlineCapacityCheck = draft
                          ? getSeatingCapacityCheck({
                              inviteCode: draft.invite_code,
                              guestCount: draft.guest_count,
                              editingAssignmentId: assignment.id,
                            })
                          : null;
                        const seatingMenuItems: RowMenuItem[] = [
                          { label: "Open Composer", onSelect: () => beginSeatingFormEdit(assignment) },
                          { label: "Remove", onSelect: () => confirmRemoveSeatingAssignment(assignment), tone: "danger" },
                        ];

                        return (
                          <StudioPanel key={assignment.id} dense>
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-serif text-xl tracking-tight text-stone-900 md:text-2xl">{assignment.name}</h3>
                                  {isSeatingAliasesAvailable && parseNameAliases(assignment.name_aliases).length > 0 && (
                                    <p className="mt-1 text-sm leading-relaxed text-stone-500">
                                      Aliases: {parseNameAliases(assignment.name_aliases).join(", ")}
                                    </p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {assignment.invite_code && (
                                      <p className="inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700 ring-1 ring-stone-200">
                                        {assignment.invite_code}
                                      </p>
                                    )}
                                    <p className="inline-flex rounded-full bg-stone-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700">
                                      Table {assignment.table_number}
                                    </p>
                                    {isSeatingGuestCountAvailable && (
                                      <p className="inline-flex rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                                        {Math.max(1, assignment.guest_count || 1)} seat{Math.max(1, assignment.guest_count || 1) === 1 ? "" : "s"}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-start gap-1.5">
                                  {!isEditing && (
                                    <button type="button" onClick={() => startInlineSeatingEdit(assignment)} className="wedding-button-secondary">
                                      Quick Edit
                                    </button>
                                  )}
                                  <RowMenu label={`Actions for ${assignment.name}`} items={seatingMenuItems} />
                                </div>
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="mt-5 space-y-3">
                              <div
                                className={`grid gap-3 ${
                                  isSeatingInviteCodeAvailable && isSeatingGuestCountAvailable
                                    ? "md:grid-cols-[minmax(0,1fr)_160px_140px_140px]"
                                    : isSeatingInviteCodeAvailable
                                      ? "md:grid-cols-[minmax(0,1fr)_160px_140px]"
                                      : isSeatingGuestCountAvailable
                                        ? "md:grid-cols-[minmax(0,1fr)_140px_140px]"
                                        : "md:grid-cols-[1fr_150px]"
                                }`}
                              >
                                  <div className="space-y-1">
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
                                    <InlineFieldHint text="Assigned guest name" />
                                  </div>
                                  {isSeatingInviteCodeAvailable && (
                                    <div className="space-y-1">
                                      <input
                                        value={draft.invite_code}
                                        onChange={(event) =>
                                          setInlineSeatingEdits((prev) => ({
                                            ...prev,
                                            [assignment.id]: {
                                              ...prev[assignment.id],
                                              invite_code: event.target.value.toUpperCase(),
                                            },
                                          }))
                                        }
                                        autoCapitalize="characters"
                                        autoCorrect="off"
                                        spellCheck={false}
                                        className="wedding-inline-edit-input uppercase"
                                        placeholder="RSVP code"
                                      />
                                      <InlineFieldHint text="Required link to the RSVP record" />
                                    </div>
                                  )}
                                  <div className="space-y-1">
                                    <input
                                      type="number"
                                      min={1}
                                      value={draft.table_number}
                                      onChange={(event) =>
                                        setInlineSeatingEdits((prev) => ({
                                          ...prev,
                                          [assignment.id]: {
                                            ...prev[assignment.id],
                                            table_number:
                                              event.target.value === ""
                                                ? ""
                                                : Math.max(1, parseInt(event.target.value, 10) || 1),
                                          },
                                        }))
                                      }
                                      onBlur={() =>
                                        setInlineSeatingEdits((prev) => ({
                                          ...prev,
                                          [assignment.id]: {
                                            ...prev[assignment.id],
                                            table_number: prev[assignment.id].table_number === "" ? 1 : prev[assignment.id].table_number,
                                          },
                                        }))
                                      }
                                      className="wedding-inline-edit-input"
                                      placeholder="Table"
                                    />
                                    <InlineFieldHint text="Table number" />
                                  </div>
                                  {isSeatingGuestCountAvailable && (
                                    <div className="space-y-1">
                                      <input
                                        type="number"
                                        min={1}
                                        value={draft.guest_count}
                                        onChange={(event) =>
                                          setInlineSeatingEdits((prev) => ({
                                            ...prev,
                                            [assignment.id]: {
                                              ...prev[assignment.id],
                                              guest_count:
                                                event.target.value === ""
                                                  ? ""
                                                  : Math.max(1, parseInt(event.target.value, 10) || 1),
                                            },
                                          }))
                                        }
                                        onBlur={() =>
                                          setInlineSeatingEdits((prev) => ({
                                            ...prev,
                                            [assignment.id]: {
                                              ...prev[assignment.id],
                                              guest_count: prev[assignment.id].guest_count === "" ? 1 : prev[assignment.id].guest_count,
                                            },
                                          }))
                                        }
                                        className="wedding-inline-edit-input"
                                        placeholder="Seats"
                                      />
                                      <InlineFieldHint text="Seats at this table" />
                                    </div>
                                  )}
                                </div>

                                {isSeatingAliasesAvailable && (
                                  <div className="space-y-1">
                                    <input
                                      value={draft.name_aliases}
                                      onChange={(event) =>
                                        setInlineSeatingEdits((prev) => ({
                                          ...prev,
                                          [assignment.id]: {
                                            ...prev[assignment.id],
                                            name_aliases: event.target.value,
                                          },
                                        }))
                                      }
                                      className="wedding-inline-edit-input"
                                      placeholder="Jane Doe, Joe Doe"
                                    />
                                    <InlineFieldHint text="Comma-separated search aliases" />
                                  </div>
                                )}

                                {inlineCapacityCheck && (
                                  <div
                                    className={`rounded-[18px] border px-3 py-3 text-sm ${
                                      inlineCapacityCheck.wouldExceed
                                        ? "border-rose-200 bg-rose-50 text-rose-700"
                                        : "border-stone-200 bg-stone-50 text-stone-600"
                                    }`}
                                  >
                                    {inlineCapacityCheck.linkedGuest.guest_name} currently has {inlineCapacityCheck.alreadyAssignedSeats} seat
                                    {inlineCapacityCheck.alreadyAssignedSeats === 1 ? "" : "s"} assigned. This assignment would bring the total to{" "}
                                    {inlineCapacityCheck.totalAfterSave} of {inlineCapacityCheck.allowedSeats}.
                                  </div>
                                )}

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
                    ) : (
                      groupedSeatingAssignments.map((group) => {
                        const linkedGuest = group.linkedGuest;
                        const acceptedSeats =
                          linkedGuest?.attending === true ? Math.max(1, linkedGuest.confirmed_guests || 1) : null;
                        const remainingSeats = acceptedSeats === null ? null : Math.max(0, acceptedSeats - group.assignedSeats);
                        const tableLabel =
                          group.tableNumbers.length === 0
                            ? "No table"
                            : group.tableNumbers.length === 1
                              ? `Table ${group.tableNumbers[0]}`
                              : `Tables ${group.tableNumbers.join(", ")}`;

                        return (
                          <StudioPanel key={group.key} dense>
                            <div className="space-y-4">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-serif text-xl tracking-tight text-stone-900 md:text-2xl">{group.displayName}</h3>
                                    {group.inviteCode && (
                                      <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700 ring-1 ring-stone-200">
                                        {group.inviteCode}
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm text-stone-500">
                                    {tableLabel} · {group.assignments.length} table assignment{group.assignments.length === 1 ? "" : "s"} · {group.assignedSeats} assigned seat
                                    {group.assignedSeats === 1 ? "" : "s"}
                                    {acceptedSeats !== null
                                      ? ` · ${acceptedSeats} guest${acceptedSeats === 1 ? "" : "s"} attending · ${remainingSeats === 0 ? "fully seated" : `${remainingSeats} seat${remainingSeats === 1 ? "" : "s"} still needed`}`
                                      : ""}
                                  </p>
                                </div>

                                <div className="flex shrink-0 flex-wrap gap-2">
                                  {linkedGuest && (
                                    <button type="button" onClick={() => beginGuestFormEdit(linkedGuest)} className="wedding-button-secondary">
                                      Open Invitation
                                    </button>
                                  )}
                                  {linkedGuest && remainingSeats !== null && remainingSeats > 0 && (
                                    <button type="button" onClick={() => beginSeatingPlacementForGuest(linkedGuest)} className="wedding-button-secondary">
                                      Add Remaining Seating
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-3">
                                {group.assignments.map((assignment) => {
                                  const draft = inlineSeatingEdits[assignment.id];
                                  const isEditing = Boolean(draft);
                                          const inlineCapacityCheck = draft
                                            ? getSeatingCapacityCheck({
                                                inviteCode: draft.invite_code,
                                                guestCount: draft.guest_count,
                                                editingAssignmentId: assignment.id,
                                      })
                                    : null;

                                  return (
                                    <div key={assignment.id} className="rounded-[20px] border border-stone-100 bg-stone-50 px-4 py-4">
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap gap-2">
                                            <span className="inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700 ring-1 ring-stone-200">
                                              Table {assignment.table_number}
                                            </span>
                                            {isSeatingGuestCountAvailable && (
                                              <span className="inline-flex rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                                                {Math.max(1, assignment.guest_count || 1)} seat{Math.max(1, assignment.guest_count || 1) === 1 ? "" : "s"}
                                              </span>
                                            )}
                                          </div>
                                          <p className="mt-2 font-serif text-lg text-stone-900">{assignment.name}</p>
                                          {isSeatingAliasesAvailable && parseNameAliases(assignment.name_aliases).length > 0 && (
                                            <p className="mt-1 text-sm text-stone-500">
                                              Aliases: {parseNameAliases(assignment.name_aliases).join(", ")}
                                            </p>
                                          )}
                                        </div>

                                        <div className="flex shrink-0 flex-wrap gap-2">
                                          {!isEditing && (
                                            <button type="button" onClick={() => startInlineSeatingEdit(assignment)} className="wedding-button-secondary">
                                              Quick Edit
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => confirmRemoveSeatingAssignment(assignment)}
                                            className="wedding-button-secondary border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      </div>

                                      {isEditing ? (
                                        <div className="mt-4 space-y-3">
                                          <div
                                            className={`grid gap-3 ${
                                              isSeatingInviteCodeAvailable && isSeatingGuestCountAvailable
                                                ? "md:grid-cols-[minmax(0,1fr)_160px_140px_140px]"
                                                : isSeatingInviteCodeAvailable
                                                  ? "md:grid-cols-[minmax(0,1fr)_160px_140px]"
                                                  : isSeatingGuestCountAvailable
                                                    ? "md:grid-cols-[minmax(0,1fr)_140px_140px]"
                                                    : "md:grid-cols-[1fr_150px]"
                                            }`}
                                          >
                                            <div className="space-y-1">
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
                                              <InlineFieldHint text="Assigned guest name" />
                                            </div>
                                            {isSeatingInviteCodeAvailable && (
                                              <div className="space-y-1">
                                                <input
                                                  value={draft.invite_code}
                                                  onChange={(event) =>
                                                    setInlineSeatingEdits((prev) => ({
                                                      ...prev,
                                                      [assignment.id]: {
                                                        ...prev[assignment.id],
                                                        invite_code: event.target.value.toUpperCase(),
                                                      },
                                                    }))
                                                  }
                                                  autoCapitalize="characters"
                                                  autoCorrect="off"
                                                  spellCheck={false}
                                                  className="wedding-inline-edit-input uppercase"
                                                  placeholder="RSVP code"
                                                />
                                                <InlineFieldHint text="Required link to the RSVP record" />
                                              </div>
                                            )}
                                            <div className="space-y-1">
                                              <input
                                                type="number"
                                                min={1}
                                                value={draft.table_number}
                                                onChange={(event) =>
                                                  setInlineSeatingEdits((prev) => ({
                                                    ...prev,
                                                    [assignment.id]: {
                                                      ...prev[assignment.id],
                                                      table_number:
                                                        event.target.value === ""
                                                          ? ""
                                                          : Math.max(1, parseInt(event.target.value, 10) || 1),
                                                    },
                                                  }))
                                                }
                                                onBlur={() =>
                                                  setInlineSeatingEdits((prev) => ({
                                                    ...prev,
                                                    [assignment.id]: {
                                                      ...prev[assignment.id],
                                                      table_number: prev[assignment.id].table_number === "" ? 1 : prev[assignment.id].table_number,
                                                    },
                                                  }))
                                                }
                                                className="wedding-inline-edit-input"
                                                placeholder="Table"
                                              />
                                              <InlineFieldHint text="Table number" />
                                            </div>
                                            {isSeatingGuestCountAvailable && (
                                              <div className="space-y-1">
                                                <input
                                                  type="number"
                                                  min={1}
                                                  value={draft.guest_count}
                                                  onChange={(event) =>
                                                    setInlineSeatingEdits((prev) => ({
                                                      ...prev,
                                                      [assignment.id]: {
                                                        ...prev[assignment.id],
                                                        guest_count:
                                                          event.target.value === ""
                                                            ? ""
                                                            : Math.max(1, parseInt(event.target.value, 10) || 1),
                                                      },
                                                    }))
                                                  }
                                                  onBlur={() =>
                                                    setInlineSeatingEdits((prev) => ({
                                                      ...prev,
                                                      [assignment.id]: {
                                                        ...prev[assignment.id],
                                                        guest_count: prev[assignment.id].guest_count === "" ? 1 : prev[assignment.id].guest_count,
                                                      },
                                                    }))
                                                  }
                                                  className="wedding-inline-edit-input"
                                                  placeholder="Seats"
                                                />
                                                <InlineFieldHint text="Seats at this table" />
                                              </div>
                                            )}
                                          </div>

                                          {isSeatingAliasesAvailable && (
                                            <div className="space-y-1">
                                              <input
                                                value={draft.name_aliases}
                                                onChange={(event) =>
                                                  setInlineSeatingEdits((prev) => ({
                                                    ...prev,
                                                    [assignment.id]: {
                                                      ...prev[assignment.id],
                                                      name_aliases: event.target.value,
                                                    },
                                                  }))
                                                }
                                                className="wedding-inline-edit-input"
                                                placeholder="Jane Doe, Joe Doe"
                                              />
                                              <InlineFieldHint text="Comma-separated search aliases" />
                                            </div>
                                          )}

                                          {inlineCapacityCheck && (
                                            <div
                                              className={`rounded-[18px] border px-3 py-3 text-sm ${
                                                inlineCapacityCheck.wouldExceed
                                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                                  : "border-stone-200 bg-stone-50 text-stone-600"
                                              }`}
                                            >
                                              {inlineCapacityCheck.linkedGuest.guest_name} currently has {inlineCapacityCheck.alreadyAssignedSeats} seat
                                              {inlineCapacityCheck.alreadyAssignedSeats === 1 ? "" : "s"} assigned. This assignment would bring the total to{" "}
                                              {inlineCapacityCheck.totalAfterSave} of {inlineCapacityCheck.allowedSeats}.
                                            </div>
                                          )}

                                          <div className="flex flex-col gap-3 sm:flex-row">
                                            <button
                                              type="button"
                                              onClick={() => void saveInlineSeatingEdit(assignment.id)}
                                              className="wedding-button-primary"
                                            >
                                              Save Quick Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => cancelInlineSeatingEdit(assignment.id)}
                                              className="wedding-button-secondary"
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </StudioPanel>
                        );
                      })
                    )}
                  </div>
                  </div>
                )}

                {seatingTab === "tables" && (
                  <StudioPanel>
                    <SectionHeading
                      kicker="Table Tools"
                      title="Table Totals & Moves"
                      description="Review visible table totals and move an entire table when plans change."
                    />

                    <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                      <input
                        type="search"
                        value={seatingSearch}
                        onChange={(event) => setSeatingSearch(event.target.value)}
                        autoComplete="off"
                        enterKeyHint="search"
                        className="wedding-input caret-stone-900 text-stone-900 focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
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
                          active={isSeatingTableSelected(table)}
                          onClick={() => toggleSeatingTableFilter(table)}
                        />
                      ))}
                    </div>

                    {availableTableNumbers.length > 0 && (
                      <div className="mt-5">
                        <CompactDisclosure
                          title="Move Or Swap Tables"
                          subtitle="Renumber one table, or swap two occupied table numbers without merging guests."
                          open={tableToolsOpen}
                          onToggle={() => setTableToolsOpen((prev) => !prev)}
                        >
                          <div className="mb-3 flex flex-wrap gap-2">
                            <Pill label="Swap Tables" active={tableMoveMode === "swap"} onClick={() => setTableMoveMode("swap")} />
                            <Pill label="Move / Merge" active={tableMoveMode === "move"} onClick={() => setTableMoveMode("move")} />
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
                              onClick={() => void (tableMoveMode === "swap" ? swapTables() : moveEntireTable())}
                              disabled={tableMoveFrom === "" || tableMoveTo === "" || tableMoveFrom === tableMoveTo}
                              className="wedding-button-primary w-full self-end disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                              {tableMoveMode === "swap" ? "Swap Tables" : "Move Table"}
                            </button>
                          </div>
                          <p className="mt-3 text-sm text-stone-500">
                            Swap is best when both tables already have guests. Move / Merge changes the source table number and combines it with the destination.
                          </p>
                        </CompactDisclosure>
                      </div>
                    )}

                    {isSeatingGuestCountAvailable && filteredTableSeatTotals.size > 0 ? (
                      <div className="mt-5 rounded-[28px] border border-stone-100 bg-[linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(241,245,249,0.86))] p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="wedding-kicker">Visible Table Seat Totals</p>
                            <p className="mt-1 text-sm text-stone-500">Select a table to open the seating board filtered to that table.</p>
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
                                  toggleSeatingTableFilter(table);
                                  setSeatingTab("board");
                                }}
                                className={`rounded-[22px] border px-4 py-4 text-left transition ${
                                  isSeatingTableSelected(table)
                                    ? "border-stone-900 bg-stone-900 text-white"
                                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
                                }`}
                              >
                                <p
                                  className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                                    isSeatingTableSelected(table) ? "text-white/75" : "text-stone-400"
                                  }`}
                                >
                                  Table {table}
                                </p>
                                <p className="mt-2 font-serif text-3xl leading-none">
                                  {seats}
                                </p>
                                <p className={`mt-2 text-sm ${isSeatingTableSelected(table) ? "text-white/85" : "text-stone-500"}`}>
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
                              ? "Table totals will appear here as soon as table assignments match this view."
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
                      description="Add a new table assignment or update an existing one."
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

                      {isSeatingAliasesAvailable && (
                        <FormField label="Search Aliases">
                          <input
                            value={seatingNameAliases}
                            onChange={(event) => setSeatingNameAliases(event.target.value)}
                            className="wedding-inline-edit-input"
                            placeholder="Jane Doe, Joe Doe"
                          />
                          <p className="mt-2 text-xs text-stone-500">Use comma-separated names that should also match this table search result.</p>
                        </FormField>
                      )}

                      {isSeatingInviteCodeAvailable ? (
                        <FormField label="RSVP Code">
                          <input
                            value={seatingInviteCode}
                            onChange={(event) => setSeatingInviteCode(event.target.value.toUpperCase())}
                            required
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            className="wedding-inline-edit-input uppercase"
                            placeholder="Link this table assignment to an invitation"
                          />
                          <p className="mt-2 text-xs text-stone-500">
                            Seating links to invitations by RSVP code only.
                          </p>
                        </FormField>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                          Add an `invite_code` column to `public.seating` before creating table assignments.
                        </div>
                      )}

                      <FormField label="Table Number">
                        <input
                          type="number"
                          onWheel={preventNumberInputScroll}
                          min={1}
                          value={tableNumber}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === "") {
                              setTableNumber("");
                              return;
                            }

                            setTableNumber(Math.max(1, parseInt(nextValue, 10) || 1));
                          }}
                          onBlur={() => {
                            if (tableNumber === "") setTableNumber(1);
                          }}
                          className="wedding-inline-edit-input"
                        />
                      </FormField>

                      {isSeatingGuestCountAvailable && (
                        <FormField label="Guest Count">
                          <input
                            type="number"
                            onWheel={preventNumberInputScroll}
                            min={1}
                            value={seatingGuestCount}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (nextValue === "") {
                                setSeatingGuestCount("");
                                return;
                              }

                              setSeatingGuestCount(Math.max(1, parseInt(nextValue, 10) || 1));
                            }}
                            onBlur={() => {
                              if (seatingGuestCount === "") setSeatingGuestCount(1);
                            }}
                            className="wedding-inline-edit-input"
                          />
                        </FormField>
                      )}

                      {seatingComposerCapacityCheck && (
                        <div
                          className={`rounded-[20px] border px-4 py-3 text-sm ${
                            seatingComposerCapacityCheck.wouldExceed
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-stone-200 bg-stone-50 text-stone-600"
                          }`}
                        >
                          {seatingComposerCapacityCheck.linkedGuest.guest_name} currently has {seatingComposerCapacityCheck.alreadyAssignedSeats} seat
                          {seatingComposerCapacityCheck.alreadyAssignedSeats === 1 ? "" : "s"} assigned. This assignment would bring the total to{" "}
                          {seatingComposerCapacityCheck.totalAfterSave} of {seatingComposerCapacityCheck.allowedSeats}.
                        </div>
                      )}

                      <div className="flex flex-col gap-3 pt-2">
                        <button className="wedding-button-primary w-full">
                          {editingSeatingId !== null ? "Save Assignment" : "Add Assignment"}
                        </button>
                        {(editingSeatingId !== null || seatingComposerReturnLocation) && (
                          <button type="button" onClick={cancelSeatingComposer} className="wedding-button-secondary w-full">
                            {editingSeatingId !== null ? "Cancel Edit" : "Cancel"}
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
                    description="Turn live site sections on or off here."
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
                    <ToggleTile
                      label="Livestream Page"
                      description="Control whether virtual guests can open the livestream page."
                      enabled={isLivestreamEnabled}
                      onToggle={() =>
                        void updateSetting(
                          "is_livestream_enabled",
                          !isLivestreamEnabled,
                          `Livestream page ${!isLivestreamEnabled ? "enabled" : "disabled"}.`,
                        )
                      }
                    />
                  </div>

                  <div className="mt-5 rounded-[22px] border border-stone-100 bg-stone-50 p-4">
                    <FormField label="Livestream Embed Link">
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          value={livestreamEmbedUrl}
                          onChange={(event) => setLivestreamEmbedUrl(event.target.value)}
                          className="wedding-inline-edit-input"
                          placeholder="https://www.youtube.com/embed/..."
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void updateTextSetting("livestream_embed_url", livestreamEmbedUrl.trim(), "Livestream link saved.")
                          }
                          className="wedding-button-primary w-full xl:w-auto"
                        >
                          Save Link
                        </button>
                      </div>
                    </FormField>
                  </div>
                </StudioPanel>
              </div>
            )}
          </main>
        </div>
      <Toasts toasts={toasts} />

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          actionLabel={confirmDialog.actionLabel}
          actionTone={confirmDialog.actionTone}
          secondaryActionLabel={confirmDialog.secondaryActionLabel}
          secondaryActionTone={confirmDialog.secondaryActionTone}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={async () => {
            await confirmDialog.onConfirm();
            setConfirmDialog(null);
          }}
          onSecondaryAction={
            confirmDialog.onSecondaryAction
              ? async () => {
                  await confirmDialog.onSecondaryAction?.();
                  setConfirmDialog(null);
                }
              : undefined
          }
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
      className={`min-w-0 rounded-[24px] border border-white/85 bg-white/92 shadow-sm ${
        dense ? "p-4" : "p-4 md:p-5"
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
      <p className="wedding-kicker mb-1.5">{kicker}</p>
      <h2 className="font-serif text-[1.85rem] tracking-tight text-stone-900 md:text-[2.2rem]">{title}</h2>
      {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-stone-500">{description}</p>}
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
    <div className="rounded-[20px] border border-white/85 bg-white/92 p-2 shadow-sm">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
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
    <div className="rounded-[18px] border border-stone-100 bg-stone-50 px-3 py-3">
      <p className="wedding-kicker mb-1.5">{label}</p>
      <p className={`font-serif text-[2rem] leading-none ${toneStyles}`}>{value}</p>
    </div>
  );
}

function MetricGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-stone-100 bg-stone-50/70 p-3">
      <p className="wedding-kicker mb-3">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
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
        <p className="font-serif text-base text-stone-900 md:text-lg">{label}</p>
        <p className="text-sm font-semibold text-stone-500">
          {value} / {total}
        </p>
      </div>
      <div className="h-2.5 rounded-full bg-stone-100">
        <div className={`h-2.5 rounded-full ${toneStyles}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function CompactDisclosure({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-stone-100 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="wedding-kicker mb-1">{title}</p>
          {subtitle ? <p className="text-sm text-stone-500">{subtitle}</p> : null}
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && <div className="border-t border-stone-100 px-4 py-4">{children}</div>}
    </div>
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
    <div className="rounded-[22px] border border-stone-100 bg-stone-50 px-4 py-4">
      <p className="font-serif text-xl text-stone-900">{title}</p>
      <p className="mt-1.5 text-sm text-stone-500">{subtitle}</p>
      <button type="button" onClick={onAction} className="wedding-button-secondary mt-4">
        {actionLabel}
      </button>
    </div>
  );
}

function IntegritySection({
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
  children,
}: {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <div className="rounded-[22px] border border-stone-100 bg-stone-50 p-4">
      <div className="mb-3">
        <p className="font-serif text-xl text-stone-900">{title}</p>
        <p className="mt-1.5 text-sm text-stone-500">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {items.length > 0 ? items : <EmptyState title={emptyTitle} description={emptyDescription} />}
      </div>
    </div>
  );
}

function IssueCard({
  title,
  detail,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryTone = "default",
}: {
  title: string;
  detail: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryTone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[18px] border border-stone-200 bg-white px-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-serif text-lg text-stone-900">{title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{detail}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onPrimaryAction} className="wedding-button-secondary">
            {primaryActionLabel}
          </button>
          {secondaryActionLabel && onSecondaryAction ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              className={`wedding-button-secondary ${
                secondaryTone === "danger" ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : ""
              }`}
            >
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-stone-100 bg-white px-3 py-3">
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
      className={`rounded-full px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-colors ${
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
    <section className="min-w-0 overflow-hidden rounded-[22px] border border-white/85 bg-white/92 shadow-[0_10px_22px_rgba(28,25,23,0.045)]">
      <div className="border-b border-stone-100 px-3 py-3 md:px-4 md:py-4">
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <label className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-600 md:px-3 md:py-1.5 md:text-xs">
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelected}
                className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-300"
              />
              Select
            </label>

            <div className="flex shrink-0 items-start gap-1.5 self-start">{actions}</div>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-serif text-[1.35rem] tracking-tight text-stone-900 md:text-[1.75rem]">{title}</h3>
              <span className="wedding-code">{subtitle}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 md:mt-2">{badges}</div>
          </div>
        </div>
      </div>
      <div className="px-3 py-3 md:px-4 md:py-4">{children}</div>
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
    <div className="rounded-[14px] border border-stone-100 bg-stone-50 px-2.5 py-2">
      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-stone-400">{label}</p>
      <p className={`${mono ? "font-mono text-[11px]" : "text-[13px]"} leading-snug text-stone-700`}>{value}</p>
    </div>
  );
}

function InlineFieldHint({ text }: { text: string }) {
  return <p className="px-1 text-[10px] leading-tight text-stone-400">{text}</p>;
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
    <div className="rounded-[22px] border border-stone-100 bg-stone-50 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-serif text-xl text-stone-900">{label}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{description}</p>
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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-stone-200 bg-stone-50 px-5 py-8 text-center">
      <p className="font-serif text-xl text-stone-900 md:text-2xl">{title}</p>
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
    <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${styles}`}>
      {label}
    </span>
  );
}

function InvitationSentBadge({ sent }: { sent: boolean }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${
        sent ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-500"
      }`}
    >
      {sent ? "Sent" : "Not Sent"}
    </span>
  );
}

function VirtualGuestBadge() {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-indigo-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700">
      Virtual
    </span>
  );
}

function ChildrenCountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">
      {count} {count === 1 ? "Child" : "Children"}
    </span>
  );
}

function IssueBadge({ label, tone }: { label: string; tone: "amber" | "rose" }) {
  const styles = tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] ${styles}`}>{label}</span>;
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
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg text-stone-500 shadow-sm ring-1 ring-stone-200 transition-colors hover:text-stone-900"
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
          className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-xl ${
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
  secondaryActionLabel,
  secondaryActionTone = "default",
  onCancel,
  onConfirm,
  onSecondaryAction,
}: {
  title: string;
  message: string;
  actionLabel: string;
  actionTone?: "danger" | "default";
  secondaryActionLabel?: string;
  secondaryActionTone?: "danger" | "default";
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  onSecondaryAction?: () => Promise<void> | void;
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-stone-900/35 px-4">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-[30px] border border-stone-100 bg-white p-6 shadow-2xl md:p-8">
        <p className="wedding-kicker mb-2">Confirm Action</p>
        <h3 className="font-serif text-2xl text-stone-900 md:text-3xl">{title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-stone-600">{message}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button onClick={onCancel} className="wedding-button-secondary w-full whitespace-normal text-center leading-snug sm:w-auto sm:max-w-full">
            Cancel
          </button>
          {secondaryActionLabel && onSecondaryAction ? (
            <button
              onClick={() => void onSecondaryAction()}
              className={`wedding-button-secondary w-full whitespace-normal text-center leading-snug sm:w-auto sm:max-w-full ${
                secondaryActionTone === "danger" ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" : ""
              }`}
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            onClick={() => void onConfirm()}
            className={`wedding-button-primary w-full whitespace-normal text-center leading-snug sm:w-auto sm:max-w-full ${
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
