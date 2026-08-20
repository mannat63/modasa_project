const fs = require('fs');
const path = require('path');

const hexMap = {
  // backgrounds
  '#0a0f1e': 'var(--bg)',
  '#0d1117': 'var(--bg)',
  '#0f172a': '#ffffff',
  '#1e293b': '#ffffff',
  '#334155': 'var(--border)',

  // main text
  '#e2e8f0': 'var(--text)',
  '#cbd5e1': 'var(--text)',
  
  // secondary text
  '#94a3b8': 'var(--muted)',
  '#64748b': 'var(--muted)',
  '#475569': '#a0b1bc',

  // accents
  '#38bdf8': 'var(--accent)',
  '#0ea5e9': 'var(--accent)',
  '#0284c7': '#4ca9e6',
  '#fbbf24': 'var(--warn)',
  '#eab308': 'var(--warn)',
  '#f97316': 'var(--warn)',

  // purples -> accents
  '#a78bfa': '#66F4FF',
  '#7c3aed': 'var(--accent)',
  '#6d28d9': '#4ca9e6',
};

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (f.endsWith('.jsx') || f.endsWith('.js') || f.endsWith('.css')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      let modified = false;
      for (const [hk, hv] of Object.entries(hexMap)) {
        const regex = new RegExp(hk, 'gi');
        if (regex.test(content)) {
          content = content.replace(regex, hv);
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Updated', fullPath);
      }
    }
  }
}

try {
  processDir(path.resolve(__dirname, 'src'));
  console.log('Theme styling updated!');
} catch (e) {
  console.error(e);
}
