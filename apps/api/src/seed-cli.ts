import { seedDatabase } from './seed.js';

const force = process.argv.includes('--force');
seedDatabase(force);
console.log(force ? 'Database reset and re-seeded.' : 'Database seeded (skipped if data existed).');
