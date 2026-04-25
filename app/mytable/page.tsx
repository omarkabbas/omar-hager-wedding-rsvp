"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";

type SeatingSearchEntry = { name: string; table_number: number; name_aliases?: string | null };

const normalizeLookupName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getLookupTokens = (value: string) => normalizeLookupName(value).split(" ").filter(Boolean);
const parseNameAliases = (value?: string | null) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const getLastLookupToken = (value: string) => {
  const tokens = getLookupTokens(value);
  return tokens[tokens.length - 1] || "";
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
  const aliasScore = parseNameAliases(entry.name_aliases).reduce((bestScore, alias) => {
    const nextScore = getSuggestionScore(query, alias);
    return Math.max(bestScore, nextScore > 0 ? nextScore - 10 : 0);
  }, 0);

  return Math.max(primaryScore, aliasScore);
};

export default function MyTablePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{ name: string; table_number: number } | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const [seatingEntries, setSeatingEntries] = useState<SeatingSearchEntry[]>([]);
  const [isSeatingAliasesAvailable, setIsSeatingAliasesAvailable] = useState<boolean | null>(null);
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState<boolean | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

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
        .select(isSeatingAliasesAvailable ? "name, table_number, name_aliases" : "name, table_number")
        .order("name", { ascending: true });
      setSeatingEntries((data as SeatingSearchEntry[] | null) || []);
    };

    const detectSeatingAliasesColumn = async () => {
      const { error } = await supabase.from("seating").select("name_aliases").limit(1);
      setIsSeatingAliasesAvailable(!error);
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchSettings();
        void fetchSeating();
      }
    };

    void fetchSettings();
    void detectSeatingAliasesColumn();

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
  }, [isSeatingAliasesAvailable]);

  useEffect(() => {
    if (isSeatingAliasesAvailable === null) return;

    const fetchSeating = async () => {
      const { data } = await supabase
        .from("seating")
        .select(isSeatingAliasesAvailable ? "name, table_number, name_aliases" : "name, table_number")
        .order("name", { ascending: true });
      setSeatingEntries((data as SeatingSearchEntry[] | null) || []);
    };

    void fetchSeating();
  }, [isSeatingAliasesAvailable]);

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

  const performSearch = async (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    setSearchAttempted(true);
    setSearchQuery(trimmedName);
    setActiveSuggestionIndex(0);

    const normalizedQuery = normalizeLookupName(trimmedName);
    const rankedMatches = [...seatingEntries]
      .map((entry) => ({ entry, score: getEntrySuggestionScore(trimmedName, entry) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name));

    const exactMatch =
      seatingEntries.find((entry) => normalizeLookupName(entry.name) === normalizedQuery) ||
      seatingEntries.find((entry) => parseNameAliases(entry.name_aliases).some((alias) => normalizeLookupName(alias) === normalizedQuery)) ||
      rankedMatches[0]?.entry ||
      null;

    setSearchResult(exactMatch);
    setSuggestions(
      exactMatch
        ? []
        : rankedMatches
            .map(({ entry }) => entry.name)
            .filter((entryName, index, list) => list.indexOf(entryName) === index)
            .slice(0, 6)
            .map((entryName) => ({ name: entryName })),
    );
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSearch(searchQuery);
  };

  const handleSearchQueryChange = async (query: string, resetAttempt = true, clearSearchResult = true) => {
    setSearchQuery(query);
    setActiveSuggestionIndex(0);
    if (clearSearchResult) {
      setSearchResult(null);
    }

    if (query.trim().length === 0) {
      setSearchAttempted(false);
      setSuggestions([]);
      return;
    }

    if (resetAttempt) {
      setSearchAttempted(false);
    }

    const nextSuggestions = seatingEntries
      .map((entry) => ({ name: entry.name, score: getEntrySuggestionScore(query, entry) }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
      .map(({ name }) => name)
      .filter((name, index, list) => list.indexOf(name) === index)
      .slice(0, 6)
      .map((name) => ({ name }));

    setSuggestions(nextSuggestions);
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
      const selectedName = suggestions[activeSuggestionIndex].name;
      setSearchQuery(selectedName);
      void performSearch(selectedName);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  const resetSearch = () => {
    setSearchQuery("");
    setSearchResult(null);
    setSuggestions([]);
    setSearchAttempted(false);
    setActiveSuggestionIndex(0);
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
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="Omar & Hager logo"
              width={96}
              height={96}
              className="wedding-logo w-20 md:w-24"
            />
          </div>

          <p className="wedding-kicker mb-3">Seating</p>
          <h1 className="wedding-page-title mb-4 text-[#4E5E72]">Find your table</h1>
          <p className="wedding-lead mb-8 md:mb-10">
            Start typing the name from your invitation and choose the closest match if it appears.
          </p>

          <form onSubmit={handleSearch} className="space-y-5">
            <div ref={searchBoxRef} className="relative text-left">
              <label className="wedding-kicker block ml-2 mb-2">Guest Name</label>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => void handleSearchQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Start typing your name"
                  className="wedding-input"
                  enterKeyHint="search"
                />

                {suggestions.length > 0 && (
                  <ul className="absolute z-20 w-full mt-2 overflow-auto rounded-[24px] border border-stone-100 bg-white text-left shadow-xl max-h-56">
                    {suggestions.map((suggestion, index) => (
                      <li
                        key={suggestion.name}
                        onClick={() => {
                          setSearchQuery(suggestion.name);
                          void performSearch(suggestion.name);
                        }}
                        className={`px-5 py-4 cursor-pointer text-sm text-stone-700 transition-colors border-b border-stone-50 last:border-none ${
                          index === activeSuggestionIndex ? "bg-stone-50 font-bold text-stone-900" : "hover:bg-stone-50"
                        }`}
                      >
                        {suggestion.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" className="wedding-button-primary w-full">
                Find My Table
              </button>
              {(searchQuery.trim().length > 0 || searchResult || searchAttempted) && (
                <button type="button" onClick={resetSearch} className="wedding-button-secondary w-full sm:w-auto">
                  Start Over
                </button>
              )}
            </div>
          </form>

          {searchResult && (
            <div className="wedding-animate-up mt-8 md:mt-10">
              <div className="wedding-divider mb-8" />
              <div className="wedding-subpanel px-6 py-7 md:px-8 md:py-8">
                <p className="wedding-lead text-lg mb-2">Welcome, {searchResult.name}!</p>
                <h2 className="wedding-title text-2xl leading-tight text-[#4E5E72] md:text-4xl">
                  Please find your seat at
                  <span className="block mt-3 text-4xl md:text-5xl underline underline-offset-8 decoration-stone-200">
                    Table {searchResult.table_number}
                  </span>
                </h2>
              </div>
            </div>
          )}

          {searchAttempted && !searchResult && searchQuery.trim().length > 0 && (
            <div className="wedding-animate-up mt-8 md:mt-10">
              <div className="wedding-divider mb-8" />
              <div className="wedding-subpanel px-6 py-7 text-center md:px-8 md:py-8">
                <p className="wedding-kicker mb-3">Need Help?</p>
                <h2 className="wedding-subtitle mb-3 text-[#4E5E72]">We couldn&apos;t find a table under that name just yet.</h2>
                <p className="wedding-copy mx-auto max-w-lg">
                  Please try the name as it appears on your invitation. If you still need help when you arrive, a
                  member of our family will be happy to assist you.
                </p>
                {suggestions.length > 0 ? (
                  <div className="mt-5">
                    <p className="wedding-kicker mb-3">Did You Mean</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.name}
                          type="button"
                          onClick={() => {
                            setSearchQuery(suggestion.name);
                            void performSearch(suggestion.name);
                          }}
                          className="wedding-button-secondary"
                        >
                          {suggestion.name}
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
