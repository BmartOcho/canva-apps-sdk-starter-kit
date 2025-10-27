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
  router.post(Routes.GENERATE, async (req: Request, res: Response) => {
    const { prompt, width, height } = req.body;

    if (!prompt || !width || !height) {
      return res
        .status(400)
        .json({ error: "Missing required fields (prompt, width, height)" });
    }

    console.log("🎨 /generate called with:", { prompt, width, height });

    try {
      const forwardRes = await axios.post(
        `${BACKEND_URL}/agent/command`,
        {
          action: "generate_template",
          payload: { name: prompt, width, height },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        }
      );

      const data = forwardRes.data;
      console.log("✅ Response from MCP:", data);

      // Extract Canva link if returned
      const designUrl =
        data?.design_url ||
        data?.url ||
        (typeof data === "string" && data.includes("canva.com/design")
          ? data
          : "https://www.canva.com/placeholder/DAF-demo123");

      return res.status(200).json({
        success: true,
        message: `Design created successfully in Canva.`,
        design_url: designUrl,
        raw_response: data,
      });
    } catch (error) {
      const err = error as any;
      console.error("❌ Error communicating with MCP:", err.message);

      if (err.response) {
        console.error("Status:", err.response.status);
        console.error("Data:", err.response.data);
      }

      return res.status(502).json({
        success: false,
        error: "Failed to communicate with Canva MCP server.",
        details: err.response?.data || err.message,
      });
    }
  });

  return router;
};
