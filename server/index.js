const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const knex = require('./models');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Get config value
app.get('/api/config/:key', async (req, res) => {
  const row = await knex('config').where({ key: req.params.key }).first();
  res.json({ value: row ? row.value : null });
});

// Set config value (admin only, implement auth as needed)
app.post('/api/config', async (req, res) => {
  const { key, value } = req.body;
  await knex('config').insert({ key, value }).onConflict('key').merge();
  res.json({ success: true });
});

// Log a new registration
app.post('/api/registration', async (req, res) => {
  const { domain, userPublicKey, signature, network } = req.body;
  await knex('registrations').insert({ domain, userPublicKey, signature, network });
  res.json({ success: true });
});

// List registrations (admin only)
app.get('/api/registrations', async (req, res) => {
  const rows = await knex('registrations').orderBy('created_at', 'desc');
  res.json(rows);
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Admin API running on http://localhost:${PORT}`));
