/* eslint-disable no-console */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

const latest = (db, collection, query, projection) => db.collection(collection)
  .find(query, { projection: { _id: 0, ...projection } })
  .sort({ updatedAt: -1, createdAt: -1 })
  .limit(1)
  .toArray();

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  const output = {
    youtubeCredential: await latest(db, 'youtubecredentials', {}, {
      lastPollingFailure: 1,
      lastSuccessfulPollAt: 1,
      lastPollingAt: 1,
      updatedAt: 1,
    }),
    outboundByChannel: await db.collection('outboundmessages').aggregate([
      { $group: { _id: { channel: '$channel', status: '$deliveryStatus' }, count: { $sum: 1 }, latest: { $max: '$updatedAt' } } },
      { $sort: { '_id.channel': 1, '_id.status': 1 } },
    ]).toArray(),
    recentMetaFailure: await latest(db, 'outboundmessages', {
      channel: { $in: ['facebook', 'instagram'] },
      deliveryStatus: 'failed',
    }, { channel: 1, messageType: 1, errorCode: 1, errorMessage: 1, failedAt: 1, createdAt: 1 }),
    recentFacebookSuccess: await latest(db, 'outboundmessages', {
      channel: 'facebook',
      deliveryStatus: { $in: ['sent', 'delivered'] },
    }, { messageType: 1, deliveryStatus: 1, sentAt: 1, createdAt: 1 }),
    inboundByChannel: await db.collection('inboundevents').aggregate([
      { $group: { _id: { channel: '$channel', state: '$processingState' }, count: { $sum: 1 }, latest: { $max: '$updatedAt' } } },
      { $sort: { '_id.channel': 1, '_id.state': 1 } },
    ]).toArray(),
    groq: await latest(db, 'aiinvocations', { provider: 'groq' }, {
      status: 1,
      completedAt: 1,
      updatedAt: 1,
      errorCode: 1,
    }),
  };
  console.log(JSON.stringify(output, null, 2));
  await mongoose.disconnect();
}

main().catch(error => {
  console.error('READ_ONLY_AUDIT_FAILED', error?.name || 'Error', error?.code || '');
  process.exit(1);
});
