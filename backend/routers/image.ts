import express from "express";
import axios from "axios";

export function createImageRouter() {
  const router = express.Router();

  router.post("/generate", async (req, res) => {
    const { prompt, width, height } = req.body;

    console.log("🎨 /generate called with:", req.body);

    try {
      const response = await axios.post(
        "http://127.0.0.1:4000/agent/command",
        {
          action: "generate_template",
          payload: {
            name: prompt,
            width,
            height,
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        }
      );

      console.log("✅ MCP Response:", response.data);
      res.json({
        success: true,
        design_url: response.data.design_url,
      });
    } catch (err: any) {
      console.error("❌ Canva API error:", err.response?.data || err.message);
      res.status(500).json({
        success: false,
        error: "Failed to communicate with MCP server",
        details: err.response?.data || err.message,
      });
    }
  });

  return router;
}
