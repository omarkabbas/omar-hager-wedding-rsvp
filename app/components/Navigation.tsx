"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="relative z-50 p-6 md:p-10 flex justify-center space-x-6 md:space-x-12 text-xs md:text-sm uppercase tracking-[0.3em] text-stone-600 font-bold font-sans">
      <Link 
        href="/" 
        className={`px-4 md:px-8 py-4 transition-all ${pathname === '/' ? 'text-stone-900 border-b-2 border-stone-900' : 'hover:text-stone-900'}`}
      >
        Home
      </Link>
      <Link 
        href="/registry" 
        className={`px-4 md:px-8 py-4 transition-all ${pathname === '/registry' ? 'text-stone-900 border-b-2 border-stone-900' : 'hover:text-stone-900'}`}
      >
        Registry
      </Link>
    </nav>
  );
}