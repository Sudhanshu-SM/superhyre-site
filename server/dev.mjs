import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const siteRoot = path.resolve(__dirname, '..');
const accessRoot = path.resolve(siteRoot, 'access');

const app = express();

app.use(express.static(siteRoot, { index: 'index.html' }));
app.use('/access', express.static(accessRoot, { index: 'index.html' }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(siteRoot, 'index.html'));
});

app.get(['/access', '/access/'], (_req, res) => {
  res.sendFile(path.join(accessRoot, 'index.html'));
});

app.listen(5173, '0.0.0.0', () => {
  console.log('SuperHyre unified dev server running at http://localhost:5173');
  console.log('Landing page: http://localhost:5173/');
  console.log('Auth app: http://localhost:5173/access/');
});
