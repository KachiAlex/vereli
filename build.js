import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

const dist = resolve('dist');

// Clean previous build
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Copy all pages and assets from src/
cpSync(resolve('src'), dist, { recursive: true, dereference: true });

// Copy public files (favicon, robots.txt, sitemap, etc.) over src/
cpSync(resolve('public'), dist, { recursive: true, dereference: true, force: true });

// Copy API endpoints
cpSync(resolve('api'), resolve(dist, 'api'), { recursive: true, dereference: true });
