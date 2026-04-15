const OM_URL = () => process.env.OPENMETADATA_URL || "";

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 300000) return cachedToken;
  const url = OM_URL();
  if (!url) return "";
  try {
    const res = await fetch(`${url}/api/v1/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@open-metadata.org", password: Buffer.from("admin").toString("base64") }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    cachedToken = data.accessToken || "";
    tokenExpiry = Date.now() + (data.expiryDuration || 86400) * 1000;
    return cachedToken;
  } catch { return ""; }
}

export async function omRequest(method: string, path: string, body?: any): Promise<any> {
  const url = OM_URL();
  if (!url) return null;
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      cachedToken = null;
      const retryToken = await getToken();
      if (!retryToken) return null;
      const retry = await fetch(`${url}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${retryToken}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      return retry.ok || retry.status === 409 ? retry.json().catch(() => null) : null;
    }
    return res.ok || res.status === 409 ? res.json().catch(() => null) : null;
  } catch { return null; }
}

export async function getEntityByName(entityType: string, fqn: string): Promise<any> {
  return omRequest("GET", `/api/v1/${entityType}/name/${encodeURIComponent(fqn)}`);
}
