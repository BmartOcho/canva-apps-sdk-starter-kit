import * as express from "express";
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
  const jobQueue: {
    jobId: string;
    prompt: string;
    timeoutId: NodeJS.Timeout;
  }[] = [];
  const completedJobs: Record<string, ImageResponse[]> = {};
  const cancelledJobs: { jobId: string }[] = [];

  let credits = 10;
  const CREDITS_IN_BUNDLE = 10;
  const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:4000";

  // Helper: standard error handler
  const handleError = (res: express.Response, error: any, message?: string) => {
    // Prefer a request-scoped logger if available; avoid direct console usage to comply with lint rules
    if ((res as any).locals && (res as any).locals.logger && typeof (res as any).locals.logger.error === "function") {
      (res as any).locals.logger.error(error);
    }
    const status = error?.response?.status || 500;
    const msg = message || error?.response?.data?.message || "Internal Server Error";
    return res.status(status).json({ error: msg });
  };

  // Helper: simple ID generator
  const generateJobId = (): string => Math.random().toString(36).substring(2, 15);

  // Helper: simulate image data (mock data)
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

  // --- ROUTES ---

  router.get(Routes.CREDITS, (req, res) => {
    try {
      res.status(200).json({ credits });
    } catch (err) {
      handleError(res, err, "Failed to retrieve credits");
    }
  });

  router.post(Routes.PURCHASE_CREDITS, (req, res) => {
    try {
      credits += CREDITS_IN_BUNDLE;
      res.status(200).json({ credits });
    } catch (err) {
      handleError(res, err, "Failed to purchase credits");
    }
  });

  // Queue image generation
  router.get(Routes.QUEUE_IMAGE_GENERATION, (req, res) => {
    try {
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
    } catch (err) {
      handleError(res, err, "Failed to queue image generation");
    }
  });

  // Job status
  router.get(Routes.JOB_STATUS, (req, res) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "Missing jobId parameter" });

      if (completedJobs[jobId])
        return res.status(200).json({
          status: "completed",
          images: completedJobs[jobId],
          credits,
        });

      if (jobQueue.some((job) => job.jobId === jobId))
        return res.status(200).json({ status: "processing" });

      if (cancelledJobs.some((job) => job.jobId === jobId))
        return res.status(200).json({ status: "cancelled" });

      return res.status(404).json({ error: "Job not found" });
    } catch (err) {
      handleError(res, err, "Failed to fetch job status");
    }
  });

  // Cancel job
  router.post(Routes.CANCEL_JOB, (req, res) => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) return res.status(400).json({ error: "Missing jobId parameter" });

      const index = jobQueue.findIndex((job) => job.jobId === jobId);
      if (index === -1) return res.status(404).json({ error: "Job not found" });

      const { timeoutId } = jobQueue[index];
      jobQueue.splice(index, 1);
      clearTimeout(timeoutId);
      cancelledJobs.push({ jobId });

      res.status(200).json({ message: "Job successfully cancelled" });
    } catch (err) {
      handleError(res, err, "Failed to cancel job");
    }
  });

  // ✅ New route: /generate → connects Canva App SDK to MCP backend
  router.post(Routes.GENERATE, async (req, res) => {
  try {
    const { prompt, width, height } = req.body;
    if (!prompt || !width || !height) {
      return res.status(400).json({ error: "Missing required fields (prompt, width, height)" });
    }

    // Log incoming request
    console.log("🎨 /generate called with:", { prompt, width, height });

    // Forward to MCP server
    const forwardBody = {
      action: "generate_template",
      payload: { name: prompt, width, height },
    };

    try {
      const forwardRes = await axios.post(`${BACKEND_URL}/agent/command`, forwardBody, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      });
      console.log("➡️ Forward response:", forwardRes.data);
      return res.status(200).json({
        success: true,
        message: `Forwarded design generation request for "${prompt}"`,
        forwardResponse: forwardRes.data,
      });
    } catch (forwardErr) {
      // Very verbose logging for debugging
      console.error("🚨 Forwarding to MCP failed:");
      if (forwardErr.response) {
        console.error("Status:", forwardErr.response.status);
        console.error("Headers:", forwardErr.response.headers);
        console.error("Data:", forwardErr.response.data);
      } else {
        console.error("Error message:", forwardErr.message);
      }
      // return a helpful developer response (you can make this less verbose in production)
      return res.status(502).json({
        error: "Failed to forward design generation request",
        reason: forwardErr.response?.data || forwardErr.message,
      });
    }
  } catch (err) {
    console.error("Unexpected error in /generate:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

  return router;
};
