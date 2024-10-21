// backend/routes/api.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { analyzeReport } = require('../controllers/aiController');

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

router.post('/analyze', upload.single('file'), analyzeReport);

module.exports = router;
