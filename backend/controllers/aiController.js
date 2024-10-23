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
    const userInfo = JSON.parse(req.body.userInfo);

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
    const metrics = parseHealthMetrics(extractedText, userInfo);

    // Generate AI prompt with patient information and metrics
    const prompt = generatePrompt(userInfo, metrics);

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
const parseHealthMetrics = (text, userInfo) => {
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

// Generate a prompt to send to OpenAI with patient info and metrics
const generatePrompt = (userInfo, metrics) => {
  let prompt = `You are a medical expert providing a simple, empathetic one-page health summary for a patient based on their medical report. Use the following structure:

1. Health Summary:
Start with the patient's name, age, and a brief overview of their main health conditions. Mention any specific symptoms and explain how their condition relates to these symptoms. Provide a short assessment of their BMI and blood pressure.

2. What’s Good:
Highlight the positive aspects of the patient's health, such as well-controlled conditions or healthy values in lab results.

3. What Needs Attention:
Point out any aspects of their health that are slightly out of range, like elevated BMI or blood pressure, and explain why these need attention.

4. What’s Critical:
Identify any serious concerns the patient should be aware of, and recommend immediate action if needed.

5. What You Should Do:
Provide clear, actionable steps the patient should take to maintain or improve their health.

6. Improvements:
Suggest additional lifestyle changes or habits the patient can adopt for better health.

7. Next Steps:
Recommend a timeline for follow-ups or tests.

Patient Information:
Name: ${userInfo.name}
Age: ${userInfo.age}
Gender: ${userInfo.gender}
Known Medical Conditions: ${userInfo.conditions}

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
