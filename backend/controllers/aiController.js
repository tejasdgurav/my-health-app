require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');

// Ensure OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OpenAI API key is missing');
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.analyzeReport = async (req, res) => {
  try {
    const file = req.file;
    const userInfo = JSON.parse(req.body.userInfo);

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract text from the uploaded file (supports PDF and images)
    let extractedText = '';
    if (file.mimetype === 'application/pdf') {
      extractedText = await extractTextFromPDF(file.buffer);
    } else if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      extractedText = await extractTextFromImage(file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Log extracted text for debugging
    console.log('Extracted Text:', extractedText);

    // Parse health metrics from the extracted text
    const metrics = parseHealthMetrics(extractedText, userInfo);

    // Log parsed metrics for debugging
    console.log('Parsed Metrics:', metrics);

    // Validate parsed metrics for completeness
    if (Object.keys(metrics).length === 0) {
      return res.status(400).json({
        error: 'No valid health metrics found in the report. Ensure the report contains standard health metrics.',
      });
    }

    // Generate the AI prompt using patient info and metrics
    const prompt = generatePrompt(userInfo, metrics);

    // Generate the AI summary
    const summary = await getAISummary(prompt);

    // Send the summary back as the response
    res.json({ summary });
  } catch (error) {
    console.error('Error processing report:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Extract text from a PDF buffer
const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    if (!data.text) {
      throw new Error('No text found in PDF. It might be an image-based PDF.');
    }
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw new Error('Failed to process PDF. Ensure the PDF contains readable text.');
  }
};

// Extract text from an image buffer using Tesseract
const extractTextFromImage = async (buffer) => {
  try {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: (m) => console.log(m), // Log progress for large files
    });
    return text;
  } catch (error) {
    console.error('Error with Tesseract:', error.message);
    throw new Error('Image recognition failed');
  }
};

// Parse health metrics from the extracted text with improved logic
const parseHealthMetrics = (text, userInfo) => {
  const metrics = {};
  const lines = text.split('\n');

  lines.forEach((line) => {
    const lowerLine = line.toLowerCase().trim();

    // Attempt to extract common health metrics with expanded keywords
    if (lowerLine.includes('glucose') || lowerLine.includes('blood sugar') || lowerLine.includes('glc')) {
      metrics.glucose = extractValue(line);
    }
    if (lowerLine.includes('cholesterol') || lowerLine.includes('ldl') || lowerLine.includes('hdl') || lowerLine.includes('total cholesterol')) {
      metrics.cholesterol = extractValue(line);
    }
    if (lowerLine.includes('alt') || lowerLine.includes('sgpt')) {
      metrics.alt = extractValue(line);
    }
    if (lowerLine.includes('ast') || lowerLine.includes('sgot')) {
      metrics.ast = extractValue(line);
    }
    // Add more health metrics extraction as needed
  });

  return metrics;
};

// Extract numerical value from a line of text (enhanced to handle various formats)
const extractValue = (line) => {
  const match = line.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[0]) : null;
};

// Generate a prompt for OpenAI based on user info and health metrics
const generatePrompt = (userInfo, metrics) => {
  let prompt = `
You are a medical expert providing a health summary for a patient based on their lab report. Please use a friendly and empathetic tone. The summary should be structured in an easy-to-read format, focusing on what is going well, what needs attention, and any critical issues.

Patient Information:
Name: ${userInfo.name}
Age: ${userInfo.age}
Gender: ${userInfo.gender}
Known Medical Conditions: ${userInfo.conditions}

Lab Results:
`;

  // Add the health metrics to the prompt
  for (const [key, value] of Object.entries(metrics)) {
    prompt += `${key}: ${value}\n`;
  }

  prompt += `
Please follow this structure:
1. Health Summary
2. What is Good
3. What Needs Attention
4. What is Critical
5. Next Steps

Provide practical advice with a positive and hopeful tone.
  `;

  return prompt;
};

// Get a health summary from OpenAI
const getAISummary = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.5, // Lower temperature for more factual output
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error with AI API:', error.response ? error.response.data : error.message);
    throw new Error('AI processing failed');
  }
};
