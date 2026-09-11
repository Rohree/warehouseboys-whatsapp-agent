# Meta Business Agent setup — run this once the admin clears the two blockers

## Prerequisites (admin does these first)

1. In WhatsApp Manager (Warehouse Boys business), **Add payment method** (top-of-page alert).
2. Same page, **Verify your business** ("Grow your business" → Get started).
3. Once eligibility clears, a **"Meta Business Agent"** tab should appear in WhatsApp Manager's
   left nav for the Warehouse Boys number. Open it and accept the **Meta Business Agent Terms of
   Service** there. (This is the step that was returning 403 on the Eligibility API before.)

Already done (don't repeat):
- System user + access token generated, saved in `.env` as `META_SYSTEM_USER_ACCESS_TOKEN`
  (scopes: `whatsapp_business_messaging`, `whatsapp_business_management`, no expiry).
- App (`Warehouse Boys WA Agent`, ID `1468097058495646`) subscribed to the WABA
  (`109113721786072/subscribed_apps` → `{"success":true}`).
- Netlify function deployed and verified: `https://warehouseboys-wa-lead.netlify.app/.netlify/functions/create-lead`.

Reference IDs (also in `.env`):
- WABA ID: `109113721786072`
- Phone number ID (`entity_id` for all agent_config/agent_connectors calls): `322686780008030`

## Once ToS is accepted, run these in order

All calls need `X-API-Version: 2.0.0` and `Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN`.

### 1. Re-check eligibility (should now succeed, not 403)
```bash
curl -s "https://api.facebook.com/322686780008030/agent_eligibility" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0"
```

### 2. Onboard the agent
```bash
curl -s -X POST "https://api.facebook.com/322686780008030/agent_onboarding/" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d '{}'
```
No catalog needed (that's only for product-catalog use cases). Save the returned `agent_id` if present.

### 3. Register the connector (our Netlify function)
`connector.json` has a `REPLACE_WITH_META_CONNECTOR_SHARED_SECRET` placeholder instead of the
real secret (this repo is public — the real value only lives in `.env`, gitignored). Substitute
it at run-time rather than editing the file:
```bash
sed "s/REPLACE_WITH_META_CONNECTOR_SHARED_SECRET/$META_CONNECTOR_SHARED_SECRET/" meta-agent/connector.json | \
curl -s -X POST "https://api.facebook.com/322686780008030/agent_connectors/" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d @-
```
Save the returned connector `id` — you need it for step 4.

### 4. Register the create_lead tool on that connector
```bash
curl -s -X POST "https://api.facebook.com/322686780008030/agent_connectors/<CONNECTOR_ID>/tools/" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d @meta-agent/connector-tool-create-lead.json
```

### 5. Test the tool directly before trusting the agent with it
```bash
curl -s -X POST "https://api.facebook.com/322686780008030/agent_connectors/<CONNECTOR_ID>/tools/<TOOL_ID>/run" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" \
  -d '{"input": "{\"customer_name\":\"Test Lead\",\"phone\":\"+27821234567\",\"category\":\"Custom Signage\"}"}'
```
Confirm it creates a real ClickUp task before moving on.

### 6. Add the qualifying-question skill
```bash
curl -s -X POST "https://api.facebook.com/322686780008030/agent_config/skills/" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d @meta-agent/skill-qualify-lead.json
```

### 7. Turn the agent on — test with an allowlist first, not EVERYONE
Important nuance from Meta's docs: enabling with `ai_audience: EVERYONE` requires the payment
method to be attached. Enabling with `ai_audience: ALLOWLISTED_ONLY` does **not** — so even if
billing isn't fully sorted yet, we can still test end-to-end with one or two real phone numbers.

Add a test consumer (use a real phone number in E.164 format, e.g. your own):
```bash
curl -s -X POST "https://api.facebook.com/322686780008030/agent_config/allowlist" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d '{"consumer_phone_number": "+27XXXXXXXXX"}'
```

Set the audience restriction:
```bash
curl -s -X PUT "https://api.facebook.com/322686780008030/agent_config/settings/" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d '{"ai_audience": "ALLOWLISTED_ONLY"}'
```

**Only after both of the above succeed**, turn the agent on:
```bash
curl -s -X PUT "https://api.facebook.com/322686780008030/agent_config/settings/" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d '{"rollout": {"enabled": true}}'
```

Then message the Warehouse Boys WhatsApp number from the allowlisted test phone and walk through
the qualifying questions live. Check the Netlify function logs and the ClickUp list to confirm
the lead lands correctly.

### 8. Go live to everyone (only once billing/verification is fully settled and the test above worked)
```bash
curl -s -X PUT "https://api.facebook.com/322686780008030/agent_config/settings/" \
  -H "Authorization: Bearer $META_SYSTEM_USER_ACCESS_TOKEN" -H "X-API-Version: 2.0.0" \
  -H "Content-Type: application/json" -d '{"ai_audience": "EVERYONE"}'
```

## Files in this folder
- `connector.json` — the Netlify function registered as a connector (bearer-token auth).
- `connector-tool-create-lead.json` — the `create_lead` operation definition, mirrors `openapi/create-lead.yaml`.
- `skill-qualify-lead.json` — the qualifying-question script as an agent Skill, mirrors the README's script.
