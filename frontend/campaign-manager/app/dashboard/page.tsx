"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, BarChart3, Settings,
  LogOut, Megaphone, Plus, Loader2, TrendingUp, Calendar, Trash2
} from 'lucide-react';
import CampaignGenerator from '@/components/CampaignGenerator';
import CampaignArchitect from '@/components/CampaignArchitect';
import CampaignHistory from '@/components/CampaignHistory';
import AudienceSelector from '@/components/AudienceSelector';

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenantId = searchParams.get('id');
 
  // State management
  const [companyName, setCompanyName] = useState<string>('');
  const [currentTab, setCurrentTab] = useState('Overview');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [rawSegmentData, setRawSegmentData] = useState<any[]>([]);
  const [segmentData, setSegmentData] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState('All');
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);

  // Fetch company name
  useEffect(() => {
    async function fetchName() {
      if (tenantId) {
        const { getTenantName } = await import('../login/actions');
        const result = await getTenantName(tenantId);
        if (result.success) setCompanyName(result.name);
      }
    }
    fetchName();
  }, [tenantId]);

  // Fetch campaigns on mount
  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/campaigns');
      const result = await response.json();
      if (result.status === 'success') {
        setCampaigns(result.campaigns);
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    }
  };

  const fetchAllCustomers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/customers');
      const result = await response.json();
      if (result.status === 'success') {
        setAllCustomers(result.customers);
        setRawSegmentData(result.customers);
        return result.customers;
      }
    } catch (error) {
      alert('Failed to fetch customers from database');
    } finally {
      setIsLoading(false);
    }
    return [];
  };

  const handleCreateNewCampaign = async () => {
    setIsLoading(true);
    const customers = await fetchAllCustomers();
    if (customers.length > 0) {
      setCurrentTab('Targeting');
    }
    setIsLoading(false);
  };

  const handleRunAgain = async (campaign: any) => {
    setSelectedCampaign(campaign);
    await fetchAllCustomers();
    setCurrentTab('Targeting');
  };

  const handleDeleteCampaign = async (campaignId: string, campaignName: string) => {
    if (!window.confirm('Are you sure?')) {
      return;
    }
    try {
      const response = await fetch(`http://localhost:8000/api/campaigns/${campaignId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (result.status === 'success') {
        // Remove the campaign from the list
        setCampaigns(campaigns.filter(c => c.campaign_id !== campaignId));
        alert('Campaign deleted successfully');
      } else {
        alert('Failed to delete campaign: ' + result.detail);
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Error deleting campaign');
    }
  };

  const filteredCustomers = selectedSegment === 'All'
    ? segmentData
    : segmentData.filter(c => c.segment_name === selectedSegment);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#4B0082] text-white p-6 flex flex-col h-screen sticky top-0">
        <h2 className="text-2xl font-bold mb-10 text-indigo-100">Campaign Manager</h2>
       
        {/* Create Campaign Button */}
        <button
          onClick={handleCreateNewCampaign}
          disabled={isLoading}
          className="w-full mb-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-4 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="animate-spin" size={20}/> : <Plus size={20} />}
          Create Campaign
        </button>
       
        <nav className="flex-1 space-y-2">
          <button onClick={() => setCurrentTab('Overview')} className="w-full text-left">
            <NavItem icon={<LayoutDashboard size={20}/>} label="All Campaigns" active={currentTab === 'Overview'} />
          </button>
          <button onClick={() => setCurrentTab('Targeting')} className="w-full text-left">
            <NavItem icon={<Users size={20}/>} label="Target Audience" active={currentTab === 'Targeting'} />
          </button>
          <button onClick={() => setCurrentTab('AI Insights')} className="w-full text-left">
            <NavItem icon={<BarChart3 size={20}/>} label="AI Insights" active={currentTab === 'AI Insights'} />
          </button>
          <button onClick={() => setCurrentTab('Campaigns')} className="w-full text-left">
            <NavItem icon={<Megaphone size={20}/>} label="Generate Copy" active={currentTab === 'Campaigns'} />
          </button>
          <button onClick={() => setCurrentTab('ROI')} className="w-full text-left">
            <NavItem icon={<TrendingUp size={20}/>} label="View ROI" active={currentTab === 'ROI'} />
          </button>
          <NavItem icon={<Settings size={20}/>} label="Settings" />
        </nav>
        <button onClick={() => router.push('/')} className="flex items-center gap-3 text-indigo-200 hover:text-white pt-6 border-t border-indigo-800 mt-auto mb-4">
          <LogOut size={20} /> <span className="font-semibold">Logout</span>
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Welcome, {companyName || 'Company'}</h1>
            <p className="text-gray-500 text-sm italic">Tenant Context: {tenantId || 'Default'}</p>
          </div>
        </header>

        {/* OVERVIEW TAB - Show All Campaigns */}
        {currentTab === 'Overview' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">All Campaigns</h2>
              <div className="text-sm text-gray-500">
                {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} total
              </div>
            </div>

            {campaigns.length === 0 ? (
              <div className="bg-white p-20 rounded-3xl border-2 border-dashed flex flex-col items-center">
                <Megaphone size={48} className="mb-4 opacity-20 text-gray-400" />
                <p className="text-gray-400 italic mb-4">No campaigns yet</p>
                <button
                  onClick={handleCreateNewCampaign}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-6 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg flex items-center gap-2"
                >
                  <Plus size={20} />
                  Create Your First Campaign
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map((campaign) => (
                  <CampaignCard
                    key={campaign.campaign_id}
                    campaign={campaign}
                    onRunAgain={() => handleRunAgain(campaign)}
                    onViewROI={() => {
                      setSelectedCampaign(campaign);
                      setCurrentTab('ROI');
                    }}
                    onDelete={() => handleDeleteCampaign(campaign.campaign_id, campaign.campaign_name)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI INSIGHTS TAB */}
        {currentTab === 'AI Insights' && (
          <div className="space-y-10 animate-in fade-in duration-500">
            {segmentData.length > 0 ? (
              <>
                <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-gray-700">Detailed Customer Breakdown</h3>
                   
                    {/* --- FULLY DYNAMIC DROPDOWN --- */}
                    <select
                      className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-indigo-200"
                      onChange={(e) => setSelectedSegment(e.target.value)}
                      value={selectedSegment}
                    >
                      <option value="All">All Segments</option>
                      {Array.from(new Set(segmentData.map(c => c.segment_name))).map((seg: any) => (
                        <option key={seg} value={seg}>{seg}</option>
                      ))}
                    </select>

                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 text-xs uppercase text-gray-400 sticky top-0">
                        <tr>
                          <th className="px-6 py-4">Customer ID</th>
                          <th className="px-6 py-4">Segment</th>
                          <th className="px-6 py-4">Total Spend</th>
                          <th className="px-6 py-4">Frequency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredCustomers.slice(0, 50).map((customer, i) => (
                          <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs text-gray-600">{customer.customer_id}</td>
                           
                            {/* --- FULLY DYNAMIC BADGES --- */}
                            <td className="px-6 py-4">
                              <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200 shadow-sm">
                                {customer.segment_name}
                              </span>
                            </td>

                            <td className="px-6 py-4 font-semibold text-gray-700">₹{customer.monetary}</td>
                            <td className="px-6 py-4 text-gray-500">{customer.frequency} orders</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-20 text-center text-gray-400 italic">Please upload a file to begin AI analysis.</div>
            )}
          </div>
        )}

        {/* TARGETING TAB */}
        {currentTab === 'Targeting' && (
          <div className="animate-in fade-in duration-500">
            {rawSegmentData.length > 0 ? (
              <AudienceSelector
                rawData={rawSegmentData}
                isConfirming={isLoading}
                onAudienceConfirmed={async (filtered) => {
                  if (filtered.length === 0) {
                    alert('No customers match your current filters. Please adjust and try again.');
                    return;
                  }

                  setIsLoading(true);
                  // Dynamically segment the filtered customers
                  try {
                    const customerIds = filtered.map(c => c.customer_id);
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 60000);

                    const response = await fetch('http://localhost:8000/api/segment-customers-dynamic', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ customer_ids: customerIds }),
                      signal: controller.signal,
                    });

                    clearTimeout(timeoutId);
                    const result = await response.json();

                    if (!response.ok || result.status !== 'success') {
                      throw new Error(result?.detail || result?.message || 'Failed to segment customers');
                    }

                    setSegmentData(Array.isArray(result.data) ? result.data : []);
                    setSummary(result.summary ?? null);
                    setSelectedSegment('All');
                    setCurrentTab('AI Insights');
                  } catch (error) {
                    console.error('Failed to segment customers:', error);
                    if (error instanceof Error && error.name === 'AbortError') {
                      alert('Segmentation timed out after 60 seconds. Please try a smaller audience or retry.');
                    } else {
                      alert(error instanceof Error ? error.message : 'Failed to segment customers');
                    }
                  } finally {
                    setIsLoading(false);
                  }
                }}
              />
            ) : (
              <div className="p-20 text-center text-gray-400 italic bg-white rounded-3xl border border-dashed">
                {isLoading ? 'Loading customers...' : 'Click "Create Campaign" to start'}
              </div>
            )}
          </div>
        )}

        {/* CAMPAIGNS TAB */}
        {currentTab === 'Campaigns' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <CampaignArchitect
              tenantName={companyName || 'Your Enterprise'}
              segmentData={segmentData}
              onCampaignsRefreshed={setCampaigns}
            />
          </div>
        )}

        {/* ROI TAB */}
        {currentTab === 'ROI' && (
          <div className="animate-in fade-in duration-500">
            {selectedCampaign ? (
              <CampaignROI campaign={selectedCampaign} />
            ) : campaigns.length > 0 ? (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-gray-800">Campaign Performance</h2>
                <div className="grid grid-cols-1 gap-6">
                  {campaigns.map((campaign) => (
                    <div key={campaign.campaign_id} className="bg-white rounded-2xl shadow-sm border p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-800">{campaign.campaign_name}</h3>
                          <p className="text-sm text-gray-500">
                            <Calendar size={14} className="inline mr-1" />
                            {new Date(campaign.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedCampaign(campaign)}
                          className="text-sm text-purple-600 hover:text-purple-800 font-semibold"
                        >
                          View Details →
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <MetricCard label="Sent" value={campaign.total_recipients || 0} />
                        <MetricCard label="Opened" value={campaign.total_opens || 0} percent={campaign.open_rate} />
                        <MetricCard label="Clicked" value={campaign.total_clicks || 0} percent={campaign.click_rate} />
                        <MetricCard label="Replies" value={campaign.total_replies || 0} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-20 text-center text-gray-400 italic bg-white rounded-3xl border border-dashed">
                No campaigns to show ROI for yet
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">Loading dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

// Helper Components
function CampaignCard({ campaign, onRunAgain, onViewROI, onDelete }: any) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">{campaign.campaign_name}</h3>
          <p className="text-xs text-gray-500">
            <Calendar size={12} className="inline mr-1" />
            {new Date(campaign.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
            campaign.status === 'active' ? 'bg-blue-100 text-blue-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {campaign.status}
          </span>
          <button
            onClick={onDelete}
            className="text-gray-500 hover:text-red-600 transition-colors"
            title="Delete campaign"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
     
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Recipients</p>
          <p className="text-xl font-bold text-gray-800">{campaign.total_recipients || 0}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Open Rate</p>
          <p className="text-xl font-bold text-green-600">{campaign.open_rate || 0}%</p>
        </div>
      </div>
     
      <div className="flex gap-2">
        <button
          onClick={onRunAgain}
          className="flex-1 bg-purple-100 text-purple-700 font-semibold py-2 px-4 rounded-lg hover:bg-purple-200 transition-all text-sm"
        >
          Run Again
        </button>
        <button
          onClick={onViewROI}
          className="flex-1 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-all text-sm"
        >
          View ROI
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value, percent }: any) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      {percent !== undefined && (
        <p className="text-xs text-green-600 mt-1">{percent}%</p>
      )}
    </div>
  );
}

function CampaignROI({ campaign }: any) {
  const [roiData, setRoiData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchROI() {
      try {
        const response = await fetch(`http://localhost:8000/api/campaigns/${campaign.campaign_id}/roi`);
        const result = await response.json();
        if (result.status === 'success') {
          setRoiData(result);
        }
      } catch (error) {
        console.error('Failed to fetch ROI:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchROI();
  }, [campaign.campaign_id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center p-20">
        <Loader2 className="animate-spin text-purple-600" size={48} />
      </div>
    );
  }

  if (!roiData || !roiData.roi) {
    return <div className="p-10 text-center text-gray-400">No ROI data available</div>;
  }

  const { roi, engagement } = roiData;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{campaign.campaign_name}</h2>
          <p className="text-gray-500 mt-1">Campaign Performance Analysis</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Budget</p>
          <p className="text-2xl font-bold text-gray-800">₹{roi.budget?.toLocaleString() || 'N/A'}</p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Total Sent" value={roi.total_sent || 0} />
        <MetricCard label="Total Opens" value={roi.total_opens || 0} percent={roi.open_rate} />
        <MetricCard label="Total Clicks" value={roi.total_clicks || 0} percent={roi.click_through_rate} />
        <MetricCard label="Replies" value={roi.total_replies || 0} percent={roi.reply_rate} />
      </div>

      {/* Engagement Details Table */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h3 className="font-bold text-gray-700">Customer Engagement Details</h3>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-400 sticky top-0">
              <tr>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Segment</th>
                <th className="px-6 py-4">Opens</th>
                <th className="px-6 py-4">Clicks</th>
                <th className="px-6 py-4">Replies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {engagement.map((eng: any) => (
                <tr key={eng.engagement_id} className="hover:bg-indigo-50/30 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{eng.customer_name}</p>
                      <p className="text-xs text-gray-500">{eng.customer_email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                      {eng.segment_tag || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">{eng.no_of_opens}</td>
                  <td className="px-6 py-4 text-center">{eng.no_of_clicks}</td>
                  <td className="px-6 py-4 text-center">{eng.replies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: any, label: string, active?: boolean }) {
    return (
      <div className={`flex items-center gap-4 p-3.5 rounded-xl transition-all ${
        active ? 'bg-white text-[#4B0082] shadow-lg scale-105' : 'text-indigo-200 hover:bg-white/10'
      }`}>
        {icon} <span className="font-bold text-sm">{label}</span>
      </div>
    );
  }
 
  function StatCard({ title, value }: { title: string, value: string }) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-black text-[#4B0082]">{value}</p>
      </div>
    );
  }