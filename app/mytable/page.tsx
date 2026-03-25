"use client";
import { useState, useEffect } from 'react';
import Navigation from '@/app/components/Navigation';
import { supabase } from '@/lib/supabase';

export default function MyTablePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<{ name: string; table_number: number } | null>(null);
  const [suggestions, setSuggestions] = useState<{ name: string }[]>([]);
  const [isSeatingChartEnabled, setIsSeatingChartEnabled] = useState(false);

  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'is_seating_chart_enabled').single();
      if (data) {
        setIsSeatingChartEnabled(data.value === 'true');
      }
    };

    fetchSettings();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() === '') return;

    const { data, error } = await supabase.from('seating').select('name, table_number').ilike('name', searchQuery).single();
    if (data) {
      setSearchResult(data);
    } else {
      setSearchResult(null);
    }
    setSuggestions([]);
  };

  const handleSearchQueryChange = async (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      const { data, error } = await supabase.from('seating').select('name').ilike('name', `%${query}%`).limit(5);
      if (data) {
        setSuggestions(data);
      }
    } else {
      setSuggestions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex((prevIndex) => (prevIndex + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex((prevIndex) => (prevIndex - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      setSearchQuery(suggestions[activeSuggestionIndex].name);
      setSuggestions([]);
    }
  };

  if (!isSeatingChartEnabled) {
    return (
      <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col font-sans relative">
        <Navigation />
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center pt-6 pb-20 p-6 text-center">
          <h1 className="text-4xl md:text-6xl font-serif mb-12 text-stone-900 tracking-tighter">The seating chart is not yet available.</h1>
          <p className="text-lg md:text-xl text-stone-600">Please check back later.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col font-sans relative">
      <Navigation />
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start pt-6 pb-20 p-6 text-center">
        <div className="max-w-4xl w-full animate-in fade-in zoom-in duration-1000">
          <h1 className="text-4xl md:text-6xl font-serif mb-12 text-stone-900 tracking-tighter">Please Find Your Table</h1>
          <form onSubmit={handleSearch} className="max-w-xl w-full mx-auto">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your full name"
                className="w-full px-8 py-5 rounded-full bg-white shadow-lg text-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-4 focus:ring-stone-300/80 transition-all"
              />
              {suggestions.length > 0 && (
                <ul className="absolute z-10 w-full mt-2 bg-white rounded-2xl shadow-xl text-left max-h-60 overflow-auto">
                  {suggestions.map((suggestion, index) => (
                    <li
                      key={index}
                      onClick={() => {
                        setSearchQuery(suggestion.name);
                        setSuggestions([]);
                      }}
                      className={`px-8 py-4 cursor-pointer text-stone-700 hover:bg-stone-100 hover:text-stone-900 transition-colors ${
                        index === activeSuggestionIndex ? 'bg-stone-100' : ''
                      }`}
                    >
                      {suggestion.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="submit" className="mt-8 px-14 py-5 bg-stone-900 text-white rounded-full text-sm uppercase font-bold shadow-xl hover:bg-stone-800 transition-colors">
              Find My Table
            </button>
          </form>
          {searchResult && (
            <div className="mt-12 text-2xl md:text-4xl font-serif text-stone-800">
              <p>Welcome, {searchResult.name}!</p>
              <br />
              <p>Please find your seat at <span className="font-bold">Table {searchResult.table_number}</span></p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
