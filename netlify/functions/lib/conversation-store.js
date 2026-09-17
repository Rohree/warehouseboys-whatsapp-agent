const { getStore } = require('@netlify/blobs');

// Netlify Blobs needs a live Netlify runtime/site context. Outside of that (e.g. a plain
// `node script.js` run), fall back to an in-memory store so local testing still works -
// deployed function invocations always have the real context and use Blobs.
const memoryFallback = new Map();
let blobsAvailable = true;

function store() {
  return getStore('whatsapp-conversations');
}

async function getConversation(phone) {
  if (!blobsAvailable) return memoryFallback.get(phone) || null;
  try {
    return await store().get(phone, { type: 'json' });
  } catch (err) {
    blobsAvailable = false;
    return memoryFallback.get(phone) || null;
  }
}

async function saveConversation(phone, state) {
  if (!blobsAvailable) {
    memoryFallback.set(phone, state);
    return;
  }
  try {
    await store().setJSON(phone, state);
  } catch (err) {
    blobsAvailable = false;
    memoryFallback.set(phone, state);
  }
}

async function deleteConversation(phone) {
  if (!blobsAvailable) {
    memoryFallback.delete(phone);
    return;
  }
  try {
    await store().delete(phone);
  } catch (err) {
    blobsAvailable = false;
    memoryFallback.delete(phone);
  }
}

module.exports = { getConversation, saveConversation, deleteConversation };
