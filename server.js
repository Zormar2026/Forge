require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const database = require('./database');
const claude = require('./services/claude');
const extract = require('./services/extract');
const queue = require('./services/queue');
const elevenlabs = require('./services/elevenlabs');
const pictory = require('./services/pictory');
const late = require('./services/late');

// Wrap database helpers into namespaced objects for route clarity
const brands = {
  getAll: () => database.getAllBrands(),
  get: (id) => database.getBrand(id),
  create: (data) => database.createBrand(data),
  update: (id, data) => database.updateBrand(id, data),
  delete: (id) => database.deleteBrand(id),
};
const templates = {
  getAll: () => database.getAllTemplates(),
  get: (id) => database.getTemplate(id),
};
const content = {
  create: (data) => database.createContent(data),
  get: (id) => database.getContent(id),
  getByBrand: (brandId) => database.getContentByBrand(brandId),
  update: (id, data) => database.updateContent(id, data),
  delete: (id) => { database.db.prepare('DELETE FROM content_pieces WHERE id = ?').run(id); },
};
const assets = {
  create: (data) => database.createAsset(data),
  getByBrand: (brandId) => database.getAssetsByBrand(brandId),
  delete: (id) => database.deleteAsset(id),
};
const schedule = {
  create: (data) => database.createScheduledPost(data),
  getByBrand: (brandId, start, end) => database.getSchedule(brandId, start, end),
  update: (id, data) => database.updateScheduledPost(id, data),
  delete: (id) => database.deleteScheduledPost(id),
};
const jobs = {
  create: (data) => database.createJob(data),
  get: (id) => database.getJob(id),
  getAll: (filters) => database.getJobs(filters),
  update: (id, data) => database.updateJob(id, data),
};

const app = express();
const PORT = process.env.PORT || 8092;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File upload config
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Response helpers
const ok = (data) => ({ success: true, data });
const fail = (error) => ({ success: false, error });

// ─── Health ───
app.get('/health', (req, res) => {
  res.json({ status: 'ok', name: 'Forge AI', version: '1.0.0', uptime: process.uptime() });
});

