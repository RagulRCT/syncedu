/* eduSync browser engine: replaces the Node server with an in-browser implementation of the same /api/* routes. */
(function () {
'use strict';
// Per-learner synthetic retail dataset. Same seed => same data, so the grader can
// run a reference query on exactly the data the learner sees. Different learners get
// different data, so a copied answer (or a ChatGPT answer from a shared prompt) fails.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const CITIES = ['Chennai', 'Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Hyderabad'];
const CATS = ['Electronics', 'Home', 'Fashion', 'Grocery', 'Books'];
const FIRST = ['Aarav','Diya','Vihaan','Anaya','Arjun','Ishita','Kabir','Meera','Rohan','Saanvi','Aditya','Kavya','Nikhil','Pooja','Rahul','Sneha','Tarun','Uma','Varun','Zoya'];
const LAST = ['Iyer','Nair','Sharma','Reddy','Patel','Menon','Gupta','Khan','Das','Rao','Joshi','Kapoor','Bose','Pillai','Shetty','Verma','Singh','Naidu','Mehta','Chopra'];
const PRODUCTS = ['Wireless Earbuds','Smart Watch','Desk Lamp','Cookware Set','Denim Jacket','Running Shoes','Basmati Rice 5kg','Olive Oil 1L','Novel Bundle','Data Science Book','Bluetooth Speaker','Air Fryer','Yoga Mat','Backpack','Tea Sampler'];
const PROD_CAT = ['Electronics','Electronics','Home','Home','Fashion','Fashion','Grocery','Grocery','Books','Books','Electronics','Home','Fashion','Fashion','Grocery'];

function isoDay(offset) { return new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10); }

// SQLite's DatabaseSync method that runs a script of statements.
const script = (db, text) => db['exec'](text);

function buildDb(DatabaseSync, seed) {
  const db = new DatabaseSync(':memory:');
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  script(db, `
    CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT, city TEXT, signup_date TEXT);
    CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, category TEXT, price INTEGER);
    CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, status TEXT, total INTEGER);
    CREATE TABLE order_items(id INTEGER PRIMARY KEY, order_id INTEGER, product_id INTEGER, qty INTEGER, unit_price INTEGER);
    CREATE TABLE leads_raw(id INTEGER PRIMARY KEY, email TEXT, city TEXT, signup_date TEXT);
  `);
  const combos = [];
  for (const f of FIRST) for (const l of LAST) combos.push(f + ' ' + l);
  for (let i = combos.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [combos[i], combos[j]] = [combos[j], combos[i]]; }
  script(db, 'BEGIN');
  const insC = db.prepare('INSERT INTO customers VALUES (?,?,?,?)');
  const NC = 120;
  for (let i = 1; i <= NC; i++) insC.run(i, combos[i - 1], pick(CITIES), isoDay(int(0, 200)));
  const insP = db.prepare('INSERT INTO products VALUES (?,?,?,?)');
  const prices = [];
  PRODUCTS.forEach((n, i) => { const p = int(1, 50) * 100 - 1; prices.push(p); insP.run(i + 1, n, PROD_CAT[i], p); });
  const insO = db.prepare('INSERT INTO orders VALUES (?,?,?,?,?)');
  const insI = db.prepare('INSERT INTO order_items VALUES (?,?,?,?,?)');
  let itemId = 1;
  for (let o = 1; o <= 600; o++) {
    const cust = int(1, NC - 15); // last 15 customers never order (zero-order customers exist)
    const x = r();
    const status = x < 0.70 ? 'delivered' : x < 0.85 ? 'shipped' : x < 0.93 ? 'cancelled' : 'returned';
    let total = 0; const n = int(1, 4);
    const rows = [];
    for (let k = 0; k < n; k++) { const pid = int(1, PRODUCTS.length), q = int(1, 3); total += q * prices[pid - 1]; rows.push([itemId++, o, pid, q, prices[pid - 1]]); }
    insO.run(o, cust, isoDay(int(0, 364)), status, total);
    rows.forEach((row) => insI.run(...row));
  }
  const insL = db.prepare('INSERT INTO leads_raw VALUES (?,?,?,?)');
  const bases = [];
  for (let i = 0; i < 70; i++) bases.push((pick(FIRST) + '.' + pick(LAST) + i + '@example.com').toLowerCase());
  const cityVariants = (c) => [c, c.toUpperCase(), c.toLowerCase(), ' ' + c + ' ', c.toLowerCase() + ' '];
  for (let i = 1; i <= 100; i++) {
    let email = i <= 70 ? bases[i - 1] : pick(bases);
    if (i > 70) { const m = int(0, 2); email = m === 0 ? email.toUpperCase() : m === 1 ? ' ' + email + ' ' : email; }
    if (r() < 0.05) email = null;
    const cr = r(); const city = cr < 0.06 ? null : cr < 0.12 ? '' : pick(cityVariants(pick(CITIES)));
    const dr = r(); const sd = dr < 0.12 ? null : dr < 0.20 ? '' : isoDay(int(0, 300));
    insL.run(i, email, city, sd);
  }
  script(db, 'COMMIT');
  script(db, 'PRAGMA query_only = ON');
  return db;
}

const SCHEMA = {
  customers: ['id', 'name', 'city', 'signup_date'],
  products: ['id', 'name', 'category', 'price'],
  orders: ['id', 'customer_id', 'order_date', 'status', 'total'],
  order_items: ['id', 'order_id', 'product_id', 'qty', 'unit_price'],
  leads_raw: ['id', 'email', 'city', 'signup_date'],
};

// Junior Data Analyst pathway: 6 skills, authored lessons, auto-graded tasks.
// Task kinds:  sql  -> learner writes SELECT, graded by executing against THEIR dataset
//              num  -> learner computes a number from THEIR dataset (SQL or spreadsheet export)
//              text -> short business write-up, checked against facts in THEIR dataset

const SKILLS = [
  { id: 'sql_select',    name: 'SQL: SELECT & filtering',        pre: [],                          x: 90,  y: 70,  blurb: 'Pull the right rows and columns.' },
  { id: 'sql_agg',       name: 'SQL: Aggregation',               pre: ['sql_select'],              x: 300, y: 70,  blurb: 'GROUP BY, HAVING, SUM/AVG/COUNT.' },
  { id: 'sql_joins',     name: 'SQL: Joins',                     pre: ['sql_select'],              x: 300, y: 190, blurb: 'Combine tables without losing rows.' },
  { id: 'data_cleaning', name: 'Data cleaning',                  pre: ['sql_select'],              x: 90,  y: 190, blurb: 'Duplicates, NULLs, messy text.' },
  { id: 'stats',         name: 'Descriptive statistics',         pre: ['sql_agg'],                 x: 510, y: 70,  blurb: 'Mean vs median, rates, spread.' },
  { id: 'insights',      name: 'Communicating insights',         pre: ['sql_joins', 'stats'],      x: 510, y: 190, blurb: 'Turn numbers into a recommendation.' },
];

const LESSONS = {
  sql_select: [
    { t: 'SELECT, FROM, WHERE', x: 'SELECT chooses columns, FROM names the table and WHERE filters rows before anything else happens. Example: SELECT name, city FROM customers WHERE city = \'Pune\'. Text values use single quotes and comparisons on text are case sensitive by default in SQLite. Combine conditions with AND / OR and use parentheses when mixing them, because AND binds tighter than OR.' },
    { t: 'ORDER BY and LIMIT', x: 'ORDER BY sorts the result; add DESC for highest first and list several columns to break ties, e.g. ORDER BY total DESC, id. LIMIT n keeps the first n rows after sorting. Without ORDER BY the row order is not guaranteed, so never rely on it.' },
    { t: 'NULL, DISTINCT and counting', x: 'NULL means unknown and is never equal to anything, not even another NULL. Test it with IS NULL or IS NOT NULL. SELECT DISTINCT removes duplicate rows; COUNT(DISTINCT customer_id) counts unique values. COUNT(*) counts rows while COUNT(column) skips NULLs.' },
  ],
  sql_agg: [
    { t: 'GROUP BY with aggregates', x: 'GROUP BY collapses rows that share a value into one row so you can summarise them with SUM, AVG, COUNT, MIN and MAX. Every selected column must either be in GROUP BY or inside an aggregate. Example: SELECT status, COUNT(*) FROM orders GROUP BY status.' },
    { t: 'HAVING versus WHERE', x: 'WHERE filters individual rows before grouping; HAVING filters groups after aggregation. To keep only cities with more than 20 customers write GROUP BY city HAVING COUNT(*) > 20. You cannot use an aggregate inside WHERE.' },
    { t: 'Dates and rounding', x: 'SQLite stores dates as text like 2025-03-14. strftime(\'%Y-%m\', order_date) turns a date into a month bucket such as 2025-03, which is ideal for monthly reports. ROUND(AVG(total), 2) rounds to two decimals. Group by the expression, or by its position, e.g. GROUP BY 1.' },
  ],
  sql_joins: [
    { t: 'INNER JOIN', x: 'A join combines rows from two tables using a matching condition: FROM orders o JOIN customers c ON c.id = o.customer_id. INNER JOIN keeps only rows that match on both sides. Alias tables (o, c) to keep queries readable and qualify columns (o.id) when names clash.' },
    { t: 'LEFT JOIN and missing matches', x: 'LEFT JOIN keeps every row from the left table and fills the right side with NULL when nothing matches. To list customers including those with zero orders start from customers LEFT JOIN orders. Counting orders must use COUNT(o.id), not COUNT(*), otherwise a customer with no orders is counted as 1.' },
    { t: 'Joining through a bridge table and anti-joins', x: 'order_items links orders to products, so reaching a product category from a customer needs three joins. To find customers who never did something use NOT IN (subquery) or LEFT JOIN ... WHERE right.id IS NULL. Watch out for NOT IN when the subquery can return NULL.' },
  ],
  data_cleaning: [
    { t: 'Duplicates that are not identical', x: 'Real data repeats the same entity with different formatting: Ana@x.com, ana@x.com and " ana@x.com ". Normalise before comparing with LOWER(TRIM(email)). COUNT(DISTINCT LOWER(TRIM(email))) gives the true number of unique emails. Always keep the raw table untouched and clean in a query or a copy.' },
    { t: 'Trimming and fixing case', x: 'TRIM removes leading and trailing spaces. LOWER and UPPER change case. Proper case in SQLite: UPPER(SUBSTR(x,1,1)) || LOWER(SUBSTR(x,2)). Apply TRIM first, then fix case. || concatenates strings.' },
    { t: 'Missing values: NULL versus empty string', x: 'A missing value can be NULL, an empty string or whitespace, and the same column may contain all three. Check for every representation: x IS NULL OR TRIM(x) = \'\'. CASE WHEN ... THEN ... ELSE ... END replaces missing values with a label such as Unknown, and COALESCE(x, default) handles NULL only. Document how you treated missing values.' },
  ],
  stats: [
    { t: 'Mean, median and outliers', x: 'The mean is the sum divided by the count and is pulled by outliers; the median is the middle value once sorted and resists them. For an even count the median is the average of the two middle values. Order values are usually right-skewed, so compare both before you report a typical order.' },
    { t: 'Rates and percentages', x: 'A rate is part divided by whole times 100. In SQLite integer division truncates, so multiply by 100.0 first: 100.0 * SUM(status = \'cancelled\') / COUNT(*). A comparison like status IN (\'a\',\'b\') evaluates to 1 or 0, which makes SUM handy for counting conditions.' },
    { t: 'Spread and sanity checks', x: 'Standard deviation measures how far values typically sit from the mean; a bigger value means more spread. Before trusting any number check the row count, the minimum and maximum and whether cancelled or returned orders should be excluded. State the filter you used next to the number.' },
  ],
  insights: [
    { t: 'Lead with the answer', x: 'Executives read the first sentence. Structure a summary as finding, evidence, recommendation: "Mumbai drives the most delivered revenue, Rs 4.2 lakh, 24 percent of the total; we should prioritise stock and ads there." Use real numbers from the data and name the filter you applied.' },
    { t: 'Tie it to a decision', x: 'A number without a decision is trivia. Ask so what? and end with one action the reader can take or one thing to investigate next, such as checking a promotion, a stock-out or a delivery problem. Prefer one clear recommendation to five vague ones.' },
    { t: 'State limits honestly', x: 'Say what the data cannot show: one year, one dataset, no costs. Do not claim causation from a correlation. A short caveat builds trust, but keep the whole summary under about 120 words so it gets read.' },
  ],
};

const pick = (r, a) => a[Math.floor(r() * a.length)];
const rr = (seed, id) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return rng((seed ^ h) >>> 0); };

