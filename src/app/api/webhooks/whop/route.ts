import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase-server";
import { addCredits, deductCredits } from "@/lib/credits";
import { verifyWebhookSignature, getCreditsByPlanId, getPlanNameByPlanId } from "@/lib/whop-client";

/**
 * Whop Webhook Handler
 * Processes payment events from Whop for preset plans
 * 
 * Events handled:
 * - payment.succeeded: Add credits to user account
 * - payment.failed: Log the failure
 * - payment.refunded: Deduct credits from user
 * 
 * Flow:
 * 1. User clicks Subscribe → redirects to Whop checkout
 * 2. User completes payment on Whop
 * 3. Whop sends payment.succeeded webhook
 * 4. We look up user by email and add credits
 */

// Plan credits mapping (backup if plan ID lookup fails)
const PLAN_CREDITS: Record<string, number> = {
  'Starter': 15000,
  'Growth': 25000,
  'Scale': 55000,
  'Pro': 120000,
};

export async function POST(request: Request) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("whop-signature") || 
                      request.headers.get("x-whop-signature") || "";

    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error("[WHOP WEBHOOK] Invalid webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const event = JSON.parse(rawBody);
    console.log("[WHOP WEBHOOK] Received event:", event.type);

    // Handle different event types
    switch (event.type) {
      case "payment.succeeded":
        await handlePaymentSucceeded(event.data);
        break;

      case "payment.failed":
        await handlePaymentFailed(event.data);
        break;

      case "payment.refunded":
        await handlePaymentRefunded(event.data);
        break;

      case "membership.went_valid":
        // Subscription became active - can also add credits here
        await handleMembershipValid(event.data);
        break;

      default:
        console.log(`[WHOP WEBHOOK] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[WHOP WEBHOOK] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle successful payment
 * Look up user by email and add credits based on plan
 */
async function handlePaymentSucceeded(paymentData: any) {
  const supabase = createServiceClient();

  try {
    console.log("[WHOP WEBHOOK] Processing payment.succeeded:", JSON.stringify(paymentData, null, 2));

    // Extract payment info
    const customerEmail = paymentData.user?.email || 
                          paymentData.customer_email || 
                          paymentData.email;
    const planId = paymentData.plan_id || paymentData.plan?.id;
    const planName = paymentData.plan?.name || getPlanNameByPlanId(planId);
    const paymentId = paymentData.id;
    const amount = paymentData.amount || paymentData.final_amount;

    if (!customerEmail) {
      console.error("[WHOP WEBHOOK] No customer email in payment data");
      return;
    }

    // Find user by email
    const { data: userProfile, error: userError } = await supabase
      .from("user_profiles")
      .select("id, email")
      .eq("email", customerEmail)
      .single();

    if (userError || !userProfile) {
      console.error(`[WHOP WEBHOOK] User not found for email ${customerEmail}:`, userError);
      
      // Store the payment for later manual processing
      await supabase.from("credit_orders").insert({
        email: customerEmail,
        plan_name: planName || 'Unknown',
        status: 'pending_user_match',
        whop_payment_id: paymentId,
        notes: `User not found. Payment amount: ${amount}`,
      });
      
      return;
    }

    // Determine credits amount
    let credits = getCreditsByPlanId(planId);
    
    // Fallback: try to match by plan name
    if (!credits && planName) {
      // Try to extract plan name from the full name (e.g., "Atlas Starter - 15,000 Credits")
      for (const [name, creditAmount] of Object.entries(PLAN_CREDITS)) {
        if (planName.toLowerCase().includes(name.toLowerCase())) {
          credits = creditAmount;
          break;
        }
      }
    }

    // Fallback: try to match by amount
    if (!credits) {
      const priceCreditsMap: Record<number, number> = {
        2900: 15000,   // $29 = Starter
        4700: 25000,   // $47 = Growth
        9700: 55000,   // $97 = Scale
        19900: 120000, // $199 = Pro
      };
      credits = priceCreditsMap[amount] || null;
    }

    if (!credits) {
      console.error(`[WHOP WEBHOOK] Could not determine credits for plan ${planId} / ${planName}`);
      
      // Store for manual review
      await supabase.from("credit_orders").insert({
        user_id: userProfile.id,
        email: customerEmail,
        plan_name: planName || 'Unknown',
        status: 'pending_review',
        whop_payment_id: paymentId,
        notes: `Could not determine credits. Plan: ${planId}, Amount: ${amount}`,
      });
      
      return;
    }

    // Check for duplicate payment (idempotency)
    const { data: existingOrder } = await supabase
      .from("credit_orders")
      .select("id")
      .eq("whop_payment_id", paymentId)
      .single();

    if (existingOrder) {
      console.log(`[WHOP WEBHOOK] Payment ${paymentId} already processed`);
      return;
    }

    // Create credit order record
    const { data: order, error: orderError } = await supabase
      .from("credit_orders")
      .insert({
        user_id: userProfile.id,
        email: customerEmail,
        credits_amount: credits,
        plan_name: planName || `Plan (${credits.toLocaleString()} credits)`,
        status: "completed",
        payment_status: "paid",
        payment_method: "whop",
        whop_payment_id: paymentId,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error("[WHOP WEBHOOK] Error creating order record:", orderError);
      // Continue to add credits anyway
    }

    // Add credits to user account
    await addCredits(
      userProfile.id,
      credits,
      `Credit purchase: ${planName || 'Subscription'} (${credits.toLocaleString()} credits)`
    );

    console.log(
      `[WHOP WEBHOOK] Successfully added ${credits.toLocaleString()} credits to user ${userProfile.id} (${customerEmail})`
    );
  } catch (error) {
    console.error("[WHOP WEBHOOK] Error handling payment succeeded:", error);
    throw error;
  }
}

/**
 * Handle failed payment - just log it
 */
async function handlePaymentFailed(paymentData: any) {
  console.log("[WHOP WEBHOOK] Payment failed:", paymentData.id);
  // Optionally store failed payment attempts for analytics
}

/**
 * Handle refunded payment - deduct credits
 */
async function handlePaymentRefunded(paymentData: any) {
  const supabase = createServiceClient();

  try {
    const paymentId = paymentData.id;
    const customerEmail = paymentData.user?.email || paymentData.customer_email;

    // Find the original order
    const { data: order, error: orderError } = await supabase
      .from("credit_orders")
      .select("*")
      .eq("whop_payment_id", paymentId)
      .single();

    if (orderError || !order) {
      console.error(`[WHOP WEBHOOK] Original order not found for refund: ${paymentId}`);
      return;
    }

    // Deduct credits
    await deductCredits(
      order.user_id,
      order.credits_amount,
      undefined,
      `Refund: ${order.plan_name}`
    );

    // Update order status
    await supabase
      .from("credit_orders")
      .update({ payment_status: "refunded" })
      .eq("id", order.id);

    console.log(
      `[WHOP WEBHOOK] Refunded ${order.credits_amount} credits for payment ${paymentId}`
    );
  } catch (error) {
    console.error("[WHOP WEBHOOK] Error handling refund:", error);
    throw error;
  }
}

/**
 * Handle membership becoming valid (subscription renewal)
 */
async function handleMembershipValid(membershipData: any) {
  // This event fires when a subscription becomes/stays active
  // Could be used for subscription renewals
  console.log("[WHOP WEBHOOK] Membership valid:", membershipData.id);
  
  // For recurring subscriptions, you might want to add credits here too
  // Similar logic to handlePaymentSucceeded
}

// Disable body parsing to get raw body for signature verification
export const runtime = "nodejs";
