"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const normalizeInviteCode = (value?: string | null) => (value || "").trim().toUpperCase();
const parseNameAliases = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);

const formatTables = (tables: number[]) => {
  if (tables.length === 0) return "Needs Table";
  return tables.map((table) => `Table ${table}`).join(", ");
};

const getGuestStatus = (guest?: GuestResponse | null): CoordinatorGuest["status"] => {
  if (!guest) return "Unlinked";
  if (guest.attending === true) return "Attending";
  if (guest.attending === false) return "Declined";
  return "Pending";
};

const getExpectedSeats = (guest: GuestResponse) =>
  guest.attending === true ? Math.max(1, guest.confirmed_guests || 1) : Math.max(1, guest.max_guests || 1);

export default function CoordinatorGuestListPage() {
  const [authorized, setAuthorized] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [responses, setResponses] = useState<GuestResponse[]>([]);
  const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<"table" | "name">("table");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

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
    window.queueMicrotask(() => {
      setAuthorized(window.sessionStorage.getItem("isLoggedIn") === "true");
      setIsCheckingSession(false);
    });
  }, []);

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

  const stats = useMemo(() => {
    const needsTable = coordinatorGuests.filter((guest) => guest.tables.length === 0).length;
    const aliasCount = coordinatorGuests.filter((guest) => guest.aliases.length > 0).length;
    const tableCount = new Set(coordinatorGuests.flatMap((guest) => guest.tables)).size;
    return { guests: coordinatorGuests.length, needsTable, aliasCount, tableCount };
  }, [coordinatorGuests]);

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
            Sign in to Studio Pro before opening the day-of coordinator guest list.
          </p>
          <Link href="/studio-pro" className="wedding-button-primary mt-8">
            Open Studio Pro
          </Link>
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

          .print-table {
            font-size: 11px;
          }

          .print-table th {
            color: #44403c !important;
          }

          .print-table td,
          .print-table th {
            padding: 7px 8px !important;
          }
        }
      `}</style>

      <header className="screen-only sticky top-0 z-40 border-b border-stone-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur md:px-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="wedding-kicker mb-1">Studio Pro</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-2xl tracking-tight text-stone-900 md:text-3xl">Coordinator Guest List</h1>
              <DatabaseEnvironmentBadge />
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-500">
              Day-of list with guest names, search aliases, table numbers, and seating counts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/studio-pro" className="studio-compact-button">
              Studio Pro
            </Link>
            <Link href="/studio-pro/floor-plan" className="studio-compact-button">
              Floor Plan
            </Link>
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

          <div className="screen-only mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
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
            <button type="button" onClick={() => void fetchCoordinatorData()} disabled={isLoading} className="studio-compact-button">
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-[18px] border border-stone-100">
            <table className="print-table w-full border-collapse bg-white text-left">
              <thead className="bg-stone-50 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                <tr>
                  <th className="px-4 py-3">Guest Name</th>
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Seats</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredGuests.map((guest) => (
                  <tr key={guest.key} className={guest.tables.length === 0 ? "bg-rose-50/50" : "bg-white"}>
                    <td className="min-w-[240px] px-4 py-3 align-top">
                      <p className="font-serif text-lg leading-tight text-stone-900">{guest.name}</p>
                      {guest.aliases.length > 0 ? (
                        <p className="mt-1 text-xs leading-relaxed text-stone-500">
                          Aliases: <span className="font-semibold text-stone-700">{guest.aliases.join(", ")}</span>
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-stone-400">No aliases listed</p>
                      )}
                      {guest.inviteCode && (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">{guest.inviteCode}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] ${
                          guest.tables.length === 0 ? "bg-rose-100 text-rose-700" : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {formatTables(guest.tables)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-sm font-semibold text-stone-700">{guest.seatCount}</td>
                    <td className="px-4 py-3 align-top">
                      <CoordinatorStatusBadge status={guest.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

function CoordinatorStatusBadge({ status }: { status: CoordinatorGuest["status"] }) {
  const styles = {
    Attending: "bg-emerald-50 text-emerald-700",
    Pending: "bg-amber-50 text-amber-700",
    Declined: "bg-rose-50 text-rose-700",
    Unlinked: "bg-stone-100 text-stone-600",
  }[status];

  return <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] ${styles}`}>{status}</span>;
}
