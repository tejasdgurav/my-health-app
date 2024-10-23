require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');

// Ensure OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OpenAI API key is missing');
}

// OpenAI configuration (new initialization)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.analyzeReport = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Extract text from the file
    let extractedText = '';

    if (file.mimetype === 'application/pdf') {
      extractedText = await extractTextFromPDF(file.buffer);
    } else if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      extractedText = await extractTextFromImage(file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Parse health metrics from extracted text
    const metrics = parseHealthMetrics(extractedText);

    // Generate AI prompt with metrics only from the report
    const prompt = generatePrompt(metrics);

    // Get AI-generated summary
    const summary = await getAISummary(prompt);

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
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw new Error('PDF processing failed');
  }
};

// Extract text from an image buffer using Tesseract
const extractTextFromImage = async (buffer) => {
  try {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
    return text;
  } catch (error) {
    console.error('Tesseract error:', error.message);
    throw new Error('Image recognition failed');
  }
};

// Parse health metrics from the extracted text
const parseHealthMetrics = (text) => {
  const metrics = {};
  const lines = text.split('\n');

  lines.forEach((line) => {
    const lowerLine = line.toLowerCase();

    // Extract common health metrics
    if (lowerLine.includes('glucose')) {
      metrics.glucose = extractValue(line);
    }
    if (lowerLine.includes('cholesterol')) {
      metrics.cholesterol = extractValue(line);
    }
    if (lowerLine.includes('alt') || lowerLine.includes('sgpt')) {
      metrics.alt = extractValue(line);
    }
    if (lowerLine.includes('ast') || lowerLine.includes('sgot')) {
      metrics.ast = extractValue(line);
    }
    // Add more metrics as necessary
  });

  return metrics;
};

// Extract numerical value from a line of text
const extractValue = (line) => {
  const match = line.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[0]) : null;
};

// Generate a prompt to send to OpenAI with metrics only
const generatePrompt = (metrics) => {
  let prompt = `You are a medical expert providing a simple, empathetic one-page health summary for a patient based only on their medical report. Use the following structure:

1. Health Summary:
Provide an overview based on the lab results. Mention any notable findings related to key health conditions, such as glucose, cholesterol, liver enzymes (ALT, AST), etc.

2. What’s Good:
Highlight the positive aspects of the lab results, such as values within the normal range.

3. What Needs Attention:
Point out any slightly out-of-range values that require monitoring or lifestyle changes.

4. What’s Critical:
Identify any serious concerns that the patient should be aware of, and recommend immediate action if needed.

5. What You Should Do:
Provide clear, actionable steps the patient should take to maintain or improve their health.

6. Improvements:
Suggest additional lifestyle changes or habits the patient can adopt for better health.

7. Next Steps:
Recommend a timeline for follow-ups or tests.

Lab Results:
`;

  for (const [key, value] of Object.entries(metrics)) {
    prompt += `${key}: ${value}\n`;
  }

  prompt += `\nProvide clear explanations and end with an encouraging and positive message.`;

  return prompt;
};

// Send the generated prompt to OpenAI and get a summary back
const getAISummary = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    });
    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error with AI API:', error.response ? error.response.data : error.message);
    throw new Error('AI processing failed');
  }
};
