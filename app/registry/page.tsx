"use client";
import Link from 'next/link';

export default function RegistryPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-800 flex flex-col font-sans">
      {/* Navigation */}
      <nav className="p-8 flex justify-center space-x-12 text-[10px] uppercase tracking-[0.3em] text-stone-400">
        <Link href="/" className="hover:text-stone-900 transition-colors">Home</Link>
        <Link href="/registry" className="text-stone-900 border-b border-stone-900 pb-1 font-bold">Registry</Link>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center -mt-20">
        <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <h1 className="text-5xl md:text-7xl font-serif mb-6 text-stone-900 tracking-tight">Registry</h1>
          
          <div className="h-px w-24 bg-stone-200 mx-auto mb-8"></div>
          
          <p className="text-stone-500 mb-12 italic font-light text-lg max-w-lg leading-relaxed mx-auto">
            Your presence in Dallas is the greatest gift of all. However, if you wish to honor us with a gift, we have curated a registry below to help us start our new life together.
          </p>
          
          {/* REPLACE THE '#' WITH YOUR AMAZON LINK LATER */}
          <a 
            href="#" 
            target="_blank" 
            className="inline-block px-12 py-5 bg-stone-900 text-white rounded-full uppercase text-[10px] tracking-[0.2em] font-semibold hover:bg-stone-700 transition-all shadow-xl shadow-stone-100 hover:translate-y-[-2px]"
          >
            Amazon Wishlist
          </a>
          
          <div className="mt-16">
            <Link href="/" className="text-[10px] uppercase tracking-widest text-stone-300 hover:text-stone-500 transition-colors">
              Return Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}