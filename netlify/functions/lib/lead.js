const axios = require('axios');

const CATEGORIES = ['Custom Signage', 'Gates', 'Architectural Features', 'Shop Product', 'Site Visit (Callout)', 'Other'];
const TIMELINES = ['ASAP', 'Within a month', '1-3 months', 'Just exploring'];

function leadStatus(timeline) {
  if (timeline === 'ASAP' || timeline === 'Within a month') return 'hot';
  if (timeline === '1-3 months') return 'warm';
  return 'cold';
}

async function createClickUpTask(lead) {
  const CLICKUP_TOKEN = process.env.CLICKUP_API_TOKEN;
  const LIST_ID = process.env.CLICKUP_LIST_ID_WHATSAPP_LEADS;

  if (!CLICKUP_TOKEN || !LIST_ID) {
    const err = new Error('Server misconfiguration: missing ClickUp token or list ID');
    err.statusCode = 500;
    throw err;
  }

  const { customer_name, phone, category, project_details, location, timeline, budget, opt_in } = lead;

  if (!customer_name || !phone || !category) {
    const err = new Error('Missing required fields: customer_name, phone, category');
    err.statusCode = 400;
    throw err;
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

    return { taskId: response.data.id, status };
  } catch (err) {
    const wrapped = new Error('Failed to create ClickUp task');
    wrapped.statusCode = err.response?.status || 500;
    wrapped.details = err.response?.data?.err || err.message;
    throw wrapped;
  }
}

module.exports = { CATEGORIES, TIMELINES, leadStatus, createClickUpTask };
