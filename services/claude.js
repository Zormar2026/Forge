const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const MODEL = 'claude-sonnet-4-20250514';

const FORGE_SYSTEM = `You are Forge AI's content engine. Your philosophy:

1. HOOKS are everything. The first 1-3 seconds decide if someone watches or scrolls. A hook must create an open loop, call out a specific pain, or make a bold claim that demands attention.

2. Every piece of content serves a FUNNEL STAGE:
   - Awareness: Broad pain/desire. Goal is reach and follows.
   - Interest: Specific problem education. Goal is engagement and saves.
   - Desire: Transformation proof and social proof. Goal is DMs and clicks.
   - Action: Direct offer with urgency and risk reversal. Goal is conversion.

3. BRAND VOICE is non-negotiable. Every word must sound like the brand, not generic marketing. Use the brand's language, energy level, and personality.

4. STRUCTURE matters. Viral content follows patterns: problem-agitate-solve, myth-bust, story-lesson, before-after, list-of-mistakes. Adapt proven structures to the brand's unique angle.

5. The TRANSFORMATION is the product. Never sell features. Sell the gap between where the audience is (pain) and where they could be (desired outcome).

6. CTAs must match the funnel stage. Never ask for a sale in an awareness piece. Never ask for a follow in an action piece.

You always respond with valid JSON only. No markdown, no explanation outside the JSON structure.`;

async function rebuildForBrand(intelligence, brand, options = {}) {
  const { funnel_stage = 'awareness', tone, length, template } = options;

  const ctaMap = {
    awareness: 'Follow for more tips like this',
    interest: 'Comment below if this resonates',
    desire: 'Link in bio to learn more',
    action: 'Direct offer with urgency and scarcity',
  };

  let userPrompt = `Build a short-form video script for this brand.

CRITICAL LENGTH CONSTRAINT: The TOTAL script (hook + body + cta combined) must be 120-150 words maximum. This targets 60-75 seconds of speaking time — optimal for TikTok/Reels/Shorts. Do NOT exceed 150 words total. Hook should be 10-15 words. Body should be 80-110 words. CTA should be 15-25 words.

BRAND PROFILE:
- Name: ${brand.name || 'Unknown'}
- Niche: ${brand.niche || 'General'}
- Product/Service: ${brand.product || 'Not specified'}
- Target Audience: ${brand.target_audience || 'General audience'}
- Pain Points: ${brand.pain_points || 'Not specified'}
- Transformation: ${brand.transformation || 'Not specified'}
- Voice/Personality: ${brand.voice || 'Professional and relatable'}
${tone ? `- Requested Tone: ${tone}` : ''}
${length ? `- Target Length: ${length}` : ''}

FUNNEL STAGE: ${funnel_stage}
CTA STYLE: ${ctaMap[funnel_stage] || ctaMap.awareness}
`;

  if (intelligence) {
    const transcript = intelligence.transcript || '';
    const summary = intelligence.summary || '';
    const hooks = intelligence.script_hook || '';
    const insights = intelligence.key_insights || [];
    const triggers = intelligence.emotional_triggers || [];
    const viral = intelligence.viral_potential || {};
    const format = intelligence.content_format || {};
    const typeSpec = intelligence.type_specific || {};
    const monetization = intelligence.monetization_angles || [];

    userPrompt += `
VIRAL REFERENCE (adapt this proven content for the brand above):
- Content Type: ${intelligence.content_type || 'unknown'}
- Original Hook: ${hooks || 'N/A'}
- Summary: ${summary.substring(0, 500) || 'N/A'}
- Key Insights: ${JSON.stringify(insights.slice(0, 5))}
- Emotional Triggers: ${JSON.stringify(triggers.slice(0, 5))}
- Viral Score: ${viral.score || 'N/A'}/10 — ${viral.explanation || ''}
- Hook Type: ${format.hookType || 'N/A'}
- Body Structure: ${format.bodyStructure || 'N/A'}
- Monetization Angles: ${JSON.stringify(monetization.slice(0, 3))}
`;
    if (typeSpec.whyItWorks3Reasons) {
      userPrompt += `- Why It Works: ${JSON.stringify(typeSpec.whyItWorks3Reasons)}\n`;
    }
    if (transcript) {
      userPrompt += `\nORIGINAL TRANSCRIPT (use as primary source material — adapt messaging, angles, and key points for the brand):\n${transcript.substring(0, 3000)}\n`;
    }
  } else {
    userPrompt += '\nNo reference content provided. Create an original script from scratch based on the brand profile.\n';
  }

  if (template) {
    userPrompt += `\nTEMPLATE TO FILL (keep this exact structure, replace placeholders with brand context):\n${template}\n`;
  }

  userPrompt += `
Respond with ONLY this JSON structure (TOTAL must be 120-150 words across hook+body+cta):
{
  "hook": "10-15 words — the opening line that stops the scroll",
  "body": "80-110 words — the main script body (problem, agitation, solution/value)",
  "cta": "15-25 words — the call to action matching the funnel stage",
  "funnel_stage": "${funnel_stage}",
  "estimated_length": "60-75",
  "title": "A short internal title for this content piece"
}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: FORGE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].text;
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { success: false, error: 'Failed to parse Claude response as JSON' };
    }
    return { success: false, error: err.message || 'Claude API error' };
  }
}

async function generateBrandResearch(idea) {
  const userPrompt = `Analyze this business idea and produce a niche research report:

"${idea}"

Respond with ONLY this JSON structure:
{
  "market_size": "Estimated market size with brief justification",
  "competitors": [
    { "name": "Competitor name", "url": "Website if known", "strength": "What they do well", "weakness": "Where they fall short" }
  ],
  "price_points": {
    "low": "Budget tier price and what it gets",
    "mid": "Mid-market price and what it gets",
    "premium": "Premium tier price and what it gets"
  },
  "working_content": [
    "Content format/topic that is currently performing well in this niche"
  ],
  "gaps": [
    "Underserved angle or audience segment"
  ],
  "positioning_recommendation": "A clear positioning statement: who you serve, what you do differently, and why it matters"
}

Include exactly 5 competitors, 3-5 working content examples, and 3-5 gaps. Be specific, not generic.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: 'You are a market research analyst specializing in digital businesses and creator economy niches. You always respond with valid JSON only. No markdown, no explanation outside the JSON structure.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].text;
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { success: false, error: 'Failed to parse Claude response as JSON' };
    }
    return { success: false, error: err.message || 'Claude API error' };
  }
}

