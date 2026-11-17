let accessTokenMemory: string | null = null;
let csrfTokenMemory: string | null = null;

export function setTokens(accessToken: string | null, csrfToken?: string | null) {
  accessTokenMemory = accessToken;
  if (csrfToken !== undefined) {
    csrfTokenMemory = csrfToken;
  }
}

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

function getCookieValue(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function refreshSession(): Promise<{
  accessToken: string;
  csrfToken: string;
  user: Record<string, unknown>;
} | null> {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    accessTokenMemory = null;
    return null;
  }
  const data = await res.json();
  accessTokenMemory = data.accessToken;
  csrfTokenMemory = data.csrfToken || getCookieValue('csrf_token');
  return data;
}

export async function api<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const makeRequest = async () => {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (accessTokenMemory) {
      headers.set('Authorization', `Bearer ${accessTokenMemory}`);
    }
    const csrf = csrfTokenMemory || getCookieValue('csrf_token');
    if (csrf) {
      headers.set('x-csrf-token', csrf);
    }

    return fetch(`/api${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  };

  let res = await makeRequest();

  // Attempt transparent refresh once on 401
  if (res.status === 401 && !endpoint.startsWith('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await makeRequest();
    }
  }

  if (!res.ok) {
    let errMsg = `Request failed (${res.status})`;
    try {
      const errData = await res.json();
      errMsg = errData.error || errMsg;
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<T>;
}
