# Response Sheet Viewer — Cloudflare Pages version

This version includes a same-origin Cloudflare Pages Function proxy so the browser calls `/api/...` on your deployed site instead of directly calling `api.apdsc.apcfss.in`.

## Deploy to Cloudflare Pages
1. Push the contents of this folder to a GitHub repository.
2. In Cloudflare Dashboard, create a Pages project and connect the repository.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Deploy. The `functions/api/[[path]].js` file is deployed as a Pages Function.

## Why the proxy is included
The upstream API response allows `https://sptet.apcfss.in` as an origin, not your own Pages domain. A browser request from your domain is therefore blocked by CORS. The Pages Function makes a server-to-server request, and the browser talks only to its own site origin.

## Security and operating notes
- The proxy uses a strict allowlist of four API endpoints and does not accept arbitrary upstream URLs.
- It only forwards `examId` to the response stream endpoint and forwards a Bearer token only to the fixed upstream API host.
- Responses are marked no-store; the function does not intentionally log credentials or response content.
- This does not bypass authentication, CAPTCHA, or upstream access controls. It is not a guarantee that the upstream service will accept server-to-server calls.
- Public proxy endpoints can be abused. Before broad public release, confirm you are authorized to access and redistribute these API responses, add appropriate rate limiting/abuse controls, and monitor aggregate errors without recording credentials or personal response data.
- If the upstream server itself requires an approved `Origin` header or has other server-side restrictions, ask the API operator to authorize your deployment or provide an official integration. Do not spoof browser Origin headers or disable browser security.
- Candidate credentials and tokens remain in browser memory only; never put them in client-side environment variables or commit them to GitHub.


## Run locally with the API proxy
Do not use `npm run dev` to test `/api/...`; the Vite dev server does not execute Cloudflare Pages Functions by default.

Instead run:
```bash
npm install
npm run dev:pages
```
This builds the React frontend and runs the output through Cloudflare Pages' local runtime (Wrangler), which serves the `functions/api/[[path]].js` function. Open the local URL printed by Wrangler, usually `http://localhost:8788`.

After editing React source, run `npm run build && npx wrangler pages dev dist` again to rebuild and preview. For a faster frontend-only workflow, `npm run dev` still works for UI development, but API calls to `/api/...` will return 404 unless you separately configure a local proxy.

## Download the response sheet as PDF
After signing in and loading an exam, select **Download PDF** above the question-wise analysis. The print-ready sheet includes every question, question images where available, your answer, the correct answer, result, marks, and a score summary. Search and result filters do not limit the exported questions. In the browser print dialog, choose **Save as PDF** to download the file.

Question illustrations use the file-download endpoint format under `SPL_TET_QUESTION_IMAGES`, using the image filename present in the question response. If a source filename is invalid or the upstream file is unavailable, that image cannot be included.