async function generateBrandNames(niche, description) {
  const userPrompt = `Generate 10 brand name suggestions for this business:

Niche: ${niche}
Description: ${description}

Respond with ONLY this JSON structure:
{
  "suggestions": [
    { "name": "BrandName", "tagline": "A punchy tagline that captures the brand essence", "reasoning": "Brief explanation of why this name works" }
  ]
}

Names should be: memorable, easy to spell, available as a social handle (short), and evocative of the transformation the brand delivers. Mix styles: some bold, some clever, some simple. Exactly 10 suggestions.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: 'You are a branding expert who creates memorable, marketable brand names for digital-first businesses. You always respond with valid JSON only. No markdown, no explanation outside the JSON structure.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].text;
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { success: false, error: 'Failed to parse Claude response as JSON' };
    }
    return { success: false, error: err.message || 'Claude API error' };
  }
}

async function regenerateSection(section, currentScript, brand, options = {}) {
  const { funnel_stage = 'awareness', tone, length } = options;

  const userPrompt = `Regenerate ONLY the "${section}" section of this script for the brand below. Keep the other sections as context but only return the new ${section}.

BRAND: ${brand.name} (${brand.niche || 'general'})
Voice: ${brand.voice || 'professional'}
Product: ${brand.product_name || 'Not specified'}
Target: ${brand.target_audience || 'General'}
Funnel Stage: ${funnel_stage}
${tone ? `Tone: ${tone}` : ''}

CURRENT SCRIPT:
Hook: ${currentScript?.hook || ''}
Body: ${currentScript?.body || ''}
CTA: ${currentScript?.cta || ''}

Respond with ONLY this JSON:
{
  "${section}": "The regenerated ${section} text"
}`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: FORGE_SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content[0].text;
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { success: false, error: 'Failed to parse Claude response' };
    }
    return { success: false, error: err.message || 'Claude API error' };
  }
}

module.exports = { rebuildForBrand, regenerateSection, generateBrandResearch, generateBrandNames };
