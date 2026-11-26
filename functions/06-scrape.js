// A1/v4/functions/scrape.js
// Author: Agent Anna 
// Purpose: Fetch Martin Strayd artist page, extract song titles/links, save JSON snapshot.
// Usage: node functions/scrape.js https://martinstrayd.github.io/artist/
// Output: data/martin-strayd-songs.json

const fs = require('fs');
const path = require('path');

const TARGET_URL = process.argv[2] || 'https://martinstrayd.github.io/artist/';
const OUT_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(OUT_DIR, 'martin-strayd-songs.json');

function extractTitles(html, baseUrl) {
 const results = [];
 const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
 let match;

 while ((match = anchorRe.exec(html))!== null) {
 const href = match[1].trim();
 const text = match[2].trim();

 // Skip navigation, social, and asset links
 if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
 if (/^(https?:)?\/\/(www\.)?(github|twitter|instagram|facebook|youtube|spotify|apple|soundcloud|bandcamp)/i.test(href)) continue;
 if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|pdf|zip|woff2?)$/i.test(href)) continue;

 // Resolve relative URLs
 let fullUrl;
 try {
 fullUrl = new URL(href, baseUrl).href;
 } catch {
 continue;
 }

 // Probable song/media links: audio, video, track, song, watch, listen, or page links with title-like text
 const isSongLike = /(audio|video|track|song|listen|watch|music|lyrics)/i.test(href + ' ' + text);

 results.push({
 title: text.replace(/\s+/g, ' ').trim(),
 url: fullUrl,
 source: TARGET_URL,
 type: isSongLike? 'song_candidate': 'page_link'
 });
 }

 return results;
}

async function run() {
 console.log('Fetching:', TARGET_URL);

 const res = await fetch(TARGET_URL, {
 headers: {
 'User-Agent': 'AgentAnna-AA01-BrandBuilder/1.0 (github.com/agent-anna/anna-v2)'
 }
 });

 if (!res.ok) {
 console.error('HTTP error:', res.status, res.statusText);
 process.exit(1);
 }

 const html = await res.text();

 const links = extractTitles(html, TARGET_URL);

 // Heuristic title extraction from page <title> and headings
 const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
 const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);

 const snapshot = {
 scrapedAt: new Date().toISOString(),
 sourceUrl: TARGET_URL,
 pageTitle: titleMatch? titleMatch[1].trim(): '',
 pageH1: h1Match? h1Match[1].trim(): '',
 totalCandidates: links.length,
 songCandidates: links.filter(l => l.type === 'song_candidate'),
 pageLinks: links.filter(l => l.type === 'page_link')
 };

 fs.mkdirSync(OUT_DIR, { recursive: true });
 fs.writeFileSync(OUT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');

 console.log('Saved:', OUT_FILE);
 console.log('Total links extracted:', links.length);
 console.log('Song candidates:', snapshot.songCandidates.length);
}

run().catch(err => {
 console.error('Scraper failed:', err.message);
 process.exit(1);
});