// ref: SQL that produces the expected result. p: per-learner parameters.
const TASKS = [
  { id: 'sel1', skill: 'sql_select', kind: 'sql', ordered: true, title: 'Customers in one city',
    params: (r) => ({ city: pick(r, CITIES) }),
    prompt: (p) => `List the name and city of every customer who lives in ${p.city}, sorted by name A to Z.`,
    ref: (p) => `SELECT name, city FROM customers WHERE city = '${p.city}' ORDER BY name` },
  { id: 'sel2', skill: 'sql_select', kind: 'sql', ordered: true, title: 'Big delivered orders',
    params: (r) => ({ n: (6 + Math.floor(r() * 8)) * 500 }),
    prompt: (p) => `Show id and total of delivered orders whose total is greater than ${p.n}, highest total first (break ties by id).`,
    ref: (p) => `SELECT id, total FROM orders WHERE status = 'delivered' AND total > ${p.n} ORDER BY total DESC, id` },
  { id: 'sel3', skill: 'sql_select', kind: 'sql', ordered: false, title: 'Unique buyers',
    params: (r) => ({ s: pick(r, ['delivered', 'shipped', 'cancelled', 'returned']) }),
    prompt: (p) => `How many distinct customers have at least one ${p.s} order? Return a single number.`,
    ref: (p) => `SELECT COUNT(DISTINCT customer_id) FROM orders WHERE status = '${p.s}'` },

  { id: 'agg1', skill: 'sql_agg', kind: 'sql', ordered: true, title: 'Monthly delivered revenue',
    params: () => ({}),
    prompt: () => `Return month (as YYYY-MM) and revenue (sum of total) for delivered orders only, earliest month first. Columns: month, revenue.`,
    ref: () => `SELECT strftime('%Y-%m', order_date) AS month, SUM(total) AS revenue FROM orders WHERE status = 'delivered' GROUP BY 1 ORDER BY 1` },
  { id: 'agg2', skill: 'sql_agg', kind: 'sql', ordered: false, title: 'Cities above a customer threshold',
    params: (r) => ({ k: 14 + Math.floor(r() * 8) }),
    prompt: (p) => `Which cities have more than ${p.k} customers? Return city and customer count.`,
    ref: (p) => `SELECT city, COUNT(*) FROM customers GROUP BY city HAVING COUNT(*) > ${p.k}` },
  { id: 'agg3', skill: 'sql_agg', kind: 'sql', ordered: true, title: 'Average order by status',
    params: () => ({}),
    prompt: () => `For each order status return the status and the average order total rounded to 2 decimals. Order by status A to Z. Columns: status, avg_total.`,
    ref: () => `SELECT status, ROUND(AVG(total), 2) AS avg_total FROM orders GROUP BY status ORDER BY status` },

  { id: 'jn1', skill: 'sql_joins', kind: 'sql', ordered: true, title: 'Orders per customer (incl. zero)',
    params: () => ({}),
    prompt: () => `List every customer name with the number of orders they placed, including customers with zero orders. Columns: name, order_count. Sort by order_count highest first, then name.`,
    ref: () => `SELECT c.name, COUNT(o.id) AS order_count FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id, c.name ORDER BY order_count DESC, c.name` },
  { id: 'jn2', skill: 'sql_joins', kind: 'sql', ordered: true, title: 'Top 5 products by units',
    params: () => ({}),
    prompt: () => `Return the top 5 products by total units sold (sum of qty in order_items). Columns: name, units. Break ties by name A to Z.`,
    ref: () => `SELECT p.name, SUM(oi.qty) AS units FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.id, p.name ORDER BY units DESC, p.name LIMIT 5` },
  { id: 'jn3', skill: 'sql_joins', kind: 'sql', ordered: false, title: 'Customers who never bought a category',
    params: (r) => ({ cat: pick(r, CATS) }),
    prompt: (p) => `Return the names of customers who have never ordered a product in the ${p.cat} category (customers with no orders at all count too).`,
    ref: (p) => `SELECT name FROM customers WHERE id NOT IN (SELECT o.customer_id FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products pr ON pr.id = oi.product_id WHERE pr.category = '${p.cat}')` },

  { id: 'cl1', skill: 'data_cleaning', kind: 'sql', ordered: false, title: 'True unique lead emails',
    params: () => ({}),
    prompt: () => `leads_raw has the same email written with different case and stray spaces. How many unique emails are there once trimmed and lower-cased? Ignore NULL emails. Return one number.`,
    ref: () => `SELECT COUNT(DISTINCT LOWER(TRIM(email))) FROM leads_raw WHERE email IS NOT NULL` },
  { id: 'cl2', skill: 'data_cleaning', kind: 'sql', ordered: true, title: 'Clean the city column',
    params: () => ({}),
    prompt: () => `From leads_raw return id and city_clean ordered by id. city_clean = trimmed city in Proper case (first letter upper, rest lower), or 'Unknown' if the city is NULL or blank.`,
    ref: () => `SELECT id, CASE WHEN city IS NULL OR TRIM(city) = '' THEN 'Unknown' ELSE UPPER(SUBSTR(TRIM(city),1,1)) || LOWER(SUBSTR(TRIM(city),2)) END AS city_clean FROM leads_raw ORDER BY id` },
  { id: 'cl3', skill: 'data_cleaning', kind: 'sql', ordered: false, title: 'Missing signup dates',
    params: () => ({}),
    prompt: () => `How many leads in leads_raw have a missing signup_date (NULL or empty/blank text)? Return one number.`,
    ref: () => `SELECT COUNT(*) FROM leads_raw WHERE signup_date IS NULL OR TRIM(signup_date) = ''` },

  { id: 'st1', skill: 'stats', kind: 'num', tol: 0.01, title: 'Median delivered order',
    params: () => ({}),
    prompt: () => `What is the median total of delivered orders in YOUR dataset? Give the number (2 decimals if needed). Hint: you can download the orders CSV and use a spreadsheet, or do it in SQL.`,
    refSql: () => `SELECT total FROM orders WHERE status = 'delivered' ORDER BY total`, reduce: 'median' },
  { id: 'st2', skill: 'stats', kind: 'num', tol: 0.01, title: 'Mean delivered order',
    params: () => ({}),
    prompt: () => `What is the mean (average) total of delivered orders, to 2 decimals?`,
    refSql: () => `SELECT ROUND(AVG(total), 2) FROM orders WHERE status = 'delivered'`, reduce: 'first' },
  { id: 'st3', skill: 'stats', kind: 'num', tol: 0.05, title: 'Cancellation + return rate',
    params: () => ({}),
    prompt: () => `What percentage of ALL orders have status cancelled or returned? One decimal place.`,
    refSql: () => `SELECT ROUND(100.0 * SUM(status IN ('cancelled','returned')) / COUNT(*), 1) FROM orders`, reduce: 'first' },

  { id: 'in1', skill: 'insights', kind: 'text', title: 'Top city summary',
    params: () => ({}),
    prompt: () => `Write 3-5 sentences (30-120 words) for the Head of Sales: which city has the highest DELIVERED revenue in your dataset (customer city), what is that revenue, and what share of total delivered revenue is it? End with one recommendation.`,
    factSql: () => `SELECT c.city, SUM(o.total) AS rev FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'delivered' GROUP BY c.city ORDER BY rev DESC`, fact: 'topcity' },
  { id: 'in2', skill: 'insights', kind: 'text', title: 'Weakest month note',
    params: () => ({}),
    prompt: () => `Write 3-5 sentences (30-120 words): which month had the LOWEST delivered revenue, how much was it, and what would you investigate to explain it?`,
    factSql: () => `SELECT strftime('%Y-%m', order_date) AS m, SUM(total) AS rev FROM orders WHERE status = 'delivered' GROUP BY 1 ORDER BY rev`, fact: 'lowmonth' },
];
const TASK = Object.fromEntries(TASKS.map((t) => [t.id, t]));
const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

