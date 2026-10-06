 
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
require('../models/Message'); // register the model so we can repoint messages

const pairKeyOf = (c) =>
  [String(c.participants[0]), String(c.participants[1])].sort().join('_');

async function run() {
  await mongoose.connect(process.env.DATABASE_URL);
  const coll = Conversation.collection;

  // 1. drop the old (wrong) unique index on participants, if present
  const indexes = await coll.indexes();
  if (indexes.some((i) => i.name === 'participants_1' && i.unique)) {
    await coll.dropIndex('participants_1');
    console.log('Dropped old unique index: participants_1');
  } else {
    console.log('Old participants_1 unique index not present — nothing to drop');
  }

  // 2. deduplicate FIRST (key computed from participants, independent of pairKey)
  const all = await coll.find({}).toArray();
  const byPair = new Map();
  let merged = 0;
  for (const c of all) {
    if (!Array.isArray(c.participants) || c.participants.length !== 2) continue;
    const key = pairKeyOf(c);
    if (!byPair.has(key)) {
      byPair.set(key, c);
      continue;
    }
    const existing = byPair.get(key);
    // keep the doc that already has pairKey, otherwise the older one
    const keep = existing.pairKey || !c.pairKey ? existing : c;
    const drop = keep === existing ? c : existing;
    await mongoose
      .model('Message')
      .updateMany({ conversation: drop._id }, { $set: { conversation: keep._id } });
    if (drop.lastMessage && !keep.lastMessage) {
      await coll.updateOne({ _id: keep._id }, { $set: { lastMessage: drop.lastMessage } });
    }
    await coll.deleteOne({ _id: drop._id });
    byPair.set(key, keep);
    merged++;
    console.log('Merged duplicate conversation', String(drop._id), '->', String(keep._id));
  }
  console.log(`Merged ${merged} duplicate conversation(s)`);

  // 3. backfill pairKey on everything that still lacks it
  let fixed = 0;
  for (const c of byPair.values()) {
    if (c.pairKey) continue;
    await coll.updateOne({ _id: c._id }, { $set: { pairKey: pairKeyOf(c) } });
    fixed++;
  }
  console.log(`Backfilled pairKey on ${fixed} conversation(s)`);

  // 4. make sure the new unique index exists
  await Conversation.init();
  console.log('pairKey_1 unique index ensured');

  await mongoose.disconnect();
  console.log('Migration complete');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
