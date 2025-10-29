// backend/routers/image.ts ✅

import express from "express";
import axios from "axios";

export function createImageRouter() {
  const router = express.Router();

  // ✅ Updated generate route
  router.post("/generate", async (req, res) => {
    try {
      console.log("🎨 /generate called with:", req.body);

      // ✅ Read from either direct fields or payload
      const payload = req.body.payload || req.body;

      const { name, width, height, headline, subtext } = payload;
      if (!name || !width || !height) {
        console.error("❌ Missing required fields:", payload);
        return res.status(400).json({
          success: false,
          error: "Missing name, width or height",
          payloadReceived: payload
        });
      }

      const mcpBody = {
        action: "generate_template",
        payload: {
          name,
          width,
          height,
          headline: headline || null,
          subtext: subtext || null
        }
      };

      console.log("➡️ Sending to MCP server:", mcpBody);

      const mcpRes = await axios.post(
        "http://127.0.0.1:4000/agent/command",
        mcpBody,
        { timeout: 20000 }
      );

      console.log("✅ MCP Response:", mcpRes.data);

      const designUrl = 
      mcpRes.data.design_url ||
      mcpRes.data.view_url ||
      mcpRes.data.design_url;

      if (!designUrl) {
        throw new Error("Design URL missing from MCP response");
      }

      return res.json({
        success: true,
        design_id: mcpRes.data.design_id,
        url: designUrl,
        message: "✅ Design generated successfully!"
      });

    } catch (err: any) {
      console.error("⚠️ Error:", err.response?.data || err.message);
      return res.status(500).json({
        success: false,
        error: "Failed to communicate with MCP server",
        details: err.response?.data || err.message
      });
    }
  });

  return router;
}
