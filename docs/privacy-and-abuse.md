# Privacy and abuse controls

Grounded implements privacy, rate-limiting, and abuse hardening across all guest and member flows.

## Threat Controls & Protections

| Area | Control | Implementation |
| --- | --- | --- |
| **Cross-Site Mutations** | CSRF / Cross-Origin Rejection | `assertSameOrigin()` validates `Sec-Fetch-Site`, `Origin`, and `Host` headers before processing state-changing requests (`POST`, `PUT`, `DELETE`). |
| **Multi-Instance Rate Limiting** | PostgreSQL atomic buckets | `rate_limit_buckets` table provides cross-instance sliding-window rate limiting with fail-open resilience. |
| **Identifier Probing** | Non-Enumerating Errors | Resource lookup failures return consistent generic 404 responses without revealing existence or ownership. |
| **Cache Protection** | Private No-Store Headers | Dynamic and personalized responses return `Cache-Control: private, no-store, max-age=0, must-revalidate`. |
| **Observability Redaction** | Structured JSON Logging | `logSecureEvent()` systematically redacts passwords, tokens, cookies, digests, and raw document contents. |