const taskParams = (t, seed) => t.params(rr(seed, t.id));
const tasksFor = (skill) => TASKS.filter((t) => t.skill === skill);
const passMark = (skill) => Math.ceil(tasksFor(skill).length * 2 / 3);

// Grounded tutor: BM25 retrieval over authored lessons, refuse when off-curriculum,
// stream from Claude when ANTHROPIC_API_KEY is set, otherwise extractive offline fallback.

const STOP = new Set('the a an and or of to in on for with is are was were be been how what why when which who do does did can could should would i me my we you your it its this that these those from by as at about into over than then so if not no yes please tell explain give show use using vs'.split(' '));
const tok = (s) => (String(s).toLowerCase().match(/[a-z0-9_]+/g) || []).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
const content = (s) => tok(s).filter((w) => w.length > 2 && !STOP.has(w));

const CHUNKS = [];
for (const [skill, ls] of Object.entries(LESSONS)) ls.forEach((l, i) => {
  const text = l.t + '. ' + l.x;
  CHUNKS.push({ id: `${skill}#${i + 1}`, skill, title: l.t, text, terms: tok(text) });
});
const N = CHUNKS.length;
const AVG = CHUNKS.reduce((a, c) => a + c.terms.length, 0) / N;
const DF = new Map();
for (const c of CHUNKS) for (const t of new Set(c.terms)) DF.set(t, (DF.get(t) || 0) + 1);

