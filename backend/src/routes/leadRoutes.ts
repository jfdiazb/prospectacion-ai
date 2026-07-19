import { Router } from "express";
import { analyzeLead } from "../ai/leadAnalyzer";
import { LeadController } from "../controllers/LeadController";

const router = Router();

console.log("👉 leadRoutes cargado");

// GET
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Leads funcionando 🚀",
  });
});

// POST
import Lead from "../models/Lead";

router.post("/", async (req, res) => {
  try {
    const data = req.body;

    const lead = new Lead({
      ...data,
      userId: data.userId || "000000000000000000000000"
    });

    await lead.save();

    return res.json({
      success: true,
      message: "Lead guardado en MongoDB",
      lead
    });

  } catch (error) {
    console.error("ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error guardando lead",
      error: error.message
    });
  }
});

router.post("/analyze", async (req, res) => {
  try {
    const result = await analyzeLead(req.body);

    return res.json({
      success: true,
      analysis: JSON.parse(result || "{}")
    });

  } catch (error: any) {
    console.error("❌ Error analizando lead:", error);

    return res.status(500).json({
      success: false,
      message: "Error analizando lead",
      error: error.message
    });
  }
});

export default router;
