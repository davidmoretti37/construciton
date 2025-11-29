# ⚡ Quick Start - 5 Minutes to Launch

## Step 1: Run Migration (2 min)

```bash
cd /Users/david/Downloads/construction-manager

PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -f supabase/migrations/20251121_create_service_system.sql
```

**Success looks like:** Lots of `CREATE TABLE` and `INSERT` statements, ending with no errors.

---

## Step 2: Verify (30 sec)

```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT COUNT(*) FROM service_categories;"
```

**Expected:** `12`

---

## Step 3: Launch App (1 min)

```bash
npm start
```

---

## Step 4: Test It! (2 min)

1. Go through onboarding
2. Search for "painting" → ✓ Finds it
3. Search for "pool cleaning" → ✓ AI generates it!
4. Select a few services
5. Review phases → ✓ Dynamic
6. Enter prices → ✓ Custom
7. Done!

---

## ✅ You're Live!

Your app now works for:
- Construction
- Pool cleaning
- Landscaping
- Cleaning services
- **ANY service business!**

**Database will grow automatically as users search.**

---

## 📊 Monitor It

### Check Services:
```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT name, source, times_used FROM service_categories ORDER BY times_used DESC;"
```

### Check AI-Generated:
```bash
PGPASSWORD='KWnKr7Cy2MKzM6S5' /opt/homebrew/opt/postgresql@15/bin/psql \
  "postgresql://postgres.dmhpzutqzqerfprstioc:KWnKr7Cy2MKzM6S5@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  -c "SELECT name FROM service_categories WHERE source = 'ai_generated';"
```

---

## 🐛 Troubleshooting

**Tables already exist?**
→ Already migrated! Just test the app.

**AI not working?**
→ Check OpenRouter API key in `.env`

**Services not showing?**
→ Check database connection

---

## 📚 Full Docs

- `README_TRANSFORMATION.md` - Overview
- `IMPLEMENTATION_SUMMARY.md` - Technical details
- `FINAL_STATUS.md` - What's complete
- `RUN_MIGRATION.md` - Detailed migration guide

---

## 🎉 That's It!

**5 minutes and you have a universal service platform!**

Now go test it with:
- Pool cleaning
- Landscaping
- Pest control
- Window cleaning
- Whatever you want!

**The AI will handle it all.** 🚀
