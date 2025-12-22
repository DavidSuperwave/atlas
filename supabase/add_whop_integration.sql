-- Whop Integration Database Migration
-- Adds support for Whop payment processing

-- Add Whop-related columns to credit_orders table
ALTER TABLE credit_orders 
ADD COLUMN IF NOT EXISTS whop_payment_id text,
ADD COLUMN IF NOT EXISTS whop_checkout_id text,
ADD COLUMN IF NOT EXISTS whop_plan_id text,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'manual' CHECK (payment_method IN ('manual', 'whop'));

-- Create indexes for Whop-related queries
CREATE INDEX IF NOT EXISTS idx_credit_orders_whop_payment_id ON credit_orders(whop_payment_id);
CREATE INDEX IF NOT EXISTS idx_credit_orders_whop_checkout_id ON credit_orders(whop_checkout_id);
CREATE INDEX IF NOT EXISTS idx_credit_orders_payment_status ON credit_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_credit_orders_payment_method ON credit_orders(payment_method);

-- Create whop_plans table to store Whop plan mappings
CREATE TABLE IF NOT EXISTS whop_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name text NOT NULL UNIQUE, -- 'Starter', 'Pro', 'Enterprise'
  whop_plan_id text NOT NULL UNIQUE,
  credits_amount integer NOT NULL,
  price_cents integer NOT NULL, -- Store in cents for accuracy
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Create index for whop_plans
CREATE INDEX IF NOT EXISTS idx_whop_plans_plan_name ON whop_plans(plan_name);
CREATE INDEX IF NOT EXISTS idx_whop_plans_whop_plan_id ON whop_plans(whop_plan_id);
CREATE INDEX IF NOT EXISTS idx_whop_plans_is_active ON whop_plans(is_active);

-- Enable Row Level Security for whop_plans
ALTER TABLE whop_plans ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whop_plans
-- Everyone can read active plans
DO $$ BEGIN
  CREATE POLICY "Anyone can view active whop plans"
    ON whop_plans FOR SELECT
    USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can do everything (for admin operations)
DO $$ BEGIN
  CREATE POLICY "Service role full access to whop_plans"
    ON whop_plans FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_whop_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_whop_plans_updated_at ON whop_plans;
CREATE TRIGGER trigger_update_whop_plans_updated_at
  BEFORE UPDATE ON whop_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_whop_plans_updated_at();

-- Optional: Create a view for credit orders with payment status
CREATE OR REPLACE VIEW credit_orders_with_payment_status AS
SELECT 
  co.*,
  wp.whop_plan_id,
  wp.price_cents,
  CASE 
    WHEN co.payment_method = 'whop' AND co.payment_status = 'paid' THEN 'completed'
    WHEN co.payment_method = 'whop' AND co.payment_status = 'failed' THEN 'failed'
    WHEN co.payment_method = 'whop' AND co.payment_status = 'pending' THEN 'pending'
    WHEN co.payment_method = 'manual' AND co.status = 'completed' THEN 'completed'
    WHEN co.payment_method = 'manual' AND co.status = 'pending' THEN 'pending'
    ELSE 'unknown'
  END as effective_status
FROM credit_orders co
LEFT JOIN whop_plans wp ON co.whop_plan_id = wp.whop_plan_id;

-- Add comments for documentation
COMMENT ON COLUMN credit_orders.whop_payment_id IS 'Whop payment ID from payment webhook';
COMMENT ON COLUMN credit_orders.whop_checkout_id IS 'Whop checkout ID used to create payment';
COMMENT ON COLUMN credit_orders.whop_plan_id IS 'Whop plan ID for the selected plan';
COMMENT ON COLUMN credit_orders.payment_status IS 'Payment status: pending, paid, failed, refunded';
COMMENT ON COLUMN credit_orders.payment_method IS 'Payment method: manual (admin approval) or whop (automated)';

