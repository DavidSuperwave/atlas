# External Services Review & Testing Report

## Overview
This document reviews the external services integration for potential issues and misconfigurations:
- GoLogin token/profile handling
- MailTester rate limits
- Resend from-domain verification
- Instantly/Smartlead/Plusvibe payload/authz
- Supabase RLS enforcement

---

## 1. GoLogin Token/Profile Handling

### Current Implementation
- **Token Management**: `GOLOGIN_API_TOKEN` loaded from env, validated on client initialization
- **Profile Assignment**: User-specific profiles via `user_gologin_profiles` table, fallback to `GOLOGIN_PROFILE_ID` env var
- **Profile Manager**: `src/lib/gologin-profile-manager.ts` handles lookups with caching

### Issues Found

#### ⚠️ Issue 1: Service Role Key Fallback to Anon Key
**Location**: `src/lib/gologin-profile-manager.ts:27-30`
```typescript
const supabase = createClient(
    supabaseUrl || '',
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);
```

**Problem**: Falls back to anon key if service role key is missing. This could bypass RLS and cause security issues.

**Severity**: HIGH - Security risk

**Recommendation**: 
```typescript
if (!serviceRoleKey) {
    throw new Error('[PROFILE-MANAGER] SUPABASE_SERVICE_ROLE_KEY is required');
}
```

#### ⚠️ Issue 2: No Token Validation on API Calls
**Location**: `src/lib/gologin-client.ts:173-190`

**Problem**: `isAvailable()` checks API availability but doesn't validate token format or expiration. Invalid tokens may cause silent failures.

**Severity**: MEDIUM - Could cause runtime errors

**Recommendation**: Add token format validation and better error messages.

#### ⚠️ Issue 3: Profile Cache Not Invalidated on Assignment Changes
**Location**: `src/lib/gologin-profile-manager.ts:84-92`

**Problem**: Cache TTL is 5 minutes, but if admin assigns a new profile, user may see old profile for up to 5 minutes.

**Severity**: LOW - Minor UX issue

**Recommendation**: Clear cache immediately on assignment changes (already implemented in `assignProfileToUser`).

---

## 2. MailTester Rate Limits

### Current Implementation
- **Rate Limiting**: `src/lib/api-key-pool.ts` implements 170 emails/30s and 500k/day limits
- **Key Pool**: Supports multiple keys with rotation
- **Queue System**: `src/lib/verification-queue.ts` uses key pool for parallel processing

### Issues Found

#### ✅ Issue 1: Rate Limit Implementation Correct
**Status**: CORRECT - The implementation properly tracks:
- Window-based limits (30-second windows)
- Daily limits (resets at midnight UTC)
- Per-key usage tracking
- Minimum delay between requests (~176ms)

#### ⚠️ Issue 2: No Error Handling for API Rate Limit Responses
**Location**: `src/lib/mailtester.ts:28-30`

**Problem**: If MailTester API returns 429 (rate limit), the code throws a generic error. Should handle gracefully and retry with different key.

**Severity**: MEDIUM - Could cause verification failures

**Recommendation**: Add retry logic with different keys on 429 responses.

#### ⚠️ Issue 3: Daily Limit Reset Uses Local Time, Not UTC
**Location**: `src/lib/api-key-pool.ts:181`

**Problem**: Uses `new Date().toISOString().split('T')[0]` which uses local timezone, but MailTester likely resets at UTC midnight.

**Severity**: LOW - Minor discrepancy

**Recommendation**: Use UTC explicitly:
```typescript
const today = new Date().toISOString().split('T')[0]; // Already UTC via ISO
```

---

## 3. Resend From-Domain Verification

### Current Implementation
- **Domain Check**: `src/lib/resend.ts:18-38` validates `RESEND_FROM_EMAIL` format
- **Error Handling**: Catches domain verification errors and provides helpful messages

### Issues Found

#### ✅ Issue 1: Domain Validation Correct
**Status**: CORRECT - Validates email format and provides helpful error messages.

#### ⚠️ Issue 2: No Runtime Domain Verification Check
**Location**: `src/lib/resend.ts:55-96`

**Problem**: Only validates email format, doesn't verify domain is actually verified in Resend. This could cause failures at send time.

**Severity**: MEDIUM - Could cause email failures

