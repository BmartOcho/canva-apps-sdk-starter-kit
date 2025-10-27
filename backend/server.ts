import * as dotenv from "dotenv";
import express from "express";
import { createImageRouter } from "./routers/image";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/", createImageRouter());

app.get("/", (req, res) => {
  res.send("✅ Canva backend API is running!");
});

app.listen(PORT, () => {
  // Backend server started
});
