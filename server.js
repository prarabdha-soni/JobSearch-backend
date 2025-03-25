const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const multer = require('multer');
const { google } = require('googleapis');
const fs = require('fs');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const axios = require('axios');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

app.post('/upload-and-rank', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    // Step 1: Upload the file to Google Drive
    const fileMetadata = { name: file.originalname, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] };
    const media = { mimeType: file.mimetype, body: fs.createReadStream(file.path) };
    const response = await drive.files.create({ requestBody: fileMetadata, media, fields: 'id' });
    const fileId = response.data.id;

    // Step 2: Perform OCR by converting the file to Google Docs format
    const ocrResponse = await drive.files.copy({
      fileId: fileId,
      requestBody: { mimeType: 'application/vnd.google-apps.document', parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] },
      fields: 'id',
    });
    const ocrFileId = ocrResponse.data.id;

    // Step 3: Export the OCR result as plain text
    const ocrTextResponse = await drive.files.export({ fileId: ocrFileId, mimeType: 'text/plain' });
    const ocrText = ocrTextResponse.data;

    // Step 4: Generate a detailed report using OpenAI
    const openAIResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a certified professional resume writer (CPRW) and global career development facilitator (GCDF). Generate an executive-level resume analysis report using formal business documentation standards. Structure as follows:
    
    # RESUME EVALUATION REPORT  
    **Document Control**  
    Version: 1.0  
    Date: ${new Date().toISOString().split('T')[0]}  
    Confidentiality Level: Internal Use Only  
    
    ## Executive Assessment
    - **Candidate Profile Summary** (3-line synopsis)
    - **Overall Suitability Rating**: [X]/100 (AAA Scale)
    - **Key Differentiators**
    - **Critical Development Areas**
    
    ## Competency Framework Analysis
    ### Core Components Evaluation  
    | Category              | Score | Benchmark | Assessment Summary |
    |-----------------------|-------|-----------|--------------------|
    | Professional Narrative| X/100 | 85%       | [Concise analysis] |
    | Achievement Portfolio | X/100 | 90%       | [Quantified impact]|
    | Educational Profile   | X/100 | 80%       | [Relevance assessment] |
    | Technical Currency    | X/100 | 75%       | [Skills validation] |
    | ATS Optimization      | X/100 | 95%       | [Compatibility check] |
    
    ## Detailed Evaluation Matrix
    ### Section 1: Professional Narrative
    - **Career Continuity**: Employment timeline analysis
    - **Position Relevance**: Role alignment with stated objectives
    - **Leadership Capital**: Team/Project leadership evidence
    - **Value Demonstration**: ROI statements and metrics
    
    ### Section 2: Achievement Portfolio
    - STAR (Situation-Task-Action-Result) analysis
    - Quantification percentage
    - Industry-specific metric relevance
    - Comparative achievement ranking
    
    ### Section 3: Educational Profile
    - Degree equivalency assessment
    - Continuing education trajectory
    - Certification validation process
    - Accreditation body recognition
    
    ### Section 4: Technical Currency
    - Hard/Soft skills ratio
    - Emerging technology alignment
    - Certification stack analysis
    - Technical lexicon optimization
    
    ## Priority Action Items
    **Immediate Revisions** (0-48 hours):
    1. Compliance updates for ATS standards
    2. Critical information hierarchy restructuring
    3. Mandatory keyword implementation
    
    **Strategic Enhancements** (7-14 days):
    1. Achievement quantification plan
    2. Skills matrix realignment
    3. Professional development roadmap
    
    **Long-Term Development** (30-90 days):
    1. Certification pathway planning
    2. Leadership narrative building
    3. Industry networking strategy
    
    ## Compliance & Best Practices
    - **ATS Optimization Checklist**:
      ✓ Applicant Tracking System compatibility  
      ✓ Machine-readable formatting  
      ✓ Keyword density (4-7%)  
      ✓ Section header standardization  
    
    - **Global Hiring Standards**:
      ✓ GDPR-compliant content  
      ✓ Cultural competency indicators  
      ✓ International credential formatting  
    
    ## Rating Scale
    **AAA Suitability Scale**:
    - 95-100: Exceptional Candidate (Priority Shortlist)
    - 85-94: Strong Potential (Recommended Interview)
    - 75-84: Developmental Candidate (Secondary Pool)
    - <74: Non-Competitive Profile
    
    ## Appendices
    A. Resume Excerpts with Annotation  
    B. Industry Benchmark Comparison  
    C. Recommended Training Modules  
    
    **Disclaimer**: This assessment follows ISO 10667-2:2020 evaluation standards. Results are confidential and intended for professional development purposes only.`
          },
          { 
            role: 'user', 
            content: `Resume Content:\n${ocrText}\n\nEvaluation Protocol:
    1. Apply SHRM competency framework
    2. Cross-reference with O*NET occupational standards
    3. Analyze against LinkedIn Talent Solutions benchmarks
    4. Maintain EEOC compliance in all recommendations`
          }
        ],
        max_tokens: 3200,
        temperature: 0.2,
        response_format: { type: "text" }
      },
      { 
        headers: { 
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 
          'Content-Type': 'application/json',
          'X-Professional-Standards': 'ISO-10667, SHRM-CP, NCDA' 
        } 
      }
    );

    if (!openAIResponse.data.choices?.length) throw new Error('OpenAI API Error');
    const reportContent = openAIResponse.data.choices[0]?.message?.content?.trim();

    // Step 5: Convert the OpenAI-generated report to a PDF
    const pdfPath = `uploads/Resume_Report_${Date.now()}.pdf`;
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Add the OpenAI-generated content to the PDF
    doc.font('Helvetica').fontSize(12).text(reportContent, { align: 'left' });
    doc.end();

    // Wait for the PDF to finish writing
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Step 6: Upload the PDF report to Google Drive
    const reportResponse = await drive.files.create({
      requestBody: { name: `Resume_Report_${Date.now()}.pdf`, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] },
      media: { mimeType: 'application/pdf', body: fs.createReadStream(pdfPath) },
      fields: 'id',
    });

    // Step 7: Clean up local files
    fs.unlinkSync(file.path);
    fs.unlinkSync(pdfPath);

    res.json({ message: 'Resume analyzed successfully', reportFileId: reportResponse.data.id });
  } catch (error) {
    console.error('Error processing resume:', error);
    res.status(500).json({ error: 'Failed to process resume' });
  }
});

app.post('/execute-query', async (req, res) => {
  try {
    const { query, collectionName } = req.body;

    if (!query || !collectionName) {
      return res.status(400).json({ error: 'Missing query or collectionName' });
    }

    // Validate collection name
    if (!['companies', 'users'].includes(collectionName)) {
      return res.status(400).json({ error: 'Invalid collection name' });
    }

    // Security validation for query structure
    if (typeof query !== 'object' || Array.isArray(query)) {
      return res.status(400).json({ error: 'Invalid query format' });
    }

    const collection = db.collection(collectionName);
    const results = await collection.find(query).toArray();

    // Sanitize output
    const sanitizedResults = results.map(result => ({
      _id: result._id,
      name: result.name,
      industry: result.industry,
      location: result.location,
      description: result.description,
      website: result.website,
      employees: result.employees
    }));

    res.json({ results: sanitizedResults });
  } catch (error) {
    console.error('Query execution error:', error);
    res.status(500).json({ 
      error: 'Error executing query',
      details: error.message
    });
  }
});


app.listen(port, () => console.log(`Server running on http://localhost:${port}`));