const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CLIENT_ID = process.env.PICTORY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PICTORY_CLIENT_SECRET || '';
const AUTH_URL = 'https://api.pictory.ai/pictoryapis/v1/oauth2/token';
const API_BASE = 'https://api.pictory.ai/pictoryapis/v1';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('PICTORY_CLIENT_ID or PICTORY_CLIENT_SECRET not configured');
  }

  console.log('[Pictory] Authenticating...');
  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pictory auth failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token || data.token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
  console.log('[Pictory] Authenticated');
  return cachedToken;
}

async function createVideo(script, options = {}) {
  try {
    const token = await getToken();
    const { hook, body, cta, title, audio_url } = options;

    const scenes = [];
    if (hook) scenes.push({ text: hook, voiceOver: true, splitTextOnNewLine: true, splitTextOnPeriod: true });
    if (body) scenes.push({ text: body, voiceOver: true, splitTextOnNewLine: true, splitTextOnPeriod: true });
    if (cta) scenes.push({ text: cta, voiceOver: true, splitTextOnNewLine: true, splitTextOnPeriod: true });

    const payload = {
      videoName: title || 'Forge Video',
      language: 'en',
      scenes,
    };

    if (audio_url) payload.audio = { url: audio_url };

    console.log(`[Pictory] Creating storyboard (${scenes.length} scenes)...`);

    const res = await fetch(`${API_BASE}/video/storyboard`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Pictory-User-Id': CLIENT_ID,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.log(`[Pictory] Storyboard error ${res.status}: ${text}`);
      return { success: false, error: `Pictory storyboard failed ${res.status}: ${text}` };
    }

    const job = await res.json();
    const jobId = job.jobId || job.job_id || job.data?.jobId;
    console.log(`[Pictory] Job created: ${jobId}`);

    if (!jobId) {
      return { success: false, error: 'No job ID returned from Pictory' };
    }

    // Poll for completion
    const result = await pollJob(token, jobId);
    return result;
  } catch (err) {
    console.log(`[Pictory] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function pollJob(token, jobId) {
  const maxAttempts = 60; // 10 minutes max
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000));

    try {
      const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Pictory-User-Id': CLIENT_ID,
        },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const status = data.status || data.data?.status;
      console.log(`[Pictory] Job ${jobId} status: ${status} (attempt ${i + 1})`);

      if (status === 'completed' || status === 'complete' || status === 'done') {
        const videoUrl = data.videoURL || data.video_url || data.data?.videoURL || data.data?.video_url;

        if (videoUrl) {
          // Download video
          const videoDir = path.join(__dirname, '..', 'uploads', 'videos');
          fs.mkdirSync(videoDir, { recursive: true });

          const fileId = uuidv4();
          const filename = `${fileId}.mp4`;
          const filepath = path.join(videoDir, filename);

          const videoRes = await fetch(videoUrl);
          if (videoRes.ok) {
            const buffer = Buffer.from(await videoRes.arrayBuffer());
            fs.writeFileSync(filepath, buffer);
            console.log(`[Pictory] Video saved: ${filepath} (${buffer.length} bytes)`);

            return {
              success: true,
              file_id: fileId,
              filename,
              url: `/uploads/videos/${filename}`,
              filepath,
              size_bytes: buffer.length,
              remote_url: videoUrl,
            };
          }
        }

        return {
          success: true,
          remote_url: videoUrl || null,
          message: 'Video completed but could not download',
        };
      }

      if (status === 'failed' || status === 'error') {
        return { success: false, error: data.error || data.message || 'Pictory job failed' };
      }
    } catch {
      // Continue polling
    }
  }

  return { success: false, error: 'Pictory video creation timed out after 10 minutes' };
}

module.exports = { createVideo };
