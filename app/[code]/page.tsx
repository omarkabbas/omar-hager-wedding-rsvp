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

  // 1. COUNTDOWN TIMER
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

  // 2. FETCH GUEST DATA
  useEffect(() => {
    async function fetchGuest() {
      if (!inviteCode) {
        setLoading(false);
        return;
      }
      
      const { data, error } = await supabase
        .from('rsvp_list')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase().trim())
        .maybeSingle(); // Use maybeSingle to avoid errors on invalid codes

      if (data) {
        setGuestData(data as Guest);
        if (data.attending !== null) {
          setSubmitted(true);
        }
      }
      setLoading(false);
    }
    fetchGuest();
  }, [inviteCode]);

  // 3. SUBMIT RSVP
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
    else alert("Error saving RSVP. Please try again.");
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-800 p-6 flex flex-col items-center font-sans">
      
      {/* Navigation */}
      <nav className="w-full max-w-4xl flex justify-center space-x-12 py-8 text-[10px] uppercase tracking-[0.3em] text-stone-400">
        <Link href="/" className="hover:text-stone-900 transition-colors">Home</Link>
        <Link href="/registry" className="hover:text-stone-900 transition-colors">Registry</Link>
      </nav>

      {/* Hero Header */}
      <header className="text-center pt-8 pb-12 max-w-2xl w-full">
        <h1 className="text-5xl md:text-7xl font-serif mb-4 text-stone-900 tracking-tight">Omar & Hager</h1>
        <p className="tracking-[0.4em] uppercase text-[10px] text-stone-500 font-bold">Dallas, Texas • June 6, 2026</p>
        
        {/* Countdown */}
        <div className="flex justify-center gap-4 md:gap-8 my-10 py-6 border-y border-stone-200 w-full max-w-md mx-auto">
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif">{timeLeft.days}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Days</p></div>
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif">{timeLeft.hours}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Hrs</p></div>
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif">{timeLeft.minutes}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Mins</p></div>
          <div className="text-center min-w-[50px]"><p className="text-2xl font-serif text-pink-800">{timeLeft.seconds}</p><p className="text-[9px] uppercase text-stone-400 font-bold">Secs</p></div>
        </div>
      </header>

      {/* Main Content Section */}
      <section className="max-w-md w-full bg-white p-10 rounded-3xl shadow-sm border border-stone-100 mb-20">
        {loading ? (
          <div className="text-center py-10 font-serif italic text-stone-400 animate-pulse">
            Finding your invitation...
          </div>
        ) : !guestData ? (
          /* INVITE NOT FOUND STATE */
          <div className="text-center py-6 animate-in fade-in duration-700">
            <h2 className="text-2xl font-serif mb-4 text-stone-900 tracking-tight">Invite Not Found</h2>
            <p className="text-stone-500 font-light italic mb-10 leading-relaxed">
              We couldn't find an invitation for that link. <br/> 
              Please check the code or contact Omar & Hager!
            </p>
            <Link href="/" className="text-[10px] uppercase tracking-widest text-stone-400 border-b border-stone-100 pb-1 hover:text-stone-800 transition-colors">
              Return to Home
            </Link>
          </div>
        ) : submitted ? (
          /* RSVP SUBMITTED STATE */
          <div className="text-center py-6 animate-in fade-in duration-700">
            <h2 className="text-4xl font-serif mb-4 text-stone-900">Thank You!</h2>
            <p className="text-stone-500 italic mb-10 leading-relaxed">
              We have received your response. We can't wait to see you in Dallas!
            </p>
            <div className="flex flex-col gap-4">
              <Link href="/registry" className="inline-block bg-stone-900 text-white px-8 py-4 rounded-full text-[10px] uppercase tracking-widest hover:bg-stone-700 transition-all text-center">
                View Wedding Registry
              </Link>
              <Link href="/" className="text-[10px] uppercase tracking-widest text-stone-300 hover:text-stone-500">
                Back to Home
              </Link>
            </div>
          </div>
        ) : (
          /* ACTIVE RSVP FORM STATE */
          <form onSubmit={handleSubmit} className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            <div className="text-center border-b border-stone-50 pb-6">
              <p className="font-serif italic text-stone-400 mb-1">Welcome,</p>
              <h2 className="text-2xl font-serif text-stone-900 tracking-tight">{guestData.guest_name}</h2>
            </div>

            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-stone-400 font-bold">Will you join us?</label>
              <select 
                name="attending" 
                required
                className="w-full p-4 border border-stone-100 rounded-xl bg-stone-50 text-sm outline-none focus:ring-1 focus:ring-stone-200 transition-all cursor-pointer"
              >
                <option value="true">Happily Accepts</option>
                <option value="false">Regretfully Declines</option>
              </select>
            </div>

            <div className="space-y-4">
              <label className="block text-[10px] uppercase tracking-widest text-stone-400 font-bold">Number of Guests (Max: {guestData.max_guests})</label>
              <select 
                name="count" 
                required
                className="w-full p-4 border border-stone-100 rounded-xl bg-stone-50 text-sm outline-none focus:ring-1 focus:ring-stone-200 transition-all cursor-pointer"
              >
                {[...Array(guestData.max_guests)].map((_, i) => (
                  <option key={i+1} value={i+1}>{i+1}</option>
                ))}
              </select>
            </div>

            <button 
              type="submit" 
              className="w-full bg-stone-900 text-white py-4 rounded-full uppercase text-xs tracking-[0.2em] shadow-xl shadow-stone-100 hover:translate-y-[-2px] hover:bg-stone-800 transition-all"
            >
              Confirm RSVP
            </button>
          </form>
        )}
      </section>
    </div>
  );
}