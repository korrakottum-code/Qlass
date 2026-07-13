# Supabase setup

Qlass is a production clinic application. Configure environments through
Supabase and Vercel; never place service credentials in source files or a
browser-visible `VITE_` variable.

## Browser configuration

Create a local `.env` from `.env.example` and set:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

`VITE_SUPABASE_ANON_KEY` is the historical name used by the app. Its value is
intended to be a public browser key, not a service credential. Use a Supabase
publishable key when the project has completed the key handover.

## Server configuration

Edge Functions receive their service credential through Supabase Function
Secrets. GitHub Actions receives sync credentials through GitHub Actions
Secrets. Do not copy either value into a Vercel `VITE_` variable, `.env.example`,
or documentation.

## Database access

Keep Row Level Security enabled on exposed tables and create explicit policies
for each supported access path. Do not disable RLS as a deployment shortcut.
Server-only operations must use a dedicated function or CI path with the
minimum required privileges.

## Key handover

The exact rollout order, consumer inventory, validation and rollback are in
[`docs/SUPABASE_KEY_HANDOVER.md`](docs/SUPABASE_KEY_HANDOVER.md).
