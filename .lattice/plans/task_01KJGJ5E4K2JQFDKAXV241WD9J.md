# CTX-50: Static deployment to Vercel — prebuild API + rewrites

Pre-compute all API responses at build time, deploy as static site on Vercel. Guard server.ts with import.meta.main, create prebuild script using Hono's app.request(), add vercel.json with rewrites mapping /api/* to /data/*.json.
