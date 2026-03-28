const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel

async function generateVoiceover(text, options = {}) {
  if (!API_KEY) return { success: false, error: 'ELEVENLABS_API_KEY not configured' };

  const voiceId = options.voice_id || DEFAULT_VOICE;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  console.log(`[ElevenLabs] Generating voiceover (${text.length} chars, voice: ${voiceId})`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.log(`[ElevenLabs] Error ${response.status}: ${errText}`);
      return { success: false, error: `ElevenLabs API returned ${response.status}: ${errText}` };
    }

    // Save audio file
    const audioDir = path.join(__dirname, '..', 'uploads', 'audio');
    fs.mkdirSync(audioDir, { recursive: true });

    const fileId = uuidv4();
    const filename = `${fileId}.mp3`;
    const filepath = path.join(audioDir, filename);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    console.log(`[ElevenLabs] Saved ${buffer.length} bytes to ${filepath}`);

    return {
      success: true,
      file_id: fileId,
      filename,
      url: `/uploads/audio/${filename}`,
      filepath,
      size_bytes: buffer.length,
    };
  } catch (err) {
    console.log(`[ElevenLabs] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { generateVoiceover };
