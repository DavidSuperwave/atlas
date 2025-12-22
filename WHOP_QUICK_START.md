# Whop Integration Quick Start Guide

## Overview

This integration uses **preset Whop plans** - you create plans in the Whop dashboard, and users are redirected directly to Whop checkout. Credits are automatically added via webhook when payment succeeds.

## Prerequisites

- Whop account with a product created
- Plans created for each pricing tier
- Webhook configured to receive payment events

## Step 1: Create Plans in Whop Dashboard

1. Go to **Whop Dashboard** → Your Product
2. Click **Add Plan** for each tier:

| Plan Name | Price | Type | Credits |
|-----------|-------|------|---------|
| Starter | $29/month | Subscription | 15,000 |
| Growth | $47/month | Subscription | 25,000 |
| Scale | $97/month | Subscription | 55,000 |
| Pro | $199/month | Subscription | 120,000 |

3. Copy each plan's checkout URL (looks like `https://whop.com/checkout/plan_xxxxx/`)

## Step 2: Environment Variables

Add these to your `.env.local` (and Vercel dashboard for production):

```env
# Whop Plan Checkout URLs (from Whop dashboard)
NEXT_PUBLIC_WHOP_PLAN_STARTER_URL=https://whop.com/checkout/plan_xxxxx/
NEXT_PUBLIC_WHOP_PLAN_GROWTH_URL=https://whop.com/checkout/plan_xxxxx/
NEXT_PUBLIC_WHOP_PLAN_SCALE_URL=https://whop.com/checkout/plan_xxxxx/
NEXT_PUBLIC_WHOP_PLAN_PRO_URL=https://whop.com/checkout/plan_xxxxx/

# Webhook secret (from Whop webhook settings)
WHOP_WEBHOOK_SECRET=your_webhook_secret_here
```

## Step 3: Configure Webhook

1. Go to **Whop Dashboard** → Your App → **Webhooks**
2. Add endpoint: `https://your-domain.com/api/webhooks/whop`
3. Select events:
   - `payment.succeeded` ✅
   - `payment.failed` ✅
   - `payment.refunded` ✅
4. Save and copy the **Webhook Secret**

## Step 4: Deploy and Test

1. Push changes to trigger Vercel deployment
2. Add env variables in Vercel dashboard
3. Redeploy after adding env vars
4. Make a test purchase
5. Check Vercel logs for webhook events
6. Verify credits were added

## How It Works

```
User clicks Subscribe
       ↓
Redirect to Whop checkout URL
       ↓
User completes payment on Whop
       ↓
Whop sends payment.succeeded webhook
       ↓
Webhook handler finds user by email
       ↓
Credits added to user account
       ↓
User redirected to success page
```

## Troubleshooting

### Webhook Not Received
- Verify webhook URL is correct in Whop dashboard
- Check Vercel function logs for errors
- Ensure `WHOP_WEBHOOK_SECRET` is set correctly

### Credits Not Added
- Check webhook logs for user lookup errors
- Verify user email in Whop matches your database
- Check the credits amount is being detected correctly

### Checkout Not Working
- Verify `NEXT_PUBLIC_WHOP_PLAN_*_URL` env vars are set
- Ensure env vars are in Vercel (not just local)
- Redeploy after adding env vars

## Files Reference

- `src/app/credits/page.tsx` - Pricing page with checkout buttons
- `src/app/api/webhooks/whop/route.ts` - Webhook handler
- `src/lib/whop-client.ts` - Whop configuration and helpers
- `src/app/payment/success/page.tsx` - Post-payment success page

## Support

- [Whop API Docs](https://docs.whop.com)
- [Whop Developer Guide](https://docs.whop.com/developer/guides/accept-payments)
