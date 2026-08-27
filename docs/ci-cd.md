# CI/CD and Security Scanning

This repository uses GitHub Actions for continuous integration and automated security code scanning to satisfy repository branch protection rulesets.

## Workflows

### 1. CodeQL Security Scanning (`.github/workflows/codeql.yml`)
- **Trigger**: Runs on push to `master`, pull requests targeting `master`, and on a weekly schedule.
- **Language**: `javascript-typescript`.
- **Queries**: `security-extended`, `security-and-quality`.
- **Purpose**: Satisfies GitHub branch protection rules requiring CodeQL scanning with no critical/error alerts before merge.

### 2. CI Verification Pipeline (`.github/workflows/ci.yml`)
- **Trigger**: Runs on push to `master` and pull requests targeting `master`.
- **Environment**: Node.js 22 LTS on `ubuntu-latest`.
- **Steps**:
  1. `npm ci`: Clean install of dependencies from `package-lock.json`.
  2. `npm test`: Automated unit and component testing with Vitest.
  3. `npm run typecheck`: Strict TypeScript typechecking with `tsc --noEmit`.
  4. `npm run lint`: Code quality and lint verification with ESLint.
  5. `npm run build`: Next.js Turbopack production build verification.
