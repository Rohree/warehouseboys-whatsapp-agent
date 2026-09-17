# Warehouse Boys WhatsApp Agent

Runs the WhatsApp lead-qualification conversation directly against WhatsApp's Cloud API and
logs the result as a ClickUp task. Built to bypass Meta Business Agent, which requires a
Tech Provider access-verification review that was still pending as of Sep 2026 — see
"Meta Business Agent (parked)" below if that ever clears.

## How it fits together

1. A customer messages the Warehouse Boys WhatsApp number. Meta's Cloud API delivers the
   message to `netlify/functions/whatsapp-webhook.js` via webhook.
2. That function walks the customer through a fixed qualifying-question script (see below),
   one WhatsApp interactive list/button message at a time, tracking progress per phone number
   in Netlify Blobs (`netlify/functions/lib/conversation-store.js`).
3. Once all questions are answered, it creates a task in the `CLICKUP_LIST_ID_WHATSAPP_LEADS`
   list via `netlify/functions/lib/lead.js` (shared ClickUp task-creation logic, tagged
   `hot` / `warm` / `cold` based on timeline) and sends a confirmation reply.
4. Outgoing WhatsApp messages (text, buttons, lists) go through
   `netlify/functions/lib/whatsapp.js`, a thin wrapper around the Graph API `/messages`
   endpoint.

This mirrors the pattern already used in `wb-website-v2/netlify/functions/clickUpCustom.js`
for the website's other lead forms.

## Qualifying question script

1. "Hi! Thanks for reaching out to Warehouse Boys 👋 What are you looking for?"
   — Custom Signage / Gates / Architectural Features / Shop Product / Site Visit (Callout) / Other
2. "Tell us briefly what you have in mind" (size, material, design idea)
3. "Where are you located?" (city/suburb)
4. "When do you need this by?" — ASAP / Within a month / 1-3 months / Just exploring
5. "Do you have a budget range in mind?"
6. "What's your name?"
7. "Can we send you offers and updates?" — Yes/No

Defined in `STEPS` in `whatsapp-webhook.js` — edit that array to change the script.

## Setup

```
npm install
cp .env.example .env   # fill in the values below
netlify dev             # runs on http://localhost:8889
```

Required env vars (see `.env.example`):

- `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID_WHATSAPP_LEADS` — where leads get logged.
- `WHATSAPP_PHONE_NUMBER_ID` — the Cloud API phone number ID messages are sent from.
- `META_SYSTEM_USER_ACCESS_TOKEN` — system user token with `whatsapp_business_messaging`
  scope, used to call the Graph API `/messages` endpoint.
- `META_WEBHOOK_VERIFY_TOKEN` — value Meta echoes back during the webhook verify handshake
  (GET request with `hub.mode`/`hub.verify_token`/`hub.challenge`).
- `META_CONNECTOR_SHARED_SECRET` — only used by `create-lead.js` (see below), not by the
  webhook flow.

## Deploying + registering the webhook with Meta

1. Deploy to Netlify (`netlify deploy --prod`). This site is **not** linked to GitHub for
   auto-deploy, so pushing to GitHub alone does not ship it — always deploy explicitly.
2. Sync env vars to the deployed site: `netlify env:import .env` (merges, use
   `--replace-existing` to overwrite instead).
3. In the Meta App Dashboard, under WhatsApp → Configuration → Webhook, set:
   - **Callback URL**: `https://<your-site>.netlify.app/.netlify/functions/whatsapp-webhook`
   - **Verify Token**: your `META_WEBHOOK_VERIFY_TOKEN` value
   - Click **Verify and Save**, then subscribe to the **`messages`** webhook field.

Test locally:

```bash
curl -X POST http://localhost:8889/.netlify/functions/whatsapp-webhook \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"27821234567","type":"text","text":{"body":"hi"}}]}}}]}]}'
```

## Meta Business Agent (parked)

`netlify/functions/create-lead.js` and the `meta-agent/` folder (connector/tool/skill
payloads + setup runbook) are left over from an earlier approach where Meta's own AI agent
would run the conversation and call `create-lead.js` as a tool once a lead was qualified.
That path is blocked on a Meta Tech Provider access-verification review with no ETA, so the
webhook approach above is the one actually running. If the Business Agent review ever
clears, `meta-agent/SETUP.md` still has the registration steps — otherwise these files can
be deleted.
