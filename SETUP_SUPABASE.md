# Supabase Setup Guide

## ⚠️ IMPORTANT: Required Before Running the App

The app **WILL NOT WORK** without Supabase credentials. Authentication, language selection, and data storage all require Supabase.

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click **"New Project"**
4. Fill in:
   - **Project name**: construction-manager (or any name)
   - **Database password**: Choose a strong password (save this!)
   - **Region**: Choose closest to you
5. Wait for project to initialize (~2 minutes)

## Step 2: Get Your Credentials

1. In your Supabase dashboard, go to **Settings** (left sidebar)
2. Click **API** section
3. You'll see:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **Project API keys** > **anon public** (long key starting with `eyJ...`)

## Step 3: Create .env File

1. In the project root directory, create a file named `.env`
2. Add your credentials:

```env
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...

# OpenRouter API (optional - for AI features)
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

⚠️ **Replace the values with YOUR actual credentials from Step 2!**

## Step 4: Run Database Migrations

1. Go to your Supabase dashboard
2. Click **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste the contents of `supabase/schema.sql`
5. Click **Run** or press `Ctrl+Enter`
6. You should see "Success. No rows returned"

## Step 5: Verify Setup

1. Restart your app: `npm start` or `expo start`
2. Check the console logs
3. You should **NOT** see any "❌ SUPABASE NOT CONFIGURED" errors
4. You should see logs like:
   ```
   🔐 AUTH CHECK - Session: NOT LOGGED IN
   📱 NAVIGATION DECISION:
      ➡️ Showing: LOGIN SCREEN
   ```

## Troubleshooting

### Problem: "❌ SUPABASE NOT CONFIGURED" error

**Solution:**
- Make sure `.env` file exists in the project root
- Check that variable names are exactly: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Restart the app after creating/editing `.env`

### Problem: "Invalid API key" error

**Solution:**
- Double-check you copied the **anon public** key, not the service_role key
- Make sure there are no extra spaces or line breaks in the key

### Problem: Can't see login screen

**Solution:**
- Check console for Supabase errors
- Make sure you ran the database migrations (Step 4)
- Try: `expo start --clear` to clear cache

## Security Notes

- ✅ The **anon public** key is safe to include in your app
- ❌ **NEVER** commit your `.env` file to git (it's already in `.gitignore`)
- ❌ **NEVER** use the `service_role` key in your app - it bypasses security
- ✅ Row Level Security (RLS) is enabled to protect user data

## Need Help?

Check the Supabase docs: https://supabase.com/docs
