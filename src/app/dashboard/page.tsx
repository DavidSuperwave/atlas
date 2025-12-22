'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

// Interface for scrape status with time estimates
interface ScrapeStatusInfo {
  queuePosition?: number;
  timeEstimateFormatted?: string;
  message?: string;
}

// Tag color palette for visual distinction - muted modern palette
const TAG_COLORS = [
  'bg-zinc-100 text-zinc-700 border-zinc-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  'bg-lime-100 text-lime-700 border-lime-200',
];

function getTagColor(tag: string): string {
  // Generate consistent color based on tag string
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function DashboardPage() {
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Selection state for bulk operations
  const [selectedScrapeIds, setSelectedScrapeIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Active scrape status tracking (for time estimates)
  const [activeScrapeStatuses, setActiveScrapeStatuses] = useState<Record<string, ScrapeStatusInfo>>({});
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user) {
      fetchScrapes();
    } else if (!authLoading) {
      setFetchingData(false);
    }
  }, [user, authLoading]);

  // Get active (running/queued) scrapes
  const activeScrapes = useMemo(() => {
    return scrapes.filter(s => s.status === 'running' || s.status === 'queued');
  }, [scrapes]);

  // Fetch status for active scrapes
  const fetchActiveScrapeStatuses = useCallback(async () => {
    if (activeScrapes.length === 0) return;
    
    const statuses: Record<string, ScrapeStatusInfo> = {};
    await Promise.all(
      activeScrapes.map(async (scrape) => {
        try {
          const response = await apiFetch(`/api/scrape/${scrape.id}/status`);
          if (response.ok) {
            const data = await response.json();
            statuses[scrape.id] = {
              queuePosition: data.queuePosition,
              timeEstimateFormatted: data.timeEstimateFormatted,
              message: data.message
            };
            
            // If status changed to completed, refresh scrapes
            if (data.status === 'completed' && scrape.status !== 'completed') {
              fetchScrapes();
            }
          }
        } catch (error) {
          console.error(`Error fetching status for scrape ${scrape.id}:`, error);
        }
      })
    );
    setActiveScrapeStatuses(statuses);
  }, [activeScrapes]);

  // Poll for active scrape statuses
  useEffect(() => {
    if (activeScrapes.length > 0) {
      fetchActiveScrapeStatuses();
      statusPollingRef.current = setInterval(fetchActiveScrapeStatuses, 3000);
    } else {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
        statusPollingRef.current = null;
      }
    }
    return () => {
      if (statusPollingRef.current) {
        clearInterval(statusPollingRef.current);
      }
    };
  }, [activeScrapes.length, fetchActiveScrapeStatuses]);

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

  // Pagination calculations
  const totalPages = Math.ceil(filteredScrapes.length / ITEMS_PER_PAGE);
  const paginatedScrapes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredScrapes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredScrapes, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTags, filterStatus]);

  // Clear selection when page changes or filters change
  useEffect(() => {
    setSelectedScrapeIds(new Set());
  }, [currentPage, searchQuery, filterTags, filterStatus]);

  async function fetchScrapes() {
    setFetchingData(true);
    const supabase = getSupabaseClient();
    
    const { data } = await supabase
      .from('scrapes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) {
      // Get processing leads count for each scrape
      const scrapesWithEnrichingCount = await Promise.all(
        data.map(async (scrape) => {
          const { count } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('scrape_id', scrape.id)
            .eq('verification_status', 'processing');
          return { ...scrape, enriching_count: count || 0 };
        })
      );
      setScrapes(scrapesWithEnrichingCount);
    }
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

  // Selection functions
  function toggleSelectScrape(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const newSelected = new Set(selectedScrapeIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedScrapeIds(newSelected);
  }

  function toggleSelectAll() {
    if (selectedScrapeIds.size === paginatedScrapes.length) {
      setSelectedScrapeIds(new Set());
    } else {
      setSelectedScrapeIds(new Set(paginatedScrapes.map(s => s.id)));
    }
  }

  async function handleBulkDelete(keepLeads: boolean = false) {
    if (selectedScrapeIds.size === 0) return;
    
    setIsDeleting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedScrapeIds) {
      try {
        const res = await apiFetch(`/api/scrapes/${id}/delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepLeads }),
        });
        if (res.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setSelectedScrapeIds(new Set());
    
    if (successCount > 0) {
      fetchScrapes();
    }
    
    if (errorCount > 0) {
      alert(`Deleted ${successCount} campaigns. ${errorCount} failed.`);
    }
  }

  if (authLoading || fetchingData) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-zinc-200 border-t-zinc-800"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-zinc-900 tracking-tight">
            Scrapes
          </h1>
          {user && (
            <span className="text-sm text-zinc-500">
              Welcome, {user.email ? user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1) : 'User'}
            </span>
          )}
        </div>

        {/* Start New Scrape Form */}
        <div className="bg-white p-6 rounded-xl border border-zinc-200 mb-10">
          <h2 className="text-lg font-semibold mb-5 text-zinc-900">Start New Scrape</h2>
          
          {/* Campaign Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-600 mb-1.5">Campaign Name</label>
            <input
              type="text"
              placeholder="e.g., Tech Startup CEOs Q1 2024"
              className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-sm placeholder-zinc-400 transition-all"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-600 mb-1.5">Tags</label>
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
                    className="w-32 bg-white border border-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-sm placeholder-zinc-400 transition-all"
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
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button
                    onClick={() => {
                      setShowTagInput(false);
                      setTagInput('');
                    }}
                    type="button"
                    className="p-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  type="button"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                  Add tag
                </button>
              )}
            </div>
            {allTags.length > 0 && !showTagInput && (
              <div className="mt-2">
                <span className="text-xs text-zinc-500">Quick add: </span>
                {allTags.filter(tag => !selectedTags.includes(tag)).slice(0, 5).map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTags([...selectedTags, tag])}
                    className="text-xs text-zinc-600 hover:text-zinc-900 hover:underline mr-2"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* URL and Pages */}
          <div className="flex gap-4 flex-col md:flex-row">
            <div className="flex-1 flex gap-3">
              <input
                type="text"
                placeholder="Paste Apollo Search URL here (e.g., https://app.apollo.io/#/people?...)"
                className="flex-1 bg-white border border-zinc-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-sm placeholder-zinc-400 transition-all"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <div className="relative w-32">
                <select
                  value={pages}
                  onChange={(e) => setPages(parseInt(e.target.value))}
                  className="w-full appearance-none bg-white border border-zinc-200 rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-sm text-zinc-700 cursor-pointer transition-all"
                >
                  {[1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50].map(num => (
                    <option key={num} value={num}>{num} {num === 1 ? 'page' : 'pages'}</option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
            <button
              onClick={handleScrape}
              disabled={loading}
              className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          <p className="text-zinc-500 text-sm mt-4 flex items-center gap-2">
            <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded text-xs font-medium">INFO</span>
            Do not login to Apollo account when scraping.
          </p>
        </div>

        {/* Header with View All Leads */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-zinc-900">Your Campaigns</h2>
            {selectedScrapeIds.size > 0 && (
              <span className="text-sm text-zinc-500">
                {selectedScrapeIds.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {selectedScrapeIds.size > 0 && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="flex items-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2 rounded-lg font-medium transition-colors border border-red-200 text-sm disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
                Delete ({selectedScrapeIds.size})
              </button>
            )}
            <Link href="/leads" className="bg-white hover:bg-zinc-50 text-zinc-700 px-4 py-2 rounded-lg font-medium transition-colors border border-zinc-200 text-sm">
              View All Leads →
            </Link>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Select All Checkbox */}
            {paginatedScrapes.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                  selectedScrapeIds.size === paginatedScrapes.length && paginatedScrapes.length > 0
                    ? 'bg-zinc-900 border-zinc-900' 
                    : selectedScrapeIds.size > 0 
                      ? 'bg-zinc-100 border-zinc-400'
                      : 'bg-zinc-50 border-zinc-200 hover:border-zinc-400'
                }`}
                title={selectedScrapeIds.size === paginatedScrapes.length ? 'Deselect all' : 'Select all on page'}
              >
                {selectedScrapeIds.size === paginatedScrapes.length && paginatedScrapes.length > 0 ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : selectedScrapeIds.size > 0 ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                ) : null}
              </button>
            )}
            
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search by name or URL..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-400 text-sm placeholder-zinc-400 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Tag Filter */}
            <div className="relative">
              <button
                onClick={() => setShowTagDropdown(!showTagDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/>
                </svg>
                Tags
                {filterTags.length > 0 && (
                  <span className="bg-zinc-900 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {filterTags.length}
                  </span>
                )}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              
              {showTagDropdown && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-lg border border-zinc-200 shadow-lg z-20">
                  <div className="p-2 max-h-64 overflow-y-auto">
                    {allTags.length === 0 ? (
                      <p className="text-sm text-zinc-500 p-2">No tags yet</p>
                    ) : (
                      allTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => toggleFilterTag(tag)}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left hover:bg-zinc-50 transition-colors ${filterTags.includes(tag) ? 'bg-zinc-100' : ''}`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${filterTags.includes(tag) ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-300'}`}>
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
              className="px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400 cursor-pointer"
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
                className="flex items-center gap-1 px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                Clear
              </button>
            )}
          </div>

          {/* Active filter tags display */}
          {filterTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-100">
              <span className="text-xs text-zinc-500">Filtering by:</span>
              {filterTags.map(tag => (
                <span
                  key={tag}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                >
                  {tag}
                  <button onClick={() => toggleFilterTag(tag)} className="hover:opacity-70">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results count */}
        {hasActiveFilters && (
          <p className="text-sm text-zinc-500 mb-4">
            Showing {filteredScrapes.length} of {scrapes.length} campaigns
          </p>
        )}

        {/* Scrape List */}
        <div className="grid gap-3">
          {paginatedScrapes.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 bg-white rounded-xl border border-zinc-200">
              {hasActiveFilters ? 'No campaigns match your filters.' : 'No scrapes yet. Start one above!'}
            </div>
          ) : (
            paginatedScrapes.map((scrape) => (
              <div
                key={scrape.id}
                className={`bg-white p-4 rounded-xl border transition-all min-w-0 group flex items-center gap-4 ${
                  selectedScrapeIds.has(scrape.id) 
                    ? 'border-zinc-400 bg-zinc-50' 
                    : 'border-zinc-200 hover:border-zinc-400'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => toggleSelectScrape(scrape.id, e)}
                  className={`flex-shrink-0 flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                    selectedScrapeIds.has(scrape.id)
                      ? 'bg-zinc-900 border-zinc-900'
                      : 'border-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {selectedScrapeIds.has(scrape.id) && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
                
                {/* Main content - clickable link */}
                <Link
                  href={`/scrapes/${scrape.id}`}
                  className="flex-1 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 min-w-0"
                >
                  {/* Name, Tags, URL */}
                  <div className="flex-1 min-w-0 w-full">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-medium text-zinc-900" title={scrape.name || scrape.url}>
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
                    <p className="text-sm text-zinc-500 truncate" title={scrape.url}>
                      {scrape.url}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1" suppressHydrationWarning>
                      {new Date(scrape.created_at).toLocaleString()}
                    </p>
                  </div>

                  {/* Status & Meta Row */}
                  <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto min-w-0">
                    {/* Status Badge with Time Estimate */}
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 ${
                        scrape.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        scrape.status === 'failed' ? 'bg-red-100 text-red-700 border border-red-200' :
                        scrape.status === 'running' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-amber-100 text-amber-700 border border-amber-200'
                      }`}>
                        {(scrape.status === 'running' || scrape.status === 'queued') && (
                          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        )}
                        {scrape.status.toUpperCase()}
                      </span>
                      {/* Enriching Badge - shows when leads are being processed */}
                      {scrape.enriching_count > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 bg-violet-100 text-violet-700 border border-violet-200">
                          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          ENRICHING
                        </span>
                      )}
                      {/* Time estimate for active scrapes */}
                      {activeScrapeStatuses[scrape.id]?.timeEstimateFormatted && (
                        <span className="text-xs text-zinc-500 whitespace-nowrap">
                          {activeScrapeStatuses[scrape.id].timeEstimateFormatted}
                        </span>
                      )}
                    </div>

                    {/* Leads Count */}
                    <div className="text-center min-w-[60px]">
                      <span className="block text-lg font-semibold text-zinc-900">{scrape.total_leads || 0}</span>
                      <span className="text-xs text-zinc-500">Leads</span>
                    </div>

                    {/* Arrow Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 group-hover:text-zinc-600 transition-colors">
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                  </div>
                </Link>
              </div>
            ))
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 bg-white p-4 rounded-xl border border-zinc-200">
            <p className="text-sm text-zinc-500">
              Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredScrapes.length)} of {filteredScrapes.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                First
              </button>
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              
              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                        currentPage === pageNum
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'text-zinc-700 bg-zinc-50 hover:bg-zinc-100 border-zinc-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 text-sm font-medium text-zinc-700 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Click outside handler for tag dropdown */}
      {showTagDropdown && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowTagDropdown(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                  <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900">Delete {selectedScrapeIds.size} Campaign{selectedScrapeIds.size > 1 ? 's' : ''}?</h3>
            </div>
            
            <p className="text-zinc-600 mb-6">
              This action cannot be undone. Choose what to do with the associated leads:
            </p>
            
            <div className="flex flex-col gap-3 mb-6">
              <button
                onClick={() => handleBulkDelete(false)}
                disabled={isDeleting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Deleting...
                  </>
                ) : (
                  <>Delete campaigns and leads</>
                )}
              </button>
              <button
                onClick={() => handleBulkDelete(true)}
                disabled={isDeleting}
                className="w-full px-4 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Delete campaigns, keep leads
              </button>
            </div>
            
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="w-full px-4 py-2 text-zinc-600 hover:text-zinc-900 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