**Recommendation**: Add optional domain verification check on startup (warn, don't fail).

#### ⚠️ Issue 3: FROM_EMAIL Evaluated at Module Load
**Location**: `src/lib/resend.ts:41`

**Problem**: `FROM_EMAIL` is evaluated when module loads. If env var changes, requires restart.

**Severity**: LOW - Expected behavior for env vars

**Recommendation**: Keep as-is (standard pattern).

---

## 4. Instantly/Smartlead/Plusvibe Integrations

### Current Implementation
- **Instantly**: `src/app/api/instantly/send-leads/route.ts` - Bearer token auth
- **Smartlead**: `src/app/api/smartlead/send-leads/route.ts` - API key in query param
- **PlusVibe**: `src/app/api/plusvibe/send-leads/route.ts` - x-api-key header

### Issues Found

#### 🔴 Issue 1: No Authentication/Authorization on Export Endpoints
**Location**: All three export endpoints

**Problem**: These endpoints accept API keys in request body but don't verify the user is authenticated or authorized to export leads. Anyone with a valid API key can export any leads.

**Severity**: CRITICAL - Security vulnerability

**Recommendation**: 
1. Require user authentication (`getCurrentUser()`)
2. Verify user owns the leads being exported
3. Store API keys per user (encrypted) instead of accepting in request body

#### ⚠️ Issue 2: No Rate Limiting on Export Endpoints
**Location**: All three export endpoints

**Problem**: No rate limiting, could be abused to spam external services.

**Severity**: MEDIUM - Could cause abuse

**Recommendation**: Add rate limiting per user.

#### ⚠️ Issue 3: Smartlead API Key Exposed in Query String
**Location**: `src/app/api/smartlead/send-leads/route.ts:84`

**Problem**: API key passed in query string, visible in logs and browser history.

**Severity**: MEDIUM - Security risk

**Recommendation**: Use header instead (if API supports it).

#### ⚠️ Issue 4: No Input Validation on Lead Data
**Location**: All three endpoints

**Problem**: Accepts any lead data without validation. Could send malformed data to external APIs.

**Severity**: LOW - Could cause API errors

**Recommendation**: Add schema validation (Zod or similar).

#### ⚠️ Issue 5: No Error Recovery/Retry Logic
**Location**: All three endpoints

**Problem**: If external API fails, no retry logic. Single failure = complete failure.

**Severity**: LOW - Could cause data loss

**Recommendation**: Add retry logic with exponential backoff.

---

## 5. Supabase RLS Enforcement

### Current Implementation
- **RLS Policies**: Defined in `supabase/migrate_all.sql`
- **Service Client**: `src/lib/supabase-server.ts` uses service role key
- **Auth Client**: Uses `@supabase/ssr` for authenticated requests

### Issues Found

#### ⚠️ Issue 1: Service Role Key Used Everywhere
**Location**: Many API routes use `createServiceClient()` which bypasses RLS

**Problem**: Service role key bypasses all RLS policies. If used incorrectly, could expose data.

**Severity**: MEDIUM - Requires careful review

**Recommendation**: 
- Use `createAuthenticatedClient()` for user-scoped operations
- Only use `createServiceClient()` for admin operations or when RLS bypass is intentional

#### ⚠️ Issue 2: Some Routes Don't Verify Ownership
**Location**: `src/app/api/scrape/[id]/status/route.ts:55-66`

**Problem**: Checks admin status but uses wrong table (`profiles` instead of `user_profiles`).

**Severity**: HIGH - Bug that could cause authorization failures

**Recommendation**: Fix table name:
```typescript
const { data: profile } = await supabase
    .from('user_profiles')  // Fixed
    .select('is_admin')
    .eq('id', user.id)
    .single();
```

#### ✅ Issue 3: RLS Policies Look Correct
**Status**: CORRECT - Policies properly enforce:
- Users can only see their own data
- Admins can see all data
- Service role can insert transactions

---

## Fixes Applied

### ✅ Fixed: GoLogin Profile Manager Security Issue
**File**: `src/lib/gologin-profile-manager.ts`
**Change**: Removed fallback to anon key, now throws error if service role key is missing
**Status**: FIXED

### ✅ Fixed: Scrape Status Authorization Bug
**File**: `src/app/api/scrape/[id]/status/route.ts`
**Change**: Fixed table name from `profiles` to `user_profiles` and field from `role` to `is_admin`
**Status**: FIXED

## Summary of Critical Issues

### 🔴 CRITICAL (Still Open)
1. **Export endpoints lack authentication** - Anyone can export leads with valid API keys
   - **Files**: `src/app/api/instantly/send-leads/route.ts`, `src/app/api/smartlead/send-leads/route.ts`, `src/app/api/plusvibe/send-leads/route.ts`
   - **Action Required**: Add `getCurrentUser()` check and verify user owns leads

### ⚠️ HIGH (Fixed)
1. ~~**GoLogin profile manager falls back to anon key**~~ - FIXED
2. ~~**Wrong table name in scrape status check**~~ - FIXED

### ⚠️ MEDIUM
1. **MailTester rate limit errors not handled** - Could cause failures
2. **Resend domain not verified at runtime** - Could cause email failures
3. **No rate limiting on export endpoints** - Abuse risk
4. **Smartlead API key in query string** - Security risk

### ⚠️ LOW
1. **Profile cache TTL** - Minor UX issue
2. **No input validation on exports** - Could cause API errors
3. **No retry logic on exports** - Could cause data loss

---

## Testing Checklist

- [ ] Test GoLogin token validation
- [ ] Test MailTester rate limiting with multiple keys
- [ ] Test Resend domain verification error handling
- [ ] Test export endpoints with authentication
- [ ] Test Supabase RLS policies
- [ ] Test profile assignment cache invalidation
- [ ] Test API key rotation in MailTester

---

## Recommendations Priority

1. **IMMEDIATE**: Fix export endpoint authentication
2. **HIGH**: Fix GoLogin service role fallback
3. **HIGH**: Fix scrape status authorization bug
4. **MEDIUM**: Add rate limiting to export endpoints
5. **MEDIUM**: Handle MailTester rate limit errors
6. **LOW**: Add input validation to exports

