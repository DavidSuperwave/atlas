'use client';

import { useState, useEffect, useMemo } from 'react';
import LeadsFilterSidebar from '@/components/LeadsFilterSidebar';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';

// Sort icon component
function SortIcon({ field, currentField, direction }: { field: string; currentField: string; direction: 'asc' | 'desc' }) {
    if (field !== currentField) {
        return (
            <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
        );
    }
    return direction === 'asc' ? (
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
    ) : (
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
    );
}

export default function LeadsPage() {
    const { user, loading: authLoading } = useAuth();
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    // Selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Filters
    const [filters, setFilters] = useState({
        status: 'all',
        validity: 'all',
        domain: 'all',
        linkedin: 'all',
        search: '',
        validOnly: false,
        industry: 'all',
        industrySearch: '',
        keywords: [] as string[],
        jobTitleCategories: [] as string[],
        jobTitleKeywords: [] as string[]
    });

    // Sorting state
    const [sortField, setSortField] = useState<string>('created_at');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        if (user) {
            checkAdminAndFetchLeads();
        } else if (!authLoading) {
            setLoading(false);
        }
    }, [user, authLoading]);

    async function checkAdminAndFetchLeads() {
        setLoading(true);
        const supabase = getSupabaseClient();
        
        // Check if user is admin
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('is_admin')
            .eq('id', user?.id)
            .single();
        
        const userIsAdmin = profile?.is_admin ?? false;
        setIsAdmin(userIsAdmin);
        
        // Fetch leads - admin sees all, regular user sees only their own
        let query = supabase
            .from('leads')
            .select('*, scrapes(url)')
            .order('created_at', { ascending: false });
        
        // If not admin, filter to only user's leads
        if (!userIsAdmin && user?.id) {
            query = query.eq('user_id', user.id);
        }
        
        const { data } = await query;
        if (data) setLeads(data);
        setLoading(false);
    }

    async function fetchLeads() {
        setLoading(true);
        const supabase = getSupabaseClient();
        
        // Fetch leads - admin sees all, regular user sees only their own
        let query = supabase
            .from('leads')
            .select('*, scrapes(url)')
            .order('created_at', { ascending: false });
        
        // If not admin, filter to only user's leads
        if (!isAdmin && user?.id) {
            query = query.eq('user_id', user.id);
        }
        
        const { data } = await query;
        if (data) setLeads(data);
        setLoading(false);
    }

    // Extract unique industries from leads with counts (normalized)
    const industriesWithCounts = useMemo(() => {
        const industryCounts: Record<string, number> = {};
        
        leads.forEach(lead => {
            if (lead.industry && lead.industry.trim()) {
                // Normalize industry name:
                // 1. Trim whitespace
                // 2. Remove trailing "+N" patterns (e.g., "+1", "+2", etc.)
                // 3. Convert to title case for consistency
                let normalizedIndustry = lead.industry.trim()
                    .replace(/\s*\+\d+\s*$/g, '') // Remove "+1", "+2", etc. at the end
                    .replace(/\s+/g, ' '); // Normalize multiple spaces
                
                // Title case the industry
                normalizedIndustry = normalizedIndustry
                    .toLowerCase()
                    .split(' ')
                    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                
                if (normalizedIndustry) {
                    industryCounts[normalizedIndustry] = (industryCounts[normalizedIndustry] || 0) + 1;
                }
            }
        });
        
        // Convert to array and sort by count (descending), then alphabetically
        return Object.entries(industryCounts)
            .map(([industry, count]) => ({ industry, count }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.industry.localeCompare(b.industry);
            });
    }, [leads]);

    // For backward compatibility, also create a simple list of unique industries
    const uniqueIndustries = useMemo(() => {
        return industriesWithCounts.map(item => item.industry);
    }, [industriesWithCounts]);

    // Extract unique keywords from leads (from keywords array field)
    const uniqueKeywords = useMemo(() => {
        const allKeywords: string[] = [];
        leads.forEach(lead => {
            if (lead.keywords && Array.isArray(lead.keywords)) {
                lead.keywords.forEach((kw: string) => {
                    if (kw && kw.trim()) {
                        allKeywords.push(kw.trim());
                    }
                });
            }
        });
        return [...new Set(allKeywords)].sort();
    }, [leads]);

    // Predefined job title categories
    const jobTitleCategories = [
        { id: 'owner', label: 'Owner', keywords: ['owner'] },
        { id: 'founder', label: 'Founder', keywords: ['founder', 'co-founder', 'cofounder'] },
        { id: 'csuite', label: 'C-Suite', keywords: ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'chief'] }
    ];

    // Extract common keywords from job titles with counts
    const jobTitleKeywordsWithCounts = useMemo(() => {
        const keywordCounts: Record<string, number> = {};
        const commonKeywords = [
            'director', 'manager', 'vp', 'vice president', 'head', 'lead', 'senior', 
            'president', 'partner', 'principal', 'executive', 'coordinator', 'specialist',
            'analyst', 'consultant', 'engineer', 'developer', 'sales', 'marketing',
            'operations', 'hr', 'human resources', 'finance', 'accounting', 'legal',
            'product', 'project', 'program', 'business', 'strategy', 'growth'
        ];
        
        leads.forEach(lead => {
            if (lead.title) {
                const titleLower = lead.title.toLowerCase();
                commonKeywords.forEach(keyword => {
                    if (titleLower.includes(keyword)) {
                        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
                    }
                });
            }
        });
        
        return Object.entries(keywordCounts)
            .map(([keyword, count]) => ({ keyword, count }))
            .sort((a, b) => b.count - a.count);
    }, [leads]);

    // Apply filters client-side for instant feedback
    const filteredLeads = useMemo(() => {
        let result = leads.filter(lead => {
            // Valid only quick filter
            if (filters.validOnly && lead.verification_status !== 'valid') {
                return false;
            }

            // Status filter
            if (filters.status !== 'all' && lead.verification_status !== filters.status) {
                return false;
            }

            // Validity filter
            if (filters.validity !== 'all' && lead.email_validity !== filters.validity) {
                return false;
            }

            // Domain filter
            if (filters.domain === 'yes' && (!lead.website || lead.website === '')) {
                return false;
            }
            if (filters.domain === 'no' && lead.website && lead.website !== '') {
                return false;
            }

            // LinkedIn filter
            if (filters.linkedin === 'yes' && (!lead.company_linkedin || lead.company_linkedin === '')) {
                return false;
            }
            if (filters.linkedin === 'no' && lead.company_linkedin && lead.company_linkedin !== '') {
                return false;
            }

            // Search filter
            if (filters.search) {
                const searchLower = filters.search.toLowerCase();
                const searchFields = [
                    lead.first_name,
                    lead.last_name,
                    lead.email,
                    lead.company_name,
                    lead.title,
                    lead.location
                ].filter(Boolean).join(' ').toLowerCase();
                if (!searchFields.includes(searchLower)) {
                    return false;
                }
            }

            // Industry filter (with normalization)
            if (filters.industry !== 'all') {
                // Normalize the lead's industry the same way we did for the filter options
                let leadIndustry = (lead.industry || '').trim()
                    .replace(/\s*\+\d+\s*$/g, '')
                    .replace(/\s+/g, ' ')
                    .toLowerCase()
                    .split(' ')
                    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                
                if (leadIndustry !== filters.industry) {
                    return false;
                }
            }
            
            // Industry search filter
            if (filters.industrySearch) {
                const searchLower = filters.industrySearch.toLowerCase();
                // Normalize the lead's industry before searching
                let leadIndustry = (lead.industry || '').trim()
                    .replace(/\s*\+\d+\s*$/g, '')
                    .replace(/\s+/g, ' ')
                    .toLowerCase();
                
                if (!leadIndustry.includes(searchLower)) {
                    return false;
                }
            }

            // Keywords filter (from keywords array field) - OR logic
            if (filters.keywords.length > 0) {
                const leadKeywords = lead.keywords || [];
                const hasMatchingKeyword = filters.keywords.some(kw => 
                    leadKeywords.some((lkw: string) => lkw.toLowerCase() === kw.toLowerCase())
                );
                if (!hasMatchingKeyword) {
                    return false;
                }
            }

            // Job Title Categories filter (Owner, Founder, C-Suite) - OR logic
            if (filters.jobTitleCategories.length > 0) {
                const titleLower = (lead.title || '').toLowerCase();
                const matchesCategory = filters.jobTitleCategories.some(catId => {
                    const category = jobTitleCategories.find(c => c.id === catId);
                    if (!category) return false;
                    return category.keywords.some(kw => titleLower.includes(kw));
                });
                if (!matchesCategory && filters.jobTitleKeywords.length === 0) {
                    return false;
                }
            }

            // Job Title Keywords filter - OR logic (combined with categories)
            if (filters.jobTitleKeywords.length > 0) {
                const titleLower = (lead.title || '').toLowerCase();
                const matchesKeyword = filters.jobTitleKeywords.some(kw => 
                    titleLower.includes(kw.toLowerCase())
                );
                // If categories are also selected, either can match
                if (filters.jobTitleCategories.length > 0) {
                    const matchesCategory = filters.jobTitleCategories.some(catId => {
                        const category = jobTitleCategories.find(c => c.id === catId);
                        if (!category) return false;
                        return category.keywords.some(kw => titleLower.includes(kw));
                    });
                    if (!matchesKeyword && !matchesCategory) {
                        return false;
                    }
                } else if (!matchesKeyword) {
                    return false;
                }
            }

            return true;
        });

        // Apply sorting
        result.sort((a, b) => {
            let aVal: any;
            let bVal: any;

            switch (sortField) {
                case 'name':
                    aVal = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
                    bVal = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
                    break;
                case 'email':
                    aVal = (a.email || '').toLowerCase();
                    bVal = (b.email || '').toLowerCase();
                    break;
                case 'status':
                    aVal = a.verification_status || '';
                    bVal = b.verification_status || '';
                    break;
                case 'title':
                    aVal = (a.title || '').toLowerCase();
                    bVal = (b.title || '').toLowerCase();
                    break;
                case 'company':
                    aVal = (a.company_name || '').toLowerCase();
                    bVal = (b.company_name || '').toLowerCase();
                    break;
                case 'industry':
                    aVal = (a.industry || '').toLowerCase();
                    bVal = (b.industry || '').toLowerCase();
                    break;
                case 'location':
                    aVal = (a.location || '').toLowerCase();
                    bVal = (b.location || '').toLowerCase();
                    break;
                case 'created_at':
                default:
                    aVal = new Date(a.created_at).getTime();
                    bVal = new Date(b.created_at).getTime();
                    break;
            }

            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [leads, filters, sortField, sortDirection, jobTitleCategories]);

    const handleFilterChange = (key: keyof typeof filters, value: string | boolean | string[]) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const clearAllFilters = () => {
        setFilters({
            status: 'all',
            validity: 'all',
            domain: 'all',
            linkedin: 'all',
            search: '',
            validOnly: false,
            industry: 'all',
            industrySearch: '',
            keywords: [],
            jobTitleCategories: [],
            jobTitleKeywords: []
        });
        setSortField('created_at');
        setSortDirection('desc');
    };

    // Sort handler
    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Selection handlers
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredLeads.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredLeads.map(l => l.id)));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Delete handlers
    const handleDeleteClick = (ids: string[]) => {
        setDeleteTarget(ids);
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        if (!deleteTarget || deleteTarget.length === 0) return;
        
        setDeleting(true);
        try {
            const res = await fetch('/api/leads/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadIds: deleteTarget })
            });

            if (res.ok) {
                setLeads(prev => prev.filter(l => !deleteTarget.includes(l.id)));
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    deleteTarget.forEach(id => next.delete(id));
                    return next;
                });
            }
        } catch (e) {
            console.error('Delete failed', e);
        }
        setDeleting(false);
        setShowDeleteConfirm(false);
        setDeleteTarget(null);
    };

    function downloadCSV() {
        const headers = ['First Name', 'Last Name', 'Company Website', 'Company Size', 'Email', 'Pattern Used'];
        const rows: string[] = [];

        filteredLeads.forEach(lead => {
            const permutations = lead.verification_data?.permutations_checked || [];

            if (permutations.length === 0) {
                rows.push([
                    lead.first_name,
                    lead.last_name,
                    lead.website || '',
                    '',
                    lead.email || '',
                    ''
                ].join(','));
            } else {
                permutations.forEach((perm: any) => {
                    rows.push([
                        lead.first_name,
                        lead.last_name,
                        lead.website || '',
                        '',
                        perm.email,
                        perm.pattern || ''
                    ].join(','));
                });
            }
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `leads-filtered-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    }

    return (
        <div className="flex h-screen bg-gray-50 text-gray-900 font-sans">
            {/* Filter Sidebar */}
            <LeadsFilterSidebar
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearAll={clearAllFilters}
                totalCount={leads.length}
                filteredCount={filteredLeads.length}
                industriesWithCounts={industriesWithCounts}
                uniqueKeywords={uniqueKeywords}
                jobTitleCategories={jobTitleCategories}
                jobTitleKeywordsWithCounts={jobTitleKeywordsWithCounts}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 sticky top-0 z-10 flex-shrink-0">
                    <div className="px-6 py-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Leads</h1>
                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                                    {filteredLeads.length}
                                </span>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={downloadCSV}
                                    className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                    Export
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bulk Action Bar */}
                {selectedIds.size > 0 && (
                    <div className="bg-blue-50 border-b border-blue-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-blue-800">
                                {selectedIds.size} lead{selectedIds.size > 1 ? 's' : ''} selected
                            </span>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-sm text-blue-600 hover:text-blue-800 underline"
                            >
                                Clear selection
                            </button>
                        </div>
                        <button
                            onClick={() => handleDeleteClick(Array.from(selectedIds))}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm transition-all shadow-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                            Delete Selected
                        </button>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                                        <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Delete Lead{deleteTarget && deleteTarget.length > 1 ? 's' : ''}</h2>
                                    <p className="text-sm text-gray-500">This action cannot be undone.</p>
                                </div>
                            </div>
                            <p className="text-gray-600 mb-6">
                                Are you sure you want to delete {deleteTarget?.length} lead{deleteTarget && deleteTarget.length > 1 ? 's' : ''}? 
                                All associated data will be permanently removed.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button 
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeleteTarget(null);
                                    }} 
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                                    disabled={deleting}
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={confirmDelete} 
                                    disabled={deleting}
                                    className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                                >
                                    {deleting ? (
                                        <>
                                            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Deleting...
                                        </>
                                    ) : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="flex-1 overflow-auto px-6 py-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-gray-50/50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-4 w-12">
                                            <input
                                                type="checkbox"
                                                checked={filteredLeads.length > 0 && selectedIds.size === filteredLeads.length}
                                                onChange={toggleSelectAll}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </th>
                                        <th 
                                            className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                            onClick={() => handleSort('name')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Name
                                                <SortIcon field="name" currentField={sortField} direction={sortDirection} />
                                            </div>
                                        </th>
                                        <th 
                                            className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                            onClick={() => handleSort('email')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Email
                                                <SortIcon field="email" currentField={sortField} direction={sortDirection} />
                                            </div>
                                        </th>
                                        <th 
                                            className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                            onClick={() => handleSort('status')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Status
                                                <SortIcon field="status" currentField={sortField} direction={sortDirection} />
                                            </div>
                                        </th>
                                        <th 
                                            className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                            onClick={() => handleSort('title')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Title
                                                <SortIcon field="title" currentField={sortField} direction={sortDirection} />
                                            </div>
                                        </th>
                                        <th 
                                            className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                            onClick={() => handleSort('company')}
                                        >
                                            <div className="flex items-center gap-1">
                                                Company
                                                <SortIcon field="company" currentField={sortField} direction={sortDirection} />
                                            </div>
                                        </th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-4"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-48"></div></td>
                                                <td className="px-6 py-4"><div className="h-6 bg-gray-200 rounded-full w-20"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-40"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-40"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                                            </tr>
                                        ))
                                    ) : filteredLeads.length === 0 ? (
                                        <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No leads found matching filters.</td></tr>
                                    ) : (
                                        filteredLeads.map((lead) => (
                                            <tr 
                                                key={lead.id} 
                                                className={`hover:bg-gray-50/80 transition-colors group ${selectedIds.has(lead.id) ? 'bg-blue-50/50' : ''}`}
                                            >
                                                <td className="px-4 py-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(lead.id)}
                                                        onChange={() => toggleSelect(lead.id)}
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                </td>
                                                {/* Name */}
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{lead.first_name} {lead.last_name}</div>
                                                    {lead.linkedin_url && (
                                                        <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
                                                            LinkedIn Profile
                                                        </a>
                                                    )}
                                                </td>
                                                {/* Email */}
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-sm text-gray-600">{lead.email || '-'}</div>
                                                    {lead.verification_status === 'processing' ? (
                                                        <div className="flex items-center gap-1.5 text-xs text-purple-600 mt-1">
                                                            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            <span className="italic">Enriching...</span>
                                                        </div>
                                                    ) : lead.email_validity && (lead.email_validity === 'ok' || lead.email_validity === 'mb') ? (
                                                        <div className="text-xs space-y-0.5 mt-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`font-medium ${lead.email_validity === 'ok' ? 'text-green-600' : 'text-yellow-600'}`}>
                                                                    {lead.email_validity === 'ok' ? 'Valid' : 'Catchall'}
                                                                </span>
                                                            </div>
                                                            {lead.provider && (
                                                                <div className="flex items-center gap-1.5">
                                                                    {lead.provider === 'google' && (
                                                                        <span className="flex items-center gap-1 text-gray-600" title="Google Workspace">
                                                                            <svg viewBox="0 0 24 24" width="12" height="12" className="text-blue-500"><path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 1.76-1.82 3.12-3.88 3.12-2.55 0-4.63-2.09-4.63-4.65s2.08-4.65 4.63-4.65c1.26 0 2.39.48 3.28 1.29l1.93-1.93C18.54 5.38 16.69 4.5 14.69 4.5c-4.4 0-8 3.6-8 8s3.6 8 8 8c4.6 0 8-3.36 8-7.94 0-.53-.08-1.05-.23-1.56z" /></svg>
                                                                            Google
                                                                        </span>
                                                                    )}
                                                                    {lead.provider === 'outlook' && (
                                                                        <span className="flex items-center gap-1 text-gray-600" title="Microsoft Outlook/365">
                                                                            <svg viewBox="0 0 24 24" width="12" height="12" className="text-blue-700"><path fill="currentColor" d="M1 17L1 7L10.2 1L23 5.4L23 18.6L10.2 23L1 17ZM10.2 3.8L3.4 6.2L3.4 16.2L10.2 18.6L10.2 3.8ZM20.6 17.4L20.6 6.6L12.6 3.8L12.6 18.6L20.6 17.4Z" /></svg>
                                                                            Outlook
                                                                        </span>
                                                                    )}
                                                                    {lead.provider === 'smtp' && (
                                                                        <span className="flex items-center gap-1 text-gray-600" title="Generic SMTP">
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                                                                            SMTP
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : lead.email_validity === 'ko' ? (
                                                        <span className="text-xs text-red-500 italic mt-1 block">Invalid</span>
                                                    ) : null}
                                                </td>
                                                {/* Status */}
                                                <td className="px-6 py-4">
                                                    {lead.verification_status === 'processing' ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
                                                            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            processing
                                                        </span>
                                                    ) : (
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${lead.verification_status === 'valid' ? 'bg-green-50 text-green-700 border-green-200' :
                                                            lead.verification_status === 'catchall' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                                                lead.verification_status === 'invalid' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                    'bg-gray-100 text-gray-600 border-gray-200'
                                                        }`}>
                                                            {lead.verification_status === 'valid' && <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>}
                                                            {lead.verification_status || 'pending'}
                                                        </span>
                                                    )}
                                                </td>
                                                {/* Title */}
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-900 max-w-[200px] truncate" title={lead.title}>{lead.title || '-'}</div>
                                                </td>
                                                {/* Company */}
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-gray-900">{lead.company_name || '-'}</div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {lead.website && (
                                                            <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                                                Website
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" x2="21" y1="14" y2="3" /></svg>
                                                            </a>
                                                        )}
                                                        {lead.company_linkedin && (
                                                            <a href={lead.company_linkedin} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                                                LinkedIn
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></svg>
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>
                                                {/* Actions */}
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() => handleDeleteClick([lead.id])}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete lead"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
