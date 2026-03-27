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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col items-center font-sans relative pb-20 overflow-x-hidden">
      <Navigation />

      {/* CUSTOM CSS TO KILL DOUBLE ARROWS & STYLE DROPDOWNS */}
      <style jsx global>{`
        select {
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
        }
        select::-ms-expand {
          display: none;
        }
        /* Style the actual dropdown list (options) where possible */
        select option {
          background: #ffffff;
          color: #1c1917;
          padding: 10px;
        }
      `}</style>

      <main className="flex-1 flex flex-col items-center justify-center w-full px-4 md:px-8 -mt-10 md:-mt-20">
        
        {loading ? ( 
          <div className="py-10 font-serif italic text-stone-500 animate-pulse text-lg">Finding your invitation...</div> 
        ) : (
          /* UNIFIED CONTAINER FOR ALL STATES (NOT FOUND, SUCCESS, FORM) */
          <div className="max-w-md md:max-w-xl w-full bg-white p-8 md:p-12 rounded-[40px] shadow-2xl border border-stone-100 animate-in zoom-in duration-1000">
            
            <div className="flex justify-center mb-8">
              <img src="/logo.png" alt="Logo" className="w-20 md:w-24 h-auto" />
            </div>

            {!guestData ? (
              /* NOT FOUND STATE */
              <div className="text-center py-4">
                <h2 className="text-3xl font-serif mb-6 text-stone-900 tracking-tight">Invite Not Found</h2>
                <p className="text-stone-500 italic mb-10 leading-relaxed">Please check your invite link or contact Omar & Hager.</p>
                <Link href="/" className="inline-block w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl hover:bg-stone-800 transition-all">Return Home</Link>
              </div>
            ) : submitted ? (
              /* SUCCESS STATE */
              <div className="py-4 animate-in fade-in duration-1000 text-center">
                <h2 className="text-4xl md:text-5xl font-serif mb-6 text-stone-900 tracking-tight">
                  {guestData.attending ? "You're RSVP'd!" : "We've received your response"}
                </h2>
                <div className="h-px w-16 bg-stone-200 mx-auto mb-8"></div>
                <p className="text-stone-600 italic mb-10 text-lg md:text-xl leading-relaxed">
                  {guestData.attending ? "We can't wait to celebrate with you!" : "Thanks for letting us know you can't make it ☹️"}
                </p>
                
                {guestData.attending && (
                  <div className="space-y-6 text-left max-w-lg mx-auto">
                    <div className="p-6 md:p-8 bg-stone-50 rounded-3xl border border-stone-100 text-center shadow-inner">
                       <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-2 font-bold font-sans">The Venue</p>
                       <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="font-serif text-xl md:text-2xl text-stone-900 underline underline-offset-8 decoration-stone-200 hover:text-stone-600 transition-colors">Reflections Venue & Gardens</a>
                    </div>
                    
                    <div className="p-6 md:p-8 bg-stone-50 rounded-3xl border border-stone-100 text-center shadow-inner">
                      <p className="text-[10px] uppercase tracking-widest text-stone-400 mb-4 font-bold font-sans">A Note on Gifts</p>
                      <p className="text-sm md:text-base text-stone-600 italic leading-relaxed font-sans">
                        As we already have a home filled with everything we need, we kindly request no boxed or bagged gifts. Should you wish to honor us with a gift toward our future together, it would be most sincerely appreciated.
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-center mt-12">
                  <Link href="/" className="w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl hover:bg-stone-800 transition-all text-center">
                    Explore Our Website
                  </Link>
                </div>
              </div>
            ) : (
              /* RSVP FORM ENTRY */
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="text-center mb-4">
                  <p className="font-serif italic text-stone-400 text-xl mb-1">Welcome,</p>
                  <h2 className="text-4xl md:text-5xl font-serif text-stone-900 tracking-tight">{guestData.guest_name}</h2>
                </div>
                
                <div className="space-y-2 text-left">
                  <label className="text-[11px] uppercase text-stone-500 font-bold ml-2 tracking-widest font-sans">Will you join us?</label>
                  <div className="relative">
                    <select 
                      name="attending" 
                      value={isAttending} 
                      onChange={(e) => setIsAttending(e.target.value)} 
                      required 
                      className="w-full px-6 py-4 rounded-2xl bg-stone-50 border border-stone-100 text-base text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all cursor-pointer"
                      style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8a29e' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 1.5rem center',
                        backgroundSize: '1rem'
                      }}
                    >
                      <option value="true">Happily Accepts</option>
                      <option value="false">Regretfully Declines</option>
                    </select>
                  </div>
                </div>
                
                {isAttending === "true" && (
                  <div className="space-y-2 text-left animate-in slide-in-from-top-4 duration-500">
                    <label className="text-[11px] uppercase text-stone-500 font-bold ml-2 tracking-widest font-sans">Your Party Size</label>
                    <div className="relative">
                      <select 
                        name="count" 
                        required 
                        className="w-full px-6 py-4 rounded-2xl bg-stone-50 border border-stone-100 text-base text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-200 transition-all cursor-pointer"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23a8a29e' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 1.5rem center',
                          backgroundSize: '1rem'
                        }}
                      >
                        {[...Array(guestData.max_guests)].map((_, i) => (
                          <option key={i+1} value={i+1}>{i+1} {i === 0 ? 'Guest' : 'Guests'}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                
                <button type="submit" className="w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl hover:bg-stone-800 active:scale-95 transition-all mt-4">
                  Confirm RSVP
                </button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}