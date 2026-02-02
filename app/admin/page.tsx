"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function AdminDashboard() {
  const [responses, setResponses] = useState<any[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newLimit, setNewLimit] = useState(1);

  const fetchData = async () => {
    const { data } = await supabase.from('rsvp_list').select('*').order('guest_name', { ascending: true });
    if (data) setResponses(data);
  };

  useEffect(() => {
    if (authorized) {
      fetchData();
      const channel = supabase.channel('admin_live').on('postgres_changes', { event: '*', table: 'rsvp_list', schema: 'public' }, fetchData).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [authorized]);

  const addGuest = async (e: any) => {
    e.preventDefault();
    const { error } = await supabase.from('rsvp_list').insert([{ guest_name: newName, invite_code: newCode.toUpperCase().trim(), max_guests: newLimit }]);
    if (error) alert("Error: " + error.message);
    setNewName(''); setNewCode(''); setNewLimit(1);
  };

  const totalAccepted = responses.filter(r => r.attending === true).reduce((sum, r) => sum + (r.confirmed_guests || 0), 0);

  if (!authorized) return (
    <div className="min-h-screen flex items-center justify-center bg-[#D0E0F0] p-6 font-sans">
      <form onSubmit={(e: any) => { e.preventDefault(); if (passwordInput === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) setAuthorized(true); }} className="bg-white p-12 rounded-[40px] shadow-2xl w-full max-w-sm text-center">
        <h1 className="text-3xl font-serif mb-8 text-stone-900">Admin Login</h1>
        <input type="password" className="w-full border-b py-4 mb-10 outline-none text-center font-bold" placeholder="Password" onChange={(e) => setPasswordInput(e.target.value)} />
        <button className="w-full bg-stone-900 text-white py-5 rounded-full text-[12px] uppercase font-bold">Access</button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-white p-12 text-stone-800 font-sans">
      <div className="max-w-6xl mx-auto">
        <Link href="/" className="px-8 py-3 bg-stone-100 rounded-full text-[11px] uppercase font-bold hover:bg-stone-900 hover:text-white transition-all">Back to Home</Link>
        <header className="flex justify-between items-end mt-12 mb-16 border-b pb-12">
          <div><h1 className="text-5xl font-serif text-stone-900">Guest Management</h1><p className="text-stone-400 uppercase text-[10px] mt-2 font-bold font-sans">Omar & Hager | 2026</p></div>
          <div className="text-right font-sans"><p className="text-[10px] uppercase text-stone-400 font-bold mb-1">Final Count</p><span className="text-7xl font-serif text-pink-900">{totalAccepted}</span></div>
        </header>

        <section className="bg-stone-50 p-10 rounded-[40px] mb-16 border border-stone-100 text-center font-sans">
          <h2 className="text-2xl font-serif mb-8 text-stone-900">Add New Invitation</h2>
          <form onSubmit={addGuest} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end font-sans">
            <input value={newName} onChange={(e)=>setNewName(e.target.value)} required className="p-4 rounded-xl border text-sm font-sans" placeholder="Guest Name" />
            <input value={newCode} onChange={(e)=>setNewCode(e.target.value)} required className="p-4 rounded-xl border text-sm font-sans" placeholder="Invite Code" />
            <input type="number" value={newLimit} onChange={(e)=>setNewLimit(parseInt(e.target.value))} required className="p-4 rounded-xl border text-sm font-sans" min="1" />
            <button className="bg-stone-900 text-white p-4 rounded-xl text-[11px] uppercase font-bold shadow-lg font-sans">Add to List</button>
          </form>
        </section>

        <table className="w-full text-left font-sans">
          <thead className="text-[10px] uppercase text-stone-400 border-b border-stone-100">
            <tr><th className="pb-6">Name</th><th className="pb-6 text-center">Status</th><th className="pb-6 text-center">Invited / Accepted</th><th className="pb-6 text-center">Invite</th><th className="pb-6 text-center">Code</th><th className="pb-6 text-right font-sans">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {responses.map((guest) => (
              <tr key={guest.id} className="text-stone-900">
                <td className="py-8 font-serif text-xl">{guest.guest_name}</td>
                <td className="py-8 text-center font-sans"><span className={`px-4 py-2 rounded-full text-[10px] uppercase font-bold ${guest.attending === null ? 'text-stone-300' : guest.attending ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{guest.attending === null ? 'Pending' : guest.attending ? 'Attending' : 'Declined'}</span></td>
                <td className="py-8 text-center font-serif text-2xl"><span className="text-stone-300">{guest.max_guests}</span> <span className="mx-1 text-stone-200">/</span> {guest.attending ? guest.confirmed_guests : 0}</td>
                <td className="py-8 text-center"><button onClick={() => { navigator.clipboard.writeText(`Hi ${guest.guest_name}! Please RSVP at: omar-hager.com/${guest.invite_code}`); alert("Copied!"); }} className="px-5 py-2 bg-stone-100 rounded-full text-[10px] uppercase font-bold hover:bg-stone-900 hover:text-white transition-all font-sans">Copy</button></td>
                <td className="py-8 text-center font-mono text-stone-400 text-xs uppercase italic">{guest.invite_code}</td>
                <td className="py-8 text-right font-sans"><button onClick={async () => { if(confirm("Remove?")) await supabase.from('rsvp_list').delete().eq('id', guest.id); }} className="text-[10px] uppercase text-red-300 font-bold hover:text-red-600 transition-colors font-sans">Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}