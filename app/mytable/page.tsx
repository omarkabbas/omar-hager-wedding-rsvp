"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";

export default function MyTablePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{ name: string; table_number: number } | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState<boolean | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [searchAttempted, setSearchAttempted] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
        .eq("key", "is_seating_chart_enabled")
        .single();

      setIsSeatingChartEnabled(data?.value === "true");
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void fetchSettings();
      }
    };

    void fetchSettings();

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
      .subscribe();
    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  const performSearch = async (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName === "") return;

    setSearchAttempted(true);

    const { data } = await supabase
      .from("seating")
      .select("name, table_number")
      .ilike("name", trimmedName)
      .limit(1)
      .maybeSingle();

    setSearchResult(data || null);
    setSuggestions([]);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSearch(searchQuery);
  };

  const handleSearchQueryChange = async (query: string) => {
    setSearchQuery(query);
    setActiveSuggestionIndex(0);
    setSearchResult(null);

    if (query.trim().length === 0) {
      setSearchAttempted(false);
    }

    if (query.length > 2) {
      const { data } = await supabase
        .from("seating")
        .select("name")
        .ilike("name", `%${query}%`)
        .limit(5);

      if (data) setSuggestions(data);
      return;
    }

    setSuggestions([]);
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
    }
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
            Start typing your name to find your table.
          </p>

          <form onSubmit={handleSearch} className="space-y-5">
            <div className="relative text-left">
              <label className="wedding-kicker block ml-2 mb-2">Guest Name</label>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => void handleSearchQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your full name"
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

            <button type="submit" className="wedding-button-primary w-full">
              Find My Table
            </button>
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

          {searchAttempted && !searchResult && suggestions.length === 0 && searchQuery.trim().length > 0 && (
            <div className="wedding-animate-up mt-8 md:mt-10">
              <div className="wedding-divider mb-8" />
              <div className="wedding-subpanel px-6 py-7 text-center md:px-8 md:py-8">
                <p className="wedding-kicker mb-3">Need Help?</p>
                <h2 className="wedding-subtitle mb-3 text-[#4E5E72]">We couldn&apos;t find a table under that name just yet.</h2>
                <p className="wedding-copy mx-auto max-w-lg">
                  Please try the name as it appears on your invitation. If you still need help when you arrive, a
                  member of our family will be happy to assist you.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
