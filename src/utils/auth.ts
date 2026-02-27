import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export interface SignupData {
  email: string;
  password: string;
  name: string;
  role?: 'parent' | 'child';
}

export interface SignupResponse {
  user: {
    id: string;
    email: string;
    user_metadata: {
      name: string;
      role: string;
    };
  };
  success: boolean;
}

export async function signup(data: SignupData): Promise<SignupResponse> {
  const url = `${API_BASE}/auth/signup`;
  console.log('Calling signup API:', {
    url,
    projectId,
    hasAnonKey: !!publicAnonKey,
    anonKeyStart: publicAnonKey ? publicAnonKey.substring(0, 20) + '...' : 'missing',
    data: { email: data.email, name: data.name, role: data.role }
  });
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`, // Required for Supabase Edge Functions
      },
      body: JSON.stringify(data),
    });

    console.log('Signup API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Signup failed - Response:', { status: response.status, body: errorText });
      
      let errorObj;
      try {
        errorObj = JSON.parse(errorText);
      } catch (e) {
        errorObj = { error: errorText || 'Signup failed' };
      }
      
      throw new Error(errorObj.error || errorObj.message || `Signup failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('Signup successful:', { userId: result.user?.id });
    return result;
  } catch (error) {
    console.error('Signup fetch error:', error);
    throw error;
  }
}

export async function login(email: string, password: string) {
  console.log('🔐 Attempting login for:', email);
  
  // Use Supabase client directly for login
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('❌ Login error:', error);
    throw new Error(error.message);
  }

  console.log('✅ Login successful:', {
    userId: data.user?.id,
    email: data.user?.email,
    hasSession: !!data.session,
    hasAccessToken: !!data.session?.access_token,
    accessTokenLength: data.session?.access_token?.length,
    accessTokenPreview: data.session?.access_token ? 
      `${data.session.access_token.substring(0, 30)}...${data.session.access_token.substring(data.session.access_token.length - 20)}` : 
      'none',
    expiresAt: data.session?.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : 'N/A'
  });

  // Store user role as 'parent' for parent logins
  localStorage.setItem('user_role', 'parent');
  console.log('✅ Set user_role to parent in localStorage');

  // Verify session was stored
  setTimeout(async () => {
    const { data: { session: storedSession } } = await supabase.auth.getSession();
    console.log('📦 Session storage check:', {
      hasStoredSession: !!storedSession,
      storedUserId: storedSession?.user?.id,
      tokensMatch: storedSession?.access_token === data.session?.access_token
    });
  }, 100);

  return {
    user: data.user,
    session: data.session,
    accessToken: data.session?.access_token,
  };
}

export async function logout() {
  await supabase.auth.signOut();
  
  // Clear local storage
  localStorage.removeItem('fgs_access_token');
  localStorage.removeItem('fgs_user_id');
  localStorage.removeItem('fgs_family_id');
  localStorage.removeItem('fgs_user_mode');
}