# Warehouse Boys WhatsApp Agent

Connects Meta Business Agent (running on the Warehouse Boys WhatsApp number) to ClickUp.
Meta's AI runs the actual lead-qualification conversation in WhatsApp; this repo is just
the one API endpoint it calls once a lead is qualified, which logs the lead as a ClickUp task.

## How it fits together

1. **Meta Business Agent** (configured in Meta Business Suite, on the existing WhatsApp
   Business Account) has a "skill"/knowledge source describing Warehouse Boys and a
   qualifying question script (see below).
2. It's registered with a **custom connector** pointing at `openapi/create-lead.yaml`,
   so the agent can call `POST /create-lead` as a tool once it has collected the answers.
3. `netlify/functions/create-lead.js` receives that call and creates a task in the
   `CLICKUP_LIST_ID_WHATSAPP_LEADS` list, tagged `hot` / `warm` / `cold` based on timeline.

This mirrors the pattern already used in `wb-website-v2/netlify/functions/clickUpCustom.js`
for the website's other lead forms.

## Qualifying question script (configure in Meta Business Suite's Business Agent settings)

1. "Hi! Thanks for reaching out to Warehouse Boys. What are you looking for?"
   — Custom Signage / Gates / Architectural Features / Shop Product / Site Visit (Callout) / Other
2. "Tell us briefly what you have in mind" (size, material, design idea)
3. "Where are you located?" (city/suburb)
4. "When do you need this by?" — ASAP / Within a month / 1-3 months / Just exploring
5. "Do you have a budget range in mind?"
6. "What's your name?"
7. "Can we send you offers and updates?" — Yes/No

Once all answered, the agent should call the `createLead` action with the collected values.

## Setup

```
npm install
cp .env.example .env   # fill in CLICKUP_API_TOKEN, CLICKUP_LIST_ID_WHATSAPP_LEADS
netlify dev             # runs on http://localhost:8889
```

Test locally:

```bash
curl -X POST http://localhost:8889/.netlify/functions/create-lead \
  -H "Content-Type: application/json" \
  -d '{"customer_name":"Test Lead","phone":"+27821234567","category":"Custom Signage","project_details":"1m steel house number sign","location":"Cape Town","timeline":"Within a month","budget":"R2000-R4000","opt_in":true}'
```

## Deploying + registering with Meta

1. Deploy this to Netlify, note the live URL.
2. Update `servers.url` in `openapi/create-lead.yaml` to the deployed URL.
3. Set `META_CONNECTOR_SHARED_SECRET` in the Netlify site's environment variables, and
   configure the same value as the bearer token when registering the custom connector
   in Meta Business Agent Platform.
4. In Meta Business Suite → Business Agent settings for the Warehouse Boys number:
   register the custom connector using the OpenAPI spec above, and add the qualifying
   question script as a skill/instruction.

## Known unknowns — verify against real traffic before relying on this

Meta's exact request format for custom connector calls (auth header style, whether it
follows the general WhatsApp webhook envelope vs. a direct tool-call body) wasn't fully
documented as of this build (Aug 2026). `create-lead.js` logs the full incoming payload
on every call — check Netlify function logs after the first real test message and adjust
field parsing/auth if Meta's actual payload shape differs from what's assumed here.
