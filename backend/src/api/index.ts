import 'dotenv/config';
import { createServer } from './server.js';

const port = Number(process.env['PORT'] ?? 3000);

const app = createServer();

app.listen(port, () => {
  console.warn(`API listening on http://localhost:${port}`);
});
