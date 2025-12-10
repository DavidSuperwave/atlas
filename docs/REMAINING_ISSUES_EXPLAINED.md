# Remaining Issues Explained

This document explains the four remaining issues that need to be fixed in the external services integration.

---

## 1. 🔴 Fix Export Endpoint Authentication (CRITICAL)

### What's the Problem?

The export endpoints (`/api/instantly/send-leads`, `/api/smartlead/send-leads`, `/api/plusvibe/send-leads`) currently **don't check if the user is logged in**. 

**Current Code** (all three endpoints):
```typescript
export async function POST(request: Request) {
    const body = await request.json();
    const { apiKey, campaignId, leads } = body;
    // ... no authentication check!
    // Anyone can call this endpoint with valid API keys
}
```

### Why is This Critical?

**Security Risk**: Anyone who knows these endpoints exist can:
- Export leads from ANY user's account (if they have the user's API keys)
- Spam external services with fake data
- Cause billing issues by sending excessive requests
- Access data they shouldn't have access to

**Example Attack Scenario**:
1. Attacker finds a user's Instantly API key (maybe leaked in logs, screenshots, etc.)
2. Attacker calls `/api/instantly/send-leads` with that API key
3. Attacker can export leads from ANY user's account, not just their own
4. No audit trail of who made the request

### What Needs to Be Fixed?

Add authentication and authorization checks:

```typescript
export async function POST(request: Request) {
    // ✅ ADD THIS: Check if user is logged in
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { apiKey, campaignId, leads } = body;
    
    // ✅ ADD THIS: Verify user owns the leads being exported
    // Check that all lead IDs belong to this user
    const leadIds = leads.map(l => l.id).filter(Boolean);
    if (leadIds.length > 0) {
        const { data: userLeads } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', user.id)
            .in('id', leadIds);
        
        if (userLeads.length !== leadIds.length) {
            return NextResponse.json(
                { error: 'Some leads do not belong to you' },
                { status: 403 }
            );
        }
    }
    
    // ... rest of the code
}
```

### Impact

- **Before**: Anyone with API keys can export any leads
- **After**: Only authenticated users can export their own leads

---

## 2. ⚠️ Add Rate Limiting to Export Endpoints

### What's the Problem?

The export endpoints have **no rate limiting**. A user (or attacker) could:
- Send thousands of requests per minute
- Overwhelm external APIs (Instantly, Smartlead, PlusVibe)
- Cause your account to be rate-limited or banned
- Generate excessive API costs

### Why is This Important?

**Abuse Prevention**: Without rate limits:
- A buggy frontend could accidentally spam the endpoint
- A malicious user could intentionally abuse it
- External APIs might ban your account
- You could incur unexpected costs

**Example Scenario**:
1. User clicks "Export to Instantly" button
2. Frontend bug causes 1000 duplicate requests
3. All 1000 requests go through (no rate limit)
4. Instantly API bans your account for abuse
5. All users lose access to Instantly integration

### What Needs to Be Fixed?

Add rate limiting using the existing `rate-limit.ts` utility:

```typescript
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/supabase-server';

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // ✅ ADD THIS: Rate limit per user
    const rateLimit = checkRateLimit(user.id, {
        context: 'export-leads',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10, // 10 exports per minute
    });
    
    if (rateLimit.limited) {
        return NextResponse.json(
            {
                error: 'Rate limit exceeded',
                retryAfter: rateLimit.resetInSeconds,
            },
            {
                status: 429,
                headers: { 'Retry-After': rateLimit.resetInSeconds.toString() },
            }
        );
    }
    
    // ... rest of the code
}
```

### Recommended Limits

- **Instantly**: 10 exports per minute per user
- **Smartlead**: 10 exports per minute per user (already has internal batching)
- **PlusVibe**: 10 exports per minute per user

### Impact

- **Before**: Unlimited requests = abuse risk
- **After**: Limited requests = protected from abuse

---

## 3. ⚠️ Improve MailTester Error Handling

### What's the Problem?

When MailTester API returns a **429 (Rate Limit)** error, the current code just throws a generic error. It doesn't:
- Retry with a different API key from the pool
- Provide helpful error messages
- Handle rate limit responses gracefully

**Current Code** (`src/lib/mailtester.ts`):
```typescript
const response = await fetch(`https://happy.mailtester.ninja/ninja?${params}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
});

