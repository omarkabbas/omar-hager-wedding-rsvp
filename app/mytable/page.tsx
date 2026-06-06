"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";

type SeatingSearchEntry = { id?: number; name: string; table_number: number; name_aliases?: string | null; invite_code?: string | null };
type SeatingLookupOption = {
  key: string;
  displayName: string;
  secondaryName?: string;
  invitationName: string;
  tableNumbers: number[];
  searchValue: string;
  matchedAlias?: string;
};
type SeatingSuggestion = SeatingLookupOption;

const normalizeLookupName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getLookupTokens = (value: string) => normalizeLookupName(value).split(" ").filter(Boolean);
const formatLookupDisplayName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
const parseNameAliases = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getLastLookupToken = (value: string) => {
  const tokens = getLookupTokens(value);
  return tokens[tokens.length - 1] || "";
};

const getSeatingEntryKey = (entry: SeatingSearchEntry) =>
  entry.id != null
    ? `id:${entry.id}`
    : `${normalizeLookupName(entry.name)}|${entry.table_number}|${parseNameAliases(entry.name_aliases).map(normalizeLookupName).join(",")}`;
const normalizeInviteCode = (value?: string | null) => (value || "").trim().toUpperCase();
const getLookupGroupKey = (entry: SeatingSearchEntry) => {
  const inviteCode = normalizeInviteCode(entry.invite_code);
  return inviteCode ? `invite:${inviteCode}` : getSeatingEntryKey(entry);
};
const formatTableNumbers = (tableNumbers: number[]) => {
  if (tableNumbers.length <= 2) return tableNumbers.join(" & ");
  return `${tableNumbers.slice(0, -1).join(", ")} & ${tableNumbers[tableNumbers.length - 1]}`;
};
const formatTableInstruction = (tableNumbers: number[]) =>
  tableNumbers.length === 1 ? `Please head to table ${tableNumbers[0]}.` : `Please head to tables ${formatTableNumbers(tableNumbers)}.`;

const getEditDistance = (left: string, right: string) => {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const distances = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)),
  );

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      distances[row][column] = Math.min(
        distances[row - 1][column] + 1,
        distances[row][column - 1] + 1,
        distances[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return distances[left.length][right.length];
};

const getTypoSuggestionScore = (query: string, name: string) => {
  const normalizedQuery = normalizeLookupName(query);
  const normalizedName = normalizeLookupName(name);
  if (normalizedQuery.length < 3 || normalizedName.length < 3) return 0;

  const wholeDistance = getEditDistance(normalizedQuery, normalizedName);
  const wholeDistanceLimit = normalizedQuery.length <= 4 ? 1 : 2;
  if (wholeDistance <= wholeDistanceLimit) {
    return 480 - wholeDistance * 70 - Math.abs(normalizedName.length - normalizedQuery.length);
  }

  const queryTokens = getLookupTokens(query);
  const nameTokens = getLookupTokens(name);
  if (queryTokens.length === 0 || nameTokens.length === 0) return 0;

  const tokenDistances = queryTokens.map((queryToken) => {
    const tokenLimit = queryToken.length <= 4 ? 1 : 2;
    const bestDistance = Math.min(...nameTokens.map((nameToken) => getEditDistance(queryToken, nameToken)));
    return bestDistance <= tokenLimit ? bestDistance : Number.POSITIVE_INFINITY;
  });

  if (tokenDistances.some((distance) => !Number.isFinite(distance))) return 0;

  const totalDistance = tokenDistances.reduce((sum, distance) => sum + distance, 0);
  return 420 - totalDistance * 55 - Math.abs(nameTokens.length - queryTokens.length) * 12;
};

const looksLikeHouseholdEntry = (value: string) => {
  const normalized = normalizeLookupName(value);
  return [" and ", " & ", " mr ", " mrs ", " family", "household"].some((marker) => normalized.includes(marker));
};

const getSuggestionScore = (query: string, name: string) => {
  const normalizedQuery = normalizeLookupName(query);
  const normalizedName = normalizeLookupName(name);
  const queryTokens = getLookupTokens(query);
  const nameTokens = getLookupTokens(name);
  const queryLastToken = getLastLookupToken(query);
  const nameLastToken = getLastLookupToken(name);

  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedName === normalizedQuery) return 1000;
  if (normalizedName.startsWith(normalizedQuery)) return 900;

  const allTokensStart = queryTokens.length > 0 && queryTokens.every((token) => nameTokens.some((nameToken) => nameToken.startsWith(token)));
  if (allTokensStart) return 800 - Math.max(0, normalizedName.length - normalizedQuery.length);

  const allTokensIncluded = queryTokens.length > 0 && queryTokens.every((token) => nameTokens.some((nameToken) => nameToken.includes(token)));
  if (allTokensIncluded) return 700 - Math.max(0, normalizedName.length - normalizedQuery.length);

  const surnameMatchesHousehold =
    queryLastToken &&
    nameLastToken &&
    queryLastToken === nameLastToken &&
    looksLikeHouseholdEntry(name);

  if (surnameMatchesHousehold && queryTokens.length >= 2) {
    return 650 - Math.max(0, normalizedName.length - normalizedQuery.length);
  }

  if (surnameMatchesHousehold && queryTokens.length === 1) {
    return 550 - Math.max(0, normalizedName.length - normalizedQuery.length);
  }

  if (normalizedName.includes(normalizedQuery)) return 600 - Math.max(0, normalizedName.length - normalizedQuery.length);

  return 0;
};