// ─── Frontend ───
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Brands ───
app.get('/api/brands', (req, res) => {
  try {
    res.json(ok(brands.getAll()));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.get('/api/brands/:id', (req, res) => {
  try {
    const brand = brands.get(req.params.id);
    if (!brand) return res.status(404).json(fail('Brand not found'));
    res.json(ok(brand));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.post('/api/brands', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json(fail('Brand name is required'));
    const brand = brands.create(req.body);
    res.status(201).json(ok(brand));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.put('/api/brands/:id', (req, res) => {
  try {
    const brand = brands.update(req.params.id, req.body);
    if (!brand) return res.status(404).json(fail('Brand not found'));
    res.json(ok(brand));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.delete('/api/brands/:id', (req, res) => {
  try {
    brands.delete(req.params.id);
    res.json(ok({ deleted: true }));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Brand Logo Upload ───
app.post('/api/brands/:id/logo', upload.single('logo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json(fail('No file uploaded'));
    const logoUrl = `/uploads/${req.file.filename}`;
    const brand = brands.update(req.params.id, { logo_url: logoUrl });
    if (!brand) return res.status(404).json(fail('Brand not found'));
    res.json(ok({ logo_url: logoUrl }));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Intelligence (Extract) ───
app.post('/api/intelligence', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json(fail('URL is required'));
    const result = await extract.analyze(url);
    if (result.success === false) return res.status(502).json(fail(result.error));
    res.json(ok(result));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Rebuild (Claude) ───
app.post('/api/rebuild', async (req, res) => {
  try {
    const { brand_id, intelligence, source_type, funnel_stage, tone, length, template_id } = req.body;
    if (!brand_id) return res.status(400).json(fail('brand_id is required'));

    const brand = brands.get(brand_id);
    if (!brand) return res.status(404).json(fail('Brand not found'));

    let template = null;
    if (template_id) {
      template = templates.get(template_id);
    }

    const options = { funnel_stage, tone, length, template };
    const script = await claude.rebuildForBrand(intelligence || null, brand, options);

    if (script.success === false) return res.status(502).json(fail(script.error));

    const piece = content.create({
      brand_id,
      source_url: req.body.source_url || null,
      source_type: source_type || (intelligence ? 'video' : template_id ? 'template' : 'scratch'),
      intelligence: intelligence ? JSON.stringify(intelligence) : null,
      original_script: intelligence?.transcript || null,
      rebuilt_script: JSON.stringify(script),
      funnel_stage: script.funnel_stage || funnel_stage || 'awareness',
      status: 'draft'
    });

    res.json(ok({ content: piece, script }));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Rebuild Section (regenerate one part) ───
app.post('/api/rebuild/section', async (req, res) => {
  try {
    const { brand_id, section, current_script, intelligence, funnel_stage, tone, length } = req.body;
    if (!brand_id || !section) return res.status(400).json(fail('brand_id and section are required'));

    const brand = brands.get(brand_id);
    if (!brand) return res.status(404).json(fail('Brand not found'));

    const result = await claude.regenerateSection(section, current_script, brand, {
      intelligence, funnel_stage, tone, length
    });

    if (result.success === false) return res.status(502).json(fail(result.error));
    res.json(ok(result));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Content Pieces ───
app.get('/api/content', (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json(fail('brand_id query param required'));
    res.json(ok(content.getByBrand(brand_id)));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.get('/api/content/:id', (req, res) => {
  try {
    const piece = content.get(req.params.id);
    if (!piece) return res.status(404).json(fail('Content not found'));
    res.json(ok(piece));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.put('/api/content/:id', (req, res) => {
  try {
    const piece = content.update(req.params.id, req.body);
    if (!piece) return res.status(404).json(fail('Content not found'));
    res.json(ok(piece));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.delete('/api/content/:id', (req, res) => {
  try {
    content.delete(req.params.id);
    res.json(ok({ deleted: true }));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Templates ───
app.get('/api/templates', (req, res) => {
  try {
    res.json(ok(templates.getAll()));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.get('/api/templates/:id', (req, res) => {
  try {
    const t = templates.get(req.params.id);
    if (!t) return res.status(404).json(fail('Template not found'));
    res.json(ok(t));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Calendar / Schedule ───
app.get('/api/calendar', (req, res) => {
  try {
    const { brand_id, start, end } = req.query;
    if (!brand_id) return res.status(400).json(fail('brand_id required'));
    const startDate = start || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const endDate = end || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    res.json(ok(schedule.getByBrand(brand_id, startDate, endDate)));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.post('/api/schedule', (req, res) => {
  try {
    const { content_id, platform, scheduled_for } = req.body;
    if (!content_id || !platform || !scheduled_for) {
      return res.status(400).json(fail('content_id, platform, and scheduled_for are required'));
    }
    const post = schedule.create(req.body);
    res.status(201).json(ok(post));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.put('/api/schedule/:id', (req, res) => {
  try {
    const post = schedule.update(req.params.id, req.body);
    if (!post) return res.status(404).json(fail('Scheduled post not found'));
    res.json(ok(post));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.delete('/api/schedule/:id', (req, res) => {
  try {
    schedule.delete(req.params.id);
    res.json(ok({ deleted: true }));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Assets ───
app.get('/api/assets', (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json(fail('brand_id required'));
    res.json(ok(assets.getByBrand(brand_id)));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.post('/api/assets', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json(fail('No file uploaded'));
    const asset = assets.create({
      brand_id: req.body.brand_id,
      content_id: req.body.content_id || null,
      type: req.body.type || 'image',
      url: `/uploads/${req.file.filename}`,
      filename: req.file.originalname,
      platform_format: req.body.platform_format || null,
      size_bytes: req.file.size
    });
    res.status(201).json(ok(asset));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.delete('/api/assets/:id', (req, res) => {
  try {
    assets.delete(req.params.id);
    res.json(ok({ deleted: true }));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Queue / Jobs ───
app.get('/api/queue', (req, res) => {
  try {
    const { brand_id, status } = req.query;
    const filters = {};
    if (brand_id) filters.brand_id = brand_id;
    if (status) filters.status = status;
    res.json(ok(jobs.getAll(filters)));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.get('/api/queue/:id', (req, res) => {
  try {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json(fail('Job not found'));
    res.json(ok(job));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.post('/api/queue', (req, res) => {
  try {
    const { type, brand_id, payload } = req.body;
    if (!type) return res.status(400).json(fail('Job type is required'));
    const job = jobs.create({ type, brand_id, payload: JSON.stringify(payload || {}) });
    res.status(201).json(ok(job));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

app.post('/api/queue/:id/retry', (req, res) => {
  try {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json(fail('Job not found'));
    if (job.status !== 'failed') return res.status(400).json(fail('Only failed jobs can be retried'));
    const updated = jobs.update(req.params.id, { status: 'pending', error: null, progress: 0 });
    res.json(ok(updated));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Create: Voiceover (ElevenLabs) ───
app.post('/api/create/voiceover', async (req, res) => {
  try {
    const { script, voice_id, content_id, brand_id } = req.body;
    if (!script) return res.status(400).json(fail('script is required'));

    const result = await elevenlabs.generateVoiceover(script, { voice_id });
    if (!result.success) return res.status(502).json(fail(result.error));

    // Save as asset
    if (brand_id) {
      assets.create({
        brand_id,
        content_id: content_id || null,
        type: 'audio',
        url: result.url,
        filename: result.filename,
        size_bytes: result.size_bytes,
      });
    }

    res.json(ok(result));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Create: Video (Pictory) ───
app.post('/api/create/video', async (req, res) => {
  try {
    const { hook, body: bodyText, cta, title, audio_url, content_id, brand_id, keywords } = req.body;
    if (!hook && !bodyText && !cta) return res.status(400).json(fail('Script content required'));

    // Build full public audio URL for Pictory (local paths are unreachable externally)
    let fullAudioUrl = audio_url;
    if (audio_url && audio_url.startsWith('/')) {
      const host = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
      fullAudioUrl = `${host}${audio_url}`;
    }

    console.log(`[Video] Audio URL for Pictory: ${fullAudioUrl}`);
    console.log(`[Video] Keywords: ${(keywords || []).join(', ')}`);

    const result = await pictory.createVideo(null, {
      hook, body: bodyText, cta, title,
      audio_url: fullAudioUrl,
      keywords: keywords || [],
    });

    if (!result.success) return res.status(502).json(fail(result.error));

    // Save as asset
    if (brand_id && result.url) {
      assets.create({
        brand_id,
        content_id: content_id || null,
        type: 'video',
        url: result.url,
        filename: result.filename,
        size_bytes: result.size_bytes,
      });
    }

    res.json(ok(result));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Publish (Late API) ───
app.post('/api/publish', async (req, res) => {
  try {
    const { platforms, video_url, caption, title, brand_name, content_id, scheduled_for } = req.body;
    if (!platforms || !platforms.length) return res.status(400).json(fail('platforms array required'));

    let fullVideoUrl = video_url;
    if (video_url && video_url.startsWith('/')) {
      const host = `${req.protocol}://${req.get('host')}`;
      fullVideoUrl = `${host}${video_url}`;
    }

    const contentData = { video_url: fullVideoUrl, caption, title, brand_name };
    let results;

    if (scheduled_for) {
      results = await late.schedulePost(platforms, contentData, scheduled_for);
      // Save schedule entries
      if (content_id) {
        for (const p of platforms) {
          schedule.create({ content_id, platform: p, scheduled_for });
        }
      }
    } else {
      results = await late.publish(platforms, contentData);
    }

    res.json(ok(results));
  } catch (e) {
    res.status(500).json(fail(e.message));
  }
});

// ─── Coming Soon Endpoints (501) ───
const comingSoon = (name) => (req, res) => {
  res.status(501).json({ success: false, error: `${name} is coming soon`, coming_soon: true });
};

app.all('/api/create/avatar', comingSoon('Avatar Creation'));
app.all('/api/create/text-overlay', comingSoon('Text Overlay Creation'));
app.all('/api/create/graphic', comingSoon('Graphic Creation'));
app.all('/api/repurpose', comingSoon('Repurpose Engine'));
app.all('/api/trends', comingSoon('Trend Scanner'));
app.all('/api/analytics', comingSoon('Analytics'));
app.all('/api/research', comingSoon('Niche Research'));
app.all('/api/suppliers', comingSoon('Supplier Management'));
app.all('/api/launch', comingSoon('Launch Mode'));

// ─── Start Server ───
database.ready.then(() => {
  queue.start(jobs);

  app.listen(PORT, () => {
    console.log(`\n  ⚒️  Forge AI v1.0.0`);
    console.log(`  → Running on http://localhost:${PORT}`);
    console.log(`  → Database: forge.db (${database.db._engine || 'ready'})`);
    console.log(`  → Queue: active\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  queue.stop();
  database.db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  queue.stop();
  database.db.close();
  process.exit(0);
});
