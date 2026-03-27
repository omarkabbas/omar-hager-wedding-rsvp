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
      const { data } = await supabase.from('settings').select('value').eq('key', 'is_seating_chart_enabled').single();
      if (data) {
        setIsSeatingChartEnabled(data.value === 'true');
      }
    };
    fetchSettings();
  }, []);

  const performSearch = async (name: string) => {
    if (name.trim() === '') return;
    const { data } = await supabase.from('seating').select('name, table_number').ilike('name', name).single();
    if (data) {
      setSearchResult(data);
    } else {
      setSearchResult(null);
    }
    setSuggestions([]);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await performSearch(searchQuery);
  };

  const handleSearchQueryChange = async (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      const { data } = await supabase.from('seating').select('name').ilike('name', `%${query}%`).limit(5);
      if (data) setSuggestions(data);
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
      const selectedName = suggestions[activeSuggestionIndex].name;
      setSearchQuery(selectedName);
      performSearch(selectedName);
    }
  };

  if (!isSeatingChartEnabled) {
    return (
      <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col font-sans relative">
        <Navigation />
        <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-center -mt-10 md:-mt-20">
          <div className="max-w-md w-full bg-white p-8 md:p-12 rounded-[40px] shadow-2xl border border-stone-100 animate-in zoom-in duration-1000">
             <div className="flex justify-center mb-6"><img src="/logo.png" alt="Logo" className="w-20 h-auto opacity-50" /></div>
             <h1 className="text-3xl md:text-4xl font-serif mb-6 text-stone-900 tracking-tight">Coming Soon</h1>
             <p className="text-stone-500 italic font-serif text-sm md:text-base">The seating chart is not yet available. Please check back later.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col font-sans relative overflow-x-hidden">
      <Navigation />
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-center -mt-10 md:-mt-20">
        
        <div className="max-w-md md:max-w-xl w-full bg-white p-8 md:p-12 rounded-[40px] shadow-2xl border border-stone-100 animate-in zoom-in duration-1000">
          
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Logo" className="w-20 h-auto" />
          </div>

          {/* Header Section - REMOVED the border-b that was causing the faint line */}
          <div className="pb-2 mb-8 text-center">
            <h1 className="text-4xl md:text-5xl font-serif text-stone-900 tracking-tight">Find Your Table</h1>
          </div>

          <form onSubmit={handleSearch} className="space-y-6">
            <div className="relative text-left">
              <label className="text-[11px] uppercase text-stone-500 font-bold ml-2 tracking-widest">Guest Name</label>
              <div className="relative mt-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your full name"
                  className="w-full px-6 py-4 rounded-2xl bg-stone-50 border border-stone-100 text-base text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all"
                />
                
                {suggestions.length > 0 && (
                  <ul className="absolute z-20 w-full mt-2 bg-white rounded-2xl shadow-xl border border-stone-100 text-left max-h-48 overflow-auto">
                    {suggestions.map((suggestion, index) => (
                      <li
                        key={index}
                        onClick={() => {
                          setSearchQuery(suggestion.name);
                          performSearch(suggestion.name);
                        }}
                        className={`px-6 py-4 cursor-pointer text-sm text-stone-700 hover:bg-stone-50 transition-colors border-b border-stone-50 last:border-none ${
                          index === activeSuggestionIndex ? 'bg-stone-50 font-bold text-stone-900' : ''
                        }`}
                      >
                        {suggestion.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <button type="submit" className="w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl hover:bg-stone-800 active:scale-95 transition-all">
              Find My Table
            </button>
          </form>

          {/* RESULT AREA */}
          {searchResult && (
            <div className="animate-in slide-in-from-bottom-4 duration-500">
              
              {/* This is the intentional divider - darkened slightly for clarity */}
              <div className="mt-12 mb-10">
                <div className="h-px w-16 bg-stone-200 mx-auto"></div>
              </div>
              
              <div className="p-6 border border-stone-100 rounded-3xl bg-stone-50 shadow-inner">
                <p className="text-stone-500 font-serif italic text-lg mb-1">Welcome, {searchResult.name}!</p>
                <h2 className="text-2xl md:text-3xl font-serif text-stone-900 leading-tight">
                  Please find your seat at <span className="block text-4xl mt-3 font-bold text-stone-900 underline underline-offset-8 decoration-stone-200">Table {searchResult.table_number}</span>
                </h2>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}