const getEntrySuggestionScore = (query: string, entry: SeatingSearchEntry) => {
  const primaryScore = getSuggestionScore(query, entry.name);
  const aliases = parseNameAliases(entry.name_aliases);
  const aliasScore = aliases.reduce((bestScore, alias) => {
    const nextScore = getSuggestionScore(query, alias);
    return Math.max(bestScore, nextScore > 0 ? nextScore - 10 : 0);
  }, 0);
  const combinedScore = aliases.length > 0 ? Math.max(0, getSuggestionScore(query, [entry.name, ...aliases].join(" ")) - 5) : 0;

  return Math.max(primaryScore, aliasScore, combinedScore);
};

const getEntryTypoSuggestionScore = (query: string, entry: SeatingSearchEntry) => {
  const primaryScore = getTypoSuggestionScore(query, entry.name);
  const aliases = parseNameAliases(entry.name_aliases);
  const aliasScore = aliases.reduce((bestScore, alias) => {
    const nextScore = getTypoSuggestionScore(query, alias);
    return Math.max(bestScore, nextScore > 0 ? nextScore - 10 : 0);
  }, 0);
  const combinedScore = aliases.length > 0 ? Math.max(0, getTypoSuggestionScore(query, [entry.name, ...aliases].join(" ")) - 5) : 0;

  return Math.max(primaryScore, aliasScore, combinedScore);
};

