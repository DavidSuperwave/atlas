'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface GoLoginApiKey {
    id: string;
    name: string;
    is_active: boolean;
    is_default: boolean;
    max_concurrent_scrapes: number;
    created_at: string;
    updated_at: string;
    profile_count?: number;
    active_sessions?: number;
}

export default function GoLoginApiKeysPage() {
    const { user, loading: authLoading } = useAuth();
    const [apiKeys, setApiKeys] = useState<GoLoginApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [showAddForm, setShowAddForm] = useState(false);
    const [newKey, setNewKey] = useState({ name: '', api_token: '', is_default: false });
    const [editingKey, setEditingKey] = useState<GoLoginApiKey | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!authLoading && user) {
            fetchApiKeys();
        }
    }, [user, authLoading]);

    async function fetchApiKeys() {
        try {
            const res = await fetch('/api/admin/gologin-api-keys');
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Admin access required');
                } else {
                    setError('Failed to fetch API keys');
                }
                setLoading(false);
                return;
            }

            const data = await res.json();
            setApiKeys(data.apiKeys || []);
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddKey(e: React.FormEvent) {
        e.preventDefault();
        if (!newKey.name || !newKey.api_token) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/gologin-api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newKey),
            });

            const data = await res.json();
            if (res.ok) {
                setNewKey({ name: '', api_token: '', is_default: false });
                setShowAddForm(false);
                fetchApiKeys();
            } else {
                alert(data.error || 'Failed to add API key');
            }
        } catch (err) {
            alert('Error adding API key');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleUpdateKey(e: React.FormEvent) {
        e.preventDefault();
        if (!editingKey) return;

        setSubmitting(true);
        try {
            const res = await fetch('/api/admin/gologin-api-keys', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingKey.id,
                    name: editingKey.name,
                    is_active: editingKey.is_active,
                    is_default: editingKey.is_default,
                    max_concurrent_scrapes: editingKey.max_concurrent_scrapes,
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setEditingKey(null);
                fetchApiKeys();
            } else {
                alert(data.error || 'Failed to update API key');
            }
        } catch (err) {
            alert('Error updating API key');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDeactivateKey(keyId: string) {
        if (!confirm('Are you sure you want to deactivate this API key? Profiles using this key will no longer work.')) return;

        try {
            const res = await fetch('/api/admin/gologin-api-keys', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: keyId }),
            });

            if (res.ok) {
                fetchApiKeys();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to deactivate API key');
            }
        } catch (err) {
            alert('Error deactivating API key');
            console.error(err);
        }
    }

    async function handleSetDefault(keyId: string) {
        try {
            const res = await fetch('/api/admin/gologin-api-keys', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: keyId, is_default: true }),
            });

            if (res.ok) {
                fetchApiKeys();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to set as default');
            }
        } catch (err) {
            alert('Error setting default');
            console.error(err);
        }
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
                    Back to Admin
                </Link>
            </div>
        );
    }

    const activeKeys = apiKeys.filter(k => k.is_active);
    const inactiveKeys = apiKeys.filter(k => !k.is_active);

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-700 mb-2 block">
                        Back to Admin
                    </Link>
                    <h1 className="text-2xl font-bold">GoLogin API Keys</h1>
                    <p className="text-gray-600 mt-1">
                        Manage API keys for horizontal scaling. Each key can run scrapes in parallel.
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    + Add API Key
                </button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow-sm border p-4">
                    <div className="text-2xl font-bold text-green-600">{activeKeys.length}</div>
                    <div className="text-sm text-gray-600">Active API Keys</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-4">
                    <div className="text-2xl font-bold text-blue-600">
                        {activeKeys.reduce((sum, k) => sum + (k.profile_count || 0), 0)}
                    </div>
                    <div className="text-sm text-gray-600">Total Profiles</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border p-4">
                    <div className="text-2xl font-bold text-purple-600">
                        {activeKeys.reduce((sum, k) => sum + (k.active_sessions || 0), 0)}
                    </div>
                    <div className="text-sm text-gray-600">Active Sessions</div>
                </div>
            </div>

            {/* Add Key Form */}
            {showAddForm && (
                <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
                    <h2 className="font-semibold mb-4">Add GoLogin API Key</h2>
                    <form onSubmit={handleAddKey} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Key Name *
                            </label>
                            <input
                                type="text"
                                value={newKey.name}
                                onChange={(e) => setNewKey({ ...newKey, name: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="e.g., Production Key 1"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                API Token *
                            </label>
                            <input
                                type="password"
                                value={newKey.api_token}
                                onChange={(e) => setNewKey({ ...newKey, api_token: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                placeholder="Paste your GoLogin API token"
                                required
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                Get from GoLogin: Settings &rarr; API
                            </p>
                        </div>
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="is_default"
                                checked={newKey.is_default}
                                onChange={(e) => setNewKey({ ...newKey, is_default: e.target.checked })}
                                className="mr-2"
                            />
                            <label htmlFor="is_default" className="text-sm text-gray-700">
                                Set as default key
                            </label>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={submitting || !newKey.name || !newKey.api_token}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {submitting ? 'Adding...' : 'Add API Key'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAddForm(false);
                                    setNewKey({ name: '', api_token: '', is_default: false });
                                }}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Edit Key Modal */}
            {editingKey && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
                        <h2 className="font-semibold mb-4">Edit API Key</h2>
                        <form onSubmit={handleUpdateKey} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Key Name
                                </label>
                                <input
                                    type="text"
                                    value={editingKey.name}
                                    onChange={(e) => setEditingKey({ ...editingKey, name: e.target.value })}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    required
                                />
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="edit_is_active"
                                    checked={editingKey.is_active}
                                    onChange={(e) => setEditingKey({ ...editingKey, is_active: e.target.checked })}
                                    className="mr-2"
                                />
                                <label htmlFor="edit_is_active" className="text-sm text-gray-700">
                                    Active
                                </label>
                            </div>
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="edit_is_default"
                                    checked={editingKey.is_default}
                                    onChange={(e) => setEditingKey({ ...editingKey, is_default: e.target.checked })}
                                    className="mr-2"
                                />
                                <label htmlFor="edit_is_default" className="text-sm text-gray-700">
                                    Default Key
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
                                    onClick={() => setEditingKey(null)}
                                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* API Keys List */}
            {activeKeys.length === 0 && inactiveKeys.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
                    <p className="text-gray-500">No API keys configured yet.</p>
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="text-blue-600 hover:underline mt-2"
                    >
                        Add your first API key
                    </button>
                </div>
            ) : (
                <div className="space-y-4">
                    {activeKeys.map((apiKey) => (
                        <div
                            key={apiKey.id}
                            className="bg-white rounded-lg shadow-sm border p-6"
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-lg">{apiKey.name}</h3>
                                        {apiKey.is_default && (
                                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                                Default
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                                            Active
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1 font-mono">
                                        ID: {apiKey.id.slice(0, 8)}...
                                    </p>
                                    <div className="mt-3 flex gap-6 text-sm">
                                        <div>
                                            <span className="text-gray-500">Profiles:</span>{' '}
                                            <span className="font-medium">{apiKey.profile_count || 0}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Active Sessions:</span>{' '}
                                            <span className="font-medium">{apiKey.active_sessions || 0}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Added:</span>{' '}
                                            <span className="font-medium">
                                                {new Date(apiKey.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Link
                                        href={`/admin/gologin-profiles?apiKeyId=${apiKey.id}`}
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        View Profiles
                                    </Link>
                                    <button
                                        onClick={() => setEditingKey(apiKey)}
                                        className="text-sm text-blue-600 hover:underline"
                                    >
                                        Edit
                                    </button>
                                    {!apiKey.is_default && (
                                        <button
                                            onClick={() => handleSetDefault(apiKey.id)}
                                            className="text-sm text-green-600 hover:underline"
                                        >
                                            Set Default
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeactivateKey(apiKey.id)}
                                        className="text-sm text-red-600 hover:underline"
                                    >
                                        Deactivate
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Inactive Keys */}
                    {inactiveKeys.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-lg font-semibold text-gray-600 mb-3">Inactive Keys</h3>
                            {inactiveKeys.map((apiKey) => (
                                <div
                                    key={apiKey.id}
                                    className="bg-white rounded-lg shadow-sm border p-6 opacity-60"
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="font-semibold">{apiKey.name}</h3>
                                            <p className="text-sm text-gray-500">
                                                Deactivated
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => setEditingKey(apiKey)}
                                            className="text-sm text-blue-600 hover:underline"
                                        >
                                            Reactivate
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Info Box */}
            <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">How Multi-Key Scaling Works</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>&bull; Each API key represents a separate GoLogin account</li>
                    <li>&bull; Profiles are linked to their parent API key</li>
                    <li>&bull; Each API key can run one scrape at a time</li>
                    <li>&bull; With 3 API keys, you can run 3 scrapes in parallel</li>
                    <li>&bull; The default key is used when no specific key is assigned</li>
                </ul>
            </div>
        </div>
    );
}
