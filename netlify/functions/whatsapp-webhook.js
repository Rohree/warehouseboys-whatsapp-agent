const { CATEGORIES, TIMELINES, createClickUpTask } = require('./lib/lead');
const { sendText, sendButtons, sendList } = require('./lib/whatsapp');
const { getConversation, saveConversation, deleteConversation } = require('./lib/conversation-store');

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const STEPS = [
  {
    field: 'category',
    type: 'list',
    prompt: 'Hi! Thanks for reaching out to Warehouse Boys \u{1F44B} What are you looking for?',
    buttonText: 'Choose category',
    options: CATEGORIES.map((c) => ({ id: slug(c), title: c })),
  },
  {
    field: 'project_details',
    type: 'text',
    prompt: 'Tell us briefly what you have in mind (size, material, design idea).',
  },
  {
    field: 'location',
    type: 'text',
    prompt: 'Where are you located? (city/suburb)',
  },
  {
    field: 'timeline',
    type: 'list',
    prompt: 'When do you need this by?',
    buttonText: 'Choose timeline',
    options: TIMELINES.map((t) => ({ id: slug(t), title: t })),
  },
  {
    field: 'budget',
    type: 'text',
    prompt: 'Do you have a budget range in mind?',
  },
  {
    field: 'customer_name',
    type: 'text',
    prompt: "What's your name?",
  },
  {
    field: 'opt_in',
    type: 'buttons',
    prompt: 'Can we send you offers and updates?',
    options: [
      { id: 'yes', title: 'Yes' },
      { id: 'no', title: 'No' },
    ],
  },
];

function sendPrompt(to, step) {
  if (step.type === 'list') return sendList(to, step.prompt, step.buttonText, step.options);
  if (step.type === 'buttons') return sendButtons(to, step.prompt, step.options);
  return sendText(to, step.prompt);
}

// Returns the answer's display title, or null if the message doesn't match what this step expects.
function extractAnswer(step, message) {
  if (step.type === 'text') {
    if (message.type === 'text') return message.text.body.trim();
    return null;
  }
  if (step.type === 'list') {
    if (message.type === 'interactive' && message.interactive?.type === 'list_reply') {
      const reply = message.interactive.list_reply;
      const match = step.options.find((o) => o.id === reply.id);
      return match ? match.title : reply.title;
    }
    return null;
  }
  if (step.type === 'buttons') {
    if (message.type === 'interactive' && message.interactive?.type === 'button_reply') {
      const reply = message.interactive.button_reply;
      const match = step.options.find((o) => o.id === reply.id);
      return match ? match.title : reply.title;
    }
    return null;
  }
  return null;
}

async function finalizeLead(from, answers) {
  const lead = {
    customer_name: answers.customer_name,
    phone: from,
    category: answers.category,
    project_details: answers.project_details,
    location: answers.location,
    timeline: answers.timeline,
    budget: answers.budget,
    opt_in: answers.opt_in === 'Yes',
  };

  try {
    await createClickUpTask(lead);
    await sendText(from, "Thanks! We've got your details and someone from Warehouse Boys will be in touch soon. \u{1F64C}");
  } catch (err) {
    console.error('finalizeLead: createClickUpTask failed:', err.statusCode, err.details || err.message);
    await sendText(from, "Thanks for the info! We're processing your request and will be in touch soon.");
  }
}

async function handleMessage(message) {
  const from = message.from;
  const conversation = await getConversation(from);

  if (!conversation) {
    const firstStep = STEPS[0];
    await sendPrompt(from, firstStep);
    await saveConversation(from, { stepIndex: 0, answers: {} });
    return;
  }

  const step = STEPS[conversation.stepIndex];
  if (!step) {
    // Stale/finished conversation state that was never cleared - start over.
    await deleteConversation(from);
    return;
  }

  const answer = extractAnswer(step, message);
  if (answer === null) {
    // Didn't answer in the expected format - re-send the same prompt.
    await sendPrompt(from, step);
    return;
  }

  conversation.answers[step.field] = answer;
  conversation.stepIndex += 1;

  const nextStep = STEPS[conversation.stepIndex];
  if (!nextStep) {
    await finalizeLead(from, conversation.answers);
    await deleteConversation(from);
    return;
  }

  await sendPrompt(from, nextStep);
  await saveConversation(from, conversation);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    if (params['hub.mode'] === 'subscribe' && params['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return { statusCode: 200, body: params['hub.challenge'] || '' };
    }
    return { statusCode: 403, body: 'Verification failed' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  try {
    const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages || [];
    for (const message of messages) {
      await handleMessage(message);
    }
  } catch (err) {
    // Log and still ack 200 - returning an error status makes Meta retry the same
    // webhook delivery, which would just repeat whatever failed.
    console.error('whatsapp-webhook: unhandled error processing payload:', err);
  }

  return { statusCode: 200, body: 'EVENT_RECEIVED' };
};
