"use client";

import { useEffect, useState } from "react";
import Navigation from "@/app/components/Navigation";
import { supabase } from "@/lib/supabase";

export default function MyTablePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{ name: string; table_number: number } | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "is_seating_chart_enabled")
        .single();

      if (data) setIsSeatingChartEnabled(data.value === "true");
    };

    fetchSettings();
  }, []);

  const performSearch = async (name: string) => {
    if (name.trim() === "") return;

    const { data } = await supabase
      .from("seating")
      .select("name, table_number")
      .ilike("name", name)
      .single();

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

  if (!isSeatingChartEnabled) {
    return (
      <div className="wedding-shell">
        <div className="wedding-backdrop" />
        <Navigation />
        <main className="wedding-main wedding-center text-center">
          <section className="wedding-page-panel max-w-lg text-center animate-in zoom-in duration-1000">
            <div className="flex justify-center mb-6">
              <img src="/logo.png" alt="Omar & Hager logo" className="w-20 h-auto opacity-50" />
            </div>
            <p className="wedding-kicker mb-3">Seating</p>
            <h1 className="wedding-state-title mb-4">Coming Soon</h1>
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
        <section className="wedding-page-panel text-center animate-in zoom-in duration-1000">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Omar & Hager logo" className="w-20 md:w-24 h-auto" />
          </div>

          <p className="wedding-kicker mb-3">Seating</p>
          <h1 className="wedding-page-title mb-4">Find Your Table</h1>
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
          </form>

          {searchResult && (
            <div className="animate-in slide-in-from-bottom-4 duration-500 mt-8 md:mt-10">
              <div className="wedding-divider mb-8" />
              <div className="wedding-subpanel px-6 py-7 md:px-8 md:py-8">
                <p className="wedding-lead text-lg mb-2">Welcome, {searchResult.name}!</p>
                <h2 className="wedding-title text-2xl md:text-4xl leading-tight">
                  Please find your seat at
                  <span className="block mt-3 text-4xl md:text-5xl underline underline-offset-8 decoration-stone-200">
                    Table {searchResult.table_number}
                  </span>
                </h2>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
