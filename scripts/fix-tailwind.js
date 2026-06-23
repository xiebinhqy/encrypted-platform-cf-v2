const fs = require('fs');
const path = 'frontend/modern/index.html';
let c = fs.readFileSync(path, 'utf8');

// Replace preconnect for tailwind CDN with local CSS
c = c.replace(
  '<link rel="preconnect" href="https://cdn.tailwindcss.com" crossorigin>',
  '<link rel="stylesheet" href="/modern/css/tailwind.css">'
);

// Remove dns-prefetch for tailwind CDN
c = c.replace(
  /<link rel="dns-prefetch" href="https:\/\/cdn\.tailwindcss\.com">\n?/,
  ''
);

// Remove the CDN script and config block
c = c.replace(
  /<script src="https:\/\/cdn\.tailwindcss\.com" defer><\/script>\n<script>\n[\s\S]*?<\/script>\n/,
  ''
);

fs.writeFileSync(path, c, 'utf8');
console.log('✅ index.html Tailwind CDN replaced with prebuilt CSS');