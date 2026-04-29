# Two-way SMS

Twilio-backed SMS for Sylk. Each company gets one Twilio number, owners
send/receive in a unified inbox, inbound replies are threaded by phone.

## Environment

| Var | Required for | Notes |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | live sending | Without this we run in **mock mode** — outbound rows are persisted with `status='mock'` and no real SMS goes out. |
| `TWILIO_AUTH_TOKEN` | live sending + signature validation | |
| `TWILIO_WEBHOOK_BASE_URL` | webhook signature | Public URL of this backend (e.g. Railway). Required so Twilio's signature can be re-computed against the same URL it posted to. |

If creds are missing, every endpoint still works — useful for local dev,
CI, and demos. The frontend even synthesizes a fake company number on
first send.

## Schema

`public.sms_messages` — one row per inbound or outbound message.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | pk |
| company_id | uuid | owner profile id (the tenant) |
| customer_id | uuid \| null | FK to clients; null if the inbound number didn't match any client |
| direction | text | `'in'` or `'out'` |
| body | text | message body |
| from_number, to_number | text | E.164 strings |
| twilio_sid | text \| null | Twilio Message SID |
| status | text | `'queued' \| 'sent' \| 'delivered' \| 'failed' \| 'received' \| 'mock'` |
| error_message | text \| null | failure reason from Twilio |
| sent_by | uuid \| null | auth user who sent (owner or supervisor) |
| created_at | timestamptz | |
| read_at | timestamptz \| null | inbox marks read by setting this |

Plus `profiles.twilio_number`, `profiles.twilio_phone_sid`,
`profiles.business_phone_number`, `profiles.phone_provisioned_at`,
and `clients.sms_phone` for an SMS-preferred phone override.

## Endpoints

All authenticated routes expect `Authorization: Bearer <supabase-jwt>`.

### POST `/api/sms/send` — outbound message

```bash
curl -X POST "$API/api/sms/send" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"customerId":"5d…uuid…","body":"On my way, ETA 15 min."}'
```

Either `customerId` (preferred — links to thread + auto-resolves phone)
or `to` (raw phone) is required, plus `body`. Response includes the
inserted row + a `mock: true` flag when Twilio creds are missing.

Rate-limited to 30 sends per minute per user.

### GET `/api/sms/threads` — inbox list

```bash
curl "$API/api/sms/threads" -H "Authorization: Bearer $JWT"
```

Returns:

```json
{
  "threads": [
    {
      "key": "5d…",
      "customer_id": "5d…",
      "contact_phone": "+15551234567",
      "customer": { "id": "5d…", "full_name": "Smith Family", "phone": "…", "email": "…" },
      "last_message": { "id": "…", "direction": "in", "body": "…", "created_at": "…" },
      "message_count": 6,
      "unread_count": 2
    }
  ]
}
```

Threads are sorted unread-first, then most-recent first.

### GET `/api/sms/threads/:customerId` — full history

```bash
curl "$API/api/sms/threads/5d…uuid…" -H "Authorization: Bearer $JWT"
```

Returns `{ messages: [...] }` ordered oldest → newest, capped at 200.

### POST `/api/sms/threads/:customerId/read` — mark all read

```bash
curl -X POST "$API/api/sms/threads/5d…uuid…/read" \
  -H "Authorization: Bearer $JWT"
```

Sets `read_at = now()` on all unread inbound rows in that thread.

### POST `/api/sms/provision` — buy a Twilio number (owner only)

```bash
curl -X POST "$API/api/sms/provision" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"areaCode":"415"}'
```

Idempotent. Returns the existing number if one is already provisioned.
In mock mode it synthesizes a deterministic test number tied to
`company_id`.

### POST `/webhooks/twilio/sms` — Twilio inbound webhook

**Mounted outside `/api`** (see Notes) so it's reachable without auth.
Configure as the **Messaging URL** on your Twilio number. No JSON body —
Twilio sends `application/x-www-form-urlencoded`.

```bash
# Local-dev simulation (signature is bypassed when TWILIO_AUTH_TOKEN is unset):
curl -X POST "$API/webhooks/twilio/sms" \
  -d "From=%2B15551234567" \
  -d "To=%2B15559998888" \
  -d "Body=Hello+from+a+customer" \
  -d "MessageSid=SM_test_123"
```

The handler:

1. Validates `X-Twilio-Signature` against `TWILIO_AUTH_TOKEN` (skipped in mock mode).
2. Looks up the company by `To` number (`profiles.twilio_number` / `business_phone_number`).
3. Resolves the customer by `From` number against `clients.sms_phone || clients.phone`.
4. Persists the message and pushes a notification to the owner.
5. Responds with empty `<Response/>` TwiML.

If the `To` number doesn't match any company we ignore the inbound
silently — it's likely a stale Twilio number assignment.

## Foreman tools

The agent (Claude / Foreman) gets three tools for SMS work:

- `list_unread_sms` — show what's new
- `read_sms_thread` — read history with one customer (also marks read)
- `send_sms` — reply / proactively text a customer

The system prompt instructs Foreman to confirm recipient + body in the
same turn before firing `send_sms`, and to use `list_unread_sms` when
the user asks "any new texts?" / "what's in the inbox?".

## Push notifications

Inbound webhooks dispatch a push to the owner via `pushNotificationService`
with `data = { screen: 'Thread', params: { customerId, threadKey } }`.
The mobile `NotificationContext` response listener calls `navigate(...)`
on the shared `navigationRef`, so tapping a push deep-links straight
into the thread.

## Notes

The webhook is mounted at `/webhooks/twilio/sms` *outside* the `/api`
namespace. The geocoding router (mounted at `/api`) applies
`router.use(authenticateUser)` to every `/api/*` request, so any
unauthenticated webhook under `/api` would be rejected with 401 before
reaching its handler. This is a pre-existing constraint that affects
the Stripe webhook too — keeping Twilio webhooks outside `/api` is the
clean fix.

## Rollback

To disable: leave `TWILIO_ACCOUNT_SID` unset (mock mode), or comment
the two `app.use(...)` SMS mounts in `server.js`. Frontend gracefully
shows the "no messages" empty state when the API returns no threads.
