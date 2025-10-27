import express, { Request, Response } from "express";
import axios from "axios";

interface ImageResponse {
  fullsize: { width: number; height: number; url: string };
  thumbnail: { width: number; height: number; url: string };
  label?: string;
}

export const createImageRouter = () => {
  const enum Routes {
    CREDITS = "/api/credits",
    PURCHASE_CREDITS = "/api/purchase-credits",
    QUEUE_IMAGE_GENERATION = "/api/queue-image-generation",
    JOB_STATUS = "/api/job-status",
    CANCEL_JOB = "/api/job-status/cancel",
    GENERATE = "/generate",
  }

  const router = express.Router();
  const jobQueue: { jobId: string; prompt: string; timeoutId: NodeJS.Timeout }[] = [];
  const completedJobs: Record<string, ImageResponse[]> = {};
  const cancelledJobs: { jobId: string }[] = [];

  let credits = 10;
  const CREDITS_IN_BUNDLE = 10;
  const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:4000";

  /** ------------------------
   * Helper Functions
   * ------------------------ */
  const handleError = (res: Response, error: any, message?: string) => {
    const status = error?.response?.status || 500;
    const msg = message || error?.response?.data?.message || "Internal Server Error";
    console.error("❌", msg, "\n", error?.response?.data || error);
    return res.status(status).json({ error: msg });
  };

  const generateJobId = (): string => Math.random().toString(36).substring(2, 15);

  const placeholderImages: ImageResponse[] = [
    {
      fullsize: {
        width: 1280,
        height: 853,
        url: "https://images.pexels.com/photos/1145720/pexels-photo-1145720.jpeg?auto=compress&cs=tinysrgb&w=1280&h=853&dpr=2",
      },
      thumbnail: {
        width: 640,
        height: 427,
        url: "https://images.pexels.com/photos/1145720/pexels-photo-1145720.jpeg?auto=compress&cs=tinysrgb&w=640&h=427&dpr=2",
      },
    },
    {
      fullsize: {
        width: 1280,
        height: 853,
        url: "https://images.pexels.com/photos/4010108/pexels-photo-4010108.jpeg?auto=compress&cs=tinysrgb&w=1280&h=863&dpr=2",
      },
      thumbnail: {
        width: 640,
        height: 427,
        url: "https://images.pexels.com/photos/4010108/pexels-photo-4010108.jpeg?auto=compress&cs=tinysrgb&w=640&h=427&dpr=2",
      },
    },
  ];

  /** ------------------------
   * ROUTES
   * ------------------------ */

  router.get(Routes.CREDITS, (_, res) => res.status(200).json({ credits }));

  router.post(Routes.PURCHASE_CREDITS, (_, res) => {
    credits += CREDITS_IN_BUNDLE;
    res.status(200).json({ credits });
  });

  router.get(Routes.QUEUE_IMAGE_GENERATION, (req, res) => {
    const prompt = req.query.prompt as string;
    if (!prompt) return res.status(400).json({ error: "Missing prompt parameter" });
    if (credits <= 0) return res.status(403).json({ error: "Not enough credits" });

    const jobId = generateJobId();
    const timeoutId = setTimeout(() => {
      const index = jobQueue.findIndex((job) => job.jobId === jobId);
      if (index !== -1) {
        jobQueue.splice(index, 1);
        completedJobs[jobId] = placeholderImages.map((img) => ({
          ...img,
          label: prompt,
        }));
        credits -= 1;
      }
    }, 5000);

    jobQueue.push({ jobId, prompt, timeoutId });
    res.status(200).json({ jobId });
  });

  router.get(Routes.JOB_STATUS, (req, res) => {
    const jobId = req.query.jobId as string;
    if (!jobId) return res.status(400).json({ error: "Missing jobId parameter" });

    if (completedJobs[jobId]) {
      return res.status(200).json({
        status: "completed",
        images: completedJobs[jobId],
        credits,
      });
    }

    if (jobQueue.some((job) => job.jobId === jobId))
      return res.status(200).json({ status: "processing" });

    if (cancelledJobs.some((job) => job.jobId === jobId))
      return res.status(200).json({ status: "cancelled" });

    return res.status(404).json({ error: "Job not found" });
  });

  router.post(Routes.CANCEL_JOB, (req, res) => {
    const jobId = req.query.jobId as string;
    if (!jobId) return res.status(400).json({ error: "Missing jobId parameter" });

    const index = jobQueue.findIndex((job) => job.jobId === jobId);
    if (index === -1) return res.status(404).json({ error: "Job not found" });

    const { timeoutId } = jobQueue[index];
    jobQueue.splice(index, 1);
    clearTimeout(timeoutId);
    cancelledJobs.push({ jobId });

    res.status(200).json({ message: "Job successfully cancelled" });
  });

  /** ------------------------
   * ✅ /generate Route (Canva App → MCP)
   * ------------------------ */
 router.post(Routes.GENERATE, async (req, res) => {
  try {
    const { prompt, width, height } = req.body;
    if (!prompt || !width || !height) {
      return res
        .status(400)
        .json({ error: "Missing required fields (prompt, width, height)" });
    }

    // Log incoming request
    console.log("🎨 /generate called with:", { prompt, width, height });

    // Read access token from .env
    const CANVA_ACCESS_TOKEN = process.env.CANVA_ACCESS_TOKEN;
    if (!CANVA_ACCESS_TOKEN) {
      console.error("❌ Missing CANVA_ACCESS_TOKEN in environment variables.");
      return res
        .status(500)
        .json({ error: "Missing CANVA_ACCESS_TOKEN in .env file" });
    }

    console.log("🔑 Using Canva access token (first 12 chars):", CANVA_ACCESS_TOKEN.slice(0, 12));

    // Forward request to your MCP backend (or directly to Canva API)
    const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:4000";
    const forwardBody = {
      action: "generate_template",
      payload: { name: prompt, width, height },
    };

    try {
      console.log("➡️ Forwarding to MCP:", `${BACKEND_URL}/agent/command`);

      const forwardRes = await axios.post(`${BACKEND_URL}/agent/command`, forwardBody, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CANVA_ACCESS_TOKEN}`,
        },
        timeout: 10000,
      });

      console.log("✅ Canva response:", forwardRes.data);

      return res.status(200).json({
        success: true,
        message: `Design generation request for "${prompt}" successful`,
        forwardResponse: forwardRes.data,
      });
    } catch (error: any) {
      console.error("⚠️ Canva API error details:");
      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Headers:", error.response.headers);
        console.error("Data:", error.response.data);
      } else {
        console.error("Error message:", error.message);
      }

      return res.status(502).json({
        success: false,
        error: "Failed to communicate with Canva MCP server.",
        details: error.response?.data || error.message,
      });
    }
  } catch (err: any) {
    console.error("❌ Unexpected error in /generate:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

  return router;
};
