/* eduSync browser sandbox: runs learner SQL in an isolated Web Worker (killed on timeout by the parent).
   Dataset generator is identical to the server version (same seed => same data). */
importScripts('vendor/sql-wasm.js');
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


// Adapter so buildDb() (written for node:sqlite) runs on sql.js
const makeDriver = (SQL) => class { 
  constructor() { this.d = new SQL.Database(); }
  exec(t) { return this.d.exec(t); }
  prepare(s) { const st = this.d.prepare(s); return { run: (...a) => { st.run(a); } }; }
};
const MAX_ROWS = 1000;
onmessage = async (e) => {
  const { seed, queries } = e.data;
  try {
    const SQL = await initSqlJs({ locateFile: (f) => 'vendor/' + f });
    const wrapper = buildDb(makeDriver(SQL), seed);
    const out = {};
    for (const [k, sql] of Object.entries(queries)) {
      try {
        const st = wrapper.d.prepare(sql);
        const cols = st.getColumnNames(); const rows = [];
        while (st.step()) { rows.push(st.get()); if (rows.length >= MAX_ROWS) break; }
        st.free();
        out[k] = { cols, rows };
      } catch (err) { out[k] = { error: String((err && err.message) || err) }; }
    }
    postMessage({ ok: true, out });
  } catch (err) { postMessage({ ok: false, error: String((err && err.message) || err) }); }
};
