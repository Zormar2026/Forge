const API_BASE = 'https://api.late.com/api/v1';
const API_KEY = process.env.LATE_API_KEY || '';

async function lateRequest(endpoint, options = {}) {
  if (!API_KEY) throw new Error('LATE_API_KEY not configured');

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Late API returned ${res.status}`);
  }
  return data;
}

async function publish(platforms, content) {
  const { video_url, caption, title, brand_name } = content;
  const results = {};

  for (const platform of platforms) {
    try {
      console.log(`[Late] Publishing to ${platform}...`);
      const result = await lateRequest('/posts', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          media_url: video_url,
          caption: caption || `${title || 'New content'} by ${brand_name || 'Forge AI'}`,
          title: title || undefined,
          publish_now: true,
        }),
      });
      results[platform] = { success: true, post_id: result.id || result.post_id };
      console.log(`[Late] Published to ${platform}: ${result.id || result.post_id}`);
    } catch (err) {
      console.log(`[Late] Failed to publish to ${platform}: ${err.message}`);
      results[platform] = { success: false, error: err.message };
    }
  }

  return results;
}

async function schedulePost(platforms, content, scheduled_for) {
  const { video_url, caption, title, brand_name } = content;
  const results = {};

  for (const platform of platforms) {
    try {
      console.log(`[Late] Scheduling ${platform} for ${scheduled_for}...`);
      const result = await lateRequest('/posts', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          media_url: video_url,
          caption: caption || `${title || 'New content'} by ${brand_name || 'Forge AI'}`,
          title: title || undefined,
          scheduled_for,
        }),
      });
      results[platform] = { success: true, post_id: result.id || result.post_id };
      console.log(`[Late] Scheduled ${platform} for ${scheduled_for}`);
    } catch (err) {
      console.log(`[Late] Failed to schedule ${platform}: ${err.message}`);
      results[platform] = { success: false, error: err.message };
    }
  }

  return results;
}

module.exports = { publish, schedulePost };