if (!response.ok) {
    throw new Error(`MailTester API error: ${response.statusText}`);
    // ❌ No retry logic, no key rotation
}
```

### Why is This Important?

**Reliability**: With multiple API keys configured:
- If one key hits rate limit, we should automatically use another
- Users shouldn't see errors when we have available keys
- Better user experience = fewer failed verifications

**Example Scenario**:
1. User verifies 1000 emails
2. First API key hits rate limit (170/30s)
3. Current code: Throws error, stops processing
4. **Should**: Automatically switch to second API key and continue

### What Needs to Be Fixed?

Add retry logic with key rotation:

```typescript
export async function enrichLead(email: string, apiKey: string): Promise<MailTesterResponse> {
    if (!email || !apiKey) {
        throw new Error('Email and API Key are required');
    }

    const params = new URLSearchParams({ email, key: apiKey });
    
    const response = await fetch(`https://happy.mailtester.ninja/ninja?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
    });

    // ✅ ADD THIS: Handle rate limit with retry
    if (response.status === 429) {
        // Rate limited - try with different key if available
        const { apiKeyPool } = await import('./api-key-pool');
        
        if (apiKeyPool.getKeyCount() > 1) {
            // Get a different key
            const newKey = await apiKeyPool.getAvailableKey();
            if (newKey !== apiKey) {
                // Retry with new key
                return enrichLead(email, newKey);
            }
        }
        
        throw new Error('MailTester rate limit exceeded. Please try again later.');
    }

    if (!response.ok) {
        throw new Error(`MailTester API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data as MailTesterResponse;
}
```

**Better Approach**: The `verification-queue.ts` already handles key rotation. We should update `mailtester.ts` to:
1. Accept an optional retry count
2. Return specific error types (rate limit vs other errors)
3. Let the queue handle retries with different keys

### Impact

- **Before**: Rate limit = complete failure
- **After**: Rate limit = automatic retry with different key

---

## 4. ⚠️ Add Input Validation to Export Endpoints

### What's the Problem?

The export endpoints accept **any data** without validation:
- Invalid email addresses
- Missing required fields
- Malformed data structures
- Extremely long strings
- SQL injection attempts (if data is used in queries)

**Current Code** (all three endpoints):
```typescript
const body: RequestBody = await request.json();
const { apiKey, campaignId, leads } = body;

// ❌ Only checks if fields exist, not if they're valid
if (!apiKey || !campaignId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
}

// ❌ No validation of email format, string length, etc.
const instantlyLeads: InstantlyLead[] = leads.map(lead => ({
    email: lead.email, // Could be invalid!
    first_name: lead.first_name, // Could be 10,000 characters!
    // ...
}));
```

### Why is This Important?

**Data Quality**: Invalid data causes:
- External APIs to reject requests
- Wasted API calls
- Poor user experience
- Potential security issues

**Example Scenarios**:
1. User sends email `"not-an-email"` → External API rejects → User confused
2. User sends email `"a".repeat(10000)@example.com` → Request fails → Wasted API call
3. Malicious user sends SQL injection in `first_name` → Potential security risk

### What Needs to Be Fixed?

Add schema validation (using Zod or similar):

```typescript
import { z } from 'zod';

// ✅ Define validation schema
const LeadSchema = z.object({
    email: z.string().email().max(255),
    first_name: z.string().max(100).optional(),
    last_name: z.string().max(100).optional(),
    company_name: z.string().max(200).optional(),
    website: z.string().url().max(500).optional().or(z.literal('')),
    linkedin_url: z.string().url().max(500).optional().or(z.literal('')),
    phone_numbers: z.array(z.string().max(20)).max(5).optional(),
});

const ExportRequestSchema = z.object({
    apiKey: z.string().min(10).max(200),
    campaignId: z.string().min(1).max(100),
    leads: z.array(LeadSchema).min(1).max(1000), // Max 1000 leads per export
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        // ✅ Validate input
        const validationResult = ExportRequestSchema.safeParse(body);
        
        if (!validationResult.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid request data',
                    details: validationResult.error.errors,
                },
                { status: 400 }
            );
        }
        
        const { apiKey, campaignId, leads } = validationResult.data;
        
        // ✅ Now we know all data is valid
        // ... rest of the code
    } catch (error) {
        // ...
    }
}
```

### Validation Rules to Add

- **Email**: Must be valid email format, max 255 chars
- **Names**: Max 100 characters each
- **Company**: Max 200 characters
- **URLs**: Must be valid URL format, max 500 chars
- **Phone**: Max 20 characters per number, max 5 numbers
- **Leads array**: Min 1, max 1000 leads per export

### Impact

- **Before**: Invalid data → API errors → Confused users
- **After**: Invalid data → Clear error messages → Better UX

---

## Summary

| Issue | Severity | Impact | Effort |
|-------|----------|--------|--------|
| Export Authentication | 🔴 CRITICAL | Security vulnerability | Medium |
| Rate Limiting | ⚠️ HIGH | Abuse prevention | Low |
| MailTester Retry | ⚠️ MEDIUM | Reliability | Medium |
| Input Validation | ⚠️ MEDIUM | Data quality | Medium |

### Recommended Fix Order

1. **First**: Export Authentication (CRITICAL security issue)
2. **Second**: Rate Limiting (Quick win, prevents abuse)
3. **Third**: Input Validation (Improves UX)
4. **Fourth**: MailTester Retry (Improves reliability)

---

## Testing After Fixes

After implementing fixes, test:

1. **Authentication**: Try calling export endpoint without login → Should return 401
2. **Rate Limiting**: Send 15 requests in 1 minute → 11th should return 429
3. **Input Validation**: Send invalid email → Should return 400 with error details
4. **MailTester Retry**: Hit rate limit → Should automatically retry with different key

