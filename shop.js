const SB = process.env.SUPABASE_URL || 'https://rnpbglinkpsikeszcjcl.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Ogc4JOrhQXAl9zRTDU0y3g_oGnitfuZ';
const SITE = 'https://medifinderindia.com';
const COLS = 'id,product_name,name,brand_name,generic_name,category,sub_category,pack_size,manufacturer,mrp,selling_price,unit_price,stock_qty,description,image_url,is_rx,updated_at';
const STATIC_LASTMOD = '2026-10-12'; // bump this date when static pages change
const STATIC_PAGES = [['/', '1.0', 'weekly'], ['/products', '0.9', 'daily'], ['/about', '0.8', 'monthly'], ['/grievance', '0.5', 'monthly'], ['/contact', '0.7', 'monthly'], ['/faq', '0.7', 'monthly'], ['/terms', '0.5', 'monthly'], ['/privacy', '0.5', 'monthly'], ['/refund', '0.5', 'monthly']];

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
const money = n => '₹' + (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const nameOf = m => m.product_name || m.name || 'Product';
const priceOf = m => num(m.selling_price) || num(m.unit_price) || num(m.mrp);
const urlOf = m => '/product/' + m.id + '-' + slug(nameOf(m));
const trunc = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

async function q(path) {
  const r = await fetch(SB + '/rest/v1/' + path, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  if (!r.ok) throw new Error('supabase ' + r.status);
  return r.json();
}
const listAll = () => q('medicines?select=' + COLS + '&is_visible=eq.true&order=updated_at.desc&limit=1000');

const CSS = `:root{--red:#e02020;--red-d:#b71c1c;--ink:#111827;--mut:#6b7280;--line:#e8ecf2;--bg:#f5f7fb}*{box-sizing:border-box}html,body{margin:0}body{font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:var(--bg);color:#1f2937;line-height:1.6}a{color:var(--red)}
.top{background:linear-gradient(90deg,#9f1515,#e02020,#9f1515);color:#fff;text-align:center;font-size:11.5px;font-weight:700;padding:7px 12px}
.head{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;padding:10px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--ink);font-weight:800}.brand img{width:34px;height:34px}.brand b{color:var(--red)}
.nav{display:flex;gap:6px;flex-wrap:wrap}.nav a{text-decoration:none;color:#4b5563;font-weight:700;font-size:13px;padding:8px 12px;border-radius:12px}.nav a:hover,.nav a.on{background:#fff4f4;color:var(--red)}
.wrap{max-width:1080px;margin:0 auto;padding:18px 14px 40px}h1{font-size:26px;margin:6px 0 4px;color:var(--ink)}.sub{color:var(--mut);margin:0 0 16px}
.crumbs{font-size:12.5px;color:var(--mut);margin:4px 0 10px}.crumbs a{text-decoration:none}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.chips a{background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 13px;text-decoration:none;font-size:13px;font-weight:700;color:#374151}.chips a.on,.chips a:hover{background:var(--red);color:#fff;border-color:var(--red)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.card{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;display:flex;flex-direction:column;transition:.2s}.card:hover{box-shadow:0 10px 24px rgba(17,24,39,.08);transform:translateY(-2px)}
.card .im{aspect-ratio:1/1;background:#f3f4f6;display:flex;align-items:center;justify-content:center}.card img{width:100%;height:100%;object-fit:contain}
.card .bd{padding:10px 12px 14px}.card h3{font-size:14px;margin:0 0 3px;color:var(--ink);line-height:1.35}.card .mt{font-size:12px;color:var(--mut)}
.pr{font-weight:800;color:var(--ink)}.pr s{font-weight:500;color:#9ca3af;font-size:12px;margin-left:5px}.off{color:#0a7d3b;font-size:12px;font-weight:700;margin-left:5px}
.pd{display:grid;grid-template-columns:minmax(0,420px) 1fr;gap:26px;background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px}
.pd .pic{background:#f3f4f6;border-radius:14px;aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}.pd .pic img{width:100%;height:100%;object-fit:contain}
.pd .big{font-size:26px;font-weight:800;margin:6px 0}.tag{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:3px 10px;background:#ecfdf3;color:#0a7d3b}.tag.no{background:#fff1f1;color:var(--red)}
table.spec{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}.spec td{padding:7px 0;border-bottom:1px solid var(--line)}.spec td:first-child{color:var(--mut);width:38%}
.btn{display:inline-block;background:linear-gradient(135deg,#e02020,#ff5a5a);color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:14px;margin-top:6px}
.note{font-size:12.5px;color:var(--mut);background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:16px}
.foot{background:#111827;color:#cbd5e1;font-size:13px;padding:22px 14px;text-align:center}.foot a{color:#fff;margin:0 8px;text-decoration:none}
.empty{background:#fff;border:1px dashed var(--line);border-radius:16px;padding:30px;text-align:center;color:var(--mut)}
@media(max-width:720px){.pd{grid-template-columns:1fr}h1{font-size:22px}}`;

const NAVJS = `<script>(function(){var cache={};function ok(h){try{var u=new URL(h,location.href);if(u.origin!==location.origin)return null;var p=u.pathname;return(p==='/products'||/^\\/(product|category)\\/[^\\/]+$/.test(p))?p:null}catch(e){return null}}
function get(p){return cache[p]||(cache[p]=fetch(p,{credentials:'same-origin'}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){return new DOMParser().parseFromString(t,'text/html')}))}
function swap(d){var s=function(x,r){return(r||document).querySelector(x)};s('main.wrap').innerHTML=s('main.wrap',d).innerHTML;document.title=d.title;
['meta[name="description"]:content','link[rel="canonical"]:href','meta[property="og:url"]:content','meta[name="robots"]:content'].forEach(function(z){var a=z.split(':'),n=s(a[0]),m=s(a[0],d);if(n&&m)n.setAttribute(a[1],m.getAttribute(a[1]))});
[].forEach.call(document.querySelectorAll('script[data-ld]'),function(e){e.remove()});[].forEach.call(d.querySelectorAll('script[data-ld]'),function(e){var n=document.createElement('script');n.type='application/ld+json';n.setAttribute('data-ld','1');n.textContent=e.textContent;document.head.appendChild(n)});
[].forEach.call(document.querySelectorAll('.nav a'),function(a){a.classList.toggle('on',ok(a.getAttribute('href'))===location.pathname||(a.getAttribute('href')==='/products'&&/^\\/(product|category)\\//.test(location.pathname)))})}
function go(p,push){get(p).then(function(d){if(push)history.pushState({},'',p);swap(d);window.scrollTo(0,0)}).catch(function(){location.href=p})}
document.addEventListener('click',function(e){if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var a=e.target.closest&&e.target.closest('a[href]');if(!a||a.target==='_blank')return;var p=ok(a.getAttribute('href'));if(!p)return;e.preventDefault();if(p!==location.pathname)go(p,true);else scrollTo(0,0)});
document.addEventListener('mouseover',function(e){var a=e.target.closest&&e.target.closest('a[href]');var p=a&&ok(a.getAttribute('href'));if(p)get(p)});
document.addEventListener('touchstart',function(e){var a=e.target.closest&&e.target.closest('a[href]');var p=a&&ok(a.getAttribute('href'));if(p)get(p)},{passive:true});
addEventListener('popstate',function(){var p=ok(location.href);if(p)go(p,false);else location.reload()})})();</script>`;

function layout({ title, desc, path, body, ld = [], robots = 'index, follow, max-image-preview:large', image }) {
  const url = SITE + path, full = title + ' | MediFinder India', img = image || SITE + '/og-image.png';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png"><link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.json">
<meta property="og:type" content="website"><meta property="og:site_name" content="MediFinder India"><meta property="og:locale" content="en_IN"><meta property="og:url" content="${url}"><meta property="og:title" content="${esc(full)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(full)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="theme-color" content="#e02020">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
${ld.map(o => '<script type="application/ld+json" data-ld="1">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n')}
<style>${CSS}</style></head><body>
<div class="top">24/7 Help Desk — Our support team is here for you, any time of day.</div>
<header class="head"><a class="brand" href="/home.html"><img src="/favicon.png" alt="MediFinder India logo"><span>MediFinder <b>India</b></span></a>
<nav class="nav"><a href="/home.html">Home</a><a href="/products" class="${/^\/(products|product\/|category\/)/.test(path) ? 'on' : ''}">Products</a><a href="/about">About</a><a href="/contact">Contact</a></nav></header>
<main class="wrap">${body}</main>
<footer class="foot"><a href="/products">Products</a><a href="/about">About Us</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refund">Refund</a><a href="/contact">Contact</a><div style="margin-top:10px;font-size:12px;color:#94a3b8">&copy; 2026 MediFinder India. Products are supplied by licensed partner pharmacies and sellers.</div></footer>
${NAVJS}</body></html>`;
}

const card = m => {
  const p = priceOf(m), mrp = num(m.mrp), off = mrp > p && p > 0 ? Math.round((mrp - p) / mrp * 100) : 0;
  return `<a class="card" href="${urlOf(m)}"><div class="im">${m.image_url ? `<img src="${esc(m.image_url)}" alt="${esc(nameOf(m))}" loading="lazy">` : ''}</div><div class="bd"><h3>${esc(nameOf(m))}</h3><div class="mt">${esc([m.brand_name, m.pack_size].filter(Boolean).join(' · '))}</div><div class="pr">${money(p)}${off ? `<s>${money(mrp)}</s><span class="off">${off}% off</span>` : ''}</div></div></a>`;
};
const crumbLd = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })) });
const cats = list => { const m = {}; list.forEach(x => { if (x.category) { const s = slug(x.category); (m[s] = m[s] || { name: x.category, slug: s, n: 0 }).n++; } }); return Object.values(m).sort((a, b) => b.n - a.n); };
const chips = (cs, cur) => `<div class="chips"><a href="/products" class="${cur ? '' : 'on'}">All</a>${cs.map(c => `<a href="/category/${c.slug}" class="${cur === c.slug ? 'on' : ''}">${esc(c.name)} (${c.n})</a>`).join('')}</div>`;

function listPage(list, cs, cur) {
  const c = cur && cs.find(x => x.slug === cur);
  if (cur && !c) return null;
  const items = c ? list.filter(x => slug(x.category) === cur) : list;
  const title = c ? c.name : 'Medicines, Health & Household Products';
  const path = c ? '/category/' + cur : '/products';
  const h1 = c ? c.name : 'Products';
  const desc = c ? `Buy ${c.name} products online in West Bengal from licensed partner pharmacies on MediFinder India. ${items.length} products available.` : 'Browse medicines, health and household products from licensed partner pharmacies on MediFinder India. Search. Connect. Care.';
  const ld = [crumbLd(c ? [['Home', '/'], ['Products', '/products'], [c.name, path]] : [['Home', '/'], ['Products', '/products']]),
  { '@context': 'https://schema.org', '@type': 'CollectionPage', name: h1, url: SITE + path, hasPart: undefined, mainEntity: { '@type': 'ItemList', itemListElement: items.slice(0, 50).map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + urlOf(m), name: nameOf(m) })) } }];
  const body = `<div class="crumbs"><a href="/">Home</a> › <a href="/products">Products</a>${c ? ' › ' + esc(c.name) : ''}</div><h1>${esc(h1)}</h1><p class="sub">${items.length} product${items.length === 1 ? '' : 's'} from licensed partner pharmacies. Order in the MediFinder India app.</p>${chips(cs, cur)}${items.length ? `<div class="grid">${items.map(card).join('')}</div>` : '<div class="empty">No products listed yet. Please check back soon.</div>'}`;
  return layout({ title, desc, path, body, ld, image: items[0] && items[0].image_url });
}

function productPage(m, list) {
  const p = priceOf(m), mrp = num(m.mrp), off = mrp > p && p > 0 ? Math.round((mrp - p) / mrp * 100) : 0, inStock = num(m.stock_qty) > 0;
  const name = nameOf(m), path = urlOf(m), cs = slug(m.category);
  const desc = trunc(m.description, 155) || `Buy ${name}${m.pack_size ? ' (' + m.pack_size + ')' : ''} at ${money(p)} on MediFinder India from a licensed partner pharmacy in West Bengal.`;
  const rows = [['Brand', m.brand_name], ['Manufacturer', m.manufacturer], ['Generic / type', m.generic_name], ['Pack size', m.pack_size], ['Category', m.category], ['Sub-category', m.sub_category]].filter(r => r[1]);
  const ld = [crumbLd([['Home', '/'], ['Products', '/products'], ...(m.category ? [[m.category, '/category/' + cs]] : []), [name, path]]),
  { '@context': 'https://schema.org', '@type': 'Product', name, image: m.image_url ? [m.image_url] : undefined, description: trunc(m.description, 500) || undefined, brand: m.brand_name ? { '@type': 'Brand', name: m.brand_name } : undefined, category: m.category || undefined, sku: String(m.id), url: SITE + path, offers: { '@type': 'Offer', priceCurrency: 'INR', price: p.toFixed(2), availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: SITE + path, seller: { '@type': 'Organization', name: 'MediFinder India partner pharmacy' } } }];
  const body = `<div class="crumbs"><a href="/">Home</a> › <a href="/products">Products</a>${m.category ? ' › <a href="/category/' + cs + '">' + esc(m.category) + '</a>' : ''} › ${esc(name)}</div>
<div class="pd"><div class="pic">${m.image_url ? `<img src="${esc(m.image_url)}" alt="${esc(name)}">` : ''}</div><div><h1>${esc(name)}</h1>${m.brand_name ? `<div class="sub">by ${esc(m.brand_name)}</div>` : ''}
<div class="big">${money(p)}${off ? ` <s style="font-size:15px;color:#9ca3af;font-weight:500">${money(mrp)}</s><span class="off">${off}% off</span>` : ''}</div><span class="tag ${inStock ? '' : 'no'}">${inStock ? 'In stock' : 'Out of stock'}</span>
${rows.length ? `<table class="spec">${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>` : ''}
${m.description ? `<p>${esc(m.description).replace(/\n+/g, '<br>')}</p>` : ''}
<a class="btn" href="/auth.html">Order on MediFinder India</a>
<div class="note">Sold and dispensed by a licensed partner pharmacy or seller; MediFinder India is the platform that connects you. Price and availability depend on your location. This page is not medical advice; consult a doctor or pharmacist.</div></div></div>`;
  const more = list.filter(x => x.id !== m.id && x.category === m.category).slice(0, 8);
  return layout({ title: name + (m.pack_size ? ' ' + m.pack_size : ''), desc, path, ld, image: m.image_url, body: body + (more.length ? `<h2 style="margin:26px 0 12px">More in ${esc(m.category)}</h2><div class="grid">${more.map(card).join('')}</div>` : '') });
}

function notFound(res) {
  res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(layout({ title: 'Page not found', desc: 'This page could not be found.', path: '/products', robots: 'noindex, follow', body: '<h1>Page not found</h1><p class="sub">We could not find that page. <a href="/products">Browse all products</a>.</p>' }));
}

module.exports = async (req, res) => {
  const u = new URL(req.url, SITE), r = u.searchParams.get('r');
  try {
    if (r === 'sitemap') {
      const list = await listAll(), cs = cats(list), day = d => String(d || '').slice(0, 10) || new Date().toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
      const rows = STATIC_PAGES.map(s => [s[0], STATIC_LASTMOD, s[2], s[1]])
        .concat(cs.map(c => ['/category/' + c.slug, today, 'daily', '0.7']))
        .concat(list.map(m => [urlOf(m), day(m.updated_at), 'weekly', '0.6']));
      res.setHeader('Content-Type', 'application/xml; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + rows.map(x => `  <url><loc>${SITE}${esc(x[0])}</loc><lastmod>${x[1]}</lastmod><changefreq>${x[2]}</changefreq><priority>${x[3]}</priority></url>`).join('\n') + '\n</urlset>\n');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    if (r === 'products' || r === 'category') {
      const list = await listAll(), html = listPage(list, cats(list), r === 'category' ? slug(u.searchParams.get('slug')) : null);
      return html ? res.end(html) : notFound(res);
    }
    if (r === 'product') {
      const id = parseInt(String(u.searchParams.get('id') || '').split('-')[0], 10);
      if (!(id > 0)) return notFound(res);
      const row = await q('medicines?select=' + COLS + '&id=eq.' + id + '&is_visible=eq.true&limit=1');
      if (!row.length) return notFound(res);
      const m = row[0], canon = urlOf(m);
      if (u.searchParams.get('id') !== canon.split('/product/')[1]) { res.statusCode = 301; res.setHeader('Location', canon); return res.end(); }
      return res.end(productPage(m, await listAll()));
    }
    return notFound(res);
  } catch (e) {
    res.statusCode = 503; res.setHeader('Retry-After', '120'); res.setHeader('Content-Type', 'text/plain'); res.end('Temporarily unavailable');
  }
};
