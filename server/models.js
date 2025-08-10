const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './server/db.sqlite'
  },
  useNullAsDefault: true
});

// Create tables if they don’t exist
knex.schema.hasTable('config').then(exists => {
  if (!exists) {
    return knex.schema.createTable('config', table => {
      table.string('key').primary();
      table.string('value');
    });
  }
});

knex.schema.hasTable('registrations').then(exists => {
  if (!exists) {
    return knex.schema.createTable('registrations', table => {
      table.increments('id');
      table.string('domain');
      table.string('userPublicKey');
      table.string('signature');
      table.string('network');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }
});

module.exports = knex;
