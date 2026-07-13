# Vercel environment check

Use this checklist before deploying Qlass or changing Supabase browser keys.

1. Open **Vercel → qlass → Settings → Environment Variables**.
2. Confirm both variables exist in **Production**, **Preview**, and
   **Development**:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-publishable-key
   ```

3. Confirm the browser variable is a Supabase publishable key only. Never put a
   secret/service key or database password in a `VITE_` variable.
4. Redeploy after changing a variable; Vite embeds `VITE_` values at build time.
5. Verify the login screen, a normal booking flow, and HN lookup in the new
   deployment before promoting it.

If the application reports a missing Supabase configuration, restore the last
known-good Vercel environment value and redeploy. This changes deployment
configuration only and does not affect database rows.

For the full legacy-to-publishable key migration, including Edge Functions and
GitHub Actions, follow [`docs/SUPABASE_KEY_HANDOVER.md`](docs/SUPABASE_KEY_HANDOVER.md).