function bm25(qTerms, c) {
  const tf = new Map(); for (const t of c.terms) tf.set(t, (tf.get(t) || 0) + 1);
  let s = 0; const k1 = 1.5, b = 0.75;
  for (const t of qTerms) {
    const f = tf.get(t); if (!f) continue;
    const idf = Math.log(1 + (N - (DF.get(t) || 0) + 0.5) / ((DF.get(t) || 0) + 0.5));
    s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * c.terms.length / AVG));
  }
  return s;
}

function retrieve(question, k = 3) {
  const qt = content(question);
  const ranked = CHUNKS.map((c) => ({ c, score: bm25(qt, c) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
  let grounded = false;
  if (ranked.length && qt.length) {
    const set = new Set(ranked[0].c.terms);
    const matched = qt.filter((t) => set.has(t)).length;
    grounded = matched >= 1 && matched / qt.length >= 0.4;
  }
  return { grounded, hits: ranked.map((r) => ({ ...r.c, score: +r.score.toFixed(2) })) };
}

const REFUSAL = "I won't guess. That isn't covered by the approved curriculum, so I can't answer it reliably. Try asking about SELECT, GROUP BY, JOINs, cleaning NULLs and duplicates, mean vs median, or writing insights.";

// ======================= browser "server" =======================
const DAY = 86400000;
const ROLE_NAME = 'Junior Data Analyst';
const FLOW = ['applied', 'shortlisted', 'interview', 'offer', 'hired', 'retained'];
const RETENTION_DAYS = Number(window.EDUSYNC_RETENTION_DAYS ?? 0);
const SKEY = 'edusync.state.v1', KKEY = 'edusync.issuer.v1', TIMEOUT_MS = 2500;
const now = () => Date.now();
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (m) => new HttpError(400, m);

// ---------- crypto ----------
const subtle = crypto.subtle, te = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await subtle.digest('SHA-256', te.encode(s)));
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
async function hashPw(pw, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const k = await subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, k, 256);
  return hex(salt) + ':' + hex(bits);
}
const checkPw = async (pw, stored) => { const [s] = String(stored).split(':'); return (await hashPw(pw, s)) === stored; };

let KEYS = null;
const SIGALG = { Ed25519: { name: 'Ed25519' }, ES256: { name: 'ECDSA', hash: 'SHA-256' } };
const IMPALG = { Ed25519: { name: 'Ed25519' }, ES256: { name: 'ECDSA', namedCurve: 'P-256' } };
async function keys() {
  if (KEYS) return KEYS;
  let j = null; try { j = JSON.parse(localStorage.getItem(KKEY)); } catch { /* none */ }
  if (!j) {
    let alg = 'Ed25519', kp;
    try { kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); }
    catch { alg = 'ES256'; kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); }
    j = { alg, kid: 'edusync-' + hex(crypto.getRandomValues(new Uint8Array(4))), priv: await subtle.exportKey('jwk', kp.privateKey), pub: await subtle.exportKey('jwk', kp.publicKey) };
    localStorage.setItem(KKEY, JSON.stringify(j));
  }
  KEYS = {
    alg: j.alg, kid: j.kid, pubJwk: j.pub,
    priv: await subtle.importKey('jwk', j.priv, IMPALG[j.alg], false, ['sign']),
    pub: await subtle.importKey('jwk', j.pub, IMPALG[j.alg], false, ['verify']),
  };
  return KEYS;
}
const algLabel = (k) => (k.alg === 'Ed25519' ? 'Ed25519' : 'ECDSA P-256 (browser fallback)');
async function signPayload(payload) {
  const k = await keys(); const body = canon(payload);
  return { sig: b64u(await subtle.sign(SIGALG[k.alg], k.priv, te.encode(body))), hash: await sha256(body) };
}
async function verifyPayload(payload, sig) {
  try { const k = await keys(); return await subtle.verify(SIGALG[k.alg], k.pub, unb64u(sig), te.encode(canon(payload))); } catch { return false; }
}

// ---------- state (localStorage; reloaded per request so several tabs stay in sync) ----------
let S;
const fresh = () => ({ seq: {}, users: [], attempts: [], skills: [], creds: [], tutor: [], jobs: [], apps: [], events: [] });
const load = () => { try { S = JSON.parse(localStorage.getItem(SKEY)) || fresh(); } catch { S = fresh(); } };
const save = () => localStorage.setItem(SKEY, JSON.stringify(S));
const nextId = (t) => (S.seq[t] = (S.seq[t] || 0) + 1);
const track = (uid, name) => S.events.push({ user_id: uid || null, name, ts: now() });
const randSeed = () => 1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646);

async function createUser({ email, name, password, role, org = null, fee_pct = 8, is_demo = 0 }) {
  const u = { id: nextId('users'), email: String(email).trim().toLowerCase(), name: String(name).trim(), role, pw: await hashPw(password), seed: randSeed(), is_demo, org, fee_pct, created_at: now() };
  S.users.push(u); return u.id;
}
async function ensureSeed() {
  if (S.users.length) return;
  await createUser({ email: 'admin@edusync.local', name: 'Admin', password: 'admin-demo-123', role: 'admin' });
  const emp = await createUser({ email: 'hiring@demo.edusync.test', name: 'Demo Hiring Manager', password: 'demo-pass-123', role: 'employer', org: 'Demo Analytics Pvt Ltd', is_demo: 1 });
  await createUser({ email: 'learner@demo.edusync.test', name: 'Demo Learner', password: 'demo-pass-123', role: 'learner', is_demo: 1 });
  S.jobs.push({ id: nextId('jobs'), employer_id: emp, title: 'Junior Data Analyst', city: 'Chennai', salary: 600000, skills: SKILLS.map((s) => s.id), status: 'open', created_at: now() });
  save();
}
const uById = (id) => S.users.find((u) => u.id === id);
const SESS = 'edusync.uid';
const currentUser = () => { const id = Number(sessionStorage.getItem(SESS)); return id ? uById(id) || null : null; };
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, org: u.org, demo: !!u.is_demo });

// ---------- realtime (BroadcastChannel across tabs of this browser) ----------
const BC_NAME = 'edusync.events';
let bcOut = null; try { bcOut = new BroadcastChannel(BC_NAME); } catch { /* unsupported */ }
const emit = (uid, event, data) => bcOut && bcOut.postMessage({ to: uid, event, data });
const emitAdmin = (event, data) => bcOut && bcOut.postMessage({ to: 'admin', event, data: { ...data, ts: now() } });
class ESShim {
  constructor() {
    this.l = {}; this.closed = false; this.bc = null;
    try { this.bc = new BroadcastChannel(BC_NAME); } catch { /* unsupported */ }
    const u = currentUser();
    if (this.bc && u) this.bc.onmessage = (m) => {
      const { to, event, data } = m.data || {};
      if (this.closed || !(to === u.id || (to === 'admin' && u.role === 'admin'))) return;
      (this.l[event] || []).forEach((f) => f({ data: JSON.stringify(data) }));
    };
  }
  addEventListener(n, f) { (this.l[n] = this.l[n] || []).push(f); }
  close() { this.closed = true; if (this.bc) this.bc.close(); }
}
window.EventSource = ESShim;

