let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error("Cannot reach Relay. Check your connection and try again.");
  });
  const data = await res.json().catch(() => {
    if (res.status === 429)
      throw new Error(
        "Too many attempts. Please wait a few minutes and try again.",
      );
    throw new Error("Relay returned an unexpected response. Please try again.");
  });
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export async function uploadMedia(
  file: File,
): Promise<{ id: string; mime: string; size: number }> {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("Choose a file smaller than 25 MB.");
  const res = await fetch("/api/media", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-CSRF-Token": csrf,
    },
    body: file,
  });
  const data = await res.json().catch(() => {
    throw new Error("Upload failed. Check the file size and try again.");
  });
  if (!res.ok) throw new Error(data.error || "Upload failed.");
  return data;
}
