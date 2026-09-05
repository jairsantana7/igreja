export interface SessionUser {
  userId: string;
  tenantId: string;
  name: string;
  email: string;
  roles: string[];
  permissions: string[];
}

interface Session {
  accessToken: string;
  user: SessionUser;
}

export function useAuth() {
  const session = useState<Session | null>('session', () => null);

  function setSession(value: Session) {
    session.value = value;
    if (import.meta.client) localStorage.setItem('igreja.session', JSON.stringify(value));
  }

  function hydrate() {
    if (!import.meta.client || session.value) return;
    const stored = localStorage.getItem('igreja.session');
    if (!stored) return;
    try {
      session.value = JSON.parse(stored) as Session;
    } catch {
      localStorage.removeItem('igreja.session');
    }
  }

  function logout() {
    session.value = null;
    if (import.meta.client) localStorage.removeItem('igreja.session');
  }

  return { session, setSession, hydrate, logout };
}
