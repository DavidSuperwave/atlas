'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';

interface CreditOrder {
    id: string;
    user_id: string;
    email: string;
    credits_amount: number;
    plan_name: string | null;
    status: 'pending' | 'completed' | 'cancelled';
    created_at: string;
    completed_at: string | null;
    completed_by: string | null;
}

export default function CreditOrdersPage() {
    const { user, loading: authLoading } = useAuth();
    const [orders, setOrders] = useState<CreditOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<string>('pending');
    const [processingOrder, setProcessingOrder] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const fetchOrders = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/credit-orders?status=${filter}`);
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Access denied. Admin privileges required.');
                } else {
                    setError('Failed to fetch orders');
                }
                return;
            }
            const data = await res.json();
            setOrders(data.orders || []);
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        if (!authLoading && user) {
            fetchOrders();
        }
    }, [user, authLoading, fetchOrders]);

    async function handleAction(order: CreditOrder, action: 'approve' | 'cancel') {
        setProcessingOrder(order.id);
        setActionMessage(null);

        try {
            const res = await fetch('/api/admin/credit-orders', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orderId: order.id,
                    action,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setActionMessage({ type: 'error', text: data.error || `Failed to ${action} order` });
                return;
            }

            setActionMessage({ type: 'success', text: data.message });
            fetchOrders();
        } catch (err) {
            setActionMessage({ type: 'error', text: `Failed to ${action} order` });
        } finally {
            setProcessingOrder(null);
        }
    }

    function formatDate(dateString: string) {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function getStatusColor(status: string) {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-700 border-green-200';
            case 'cancelled':
                return 'bg-red-100 text-red-700 border-red-200';
            default:
                return 'bg-amber-100 text-amber-700 border-amber-200';
        }
    }

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <Link href="/admin" className="text-blue-600 hover:text-blue-700">
                        Back to Admin
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                            <Link href="/admin" className="hover:text-gray-700">Admin</Link>
                            <span>/</span>
                            <span>Credit Orders</span>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">Credit Orders</h1>
                        <p className="text-gray-600 mt-1">Review and approve credit purchase requests</p>
                    </div>
                </div>

                {/* Action Message */}
                {actionMessage && (
                    <div className={`mb-6 p-4 rounded-lg border ${
                        actionMessage.type === 'success' 
                            ? 'bg-green-50 border-green-200 text-green-700' 
                            : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                        {actionMessage.text}
                    </div>
                )}

                {/* Filters */}
                <div className="flex gap-2 mb-6">
                    {['all', 'pending', 'completed', 'cancelled'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filter === status
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Orders List */}
                <div className="space-y-4">
                    {orders.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
                            No {filter === 'all' ? '' : filter} orders found
                        </div>
                    ) : (
                        orders.map((order) => (
                            <div
                                key={order.id}
                                className="bg-white rounded-xl border border-gray-200 p-6"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold text-gray-900">
                                                {order.email}
                                            </h3>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                            <div className="bg-gray-50 rounded-lg p-3">
                                                <p className="text-xs text-gray-500 mb-1">Plan</p>
                                                <p className="font-semibold text-gray-900">{order.plan_name || 'Custom'}</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-3">
                                                <p className="text-xs text-gray-500 mb-1">Credits Requested</p>
                                                <p className="font-semibold text-gray-900">{order.credits_amount.toLocaleString()}</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-3">
                                                <p className="text-xs text-gray-500 mb-1">Submitted</p>
                                                <p className="font-semibold text-gray-900">{formatDate(order.created_at)}</p>
                                            </div>
                                        </div>

                                        {order.completed_at && (
                                            <p className="text-xs text-gray-400 mt-3">
                                                {order.status === 'completed' ? 'Approved' : 'Cancelled'} on {formatDate(order.completed_at)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    {order.status === 'pending' && (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleAction(order, 'approve')}
                                                disabled={processingOrder === order.id}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {processingOrder === order.id ? 'Processing...' : 'Approve'}
                                            </button>
                                            <button
                                                onClick={() => handleAction(order, 'cancel')}
                                                disabled={processingOrder === order.id}
                                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

