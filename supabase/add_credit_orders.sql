-- Credit Orders System Migration
-- Tracks credit purchase requests from users

-- Create credit_orders table
CREATE TABLE IF NOT EXISTS credit_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  credits_amount integer NOT NULL,
  plan_name text, -- e.g., 'Starter', 'Professional', 'Enterprise'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT NOW(),
  completed_at timestamptz,
  completed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL -- Admin who completed the order
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_credit_orders_user_id ON credit_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_orders_status ON credit_orders(status);
CREATE INDEX IF NOT EXISTS idx_credit_orders_created_at ON credit_orders(created_at DESC);

-- Enable Row Level Security
ALTER TABLE credit_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own orders
DO $$ BEGIN
  CREATE POLICY "Users can view their own credit orders"
    ON credit_orders FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users can create their own orders
DO $$ BEGIN
  CREATE POLICY "Users can create their own credit orders"
    ON credit_orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can do everything (for admin operations)
DO $$ BEGIN
  CREATE POLICY "Service role full access to credit_orders"
    ON credit_orders FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

