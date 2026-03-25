const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'forge.db');

// ─── Thin wrapper to normalize better-sqlite3 and sql.js into one interface ───
let db;

function initSync() {
  try {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db._engine = 'better-sqlite3';
  } catch {
    const initSqlJs = require('sql.js');
    throw new Error('ASYNC_INIT_REQUIRED');
  }
}

async function initAsync() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  let buffer;
  try { buffer = fs.readFileSync(DB_PATH); } catch { buffer = null; }
  const raw = buffer ? new SQL.Database(buffer) : new SQL.Database();

  // Wrap sql.js to look like better-sqlite3
  db = {
    _engine: 'sql.js',
    _raw: raw,
    exec(sql) { raw.run(sql); },
    prepare(sql) {
      return {
        run(...params) { raw.run(sql, params); save(); },
        get(...params) {
          const stmt = raw.prepare(sql);
          if (params.length) stmt.bind(params);
          const result = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.free();
          return result;
        },
        all(...params) {
          const results = [];
          const stmt = raw.prepare(sql);
          if (params.length) stmt.bind(params);
          while (stmt.step()) results.push(stmt.getAsObject());
          stmt.free();
          return results;
        }
      };
    },
    close() { raw.close(); }
  };

  function save() {
    try {
      const data = raw.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch { /* non-critical */ }
  }
  db._save = save;
}

