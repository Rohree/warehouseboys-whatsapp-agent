const { CATEGORIES, TIMELINES, createClickUpTask } = require('./lib/lead');

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

  try {
    const { taskId, status } = await createClickUpTask(lead);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, taskId, status }),
    };
  } catch (err) {
    console.error('createClickUpTask error:', err.statusCode, err.details || err.message);
    return {
      statusCode: err.statusCode || 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message, details: err.details }),
    };
  }
};

module.exports.CATEGORIES = CATEGORIES;
module.exports.TIMELINES = TIMELINES;
