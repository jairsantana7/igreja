export interface SessionUser {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface Session {
  sessionProof: string;
  user: SessionUser;
}

const STORAGE_KEY = 'community.browser-session';

export function useAuth() {
  const session = useState<Session | null>('session', () => null);

  function setSession(value: Session) {
    session.value = value;
    if (import.meta.client) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function hydrate() {
    if (!import.meta.client || session.value) return;
    localStorage.removeItem('igreja.session');
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      session.value = JSON.parse(stored) as Session;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function logout() {
    session.value = null;
    if (import.meta.client) {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('igreja.session');
    }
  }

  return { session, setSession, hydrate, logout };
}
