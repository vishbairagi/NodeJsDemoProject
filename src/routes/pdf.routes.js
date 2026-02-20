const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { ingestPDF } = require("../services/pdf.service");

const router = express.Router();

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDFs are allowed"));
    }
    cb(null, true);
  },
});

// 📌 Upload + Ingest API
router.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    const filePath = req.file.path;

    await ingestPDF(filePath);

    res.json({
      message: "PDF uploaded and ingested successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "PDF ingestion failed" });
  }
});

module.exports = router;
