export async function apiGet(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api${path}${query ? `?${query}` : ""}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Request failed with status ${res.status}`);
  return data;
}

export async function apiPost(path, body) {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Request failed with status ${res.status}`);
  return data;
}
