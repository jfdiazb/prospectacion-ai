import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

export const connectDB = async (): Promise<void> => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI no está definido en el .env");
    }

    console.log("🧠 Conectando a MongoDB Atlas...");

    console.log("MONGO_URI:", process.env.MONGO_URI);

    await mongoose.connect(MONGO_URI);

    console.log("✅ MongoDB Atlas conectado correctamente");
  } catch (error) {
    console.error("❌ Error conectando a MongoDB Atlas:", error);
    process.exit(1);
  }
};
