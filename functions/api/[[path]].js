const UPSTREAM = "https://api.apdsc.apcfss.in";

// Explicit allowlist: this endpoint is not an arbitrary URL proxy.
const ALLOWED = new Set([
  "emptetapi/dsc-public/generate-captcha",
  "emptetapi/auth/candidate-authenticate",
  "emptetreadapi/tet-response-sheet-abstract",
  "emptetreadapi/tet-response-sheet-stream",
]);

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ status: false, sdesc: message }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequest({ request, params }) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const pathParts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const path = pathParts.join("/");
  if (!ALLOWED.has(path)) return jsonError("Endpoint not allowed", 404);

  // Only the response-stream endpoint accepts a query parameter, and only examId.
  const incoming = new URL(request.url);
  const upstreamUrl = new URL(`${UPSTREAM}/${path}`);
  if (path === "emptetreadapi/tet-response-sheet-stream") {
    const examId = incoming.searchParams.get("examId");
    if (!examId || examId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(examId)) {
      return jsonError("A valid examId is required", 400);
    }
    upstreamUrl.searchParams.set("examId", examId);
  } else if (incoming.search) {
    return jsonError("Query parameters are not allowed for this endpoint", 400);
  }

  const headers = new Headers({ Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType && method === "POST") headers.set("Content-Type", contentType);

  // Forward the bearer token only to the fixed AP DSC upstream.
  const authorization = request.headers.get("authorization");
  if (authorization && /^Bearer\s+\S+$/i.test(authorization)) {
    headers.set("Authorization", authorization);
  }

  const init = {
    method,
    headers,
    redirect: "manual",
  };

  if (method === "POST") {
    const body = await request.text();
    if (body.length > 20_000) return jsonError("Request body too large", 413);
    init.body = body || undefined;
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl.toString(), init);
  } catch {
    return jsonError("AP DSC service is temporarily unreachable", 502);
  }

  const responseBody = await upstreamResponse.arrayBuffer();
  const responseHeaders = new Headers({
    "Content-Type": upstreamResponse.headers.get("content-type") || "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });

  // Never cache authentication, CAPTCHA or candidate response data.
  return new Response(responseBody, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}
