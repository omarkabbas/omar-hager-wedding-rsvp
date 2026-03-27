"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navigation from '@/app/components/Navigation';

export default function GuestRSVP() {
  const params = useParams();
  const router = useRouter();
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
        if (data.attending !== null) {
          setSubmitted(true);
        } else {
          // Check if they came from the envelope; if not, redirect to the animation
          const hasSeenEnvelope = sessionStorage.getItem(`seen_envelope_${inviteCode}`);
          if (!hasSeenEnvelope) {
            router.push(`/invite?code=${inviteCode}`);
            return;
          }
        }
      }
      setLoading(false);
    }
    fetchGuest();
  }, [inviteCode, router]);

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
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col items-center font-sans relative overflow-x-hidden">
      <Navigation />

      <section className="max-w-md md:max-w-xl w-full mx-4 mt-6 md:mt-12 bg-white p-8 md:p-12 rounded-[40px] shadow-2xl border border-stone-100 mb-20 text-center animate-in zoom-in duration-1000">
        <div className="flex justify-center mb-8"><img src="/logo.png" alt="Logo" className="w-20 md:w-28 h-auto" /></div>
        
        {loading ? ( 
          <div className="py-10 font-serif italic text-stone-400 animate-pulse text-lg">Finding invitation...</div> 
        ) : !guestData ? (
          <div className="py-10">
            <h2 className="text-3xl font-serif mb-6 text-stone-900 tracking-tight">Invite Not Found</h2>
            <p className="text-stone-500 italic mb-10 leading-relaxed">Please check the invite or contact Omar & Hager!</p>
            <Link href="/" className="inline-block px-10 py-5 bg-stone-900 text-white rounded-full text-xs uppercase font-bold tracking-widest shadow-xl hover:bg-stone-800 transition-colors">Return Home</Link>
          </div>
        ) : submitted ? (
          <div className="py-4 animate-in fade-in duration-1000">
            <h2 className="text-4xl md:text-5xl font-serif mb-6 text-stone-900 tracking-tight">
              {guestData.attending ? "You're RSVP'd!" : "Thank You"}
            </h2>
            <div className="h-px w-16 bg-stone-200 mx-auto mb-8"></div>
            <p className="text-stone-600 italic mb-10 text-lg md:text-xl">
              {guestData.attending ? "We can't wait to celebrate with you!" : "Thanks for letting us know."}
            </p>
            
            {guestData.attending && (
              <div className="space-y-6 text-left max-w-lg mx-auto">
                {/* VENUE CARD */}
                <div className="p-6 md:p-8 border border-stone-100 rounded-3xl bg-stone-50 shadow-inner text-center">
                   <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-2 font-bold font-sans">The Venue</p>
                   <a href="https://maps.google.com/?q=Reflections+Venue+%26+Gardens" target="_blank" rel="noopener noreferrer" className="font-serif text-xl md:text-2xl text-stone-900 underline underline-offset-8 decoration-stone-200 hover:text-stone-600 transition-colors">Reflections Venue & Gardens</a>
                </div>
                
                {/* NOTE ON GIFTS */}
                <div className="p-6 md:p-8 border border-stone-100 rounded-3xl bg-stone-50 shadow-inner text-center">
                  <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-4 font-bold font-sans">A Note on Gifts</p>
                  <p className="text-sm md:text-base text-stone-600 italic leading-relaxed font-sans">
                    As we already have a home filled with everything we need, we kindly request no boxed or bagged gifts. Should you wish to honor us with a gift toward our future together, it would be most sincerely appreciated.
                  </p>
                </div>
              </div>
            )}
            
            {/* FOOTER BUTTON - Spaced away from the Gift Note */}
            <div className="mt-12">
              <Link href="/" className="inline-block w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl hover:bg-stone-800 active:scale-95 transition-all">
                Explore Our Website
              </Link>
            </div>
          </div>
        ) : (
          /* FORM SECTION - MATCHES MYTABLE STYLING */
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="text-center mb-10">
              <p className="font-serif italic text-stone-400 text-xl md:text-2xl mb-1">Welcome,</p>
              <h2 className="text-4xl md:text-5xl font-serif text-stone-900 tracking-tight">{guestData.guest_name}</h2>
            </div>
            
            <div className="relative text-left">
              <label className="text-[11px] uppercase text-stone-500 font-bold ml-2 tracking-widest">Will you join us?</label>
              <select 
                name="attending" 
                value={isAttending} 
                onChange={(e) => setIsAttending(e.target.value)} 
                required 
                className="mt-2 w-full px-6 py-4 rounded-2xl bg-stone-50 border border-stone-100 text-base text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all cursor-pointer appearance-none shadow-sm"
              >
                <option value="true">Happily Accepts</option>
                <option value="false">Regretfully Declines</option>
              </select>
            </div>
            
            {isAttending === "true" && (
              <div className="relative text-left animate-in slide-in-from-top-2 duration-500">
                <label className="text-[11px] uppercase text-stone-500 font-bold ml-2 tracking-widest">Number of Guests (Max: {guestData.max_guests})</label>
                <select 
                  name="count" 
                  required 
                  className="mt-2 w-full px-6 py-4 rounded-2xl bg-stone-50 border border-stone-100 text-base text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all cursor-pointer appearance-none shadow-sm"
                >
                  {[...Array(guestData.max_guests)].map((_, i) => (
                    <option key={i+1} value={i+1}>{i+1} {i === 0 ? 'Guest' : 'Guests'}</option>
                  ))}
                </select>
              </div>
            )}
            
            <button type="submit" className="w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl hover:bg-stone-800 active:scale-95 transition-all mt-4">
              Confirm RSVP
            </button>
          </form>
        )}
      </section>
    </div>
  );
}