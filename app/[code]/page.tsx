"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Guest {
  id: string;
  guest_name: string;
  invite_code: string;
  max_guests: number;
  attending: boolean | null;
}

export default function GuestRSVP() {
  const params = useParams();
  const inviteCode = params.code as string;

  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [guestData, setGuestData] = useState<Guest | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const target = new Date("June 6, 2026 00:00:00").getTime();
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const dist = target - now;
      if (dist > 0) {
        setTimeLeft({
          days: Math.floor(dist / (1000 * 60 * 60 * 24)),
          hours: Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((dist % (1000 * 60)) / 1000),
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchGuest() {
      if (!inviteCode) return;
      const { data } = await supabase
        .from('rsvp_list')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single();

      if (data) {
        setGuestData(data as Guest);
        // PREVENT DUPLICATES: If they already replied, show submitted screen
        if (data.attending !== null) {
          setSubmitted(true);
        }
      }
      setLoading(false);
    }
    fetchGuest();
  }, [inviteCode]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (!guestData) return;

    const { error } = await supabase
      .from('rsvp_list')
      .update({
        attending: formData.get('attending') === 'true',
        confirmed_guests: parseInt(formData.get('count') as string),
      })
      .eq('id', guestData.id);

    if (!error) setSubmitted(true);
  }

  if (loading) return <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center font-serif italic text-stone-400">Loading invitation...</div>;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-800 p-6 flex flex-col items-center">
      <nav className="p-8 flex justify-center space-x-12 text-[10px] uppercase tracking-[0.3em] text-stone-400">
        <Link href="/" className="hover:text-stone-900 transition-colors">Home</Link>
        <Link href="/registry" className="hover:text-stone-900 transition-colors">Registry</Link>
      </nav>

      <header className="text-center pt-8 pb-12 max-w-2xl w-full">
        <h1 className="text-5xl md:text-7xl font-serif mb-4">Omar & Hager</h1>
        <p className="tracking-[0.4em] uppercase text-[10px] text-stone-500 font-bold">Dallas, Texas • June 6, 2026</p>
        
        <div className="flex justify-center gap-4 md:gap-8 my-10 py-6 border-y border-stone-200 w-full max-w-md mx-auto">
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif">{timeLeft.days}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Days</p></div>
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif">{timeLeft.hours}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Hrs</p></div>
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif">{timeLeft.minutes}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Mins</p></div>
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif text-pink-800">{timeLeft.seconds}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Secs</p></div>
        </div>
      </header>

      <section className="max-w-md w-full bg-white p-10 rounded-3xl shadow-sm border border-stone-100">
        {submitted ? (
          <div className="text-center py-6">
            <h2 className="text-3xl font-serif mb-4">Thank You!</h2>
            <p className="text-stone-500 italic mb-8">We have already received your response. We can't wait to see you!</p>
            <Link href="/registry" className="inline-block bg-stone-900 text-white px-8 py-4 rounded-full text-[10px] uppercase tracking-widest hover:bg-stone-700">View Registry</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="text-center border-b border-stone-50 pb-6">
              <h2 className="text-2xl font-serif">{guestData?.guest_name}</h2>
            </div>
            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-stone-400 font-bold">Attendance</label>
              <select name="attending" className="w-full p-4 border rounded-xl bg-stone-50 text-sm outline-none">
                <option value="true">Happily Accepts</option>
                <option value="false">Regretfully Declines</option>
              </select>
            </div>
            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-stone-400 font-bold">Guest Count (Max: {guestData?.max_guests})</label>
              <select name="count" className="w-full p-4 border rounded-xl bg-stone-50 text-sm outline-none">
                {[...Array(guestData?.max_guests)].map((_, i) => (
                  <option key={i+1} value={i+1}>{i+1}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="w-full bg-stone-900 text-white py-4 rounded-full uppercase text-xs tracking-widest hover:bg-stone-700 transition-all">Confirm RSVP</button>
          </form>
        )}
      </section>
    </div>
  );
}