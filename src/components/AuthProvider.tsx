'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { getCurrentUser, onAuthStateChange, getSupabaseClient } from '@/lib/supabase-client';

export interface UserProfile {
    id: string;
    email: string;
    name: string | null;
    account_type: 'full' | 'scrape_only';
    is_admin: boolean;
    is_approved: boolean;
    credits_balance: number;
    onboarding_completed: boolean;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    refreshProfile: () => Promise<void>;
    isScrapeOnlyUser: boolean;
    isFullAppUser: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    refreshProfile: async () => {},
    isScrapeOnlyUser: false,
    isFullAppUser: false,
});

export function useAuth() {
    return useContext(AuthContext);
}

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = useCallback(async (userId: string) => {
        try {
            const supabase = getSupabaseClient();
            const { data, error } = await supabase
                .from('user_profiles')
                .select('id, email, name, account_type, is_admin, is_approved, credits_balance, onboarding_completed')
                .eq('id', userId)
                .single();
            
            if (error) {
                console.error('Error fetching profile:', error);
                return null;
            }
            
            return data as UserProfile;
        } catch (err) {
            console.error('Error fetching profile:', err);
            return null;
        }
    }, []);

    const refreshProfile = useCallback(async () => {
        if (user?.id) {
            const updatedProfile = await fetchProfile(user.id);
            if (updatedProfile) {
                setProfile(updatedProfile);
            }
        }
    }, [user?.id, fetchProfile]);

    useEffect(() => {
        // Get initial user and profile
        async function init() {
            const currentUser = await getCurrentUser();
            setUser(currentUser);
            
            if (currentUser?.id) {
                const userProfile = await fetchProfile(currentUser.id);
                setProfile(userProfile);
            }
            
            setLoading(false);
        }
        
        init();

        // Subscribe to auth changes
        const subscription = onAuthStateChange(async (newUser) => {
            setUser(newUser);
            
            if (newUser?.id) {
                const userProfile = await fetchProfile(newUser.id);
                setProfile(userProfile);
            } else {
                setProfile(null);
            }
            
            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [fetchProfile]);

    const isScrapeOnlyUser = profile?.account_type === 'scrape_only';
    const isFullAppUser = profile?.account_type === 'full' || !profile?.account_type;

    return (
        <AuthContext.Provider value={{ 
            user, 
            profile, 
            loading, 
            refreshProfile,
            isScrapeOnlyUser,
            isFullAppUser,
        }}>
            {children}
        </AuthContext.Provider>
    );
}


