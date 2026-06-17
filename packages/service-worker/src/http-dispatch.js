export function parsePreviewUrl(url) {
  const parsed = typeof url === "string" ? new URL(url, "https://run.welford.local") : url;
  const match = parsed.pathname.match(/^\/p\/([^/]+)(\/.*)?$/);
  if (!match) return null;
  const [projectPart, explicitPort] = match[1].split(":");
  return {
    projectId: decodeURIComponent(projectPart),
    port: explicitPort ? Number(explicitPort) : undefined,
    path: match[2] || "/",
    search: parsed.search
  };
}

export async function dispatchPreviewRequest({ kernel, request, defaultPort }) {
  const url = new URL(request.url, "https://run.welford.local");
  const preview = parsePreviewUrl(url);
  if (!preview) return null;

  const headers = [...request.headers.entries()];
  const body = request.arrayBuffer ? new Uint8Array(await request.arrayBuffer()) : undefined;
  return kernel.dispatchHttpRequest({
    id: crypto.randomUUID?.() ?? Math.random().toString(16).slice(2),
    projectId: preview.projectId,
    port: preview.port ?? defaultPort,
    method: request.method ?? "GET",
    url: `${preview.path}${preview.search}`,
    headers,
    body
  });
}
