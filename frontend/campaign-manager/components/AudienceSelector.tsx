"use client";
import { useState, useEffect } from 'react';
import { Filter, Users, Calendar, ShoppingCart, DollarSign, ArrowRight, Loader2 } from 'lucide-react';

export default function AudienceSelector({ 
  rawData = [], 
  onAudienceConfirmed,
  isConfirming = false
}: { 
  rawData: any[], 
  onAudienceConfirmed: (filteredData: any[]) => void | Promise<void>,
  isConfirming?: boolean
}) {
  // Filter States
  const [minFreq, setMinFreq] = useState<number | ''>('');
  const [maxFreq, setMaxFreq] = useState<number | ''>('');
  const [maxRecency, setMaxRecency] = useState<number | ''>(''); // e.g., "Bought within last X days"
  const [minRev, setMinRev] = useState<number | ''>('');
  const [maxRev, setMaxRev] = useState<number | ''>('');

  const [filteredData, setFilteredData] = useState<any[]>(rawData);

  // Apply filters whenever inputs change
  useEffect(() => {
    let result = rawData;

    if (minFreq !== '') result = result.filter(c => c.frequency >= Number(minFreq));
    if (maxFreq !== '') result = result.filter(c => c.frequency <= Number(maxFreq));
    
    // Recency is "days since last purchase", so "Bought within 30 days" means recency <= 30
    if (maxRecency !== '') result = result.filter(c => c.recency <= Number(maxRecency));
    
    if (minRev !== '') result = result.filter(c => c.monetary >= Number(minRev));
    if (maxRev !== '') result = result.filter(c => c.monetary <= Number(maxRev));

    setFilteredData(result);
  }, [minFreq, maxFreq, maxRecency, minRev, maxRev, rawData]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-8 items-start">
        
        {/* FILTER CONTROLS */}
        <div className="flex-1 space-y-6 w-full">
          <h2 className="text-xl font-bold text-[#4B0082] flex items-center gap-2 mb-6">
            <Filter size={24} /> Audience Targeting Engine
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Frequency */}
            <div className="bg-gray-50 p-5 rounded-2xl">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mb-3">
                <ShoppingCart size={16} /> Frequency (No. of Orders)
              </label>
              <div className="flex gap-2 items-center">
                <input type="number" placeholder="Min" className="w-full p-2 rounded-lg border outline-none focus:border-indigo-300" 
                  value={minFreq} onChange={e => setMinFreq(e.target.value ? Number(e.target.value) : '')} />
                <span className="text-gray-400">to</span>
                <input type="number" placeholder="Max" className="w-full p-2 rounded-lg border outline-none focus:border-indigo-300" 
                  value={maxFreq} onChange={e => setMaxFreq(e.target.value ? Number(e.target.value) : '')} />
              </div>
            </div>

            {/* Revenue */}
            <div className="bg-gray-50 p-5 rounded-2xl">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mb-3">
                <DollarSign size={16} /> Revenue Generated (₹)
              </label>
              <div className="flex gap-2 items-center">
                <input type="number" placeholder="Min ₹" className="w-full p-2 rounded-lg border outline-none focus:border-indigo-300" 
                  value={minRev} onChange={e => setMinRev(e.target.value ? Number(e.target.value) : '')} />
                <span className="text-gray-400">to</span>
                <input type="number" placeholder="Max ₹" className="w-full p-2 rounded-lg border outline-none focus:border-indigo-300" 
                  value={maxRev} onChange={e => setMaxRev(e.target.value ? Number(e.target.value) : '')} />
              </div>
            </div>

            {/* Recency */}
            <div className="bg-gray-50 p-5 rounded-2xl md:col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2 mb-3">
                <Calendar size={16} /> Recency (Time since last purchase)
              </label>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-600">Bought within the last</span>
                <input type="number" placeholder="e.g., 30" className="w-24 p-2 rounded-lg border outline-none focus:border-indigo-300" 
                  value={maxRecency} onChange={e => setMaxRecency(e.target.value ? Number(e.target.value) : '')} />
                <span className="text-sm font-semibold text-gray-600">days.</span>
              </div>
            </div>
          </div>
        </div>

        {/* AUDIENCE SUMMARY PANEL */}
        <div className="w-full md:w-80 bg-[#4B0082] text-white p-6 rounded-3xl shadow-lg flex flex-col justify-between h-full sticky top-6">
          <div>
            <h3 className="text-indigo-200 font-bold uppercase text-xs tracking-wider mb-2">Target Audience Size</h3>
            <p className="text-5xl font-black mb-6">{filteredData.length}</p>
            <p className="text-sm text-indigo-200 mb-6">
              Out of {rawData.length} total customers uploaded.
            </p>
            
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-sm border-b border-indigo-800 pb-2">
                <span className="text-indigo-200">Avg Spend:</span>
                <span className="font-bold text-green-300">
                  ₹{filteredData.length > 0 ? Math.round(filteredData.reduce((acc, c) => acc + Number(c.monetary ?? 0), 0) / filteredData.length) : 0}
                </span>
              </div>
              <div className="flex justify-between text-sm border-b border-indigo-800 pb-2">
                <span className="text-indigo-200">Avg Orders:</span>
                <span className="font-bold text-blue-300">
                  {filteredData.length > 0 ? Math.round(filteredData.reduce((acc, c) => acc + Number(c.frequency ?? 0), 0) / filteredData.length) : 0}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onAudienceConfirmed(filteredData)}
            disabled={isConfirming}
            className="w-full bg-[#5D00B1] border border-indigo-400 hover:bg-white hover:text-[#4B0082] py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-[#5D00B1] disabled:hover:text-white"
          >
            {isConfirming ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Segmenting Audience...
              </>
            ) : (
              <>
                Confirm Audience <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

      </div>

      {/* QUICK PREVIEW TABLE */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
         <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Users size={18}/> Audience Preview (Top 10)</h3>
         <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-400 uppercase text-xs">
              <tr>
                <th className="p-3 rounded-tl-lg">Customer ID</th>
                <th className="p-3">Recency (Days)</th>
                <th className="p-3">Frequency</th>
                <th className="p-3">Revenue</th>
                <th className="p-3 rounded-tr-lg">AI Tag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredData.slice(0, 10).map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">{c.customer_id.substring(0,8)}...</td>
                  <td className="p-3">{c.recency} days ago</td>
                  <td className="p-3">{c.frequency} orders</td>
                  <td className="p-3 font-semibold text-green-600">₹{c.monetary}</td>
                  <td className="p-3">
                    <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md text-[10px] font-bold">
                      {c.segment_name}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400 italic">No customers match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}