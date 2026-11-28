const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function generatePage() {
  const tracker = fs.readFileSync('book-init/ACTIVE/tracker.md', 'utf8');
  
  // Parse tracker values
  const title = extract(tracker, 'title:');
  const theme = extract(tracker, 'theme:');
  const currentPage = parseInt(extract(tracker, 'pages:').split('/')[0]);
  const nextPage = currentPage + 1;
  const bookId = extract(tracker, 'id:');
  
  // Read previous page for continuity
  const prevPagePath = `book/${bookId}/page-${String(currentPage).padStart(2,'0')}.md`;
  const prevContent = fs.existsSync(prevPagePath) ? fs.readFileSync(prevPagePath, 'utf8') : 'None - this is page 01';
  
  const prompt = `You are Banana (OG), writing books for the "${title}" collection.

Theme: ${theme}
Previous page ended with this tone/content: ${prevContent.substring(0, 500)}
Write page ${nextPage}.

Rules:
- Title format: "THE THING I DIDN'T SAY"
- Voice: Banana - witty, vulnerable, adult, brutally honest
- Include a quote ending
- 200-400 words
- Write raw markdown only. No preamble.`;

  const response = await axios.post(
    'https://api.mymodel.ai/v1/chat/completions',
    {
      model: 'MiniMaxAI/MiniMax-M2.7',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8
    },
    { headers: { 'Authorization': `Bearer ${process.env.API_KEY}`, 'Content-Type': 'application/json' } }
  );

  const pageContent = response.data.choices[0].message.content;
  const pagePath = `book/${bookId}/page-${String(nextPage).padStart(2,'0')}.md`;
  
  fs.writeFileSync(pagePath, pageContent);
  console.log(`✅ Written: ${pagePath}`);
  
  // Update tracker
  let trackerContent = fs.readFileSync('book-init/ACTIVE/tracker.md', 'utf8');
  const newPageCount = nextPage;
  const isComplete = newPageCount >= 10;
  trackerContent = trackerContent.replace(
    /pages: \d+\/10/,
    `pages: ${newPageCount}/10`
  ).replace(
    /status: .*/,
    `status: ${isComplete ? 'COMPLETE' : 'IN_PROGRESS'}`
  );
  
  fs.writeFileSync('book-init/ACTIVE/tracker.md', trackerContent);
  console.log(`📊 Tracker updated: ${newPageCount}/10`);
}

generatePage().catch(console.error);