const getBestMatchingAlias = (query: string, entry: SeatingSearchEntry) => {
  const normalizedQuery = normalizeLookupName(query);
  if (!normalizedQuery) return null;

  return (
    parseNameAliases(entry.name_aliases)
      .map((alias) => ({ alias, score: getSuggestionScore(query, alias) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.alias.localeCompare(right.alias))[0]?.alias || null
  );
};

const getEntryDisplayMatch = (
  query: string,
  entry: SeatingSearchEntry,
): { displayName: string; secondaryName?: string; matchedAlias?: string } => {
  const alias = getBestMatchingAlias(query, entry);
  if (!alias) return { displayName: formatLookupDisplayName(entry.name) };

  const normalizedQuery = normalizeLookupName(query);
  const normalizedAlias = normalizeLookupName(alias);
  const primaryScore = getSuggestionScore(query, entry.name);
  const aliasStartsWithQuery = normalizedAlias.startsWith(normalizedQuery);
  const exactAliasMatch = normalizedAlias === normalizedQuery;
  const shouldLeadWithAlias = exactAliasMatch || aliasStartsWithQuery || primaryScore === 0;

  if (!shouldLeadWithAlias) return { displayName: formatLookupDisplayName(entry.name) };

  return {
    displayName: formatLookupDisplayName(alias),
    secondaryName: normalizeLookupName(alias) === normalizeLookupName(entry.name) ? undefined : formatLookupDisplayName(entry.name),
    matchedAlias: formatLookupDisplayName(alias),
  };
};

const getEntryTypoDisplayMatch = (
  query: string,
  entry: SeatingSearchEntry,
): { displayName: string; secondaryName?: string; matchedAlias?: string } => {
  const primaryScore = getTypoSuggestionScore(query, entry.name);
  const alias =
    parseNameAliases(entry.name_aliases)
      .map((aliasName) => ({ alias: aliasName, score: getTypoSuggestionScore(query, aliasName) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.alias.localeCompare(right.alias))[0]?.alias || null;

  if (!alias) return { displayName: formatLookupDisplayName(entry.name) };

  const aliasScore = getTypoSuggestionScore(query, alias) - 10;
  if (primaryScore >= aliasScore) return { displayName: formatLookupDisplayName(entry.name) };

  return {
    displayName: formatLookupDisplayName(alias),
    secondaryName: normalizeLookupName(alias) === normalizeLookupName(entry.name) ? undefined : formatLookupDisplayName(entry.name),
    matchedAlias: formatLookupDisplayName(alias),
  };
};

const buildLookupOption = (query: string, key: string, entries: SeatingSearchEntry[]): SeatingLookupOption & { score: number } => {
  const rankedEntries = [...entries].sort(
    (left, right) => getEntrySuggestionScore(query, right) - getEntrySuggestionScore(query, left) || left.name.localeCompare(right.name),
  );
  const bestEntry = rankedEntries[0];
  const display = getEntryDisplayMatch(query, bestEntry);
  const tableNumbers = Array.from(new Set(entries.map((entry) => entry.table_number))).sort((left, right) => left - right);

  return {
    key,
    displayName: display.displayName,
    secondaryName: display.secondaryName,
    invitationName: formatLookupDisplayName(bestEntry.name),
    tableNumbers,
    searchValue: display.displayName,
    matchedAlias: display.matchedAlias,
    score: Math.max(...entries.map((entry) => getEntrySuggestionScore(query, entry))),
  };
};

const buildLookupOptions = (query: string, entries: SeatingSearchEntry[]) => {
  const groups = new Map<string, SeatingSearchEntry[]>();

  entries.forEach((entry) => {
    const key = getLookupGroupKey(entry);
    groups.set(key, [...(groups.get(key) || []), entry]);
  });

  return Array.from(groups.entries())
    .map(([key, groupedEntries]) => buildLookupOption(query, key, groupedEntries))
    .filter((option) => option.score > 0)
    .sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName))
    .map(
      (option): SeatingLookupOption => ({
        key: option.key,
        displayName: option.displayName,
        secondaryName: option.secondaryName,
        invitationName: option.invitationName,
        tableNumbers: option.tableNumbers,
        searchValue: option.searchValue,
        matchedAlias: option.matchedAlias,
      }),
    );
};

const getLookupOptionByKey = (query: string, key: string, entries: SeatingSearchEntry[]) => {
  const groupedEntries = entries.filter((entry) => getLookupGroupKey(entry) === key);
  if (groupedEntries.length === 0) return null;
  const { score, ...option } = buildLookupOption(query, key, groupedEntries);
  return score > 0 ? option : null;
};

const buildSuggestions = (query: string, entries: SeatingSearchEntry[]) => {
  const seen = new Set<string>();

  return buildLookupOptions(query, entries)
    .filter((suggestion) => {
      const key = `${normalizeLookupName(suggestion.displayName)}|${normalizeLookupName(suggestion.invitationName)}|${suggestion.tableNumbers.join(",")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
};

const buildTypoLookupOption = (query: string, key: string, entries: SeatingSearchEntry[]): SeatingLookupOption & { score: number } => {
  const rankedEntries = [...entries].sort(
    (left, right) => getEntryTypoSuggestionScore(query, right) - getEntryTypoSuggestionScore(query, left) || left.name.localeCompare(right.name),
  );
  const bestEntry = rankedEntries[0];
  const display = getEntryTypoDisplayMatch(query, bestEntry);
  const tableNumbers = Array.from(new Set(entries.map((entry) => entry.table_number))).sort((left, right) => left - right);

  return {
    key,
    displayName: display.displayName,
    secondaryName: display.secondaryName,
    invitationName: formatLookupDisplayName(bestEntry.name),
    tableNumbers,
    searchValue: display.displayName,
    matchedAlias: display.matchedAlias,
    score: Math.max(...entries.map((entry) => getEntryTypoSuggestionScore(query, entry))),
  };
};

const buildTypoSuggestions = (query: string, entries: SeatingSearchEntry[]) => {
  const groups = new Map<string, SeatingSearchEntry[]>();
  const seen = new Set<string>();

  entries.forEach((entry) => {
    const key = getLookupGroupKey(entry);
    groups.set(key, [...(groups.get(key) || []), entry]);
  });

  return Array.from(groups.entries())
    .map(([key, groupedEntries]) => buildTypoLookupOption(query, key, groupedEntries))
    .filter((option) => option.score > 0)
    .sort((left, right) => right.score - left.score || left.displayName.localeCompare(right.displayName))
    .filter((suggestion) => {
      const key = `${normalizeLookupName(suggestion.displayName)}|${normalizeLookupName(suggestion.invitationName)}|${suggestion.tableNumbers.join(",")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(
      (option): SeatingLookupOption => ({
        key: option.key,
        displayName: option.displayName,
        secondaryName: option.secondaryName,
        invitationName: option.invitationName,
        tableNumbers: option.tableNumbers,
        searchValue: option.searchValue,
        matchedAlias: option.matchedAlias,
      }),
    );
};

export default function MyTablePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmedResult, setConfirmedResult] = useState<SeatingLookupOption | null>(null);
  const [choiceOptions, setChoiceOptions] = useState<SeatingLookupOption[]>([]);
  const [suggestions, setSuggestions] = useState<SeatingSuggestion[]>([]);
  const [fallbackSuggestions, setFallbackSuggestions] = useState<SeatingSuggestion[]>([]);
  const [seatingEntries, setSeatingEntries] = useState<SeatingSearchEntry[]>([]);
  const [isSeatingAliasesAvailable, setIsSeatingAliasesAvailable] = useState<boolean | null>(null);
  const [isSeatingInviteCodeAvailable, setIsSeatingInviteCodeAvailable] = useState<boolean | null>(null);
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState<boolean | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const resultSectionRef = useRef<HTMLDivElement | null>(null);
  const seatingSelectColumns = [
    "id",
    "name",
    "table_number",
    isSeatingAliasesAvailable ? "name_aliases" : null,
    isSeatingInviteCodeAvailable ? "invite_code" : null,
  ]
    .filter(Boolean)
    .join(", ");

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .eq("key", "is_seating_chart_enabled")
        .single();

      setIsSeatingChartEnabled(data?.value === "true");
    };

    const fetchSeating = async () => {
      const { data } = await supabase
        .from("seating")
        .select(seatingSelectColumns)
        .order("name", { ascending: true });
      setSeatingEntries((data as SeatingSearchEntry[] | null) || []);
    };

    const detectSeatingAliasesColumn = async () => {
      const { error } = await supabase.from("seating").select("name_aliases").limit(1);
      setIsSeatingAliasesAvailable(!error);
    };

    const detectSeatingInviteCodeColumn = async () => {
      const { error } = await supabase.from("seating").select("invite_code").limit(1);
      setIsSeatingInviteCodeAvailable(!error);
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchSettings();
        void fetchSeating();
      }
    };

    void fetchSettings();
    void detectSeatingAliasesColumn();
    void detectSeatingInviteCodeColumn();

    const channel = supabase
      .channel("mytable_live_settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings", filter: "key=eq.is_seating_chart_enabled" },
        (payload) => {
          if (!payload.new) return;
          const settingValue = (payload.new as { value?: string }).value;
          if (typeof settingValue !== "string") return;
          setIsSeatingChartEnabled(settingValue === "true");
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "seating" }, () => {
        void fetchSeating();
      })
      .subscribe();
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [isSeatingAliasesAvailable, isSeatingInviteCodeAvailable, seatingSelectColumns]);

  useEffect(() => {
    if (isSeatingAliasesAvailable === null || isSeatingInviteCodeAvailable === null) return;

    const fetchSeating = async () => {
      const { data } = await supabase
        .from("seating")
        .select(seatingSelectColumns)
        .order("name", { ascending: true });
      setSeatingEntries((data as SeatingSearchEntry[] | null) || []);
    };

    void fetchSeating();
  }, [isSeatingAliasesAvailable, isSeatingInviteCodeAvailable, seatingSelectColumns]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) {
        setSuggestions([]);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!confirmedResult && choiceOptions.length === 0) return;

    const scrollToResult = window.setTimeout(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);

    return () => window.clearTimeout(scrollToResult);
  }, [choiceOptions.length, confirmedResult]);

  const showConfirmedResult = (option: SeatingLookupOption) => {
    setConfirmedResult(option);
    setChoiceOptions([]);
    setSuggestions([]);
    setFallbackSuggestions([]);
  };

  const selectLookupOption = (option: SeatingLookupOption) => {
    setSearchQuery(option.searchValue);
    setSearchAttempted(true);
    setActiveSuggestionIndex(0);
    showConfirmedResult(option);
    window.requestAnimationFrame(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const performSearch = async (name: string, selectedOptionKey?: string) => {
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    setSearchAttempted(true);
    setSearchQuery(trimmedName);
    setActiveSuggestionIndex(0);

    const normalizedQuery = normalizeLookupName(trimmedName);
    const selectedOption = selectedOptionKey ? getLookupOptionByKey(trimmedName, selectedOptionKey, seatingEntries) : null;

    if (selectedOption) {
      showConfirmedResult(selectedOption);
      return;
    }

    const rankedMatches = [...seatingEntries]
      .map((entry) => ({ entry, score: getEntrySuggestionScore(trimmedName, entry) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name));

    const exactAliasMatches = seatingEntries.filter((entry) =>
      parseNameAliases(entry.name_aliases).some((alias) => normalizeLookupName(alias) === normalizedQuery),
    );
    const exactNameMatches = seatingEntries.filter((entry) => normalizeLookupName(entry.name) === normalizedQuery);
    const topScore = rankedMatches[0]?.score || 0;
    const topRankedMatches = topScore > 0 ? rankedMatches.filter(({ score }) => score === topScore).map(({ entry }) => entry) : [];
    const matches = exactAliasMatches.length > 0 ? exactAliasMatches : exactNameMatches.length > 0 ? exactNameMatches : topRankedMatches;
    const options = buildLookupOptions(trimmedName, matches);

    if (options.length === 1) {
      showConfirmedResult(options[0]);
      return;
    }

    setConfirmedResult(null);
    setChoiceOptions(options);
    setSuggestions([]);
    setFallbackSuggestions(options.length > 0 ? [] : buildTypoSuggestions(trimmedName, seatingEntries));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSearch(searchQuery);
  };

  const handleSearchQueryChange = async (query: string, resetAttempt = true, clearSearchResult = true) => {
    setSearchQuery(query);
    setActiveSuggestionIndex(0);
    if (clearSearchResult) {
      setConfirmedResult(null);
      setChoiceOptions([]);
      setFallbackSuggestions([]);
    }

    if (query.trim().length === 0) {
      setSearchAttempted(false);
      setSuggestions([]);
      setFallbackSuggestions([]);
      return;
    }

    if (resetAttempt) {
      setSearchAttempted(false);
    }

    setSuggestions(buildSuggestions(query, seatingEntries));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prevIndex) => (prevIndex + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prevIndex) => (prevIndex - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const selectedSuggestion = suggestions[activeSuggestionIndex];
      selectLookupOption(selectedSuggestion);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  const resetSearch = () => {
    setSearchQuery("");
    setConfirmedResult(null);
    setChoiceOptions([]);
    setSuggestions([]);
    setFallbackSuggestions([]);
    setSearchAttempted(false);
    setActiveSuggestionIndex(0);
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  if (isSeatingChartEnabled === null) {
    return (
      <div className="wedding-shell">
        <div className="wedding-backdrop" />
        <Navigation />
        <main className="wedding-main wedding-center text-center">
          <section className="wedding-page-panel wedding-animate-fade text-center">
            <div className="mx-auto mb-6 h-20 w-20 animate-pulse rounded-full bg-stone-100" />
            <p className="wedding-kicker mb-3">Seating</p>
            <div className="mx-auto mb-4 h-10 w-48 animate-pulse rounded-full bg-stone-100" />
            <div className="mx-auto h-5 w-64 max-w-full animate-pulse rounded-full bg-stone-100" />
          </section>
        </main>
      </div>
    );
  }

  if (isSeatingChartEnabled === false) {
    return (
      <div className="wedding-shell">
        <div className="wedding-backdrop" />
        <Navigation />
        <main className="wedding-main wedding-center text-center">
          <section className="wedding-page-panel wedding-animate-up max-w-lg text-center">
            <div className="flex justify-center mb-6">
              <Image
                src="/logo.png"
                alt="Omar & Hager logo"
                width={80}
                height={80}
                className="wedding-logo w-20"
              />
            </div>
            <p className="wedding-kicker mb-3">Seating</p>
            <h1 className="wedding-state-title mb-4 text-[#4E5E72]">Coming Soon</h1>
            <p className="wedding-lead">
              The seating chart is not yet available. Please check back later.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="wedding-shell">
      <div className="wedding-backdrop" />
      <Navigation />

      <main className="wedding-main wedding-center text-center">
        <section className="wedding-page-panel wedding-animate-up text-center">
          <div className="flex justify-center mb-4 md:mb-6">
            <Image
              src="/logo.png"
              alt="Omar & Hager logo"
              width={96}
              height={96}
              className="wedding-logo w-20 md:w-24"
            />
          </div>

          <p className="wedding-kicker mb-3">Seating</p>
          <h1 className="wedding-page-title mb-3 text-[#4E5E72]">Find your table</h1>
          <p className="wedding-lead mb-6 md:mb-8">
            Type your name or your family&apos;s party name. Choose the match that feels right and your table will pop up.
          </p>

          <form onSubmit={handleSearch} className="space-y-4">
            <div ref={searchBoxRef} className="relative text-left">
              <label className="wedding-kicker block ml-2 mb-2">Guest or Party Name</label>
              <div className="relative mt-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => void handleSearchQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Your name or party name"
                  className="wedding-input"
                  autoComplete="name"
                  autoCapitalize="words"
                  enterKeyHint="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={suggestions.length > 0}
                  aria-controls={suggestions.length > 0 ? "table-search-suggestions" : undefined}
                />

                {suggestions.length > 0 && (
                  <ul id="table-search-suggestions" className="absolute z-20 w-full mt-2 overflow-auto rounded-[24px] border border-stone-100 bg-white text-left shadow-xl max-h-64">
                    {suggestions.map((suggestion, index) => (
                      <li
                        key={suggestion.key}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          selectLookupOption(suggestion);
                        }}
                        className={`px-5 py-4 cursor-pointer text-stone-700 transition-colors border-b border-stone-50 last:border-none ${
                          index === activeSuggestionIndex ? "bg-stone-50 font-bold text-stone-900" : "hover:bg-stone-50"
                        }`}
                      >
                        <span className="block text-sm font-semibold leading-snug">{suggestion.displayName}</span>
                        {suggestion.secondaryName && (
                          <span className="mt-1 block text-xs font-medium leading-snug text-stone-500">
                            Listed under {suggestion.secondaryName}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={searchQuery.trim().length === 0} className="wedding-button-primary w-full disabled:cursor-not-allowed disabled:opacity-45">
                Show My Table
              </button>
              {(searchQuery.trim().length > 0 || confirmedResult || choiceOptions.length > 0 || searchAttempted) && (
                <button type="button" onClick={resetSearch} className="wedding-button-secondary w-full sm:w-auto">
                  Start Over
                </button>
              )}
            </div>
          </form>

          {choiceOptions.length > 0 && !confirmedResult && (
            <div ref={resultSectionRef} className="wedding-animate-up scroll-mt-24 mt-5 md:mt-7">
              <div className="wedding-subpanel px-5 py-6 text-left md:px-7 md:py-7">
                <p className="wedding-kicker mb-3 text-center">Choose Your Match</p>
                <h2 className="wedding-subtitle mb-3 text-center text-[#4E5E72]">We found a few possible matches.</h2>
                <p className="wedding-copy mx-auto mb-5 max-w-lg text-center">
                  Select the name or party that matches your invitation, then your table will appear.
                </p>
                <div className="space-y-2">
                  {choiceOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        selectLookupOption(option);
                      }}
                      className="w-full rounded-[20px] border border-stone-100 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:border-stone-200 hover:bg-stone-50"
                    >
                      <span className="block text-sm font-semibold leading-snug text-stone-800">{option.displayName}</span>
                      <span className="mt-1 block text-xs font-medium leading-snug text-stone-500">
                        {option.secondaryName ? `Listed under ${option.secondaryName}` : `Invitation name: ${option.invitationName}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {confirmedResult && (
            <div ref={resultSectionRef} className="wedding-animate-up scroll-mt-24 mt-5 md:mt-7">
              <div className="space-y-4">
                <div className="wedding-subpanel overflow-hidden px-5 py-5 md:px-8 md:py-7">
                  <div className="mx-auto mb-5 w-full rounded-[24px] border border-white bg-white px-5 py-5 shadow-sm">
                    <p className="wedding-kicker mb-2 text-stone-500">
                      {confirmedResult.tableNumbers.length === 1 ? "Your Table" : "Your Tables"}
                    </p>
                    <p className="font-serif text-5xl leading-none text-[#4E5E72] md:text-6xl">{formatTableNumbers(confirmedResult.tableNumbers)}</p>
                  </div>
                  <p className="wedding-lead text-lg mb-2">Welcome, {confirmedResult.displayName}.</p>
                  {confirmedResult.matchedAlias && confirmedResult.invitationName !== confirmedResult.displayName && (
                    <p className="mb-4 text-sm font-semibold leading-relaxed text-stone-500">
                      Listed under {confirmedResult.invitationName}
                    </p>
                  )}
                  <p className="wedding-copy mx-auto max-w-md">
                    {formatTableInstruction(confirmedResult.tableNumbers)} If you need help, show this screen to anyone helping with seating.
                  </p>
                </div>
              </div>
              <button type="button" onClick={resetSearch} className="wedding-button-secondary mt-4 w-full">
                Search Another Name
              </button>
            </div>
          )}

          {searchAttempted && !confirmedResult && choiceOptions.length === 0 && searchQuery.trim().length > 0 && (
            <div className="wedding-animate-up mt-8 md:mt-10">
              <div className="wedding-divider mb-8" />
              <div className="wedding-subpanel px-6 py-7 text-center md:px-8 md:py-8">
                <p className="wedding-kicker mb-3">Need Help?</p>
                <h2 className="wedding-subtitle mb-3 text-[#4E5E72]">We couldn&apos;t find a table under that name just yet.</h2>
                <p className="wedding-copy mx-auto max-w-lg">
                  Please try the name as it appears on your invitation. If you still need help when you arrive, a
                  member of our family will be happy to assist you.
                </p>
                {fallbackSuggestions.length > 0 ? (
                  <div className="mt-5">
                    <p className="wedding-kicker mb-3">Did You Mean</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {fallbackSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.key}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            selectLookupOption(suggestion);
                          }}
                          className="wedding-button-secondary"
                        >
                          {suggestion.displayName}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
