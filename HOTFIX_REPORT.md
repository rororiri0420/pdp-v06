# PDP v0.6.1 Hotfix Report

Fix applied for frontend error:

`Unexpected token 'A', "An error o"... is not valid JSON`

## What changed

1. `/api/generate` now always returns JSON on success and error.
2. `app/page.tsx` now safely parses API responses using `await res.text()` then `JSON.parse()`.
3. If the server returns non-JSON text, the UI shows a clear error instead of crashing.
4. Added `/api/health` route to verify environment configuration.
5. Default Claude model fallback changed to `claude-sonnet-4-5` and should be overridden with the exact model available in the user's Anthropic console.

## After deploy

Open:

`/api/health`

It should return JSON with env checks.

Then test Generate again.

If Generate fails with a model error, set `ANTHROPIC_MODEL` in Vercel to the exact model string shown in the Anthropic console.
