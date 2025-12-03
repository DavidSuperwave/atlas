'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

// Tag color palette for visual distinction
const TAG_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
  'bg-rose-100 text-rose-700 border-rose-200',
];

function getTagColor(tag: string): string {
  // Generate consistent color based on tag string
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [url, setUrl] = useState('');
  const [pages, setPages] = useState(1);
  const [campaignName, setCampaignName] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scrapes, setScrapes] = useState<any[]>([]);
  const [fetchingData, setFetchingData] = useState(true);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);

  useEffect(() => {
    if (user) {
      fetchScrapes();
    } else if (!authLoading) {
      setFetchingData(false);
    }
  }, [user, authLoading]);

  // Get all unique tags from scrapes for filter dropdown
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    scrapes.forEach(scrape => {
      (scrape.tags || []).forEach((tag: string) => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [scrapes]);

  // Filter scrapes based on search, tags, and status
  const filteredScrapes = useMemo(() => {
    return scrapes.filter(scrape => {
      // Search filter (name or URL)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = scrape.name?.toLowerCase().includes(query);
        const matchesUrl = scrape.url?.toLowerCase().includes(query);
        if (!matchesName && !matchesUrl) return false;
      }
      
      // Tag filter
      if (filterTags.length > 0) {
        const scrapeTags = scrape.tags || [];
        const hasAllTags = filterTags.every(tag => scrapeTags.includes(tag));
        if (!hasAllTags) return false;
      }
      
      // Status filter
      if (filterStatus !== 'all' && scrape.status !== filterStatus) {
        return false;
      }
      
      return true;
    });
  }, [scrapes, searchQuery, filterTags, filterStatus]);

  async function fetchScrapes() {
    setFetchingData(true);
    const supabase = getSupabaseClient();
    
    const { data } = await supabase
      .from('scrapes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setScrapes(data);
    setFetchingData(false);
  }

  async function handleScrape() {
    if (!url) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          pages,
          name: campaignName.trim() || null,
          tags: selectedTags
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Scrape completed!');
        fetchScrapes();
        setUrl('');
        setCampaignName('');
        setSelectedTags([]);
      } else {
        alert('Scrape failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error starting scrape');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !selectedTags.includes(tag)) {
      setSelectedTags([...selectedTags, tag]);
    }
    setTagInput('');
  }

  function removeTag(tagToRemove: string) {
    setSelectedTags(selectedTags.filter(t => t !== tagToRemove));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  }

  function toggleFilterTag(tag: string) {
    if (filterTags.includes(tag)) {
      setFilterTags(filterTags.filter(t => t !== tag));
    } else {
      setFilterTags([...filterTags, tag]);
    }
  }

  function clearFilters() {
    setSearchQuery('');
    setFilterTags([]);
    setFilterStatus('all');
  }

  const hasActiveFilters = searchQuery || filterTags.length > 0 || filterStatus !== 'all';

  if (authLoading || fetchingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
            Atlas
          </h1>
          {user && (
            <span className="text-sm text-gray-500">
              Welcome, {user.email ? user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1) : 'User'}
            </span>
          )}
        </div>

        {/* Start New Scrape Form */}
        <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 mb-10">
          <h2 className="text-xl font-bold mb-6 text-gray-900">Start New Scrape</h2>
          
          {/* Campaign Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input
              type="text"
              placeholder="e.g., Tech Startup CEOs Q1 2024"
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base placeholder-gray-400 transition-all"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex flex-wrap items-center gap-2">
              {selectedTags.map(tag => (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="hover:opacity-70 ml-0.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </span>
              ))}
              {showTagInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    placeholder="Tag name"
                    className="w-32 bg-white border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-400 transition-all"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag();
                      } else if (e.key === 'Escape') {
                        setShowTagInput(false);
                        setTagInput('');
                      }
                    }}
                    onBlur={() => {
                      if (!tagInput.trim()) {
                        setShowTagInput(false);
                      }
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      addTag();
                      setShowTagInput(false);
                    }}
                    type="button"
                    className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button
                    onClick={() => {
                      setShowTagInput(false);
                      setTagInput('');
                    }}
                    type="button"
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  type="button"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                  Add tag
                </button>
              )}
            </div>
            {allTags.length > 0 && !showTagInput && (
              <div className="mt-2">
                <span className="text-xs text-gray-500">Quick add: </span>
                {allTags.filter(tag => !selectedTags.includes(tag)).slice(0, 5).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTags([...selectedTags, tag])}
                    className="text-xs text-blue-600 hover:underline mr-2"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* URL and Pages */}
          <div className="flex gap-4 flex-col md:flex-row">
            <div className="flex-1 flex gap-4">
              <input
                type="text"
                placeholder="Paste Apollo Search URL here (e.g., https://app.apollo.io/#/people?...)"
                className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base placeholder-gray-400 transition-all"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <div className="w-24">
                <input
                  type="number"
                  min="1"
                  max="10"
                  placeholder="Pages"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base placeholder-gray-400 transition-all text-center"
                  value={pages}
                  onChange={(e) => setPages(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>
            </div>
            <button
              onClick={handleScrape}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Scraping...
                </span>
              ) : 'Start Scrape'}
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-4 flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">INFO</span>
            A browser window will open locally. Please log in to Apollo manually if prompted.
          </p>
        </div>

        {/* Header with View All Leads */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Your Campaigns</h2>
          <Link href="/leads" className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors border border-gray-300 shadow-sm text-sm">
            View All Leads →
          </Link>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or URL..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-400 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Tag Filter */}
            <div className="relative">
              <button
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>
                </svg>
                Tags
                {filterTags.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {filterTags.length}
                  </span>
                )}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              
              {showTagDropdown && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg border border-gray-200 shadow-lg z-20">
                  <div className="p-2 max-h-64 overflow-y-auto">
                    {allTags.length === 0 ? (
                      <p className="text-sm text-gray-500 p-2">No tags yet</p>
                    ) : (
                      allTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleFilterTag(tag)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-gray-50 transition-colors ${filterTags.includes(tag) ? 'bg-blue-50' : ''}`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${filterTags.includes(tag) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                            {filterTags.includes(tag) && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                          </div>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}>
                            {tag}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="running">Running</option>
              <option value="failed">Failed</option>
            </select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                Clear
              </button>
            )}
          </div>

          {/* Active filter tags display */}
          {filterTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">Filtering by:</span>
              {filterTags.map(tag => (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                >
                  {tag}
                  <button onClick={() => toggleFilterTag(tag)} className="hover:opacity-70">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results count */}
        {hasActiveFilters && (
          <p className="text-sm text-gray-500 mb-4">
            Showing {filteredScrapes.length} of {scrapes.length} campaigns
          </p>
        )}

        {/* Scrape List */}
        <div className="grid gap-4">
          {filteredScrapes.length === 0 ? (
            <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
              {hasActiveFilters ? 'No campaigns match your filters.' : 'No scrapes yet. Start one above!'}
            </div>
          ) : (
            filteredScrapes.map((scrape) => (
              <Link
                key={scrape.id}
                href={`/scrapes/${scrape.id}`}
                className="bg-white p-5 rounded-xl border border-gray-200 hover:border-blue-300 transition-all shadow-sm block min-w-0"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                  {/* Name, Tags, URL */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-semibold text-gray-900 text-lg" title={scrape.name || scrape.url}>
                        {scrape.name || 'Untitled Campaign'}
                      </p>
                      {/* Tags inline with name */}
                      {scrape.tags && scrape.tags.length > 0 && (
                        <>
                          {scrape.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate" title={scrape.url}>
                      {scrape.url}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(scrape.created_at).toLocaleString()}
                    </p>
                  </div>

                  {/* Status & Meta Row */}
                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto min-w-0">
                    {/* Status Badge */}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${scrape.status === 'completed' ? 'bg-green-100 text-green-700 border border-green-200' :
                      scrape.status === 'failed' ? 'bg-red-100 text-red-700 border border-red-200' :
                        'bg-yellow-100 text-yellow-700 border border-yellow-200'
                      }`}>
                      {scrape.status.toUpperCase()}
                    </span>

                    {/* Leads Count */}
                    <div className="text-center min-w-[60px]">
                      <span className="block text-lg font-bold text-gray-900">{scrape.total_leads || 0}</span>
                      <span className="text-xs text-gray-500 font-medium">Leads</span>
                    </div>

                    {/* Arrow Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Click outside handler for tag dropdown */}
      {showTagDropdown && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowTagDropdown(false)}
        />
      )}
    </div>
  );
}
