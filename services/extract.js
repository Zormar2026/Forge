const EXTRACT_URL = process.env.EXTRACT_URL || 'http://37.27.89.250:8091';

async function analyze(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(`${EXTRACT_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      return { success: false, error: `Extract API returned ${response.status}: ${text}` };
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Extract API request timed out after 120 seconds' };
    }
    return { success: false, error: err.message || 'Unknown error contacting Extract API' };
  }
}

module.exports = { analyze };
