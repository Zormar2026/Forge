const EXTRACT_URL = process.env.EXTRACT_URL || 'http://37.27.89.250:8091';
const EXTRACT_ADMIN_KEY = process.env.EXTRACT_ADMIN_KEY || 'zormar2026';

async function analyze(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    console.log(`[Extract] POST ${EXTRACT_URL}/extract for: ${url}`);

    const response = await fetch(`${EXTRACT_URL}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': EXTRACT_ADMIN_KEY,
      },
      body: JSON.stringify({ url, depth: 'standard' }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      console.log(`[Extract] Error ${response.status}: ${text}`);
      return { success: false, error: `Extract API returned ${response.status}: ${text}` };
    }

    const raw = await response.json();
    console.log(`[Extract] Response keys: ${Object.keys(raw).join(', ')}`);

    if (!raw.success) {
      return { success: false, error: raw.error || 'Extract API returned unsuccessful' };
    }

    // The actual intelligence data is inside raw.intelligence
    const intel = raw.intelligence || {};
    console.log(`[Extract] Intelligence keys: ${Object.keys(intel).join(', ')}`);
    console.log(`[Extract] contentType: ${intel.contentType}`);
    console.log(`[Extract] transcript length: ${(intel.transcript || '').length}`);
    console.log(`[Extract] summary length: ${(intel.summary || '').length}`);

    // Return a flat object with source info merged in
    return {
      // Source metadata
      source_url: raw.source?.url || url,
      source_type: raw.source?.type || '',
      title: raw.source?.title || '',
      author: raw.source?.author || '',
      duration: raw.source?.duration || '',
      views: raw.source?.views || '',
      description: raw.source?.description || '',

      // Intelligence
      content_type: intel.contentType || 'unknown',
      transcript: intel.transcript || '',
      summary: intel.summary || '',
      key_topics: intel.keyTopics || [],
      key_insights: intel.keyInsights || [],
      quotes: intel.quotes || [],
      sentiment: intel.sentiment || '',
      target_audience: intel.targetAudience || '',
      action_items: intel.actionItems || [],
      monetization_angles: intel.monetizationAngles || [],
      script_hook: intel.scriptHook || '',
      speaker_analysis: intel.speakerAnalysis || {},
      emotional_triggers: intel.emotionalTriggers || [],
      viral_potential: intel.viralPotential || {},
      content_format: intel.contentFormatBreakdown || {},
      type_specific: intel.typeSpecific || {},
      quality_score: intel._qualityScore || 0,

      // Extra top-level fields
      ad_adaptations: raw.adAdaptations || null,
      depth: raw.depth || 'standard',
      from_cache: raw.fromCache || false,
    };
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
