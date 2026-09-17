const axios = require('axios');

function apiUrl() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.META_SYSTEM_USER_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function send(payload) {
  const response = await axios.post(
    apiUrl(),
    { messaging_product: 'whatsapp', ...payload },
    { headers: authHeaders(), timeout: 10000 }
  );
  return response.data;
}

function sendText(to, body) {
  return send({ to, type: 'text', text: { body } });
}

// options: [{ id, title }], max 3 (WhatsApp button-message limit)
function sendButtons(to, bodyText, options) {
  return send({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: options.map((opt) => ({
          type: 'reply',
          reply: { id: opt.id, title: opt.title },
        })),
      },
    },
  });
}

// options: [{ id, title }], max 10 (WhatsApp list-message limit)
function sendList(to, bodyText, buttonText, options) {
  return send({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: [{ title: 'Options', rows: options.map((opt) => ({ id: opt.id, title: opt.title })) }],
      },
    },
  });
}

module.exports = { sendText, sendButtons, sendList };
