const EXTRACT_URL = process.env.EXTRACT_URL || 'http://37.27.89.250:8091';
const EXTRACT_ADMIN_KEY = process.env.EXTRACT_ADMIN_KEY || '';

async function analyze(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const headers = { 'Content-Type': 'application/json' };
    if (EXTRACT_ADMIN_KEY) {
      headers['x-admin-key'] = EXTRACT_ADMIN_KEY;
    }

    console.log(`[Extract] Calling ${EXTRACT_URL}/extract for: ${url}`);

    const response = await fetch(`${EXTRACT_URL}/extract`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      console.log(`[Extract] Error ${response.status}: ${text}`);
      return { success: false, error: `Extract API returned ${response.status}: ${text}` };
    }

    const data = await response.json();

    // Log the full response for debugging
    console.log(`[Extract] Response keys: ${Object.keys(data).join(', ')}`);
    console.log(`[Extract] Transcript length: ${(data.transcript || data.text || '').length}`);
    console.log(`[Extract] Has hooks: ${!!(data.hooks && data.hooks.length)}`);

    // Flag whether transcript is present
    const transcript = data.transcript || data.text || '';
    data._has_transcript = transcript.length > 0;

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log(`[Extract] Timeout for: ${url}`);
      return { success: false, error: 'Extract API request timed out after 120 seconds' };
    }
    console.log(`[Extract] Error: ${err.message}`);
    return { success: false, error: err.message || 'Unknown error contacting Extract API' };
  }
}

module.exports = { analyze };
