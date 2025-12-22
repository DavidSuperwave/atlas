/**
 * Whop Configuration
 * 
 * This file contains the preset plan configuration for Whop checkout.
 * Plans are created in the Whop dashboard and their checkout URLs are stored here.
 */

// Plan configuration with credits and checkout URLs
export const WHOP_PLANS = {
  Starter: {
    name: 'Starter',
    price: 29,
    credits: 15000,
    pricePer1k: 1.93,
    checkoutUrl: process.env.NEXT_PUBLIC_WHOP_PLAN_STARTER_URL || '',
    planId: process.env.WHOP_PLAN_STARTER_ID || '',
  },
  Growth: {
    name: 'Growth',
    price: 47,
    credits: 25000,
    pricePer1k: 1.88,
    checkoutUrl: process.env.NEXT_PUBLIC_WHOP_PLAN_GROWTH_URL || '',
    planId: process.env.WHOP_PLAN_GROWTH_ID || '',
  },
  Scale: {
    name: 'Scale',
    price: 97,
    credits: 55000,
    pricePer1k: 1.76,
    checkoutUrl: process.env.NEXT_PUBLIC_WHOP_PLAN_SCALE_URL || '',
    planId: process.env.WHOP_PLAN_SCALE_ID || '',
  },
  Pro: {
    name: 'Pro',
    price: 199,
    credits: 120000,
    pricePer1k: 1.65,
    checkoutUrl: process.env.NEXT_PUBLIC_WHOP_PLAN_PRO_URL || '',
    planId: process.env.WHOP_PLAN_PRO_ID || '',
  },
} as const;

export type PlanName = keyof typeof WHOP_PLANS;

// Export PLAN_CONFIG as alias for WHOP_PLANS (for backward compatibility)
export const PLAN_CONFIG = WHOP_PLANS;

// Lookup credits by plan ID (for webhook processing)
export function getCreditsByPlanId(planId: string): number | null {
  for (const plan of Object.values(WHOP_PLANS)) {
    if (plan.planId === planId) {
      return plan.credits;
    }
  }
  return null;
}

// Lookup plan name by plan ID
export function getPlanNameByPlanId(planId: string): string | null {
  for (const [name, plan] of Object.entries(WHOP_PLANS)) {
    if (plan.planId === planId) {
      return name;
    }
  }
  return null;
}

// Get checkout URL for a plan
export function getCheckoutUrl(planName: PlanName): string | null {
  const plan = WHOP_PLANS[planName];
  return plan?.checkoutUrl || null;
}

// Check if Whop checkout URLs are configured
export function isWhopConfigured(): boolean {
  return Object.values(WHOP_PLANS).some(plan => plan.checkoutUrl !== '');
}

/**
 * Create a direct checkout for a Whop plan
 * Returns the checkout URL and a checkout ID for tracking
 * 
 * @param planName - The plan name (e.g., 'Starter', 'Growth', etc.)
 * @param userId - The user ID for tracking
 * @param orderId - The order ID to use as checkout ID
 * @returns Object with checkoutUrl and checkoutId
 */
export async function createDirectCheckout(
  planName: PlanName,
  userId: string,
  orderId: string
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const plan = WHOP_PLANS[planName];
  
  if (!plan) {
    throw new Error(`Invalid plan name: ${planName}`);
  }
  
  if (!plan.checkoutUrl) {
    throw new Error(`Checkout URL not configured for plan: ${planName}`);
  }
  
  // Use orderId as checkoutId for tracking purposes
  // The checkout URL is preset, so we just return it with the order ID
  return {
    checkoutUrl: plan.checkoutUrl,
    checkoutId: orderId,
  };
}

// Verify Whop webhook signature
export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): boolean {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  
  // If no secret configured, skip verification in development
  if (!secret) {
    console.warn('WHOP_WEBHOOK_SECRET not set - skipping signature verification');
    return process.env.NODE_ENV === 'development';
  }

  try {
    // Whop uses HMAC SHA256 for webhook signatures
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    
    return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}
