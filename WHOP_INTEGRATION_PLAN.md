# Whop Payment Integration Plan

## Executive Summary

This document outlines a plan to integrate Whop's payment processing system into Atlas to replace the current manual credit request system. This will automate credit purchases, reduce administrative overhead, and provide a seamless payment experience for users.

## Current System Analysis

### How It Works Now

1. **Credit Request Flow:**
   - Users select a pricing plan (Starter, Pro, Enterprise)
   - They submit a credit order request via `/api/credit-orders`
   - Order is stored in `credit_orders` table with status `pending`
   - Admin manually reviews and approves orders
   - Admin adds credits to user account via `/api/admin/credit-orders`

2. **Current Pricing Plans:**
   - **Starter:** $7.50 → 5,000 credits
   - **Pro:** $32.50 → 25,000 credits  
   - **Enterprise:** Custom pricing → 100,000 credits

3. **Database Schema:**
   - `credit_orders` table tracks purchase requests
   - `user_profiles.credits_balance` stores current balance
   - `credit_transactions` logs all credit changes

### Pain Points

- Manual admin approval required for every purchase
- No immediate credit allocation
- Payment processing happens outside the system
- No automated payment verification
- Scalability issues as user base grows

## Whop Integration Benefits

### Advantages

1. **Automated Payments:** Users pay directly through Whop checkout
2. **Instant Credit Allocation:** Credits added automatically via webhooks
3. **Payment Security:** Whop handles PCI compliance and payment processing
4. **Reduced Admin Overhead:** No manual approval needed
5. **Better UX:** Seamless checkout experience
6. **Subscription Support:** Can offer recurring plans if needed
7. **Payment Tracking:** Built-in payment history and analytics

### Whop API Capabilities

Based on the documentation review:

- **Checkout Links:** Create shareable payment URLs
- **Embedded Checkout:** Integrate checkout directly in your app
- **Plans:** Create one-time or recurring payment plans
- **Webhooks:** Receive payment events (success, failure, refunds)
- **Payouts API:** Transfer funds (if needed for refunds)

## Implementation Plan

### Phase 1: Setup & Configuration

#### 1.1 Whop Account Setup
- [ ] Create Whop developer account
- [ ] Generate API key with required permissions:
  - `payments:read` - View payments
  - `payments:write` - Create checkouts
  - `plans:read` - View plans
  - `plans:write` - Create plans
- [ ] Configure app permissions in Whop dashboard
- [ ] Install app on your Whop company

#### 1.2 Environment Variables
Add to `.env.local`:
```env
WHOP_API_KEY=your_api_key_here
WHOP_APP_ID=app_xxxxxxxxxxxxxx
WHOP_COMPANY_ID=biz_xxxxxxxxxxxxxx
WHOP_WEBHOOK_SECRET=your_webhook_secret
```

#### 1.3 Install Whop SDK
```bash
npm install @whop/sdk
```

### Phase 2: Database Schema Updates

#### 2.1 Extend `credit_orders` Table
Add Whop-related fields to track payment status:

```sql
ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS whop_payment_id text;
ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS whop_checkout_id text;
ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS whop_plan_id text;
ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));
ALTER TABLE credit_orders ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'manual' CHECK (payment_method IN ('manual', 'whop'));
```

#### 2.2 Create Whop Plans Table (Optional)
Store Whop plan IDs for reference:

```sql
CREATE TABLE IF NOT EXISTS whop_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL UNIQUE, -- 'Starter', 'Pro', 'Enterprise'
  whop_plan_id text NOT NULL UNIQUE,
  credits_amount integer NOT NULL,
  price_cents integer NOT NULL, -- Store in cents for accuracy
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);
```

### Phase 3: Whop Service Layer

#### 3.1 Create Whop Client Wrapper
Create `src/lib/whop-client.ts`:

```typescript
import Whop from "@whop/sdk";

const whopClient = new Whop({
  apiKey: process.env.WHOP_API_KEY!,
  appID: process.env.WHOP_APP_ID!,
});

export default whopClient;

// Helper functions for common operations
export async function createWhopPlan(name: string, priceCents: number, credits: number) {
  // Create plan in Whop
}

export async function createCheckoutLink(planId: string, userId: string, metadata: Record<string, any>) {
  // Create checkout link
}

export async function getPaymentStatus(paymentId: string) {
  // Get payment status
}
```

### Phase 4: API Routes

#### 4.1 Update Credit Orders API
Modify `src/app/api/credit-orders/route.ts`:

**POST Handler Changes:**
- Instead of creating a pending order, create a Whop checkout
- Store checkout ID and plan ID in the order
- Return checkout URL to frontend

**New Flow:**
1. User selects plan
2. Create Whop checkout link
3. Create credit_order record with `payment_method='whop'` and `payment_status='pending'`
4. Return checkout URL to user
5. User completes payment on Whop
6. Webhook receives payment confirmation
7. Credits automatically added

#### 4.2 Create Whop Webhook Handler
Create `src/app/api/webhooks/whop/route.ts`:

```typescript
// Handle Whop webhook events
// payment.succeeded -> Add credits
// payment.failed -> Update order status
// payment.refunded -> Refund credits
```

**Webhook Events to Handle:**
- `payment.succeeded` - Add credits to user account
- `payment.failed` - Mark order as failed
- `payment.refunded` - Refund credits (deduct from balance)