// ─── Schema ───
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY, user_id TEXT, name TEXT NOT NULL, tagline TEXT,
    niche TEXT, stage TEXT, target_audience TEXT, voice TEXT,
    primary_color TEXT DEFAULT '#C8A84E', secondary_color TEXT DEFAULT '#1A1A2E',
    logo_url TEXT, product_name TEXT, problem TEXT, transformation TEXT,
    price TEXT, selling_points TEXT, story TEXT, competitors TEXT,
    social_ids TEXT, website TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS content_pieces (
    id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id),
    source_url TEXT, source_type TEXT CHECK(source_type IN ('video','template','scratch')),
    intelligence TEXT, original_script TEXT, rebuilt_script TEXT,
    funnel_stage TEXT CHECK(funnel_stage IN ('awareness','interest','desire','action')),
    mode TEXT, status TEXT DEFAULT 'draft' CHECK(status IN ('draft','approved','scheduled','posted')),
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, content_id TEXT REFERENCES content_pieces(id),
    brand_id TEXT NOT NULL REFERENCES brands(id),
    type TEXT CHECK(type IN ('video','audio','image','script','thumbnail')),
    url TEXT, filename TEXT, platform_format TEXT, size_bytes INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scheduled_posts (
    id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content_pieces(id),
    platform TEXT NOT NULL, scheduled_for TEXT NOT NULL, posted_at TEXT,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled','posting','posted','failed')),
    performance_data TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS analytics (
    id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content_pieces(id),
    platform TEXT, views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, saves INTEGER DEFAULT 0,
    engagement_rate REAL DEFAULT 0, recorded_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, brand_id TEXT REFERENCES brands(id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','complete','failed')),
    payload TEXT, result TEXT, progress INTEGER DEFAULT 0, error TEXT,
    created_at TEXT DEFAULT (datetime('now')), started_at TEXT, completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT, structure TEXT,
    variables TEXT, example TEXT, category TEXT, performance_score REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS brand_research (
    id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id),
    niche_report TEXT, competitors TEXT, hooks_library TEXT, content_strategy TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES brands(id),
    name TEXT NOT NULL, contact TEXT, price TEXT, moq TEXT,
    shipping_days INTEGER, rating REAL,
    status TEXT DEFAULT 'found' CHECK(status IN ('found','contacted','sampling','approved','rejected')),
    notes TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
`;

function runMigrations() {
  db.exec(SCHEMA);

  // Seed templates
  const tc = db.prepare('SELECT COUNT(*) as count FROM templates').get();
  if (tc.count === 0) {
    const seeds = [
      ["I did X for Y days and here's what happened", 'transformation', ['activity','duration','result']],
      ['Nobody talks about this but...', 'revelation', ['topic','insight']],
      ['Stop doing X, do Y instead', 'contrarian', ['bad_practice','better_practice','reason']],
      ['How I made $X with Z (step by step)', 'tutorial', ['amount','method']],
      ['The truth about X that nobody tells you', 'revelation', ['topic','truth']],
      ['X mistakes everyone makes with Y', 'educational', ['count','topic','mistakes']],
      ["How to X in Y minutes (even if you're a beginner)", 'tutorial', ['skill','time']],
      ["I tried X so you don't have to", 'review', ['product_or_method','verdict']],
    ];
    for (const [name, cat, vars] of seeds) {
      db.prepare('INSERT INTO templates (id, name, category, variables) VALUES (?, ?, ?, ?)').run(uuidv4(), name, cat, JSON.stringify(vars));
    }
  }

  // Seed demo brands
  const bc = db.prepare('SELECT COUNT(*) as count FROM brands').get();
  if (bc.count === 0) {
    const brands = [
      ['Urban Edge','Street style, redefined.','ecommerce','just starting','Gen Z streetwear enthusiasts aged 18-28','casual','#C8A84E','#0A0A0F'],
      ['Little Explorers','Making learning an adventure!','kids_content','established','Parents of children aged 3-10','entertaining','#FF6B6B','#4ECDC4'],
      ['FlowFix Plumbing','We fix it right the first time.','trades','established','Homeowners aged 30-60 needing plumbing services','professional','#2196F3','#FF9800'],
    ];
    for (const [name,tagline,niche,stage,audience,voice,c1,c2] of brands) {
      db.prepare('INSERT INTO brands (id,name,tagline,niche,stage,target_audience,voice,primary_color,secondary_color) VALUES (?,?,?,?,?,?,?,?,?)').run(uuidv4(),name,tagline,niche,stage,audience,voice,c1,c2);
    }
  }
  if (db._save) db._save();
}

// ─── Query helpers ───
function buildInsert(table, data) {
  const keys = Object.keys(data).filter(k => data[k] !== undefined);
  const cols = keys.join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  return { sql: `INSERT INTO ${table} (id, ${cols}) VALUES (?, ${placeholders})`, values: keys.map(k => data[k]) };
}

function buildUpdate(table, id, data, withTimestamp = false) {
  const keys = Object.keys(data).filter(k => data[k] !== undefined);
  let sets = keys.map(k => `${k} = ?`).join(', ');
  if (withTimestamp) sets += ", updated_at = datetime('now')";
  return { sql: `UPDATE ${table} SET ${sets} WHERE id = ?`, values: [...keys.map(k => data[k]), id] };
}

// ─── Public API ───
const helpers = {
  get db() { return db; },

  getAllBrands()          { return db.prepare('SELECT * FROM brands ORDER BY created_at DESC').all(); },
  getBrand(id)           { return db.prepare('SELECT * FROM brands WHERE id = ?').get(id); },
  createBrand(data)      { const id = uuidv4(); const { sql, values } = buildInsert('brands', data); db.prepare(sql).run(id, ...values); return this.getBrand(id); },
  updateBrand(id, data)  { const { sql, values } = buildUpdate('brands', id, data, true); db.prepare(sql).run(...values); return this.getBrand(id); },
  deleteBrand(id)        { db.prepare('DELETE FROM brands WHERE id = ?').run(id); },

  getAllTemplates()       { return db.prepare('SELECT * FROM templates ORDER BY performance_score DESC').all(); },
  getTemplate(id)        { return db.prepare('SELECT * FROM templates WHERE id = ?').get(id); },

  createContent(data)    { const id = uuidv4(); const { sql, values } = buildInsert('content_pieces', data); db.prepare(sql).run(id, ...values); return this.getContent(id); },
  getContent(id)         { return db.prepare('SELECT * FROM content_pieces WHERE id = ?').get(id); },
  getContentByBrand(bid) { return db.prepare('SELECT * FROM content_pieces WHERE brand_id = ? ORDER BY created_at DESC').all(bid); },
  updateContent(id, data){ const { sql, values } = buildUpdate('content_pieces', id, data, true); db.prepare(sql).run(...values); return this.getContent(id); },

  createAsset(data)      { const id = uuidv4(); const { sql, values } = buildInsert('assets', data); db.prepare(sql).run(id, ...values); return db.prepare('SELECT * FROM assets WHERE id = ?').get(id); },
  getAssetsByBrand(bid)  { return db.prepare('SELECT * FROM assets WHERE brand_id = ? ORDER BY created_at DESC').all(bid); },
  getAssetsByContent(cid){ return db.prepare('SELECT * FROM assets WHERE content_id = ? ORDER BY created_at DESC').all(cid); },
  deleteAsset(id)        { db.prepare('DELETE FROM assets WHERE id = ?').run(id); },

  createScheduledPost(data) { const id = uuidv4(); const { sql, values } = buildInsert('scheduled_posts', data); db.prepare(sql).run(id, ...values); return db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(id); },
  getSchedule(bid, s, e)    { return db.prepare('SELECT sp.* FROM scheduled_posts sp JOIN content_pieces cp ON sp.content_id = cp.id WHERE cp.brand_id = ? AND sp.scheduled_for >= ? AND sp.scheduled_for <= ? ORDER BY sp.scheduled_for ASC').all(bid, s, e); },
  updateScheduledPost(id, d){ const { sql, values } = buildUpdate('scheduled_posts', id, d); db.prepare(sql).run(...values); return db.prepare('SELECT * FROM scheduled_posts WHERE id = ?').get(id); },
  deleteScheduledPost(id)   { db.prepare('DELETE FROM scheduled_posts WHERE id = ?').run(id); },

  createJob(data)       { const id = uuidv4(); const { sql, values } = buildInsert('jobs', data); db.prepare(sql).run(id, ...values); return this.getJob(id); },
  getJob(id)            { return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id); },
  getJobs(filters = {}) {
    let sql = 'SELECT * FROM jobs';
    const conds = [], vals = [];
    if (filters.brand_id) { conds.push('brand_id = ?'); vals.push(filters.brand_id); }
    if (filters.status)   { conds.push('status = ?'); vals.push(filters.status); }
    if (filters.type)     { conds.push('type = ?'); vals.push(filters.type); }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY created_at DESC';
    if (filters.limit) { sql += ' LIMIT ?'; vals.push(filters.limit); }
    return db.prepare(sql).all(...vals);
  },
  updateJob(id, data)   { const { sql, values } = buildUpdate('jobs', id, data); db.prepare(sql).run(...values); return this.getJob(id); },
};

// ─── Init ───
let ready;
try {
  initSync();
  runMigrations();
  ready = Promise.resolve();
} catch (e) {
  if (e.message === 'ASYNC_INIT_REQUIRED') {
    ready = initAsync().then(() => runMigrations());
  } else {
    throw e;
  }
}

const exported = { ...helpers, ready };
Object.defineProperty(exported, 'db', { get: () => db, enumerable: true });
module.exports = exported;
