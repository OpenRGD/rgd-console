export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { method: 'GET', cache: 'no-store', signal });
  if (!response.ok) throw new Error(`API ${response.status}: ${path}`);
  return response.json() as Promise<T>;
}

export function streamUrl(robotId: string): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/api/v1/stream?robot_id=${encodeURIComponent(robotId)}`;
}


/** Profile/registry mutations only. Never use for motor or runtime commands. */
export async function apiWrite<T>(path: string, data: object | FormData): Promise<T> {
  const form = data instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'X-OpenRGD-Console': 'onboarding.v1', ...(form ? {} : { 'Content-Type': 'application/json' }) },
    body: form ? data : JSON.stringify(data),
  });
  if (!response.ok) {
    let reason = `Richiesta non riuscita (${response.status})`;
    try { const value = await response.json() as { message?: string }; if (value.message) reason = value.message; } catch { /* server offline */ }
    throw new Error(reason);
  }
  return response.json() as Promise<T>;
}
