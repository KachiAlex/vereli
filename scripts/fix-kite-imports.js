import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const srcDir = 'src';
const dirs = readdirSync(srcDir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => join(srcDir, d.name, 'index.html'));

// Also include root src/index.html
const files = ['src/index.html', ...dirs];

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf8');
    const original = content;

    // Replace the Kite ES module import with a no-op stub
    content = content.replace(
      /<script type="module">\s*import\s*\{[^}]*\}\s*from\s*['"]@appsmithorg\/template-frontend\/utility['"];?\s*document\.dispatchEvent\(new CustomEvent\(['"]kite:core-ready['"],\s*\{[^}]*\}\s*\)\);?\s*<\/script>/,
      '<script type="module">\n// Kite utility removed; stub to keep compatibility\nconst submitContactForm = async () => ({ ok: false, error: "Not configured" });\ndocument.dispatchEvent(new CustomEvent("kite:core-ready", { detail: { submitContactForm } }));\n</script>'
    );

    // Remove the Kite script injector
    content = content.replace(
      /<script src="https:\/\/assets\.appsmith\.com\/kite_script_injector_v020\.js"><\/script>\n?/,
      ''
    );

    if (content !== original) {
      writeFileSync(file, content, 'utf8');
      console.log('Fixed:', file);
    } else {
      console.log('Skipped:', file);
    }
  } catch (err) {
    console.error('Error with', file, err.message);
  }
}
