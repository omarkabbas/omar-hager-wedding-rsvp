"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";

import { supabase } from "@/lib/supabase";
import { DatabaseEnvironmentBadge } from "../DatabaseEnvironmentBadge";

type GuestResponse = {
  id: string;
  guest_name: string;
  invite_code: string;
  attending: boolean | null;
  confirmed_guests: number | null;
  max_guests: number;
  virtual_guest?: boolean | null;
};

type SeatingAssignment = {
  id: number;
  name: string;
  name_aliases?: string | null;
  invite_code?: string | null;
  table_number: number;
  guest_count?: number | null;
};

type CoordinatorGuest = {
  key: string;
  name: string;
  aliases: string[];
  inviteCode: string | null;
  tables: number[];
  seatCount: number;
  status: "Attending" | "Pending" | "Declined" | "Unlinked";
};

type CoordinatorTableGroup = {
  key: string;
  tableNumber: number | null;
  title: string;
  guests: CoordinatorGuest[];
  seatCount: number;
};

const normalizeInviteCode = (value?: string | null) => (value || "").trim().toUpperCase();
const parseNameAliases = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);

const getGuestStatus = (guest?: GuestResponse | null): CoordinatorGuest["status"] => {
  if (!guest) return "Unlinked";
  if (guest.attending === true) return "Attending";
  if (guest.attending === false) return "Declined";
  return "Pending";
};

const getExpectedSeats = (guest: GuestResponse) =>
  guest.attending === true ? Math.max(1, guest.confirmed_guests || 1) : Math.max(1, guest.max_guests || 1);
const normalizeAccessCode = (value?: string | null) => (value || "").trim().toUpperCase();

const COORDINATOR_ACCESS_SESSION_KEY = "studio_pro_coordinator_access_code_v1";

