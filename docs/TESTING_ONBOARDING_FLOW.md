# Testing the Onboarding Flow

## Prerequisites

1. Make sure your `.env.local` has:
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   RESEND_API_KEY=your-resend-key
   RESEND_FROM_EMAIL=noreply@atlasv2.com
   ```

2. Run the database migration:
   ```sql
   -- Run in Supabase SQL Editor
   -- See supabase/add_onboarding_fields.sql
   ```

3. Start your dev server:
   ```bash
   npm run dev
   ```

## Test Flow 1: Access Request → Approval → Onboarding

### Step 1: Submit Access Request
1. Go to `http://localhost:3000/`
2. Click "REQUEST ACCESS"
3. Fill out the form:
   - Name: Test User
   - Email: test@example.com (use a real email you can access)
   - Intent: Testing onboarding flow
   - Optional fields as needed
4. Submit the form
5. ✅ **Check:** You should see "Request Received" confirmation

### Step 2: Approve Access Request (Admin)
1. Log in as admin
2. Go to `/admin/access-requests`
3. Find the pending request you just created
4. Click "Approve & Invite"
5. ✅ **Check:** 
   - Success message: "Onboarding invite sent to test@example.com"
   - Request status changes to "Approved"
   - Check your email inbox for the invite email

### Step 3: Complete Onboarding
1. Open the email you received
2. Click "Complete Onboarding" button (should link to `/onboarding?token=...`)
3. ✅ **Check:** Onboarding page loads with token validation
4. **Step 1 - Account Creation:**
   - Name should be pre-filled (if from access request)
   - Email should be pre-filled and read-only
   - Enter password (min 6 characters)
   - Confirm password
   - Select Apollo account status (required)
   - Click "Continue"
5. ✅ **Check:** Moves to Step 2
6. **Step 2 - API Keys (Optional):**
   - Should show placeholder
   - Click "Skip" or "Continue"
7. ✅ **Check:** Moves to Step 3
8. **Step 3 - Credits (Optional):**
   - Should show 1000 free credits
   - Select a plan or click "Skip"
   - Click "Complete Setup"
9. ✅ **Check:** 
   - Shows "Welcome to Atlas" animation
   - After 3 seconds, shows completion screen with video placeholder
   - Shows Telegram contact info
   - Shows "Go to Login" button

### Step 4: Verify Account Creation
1. Click "Go to Login" or navigate to `/login`
2. Log in with:
   - Email: test@example.com
   - Password: (the one you set)
3. ✅ **Check:** 
   - Should log in successfully
   - Should redirect to `/dashboard`
   - User should have 1000 credits
   - User profile should have onboarding fields set

## Test Flow 2: Direct Invite (Skip Access Request)

### Step 1: Send Direct Invite (Admin)
1. Log in as admin
2. Go to `/admin/invites`
3. Enter an email address
4. Click "Send Invite"
5. ✅ **Check:** 
   - Success message appears
   - Invite appears in the invites list
   - Email is sent to the address

### Step 2: Complete Onboarding
1. Open the email
2. Click the onboarding link
3. Complete the onboarding flow (same as Flow 1, Step 3)
4. ✅ **Check:** Account is created successfully

## Test Flow 3: Resend Invite

### Step 1: Resend for Approved Request
1. Go to `/admin/access-requests`
2. Filter to "Approved"
3. Find an approved request with an invite
4. Click "Resend Email"
5. ✅ **Check:** 
   - Success message appears
   - New email is sent
   - Link in new email works

### Step 2: Resend Used Invite
1. Go to `/admin/invites`
2. Find a used invite
3. Click "Resend"
4. ✅ **Check:** 
   - New invite is created automatically
   - New email is sent with new token
   - New token works for onboarding

## Testing Checklist

### Email Testing
- [ ] Invite email is received
- [ ] Email layout renders correctly (no layout shifts)
- [ ] "Complete Onboarding" button links to correct URL
- [ ] Email shows correct expiration date
- [ ] Resend emails work correctly

### Onboarding Page Testing
- [ ] Page loads with valid token
- [ ] Page rejects invalid/expired tokens
- [ ] Step 1 form validation works
- [ ] Apollo account selection is required
- [ ] Step 2 can be skipped
- [ ] Step 3 can be skipped
- [ ] Form submission creates account
- [ ] Welcome animation displays
- [ ] Completion screen shows correctly

### Account Creation Testing
- [ ] Account is created in Supabase Auth
- [ ] User profile is created/updated
- [ ] User receives 1000 free credits
- [ ] Onboarding fields are saved (has_apollo_account, etc.)
- [ ] Invite is marked as used
- [ ] Access request status is updated

### Login Testing
- [ ] User can log in immediately after onboarding
- [ ] No email confirmation required (if disabled)
- [ ] User is redirected to dashboard
- [ ] User session persists

## Common Issues & Solutions

### Issue: "Invalid invite token"
- **Check:** Token in URL matches database
- **Check:** Invite hasn't expired
- **Check:** Invite hasn't been used already
- **Solution:** Resend invite to get new token

### Issue: "Email not sending"
- **Check:** `RESEND_API_KEY` is set correctly
- **Check:** `RESEND_FROM_EMAIL` uses verified domain
- **Check:** Resend domain is verified in Resend dashboard
- **Solution:** Verify domain in Resend, check API key

### Issue: "Account creation fails"
- **Check:** `SUPABASE_SERVICE_ROLE_KEY` is set
- **Check:** Supabase Auth settings allow account creation
- **Check:** Database migration ran successfully
- **Solution:** Check Supabase logs, verify service role key

### Issue: "Can't log in after onboarding"
- **Check:** Email confirmation is disabled in Supabase
- **Check:** Account was created successfully
- **Check:** Password is correct
- **Solution:** Disable email confirmation OR configure Resend SMTP

## Debugging Tips

1. **Check browser console** for client-side errors
2. **Check server logs** for API errors
3. **Check Supabase logs** for database/auth errors
4. **Check Resend dashboard** for email delivery status
5. **Use Network tab** to inspect API requests/responses

## Quick Test Commands

```bash
# Check if onboarding route exists
curl http://localhost:3000/onboarding?token=test

# Check API endpoint
curl -X POST http://localhost:3000/api/onboarding/complete \
  -H "Content-Type: application/json" \
  -d '{"token":"test","name":"Test","password":"test123","hasApolloAccount":true}'

# Check invite validation
curl http://localhost:3000/api/admin/invites/validate?token=YOUR_TOKEN
```

