import * as dotenv from "dotenv";
import express = require("express");
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
  console.log(`🚀 Backend listening on http://127.0.0.1:${PORT}`);
});