export default function CoordinatorGuestListPage() {
  const [authorized, setAuthorized] = useState(false);
  const [accessMode, setAccessMode] = useState<"studio" | "shared" | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [responses, setResponses] = useState<GuestResponse[]>([]);
  const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"table" | "name">("table");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareAccessCode, setShareAccessCode] = useState("");
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [accessError, setAccessError] = useState("");

  const fetchCoordinatorData = useCallback(async () => {
    setIsLoading(true);
    const [rsvpResult, seatingResult] = await Promise.all([
      supabase.from("rsvp_list").select("*").order("guest_name", { ascending: true }),
      supabase.from("seating").select("*").order("table_number", { ascending: true }).order("name", { ascending: true }),
    ]);

    if (!rsvpResult.error) setResponses((rsvpResult.data || []) as GuestResponse[]);
    if (!seatingResult.error) setSeatingAssignments((seatingResult.data || []) as SeatingAssignment[]);

    setLastUpdatedAt(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const checkAccess = async () => {
      if (window.sessionStorage.getItem("isLoggedIn") === "true") {
        setAuthorized(true);
        setAccessMode("studio");
        setIsCheckingSession(false);
        return;
      }

      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["is_coordinator_share_enabled", "coordinator_share_code"]);

      const settingsMap = Object.fromEntries((data || []).map((setting) => [setting.key, setting.value]));
      const enabled = settingsMap.is_coordinator_share_enabled === "true";
      const expectedCode = normalizeAccessCode(settingsMap.coordinator_share_code);
      const urlCode = normalizeAccessCode(
        new URLSearchParams(window.location.search).get("access") ||
          new URLSearchParams(window.location.search).get("code"),
      );
      const savedCode = normalizeAccessCode(window.sessionStorage.getItem(COORDINATOR_ACCESS_SESSION_KEY));
      const providedCode = urlCode || savedCode;

      setShareEnabled(enabled);
      setShareAccessCode(expectedCode);

      if (enabled && expectedCode && providedCode === expectedCode) {
        window.sessionStorage.setItem(COORDINATOR_ACCESS_SESSION_KEY, providedCode);
        setAuthorized(true);
        setAccessMode("shared");
      }

      setIsCheckingSession(false);
    };

    void checkAccess();
  }, []);

  const verifySharedAccess = (event: FormEvent) => {
    event.preventDefault();
    const cleanedInput = normalizeAccessCode(accessCodeInput);

    if (!shareEnabled || !shareAccessCode) {
      setAccessError("This shared coordinator link is not enabled yet.");
      return;
    }

    if (cleanedInput !== shareAccessCode) {
      setAccessError("That access code does not match this coordinator list.");
      return;
    }

    window.sessionStorage.setItem(COORDINATOR_ACCESS_SESSION_KEY, cleanedInput);
    setAccessError("");
    setAuthorized(true);
    setAccessMode("shared");
  };

  useEffect(() => {
    if (!authorized) return;

    window.queueMicrotask(() => {
      void fetchCoordinatorData();
    });
    const channel = supabase
      .channel("coordinator_guest_list")
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvp_list" }, () => void fetchCoordinatorData())
      .on("postgres_changes", { event: "*", schema: "public", table: "seating" }, () => void fetchCoordinatorData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authorized, fetchCoordinatorData]);

  const coordinatorGuests = useMemo(() => {
    const guestsByCode = new Map(responses.map((guest) => [normalizeInviteCode(guest.invite_code), guest]));
    const seatingDisplayNameByCode = new Map<string, string>();
    const assignedSeatsByCode = seatingAssignments.reduce((map, assignment) => {
      const inviteCode = normalizeInviteCode(assignment.invite_code);
      if (inviteCode) {
        map.set(inviteCode, (map.get(inviteCode) || 0) + Math.max(1, assignment.guest_count || 1));
        if (!seatingDisplayNameByCode.has(inviteCode) && assignment.name.trim()) {
          seatingDisplayNameByCode.set(inviteCode, assignment.name.trim());
        }
      }
      return map;
    }, new Map<string, number>());

    const assignedGuests = seatingAssignments.map((assignment) => {
      const inviteCode = normalizeInviteCode(assignment.invite_code);
      const linkedGuest = inviteCode ? guestsByCode.get(inviteCode) : null;

      return {
        key: `assignment:${assignment.id}`,
        name: assignment.name,
        aliases: parseNameAliases(assignment.name_aliases).sort((left, right) => left.localeCompare(right)),
        inviteCode: inviteCode || null,
        tables: [assignment.table_number],
        seatCount: Math.max(1, assignment.guest_count || 1),
        status: getGuestStatus(linkedGuest),
      };
    });

    const waitingGuests = responses
      .filter((guest) => guest.attending === true && guest.virtual_guest !== true)
      .flatMap((guest) => {
        const inviteCode = normalizeInviteCode(guest.invite_code);
        const expectedSeats = getExpectedSeats(guest);
        const assignedSeats = inviteCode ? assignedSeatsByCode.get(inviteCode) || 0 : 0;
        const waitingSeats = Math.max(0, expectedSeats - assignedSeats);
        if (waitingSeats === 0) return [];

        return [
          {
            key: `waiting:${inviteCode || guest.id}`,
            name: `${seatingDisplayNameByCode.get(inviteCode) || guest.guest_name} (${waitingSeats} unassigned ${
              waitingSeats === 1 ? "seat" : "seats"
            })`,
            aliases: [],
            inviteCode: inviteCode || null,
            tables: [],
            seatCount: waitingSeats,
            status: "Attending" as const,
          },
        ];
      });

    return [...assignedGuests, ...waitingGuests];
  }, [responses, seatingAssignments]);

  const filteredGuests = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = coordinatorGuests.filter((guest) => {
      if (!query) return true;
      return (
        guest.name.toLowerCase().includes(query) ||
        guest.aliases.some((alias) => alias.toLowerCase().includes(query)) ||
        guest.tables.some((table) => String(table).includes(query)) ||
        (guest.inviteCode || "").toLowerCase().includes(query)
      );
    });

    return filtered.sort((left, right) => {
      if (sortMode === "name") return left.name.localeCompare(right.name);
      const leftTable = left.tables[0] ?? Number.MAX_SAFE_INTEGER;
      const rightTable = right.tables[0] ?? Number.MAX_SAFE_INTEGER;
      return leftTable - rightTable || left.name.localeCompare(right.name);
    });
  }, [coordinatorGuests, search, sortMode]);

  const coordinatorTableGroups = useMemo(() => {
    const groups = new Map<string, CoordinatorTableGroup>();

    filteredGuests.forEach((guest) => {
      const tableNumbers = guest.tables.length > 0 ? guest.tables : [null];

      tableNumbers.forEach((tableNumber) => {
        const key = tableNumber === null ? "needs-table" : `table:${tableNumber}`;
        const existing = groups.get(key);

        if (existing) {
          existing.guests.push(guest);
          existing.seatCount += guest.seatCount;
          return;
        }

        groups.set(key, {
          key,
          tableNumber,
          title: tableNumber === null ? "Needs Table" : `Table ${tableNumber}`,
          guests: [guest],
          seatCount: guest.seatCount,
        });
      });
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        guests: [...group.guests].sort((left, right) => left.name.localeCompare(right.name)),
      }))
      .sort((left, right) => {
        if (sortMode === "name") {
          return (left.guests[0]?.name || "").localeCompare(right.guests[0]?.name || "");
        }

        if (left.tableNumber === null) return 1;
        if (right.tableNumber === null) return -1;
        return left.tableNumber - right.tableNumber;
      });
  }, [filteredGuests, sortMode]);

  const stats = useMemo(() => {
    const needsTable = coordinatorGuests.filter((guest) => guest.tables.length === 0).length;
    const aliasCount = coordinatorGuests.filter((guest) => guest.aliases.length > 0).length;
    const tableCount = new Set(coordinatorGuests.flatMap((guest) => guest.tables)).size;
    return { guests: coordinatorGuests.length, needsTable, aliasCount, tableCount };
  }, [coordinatorGuests]);

  const renderListTools = () => (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="wedding-inline-edit-input"
        placeholder="Search guest, alias, table, or RSVP code"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSortMode("table")}
          className={sortMode === "table" ? "studio-compact-button-primary" : "studio-compact-button"}
        >
          Sort Table
        </button>
        <button
          type="button"
          onClick={() => setSortMode("name")}
          className={sortMode === "name" ? "studio-compact-button-primary" : "studio-compact-button"}
        >
          Sort Name
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setViewMode("cards")}
          className={viewMode === "cards" ? "studio-compact-button-primary" : "studio-compact-button"}
        >
          Table Cards
        </button>
        <button
          type="button"
          onClick={() => setViewMode("list")}
          className={viewMode === "list" ? "studio-compact-button-primary" : "studio-compact-button"}
        >
          Guest List
        </button>
      </div>
      <button type="button" onClick={() => void fetchCoordinatorData()} disabled={isLoading} className="studio-compact-button">
        {isLoading ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );

  if (isCheckingSession) {
    return <div className="min-h-screen bg-[#eef3f8]" />;
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#eef3f8] px-4 py-10 text-stone-900">
        <section className="mx-auto max-w-xl rounded-[32px] border border-white/80 bg-white/90 px-8 py-10 text-center shadow-sm">
          <Image src="/logo.png" alt="Omar & Hager logo" width={88} height={88} className="wedding-logo mx-auto mb-5 w-20" />
          <p className="wedding-kicker mb-3">Private Access</p>
          <h1 className="font-serif text-3xl text-stone-900">Coordinator List</h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            {shareEnabled
              ? "Enter the day-of access code to open the read-only coordinator guest list."
              : "Sign in to Admin Studio before opening the day-of coordinator guest list."}
          </p>
          {shareEnabled ? (
            <form onSubmit={verifySharedAccess} className="mt-7 space-y-3">
              <input
                value={accessCodeInput}
                onChange={(event) => {
                  setAccessCodeInput(event.target.value.toUpperCase());
                  setAccessError("");
                }}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="wedding-inline-edit-input text-center uppercase"
                placeholder="Access code"
              />
              {accessError && <p className="text-sm font-semibold text-rose-700">{accessError}</p>}
              <button className="wedding-button-primary w-full">Open Coordinator List</button>
              <Link href="/studio-pro" className="wedding-button-secondary w-full">
                Admin Studio Login
              </Link>
            </form>
          ) : (
            <Link href="/studio-pro" className="wedding-button-primary mt-8">
              Open Admin Studio
            </Link>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-stone-900">
      <style jsx global>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.38in;
          }

          body {
            background: #fff !important;
          }

          .screen-only {
            display: none !important;
          }

          .print-sheet {
            box-shadow: none !important;
            border: 0 !important;
            padding: 0 !important;
          }

          .coordinator-table-name-list {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }

          .coordinator-table-name-card {
            break-inside: avoid;
            border-radius: 0 !important;
            padding: 8px 10px !important;
          }

          .coordinator-table-name-card h3 {
            font-size: 16px !important;
            padding-bottom: 5px !important;
          }

          .coordinator-table-name-card li {
            font-size: 12px !important;
            padding: 3px 0 !important;
          }

          .coordinator-guest-row {
            grid-template-columns: 22px minmax(0, 1fr) !important;
            gap: 7px !important;
          }

          .coordinator-guest-number {
            height: 20px !important;
            width: 20px !important;
            font-size: 10px !important;
          }
        }
      `}</style>

      <header className="screen-only sticky top-0 z-40 border-b border-stone-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur md:px-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="wedding-kicker mb-1">Admin Studio</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl tracking-tight text-stone-900 md:text-3xl">Coordinator Guest List</h1>
              {accessMode === "studio" ? <DatabaseEnvironmentBadge /> : null}
              {accessMode === "shared" ? (
                <span className="rounded-full bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700 ring-1 ring-sky-100">
                  Shared View
                </span>
              ) : null}
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-500">
              Day-of list with guest names, search aliases, table numbers, and seating counts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {accessMode === "studio" ? (
              <>
                <Link href="/studio-pro" className="studio-compact-button">
                  Admin Studio
                </Link>
                <Link href="/studio-pro/floor-plan" className="studio-compact-button">
                  Floor Plan
                </Link>
              </>
            ) : null}
            <button type="button" onClick={() => window.print()} className="studio-compact-button-primary">
              Export PDF
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 md:px-5 md:py-6">
        <section className="print-sheet rounded-[26px] border border-white/85 bg-white/95 p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <Image src="/logo.png" alt="Omar & Hager logo" width={64} height={64} className="wedding-logo w-14" />
                <div>
                  <p className="wedding-kicker mb-1">Day-Of Coordinator Packet</p>
                  <h2 className="font-serif text-3xl tracking-tight text-[#4E5E72] md:text-4xl">Guest Tables</h2>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-stone-500">
                Guest names are listed with aliases underneath when available. Use table numbers for check-in, escort cards, and quick day-of questions.
              </p>
              {lastUpdatedAt && (
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                  Updated {lastUpdatedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:min-w-[430px]">
              <CoordinatorMetric label="Guests" value={stats.guests} />
              <CoordinatorMetric label="Tables" value={stats.tableCount} />
              <CoordinatorMetric label="With Aliases" value={stats.aliasCount} />
              <CoordinatorMetric label="Needs Table" value={stats.needsTable} tone={stats.needsTable > 0 ? "rose" : "stone"} />
            </div>
          </div>

          <details className="screen-only group mt-5 rounded-[18px] border border-stone-100 bg-stone-50/80 p-3 shadow-sm md:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">List Tools</span>
                <span className="mt-1 block text-sm font-medium text-stone-500">Search, sort, switch view, or refresh.</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-stone-500 ring-1 ring-stone-200">
                  {filteredGuests.length} shown
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-stone-400">
                  <span className="group-open:hidden">Open</span>
                  <span className="hidden group-open:inline">Hide</span>
                </span>
              </span>
            </summary>
            <div className="mt-3">{renderListTools()}</div>
          </details>

          <div className="screen-only mt-5 hidden rounded-[18px] border border-stone-100 bg-stone-50/80 p-3 shadow-sm md:block">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">List Tools</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-stone-500 ring-1 ring-stone-200">
                {filteredGuests.length} shown
              </span>
            </div>
            {renderListTools()}
          </div>

          {viewMode === "cards" ? (
            <div className="coordinator-table-name-list coordinator-view-cards mt-6 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {coordinatorTableGroups.map((group) => (
                <section
                  key={group.key}
                  className={`coordinator-table-name-card break-inside-avoid rounded-[14px] border bg-white px-3 py-3 ${
                    group.tableNumber === null ? "border-rose-200 bg-rose-50/45" : "border-stone-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-2">
                    <h3 className="font-serif text-xl font-medium leading-none text-[#4E5E72]">{group.title}</h3>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${
                        group.tableNumber === null ? "bg-rose-100 text-rose-700" : "bg-stone-50 text-stone-600 ring-1 ring-stone-200"
                      }`}
                    >
                      {group.seatCount} seat{group.seatCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <ol className="mt-2 space-y-0 p-0">
                    {group.guests.length === 0 ? (
                      <li className="list-none py-2 text-xs italic text-stone-400">No guests assigned</li>
                    ) : (
                      group.guests.map((guest, guestIndex) => (
                        <li
                          key={guest.key}
                          className="coordinator-guest-row grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-stone-100 py-2 last:border-b-0"
                        >
                          <span className="coordinator-guest-number mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-stone-50 text-xs font-bold text-stone-500 ring-1 ring-stone-100">
                            {guestIndex + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <strong className="min-w-0 font-serif text-[15px] font-medium leading-tight text-stone-900">
                                {guest.name}
                              </strong>
                              <span className="shrink-0 rounded-full bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-600 ring-1 ring-stone-100">
                                {guest.seatCount} seat{guest.seatCount === 1 ? "" : "s"}
                              </span>
                            </div>
                            {guest.aliases.length > 0 && (
                              <span className="mt-1 block text-[11px] leading-snug text-stone-500">
                                Aliases: {guest.aliases.join(", ")}
                              </span>
                            )}
                            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                              {guest.inviteCode || "No RSVP code"}
                              {guest.status !== "Attending" ? ` · ${guest.status}` : ""}
                            </span>
                          </div>
                        </li>
                      ))
                    )}
                  </ol>
                </section>
              ))}
            </div>
          ) : (
            <section className="coordinator-view-list mt-6 overflow-hidden rounded-[18px] border border-stone-200 bg-white">
              <div className="hidden grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_120px_110px] gap-3 border-b border-stone-100 bg-stone-50 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500 md:grid">
                <span>Table</span>
                <span>Guest Name</span>
                <span>Aliases</span>
                <span>RSVP Code</span>
                <span className="text-right">Seats</span>
              </div>
              <div className="divide-y divide-stone-100">
                {filteredGuests.map((guest) => (
                  <div key={guest.key} className="grid gap-2 px-4 py-3 md:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_120px_110px] md:items-center md:gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#4E5E72]">
                      {guest.tables.length > 0 ? guest.tables.map((table) => `Table ${table}`).join(", ") : "Needs Table"}
                    </span>
                    <div>
                      <p className="font-serif text-lg leading-tight text-stone-900">{guest.name}</p>
                      {guest.status !== "Attending" && (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-600">{guest.status}</p>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-stone-500">{guest.aliases.length > 0 ? guest.aliases.join(", ") : "None"}</p>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{guest.inviteCode || "No Code"}</p>
                    <p className="text-sm font-bold text-stone-700 md:text-right">
                      {guest.seatCount} seat{guest.seatCount === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!isLoading && filteredGuests.length === 0 && (
            <div className="rounded-b-[18px] border-x border-b border-stone-100 bg-stone-50 px-5 py-8 text-center">
              <p className="font-serif text-xl text-stone-900">No guests match this search</p>
              <p className="mt-2 text-sm text-stone-500">Try a guest name, alias, table number, or RSVP code.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function CoordinatorMetric({ label, value, tone = "stone" }: { label: string; value: number; tone?: "stone" | "rose" }) {
  return (
    <div className={`rounded-[16px] border px-3 py-3 ${tone === "rose" ? "border-rose-100 bg-rose-50 text-rose-800" : "border-stone-100 bg-stone-50 text-stone-800"}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-65">{label}</p>
      <p className="mt-1 font-serif text-3xl leading-none">{value}</p>
    </div>
  );
}
