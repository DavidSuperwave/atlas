'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getSupabaseClient } from '@/lib/supabase-client';
import { apiFetch } from '@/lib/api-client';

const POLLING_INTERVAL = 3000; // 3 seconds
const POLLING_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// PlusVibe account type
interface PlusVibeAccount {
    id: string;
    name: string;
    apiKey: string;
    workspaceId: string;
}

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
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

export default function ScrapeDetailsPage() {
    const params = useParams();
    const id = params.id as string;
    const { user, loading: authLoading } = useAuth();
    const [scrape, setScrape] = useState<any>(null);
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [enriching, setEnriching] = useState(false);

    // Export filter - single dropdown for CSV export
    const [exportFilter, setExportFilter] = useState('valid+catchall');
    
    // Export column selection
    const [showExportSettings, setShowExportSettings] = useState(false);
    const [exportColumns, setExportColumns] = useState({
        companyName: true,
        companyWebsite: true,
        linkedinUrl: true,
        contactEmail: true,
    });

    // Modal state for editing lead
    const [editingLead, setEditingLead] = useState<any>(null);
    const [editForm, setEditForm] = useState({
        first_name: '',
        last_name: '',
        middle_name: '',
        website: '',
    });
    const [customPermutations, setCustomPermutations] = useState<{ email: string; pattern: string }[]>([]);
    const [savingLead, setSavingLead] = useState(false);

    // PlusVibe state
    const [showPlusVibeSettings, setShowPlusVibeSettings] = useState(false);
    const [plusVibeAccounts, setPlusVibeAccounts] = useState<PlusVibeAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [campaignId, setCampaignId] = useState('');
    const [providerFilter, setProviderFilter] = useState<string>('all');
    const [sendingToPlusVibe, setSendingToPlusVibe] = useState(false);
    const [newAccountForm, setNewAccountForm] = useState({ name: '', apiKey: '', workspaceId: '' });

    // Polling state
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pollingStartTimeRef = useRef<number | null>(null);

    // Campaign editing state
    const [editingCampaign, setEditingCampaign] = useState(false);
    const [campaignName, setCampaignName] = useState('');
    const [campaignTagInput, setCampaignTagInput] = useState('');
    const [campaignTags, setCampaignTags] = useState<string[]>([]);
    const [savingCampaign, setSavingCampaign] = useState(false);

    const fetchData = useCallback(async () => {
        const supabase = getSupabaseClient();
        
        // Fetch scrape details (RLS will ensure user owns this scrape)
        const { data: scrapeData } = await supabase
            .from('scrapes')
            .select('*')
            .eq('id', id)
            .single();
        setScrape(scrapeData);

        // Fetch all leads for this scrape (RLS will filter)
        const { data: leadsData } = await supabase
            .from('leads')
            .select('*')
            .eq('scrape_id', id)
            .order('created_at', { ascending: false });

        if (leadsData) setLeads(leadsData);
        setLoading(false);

        return leadsData;
    }, [id]);

    // Check if any leads are still processing
    const hasProcessingLeads = useCallback(() => {
        return leads.some(lead => lead.verification_status === 'processing');
    }, [leads]);

    // Start polling if there are processing leads
    const startPolling = useCallback(() => {
        if (pollingIntervalRef.current) return; // Already polling

        pollingStartTimeRef.current = Date.now();
        pollingIntervalRef.current = setInterval(async () => {
            // Check timeout
            if (pollingStartTimeRef.current && Date.now() - pollingStartTimeRef.current > POLLING_TIMEOUT) {
                console.log('Polling timeout reached, stopping...');
                stopPolling();
                return;
            }

            const updatedLeads = await fetchData();

            // Stop polling if no more processing leads
            if (updatedLeads && !updatedLeads.some((lead: any) => lead.verification_status === 'processing')) {
                console.log('All leads processed, stopping polling...');
                stopPolling();
            }
        }, POLLING_INTERVAL);
    }, [fetchData]);

    const stopPolling = useCallback(() => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        pollingStartTimeRef.current = null;
    }, []);

    useEffect(() => {
        if (id && user && !authLoading) {
            fetchData();
        } else if (!authLoading && !user) {
            setLoading(false);
        }
    }, [id, user, authLoading, fetchData]);

    // Load PlusVibe accounts from localStorage
    useEffect(() => {
        const stored = localStorage.getItem('plusvibe_accounts');
        if (stored) {
            try {
                const accounts = JSON.parse(stored);
                setPlusVibeAccounts(accounts);
                if (accounts.length > 0 && !selectedAccountId) {
                    setSelectedAccountId(accounts[0].id);
                }
            } catch (e) {
                console.error('Failed to parse PlusVibe accounts:', e);
            }
        }
    }, []);

    // Start/stop polling based on processing leads
    useEffect(() => {
        if (hasProcessingLeads()) {
            startPolling();
        } else {
            stopPolling();
        }

        return () => stopPolling();
    }, [hasProcessingLeads, startPolling, stopPolling]);

    // Enrich all unprocessed leads
    async function handleEnrichAll() {
        setEnriching(true);
        try {
            const res = await apiFetch('/api/enrich', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scrapeId: id }),
            });
            const data = await res.json();
            if (data.success) {
                if (data.count === 0) {
                    alert('No unprocessed leads found to enrich.');
                } else {
                    alert(`Enrichment started for ${data.count} leads. ${data.skipped ? `(${data.skipped} skipped)` : ''}`);
                }
                fetchData();
            } else {
                alert('Enrichment failed: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            alert('Error starting enrichment');
            console.error(err);
        } finally {
            setEnriching(false);
        }
    }

    // Open edit modal for a lead
    function openEditModal(lead: any) {
        setEditingLead(lead);
        setEditForm({
            first_name: lead.first_name || '',
            last_name: lead.last_name || '',
            middle_name: lead.middle_name || '',
            website: lead.website || '',
        });
        // Generate permutations based on current data
        regeneratePermutations(lead.first_name, lead.last_name, lead.middle_name, lead.website);
    }

    // Close edit modal
    function closeEditModal() {
        setEditingLead(null);
        setEditForm({ first_name: '', last_name: '', middle_name: '', website: '' });
        setCustomPermutations([]);
    }

    // Generate permutations from form data
    function regeneratePermutations(firstName: string, lastName: string, middleName: string | null, website: string) {
        // Extract domain from website
        let domain = website?.toLowerCase() || '';
        domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
        domain = domain.split('/')[0];
        domain = domain.replace(/\.$/, '');

        if (!firstName || !lastName || !domain) {
            setCustomPermutations([]);
            return;
        }

        const fn = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const ln = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const mn = middleName ? middleName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        const fi = fn.charAt(0);
        const li = ln.charAt(0);
        const mi = mn ? mn.charAt(0) : '';

        const perms: { email: string; pattern: string }[] = [];
        const add = (local: string, pattern: string) => {
            const email = `${local}@${domain}`;
            if (!perms.some(p => p.email === email)) {
                perms.push({ email, pattern });
            }
        };

        // Standard patterns
        add(fn, '{fn}');
        add(ln, '{ln}');
        add(`${fn}${ln}`, '{fn}{ln}');
        add(`${fn}.${ln}`, '{fn}.{ln}');
        add(`${fi}${ln}`, '{fi}{ln}');
        add(`${fi}.${ln}`, '{fi}.{ln}');
        add(`${fn}${li}`, '{fn}{li}');
        add(`${fn}.${li}`, '{fn}.{li}');
        add(`${fi}${li}`, '{fi}{li}');
        add(`${fi}.${li}`, '{fi}.{li}');
        add(`${ln}${fn}`, '{ln}{fn}');
        add(`${ln}.${fn}`, '{ln}.{fn}');
        add(`${ln}${fi}`, '{ln}{fi}');
        add(`${ln}.${fi}`, '{ln}.{fi}');
        add(`${li}${fn}`, '{li}{fn}');
        add(`${li}.${fn}`, '{li}.{fn}');
        add(`${li}${fi}`, '{li}{fi}');
        add(`${li}.${fi}`, '{li}.{fi}');

        // Middle name patterns
        if (mn && mi) {
            add(`${fi}${mi}${ln}`, '{fi}{mi}{ln}');
            add(`${fi}${mi}.${ln}`, '{fi}{mi}.{ln}');
            add(`${fn}${mi}${ln}`, '{fn}{mi}{ln}');
            add(`${fn}.${mi}.${ln}`, '{fn}.{mi}.{ln}');
        }

        setCustomPermutations(perms);
    }

    // Handle form field changes
    function handleFormChange(field: string, value: string) {
        const newForm = { ...editForm, [field]: value };
        setEditForm(newForm);
        regeneratePermutations(newForm.first_name, newForm.last_name, newForm.middle_name, newForm.website);
    }

    // Add custom permutation
    function addCustomPermutation() {
        const domain = editForm.website?.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] || 'domain.com';
        setCustomPermutations([...customPermutations, { email: `custom@${domain}`, pattern: 'custom' }]);
    }

    // Remove permutation
    function removePermutation(index: number) {
        setCustomPermutations(customPermutations.filter((_, i) => i !== index));
    }

    // Update permutation email
    function updatePermutationEmail(index: number, email: string) {
        const updated = [...customPermutations];
        updated[index] = { ...updated[index], email };
        setCustomPermutations(updated);
    }

    // Save lead data and optionally re-run enrichment
    async function saveAndEnrich(rerun: boolean) {
        if (!editingLead) return;
        setSavingLead(true);

        try {
            const supabase = getSupabaseClient();
            
            // Update lead data in database
            const { error: updateError } = await supabase
                .from('leads')
                .update({
                    first_name: editForm.first_name,
                    last_name: editForm.last_name,
                    middle_name: editForm.middle_name || null,
                    website: editForm.website,
                })
                .eq('id', editingLead.id);

            if (updateError) {
                alert('Failed to save lead data: ' + updateError.message);
                setSavingLead(false);
                return;
            }

            if (rerun && customPermutations.length > 0) {
                // Re-run enrichment with custom permutations
                const res = await apiFetch('/api/enrich', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        leadId: editingLead.id,
                        permutations: customPermutations,
                    }),
                });
                const data = await res.json();
                if (!data.success) {
                    alert('Enrichment failed: ' + (data.error || 'Unknown error'));
                }
            }

            await fetchData();
            closeEditModal();
        } catch (err) {
            alert('Error saving lead');
            console.error(err);
        } finally {
            setSavingLead(false);
        }
    }

    function downloadCSV() {
        // Escape CSV fields properly
        const escapeCSV = (field: string) => {
            if (!field) return '';
            if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
        };

        // Get pattern for a lead - use best_match first, then find matching permutation
        const getPattern = (lead: any): string => {
            // Primary: Use best_match.pattern if available
            if (lead.verification_data?.best_match?.pattern) {
                return lead.verification_data.best_match.pattern;
            }
            
            // Fallback: Find permutation that matches lead.email
            if (lead.email && lead.verification_data?.permutations_checked) {
                const matchingPerm = lead.verification_data.permutations_checked.find(
                    (perm: any) => perm.email === lead.email
                );
                if (matchingPerm?.pattern) {
                    return matchingPerm.pattern;
                }
            }
            
            // Last resort: Find any valid/catchall permutation
            const validPerm = lead.verification_data?.permutations_checked?.find(
                (perm: any) => perm.status === 'valid' || perm.status === 'catchall'
            );
            return validPerm?.pattern || '';
        };

        // Build dynamic headers based on selected columns
        const headers: string[] = [];
        if (exportColumns.companyName) headers.push('Company Name');
        if (exportColumns.companyWebsite) headers.push('Company Website');
        if (exportColumns.linkedinUrl) headers.push('LinkedIn URL');
        if (exportColumns.contactEmail) headers.push('Contact Email');

        const rows: string[] = [];

        // Filter leads based on export filter
        const filteredLeads = leads.filter(lead => {
            if (!lead.email_validity) return false; // Exclude leads without email_validity
            
            switch (exportFilter) {
                case 'valid':
                    return lead.email_validity === 'ok';
                case 'valid+catchall':
                    return lead.email_validity === 'ok' || lead.email_validity === 'mb';
                case 'catchall':
                    return lead.email_validity === 'mb';
                default:
                    return false;
            }
        });

        filteredLeads.forEach(lead => {
            // Build row based on selected columns
            const rowData: string[] = [];
            if (exportColumns.companyName) rowData.push(escapeCSV(lead.company_name || ''));
            if (exportColumns.companyWebsite) rowData.push(escapeCSV(lead.website || ''));
            if (exportColumns.linkedinUrl) rowData.push(escapeCSV(lead.company_linkedin || ''));
            if (exportColumns.contactEmail) rowData.push(escapeCSV(lead.email || ''));
            
            rows.push(rowData.join(','));
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `scrape-${id}-${exportFilter}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        setShowExportSettings(false);
    }

    // PlusVibe account management functions
    function savePlusVibeAccounts(accounts: PlusVibeAccount[]) {
        localStorage.setItem('plusvibe_accounts', JSON.stringify(accounts));
        setPlusVibeAccounts(accounts);
    }

    function addPlusVibeAccount() {
        if (!newAccountForm.name || !newAccountForm.apiKey || !newAccountForm.workspaceId) {
            alert('Please fill in all fields');
            return;
        }
        const newAccount: PlusVibeAccount = {
            id: crypto.randomUUID(),
            name: newAccountForm.name,
            apiKey: newAccountForm.apiKey,
            workspaceId: newAccountForm.workspaceId,
        };
        const updated = [...plusVibeAccounts, newAccount];
        savePlusVibeAccounts(updated);
        setSelectedAccountId(newAccount.id);
        setNewAccountForm({ name: '', apiKey: '', workspaceId: '' });
    }

    function deletePlusVibeAccount(accountId: string) {
        const updated = plusVibeAccounts.filter(a => a.id !== accountId);
        savePlusVibeAccounts(updated);
        if (selectedAccountId === accountId) {
            setSelectedAccountId(updated[0]?.id || '');
        }
    }

    // Get filtered valid leads count based on provider filter
    function getFilteredValidLeadsCount() {
        const validLeads = leads.filter(lead => lead.email_validity === 'ok' && lead.email);
        if (providerFilter === 'all') {
            return validLeads.length;
        }
        return validLeads.filter(lead => lead.provider === providerFilter).length;
    }

    // Send leads to PlusVibe - only verified emails (email_validity === 'ok')
    async function sendToPlusVibe() {
        const selectedAccount = plusVibeAccounts.find(a => a.id === selectedAccountId);
        if (!selectedAccount) {
            alert('Please select a PlusVibe account');
            return;
        }
        if (!campaignId) {
            alert('Please enter a Campaign ID');
            return;
        }

        // Filter to only include verified/valid emails
        let validLeads = leads.filter(lead => lead.email_validity === 'ok' && lead.email);

        // Apply provider filter if not "all"
        if (providerFilter !== 'all') {
            validLeads = validLeads.filter(lead => lead.provider === providerFilter);
        }

        if (validLeads.length === 0) {
            const filterText = providerFilter === 'all' ? '' : ` with provider "${providerFilter}"`;
            alert(`No verified leads${filterText} to send. Only leads with valid emails (not catchall or invalid) can be sent to PlusVibe.`);
            return;
        }

        setSendingToPlusVibe(true);
        try {
            const res = await fetch('/api/plusvibe/send-leads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apiKey: selectedAccount.apiKey,
                    workspaceId: selectedAccount.workspaceId,
                    campaignId: campaignId,
                    leads: validLeads.map(lead => ({
                        email: lead.email,
                        first_name: lead.first_name,
                        last_name: lead.last_name,
                        company_name: lead.company_name,
                        website: lead.website,
                        linkedin_url: lead.linkedin_url,
                        company_linkedin: lead.company_linkedin,
                        phone_numbers: lead.phone_numbers,
                    })),
                }),
            });

            const data = await res.json();
            if (data.success) {
                alert(`Successfully sent ${validLeads.length} leads to PlusVibe!`);
                setShowPlusVibeSettings(false);
            } else {
                alert('Failed to send leads: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            console.error('Error sending to PlusVibe:', err);
            alert('Error sending leads to PlusVibe');
        } finally {
            setSendingToPlusVibe(false);
        }
    }

    // Campaign edit functions
    function openCampaignEdit() {
        setCampaignName(scrape?.name || '');
        setCampaignTags(scrape?.tags || []);
        setEditingCampaign(true);
    }

    function closeCampaignEdit() {
        setEditingCampaign(false);
        setCampaignTagInput('');
    }

    function addCampaignTag() {
        const tag = campaignTagInput.trim().toLowerCase();
        if (tag && !campaignTags.includes(tag)) {
            setCampaignTags([...campaignTags, tag]);
        }
        setCampaignTagInput('');
    }

    function removeCampaignTag(tagToRemove: string) {
        setCampaignTags(campaignTags.filter(t => t !== tagToRemove));
    }

    function handleCampaignTagKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addCampaignTag();
        }
    }

    async function saveCampaignInfo() {
        setSavingCampaign(true);
        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase
                .from('scrapes')
                .update({
                    name: campaignName.trim() || null,
                    tags: campaignTags,
                })
                .eq('id', id);

            if (error) {
                alert('Failed to save campaign info: ' + error.message);
            } else {
                await fetchData();
                closeCampaignEdit();
            }
        } catch (err) {
            alert('Error saving campaign info');
            console.error(err);
        } finally {
            setSavingCampaign(false);
        }
    }

    // Get counts for display
    const validCount = leads.filter(l => l.email_validity === 'ok').length;
    const catchallCount = leads.filter(l => l.email_validity === 'mb').length;
    const processingCount = leads.filter(l => l.verification_status === 'processing').length;
    const pendingCount = leads.filter(l => !l.email_validity && l.verification_status !== 'processing').length;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-4">
                            <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors">← Back</Link>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                                        {scrape?.name || 'Untitled Campaign'}
                                    </h1>
                                    <button
                                        onClick={openCampaignEdit}
                                        className="text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Edit campaign info"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                    </button>
                                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">{leads.length}</span>
                                    {scrape && (
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${scrape.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                                            scrape.status === 'failed' ? 'bg-red-100 text-red-700 border-red-200' :
                                                'bg-yellow-100 text-yellow-700 border-yellow-200'
                                            }`}>
                                            {scrape.status.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                {/* Campaign Tags */}
                                {scrape?.tags && scrape.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {scrape.tags.map((tag: string) => (
                                            <span
                                                key={tag}
                                                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Enrich Button */}
                            <button
                                onClick={handleEnrichAll}
                                disabled={enriching || processingCount > 0}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm ${
                                    enriching || processingCount > 0
                                        ? 'bg-blue-100 text-blue-700 cursor-not-allowed'
                                        : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md'
                                }`}
                            >
                                {enriching || processingCount > 0 ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {processingCount > 0 ? `Processing ${processingCount}...` : 'Enriching...'}
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v3m6.366-.366-2.12 2.12M21 12h-3m.366 6.366-2.12-2.12M12 21v-3m-6.366.366 2.12-2.12M3 12h3m-.366-6.366 2.12 2.12"/></svg>
                                        Enrich All ({pendingCount})
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => setShowExportSettings(true)}
                                className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                Export ({validCount})
                            </button>
                            <button
                                onClick={() => setShowPlusVibeSettings(true)}
                                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all shadow-sm hover:shadow-md"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
                                PlusVibe ({validCount})
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
                        <div className="bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
                            <span className="text-xs text-gray-500 uppercase font-medium">Total</span>
                            <span className="ml-2 text-sm font-bold text-gray-900">{leads.length}</span>
                        </div>
                        <div className="bg-green-50 px-3 py-1.5 rounded-md border border-green-200">
                            <span className="text-xs text-green-600 uppercase font-medium">Valid</span>
                            <span className="ml-2 text-sm font-bold text-green-700">{validCount}</span>
                        </div>
                        <div className="bg-yellow-50 px-3 py-1.5 rounded-md border border-yellow-200">
                            <span className="text-xs text-yellow-600 uppercase font-medium">Catchall</span>
                            <span className="ml-2 text-sm font-bold text-yellow-700">{catchallCount}</span>
                        </div>
                        <div className="bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
                            <span className="text-xs text-gray-500 uppercase font-medium">Pending</span>
                            <span className="ml-2 text-sm font-bold text-gray-700">{pendingCount}</span>
                        </div>
                        {processingCount > 0 && (
                            <div className="bg-purple-50 px-3 py-1.5 rounded-md border border-purple-200 flex items-center gap-2">
                                <svg className="animate-spin h-3 w-3 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="text-xs text-purple-600 uppercase font-medium">Processing</span>
                                <span className="text-sm font-bold text-purple-700">{processingCount}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {scrape && (
                    <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6 shadow-sm">
                        <div className="text-sm text-gray-600 min-w-0">
                            <p className="mb-1 truncate max-w-full" title={scrape.url}><span className="font-semibold text-gray-700">URL:</span> {scrape.url}</p>
                            <p><span className="font-semibold text-gray-700">Date:</span> {new Date(scrape.created_at).toLocaleString()}</p>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50/50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Company</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    [...Array(5)].map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-48"></div></td>
                                            <td className="px-6 py-4"><div className="h-6 bg-gray-200 rounded-full w-20"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-40"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-40"></div></td>
                                            <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                                        </tr>
                                    ))
                                ) : leads.length === 0 ? (
                                    <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">No leads found.</td></tr>
                                ) : (
                                    leads.map((lead) => (
                                        <tr key={lead.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-gray-900">{lead.first_name} {lead.last_name}</div>
                                                {lead.linkedin_url && (
                                                    <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
                                                        LinkedIn Profile
                                                    </a>
                                                )}
                                            </td>
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
                                                            <span className="text-gray-500">Val:</span>
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
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 max-w-[200px] truncate" title={lead.title}>{lead.title || '-'}</div>
                                            </td>
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
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => openEditModal(lead)}
                                                    className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                                    Edit
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

            {/* Export Settings Modal */}
            {showExportSettings && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Export Settings</h2>
                                    <p className="text-sm text-gray-500 mt-1">Choose columns and filter for CSV export</p>
                                </div>
                                <button onClick={() => setShowExportSettings(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Email Filter */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Email Filter</label>
                                <select 
                                    value={exportFilter} 
                                    onChange={(e) => setExportFilter(e.target.value)} 
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    <option value="valid">Valid Only ({validCount})</option>
                                    <option value="valid+catchall">Valid + Catchall ({validCount + catchallCount})</option>
                                    <option value="catchall">Catchall Only ({catchallCount})</option>
                                </select>
                            </div>

                            {/* Column Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-3">Columns to Export</label>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={exportColumns.companyName}
                                            onChange={(e) => setExportColumns(prev => ({ ...prev, companyName: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Company Name</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={exportColumns.companyWebsite}
                                            onChange={(e) => setExportColumns(prev => ({ ...prev, companyWebsite: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Company Website</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={exportColumns.linkedinUrl}
                                            onChange={(e) => setExportColumns(prev => ({ ...prev, linkedinUrl: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">LinkedIn URL</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={exportColumns.contactEmail}
                                            onChange={(e) => setExportColumns(prev => ({ ...prev, contactEmail: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Contact Email</span>
                                    </label>
                                </div>
                            </div>

                            {/* Preview count */}
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                <p className="text-sm text-gray-600">
                                    <span className="font-medium">
                                        {exportFilter === 'valid' ? validCount : exportFilter === 'catchall' ? catchallCount : validCount + catchallCount}
                                    </span> leads will be exported with{' '}
                                    <span className="font-medium">
                                        {Object.values(exportColumns).filter(Boolean).length}
                                    </span> columns
                                </p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setShowExportSettings(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={downloadCSV}
                                disabled={Object.values(exportColumns).filter(Boolean).length === 0}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                                Download CSV
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingLead && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-gray-900">Edit Lead & Permutations</h2>
                                <button onClick={closeEditModal} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Data Correction Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">Lead Information</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">First Name</label>
                                        <input
                                            type="text"
                                            value={editForm.first_name}
                                            onChange={(e) => handleFormChange('first_name', e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
                                        <input
                                            type="text"
                                            value={editForm.last_name}
                                            onChange={(e) => handleFormChange('last_name', e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Middle Name (Optional)</label>
                                        <input
                                            type="text"
                                            value={editForm.middle_name}
                                            onChange={(e) => handleFormChange('middle_name', e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="Optional"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Domain / Website</label>
                                        <input
                                            type="text"
                                            value={editForm.website}
                                            onChange={(e) => handleFormChange('website', e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="company.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Permutations Section */}
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-semibold text-gray-700">Email Permutations ({customPermutations.length})</h3>
                                    <button
                                        onClick={addCustomPermutation}
                                        className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                                        Add Custom
                                    </button>
                                </div>
                                
                                {customPermutations.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
                                        <p className="text-sm">No permutations generated.</p>
                                        <p className="text-xs mt-1">Fill in the name and domain fields above.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {customPermutations.map((perm, idx) => (
                                            <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                                                <input
                                                    type="text"
                                                    value={perm.email}
                                                    onChange={(e) => updatePermutationEmail(idx, e.target.value)}
                                                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                                <span className="text-xs text-gray-400 w-24 truncate" title={perm.pattern}>{perm.pattern}</span>
                                                <button
                                                    onClick={() => removePermutation(idx)}
                                                    className="text-red-500 hover:text-red-700 p-1"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Previous Results */}
                            {editingLead.verification_data?.permutations_checked && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Previous Verification Results</h3>
                                    <div className="space-y-1 max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-3">
                                        {editingLead.verification_data.permutations_checked.map((perm: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between text-xs">
                                                <span className="font-mono text-gray-600">{perm.email}</span>
                                                <span className={`px-2 py-0.5 rounded ${
                                                    perm.status === 'valid' ? 'bg-green-100 text-green-700' :
                                                    perm.status === 'catchall' ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                    {perm.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={closeEditModal}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => saveAndEnrich(false)}
                                disabled={savingLead}
                                className="px-4 py-2 bg-gray-600 text-white hover:bg-gray-700 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                                Save Only
                            </button>
                            <button
                                onClick={() => saveAndEnrich(true)}
                                disabled={savingLead || customPermutations.length === 0}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                                {savingLead ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving...
                                    </>
                                ) : 'Save & Re-run Enrichment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Campaign Edit Modal */}
            {editingCampaign && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <h2 className="text-xl font-bold text-gray-900">Edit Campaign Info</h2>
                                <button onClick={closeCampaignEdit} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Campaign Name */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Campaign Name</label>
                                <input
                                    type="text"
                                    value={campaignName}
                                    onChange={(e) => setCampaignName(e.target.value)}
                                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base placeholder-gray-400 transition-all"
                                    placeholder="e.g., Tech Startup CEOs Q1 2024"
                                />
                            </div>

                            {/* Tags */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Tags</label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {campaignTags.map(tag => (
                                        <span
                                            key={tag}
                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getTagColor(tag)}`}
                                        >
                                            {tag}
                                            <button
                                                onClick={() => removeCampaignTag(tag)}
                                                className="hover:opacity-70 ml-0.5"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Type a tag and press Enter"
                                        className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-gray-400 transition-all"
                                        value={campaignTagInput}
                                        onChange={(e) => setCampaignTagInput(e.target.value)}
                                        onKeyDown={handleCampaignTagKeyDown}
                                    />
                                    <button
                                        onClick={addCampaignTag}
                                        type="button"
                                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={closeCampaignEdit}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveCampaignInfo}
                                disabled={savingCampaign}
                                className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {savingCampaign ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Saving...
                                    </>
                                ) : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PlusVibe Settings Modal */}
            {showPlusVibeSettings && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Send to PlusVibe</h2>
                                    <p className="text-sm text-gray-500 mt-1">Send {getFilteredValidLeadsCount()} verified leads to your campaign</p>
                                </div>
                                <button onClick={() => setShowPlusVibeSettings(false)} className="text-gray-400 hover:text-gray-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Account Selection */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Account</label>
                                {plusVibeAccounts.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">No accounts saved. Add one below.</p>
                                ) : (
                                    <select
                                        value={selectedAccountId}
                                        onChange={(e) => setSelectedAccountId(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                    >
                                        {plusVibeAccounts.map(account => (
                                            <option key={account.id} value={account.id}>
                                                {account.name} ({account.workspaceId})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Campaign ID */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Campaign ID</label>
                                <input
                                    type="text"
                                    value={campaignId}
                                    onChange={(e) => setCampaignId(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                    placeholder="Enter your PlusVibe campaign ID"
                                />
                            </div>

                            {/* Provider Filter */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Email Provider Filter</label>
                                <select
                                    value={providerFilter}
                                    onChange={(e) => setProviderFilter(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                >
                                    <option value="all">All Providers ({validCount})</option>
                                    <option value="google">Google Only ({leads.filter(l => l.email_validity === 'ok' && l.provider === 'google').length})</option>
                                    <option value="outlook">Outlook Only ({leads.filter(l => l.email_validity === 'ok' && l.provider === 'outlook').length})</option>
                                    <option value="smtp">SMTP Only ({leads.filter(l => l.email_validity === 'ok' && l.provider === 'smtp').length})</option>
                                </select>
                            </div>

                            {/* Send Button */}
                            <button
                                onClick={sendToPlusVibe}
                                disabled={sendingToPlusVibe || !selectedAccountId || !campaignId || getFilteredValidLeadsCount() === 0}
                                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-3 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {sendingToPlusVibe ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
                                        Send {getFilteredValidLeadsCount()} Leads to PlusVibe
                                    </>
                                )}
                            </button>

                            {getFilteredValidLeadsCount() === 0 && (
                                <p className="text-xs text-amber-600 text-center">
                                    {providerFilter === 'all' 
                                        ? 'No verified leads available. Only leads with valid emails can be sent.'
                                        : `No verified leads with provider "${providerFilter}" available. Only leads with valid emails can be sent.`
                                    }
                                </p>
                            )}

                            {/* Divider */}
                            <div className="border-t border-gray-200 pt-6">
                                <h3 className="text-sm font-semibold text-gray-700 mb-4">Manage Accounts</h3>

                                {/* Saved Accounts List */}
                                {plusVibeAccounts.length > 0 && (
                                    <div className="space-y-2 mb-4">
                                        {plusVibeAccounts.map(account => (
                                            <div key={account.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{account.name}</p>
                                                    <p className="text-xs text-gray-500">Workspace: {account.workspaceId}</p>
                                                </div>
                                                <button
                                                    onClick={() => deletePlusVibeAccount(account.id)}
                                                    className="text-red-500 hover:text-red-700 p-1"
                                                    title="Delete account"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add New Account Form */}
                                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Add New Account</p>
                                    <input
                                        type="text"
                                        value={newAccountForm.name}
                                        onChange={(e) => setNewAccountForm({ ...newAccountForm, name: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                                        placeholder="Account Name (e.g., My Agency)"
                                    />
                                    <input
                                        type="text"
                                        value={newAccountForm.apiKey}
                                        onChange={(e) => setNewAccountForm({ ...newAccountForm, apiKey: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none font-mono"
                                        placeholder="API Key"
                                    />
                                    <input
                                        type="text"
                                        value={newAccountForm.workspaceId}
                                        onChange={(e) => setNewAccountForm({ ...newAccountForm, workspaceId: e.target.value })}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 outline-none font-mono"
                                        placeholder="Workspace ID"
                                    />
                                    <button
                                        onClick={addPlusVibeAccount}
                                        className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                                        Save Account
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
