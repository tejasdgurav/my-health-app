require('dotenv').config();
const OpenAI = require('openai');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');  // For image preprocessing
const { exec } = require('child_process');  // To run external commands (e.g., Poppler)

const fs = require('fs');
const path = require('path');

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

    // Attempt text extraction from PDF
    let extractedText = await extractTextFromPDF(file.buffer);

    // If no text is found, try OCR on the PDF
    if (!extractedText || extractedText.trim() === '') {
      extractedText = await extractTextFromImageBasedPDF(file.buffer).catch((err) => {
        console.error('Error extracting text from image-based PDF:', err.message);
        return 'Unable to extract text from the PDF.';
      });
    }

    if (!extractedText || extractedText.trim() === '') {
      extractedText = 'No readable text could be extracted from the report.';
    }

    // Analyze the extracted text and get the summary
    const summary = await analyzeExtractedText(extractedText).catch((err) => {
      console.error('Error analyzing text:', err.message);
      return 'Unable to analyze the report at this time.';
    });

    res.json({ summary });
  } catch (error) {
    console.error('Error processing report:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Extract text from a text-based PDF buffer using pdf-parse
const extractTextFromPDF = async (buffer) => {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    return '';  // Return empty string if extraction fails
  }
};

// Convert PDF to images using Poppler (pdftoppm) for OCR processing
const convertPDFToImages = async (buffer, outputDir) => {
  const tempPDFPath = path.join(outputDir, 'temp.pdf');
  fs.writeFileSync(tempPDFPath, buffer);

  return new Promise((resolve, reject) => {
    const command = `pdftoppm -png ${tempPDFPath} ${outputDir}/page`;
    exec(command, (err) => {
      if (err) {
        console.error('Error converting PDF to images:', err.message);
        reject('PDF to image conversion failed');
      } else {
        resolve(outputDir);
      }
    });
  });
};

// Perform OCR on image files (output from pdftoppm) using Tesseract.js
const performOCROnImages = async (imageDir) => {
  const files = fs.readdirSync(imageDir).filter((file) => file.endsWith('.png'));
  let fullText = '';

  for (const file of files) {
    const imagePath = path.join(imageDir, file);
    const processedImage = await sharp(imagePath)
      .greyscale()
      .sharpen()
      .normalize()
      .toBuffer();

    const { data: { text } } = await Tesseract.recognize(processedImage, 'eng');
    fullText += text + '\n';
  }

  return fullText;
};

// Extract text from an image-based PDF using pdftoppm (Poppler) + Tesseract.js for OCR
const extractTextFromImageBasedPDF = async (buffer) => {
  const tempDir = path.join(__dirname, 'temp_images');

  // Create a temporary directory to store images
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  try {
    // Convert PDF to images using Poppler
    await convertPDFToImages(buffer, tempDir);

    // Perform OCR on the generated images
    const extractedText = await performOCROnImages(tempDir);

    // Clean up temp files
    fs.rmdirSync(tempDir, { recursive: true });

    return extractedText || 'No text extracted from image-based PDF.';
  } catch (error) {
    console.error('Error extracting text from image-based PDF:', error.message);
    return 'Unable to extract text from image-based PDF.';
  }
};

// Analyze the extracted text by sending it to OpenAI with a detailed and flexible prompt
const analyzeExtractedText = async (extractedText) => {
  const prompt = `
    I want you to act as a highly empathetic and clear medical expert who explains complex medical diagnoses and conditions in a way that is easy to understand for a non-medical person. 
    Your task is to generate a comprehensive health report based on the provided health report and any medical conditions or diagnoses included. 
    This report must follow exactly this structure and format, but be adaptable to any health conditions and diagnoses:

    Quick Snapshot for [Patient Name]:
    - Age: [Patient Age]
    - Diagnoses: [List of diagnoses, e.g., Hypothyroidism, Diabetes, Hypertension, etc.]
    
    Current Medications:
    - List each medication with a brief explanation of what it does, e.g., "Medication Name: Brief explanation of its purpose."

    General Health Overview:
    - Good: Highlight aspects of the patient’s health that are stable or within normal ranges (e.g., "Your blood pressure is stable.")
    - Needs Attention: Mention any areas that require monitoring or adjustment (e.g., elevated BMI, glucose levels).
    - Critical: Identify critical conditions that need immediate attention (e.g., "It is critical to monitor blood sugar levels to avoid diabetes complications.").

    Detailed Health Report for [Patient Name]

    What’s Going On?
    Explain what the health conditions are, their potential causes, and how they are affecting the patient. Use simple, plain language to describe each condition and how it affects the body.

    For each condition, explain:
    - What is it?: Describe the condition and its significance to the patient’s health.
    - Why does it happen?: Explain the cause or possible causes of the condition (e.g., autoimmune disease, poor lifestyle, genetics).
    - Symptoms: List common symptoms associated with the condition.

    What You Should Do
    Provide actionable recommendations for managing each condition. Tailor this advice to the specific condition.

    - Condition 1 (e.g., Hypothyroidism):
      - Medication: Explain how the patient should manage their medication (e.g., "Take your thyroid medication daily to keep your hormone levels balanced.").
      - Lifestyle: Provide lifestyle recommendations like diet, exercise, and stress management.
      - Monitoring: Explain the importance of regular follow-up checks (e.g., "Monitor your thyroid function with blood tests every 6 months.").

    - Condition 2 (e.g., Diabetes):
      - Diet and Exercise: Provide practical suggestions for improving diet and staying active to manage diabetes.
      - Monitoring: Remind the patient to regularly check their blood sugar levels.
    
    - Condition 3 (e.g., Hypertension):
      - Monitoring: Recommend regular blood pressure monitoring and when to alert the doctor.
      - Lifestyle: Offer advice to reduce salt intake, increase potassium, and stay active.

    Why It All Matters
    Explain why managing these conditions is important. Describe how the conditions may be interconnected and how controlling one can benefit the others. 

    What to Watch For
    Provide a list of warning signs or symptoms that the patient should be aware of, including:
    - Energy Levels: Watch for fatigue that may indicate a need for medication adjustment.
    - Blood Sugar: Remind the patient to monitor blood sugar to avoid complications.
    - Blood Pressure: Keep an eye on blood pressure and notify the doctor if it exceeds a certain threshold.

    Next Steps
    Provide a clear list of next steps, including:
    - Medication: Continue taking prescribed medications.
    - Follow-Up Appointments: Recommend when the patient should schedule their next doctor’s visit.
    - Lifestyle Adjustments: Encourage small, positive changes in diet and physical activity.

    In Summary
    - Reassure the patient that their conditions are manageable with proper care.
    - Highlight the key actions they need to take to stay in control of their health.
    - Provide encouragement and emphasize that by following these steps, they are on the path to better health.

    Here’s the extracted report:
    "${extractedText}"
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.2,  // Low temperature to ensure factual accuracy
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error with AI API:', error.response ? error.response.data : error.message);
    throw new Error('AI processing failed');
  }
};
