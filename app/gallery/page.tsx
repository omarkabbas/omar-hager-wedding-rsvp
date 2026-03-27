"use client";
import { useState, useEffect } from 'react';
import Navigation from '@/app/components/Navigation';
import { supabase } from '@/lib/supabase';
import imageCompression from 'browser-image-compression';

export default function GalleryPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [photos, setPhotos] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);

  const fetchPhotos = async () => {
    try {
      const res = await fetch('/api/photos', { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) setPhotos(data);
    } catch (err) {
      console.error("Failed to fetch photos", err);
    }
  };

  useEffect(() => {
    const checkSecurity = async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'is_gallery_enabled')
        .single();
      
      if (data) setIsEnabled(data.value === 'true');
    };

    checkSecurity();
    fetchPhotos();

    const channel = supabase
      .channel('gallery_security')
      .on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'key=eq.is_gallery_enabled' }, 
        (payload) => setIsEnabled(payload.new.value === 'true')
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      if (e.target.files.length > 5) {
        setStatus("⚠️ Maximum 5 photos allowed.");
        setFiles([]); 
        e.target.value = ''; 
        return;
      }
      setFiles(Array.from(e.target.files));
      setStatus(""); 
      setProgress(0);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setStatus("Optimizing for upload...");
    setProgress(15);

    const options = {
      maxSizeMB: 3,           // BYPASS VERCEL LIMIT: Keeps files under 4.5MB
      maxWidthOrHeight: 2560, // 2K resolution (looks sharp on iPhone 14 Pro Max)
      useWebWorker: true,
    };

    const formData = new FormData();

    try {
      for (const file of files) {
        // Compress on guest's phone
        const compressedFile = await imageCompression(file, options);
        formData.append('file', compressedFile, file.name);
      }

      setStatus("Sending to gallery...");
      setProgress(45);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });

      if (res.ok) {
        setProgress(100);
        setStatus("✨ Success! Photos shared.");
        setFiles([]);
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (input) input.value = ''; 
        fetchPhotos(); 
        setTimeout(() => setProgress(0), 1500);
      } else {
        const errorData = await res.json();
        setStatus(`Error: ${errorData.error}`);
      }
    } catch (err) {
      setStatus("Upload failed. Try again.");
    } finally {
      setUploading(false);
      setTimeout(() => setStatus(""), 5000);
    }
  };

  const chunkPhotos = (arr: any[], size: number) => {
    return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
      arr.slice(i * size, i * size + size)
    );
  };

  if (isEnabled === false) {
    return (
      <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col items-center font-sans relative">
        <Navigation />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-700">
          <img src="/logo.png" alt="Logo" className="w-20 h-auto mb-8 opacity-50" />
          <h1 className="text-3xl font-serif text-stone-900 mb-2">Gallery is available yet</h1>
          <p className="text-stone-500 italic font-serif">Check back later!</p>
        </div>
      </div>
    );
  }

  if (isEnabled === null) return <div className="min-h-screen bg-[#D0E0F0]" />;

  return (
    <div className="min-h-screen bg-[#D0E0F0] text-stone-800 flex flex-col items-center font-sans relative pb-20 overflow-x-hidden">
      <Navigation />

      <section className="max-w-md w-full mx-4 mt-6 md:mt-8 bg-white p-8 md:p-12 rounded-[40px] shadow-2xl border border-stone-100 text-center animate-in fade-in duration-1000">
        <div className="flex justify-center mb-6">
          <img src="/logo.png" alt="Logo" className="w-20 h-auto" />
        </div>

        <div className="border-b border-stone-50 pb-6 mb-8 text-center">
          <h1 className="text-4xl font-serif text-stone-900 mb-2">Guest Gallery</h1>
          <p className="font-serif italic text-stone-400 text-lg">Share memories with us</p>
        </div>

        <form onSubmit={handleUpload} className="space-y-6">
          <div className="space-y-4 text-left relative">
            <label className="text-[11px] uppercase text-stone-500 font-bold ml-2 tracking-widest">Select Photos (Max 5)</label>
            <div className="relative w-full">
              <input type="file" multiple accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="w-full p-4 border border-stone-200 rounded-2xl bg-stone-50 text-base flex justify-between items-center focus-within:border-stone-400">
                <span className={`truncate mr-4 ${files.length > 0 ? 'text-stone-900' : 'text-stone-400 italic'}`}>
                  {files.length > 0 ? `${files.length} selected` : "Click to choose photos"}
                </span>
                <span className="shrink-0 text-[10px] uppercase font-bold text-stone-600 bg-stone-200 px-4 py-2 rounded-full">Browse</span>
              </div>
            </div>
          </div>

          {progress > 0 && (
            <div className="w-full bg-stone-100 rounded-full h-3 overflow-hidden relative shadow-inner animate-in fade-in duration-300">
              <div 
                className={`h-full transition-all duration-300 ease-out flex items-center justify-center ${progress === 100 ? 'bg-green-500' : 'bg-stone-900'}`} 
                style={{ width: `${progress}%` }}
              >
                {progress > 20 && <span className="text-[9px] text-white font-black">{progress}%</span>}
              </div>
            </div>
          )}

          <button 
            type="submit" 
            disabled={uploading || files.length === 0}
            className={`w-full bg-stone-900 text-white py-5 rounded-full uppercase text-xs font-bold tracking-widest shadow-xl transition-all ${
              files.length === 0 || uploading ? 'opacity-30' : 'hover:bg-stone-800 active:scale-95'
            }`}
          >
            {uploading ? "Uploading..." : "Upload Photos"}
          </button>

          {status && (
            <p className={`text-sm italic font-serif h-4 ${status.includes('Success') ? 'text-green-600' : 'text-stone-500'}`}>
              {status}
            </p>
          )}
        </form>
      </section>

      <section className="max-w-[1400px] w-full mt-16 md:mt-24 px-4 md:px-0">
        <h2 className="text-4xl font-serif text-center mb-12 text-stone-900">Shared Photos</h2>
        
        {photos.length === 0 ? (
          <p className="text-center italic text-stone-400 font-serif text-lg py-10">No photos shared yet.</p>
        ) : (
          <div className="space-y-10 md:space-y-16">
            {chunkPhotos(photos, 6).map((row, rowIndex) => (
              <div 
                key={`row-${rowIndex}`} 
                className="flex flex-nowrap md:grid md:grid-cols-6 gap-10 md:gap-12 overflow-x-auto snap-x snap-mandatory pb-8 scrollbar-hide w-full"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
              >
                {row.map((photo: any) => (
                  <div key={photo.id} className="shrink-0 w-[31%] md:w-auto snap-start">
                    {/* THIN WHITE POLAROID FRAME */}
                    <div className="bg-white p-1 md:p-1.5 shadow-[0_8px_25px_rgba(0,0,0,0.08)] rounded-sm border-[1px] border-white active:scale-95 transition-all duration-200">
                      <a 
                        href={photo.thumbnailLink?.replace('=s220', '=s1600') || `https://drive.google.com/thumbnail?id=${photo.id}&sz=w1600`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="block relative aspect-[4/5] overflow-hidden bg-stone-50"
                      >
                        <img 
                          src={photo.thumbnailLink?.replace('=s220', '=s600') || `https://drive.google.com/thumbnail?id=${photo.id}&sz=w600`} 
                          alt={photo.name}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}