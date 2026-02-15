// Manual fetch script — run with: npm run fetch
const db = require('./db');
const { fetchAll } = require('./aggregator');

db.init()
  .then(() => fetchAll())
  .then(({ totalInserted, totalParsed }) => {
    console.log(`Finished. ${totalInserted} new / ${totalParsed} parsed.`);
    return db.close();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
