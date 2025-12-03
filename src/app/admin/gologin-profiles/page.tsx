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
    created_at: string;
    updated_at: string;
    assignments: {
        user_id: string;
        assigned_at: string;
        assigned_by: string | null;
    }[];
}

interface User {
    id: string;
    email: string;
}

export default function GoLoginProfilesPage() {
    const { user, loading: authLoading } = useAuth();
    const [profiles, setProfiles] = useState<GoLoginProfile[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [showAddForm, setShowAddForm] = useState(false);
    const [newProfile, setNewProfile] = useState({ profile_id: '', name: '', description: '' });
    const [editingProfile, setEditingProfile] = useState<GoLoginProfile | null>(null);
    const [submitting, setSubmitting] = useState(false);

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
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
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
                body: JSON.stringify(newProfile),
            });

            const data = await res.json();
            if (res.ok) {
                setNewProfile({ profile_id: '', name: '', description: '' });
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
        const user = users.find(u => u.id === userId);
        return user?.email || userId.slice(0, 8) + '...';
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
                    onClick={() => setShowAddForm(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    + Add Profile
                </button>
            </div>

            {/* Add Profile Form */}
            {showAddForm && (
                <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
                    <h2 className="font-semibold mb-4">Add New Profile</h2>
                    <form onSubmit={handleAddProfile} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                GoLogin Profile ID *
                            </label>
                            <input
                                type="text"
                                value={newProfile.profile_id}
                                onChange={(e) => setNewProfile({ ...newProfile, profile_id: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., abc123-def456-..."
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Find this in your GoLogin dashboard URL when viewing the profile
                            </p>
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
                                disabled={submitting}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {submitting ? 'Adding...' : 'Add Profile'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setNewProfile({ profile_id: '', name: '', description: '' });
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

            {/* Profiles List */}
            {profiles.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
                    <p className="text-gray-500">No GoLogin profiles configured yet.</p>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="text-blue-600 hover:underline mt-2"
                    >
                        Add your first profile
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {profiles.map((profile) => (
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
                    <li>• Each GoLogin profile should have Apollo logged in and a proxy configured</li>
                    <li>• Assign profiles to users - each user gets one profile for their scrapes</li>
                    <li>• Users without an assignment will use the default profile from env vars</li>
                    <li>• Deactivating a profile will cause assigned users to fall back to the default</li>
                </ul>
            </div>
        </div>
    );
}

