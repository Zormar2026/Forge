const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PICTORY_API_KEY = process.env.PICTORY_API_KEY || '';
const API_BASE = 'https://api.pictory.ai/pictoryapis/v1';

async function getToken() {
  if (!PICTORY_API_KEY) throw new Error('PICTORY_API_KEY not configured');
  return PICTORY_API_KEY;
}

async function createVideo(script, options = {}) {
  try {
    const token = await getToken();
    const { hook, body, cta, title, audio_url, keywords } = options;

    // Build keyword string for better stock footage selection
    const kw = (keywords || []).slice(0, 10).join(', ');

    const scenes = [];
    if (hook) scenes.push({ text: hook, voiceOver: true, splitTextOnNewLine: true, splitTextOnPeriod: true, ...(kw ? { keywords: kw } : {}) });
    if (body) scenes.push({ text: body, voiceOver: true, splitTextOnNewLine: true, splitTextOnPeriod: true, ...(kw ? { keywords: kw } : {}) });
    if (cta) scenes.push({ text: cta, voiceOver: true, splitTextOnNewLine: true, splitTextOnPeriod: true, ...(kw ? { keywords: kw } : {}) });

    const payload = {
      videoName: title || 'Forge Video',
      language: 'en',
      scenes,
    };

    // Attach voiceover audio — Pictory expects audioSettings at top level
    if (audio_url) {
      payload.audioSettings = {
        url: audio_url,
        aiVoiceOver: false,
      };
    }

    console.log(`[Pictory] Creating storyboard (${scenes.length} scenes)...`);

    const res = await fetch(`${API_BASE}/video/storyboard`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
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
