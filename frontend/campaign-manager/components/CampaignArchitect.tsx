"use client";
import { useState } from 'react';
import { Sparkles, Send, Loader2, Save, Edit3, BarChart2, Target, Calendar, DollarSign, Megaphone } from 'lucide-react';

export default function CampaignArchitect({ 
  tenantName, 
  segmentData = [],
  onCampaignsRefreshed
}: { 
  tenantName: string, 
  segmentData?: any[],
  onCampaignsRefreshed?: (campaigns: any[]) => void
}) {
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [sendingDraftIndex, setSendingDraftIndex] = useState<number | null>(null);
  
  // Expanded State for Professional Campaign Management
  const [form, setForm] = useState({ 
    campaignName: '',
    objective: 'Lead Generation',
    channel: 'Email',
    startDate: '',
    endDate: '',
    budget: '',
    language: 'English',
    tone: 'Professional',
    item: '', 
    price: '', 
    cat: 'Fashion', 
    disc: 15, 
    otherDetails: '' 
  });

  const handleGenerate = async () => {
    if (!segmentData || segmentData.length === 0) {
      alert("Please upload customer data in AI Insights first to target your audience.");
      return;
    }
    setLoading(true);
    
    // We combine the new metadata into the existing backend structure so it works immediately
    const smartContext = `Campaign Goal: ${form.objective}. Tone of Voice: ${form.tone}. Language: ${form.language}. ${form.otherDetails}`;

    try {
      const res = await fetch('http://localhost:8000/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          campaign_name: form.campaignName,
          objective: form.objective,
          language: form.language,
          tone: form.tone,
          smart_context: smartContext,
          customer_data: segmentData 
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        const normalizedDrafts = (data.segments || data.campaigns || []).map((segment: any) => ({
          target_segment: segment.target_segment || segment.segment_name || "Target Audience",
          subject: segment.subject || `Campaign Message for ${segment.segment_name || "Audience"}`,
          body: segment.body || segment.generated_message || ""
        }));
        setCampaigns(normalizedDrafts);
        setActiveCampaignId(data.campaign_id || null);
      } else {
        alert("Server Error: " + data.detail);
      }
    } catch (error) {
      alert("Check if Backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCampaign = async () => {
    if (!form.campaignName.trim()) {
      alert("Please enter a campaign name");
      return;
    }
    if (!segmentData || segmentData.length === 0) {
      alert("Please select a target audience");
      return;
    }
    
    setSavingCampaign(true);
    
    const smartContext = `Campaign Goal: ${form.objective}. Tone of Voice: ${form.tone}. Language: ${form.language}. ${form.otherDetails}`;
    
    try {
      const res = await fetch('http://localhost:8000/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_name: form.campaignName,
          budget: form.budget ? Number(form.budget) : null,
          language: form.language,
          objective: form.objective,
          tone: form.tone,
          target_audience_filter: {},
          smart_context: smartContext,
          customer_data: segmentData
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        const refreshRes = await fetch('http://localhost:8000/api/campaigns');
        const refreshData = await refreshRes.json();
        if (refreshData.status === "success") {
          onCampaignsRefreshed?.(Array.isArray(refreshData.campaigns) ? refreshData.campaigns : []);
        }

        // Clear generated draft cards after save so UI remains clean
        setCampaigns([]);
        setActiveCampaignId(null);

        alert(`Campaign "${form.campaignName}" saved successfully!`);
        // Reset form after successful save
        setForm({
          campaignName: '',
          objective: 'Lead Generation',
          channel: 'Email',
          startDate: '',
          endDate: '',
          budget: '',
          language: 'English',
          tone: 'Professional',
          item: '',
          price: '',
          cat: 'Fashion',
          disc: 15,
          otherDetails: ''
        });
      } else {
        alert("Error: " + data.detail);
      }
    } catch (error) {
      alert("Failed to save campaign. Check if Backend is running.");
    } finally {
      setSavingCampaign(false);
    }
  };

  const handleSendCampaignNow = async (camp: any, index: number) => {
    if (!activeCampaignId) {
      alert("Please generate campaign drafts first.");
      return;
    }

    const segmentName = camp.target_segment || "Target Audience";
    const customerIds = Array.from(
      new Set(
        (segmentData || [])
          .filter((customer: any) => customer.segment_name === segmentName)
          .map((customer: any) => String(customer.customer_id))
          .filter(Boolean)
      )
    );

    setSendingDraftIndex(index);
    try {
      const res = await fetch(`http://localhost:8000/api/campaigns/${activeCampaignId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: activeCampaignId,
          recipients: [
            "jeniroselin20@gmail.com",
            "yuvasrieswara77@gmail.com"
          ],
          segment_messages: [
            {
              segment_name: segmentName,
              customer_ids: customerIds,
              message: camp.body,
              subject: camp.subject
            }
          ]
        }),
      });

      const data = await res.json();
      if (data.status === "success") {
        alert(`Campaign sent successfully to ${data.sent ?? 0} recipient(s).`);
      } else {
        alert("Send failed: " + (data.detail || data.message || "Unknown error"));
      }
    } catch (error) {
      alert("Failed to send campaign. Check if backend server is running and authenticated.");
    } finally {
      setSendingDraftIndex(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* SECTION 1: Strategy & Metadata */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-[#4B0082] mb-6 flex items-center gap-2">
          <Target size={24} /> 1. Strategy & Goals
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Campaign Name</label>
            <input className="w-full bg-gray-50 p-3 rounded-xl outline-none border-2 border-transparent focus:border-indigo-200" 
              placeholder="e.g., Summer Blowout 2026" onChange={e => setForm({...form, campaignName: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Primary Objective</label>
            <select className="w-full bg-gray-50 p-3 rounded-xl outline-none" onChange={e => setForm({...form, objective: e.target.value})}>
              <option>Lead Generation</option>
              <option>Sales & Conversions</option>
              <option>Brand Awareness</option>
              <option>Customer Retention</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Target Channel</label>
            <select className="w-full bg-gray-50 p-3 rounded-xl outline-none" onChange={e => setForm({...form, channel: e.target.value})}>
              <option>Email</option>
              <option>SMS</option>
              <option>WhatsApp</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 2: Financials & Operations */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-[#4B0082] mb-6 flex items-center gap-2">
          <Calendar size={24} /> 2. Timeline & Budget
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Start Date</label>
            <input type="date" className="w-full bg-gray-50 p-3 rounded-xl outline-none" onChange={e => setForm({...form, startDate: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">End Date</label>
            <input type="date" className="w-full bg-gray-50 p-3 rounded-xl outline-none" onChange={e => setForm({...form, endDate: e.target.value})} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block flex items-center gap-1"><DollarSign size={14}/> Budget Allocation</label>
            <input type="number" className="w-full bg-gray-50 p-3 rounded-xl outline-none" placeholder="10000" onChange={e => setForm({...form, budget: e.target.value})} />
          </div>
        </div>
      </div>

      {/* SECTION 3: Content & Creative */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-[#4B0082] mb-6 flex items-center gap-2">
          <Megaphone size={24} /> 3. Creative Engine
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Product/Offer</label>
            <input className="w-full bg-gray-50 p-3 rounded-xl outline-none" placeholder="Designer Bag" onChange={e => setForm({...form, item: e.target.value})} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Price (₹)</label>
            <input className="w-full bg-gray-50 p-3 rounded-xl outline-none" type="number" placeholder="5000" onChange={e => setForm({...form, price: e.target.value})} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Discount (%)</label>
            <input className="w-full bg-gray-50 p-3 rounded-xl outline-none" type="number" placeholder="15" value={form.disc} onChange={e => setForm({...form, disc: Number(e.target.value)})} />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Tone of Voice</label>
            <select className="w-full bg-gray-50 p-3 rounded-xl outline-none" onChange={e => setForm({...form, tone: e.target.value})}>
              <option>Professional</option><option>Urgent & Exciting</option><option>Friendly & Casual</option>
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">Creative Brief (Instructions for AI)</label>
            <textarea className="w-full bg-gray-50 p-3 rounded-xl outline-none h-24" placeholder="Mention eco-friendly packaging and free shipping..." value={form.otherDetails} onChange={e => setForm({...form, otherDetails: e.target.value})} />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button onClick={handleGenerate} disabled={loading} className="bg-[#5D00B1] text-white px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#4B0082] shadow-lg disabled:bg-gray-300 transition-all">
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />} 
            Generate Campaign Drafts
          </button>
        </div>
      </div>

      {/* SECTION 4: Generated Drafts & Lifecycle Management */}
      {campaigns && campaigns.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
          {campaigns.map((camp, i) => (
            <div key={i} className="bg-white p-6 rounded-[2rem] border-t-4 border-indigo-500 shadow-lg flex flex-col">
              <div className="flex justify-between items-center mb-4 border-b pb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase text-gray-400 block">Target Audience</span>
                    <span className="text-sm font-bold text-[#4B0082]">{camp.target_segment}</span>
                  </div>
                  <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">Draft</span>
              </div>
              
              <p className="font-bold text-gray-800 mb-2">{camp.subject}</p>
              <div className="text-xs text-gray-600 flex-1 overflow-y-auto mb-6 bg-gray-50 p-4 rounded-xl italic leading-relaxed whitespace-pre-wrap">
                  {camp.body}
              </div>
              
              {/* Campaign Lifecycle Action Buttons */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button className="bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 text-sm transition-all">
                  <Edit3 size={16} /> Edit Copy
                </button>
                <button className="bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-200 text-sm transition-all">
                  <Save size={16} /> Save to Draft
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSendCampaignNow(camp, i)}
                  disabled={sendingDraftIndex === i}
                  className="bg-[#0F172A] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black text-sm transition-all shadow-md disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {sendingDraftIndex === i ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Send Now
                    </>
                  )}
                </button>
                <button className="border-2 border-indigo-100 text-indigo-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 text-sm transition-all">
                  <BarChart2 size={16} /> View ROI
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Primary Action: Save Campaign Button - Always Visible */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <button
          onClick={handleSaveCampaign}
          disabled={savingCampaign}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg"
        >
          {savingCampaign ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              Saving Campaign...
            </>
          ) : (
            <>
              <Save size={20} />
              Save Campaign
            </>
          )}
        </button>
      </div>
    </div>
  );
}