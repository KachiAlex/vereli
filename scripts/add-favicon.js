import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const srcDir = 'src';
const dirs = readdirSync(srcDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => join(srcDir, d.name, 'index.html'));

const files = ['src/index.html', ...dirs];

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf8');
    if (content.includes('favicon')) {
      console.log('Skipped (already has favicon):', file);
      continue;
    }
    // Add favicon link after the last <meta> tag or before first <link>
    const insertBefore = content.match(/<link[^>]*>/);
    if (insertBefore) {
      const pos = insertBefore.index;
      content = content.slice(0, pos) + '  <link rel="icon" href="/favicon.svg" type="image/svg+xml">\n  ' + content.slice(pos);
      writeFileSync(file, content, 'utf8');
      console.log('Added favicon:', file);
    } else {
      console.log('Could not find insertion point:', file);
    }
  } catch (err) {
    console.error('Error with', file, err.message);
  }
}
