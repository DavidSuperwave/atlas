'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface GoLoginProfile {
    id: string;
    profile_id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    api_key_id: string | null;
    api_key_name: string | null;
    api_key_active: boolean | null;
    created_at: string;
    updated_at: string;
    assignments: {
        user_id: string;
        assigned_at: string;
        assigned_by: string | null;
    }[];
}

interface AvailableProfile {
    id: string;
    name: string;
    browserType?: string;
    os?: string;
    alreadyAdded: boolean;
    addedToOtherKey?: boolean;
}

interface User {
    id: string;
    email: string;
}

interface ApiKey {
    id: string;
    name: string;
    is_active: boolean;
}

export default function GoLoginProfilesPage() {
    const { user, loading: authLoading } = useAuth();
    const [profiles, setProfiles] = useState<GoLoginProfile[]>([]);
    const [availableProfiles, setAvailableProfiles] = useState<AvailableProfile[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingAvailable, setLoadingAvailable] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableError, setAvailableError] = useState<string | null>(null);

    // Form states
    const [showAddForm, setShowAddForm] = useState(false);
    const [selectedAvailableProfile, setSelectedAvailableProfile] = useState<string>('');
    const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>('');
    const [newProfile, setNewProfile] = useState({ profile_id: '', name: '', description: '', api_key_id: '' });
    const [editingProfile, setEditingProfile] = useState<GoLoginProfile | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Filter states
    const [filterApiKeyId, setFilterApiKeyId] = useState<string>('');

    // Assignment states
    const [assigningProfile, setAssigningProfile] = useState<string | null>(null);
    const [selectedUserId, setSelectedUserId] = useState('');

    useEffect(() => {
        if (!authLoading && user) {
            fetchData();
        }
    }, [user, authLoading]);

    async function fetchData() {
        try {
            const res = await fetch('/api/admin/gologin-profiles');
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Admin access required');
                } else {
                    setError('Failed to fetch profiles');
                }
                setLoading(false);
                return;
            }

            const data = await res.json();
            setProfiles(data.profiles || []);
            setUsers(data.users || []);
            setApiKeys(data.apiKeys || []);
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchAvailableProfiles(apiKeyId?: string) {
        setLoadingAvailable(true);
        setAvailableError(null);
        try {
            const url = apiKeyId 
                ? `/api/admin/gologin-profiles/available?apiKeyId=${apiKeyId}`
                : '/api/admin/gologin-profiles/available';
            const res = await fetch(url);
            const data = await res.json();
            
            if (!res.ok) {
                setAvailableError(data.error || 'Failed to fetch GoLogin profiles');
                setAvailableProfiles([]);
                return;
            }

            setAvailableProfiles(data.profiles || []);
        } catch (err) {
            setAvailableError('Failed to connect to GoLogin API');
            console.error(err);
        } finally {
            setLoadingAvailable(false);
        }
    }

    function handleShowAddForm() {
        setShowAddForm(true);
        setSelectedAvailableProfile('');
        setSelectedApiKeyId('');
        setNewProfile({ profile_id: '', name: '', description: '', api_key_id: '' });
        // Don't fetch yet - wait for API key selection
        if (apiKeys.length === 1) {
            // If only one API key, auto-select it
            setSelectedApiKeyId(apiKeys[0].id);
            setNewProfile(prev => ({ ...prev, api_key_id: apiKeys[0].id }));
            fetchAvailableProfiles(apiKeys[0].id);
        } else if (apiKeys.length === 0) {
            // No API keys, fetch with default
            fetchAvailableProfiles();
        }
    }

    function handleApiKeyChange(apiKeyId: string) {
        setSelectedApiKeyId(apiKeyId);
        setNewProfile(prev => ({ ...prev, api_key_id: apiKeyId }));
        setSelectedAvailableProfile('');
        setAvailableProfiles([]);
        if (apiKeyId) {
            fetchAvailableProfiles(apiKeyId);
        }
    }

    function handleSelectAvailableProfile(profileId: string) {
        setSelectedAvailableProfile(profileId);
        const profile = availableProfiles.find(p => p.id === profileId);
        if (profile) {
            setNewProfile(prev => ({
                profile_id: profile.id,
                name: profile.name,
                description: `Browser: ${profile.browserType || 'Unknown'}, OS: ${profile.os || 'Unknown'}`,
                api_key_id: prev.api_key_id  // Preserve selected API key
            }));
        } else {
            setNewProfile({ profile_id: '', name: '', description: '', api_key_id: '' });
        }
    }

    async function handleAddProfile(e: React.FormEvent) {
        e.preventDefault();
        if (!newProfile.profile_id || !newProfile.name) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/gologin-profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profile_id: newProfile.profile_id,
                    name: newProfile.name,
                    description: newProfile.description,
                    api_key_id: newProfile.api_key_id || null
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setNewProfile({ profile_id: '', name: '', description: '', api_key_id: '' });
                setSelectedAvailableProfile('');
                setSelectedApiKeyId('');
                setShowAddForm(false);
                fetchData();
            } else {
                alert(data.error || 'Failed to add profile');
            }
        } catch (err) {
            alert('Error adding profile');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleUpdateProfile(e: React.FormEvent) {
        e.preventDefault();
        if (!editingProfile) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/gologin-profiles', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingProfile.id,
                    name: editingProfile.name,
                    description: editingProfile.description,
                    is_active: editingProfile.is_active,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setEditingProfile(null);
                fetchData();
            } else {
                alert(data.error || 'Failed to update profile');
            }
        } catch (err) {
            alert('Error updating profile');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeleteProfile(profileId: string) {
        if (!confirm('Are you sure you want to deactivate this profile?')) return;

        try {
            const res = await fetch('/api/admin/gologin-profiles', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: profileId }),
            });

            if (res.ok) {
                fetchData();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete profile');
            }
        } catch (err) {
            alert('Error deleting profile');
            console.error(err);
        }
    }

    async function handleAssignProfile(profileDbId: string) {
        if (!selectedUserId) {
            alert('Please select a user');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/gologin-profiles/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedUserId,
                    profileDbId: profileDbId,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setAssigningProfile(null);
                setSelectedUserId('');
                fetchData();
            } else {
                alert(data.error || 'Failed to assign profile');
            }
        } catch (err) {
            alert('Error assigning profile');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleUnassignProfile(userId: string) {
        if (!confirm('Are you sure you want to unassign this profile from the user?')) return;

        try {
            const res = await fetch('/api/admin/gologin-profiles/assign', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });

            if (res.ok) {
                fetchData();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to unassign profile');
            }
        } catch (err) {
            alert('Error unassigning profile');
            console.error(err);
        }
    }

    function getUserEmail(userId: string): string {
        const foundUser = users.find(u => u.id === userId);
        return foundUser?.email || userId.slice(0, 8) + '...';
    }

    if (authLoading || loading) {
        return (
            <div className="p-8">
                <div className="animate-pulse">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="bg-red-100 text-red-700 p-4 rounded-lg">
                    {error}
                </div>
                <Link href="/admin" className="text-blue-600 hover:underline mt-4 block">
                    ← Back to Admin
                </Link>
            </div>
        );
    }

    const notAddedProfiles = availableProfiles.filter(p => !p.alreadyAdded);

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 mb-2 block">
                        ← Back to Admin
                    </Link>
                    <h1 className="text-2xl font-bold">GoLogin Profiles</h1>
                    <p className="text-gray-600 mt-1">
                        Manage browser profiles and assign them to users
                    </p>
                </div>
                <button
                    onClick={handleShowAddForm}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    + Add Profile
                </button>
            </div>

            {/* Add Profile Form - Now with API key selector! */}
            {showAddForm && (
                <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
                    <h2 className="font-semibold mb-4">Add GoLogin Profile</h2>

                    {/* API Key Selector - First step */}
                    {apiKeys.length > 1 && (
                        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select API Key *
                            </label>
                            <select
                                value={selectedApiKeyId}
                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                            >
                                <option value="">Choose an API key...</option>
                                {apiKeys.filter(k => k.is_active).map((k) => (
                                    <option key={k.id} value={k.id}>
                                        {k.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                Profiles are linked to their API key. Select which account this profile comes from.
                            </p>
                        </div>
                    )}
                    
                    {/* Fetch from GoLogin Section */}
                    <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                        <h3 className="font-medium text-blue-900 mb-2">Select from your GoLogin account</h3>
                        
                        {apiKeys.length > 1 && !selectedApiKeyId ? (
                            <div className="text-blue-700 text-sm">Select an API key above first...</div>
                        ) : loadingAvailable ? (
                            <div className="text-blue-700 text-sm">Loading profiles from GoLogin...</div>
                        ) : availableError ? (
                            <div className="text-red-600 text-sm">
                                {availableError}
                                <button 
                                    onClick={() => fetchAvailableProfiles(selectedApiKeyId)}
                                    className="ml-2 text-blue-600 hover:underline"
                                >
                                    Retry
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <select
                                    value={selectedAvailableProfile}
                                    onChange={(e) => handleSelectAvailableProfile(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                >
                                    <option value="">Select a profile from GoLogin...</option>
                                    {availableProfiles.map((p) => (
                                        <option key={p.id} value={p.id} disabled={p.alreadyAdded || p.addedToOtherKey}>
                                            {p.name} ({p.browserType || 'Unknown browser'}) {p.alreadyAdded ? '(Already Added)' : p.addedToOtherKey ? '(Added to other key)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-blue-700">
                                    Found {availableProfiles.length} profile(s) in GoLogin
                                    {notAddedProfiles.length > 0 && `, ${notAddedProfiles.length} available to add`}
                                    {availableProfiles.length - notAddedProfiles.length > 0 && `, ${availableProfiles.length - notAddedProfiles.length} already added`}
                                </p>
                                {availableProfiles.length > 0 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Can't find your profile? Check the browser console for full API response, or enter the Profile ID manually below.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <form onSubmit={handleAddProfile} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                GoLogin Profile ID *
                            </label>
                            <input
                                type="text"
                                value={newProfile.profile_id}
                                onChange={(e) => {
                                    setNewProfile({ ...newProfile, profile_id: e.target.value });
                                    // Clear selection if manually edited
                                    if (selectedAvailableProfile && e.target.value !== selectedAvailableProfile) {
                                        setSelectedAvailableProfile('');
                                    }
                                }}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Select from dropdown above or enter manually"
                                required
                            />
                            {selectedAvailableProfile && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Auto-filled from selection. You can edit this if needed.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Display Name *
                            </label>
                            <input
                                type="text"
                                value={newProfile.name}
                                onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., Client A - Apollo Account"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Description (optional)
                            </label>
                            <textarea
                                value={newProfile.description}
                                onChange={(e) => setNewProfile({ ...newProfile, description: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                rows={2}
                                placeholder="Notes about this profile..."
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={submitting || !newProfile.profile_id}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {submitting ? 'Adding...' : 'Add Profile'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setNewProfile({ profile_id: '', name: '', description: '', api_key_id: '' });
                                    setSelectedAvailableProfile('');
                                }}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Edit Profile Modal */}
            {editingProfile && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h2 className="font-semibold mb-4">Edit Profile</h2>
                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    GoLogin Profile ID
                                </label>
                                <input
                                    type="text"
                                    value={editingProfile.profile_id}
                                    disabled
                                    className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-gray-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={editingProfile.name}
                                    onChange={(e) => setEditingProfile({ ...editingProfile, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    value={editingProfile.description || ''}
                                    onChange={(e) => setEditingProfile({ ...editingProfile, description: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    rows={2}
                                />
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={editingProfile.is_active}
                                    onChange={(e) => setEditingProfile({ ...editingProfile, is_active: e.target.checked })}
                                    className="mr-2"
                                />
                                <label htmlFor="is_active" className="text-sm text-gray-700">
                                    Active
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {submitting ? 'Saving...' : 'Save Changes'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingProfile(null)}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Filter by API Key */}
            {apiKeys.length > 1 && (
                <div className="mb-4 flex items-center gap-4">
                    <label className="text-sm text-gray-600">Filter by API Key:</label>
                    <select
                        value={filterApiKeyId}
                        onChange={(e) => setFilterApiKeyId(e.target.value)}
                        className="px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">All API Keys</option>
                        {apiKeys.map((k) => (
                            <option key={k.id} value={k.id}>
                                {k.name} {!k.is_active ? '(Inactive)' : ''}
                            </option>
                        ))}
                        <option value="none">No API Key Assigned</option>
                    </select>
                </div>
            )}

            {/* Profiles List */}
            {profiles.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
                    <p className="text-gray-500">No GoLogin profiles configured yet.</p>
                    <button
                        onClick={handleShowAddForm}
                        className="text-blue-600 hover:underline mt-2"
                    >
                        Add your first profile
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {profiles
                        .filter(p => {
                            if (!filterApiKeyId) return true;
                            if (filterApiKeyId === 'none') return !p.api_key_id;
                            return p.api_key_id === filterApiKeyId;
                        })
                        .map((profile) => (
                        <div
                            key={profile.id}
                            className={`bg-white rounded-lg shadow-sm border p-6 ${!profile.is_active ? 'opacity-60' : ''}`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-lg">{profile.name}</h3>
                                        {!profile.is_active && (
                                            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                                Inactive
                                            </span>
                                        )}
                                        {profile.api_key_name && (
                                            <span className={`px-2 py-0.5 text-xs rounded ${profile.api_key_active ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {profile.api_key_name}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1 font-mono">
                                        {profile.profile_id}
                                    </p>
                                    {profile.description && (
                                        <p className="text-sm text-gray-600 mt-2">{profile.description}</p>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditingProfile(profile)}
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        Edit
                                    </button>
                                    {profile.is_active && (
                                        <button
                                            onClick={() => handleDeleteProfile(profile.id)}
                                            className="text-sm text-red-600 hover:underline"
                                        >
                                            Deactivate
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Assignments */}
                            <div className="mt-4 pt-4 border-t">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium text-gray-700">
                                        Assigned Users ({profile.assignments.length})
                                    </h4>
                                    {profile.is_active && (
                                        <button
                                            onClick={() => setAssigningProfile(profile.id)}
                                            className="text-sm text-blue-600 hover:underline"
                                        >
                                            + Assign User
                                        </button>
                                    )}
                                </div>

                                {assigningProfile === profile.id && (
                                    <div className="bg-gray-50 p-3 rounded-lg mb-3 flex items-center gap-2">
                                        <select
                                            value={selectedUserId}
                                            onChange={(e) => setSelectedUserId(e.target.value)}
                                            className="flex-1 px-3 py-2 border rounded-lg text-sm"
                                        >
                                            <option value="">Select a user...</option>
                                            {users
                                                .filter(u => !profile.assignments.some(a => a.user_id === u.id))
                                                .map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.email}
                                                    </option>
                                                ))}
                                        </select>
                                        <button
                                            onClick={() => handleAssignProfile(profile.id)}
                                            disabled={!selectedUserId || submitting}
                                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            Assign
                                        </button>
                                        <button
                                            onClick={() => {
                                                setAssigningProfile(null);
                                                setSelectedUserId('');
                                            }}
                                            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-100"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}

                                {profile.assignments.length === 0 ? (
                                    <p className="text-sm text-gray-500">No users assigned</p>
                                ) : (
                                    <div className="space-y-2">
                                        {profile.assignments.map((assignment) => (
                                            <div
                                                key={assignment.user_id}
                                                className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg"
                                            >
                                                <div>
                                                    <span className="text-sm font-medium">
                                                        {getUserEmail(assignment.user_id)}
                                                    </span>
                                                    <span className="text-xs text-gray-500 ml-2">
                                                        Assigned {new Date(assignment.assigned_at).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => handleUnassignProfile(assignment.user_id)}
                                                    className="text-xs text-red-600 hover:underline"
                                                >
                                                    Unassign
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Info Box */}
            <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">How it works</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Click "Add Profile" to see available profiles from your GoLogin account</li>
                    <li>• Select a profile from the dropdown - ID and name are auto-filled</li>
                    <li>• Assign profiles to users - each user gets one profile for their scrapes</li>
                    <li>• Make sure the profile is running in GoLogin Cloud before scraping</li>
                </ul>
            </div>
        </div>
    );
}
