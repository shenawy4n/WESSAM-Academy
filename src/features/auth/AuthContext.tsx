/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase/client';
import { UserProfile, UserRole, StudentAcademicProfile, AuthSession } from '../../types/auth';

interface AuthContextType {
  session: AuthSession;
  user: UserProfile | null;
  studentProfile: StudentAcademicProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  isConfigured: boolean;
  error: string | null;
  loginTeacher: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  loginStudent: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  // For administrative view testing / switching in dev or when verifying Phase 1 screens
  setActiveTestRole?: (role: UserRole | null) => void;
}

export const ENABLE_PREVIEW_ROLES =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_PREVIEW_ROLES === 'true';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isConfigured = isSupabaseConfigured();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentAcademicProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (userId: string, userEmail?: string) => {
    if (!supabase) return;
    try {
      setError(null);
      const { data, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileErr) {
        console.error('Error fetching profile:', profileErr.message);
        setError(profileErr.message || 'Failed to load user profile.');
        return;
      }

      if (data) {
        if (data.status !== 'active') {
          // Account suspended or inactive - terminate session
          console.warn('User account is inactive or suspended:', data.status);
          await supabase.auth.signOut();
          setUser(null);
          setStudentProfile(null);
          setError('This account has been suspended or deactivated. Contact academy administration.');
          return;
        }

        setUser({
          id: data.id,
          role: data.role as UserRole,
          fullName: data.full_name || 'Mr. Wessam Ibrahim Draz',
          fullNameArabic: data.full_name_arabic || 'أ. وسام إبراهيم دراز',
          email: data.email || userEmail,
          phone: data.phone,
          avatarUrl: data.avatar_url,
          status: data.status,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });

        if (data.role === 'student') {
          const { data: studentData, error: studentErr } = await supabase
            .from('student_academic_profiles')
            .select('*, groups(name, name_arabic)')
            .eq('profile_id', userId)
            .maybeSingle();

          if (studentErr) {
            console.error('Error fetching student academic profile:', studentErr.message);
            setError(studentErr.message || 'Failed to load student academic profile.');
          } else if (studentData) {
            setStudentProfile({
              id: studentData.id,
              profileId: studentData.profile_id,
              studentNumber: studentData.student_number,
              username: studentData.username,
              groupId: studentData.group_id,
              groupName: studentData.groups?.name_arabic || studentData.groups?.name,
              enrolledAt: studentData.enrolled_at,
              status: studentData.status,
              notes: studentData.notes,
            });
          } else {
            setStudentProfile(null);
          }
        } else {
          setStudentProfile(null);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load profile.';
      console.error('Failed to load profile:', err);
      setError(msg);
    }
  }, []);

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;
    let isMounted = true;

    // Restore existing session
    const restoreSession = async () => {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (session?.user && isMounted) {
          await fetchProfile(session.user.id, session.user.email);
        }
      } catch (err) {
        console.error('Session restoration error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.email);
      } else {
        setUser(null);
        setStudentProfile(null);
      }
      if (isMounted) {
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isConfigured, fetchProfile]);

  const loginTeacher = async (email: string, password: string) => {
    setError(null);
    if (!isConfigured || !supabase) {
      return { success: false, error: 'Supabase configuration required.' };
    }
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return { success: false, error: authError.message };
      }

      if (data.user) {
        await fetchProfile(data.user.id, data.user.email);
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown authentication error';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const loginStudent = async (username: string, password: string) => {
    setError(null);
    if (!isConfigured || !supabase) {
      return { success: false, error: 'Supabase configuration required.' };
    }

    try {
      // Execute the student-login Edge Function
      const { data, error: functionError } = await supabase.functions.invoke('student-login', {
        body: { username, password },
      });

      if (functionError) {
        setError(functionError.message);
        return { success: false, error: functionError.message };
      }

      if (data?.session) {
        await supabase.auth.setSession(data.session);
        return { success: true };
      }

      return { success: false, error: 'Invalid response from authentication service.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reach student authentication service';
      setError(msg);
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setStudentProfile(null);
  };

  const setActiveTestRole = (newRole: UserRole | null) => {
    if (!ENABLE_PREVIEW_ROLES) {
      console.warn('Test role impersonation is disabled in this environment.');
      return;
    }

    if (!newRole) {
      setUser(null);
      setStudentProfile(null);
      return;
    }

    if (newRole === 'super_admin') {
      setUser({
        id: 'super-admin-uid',
        role: 'super_admin',
        fullName: 'Mr. Wessam Ibrahim Draz',
        fullNameArabic: 'أ. وسام إبراهيم دراز',
        email: 'shenawyjr@gmail.com',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setStudentProfile(null);
    } else if (newRole === 'teacher') {
      setUser({
        id: 'mock-teacher-id',
        role: 'teacher',
        fullName: 'Mr. Wessam Ibrahim Draz',
        fullNameArabic: 'أ. وسام إبراهيم دراز',
        email: 'teacher@wessam-academy.edu.sa',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setStudentProfile(null);
    } else if (newRole === 'student') {
      setUser({
        id: 'mock-student-id',
        role: 'student',
        fullName: 'Omar Khalid Al-Otaibi',
        fullNameArabic: 'عمر خالد العتيبي',
        email: 'omar@student.wessam-academy.edu.sa',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setStudentProfile({
        id: 'mock-academic-id',
        profileId: 'mock-student-id',
        username: 'omar.khalid',
        studentNumber: 'WES-2026-1042',
        groupId: 'grp-secondary-3',
        groupName: 'المستوى الثانوي المتقدم — قاعة 3',
        enrolledAt: new Date().toISOString(),
        status: 'active',
      });
    }
  };

  const session: AuthSession = {
    user,
    studentAcademicProfile: studentProfile,
    isLoading,
    error,
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        studentProfile,
        role: user?.role || null,
        isLoading,
        isConfigured,
        error,
        loginTeacher,
        loginStudent,
        logout,
        setActiveTestRole: ENABLE_PREVIEW_ROLES ? setActiveTestRole : undefined,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
