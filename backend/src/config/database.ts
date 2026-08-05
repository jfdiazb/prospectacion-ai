import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI no está definido');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
};

export const disconnectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
};
