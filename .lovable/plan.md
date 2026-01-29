
# Plan: Openverse API Registration Tool for Admin Dashboard

## Overview

Build an admin tool that registers your application with the Openverse API and displays the generated credentials. This eliminates the need for you to run curl commands manually.

---

## Architecture

```text
Admin Dashboard                     Edge Function                         Openverse API
     │                                   │                                      │
     ├── [Register & Get Keys] ─────────►│                                      │
     │   {name, email, description}      │                                      │
     │                                   ├── POST /v1/auth_tokens/register/ ───►│
     │                                   │   {name, email, description}         │
     │                                   │                                      │
     │                                   │◄── {client_id, client_secret} ───────┤
     │◄── Display in Modal ──────────────┤                                      │
     │   (copy buttons + warning)        │                                      │
```

---

## Implementation

### 1. Create Edge Function: `register-openverse`

**File:** `supabase/functions/register-openverse/index.ts`

```typescript
// Registers with Openverse API and returns credentials
// POST body: { name: string, email: string, description: string }
// Response: { client_id: string, client_secret: string, name: string }
```

Key logic:
- Validates input (name, email, description required)
- Sends POST to `https://api.openverse.engineering/v1/auth_tokens/register/`
- Returns the `client_id` and `client_secret` from Openverse
- Handles errors gracefully (rate limits, validation errors, etc.)

### 2. Update `supabase/config.toml`

Add the new function configuration:
```toml
[functions.register-openverse]
verify_jwt = false
```

### 3. Update Admin Dashboard UI

**File:** `src/pages/Admin.tsx`

Add a new "API Setup" section with:

| Element | Details |
|---------|---------|
| Card Header | "Openverse API Setup" with key icon |
| App Name Input | Default: "LoomPage Book Generator" |
| Email Input | Default: Current user's email (`user?.email`) |
| Description Input | Default: "Book generation tool for education" |
| Action Button | "Register & Get Keys" (loading state while processing) |

### 4. Credentials Modal

After successful registration, display a modal with:

```text
┌─────────────────────────────────────────────────────────┐
│  ✓ Openverse Credentials Generated                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️ IMPORTANT: Copy these now!                          │
│  Openverse will never show them again.                  │
│                                                         │
│  Client ID                                              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ abc123-def456-ghi789...             [Copy]      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Client Secret                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ xyz987-uvw654-rst321...             [Copy]      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Next: Add these as secrets in your project settings    │
│                                                         │
│                                    [Done]               │
└─────────────────────────────────────────────────────────┘
```

Features:
- Large, monospace font for credentials
- Individual "Copy" buttons for each field
- Toast notifications on copy success
- Warning styling (amber/yellow) for the "copy now" message

---

## About Auto-Save to Secrets

Unfortunately, programmatic saving to project secrets is not possible from within the application code. The secrets system requires manual input through the Lovable interface.

**Alternative workflow:**
1. After copying credentials, I can prompt you to add them
2. I'll use my tools to request the secret addition
3. You'll just paste the values in the modal that appears

This keeps the flow simple while maintaining security.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/register-openverse/index.ts` | Create - Edge function for Openverse registration |
| `supabase/config.toml` | Modify - Add function config |
| `src/pages/Admin.tsx` | Modify - Add API Setup section + Credentials modal |

---

## Security Notes

- Admin-only access (existing admin check protects the page)
- No secrets stored in code
- Credentials only displayed once in the browser (never persisted)
- Edge function proxies the request to avoid CORS issues