#### 4.3 Create Plan Management API
Create `src/app/api/admin/whop-plans/route.ts`:

- GET: List all Whop plans
- POST: Create new Whop plan
- PATCH: Update plan
- DELETE: Delete plan

### Phase 5: Frontend Updates

#### 5.1 Update Credits Page
Modify `src/app/credits/page.tsx`:

**Changes:**
- Replace "Request Credits" button with "Buy Credits"
- On plan selection, create Whop checkout
- Redirect user to Whop checkout URL
- Show payment status after return

**New Flow:**
```typescript
async function handlePurchase(plan: PricingPlan) {
  // Create checkout
  const response = await fetch('/api/credit-orders', {
    method: 'POST',
    body: JSON.stringify({ planName: plan.name, creditsAmount: plan.credits })
  });
  
  const { checkoutUrl } = await response.json();
  
  // Redirect to Whop checkout
  window.location.href = checkoutUrl;
}
```

#### 5.2 Add Payment Status Page
Create `src/app/payment/status/page.tsx`:

- Show payment status after return from Whop
- Display success/failure messages
- Link back to credits page

### Phase 6: Migration Strategy

#### 6.1 Backward Compatibility
- Keep manual approval system for existing orders
- Support both payment methods during transition
- Add admin toggle to enable/disable Whop payments

#### 6.2 Data Migration
- Migrate existing pending orders to manual completion
- Create Whop plans for existing pricing tiers
- Map existing plans to Whop plan IDs

## Implementation Details

### Whop Plan Creation

For each pricing tier, create a Whop plan:

```typescript
// Starter Plan
{
  name: "Atlas Starter - 5,000 Credits",
  price: 750, // $7.50 in cents
  type: "one_time",
  metadata: {
    credits: 5000,
    plan_name: "Starter"
  }
}

// Pro Plan
{
  name: "Atlas Pro - 25,000 Credits",
  price: 3250, // $32.50 in cents
  type: "one_time",
  metadata: {
    credits: 25000,
    plan_name: "Pro"
  }
}
```

### Webhook Security

Implement webhook signature verification:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.WHOP_WEBHOOK_SECRET!;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

### Error Handling

- Handle payment failures gracefully
- Retry logic for webhook processing
- Log all payment events for debugging
- Notify admins of failed payments

## Testing Plan

### Test Scenarios

1. **Successful Payment Flow:**
   - User selects plan
   - Checkout created successfully
   - User completes payment
   - Webhook received and processed
   - Credits added to account

2. **Failed Payment:**
   - Payment fails
   - Order marked as failed
   - User notified

3. **Refund Flow:**
   - Admin initiates refund
   - Credits deducted
   - Order status updated

4. **Edge Cases:**
   - Duplicate webhook events
   - Network failures
   - Invalid webhook signatures
   - Missing order records

## Rollout Strategy

### Phase 1: Development (Week 1-2)
- Set up Whop account and API keys
- Implement core functionality
- Create test plans
- Build webhook handler

### Phase 2: Testing (Week 3)
- Internal testing
- Test payment flows
- Verify webhook processing
- Test error scenarios

### Phase 3: Beta (Week 4)
- Enable for select users
- Monitor payment processing
- Gather feedback
- Fix issues

### Phase 4: Full Rollout (Week 5)
- Enable for all users
- Keep manual system as fallback
- Monitor metrics
- Optimize based on usage

## Cost Considerations

### Whop Fees
- Review Whop's pricing structure
- Factor in transaction fees
- Compare with current payment processing costs

### Implementation Costs
- Development time: ~2-3 weeks
- Testing time: ~1 week
- Maintenance: Ongoing monitoring

## Success Metrics

Track these metrics post-implementation:

1. **Payment Conversion Rate:** % of users who complete payment
2. **Time to Credit:** Average time from payment to credit allocation
3. **Admin Time Saved:** Reduction in manual approvals
4. **Payment Success Rate:** % of successful payments
5. **User Satisfaction:** Feedback on payment experience

## Risks & Mitigation

### Risks

1. **Payment Processing Failures**
   - Mitigation: Keep manual system as backup
   - Monitor webhook processing
   - Alert on failures

2. **Webhook Delivery Issues**
   - Mitigation: Implement retry logic
   - Poll payment status as backup
   - Log all webhook events

3. **User Confusion During Transition**
   - Mitigation: Clear UI messaging
   - Support documentation
   - Admin can still manually add credits

## Next Steps

1. **Immediate Actions:**
   - [ ] Review and approve this plan
   - [ ] Set up Whop developer account
   - [ ] Obtain API credentials
   - [ ] Install Whop SDK

2. **Development:**
   - [ ] Create Whop client wrapper
   - [ ] Implement webhook handler
   - [ ] Update credit orders API
   - [ ] Update frontend

3. **Testing:**
   - [ ] Test payment flows
   - [ ] Verify webhook processing
   - [ ] Test error scenarios

4. **Deployment:**
   - [ ] Deploy to staging
   - [ ] Beta test with select users
   - [ ] Full rollout

## References

- [Whop API Documentation](https://docs.whop.com/developer/api/getting-started)
- [Whop Payments Guide](https://docs.whop.com/developer/guides/accept-payments)
- [Whop Webhooks](https://docs.whop.com/developer/guides/webhooks)
- [Whop SDK](https://docs.whop.com/developer/api/getting-started#sdks)

