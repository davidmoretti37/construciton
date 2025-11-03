# Supabase Setup Guide

This app uses Supabase for user authentication and data storage. Follow these steps to complete the setup.

## ✅ What's Already Done

- ✅ Supabase client configured (`src/lib/supabase.js`)
- ✅ Authentication screens (Login/Signup)
- ✅ Storage layer migrated to Supabase (`src/utils/storage.js`)
- ✅ App.js updated to handle auth state
- ✅ Environment variables added to `.env`

## 🔧 Steps to Complete Setup

### 1. Run the Database Schema

You need to create the `profiles` table in your Supabase database.

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase/schema.sql`
5. Paste it into the SQL editor
6. Click **Run** to execute the SQL

This will create:
- ✅ `profiles` table to store user business info and pricing
- ✅ Row Level Security (RLS) policies for data protection
- ✅ Automatic profile creation trigger when users sign up
- ✅ Automatic timestamp updates

### 2. Verify the Table Was Created

1. In Supabase dashboard, go to **Table Editor**
2. You should see a `profiles` table with these columns:
   - `id` (uuid, references auth.users)
   - `business_name` (text)
   - `business_phone` (text)
   - `business_email` (text)
   - `trades` (text[])
   - `pricing` (jsonb)
   - `is_onboarded` (boolean)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

### 3. Test the Setup

1. **Start the app**:
   ```bash
   npm start
   ```

2. **Sign up a new user**:
   - You should see the login screen
   - Click "Sign Up"
   - Create an account with email/password
   - Check your email for verification (optional for development)

3. **Complete onboarding**:
   - After signing up, you'll go through onboarding
   - Select your trades
   - Enter business info
   - Set up pricing
   - This data is now saved to Supabase!

4. **Verify data in Supabase**:
   - Go to Supabase **Table Editor** → `profiles`
   - You should see your user's profile with all the data

### 4. Enable Email Confirmation (Optional)

By default, Supabase requires email confirmation. For development, you can disable it:

1. Go to **Authentication** → **Settings** in Supabase dashboard
2. Under "User Signups", toggle off **"Enable email confirmations"**
3. Click **Save**

This allows users to login immediately without verifying their email.

## 🔐 Security Notes

### Important: Don't Use Service Role Key in Client App

The `.env` file contains both the anon key and service role key. **ONLY use the anon key in your React Native app!**

- ✅ `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Safe to use in client
- ❌ `EXPO_PUBLIC_SERVICE_ROLE_KEY` - Should only be used server-side

The current implementation correctly uses only the anon key. The service role key is included for potential future server-side operations.

### Row Level Security (RLS)

RLS is enabled on the `profiles` table, meaning:
- Users can only read their own profile
- Users can only update their own profile
- Users cannot access other users' data

This is enforced at the database level for security.

## 📱 How It Works

### Authentication Flow

1. **No Session** → Show Login/Signup screens
2. **Logged In but Not Onboarded** → Show Onboarding flow
3. **Logged In and Onboarded** → Show Main App

### Data Sync

- All user profile data (business info, trades, pricing) is stored in Supabase
- Changes sync across devices automatically
- Data persists even if the app is uninstalled
- Each user's data is isolated and secure

### Testing Different States

**Test new user signup:**
```javascript
// In your browser or SQL editor, delete test users
// Go to Supabase → Authentication → Users → Delete user
```

**Test onboarding again:**
```javascript
// In SQL editor, reset onboarding status
UPDATE profiles SET is_onboarded = false WHERE id = 'your-user-id';
```

**Test logout:**
- Go to Settings tab
- Click "Logout" button
- You'll be returned to login screen

## 🐛 Troubleshooting

### "No user logged in" errors
- Make sure you're signed in
- Check that the Supabase credentials in `.env` are correct
- Verify the schema was created successfully

### Can't sign up
- Check that email confirmations are disabled (or check your email)
- Verify network connection
- Check Supabase dashboard for errors in logs

### Profile data not saving
- Verify the `profiles` table exists
- Check that RLS policies were created
- Look for errors in the console logs

### Auth state not updating
- Make sure App.js is listening to `onAuthStateChange`
- Check that navigation is working properly
- Clear app data and reinstall if needed

## 🚀 What's Next

Your app now has:
- ✅ User authentication with email/password
- ✅ Secure data storage per user
- ✅ Multi-device support
- ✅ Automatic data backup
- ✅ Onboarding flow
- ✅ Settings to edit profile and pricing

You can now focus on adding more features like:
- Projects management
- Worker tracking
- Photo uploads
- Estimate history
- Client database

All of these can be stored in Supabase with the same RLS security model!
