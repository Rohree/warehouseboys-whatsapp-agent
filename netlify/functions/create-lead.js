const axios = require('axios');

const CATEGORIES = ['Custom Signage', 'Gates', 'Architectural Features', 'Shop Product', 'Site Visit (Callout)', 'Other'];
const TIMELINES = ['ASAP', 'Within a month', '1-3 months', 'Just exploring'];

function leadStatus(timeline) {
  if (timeline === 'ASAP' || timeline === 'Within a month') return 'hot';
  if (timeline === '1-3 months') return 'warm';
  return 'cold';
}

function checkAuth(event) {
  const expected = process.env.META_CONNECTOR_SHARED_SECRET;
  if (!expected) return true;
  const header = event.headers.authorization || event.headers.Authorization || '';
  return header === `Bearer ${expected}`;
}

exports.handler = async (event) => {
  // Meta's standard webhook verification handshake (only relevant if the connector
  // setup requires it - harmless to support either way).
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    if (params['hub.mode'] === 'subscribe' && params['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return { statusCode: 200, body: params['hub.challenge'] || '' };
    }
    return { statusCode: 403, body: 'Verification failed' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (!checkAuth(event)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
  const LIST_ID = process.env.CLICKUP_LIST_ID_WHATSAPP_LEADS;

  if (!CLICKUP_TOKEN || !LIST_ID) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server misconfiguration: missing ClickUp token or list ID' }),
    };
  }

  let lead;
  try {
    lead = JSON.parse(event.body);
    console.log('Lead payload from Meta Business Agent:', JSON.stringify(lead, null, 2));
  } catch (err) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  const { customer_name, phone, category, project_details, location, timeline, budget, opt_in } = lead;

  if (!customer_name || !phone || !category) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields: customer_name, phone, category' }),
    };
  }

  const status = leadStatus(timeline);

  const task = {
    name: `WhatsApp Lead: ${customer_name} (${category})`,
    description: `
**Contact Information:**
- **Name:** ${customer_name}
- **WhatsApp:** ${phone}

**Enquiry:**
- **Category:** ${category}
- **Details:** ${project_details || 'Not provided'}
- **Location:** ${location || 'Not provided'}
- **Timeline:** ${timeline || 'Not provided'}
- **Budget:** ${budget || 'Not provided'}
- **Opted in to promotions:** ${opt_in === true ? 'Yes' : opt_in === false ? 'No' : 'Not answered'}

**Lead status:** ${status.toUpperCase()}
**Submitted:** ${new Date().toLocaleString()}
    `.trim(),
    tags: ['whatsapp-lead', status, category.toLowerCase().replace(/\s+/g, '-')],
    custom_fields: [],
  };

  try {
    const response = await axios.post(
      `https://api.clickup.com/api/v2/list/${LIST_ID}/task`,
      task,
      {
        headers: {
          Authorization: CLICKUP_TOKEN,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, taskId: response.data.id, status }),
    };
  } catch (err) {
    console.error('ClickUp API error:', err.response?.status, err.response?.data || err.message);
    return {
      statusCode: err.response?.status || 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to create ClickUp task',
        details: err.response?.data?.err || err.message,
      }),
    };
  }
};

module.exports.CATEGORIES = CATEGORIES;
module.exports.TIMELINES = TIMELINES;
