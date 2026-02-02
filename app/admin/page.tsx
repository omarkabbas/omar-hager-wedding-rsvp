"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminDashboard() {
  const [responses, setResponses] = useState<any[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Form State for Adding New Guests
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newLimit, setNewLimit] = useState(1);

  const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('rsvp_list').select('*').order('guest_name', { ascending: true });
    if (data) setResponses(data);
    setLoading(false);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthorized(true);
      fetchData();
    } else {
      alert("Incorrect password.");
    }
  };

  // ADD GUEST LOGIC
  const addGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('rsvp_list').insert([
      { guest_name: newName, invite_code: newCode.toUpperCase().trim(), max_guests: newLimit }
    ]);
    if (error) alert("Error adding guest: " + error.message);
    else {
      setNewName(''); setNewCode(''); setNewLimit(1);
      fetchData();
    }
  };

  // DELETE GUEST LOGIC
  const deleteGuest = async (id: string) => {
    if (confirm("Are you sure you want to remove this guest?")) {
      await supabase.from('rsvp_list').delete().eq('id', id);
      fetchData();
    }
  };

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] p-6 font-sans">
        <form onSubmit={handleLogin} className="bg-white p-10 rounded-3xl shadow-sm border border-stone-100 w-full max-w-sm text-center">
          <h1 className="text-2xl font-serif mb-6 text-stone-900">Admin Login</h1>
          <input 
            type="password" 
            className="w-full border-b py-3 mb-8 outline-none text-center tracking-widest"
            placeholder="Password"
            onChange={(e) => setPasswordInput(e.target.value)}
          />
          <button className="w-full bg-stone-900 text-white py-4 rounded-full text-[10px] uppercase tracking-widest">Access Dashboard</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8 md:p-16 text-stone-800 font-sans">
      <div className="max-w-5xl mx-auto">
        
        <header className="mb-12 border-b pb-10">
          <h1 className="text-4xl font-serif text-stone-900">Guest Management</h1>
          <p className="text-stone-400 text-[10px] tracking-[0.3em] uppercase mt-2 font-bold text-pink-800">Omar & Hager | Dallas 2026</p>
        </header>

        {/* ADD NEW GUEST FORM */}
        <section className="bg-stone-50 p-8 rounded-3xl mb-16 border border-stone-100">
          <h2 className="text-lg font-serif mb-6">Add New Invitation</h2>
          <form onSubmit={addGuest} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[9px] uppercase tracking-widest text-stone-400 mb-2">Guest/Party Name</label>
              <input value={newName} onChange={(e)=>setNewName(e.target.value)} required className="w-full p-3 rounded-lg border bg-white text-sm outline-none focus:border-stone-900" placeholder="e.g. The Miller Family" />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-widest text-stone-400 mb-2">Invite Code</label>
              <input value={newCode} onChange={(e)=>setNewCode(e.target.value)} required className="w-full p-3 rounded-lg border bg-white text-sm outline-none focus:border-stone-900" placeholder="MILLER2026" />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-widest text-stone-400 mb-2">Guest Limit</label>
              <input type="number" value={newLimit} onChange={(e)=>setNewLimit(parseInt(e.target.value))} required className="w-full p-3 rounded-lg border bg-white text-sm outline-none focus:border-stone-900" min="1" />
            </div>
            <button type="submit" className="bg-stone-900 text-white p-3 rounded-lg text-[10px] uppercase tracking-widest hover:bg-stone-700 transition-all font-bold">Add Guest</button>
          </form>
        </section>

        {/* GUEST LIST TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-stone-400 border-b border-stone-100">
                <th className="pb-4">Name</th>
                <th className="pb-4 text-center">Code</th>
                <th className="pb-4 text-center">RSVP Status</th>
                <th className="pb-4 text-center">Limit/Actual</th>
                <th className="pb-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {responses.map((guest) => (
                <tr key={guest.id}>
                  <td className="py-6 font-serif text-lg">{guest.guest_name}</td>
                  <td className="py-6 text-center text-xs font-mono uppercase text-stone-400">{guest.invite_code}</td>
                  <td className="py-6 text-center">
                    {guest.attending === null ? (
                      <span className="text-[9px] uppercase tracking-widest text-stone-300 italic font-bold">Pending</span>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-[9px] uppercase tracking-widest font-bold ${guest.attending ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {guest.attending ? 'Attending' : 'Declined'}
                      </span>
                    )}
                  </td>
                  <td className="py-6 text-center font-serif">
                     <span className="text-stone-300">{guest.max_guests} / </span>
                     <span className="text-xl">{guest.attending ? guest.confirmed_guests : 0}</span>
                  </td>
                  <td className="py-6 text-right">
                    <button onClick={() => deleteGuest(guest.id)} className="text-[9px] uppercase tracking-widest text-red-300 hover:text-red-600 font-bold transition-colors">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}