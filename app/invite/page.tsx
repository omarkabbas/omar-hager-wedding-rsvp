"use client";
import { useState, useEffect, Suspense, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';

function InviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const inviteCode = searchParams.get('code');
  
  const [guestName, setGuestName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  const [step, setStep] = useState(0);
  const [showButton, setShowButton] = useState(false);
  
  const [isAtTop, setIsAtTop] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchGuest() {
      if (!inviteCode) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from('rsvp_list').select('guest_name, attending').eq('invite_code', inviteCode.toUpperCase().trim()).maybeSingle();
      if (data) {
        setGuestName(data.guest_name);
        if (data.attending !== null) {
            router.push(`/${inviteCode}`);
        }
      }
      setLoading(false);
    }
    fetchGuest();
  }, [inviteCode, router]);

  const handleInteraction = () => {
    if (step === 0) {
      setStep(1); 
      setTimeout(() => setShowButton(true), 1500); 
    } else if (step === 1) {
      setStep(2); 
    }
  };

  const handleProceed = () => {
    sessionStorage.setItem(`seen_envelope_${inviteCode}`, "true");
    router.push(`/${inviteCode}`);
  };

  const handleScroll = () => {
    if (cardRef.current) {
      setIsAtTop(cardRef.current.scrollTop <= 10);
    }
  };

  if (loading) return <div className="min-h-screen bg-[#D0E0F0]" />;
  
  if (!guestName) return (
    <div className="min-h-screen bg-[#D0E0F0] flex flex-col items-center justify-center font-sans p-4">
      <div className="max-w-md w-full bg-white p-12 rounded-[40px] shadow-2xl border border-stone-100 text-center">
        <h1 className="text-3xl font-serif text-stone-900 mb-4">Invite Not Found</h1>
        <p className="text-stone-600 italic mb-8 font-serif">The invite code is missing or incorrect.</p>
        <button onClick={() => router.push('/')} className="w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl hover:bg-stone-800 transition-colors">Return Home</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#D0E0F0] flex flex-col items-center justify-center p-4 md:p-8 overflow-x-hidden py-16 relative">
      
      <div className="max-w-md md:max-w-2xl w-full bg-white p-6 md:p-16 pt-32 md:pt-40 rounded-[40px] shadow-2xl border border-stone-100 flex flex-col items-center relative animate-in zoom-in duration-1000 mt-8 mb-8">

        {/* --- PERSONALIZATION --- */}
        <div className="absolute top-12 md:top-16 text-center z-0 px-4 w-full">
          <p className="text-[11px] uppercase tracking-[0.5em] text-stone-400 font-bold mb-3 font-sans opacity-80">You're invited,</p>
          <h1 className="text-4xl md:text-6xl font-serif text-stone-900 tracking-tight italic leading-tight">
            {guestName}
          </h1>
        </div>

        <style>{`
          :root {
            --env-w: 280px;
            --env-h: 380px;
          }
          @media (min-width: 768px) {
            :root {
              --env-w: 360px;
              --env-h: 480px; 
            }
          }

          .cssletter {
            position: relative;
            width: var(--env-w);
            height: var(--env-h);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2.5rem;
            margin-top: 10rem;
            transition: all 0.8s ease;
            z-index: 10;
          }
          
          .cssletter.step-2 {
            margin-top: 16rem;
          }

          /* --- TOP INSTRUCTION --- */
          .tap-top-instruction {
            position: absolute;
            top: -60px;
            width: 100%;
            text-align: center;
            font-family: serif;
            font-style: italic;
            font-size: 1rem;
            font-weight: 600;
            letter-spacing: 0.15em;
            color: #78716c;
            text-shadow: 0 1px 2px rgba(255,255,255,0.8);
            transition: opacity 0.3s ease;
            z-index: 4; /* Sits UNDER the flap when it rotates up (flap is z-5) */
          }

          /* --- BOTTOM INSTRUCTION --- */
          .tap-bottom-instruction {
            position: absolute;
            bottom: -60px;
            width: 100%;
            text-align: center;
            font-family: serif;
            font-style: italic;
            font-size: 1.125rem;
            font-weight: 600;
            letter-spacing: 0.15em;
            color: #78716c;
            text-shadow: 0 1px 2px rgba(255,255,255,0.8);
            transition: opacity 0.5s ease;
            z-index: 20;
          }

          .envelope {
            position: relative;
            width: var(--env-w);
            height: var(--env-h);
            background: #C3AF7D; 
            box-shadow: inset 0 0 40px rgba(0,0,0,0.15), 0 15px 30px rgba(0,0,0,0.1);
            border-radius: 6px;
          }

          .invite-card {
            position: absolute;
            width: 94%;
            height: 96%;
            left: 50%;
            bottom: 2%;
            background: white;
            z-index: 2;
            transition: all 1.2s cubic-bezier(0.25, 1, 0.5, 1), z-index 0s;
            border-radius: 4px;
            box-shadow: 0 0 20px rgba(0,0,0,0.15);
            padding: 4px;
            cursor: pointer;
            overflow-y: auto; 
            scrollbar-width: none; 
            transform: translateX(-50%);
          }
          .invite-card::-webkit-scrollbar { display: none; } 

          .envelope-folds {
            width: 100%; height: 100%; overflow: hidden;
            z-index: 3; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            border-radius: 6px; pointer-events: none;
          }

          .envelope-flap {
            width: 100%; height: 75%; position: absolute; top: 0;
            z-index: 5; /* Higher than top instruction */
            overflow: hidden; transition: 0.6s linear all;
            transform-origin: top; pointer-events: none;
          }

          .envelope-flap::before, .envelope-left::before, .envelope-right::before, .envelope-bottom::before {
            content: ""; transform: rotate(45deg); width: 100%; aspect-ratio: 1; display: block; position: absolute;
          }

          .envelope-flap::before { 
            background: linear-gradient(135deg, #FDF5D3 0%, #F5E8B7 50%, #FDF5D3 100%);
            box-shadow: 0 0 30px -5px rgba(0,0,0,0.15); top: auto; bottom: 30%; border-radius: 2rem; 
          }
          .envelope-left::before { background: linear-gradient(135deg, #F3E3AC 0%, #EDDBA1 100%); top: 10%; left: -65%; }
          .envelope-right::before { background: linear-gradient(135deg, #EAD99F 0%, #E3D194 100%); top: 10%; right: -65%; }
          .envelope-bottom::before { background: linear-gradient(135deg, #F6E8B6 0%, #F1DEA6 100%); top: 65%; left: 0; border-radius: 2rem; box-shadow: 0 -5px 20px rgba(0,0,0,0.05); }

          .cssletter.step-1 .envelope-flap, .cssletter.step-2 .envelope-flap { transform: rotateX(180deg) translateY(0); z-index: 1; }
          .cssletter.step-1 .invite-card { transform: translate(-50%, -50%); z-index: 2; }
          
          .cssletter.step-2 .invite-card {
            transform: translate(-50%, -15%) scale(1); 
            z-index: 20; 
            width: 125%; 
            max-width: 92vw; 
            height: 135%; 
            max-height: 72vh; 
            padding: 8px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.2);
            border-radius: 8px;
          }

          .scroll-instruction {
            position: absolute; bottom: 3%; left: 50%; width: 100%; text-align: center; pointer-events: none; z-index: 30;
            transition: opacity 0.5s ease;
            background: linear-gradient(to top, rgba(255,255,255,0.95) 10%, rgba(255,255,255,0) 100%);
            padding: 40px 10px 15px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; transform: translateX(-50%);
          }

          .seal-container {
            position: absolute; top: 60%; left: 50%; transform: translate(-50%, -50%);
            z-index: 6; transition: 0.3s all; cursor: pointer;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
          }
          .cssletter.step-1 .seal-container, .cssletter.step-2 .seal-container { opacity: 0; pointer-events: none; }

          .monogram-logo {
            position: absolute; top: 74%; left: 50%; transform: translateX(-50%);
            z-index: 4; transition: 0.3s opacity; pointer-events: none;
          }
          .cssletter.step-1 .monogram-logo, .cssletter.step-2 .monogram-logo { opacity: 0; }
        `}</style>

        <div className={`cssletter ${step === 1 ? 'step-1' : step === 2 ? 'step-2' : ''}`}>
          
          {/* TOP INSTRUCTION: Pinned to step 0 only */}
          <div className={`tap-top-instruction animate-pulse ${step === 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            Tap envelope to open
          </div>

          <div className="envelope">
            <div className="envelope-flap"></div>
            <div className="envelope-folds">
              <div className="envelope-left"></div>
              <div className="envelope-right"></div>
              <div className="envelope-bottom"></div>
            </div>
          </div>

          <div className="invite-card" onClick={handleInteraction} onScroll={handleScroll} ref={cardRef}>
            <img 
              src="/savethedate-bg.JPEG" 
              alt="Wedding Invitation" 
              className="w-full h-auto object-contain rounded-sm border border-stone-50" 
            />
            <div className={`scroll-instruction ${step === 2 && isAtTop ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
               <p className="text-stone-500 font-sans text-[10px] font-bold uppercase tracking-widest animate-bounce">Scroll to view ↓</p>
            </div>
          </div>

          {/* BOTTOM INSTRUCTION: Pinned to step 1 only */}
          <div className={`tap-bottom-instruction animate-pulse ${step === 1 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            Tap card to view
          </div>

          <div className="monogram-logo">
            <img 
              src="/logo.png" 
              alt="Logo" 
              style={{ width: '65px', height: 'auto', filter: 'brightness(0) contrast(100%)', transform: 'rotate(-2deg)' }}
              className="opacity-90"
            />
          </div>

          <button onClick={handleInteraction} className="seal-container hover:scale-110 active:scale-95 transition-transform group">
            <img 
              src="/seal.png" 
              alt="Seal" 
              style={{ 
                width: '70px', 
                height: '70px', 
                objectFit: 'contain',
                filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.15)) saturate(1.15)',
              }}
              className="z-10"
            />
          </button>
        </div>

        <div className={`w-full max-w-[280px] transition-all duration-1000 mt-12 ${showButton ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          <button onClick={handleProceed} className="w-full bg-stone-900 text-white py-5 md:py-6 rounded-full uppercase text-xs md:text-sm font-bold tracking-widest shadow-xl">
            RSVP
          </button>
        </div>

      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#D0E0F0]"></div>}>
      <InviteContent />
    </Suspense>
  );
}