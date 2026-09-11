import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

async function getModels() {
  try {
    const response = await axios.get(
      "https://api.x.ai/v1/models",
      {
        headers: {
          Authorization: `Bearer ${process.env.Gemini_API_KEY}`,
        },
      }
    );

    console.log("📦 MODELOS DISPONIBLES:");
    console.log(response.data);
  } catch (error: any) {
    console.log("❌ ERROR:");
    console.log(error.response?.data || error.message);
  }
}

getModels();