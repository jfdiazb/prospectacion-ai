import express from "express";
import cors from "cors";

import leadRoutes from "./routes/leadRoutes";

const app = express();

app.use((req, res, next) => {
  console.log("👉 BODY RECIBIDO:", req.body);
  next();
});
console.log("👉 app.ts cargado");

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use("/api/leads", leadRoutes);

// Test base
app.get("/", (req, res) => {
  res.send("API funcionando 🚀");
});

// 404 global
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Recurso no encontrado",
  });
});

export default app;