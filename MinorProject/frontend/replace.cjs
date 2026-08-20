const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let modified = false;

      // Replace hardcoded dark mode colors with our new CSS variables
      const replacements = [
        [/#1e293b/g, 'var(--surface)'],
        [/#0f172a/g, 'var(--surface)'],
        [/#334155/g, 'var(--border)'],
        [/#1e3a5f/g, 'var(--surface)'],
        [/#38bdf8/g, 'var(--text)'], // Accent replacements
        [/#64748b/g, 'var(--muted)']
      ];

      for (const [regex, replacement] of replacements) {
        if (regex.test(content)) {
          content = content.replace(regex, replacement);
          modified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated ' + fullPath);
      }
    }
  }
}

processDir('./src');
console.log('Done.');
