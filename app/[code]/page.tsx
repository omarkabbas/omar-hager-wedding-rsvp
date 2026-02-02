"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Link from 'next/link';

export default function GuestRSVP() {
  const params = useParams();
  const inviteCode = params.code as string;
  const [guestData, setGuestData] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAttending, setIsAttending] = useState<string>("true");

  useEffect(() => {
    async function fetchGuest() {
      if (!inviteCode) return;
      const { data } = await supabase.from('rsvp_list').select('*').eq('invite_code', inviteCode.toUpperCase().trim()).maybeSingle();
      if (data) {
        setGuestData(data);
        if (data.attending !== null) setSubmitted(true);
      }
      setLoading(false);
    }
    fetchGuest();
  }, [inviteCode]);

  async function handleSubmit(e: any) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const attendingValue = formData.get('attending') === 'true';
    const { error } = await supabase.from('rsvp_list').update({
      attending: attendingValue,
      confirmed_guests: attendingValue ? parseInt(formData.get('count') as string) : 0,
    }).eq('id', guestData.id);
    if (!error) {
      setGuestData({ ...guestData, attending: attendingValue });
      setSubmitted(true);
    }
  }

  return (
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 p-6 flex flex-col items-center font-sans relative">
      <nav className="p-10 flex justify-center space-x-12 text-[14px] uppercase tracking-[0.3em] text-stone-600">
        <Link href="/" className="px-10 py-5 hover:text-stone-900 transition-all">Home</Link>
        <Link href="/registry" className="px-10 py-5 hover:text-stone-900 transition-all">Registry</Link>
      </nav>

      <section className="max-w-md w-full bg-white p-12 rounded-[40px] shadow-2xl border border-stone-100 mb-20 text-center">
        <div className="flex justify-center mb-8"><img src="/logo.png" alt="Logo" className="w-24 h-auto" /></div>
        
        {loading ? ( <div className="py-10 font-serif italic text-stone-400">Finding invitation...</div> ) : !guestData ? (
          <div className="py-10">
            <h2 className="text-3xl font-serif mb-6 text-stone-900">Invite Not Found</h2>
            <p className="text-stone-500 italic mb-10 leading-relaxed font-sans">Please check the invite or contact Omar & Hager!</p>
            <Link href="/" className="inline-block px-12 py-5 bg-stone-900 text-white rounded-full text-[12px] uppercase font-bold">Return Home</Link>
          </div>
        ) : submitted ? (
          <div className="py-6 animate-in fade-in duration-1000">
            <h2 className="text-4xl font-serif mb-4 text-stone-900">
              {guestData.attending ? "You're RSVP'd!" : "Thanks for your response"}
            </h2>
            <p className="text-stone-600 italic mb-10 text-lg">
              {guestData.attending ? "We can't wait to celebrate with you!" : "Thanks for letting us know you won't make it :("}
            </p>
            {guestData.attending && (
              <div className="space-y-6 text-left">
                <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100 text-center">
                   <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-2 font-bold font-sans">Venue</p>
                   <a href="https://maps.google.com/?q=Reflections+Venue+and+Gardens+Plano" target="_blank" className="font-serif text-xl text-stone-900 underline">Reflections Venue & Gardens</a>
                </div>
                <div className="p-6 bg-stone-50 rounded-3xl border border-stone-100">
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-3 font-bold font-sans text-center">A Note on Gifts</p>
                  <p className="text-sm text-stone-500 italic leading-relaxed text-center font-sans">As we already have a home filled with everything we need, we kindly request no boxed or bagged gifts. Should you wish to honor us with a gift toward our future together, it would be most sincerely appreciated.</p>
                </div>
              </div>
            )}
            <Link href="/" className="inline-block mt-8 px-12 py-5 border border-stone-200 rounded-full text-[11px] uppercase font-bold w-full">Back to Home</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-12">
            <div className="border-b border-stone-50 pb-8 text-center">
              <p className="font-serif italic text-stone-400 text-xl mb-2">Welcome,</p>
              <h2 className="text-4xl font-serif text-stone-900">{guestData.guest_name}</h2>
            </div>
            <div className="space-y-6 text-left">
              <label className="text-[12px] uppercase text-stone-500 font-bold ml-2 font-sans">Will you join us?</label>
              <select name="attending" value={isAttending} onChange={(e) => setIsAttending(e.target.value)} required className="w-full p-6 border rounded-2xl bg-stone-50 text-lg outline-none cursor-pointer font-sans">
                <option value="true">Happily Accepts</option>
                <option value="false">Regretfully Declines</option>
              </select>
            </div>
            {isAttending === "true" && (
              <div className="space-y-6 text-left animate-in slide-in-from-top-2">
                <label className="text-[12px] uppercase text-stone-500 font-bold ml-2 font-sans">Guests (Max: {guestData.max_guests})</label>
                <select name="count" required className="w-full p-6 border rounded-2xl bg-stone-50 text-lg outline-none cursor-pointer font-sans">
                  {[...Array(guestData.max_guests)].map((_, i) => <option key={i+1} value={i+1}>{i+1}</option>)}
                </select>
              </div>
            )}
            <button type="submit" className="w-full bg-stone-900 text-white py-7 rounded-full uppercase text-sm font-bold font-sans shadow-xl">Confirm RSVP</button>
          </form>
        )}
      </section>
    </div>
  );
}