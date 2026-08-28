# Deployment Guide

The application is architected for deployment on Vercel's Hobby plan with Neon PostgreSQL Free tier.

## Prerequisites

- Neon PostgreSQL project with pgvector enabled.
- OpenRouter API key.
- Vercel account.

This project intentionally uses OpenRouter's free chat router and free Liquid embedding model in production. Daily quotas, selected chat models, and availability may vary with OpenRouter's free capacity.

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL pooled connection string with SSL mode required | `postgresql://user:pass@ep-xyz.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `OPENROUTER_API_KEY` | OpenRouter API Key for embeddings and chat generation | `sk-or-v1-...` |
| `OPENROUTER_CHAT_MODEL` | (Optional) Chat model identifier (default: `openrouter/free`) | `openrouter/free` |
| `OPENROUTER_EMBEDDING_MODEL` | (Optional) Embedding model (default: `liquid/lfm-2.5-embedding-350m:free`) | `liquid/lfm-2.5-embedding-350m:free` |
| `GUEST_MAX_UPLOAD_BYTES` | (Optional) Temporary upload byte limit (default 4 MiB) | `4194304` |
| `GUEST_MAX_MESSAGE_CHARACTERS` | (Optional) Temporary question character limit | `12000` |
| `GUEST_REQUESTS_PER_MINUTE` | (Optional) Baseline per-session API request limit | `60` |

## Deployment Steps

1. **Database Migration**:
   ```bash
   npm run db:migrate
   ```
2. **Deploy to Vercel**:
   ```bash
   npx vercel --prod --yes
   ```
3. **Set Environment Variables in Vercel**:
   Ensure `DATABASE_URL` and `OPENROUTER_API_KEY` are configured for Production, Preview, and Development. Leave the optional model overrides unset to use the zero-budget defaults.

## Verification Checklist

- [x] Static compilation & build succeed (`npm run build`)
- [x] Strict TypeScript and ESLint checks pass
- [x] All automated tests pass (`npm test`)
- [x] Route handlers declare `maxDuration = 60` for serverless streaming
- [x] `.vercelignore` excludes local test/QA artifacts to prevent file locks during deployment
- [ ] Confirm free-provider availability, then run one fresh upload, grounded question, citation check, and reload against the production URL
