"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // Ensure this path is correct

export default function Navigation() {
  const pathname = usePathname();
  const [isGalleryEnabled, setIsGalleryEnabled] = useState(false);

  useEffect(() => {
    const fetchGalleryStatus = async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'is_gallery_enabled')
        .single();

      if (data && !error) {
        setIsGalleryEnabled(data.value === 'true');
      }
    };

    fetchGalleryStatus();

    // Listen for real-time changes so the link appears/disappears instantly
    const channel = supabase
      .channel('nav_settings')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'key=eq.is_gallery_enabled' }, 
        (payload) => {
          setIsGalleryEnabled(payload.new.value === 'true');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <nav className="w-full sticky top-0 z-50 pt-8 pb-4 md:py-10 flex justify-center items-center space-x-4 md:space-x-12 text-[11px] md:text-sm uppercase tracking-[0.2em] md:tracking-[0.3em] text-stone-600 font-bold font-sans bg-[#D0E0F0]/80 backdrop-blur-md animate-in fade-in duration-1000">
      <Link 
        href="/" 
        className={`px-3 md:px-8 py-2 md:py-4 transition-all ${pathname === '/' ? 'text-stone-900 border-b-2 border-stone-900' : 'hover:text-stone-900'}`}
      >
        Home
      </Link>
      <Link 
        href="/registry" 
        className={`px-3 md:px-8 py-2 md:py-4 transition-all ${pathname === '/registry' ? 'text-stone-900 border-b-2 border-stone-900' : 'hover:text-stone-900'}`}
      >
        Registry
      </Link>

      {/* CONDITIONALLY RENDER GALLERY LINK */}
      {isGalleryEnabled && (
        <Link 
          href="/gallery" 
          className={`px-3 md:px-8 py-2 md:py-4 transition-all ${pathname === '/gallery' ? 'text-stone-900 border-b-2 border-stone-900' : 'hover:text-stone-900'}`}
        >
          Gallery
        </Link>
      )}

      
    </nav>
  );
}