// ---------- sandbox (Web Worker, killed on timeout) ----------
function runQueries(seed, queries) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('sandbox-worker.js', document.baseURI));
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(t); w.terminate(); resolve(v); };
    const t = setTimeout(() => finish({ timeout: true }), TIMEOUT_MS);
    w.onmessage = (m) => finish(m.data.ok ? { out: m.data.out } : { fatal: m.data.error });
    w.onerror = (e) => finish({ fatal: String(e.message || e) });
    w.postMessage({ seed, queries });
  });
}
const DENY = /\b(attach|detach|pragma|load_extension|insert|update|delete|drop|create|alter|vacuum|replace|reindex|analyze|savepoint|begin|commit|rollback)\b/i;
function validateSql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) return 'Write a query first.';
  if (sql.length > 4000) return 'Query too long (max 4000 characters).';
  const s = sql.trim().replace(/;+\s*$/, '');
  if (s.includes(';')) return 'Only one statement is allowed.';
  if (!/^(select|with)\b/i.test(s)) return 'Only SELECT queries are allowed.';
  if (DENY.test(s.replace(/'[^']*'/g, "''"))) return 'That statement is not allowed in the sandbox.';
  return null;
}
const clean = (sql) => sql.trim().replace(/;+\s*$/, '');
async function sandboxed(seed, queries) {
  const r = await runQueries(seed, queries);
  if (r.timeout) throw bad('Query timed out (limit reached). Simplify it.');
  if (r.fatal) throw new HttpError(500, 'Sandbox failure: ' + r.fatal);
  return r.out;
}

// ---------- grading (same rules as the server version) ----------
const norm = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(Math.round(v * 1e4) / 1e4) : String(v));
function compare(got, want, ordered) {
  if (got.cols.length !== want.cols.length) return { ok: false, msg: `Expected ${want.cols.length} column(s) but your query returned ${got.cols.length}.` };
  if (got.rows.length !== want.rows.length) return { ok: false, msg: `Expected ${want.rows.length} row(s) but your query returned ${got.rows.length}.` };
  const a = got.rows.map((r) => r.map(norm).join('\u0001')); const b = want.rows.map((r) => r.map(norm).join('\u0001'));
  if (!ordered) { a.sort(); b.sort(); }
  let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  if (diff) return { ok: false, msg: `${diff} of ${b.length} row(s) differ from the expected result${ordered ? ' (row order matters here)' : ''}.` };
  return { ok: true, msg: 'Matches the expected result on your dataset.' };
}
const numsIn = (s) => (s.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/g) || []).map(Number);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
async function grade(user, t, answer) {
  const p = taskParams(t, user.seed);
  if (t.kind === 'sql') {
    const err = validateSql(answer); if (err) return { correct: false, feedback: err };
    const out = await sandboxed(user.seed, { learner: clean(answer), ref: t.ref(p) });
    if (out.learner.error) return { correct: false, feedback: 'SQL error: ' + out.learner.error };
    const c = compare(out.learner, out.ref, !!t.ordered);
    return { correct: c.ok, feedback: c.msg };
  }
  if (t.kind === 'num') {
    const n = Number(String(answer).replace(/[,%\s₹$]/g, ''));
    if (!Number.isFinite(n)) return { correct: false, feedback: 'Enter a single number.' };
    const out = await sandboxed(user.seed, { ref: t.refSql(p) });
    const vals = out.ref.rows.map((r) => Number(r[0]));
    let want;
    if (t.reduce === 'median') { const s = vals.slice().sort((x, y) => x - y); const m = s.length >> 1; want = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; } else want = vals[0];
    const ok = Math.abs(n - want) <= (t.tol || 0.01);
    return { correct: ok, feedback: ok ? 'Correct for your dataset.' : 'Not quite. Re-check the filter (which statuses?) and rounding. Expected value withheld.' };
  }
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const out = await sandboxed(user.seed, { f: t.factSql(p) });
  const rows = out.f.rows; const text = answer.toLowerCase(); const nums = numsIn(answer);
  const near = (target, rel, abs) => nums.some((x) => Math.abs(x - target) <= Math.max(abs || 0, Math.abs(target) * rel));
  const checks = []; const add = (name, ok) => checks.push({ name, ok: !!ok });
  add('30-120 words', words >= 30 && words <= 120);
  if (t.fact === 'topcity') {
    const total = rows.reduce((a, r) => a + Number(r[1]), 0); const [city, rev] = rows[0];
    add('names the correct top city', text.includes(String(city).toLowerCase()));
    add('states its delivered revenue', near(Number(rev), 0.01));
    add('states its share of total (percent)', near(100 * Number(rev) / total, 0, 0.6));
    add('ends with a recommendation', /(recommend|should|suggest|propose|prioriti[sz]e|focus|invest|allocate)/.test(text));
  } else {
    const [m, rev] = rows[0]; const mi = Number(m.slice(5, 7)) - 1;
    add('names the correct lowest month', text.includes(m) || text.includes(MONTHS[mi]) || text.includes(MONTHS[mi].slice(0, 3) + ' ') || text.includes(MONTHS[mi].slice(0, 3) + '.'));
    add('states its delivered revenue', near(Number(rev), 0.01));
    add('says what to investigate', /(investigat|check|look into|analy[sz]e|compare|examine|root cause|promotion|stock|season|campaign|delivery)/.test(text));
  }
  const ok = checks.every((c) => c.ok);
  return { correct: ok, feedback: ok ? 'All rubric checks passed against your dataset.' : 'Some rubric checks failed: ' + checks.filter((c) => !c.ok).map((c) => c.name).join('; '), checks };
}

