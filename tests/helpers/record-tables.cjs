// Seeds and reads legacy record keys through the table-backed record store (relational-data plan 2).
const store = require('./ts-loader.cjs')()('lib/server/db/record-store.ts')
const tag = connection => {
  const query = async (parts, ...values) => (await connection.query(parts.reduce((sql, part, i) => sql + (i ? '$' + i : '') + part, ''), values)).rows
  query.json = value => JSON.stringify(value)
  return query
}
module.exports = {
  tag,
  seedRecords: (db, records) => db.transaction(tx => store.saveRecords(tag(tx), {}, records)),
  readRecords: db => db.transaction(tx => store.loadRecords(tag(tx))),
  loadRecords: connection => store.loadRecords(tag(connection)),
}
