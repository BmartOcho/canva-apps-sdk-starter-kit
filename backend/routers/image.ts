// backend/routers/image.ts ✅

import express from "express";
import axios from "axios";

export function createImageRouter() {
  const router = express.Router();

  // ✅ Updated generate route
  router.post("/generate", async (req, res) => {
  try {
    const { width_in, height_in, style_prompt, job_type } = req.body;

    if (!width_in || !height_in) {
      return res.status(400).json({ error: "Missing width_in or height_in" });
    }

    console.log("🎨 /generate dimensions:", width_in, height_in);

    // ✅ Convert to pixels (300 dpi)
    const pxWidth = Math.round(width_in * 300);
    const pxHeight = Math.round(height_in * 300);

    const payload = {
      action: "generate_template",
      payload: {
        name: job_type || "Custom Design",
        width: pxWidth,
        height: pxHeight,
        prompt: style_prompt || "Modern and clean professional artwork"
      }
    };

    console.log("➡️ Sending to MCP server:", payload);

    const mcpResponse = await axios.post(
      "http://127.0.0.1:4000/agent/command",
      payload,
      { timeout: 20000 }
    );

    const data = mcpResponse.data;
    return res.json({
      success: true,
      design_id: data.design_id,
      url: data.edit_url || data.view_url
    });

  } catch (err: any) {
    console.error("❌ Error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to communicate with MCP server",
      details: err.response?.data || err.message
    });
  }
});


  return router;
}