// ---------- learner state ----------
const verifiedSet = (uid) => new Set(S.skills.filter((s) => s.user_id === uid).map((s) => s.skill_id));
const passedTasks = (uid) => new Set(S.attempts.filter((a) => a.user_id === uid && a.correct).map((a) => a.task_id));
function skillStatus(uid) {
  const ver = verifiedSet(uid); const done = passedTasks(uid);
  return SKILLS.map((s) => {
    const ts = tasksFor(s.id); const passed = ts.filter((t) => done.has(t.id)).length;
    return { id: s.id, name: s.name, pre: s.pre, x: s.x, y: s.y, blurb: s.blurb, total: ts.length, passed, need: passMark(s.id),
      status: ver.has(s.id) ? 'verified' : s.pre.every((p) => ver.has(p)) ? 'available' : 'locked' };
  });
}
async function issueCred(user, kind, subject, body) {
  const k = await keys();
  const id = 'ES-' + hex(crypto.getRandomValues(new Uint8Array(6))).toUpperCase();
  const payload = { id, issuer: 'eduSync', issuerKey: k.kid, holder: { id: user.id, name: user.name }, issuedAt: new Date().toISOString(), ...body };
  const { sig, hash } = await signPayload(payload);
  S.creds.push({ id, user_id: user.id, kind, subject, payload, sig, hash, revoked: 0, issued_at: now() });
  return { id, payload, sig, hash };
}
async function issueSkillCred(user, skillId) {
  const ids = new Set(tasksFor(skillId).map((t) => t.id)); const first = new Map();
  for (const a of S.attempts) if (a.user_id === user.id && a.correct && ids.has(a.task_id) && !first.has(a.task_id)) first.set(a.task_id, a.created_at);
  const evidence = await sha256(canon([...first.entries()]));
  return issueCred(user, 'skill', skillId, { type: 'SkillCredential', skill: SKILL[skillId].name, skillId, passed: first.size, of: ids.size, evidence });
}
function integrity(uid) {
  const a = S.attempts.filter((x) => x.user_id === uid); const secs = a.map((x) => x.secs).sort((x, y) => x - y);
  return { attempts: a.length, correct: a.filter((x) => x.correct).length, pastes: a.reduce((s, x) => s + x.pastes, 0), medianSecs: secs.length ? secs[secs.length >> 1] : 0,
    avgRuns: a.length ? +(a.reduce((s, x) => s + x.runs, 0) / a.length).toFixed(1) : 0,
    note: 'Client-reported signals, not proof of identity or unaided work. Use a proctored interview to confirm.' };
}

