# 🚀 Quick Start: Run the Service System Migration

## Prerequisites
- PostgreSQL client installed (`psql`)
- Database credentials ready
- Backup created (recommended)

---

## Step 1: Backup Your Database (Optional but Recommended)

```bash
# Create backup
pg_dump "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" > backup_$(date +%Y%m%d).sql
```

---

## Step 2: Run the Migration

### Option A: Using psql (Recommended)

```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -f supabase/migrations/20251121_create_service_system.sql
```

### Option B: Using Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to SQL Editor
4. Copy contents of `supabase/migrations/20251121_create_service_system.sql`
5. Paste and run

---

## Step 3: Verify Migration Success

### Check Tables Were Created

```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "\dt service_*"
```

**Expected output:**
```
Schema | Name                      | Type  | Owner
public | service_categories        | table | postgres
public | service_items             | table | postgres
public | service_phase_templates   | table | postgres
public | service_search_analytics  | table | postgres
```

### Check Data Was Seeded

```bash
# Check service categories (should have 12 construction trades)
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT COUNT(*) FROM service_categories;"
```

**Expected:** 12 rows

```bash
# Check service items (should have ~48 items: 4 per trade)
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT COUNT(*) FROM service_items;"
```

**Expected:** ~48 rows

```bash
# View sample services
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT name, source FROM service_categories LIMIT 5;"
```

**Expected output:**
```
name              | source
Painting          | legacy
Tile Installation | legacy
Carpentry         | legacy
...
```

---

## Step 4: Test Search Functionality

```bash
# Test fuzzy search
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT * FROM search_services('paint');"
```

Should return Painting service with similarity score.

---

## Step 5: Test the App

1. Start the app: `npm start`
2. Go through onboarding
3. You should see the new service search screen
4. Try searching for:
   - "painting" (should find immediately)
   - "pool cleaning" (should trigger AI generation if not found)
   - "landscaping" (should find immediately)

---

## Troubleshooting

### Error: "relation 'service_categories' already exists"
**Solution:** Tables already created. Skip migration or drop tables first.

```bash
# Drop tables if you need to re-run
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "DROP TABLE IF EXISTS service_search_analytics, user_services, service_phase_templates, service_items, service_categories CASCADE;"
```

### Error: "extension 'pg_trgm' does not exist"
**Solution:** Enable extension first.

```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### Error: "function 'handle_updated_at' does not exist"
**Solution:** This function should exist from your original schema. Check:

```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "\df handle_updated_at"
```

If missing, add it from your main schema.sql file.

---

## What Happens After Migration?

✅ 12 construction trades now in database
✅ Each trade has 4 service items with default prices
✅ Phase templates seeded for painting, plumbing, electrical
✅ Search system ready to use
✅ AI generation ready for new services

---

## Testing AI Generation

After migration, test AI generation:

1. Open app
2. Start onboarding
3. Search for "pool cleaning"
4. If not in database, it will generate automatically
5. Check database again:

```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT name, source FROM service_categories WHERE source = 'ai_generated';"
```

Should show the AI-generated service!

---

## Rollback (If Needed)

If something goes wrong:

```bash
# Restore from backup
psql "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" < backup_20251121.sql
```

---

## Success Indicators

✅ Migration runs without errors
✅ 5 new tables created
✅ 12 services seeded
✅ ~48 service items created
✅ Phase templates visible
✅ Search function works
✅ App starts successfully
✅ New onboarding screen appears
✅ Can search and select services

---

## Next Steps After Migration

1. ✅ Migration complete
2. Test onboarding flow
3. Try AI service generation
4. Finish remaining development (Days 4-8)
5. Deploy to production

**You're ready to go!** 🚀
