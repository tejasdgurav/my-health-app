require('dotenv').config();
const OpenAI = require('openai');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');

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

    // Extract text from the file (handle all formats)
    let extractedText = await extractTextFromFile(file);

    if (!extractedText) {
      return res.status(400).json({ error: 'Unable to extract text from the uploaded file' });
    }

    // Analyze the extracted text and get the summary
    const summary = await analyzeExtractedText(extractedText);

    res.json({ summary });
  } catch (error) {
    console.error('Error processing report:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Function to handle text extraction from various file types
const extractTextFromFile = async (file) => {
  if (file.mimetype === 'application/pdf') {
    const isImageBased = await isPDFImageBased(file.buffer);
    if (isImageBased) {
      return extractTextFromImageBasedPDF(file.buffer);  // Use OCR for image-based PDFs
    } else {
      return extractTextFromPDF(file.buffer);  // Use pdf-parse for text-based PDFs
    }
  } else if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
    return extractTextFromImage(file.buffer);  // Use Tesseract for image files
  } else {
    throw new Error('Unsupported file type');
  }
};

// Check if the PDF is image-based (i.e., scanned)
const isPDFImageBased = async (buffer) => {
  const pdfDoc = await PDFDocument.load(buffer);
  const numPages = pdfDoc.getPageCount();
  const page = pdfDoc.getPage(0);
  const text = await page.getTextContent();
  return text.items.length === 0;  // If no text content, it's likely image-based
};

// Extract text from a text-based PDF buffer
const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw new Error('PDF processing failed');
  }
};

// Extract text from an image-based PDF using OCR (Tesseract.js)
const extractTextFromImageBasedPDF = async (buffer) => {
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    const numPages = pdfDoc.getPageCount();
    let fullText = '';

    for (let i = 0; i < numPages; i++) {
      const page = pdfDoc.getPage(i);
      const pageImage = await page.renderToImage({ format: 'png' });
      const { data: { text } } = await Tesseract.recognize(pageImage, 'eng');
      fullText += text + '\n';
    }

    return fullText;
  } catch (error) {
    console.error('Error extracting text from image-based PDF:', error.message);
    throw new Error('Image-based PDF processing failed');
  }
};

// Extract text from an image buffer using Tesseract.js
const extractTextFromImage = async (buffer) => {
  try {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng');
    return text;
  } catch (error) {
    console.error('Tesseract error:', error.message);
    throw new Error('Image recognition failed');
  }
};

// Analyze the extracted text by sending it to OpenAI and ensuring no hallucinations
const analyzeExtractedText = async (extractedText) => {
  // Restrict AI to focus only on the data in the report
  const prompt = `You are an AI assistant tasked with analyzing a medical report. 
Your job is to provide an accurate summary based only on the facts present in the report. 
Do not make assumptions, do not hallucinate any data, and only summarize the information that is present in the report. 

Here is the report text: 
"${extractedText}"

Please provide a clear, simple, and understandable health summary for the patient using the following format:

1. Health Summary: Provide an overview of the patient's health based strictly on the report. No assumptions.
2. What’s Good: Highlight the positive aspects from the report.
3. What Needs Attention: Mention the aspects that need monitoring or are slightly out of range.
4. What’s Critical: Mention any critical aspects that the patient should be aware of.
5. What You Should Do: Suggest clear next steps based on the report data. No new data should be introduced.

Ensure the language is simple and clear, and the summary reflects exactly what is present in the report.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.2,  // Low temperature to avoid creative outputs and stick to facts
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error with AI API:', error.response ? error.response.data : error.message);
    throw new Error('AI processing failed');
  }
};