// ---------- routes ----------
const routes = [];
const R = (method, re, roles, fn) => routes.push({ method, re: new RegExp('^' + re + '$'), roles, fn });
const need = (v, name) => { if (v === undefined || v === null || v === '') throw bad(`${name} is required`); return v; };
const str = (v, name, max = 200) => { v = String(need(v, name)); if (v.length > max) throw bad(`${name} too long`); return v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

R('POST', '/api/register', null, async ({ body }) => {
  const role = body.role === 'employer' ? 'employer' : 'learner';
  const email = str(body.email, 'email').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('Enter a valid email');
  const password = str(body.password, 'password', 100); if (password.length < 8) throw bad('Password must be at least 8 characters');
  if (S.users.find((u) => u.email === email)) throw bad('Email already registered');
  const id = await createUser({ email, name: str(body.name, 'name', 80), password, role, org: role === 'employer' ? str(body.org, 'company', 80) : null });
  track(id, 'register:' + role); emitAdmin('signup', { role });
  sessionStorage.setItem(SESS, id);
  return { user: publicUser(uById(id)) };
});
R('POST', '/api/login', null, async ({ body }) => {
  const u = S.users.find((x) => x.email === String(body.email || '').trim().toLowerCase());
  if (!u || !(await checkPw(String(body.password || ''), u.pw))) throw new HttpError(401, 'Wrong email or password');
  sessionStorage.setItem(SESS, u.id);
  return { user: publicUser(u) };
});
R('POST', '/api/logout', null, async () => { sessionStorage.removeItem(SESS); return { ok: true }; });
R('GET', '/api/me', null, async ({ user }) => ({ user: user ? publicUser(user) : null }));
R('GET', '/api/config', null, async () => ({ tutorMode: 'offline', retentionDays: RETENTION_DAYS, role: ROLE_NAME, skills: SKILLS.length, tasks: TASKS.length, issuerKey: (await keys()).kid, browserDemo: true }));

R('GET', '/api/skills', ['learner'], async ({ user }) => ({ skills: skillStatus(user.id), passport: !!S.creds.find((c) => c.user_id === user.id && c.kind === 'role' && !c.revoked) }));
R('GET', '/api/skills/([a-z_]+)', ['learner'], async ({ user, params }) => {
  const s = skillStatus(user.id).find((x) => x.id === params[0]); if (!s) throw new HttpError(404, 'No such skill');
  if (s.status === 'locked') throw new HttpError(403, 'Verify the prerequisite skills first.');
  const done = passedTasks(user.id);
  return { skill: s, lessons: LESSONS[s.id], tasks: tasksFor(s.id).map((t) => ({ id: t.id, title: t.title, kind: t.kind, ordered: !!t.ordered, prompt: t.prompt(taskParams(t, user.seed)), passed: done.has(t.id) })) };
});
R('GET', '/api/schema', ['learner'], async () => ({ schema: SCHEMA }));
R('GET', '/api/data/([a-z_]+)\\.csv', ['learner'], async ({ user, params }) => {
  if (!SCHEMA[params[0]]) throw new HttpError(404, 'No such table');
  const out = await sandboxed(user.seed, { t: `SELECT * FROM ${params[0]}` });
  const e = (v) => { const s = v === null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return { __text: [out.t.cols.join(','), ...out.t.rows.map((r) => r.map(e).join(','))].join('\n'), type: 'text/csv' };
});
R('POST', '/api/sql/run', ['learner'], async ({ user, body }) => {
  const err = validateSql(body.sql); if (err) throw bad(err);
  const out = await sandboxed(user.seed, { r: clean(body.sql) });
  if (out.r.error) throw bad('SQL error: ' + out.r.error);
  return { cols: out.r.cols, rows: out.r.rows.map((r) => r.map((v) => (v instanceof Uint8Array ? '[blob]' : v))), truncated: out.r.rows.length >= 1000 };
});
R('POST', '/api/tasks/([a-z0-9]+)/submit', ['learner'], async ({ user, params, body }) => {
  const t = TASK[params[0]]; if (!t) throw new HttpError(404, 'No such task');
  const st = skillStatus(user.id).find((s) => s.id === t.skill);
  if (st.status === 'locked') throw new HttpError(403, 'Skill locked');
  const answer = str(body.answer, 'answer', 4000);
  const g = await grade(user, t, answer);
  const clamp = (n, m) => Math.max(0, Math.min(m, Math.floor(Number(n) || 0)));
  const att = { id: nextId('attempts'), user_id: user.id, task_id: t.id, answer, correct: g.correct ? 1 : 0, detail: g.feedback, pastes: clamp(body.pastes, 1000), secs: clamp(body.secs, 86400), runs: clamp(body.runs, 1000), created_at: now() };
  S.attempts.push(att); track(user.id, g.correct ? 'task_pass' : 'task_fail');
  let skillVerified = null, cred = null;
  if (g.correct && st.status !== 'verified') {
    const n2 = skillStatus(user.id).find((s) => s.id === t.skill);
    if (n2.passed >= n2.need) {
      S.skills.push({ user_id: user.id, skill_id: t.skill, verified_at: now(), passed: n2.passed, total: n2.total });
      cred = await issueSkillCred(user, t.skill); skillVerified = t.skill; track(user.id, 'skill_verified');
    }
  }
  emitAdmin('attempt', { correct: g.correct, task: t.id });
  if (skillVerified) { emit(user.id, 'skill', { skill: skillVerified, cred: cred.id }); emitAdmin('skill_verified', { skill: skillVerified }); }
  return { attemptId: att.id, correct: g.correct, feedback: g.feedback, checks: g.checks || null, skillVerified, credential: cred ? { id: cred.id } : null };
});

R('POST', '/api/tutor', ['learner'], async ({ user, body }) => {
  const question = str(body.question, 'question', 500); const uid = user.id;
  return { __stream: async (write) => {
    const { grounded, hits } = retrieve(question);
    let text, mode, sources = [];
    if (!grounded) { text = REFUSAL; mode = 'refused'; }
    else {
      mode = 'offline'; sources = hits.map((h, i) => ({ n: i + 1, id: h.id, title: h.title, skill: h.skill }));
      text = `[offline mode: showing the most relevant lesson text, not a generated answer]\n${hits[0].title}: ${hits[0].text} [1]`;
    }
    for (const w of text.match(/\S+\s*/g)) { write({ t: w }); await sleep(12); }
    load(); S.tutor.push({ user_id: uid, q: question, grounded: grounded ? 1 : 0, mode, source: sources.map((s) => s.id).join(','), created_at: now() }); track(uid, 'tutor_q'); save();
    write({ done: true, grounded, mode, sources });
  } };
});

R('GET', '/api/creds', ['learner'], async ({ user }) => ({ creds: S.creds.filter((c) => c.user_id === user.id).sort((a, b) => a.issued_at - b.issued_at) }));
R('POST', '/api/passport', ['learner'], async ({ user }) => {
  const ver = verifiedSet(user.id);
  if (!SKILLS.every((s) => ver.has(s.id))) throw new HttpError(403, 'Verify all ' + SKILLS.length + ' skills first.');
  const ex = S.creds.find((c) => c.user_id === user.id && c.kind === 'role' && !c.revoked);
  if (ex) return { id: ex.id, existing: true };
  const sk = S.creds.filter((c) => c.user_id === user.id && c.kind === 'skill' && !c.revoked).sort((a, b) => (a.subject < b.subject ? -1 : 1));
  const iss = await issueCred(user, 'role', ROLE_NAME, { type: 'RolePassport', role: ROLE_NAME, skills: SKILLS.map((s) => s.id), skillCreds: sk.map((x) => x.id), evidence: await sha256(sk.map((x) => x.hash).join('')) });
  track(user.id, 'passport'); emitAdmin('passport', {});
  return { id: iss.id };
});
R('GET', '/api/verify/(ES-[A-Fa-f0-9]+)', null, async ({ params }) => {
  const c = S.creds.find((x) => x.id === params[0].toUpperCase());
  if (!c) return { found: false, valid: false, reason: 'No credential with that ID in this browser. (Browser demo: credentials are stored only in the browser that issued them.)' };
  const k = await keys();
  const sigOk = (await verifyPayload(c.payload, c.sig)) && (await sha256(canon(c.payload))) === c.hash;
  return { found: true, valid: sigOk && !c.revoked, signatureValid: sigOk, revoked: !!c.revoked, kind: c.kind, payload: c.payload, sig: c.sig, issuerKey: k.kid, hash: c.hash, algorithm: algLabel(k), reason: !sigOk ? 'Signature does not match payload (tampered).' : c.revoked ? 'Revoked by issuer.' : 'Signature valid.' };
});
R('POST', '/api/verify', null, async ({ body }) => {
  if (!body.payload || typeof body.payload !== 'object' || typeof body.sig !== 'string') throw bad('payload and sig required');
  const row = body.payload.id ? S.creds.find((c) => c.id === String(body.payload.id)) : null;
  const sigOk = await verifyPayload(body.payload, body.sig);
  return { valid: sigOk && !(row && row.revoked), signatureValid: sigOk, revoked: !!(row && row.revoked) };
});
R('GET', '/.well-known/jwks.json', null, async () => { const k = await keys(); return { keys: [{ ...k.pubJwk, kid: k.kid, use: 'sig', alg: k.alg === 'Ed25519' ? 'EdDSA' : 'ES256' }] }; });

const jobView = (j, uid) => {
  const ver = uid ? verifiedSet(uid) : new Set(); const ap = uid ? S.apps.find((a) => a.job_id === j.id && a.user_id === uid) : null;
  return { id: j.id, title: j.title, city: j.city, salary: j.salary, skills: j.skills, org: (uById(j.employer_id) || {}).org, status: j.status, eligible: j.skills.every((s) => ver.has(s)), applied: ap ? ap.status : null };
};
R('GET', '/api/jobs', ['learner', 'employer'], async ({ user }) => {
  const rows = user.role === 'employer' ? S.jobs.filter((j) => j.employer_id === user.id) : S.jobs.filter((j) => j.status === 'open');
  return { jobs: rows.slice().sort((a, b) => b.id - a.id).map((j) => jobView(j, user.role === 'learner' ? user.id : null)) };
});
R('POST', '/api/jobs', ['employer'], async ({ user, body }) => {
  const salary = Number(body.salary); if (!Number.isFinite(salary) || salary < 1 || salary > 1e9) throw bad('Enter an annual salary');
  const skills = Array.isArray(body.skills) && body.skills.length ? body.skills : SKILLS.map((s) => s.id);
  if (!skills.every((s) => SKILL[s])) throw bad('Unknown skill');
  const j = { id: nextId('jobs'), employer_id: user.id, title: str(body.title, 'title', 100), city: String(body.city || '').slice(0, 60), salary: Math.round(salary), skills, status: 'open', created_at: now() };
  S.jobs.push(j); track(user.id, 'job_posted'); emitAdmin('job', {});
  return { id: j.id };
});
R('POST', '/api/jobs/(\\d+)/apply', ['learner'], async ({ user, params }) => {
  const j = S.jobs.find((x) => x.id === Number(params[0]) && x.status === 'open'); if (!j) throw new HttpError(404, 'Job not found');
  const v = jobView(j, user.id);
  if (!v.eligible) throw new HttpError(403, 'You need all required skills verified before applying.');
  if (v.applied) throw bad('Already applied');
  S.apps.push({ id: nextId('apps'), job_id: j.id, user_id: user.id, status: 'applied', start_date: null, retained_at: null, fee: 0, created_at: now(), updated_at: now() });
  track(user.id, 'apply'); emit(j.employer_id, 'application', { job: j.title, name: user.name }); emitAdmin('apply', {});
  return { ok: true };
});
R('GET', '/api/applications', ['learner'], async ({ user }) => ({
  applications: S.apps.filter((a) => a.user_id === user.id).sort((a, b) => b.id - a.id).map((a) => { const j = S.jobs.find((x) => x.id === a.job_id); return { id: a.id, status: a.status, start_date: a.start_date, retained_at: a.retained_at, title: j.title, org: (uById(j.employer_id) || {}).org }; }),
}));
R('GET', '/api/employer/applications', ['employer'], async ({ user }) => {
  const rows = S.apps.map((a) => ({ a, j: S.jobs.find((x) => x.id === a.job_id) })).filter((r) => r.j && r.j.employer_id === user.id).sort((x, y) => y.a.updated_at - x.a.updated_at);
  return { retentionDays: RETENTION_DAYS, applications: rows.map(({ a, j }) => ({ id: a.id, status: a.status, start_date: a.start_date, retained_at: a.retained_at, fee: a.fee, user_id: a.user_id, name: (uById(a.user_id) || {}).name, title: j.title, salary: j.salary, retainedEligibleAt: a.start_date ? a.start_date + RETENTION_DAYS * DAY : null })) };
});
R('GET', '/api/employer/candidate/(\\d+)', ['employer'], async ({ user, params }) => {
  const uid = Number(params[0]);
  if (!S.apps.some((a) => a.user_id === uid && (S.jobs.find((j) => j.id === a.job_id) || {}).employer_id === user.id)) throw new HttpError(403, 'Candidate did not apply to your jobs.');
  const u = uById(uid);
  return { candidate: { id: u.id, name: u.name }, credentials: S.creds.filter((c) => c.user_id === uid).map((c) => ({ id: c.id, kind: c.kind, subject: c.subject, revoked: c.revoked, issued_at: c.issued_at })), integrity: integrity(uid) };
});
R('POST', '/api/applications/(\\d+)/status', ['employer'], async ({ user, params, body }) => {
  const a = S.apps.find((x) => x.id === Number(params[0])); const j = a && S.jobs.find((x) => x.id === a.job_id);
  if (!a || j.employer_id !== user.id) throw new HttpError(404, 'Application not found');
  const to = String(body.status); const from = FLOW.indexOf(a.status);
  if (to === 'rejected') { if (a.status === 'hired' || a.status === 'retained') throw bad('Cannot reject after hire'); }
  else if (FLOW.indexOf(to) !== from + 1) throw bad(`Cannot move from ${a.status} to ${to}`);
  if (to === 'hired') a.start_date = now();
  if (to === 'retained') {
    if (now() < a.start_date + RETENTION_DAYS * DAY) throw bad(`Retention not reached yet (${RETENTION_DAYS} days after start).`);
    a.retained_at = now(); a.fee = Math.round(j.salary * user.fee_pct / 100);
  }
  a.status = to; a.updated_at = now(); track(a.user_id, 'app:' + to);
  emit(a.user_id, 'status', { job: j.title, status: to }); emitAdmin('status', { status: to });
  return { ok: true, status: to, fee: a.fee };
});
R('GET', '/api/events', ['learner', 'employer', 'admin'], async () => ({ ok: true }));

R('GET', '/api/admin/metrics', ['admin'], async () => {
  const real = (uid) => { const u = uById(uid); return u && !u.is_demo; };
  const uniq = (arr) => new Set(arr).size;
  const learners = S.users.filter((u) => u.role === 'learner' && !u.is_demo).length;
  const started = uniq(S.attempts.filter((a) => real(a.user_id)).map((a) => a.user_id));
  const verified = uniq(S.skills.filter((s) => real(s.user_id)).map((s) => s.user_id));
  const passports = uniq(S.creds.filter((c) => c.kind === 'role' && real(c.user_id)).map((c) => c.user_id));
  const appN = (sts) => uniq(S.apps.filter((a) => real(a.user_id) && (!sts || sts.includes(a.status))).map((a) => a.user_id));
  const applied = appN(), interview = appN(['interview', 'offer', 'hired', 'retained']), hired = appN(['hired', 'retained']), retained = appN(['retained']);
  const fees = S.apps.filter((a) => a.status === 'retained' && real(a.user_id)).reduce((s, a) => s + a.fee, 0);
  const employers = S.users.filter((u) => u.role === 'employer' && !u.is_demo).length;
  const emplHiring = uniq(S.apps.filter((a) => ['hired', 'retained'].includes(a.status)).map((a) => (S.jobs.find((j) => j.id === a.job_id) || {}).employer_id).filter((e) => e && !uById(e).is_demo));
  const active7 = uniq(S.attempts.filter((a) => a.created_at > now() - 7 * DAY && real(a.user_id)).map((a) => a.user_id));
  const byMode = {}; for (const t of S.tutor) { const k = t.mode + '|' + t.grounded; byMode[k] = (byMode[k] || 0) + 1; }
  const tut = Object.entries(byMode).map(([k, n]) => { const [mode, g] = k.split('|'); return { mode, grounded: Number(g), n }; });
  const tutTotal = S.tutor.length;
  const per = {}; for (const a of S.attempts) { const p = (per[a.task_id] = per[a.task_id] || { n: 0, ok: 0 }); p.n++; p.ok += a.correct; }
  return {
    funnel: [{ k: 'Registered learners', v: learners }, { k: 'Attempted a task', v: started }, { k: 'Skill verified', v: verified }, { k: 'Passport issued', v: passports }, { k: 'Applied to a job', v: applied }, { k: 'Interviewed+', v: interview }, { k: 'Hired', v: hired }, { k: 'Verified Outcome (retained)', v: retained }],
    employers, employersWithHire: emplHiring, active7d: active7, feesAccrued: fees, demoAccountsExcluded: S.users.filter((u) => u.is_demo).length, retentionDays: RETENTION_DAYS,
    tutor: { total: tutTotal, refusedPct: tutTotal ? Math.round(100 * S.tutor.filter((t) => t.mode === 'refused').length / tutTotal) : null, byMode: tut },
    tasks: Object.entries(per).map(([id, p]) => ({ id, attempts: p.n, passPct: Math.round(100 * p.ok / p.n) })),
    gates: [{ k: '>= 100 real learners', ok: learners >= 100, v: learners }, { k: '>= 1 verified outcome', ok: retained >= 1, v: retained }, { k: '>= 3 employers with a hire', ok: emplHiring >= 3, v: emplHiring }],
  };
});
R('POST', '/api/admin/creds/(ES-[A-F0-9]+)/revoke', ['admin'], async ({ params }) => {
  const c = S.creds.find((x) => x.id === params[0]); if (!c) throw new HttpError(404, 'Not found'); c.revoked = 1; return { ok: true };
});

// ---------- fetch shim ----------
let chain = Promise.resolve();
const lock = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'content-type': 'application/json' } });
async function handle(method, path, body) {
  let result = null;
  try {
    await lock(async () => {
      load(); await ensureSeed();
      const user = currentUser();
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = path.match(r.re); if (!m) continue;
        if (r.roles) { if (!user) throw new HttpError(401, 'Please sign in'); if (!r.roles.includes(user.role)) throw new HttpError(403, 'Not allowed for your role'); }
        result = await r.fn({ user, body, params: m.slice(1) });
        save(); return;
      }
      throw new HttpError(404, 'Not found');
    });
  } catch (e) {
    if (e instanceof HttpError) return json(e.code, { error: e.message });
    console.error(e); return json(500, { error: 'Server error: ' + (e && e.message) });
  }
  if (result && result.__text !== undefined) return new Response(result.__text, { headers: { 'content-type': result.type } });
  if (result && result.__stream) {
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ async start(c) {
      try { await result.__stream((o) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`))); } catch (e) { c.enqueue(enc.encode(`data: ${JSON.stringify({ t: 'Error: ' + e.message })}\n\n`)); }
      c.close();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  }
  return json(200, result);
}
const realFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url; const path = String(url).split('?')[0];
  if (!(path.startsWith('/api/') || path.startsWith('/.well-known/'))) return realFetch(input, init);
  let body = {}; try { body = init.body ? JSON.parse(init.body) : {}; } catch { /* ignore */ }
  return handle((init.method || 'GET').toUpperCase(), path, body);
};
window.__edusync = { TASKS, taskParams, SKILLS, reset: () => { localStorage.removeItem(SKEY); localStorage.removeItem(KKEY); sessionStorage.clear(); location.reload(); } };
})();
