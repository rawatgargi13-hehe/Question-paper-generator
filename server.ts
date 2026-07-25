import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy initialization of GoogleGenAI
function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// AI Question Paper Generation endpoint
app.post('/api/generate-paper', async (req, res) => {
  try {
    const {
      institutionName = 'University Examination Board',
      courseCode = 'CS-101',
      subjectName = 'Data Structures & Algorithms',
      selectedChapters = [],
      totalMarks = 50,
      durationMinutes = 90,
      difficulty = 'Medium',
      difficultyRatio = { easy: 30, medium: 50, hard: 20 },
      questionTypes = {
        mcqCount: 5,
        mcqMarks: 2,
        shortCount: 3,
        shortMarks: 5,
        longCount: 2,
        longMarks: 12.5,
      },
      bloomDistribution = {
        Remember: 15,
        Understand: 25,
        Apply: 30,
        Analyze: 15,
        Evaluate: 10,
        Create: 5,
      },
      generalInstructions = [
        'All questions in Section A are compulsory.',
        'Answer any 3 questions from Section B.',
        'Draw neat diagrams wherever necessary.',
      ],
      includeAnswerKey = true,
    } = req.body;

    const ai = getGenAIClient();

    const systemInstruction = `You are Bloomia AI, a world-class academic question paper designer and curriculum expert specializing in Bloom's Taxonomy aligned examination papers.
Your job is to generate a comprehensive, highly accurate, non-duplicative, university-level question paper based on the provided specifications.

CRITICAL CONSTRAINTS:
1. Syllabus Coverage: Strictly cover the specified chapters: ${selectedChapters.join(', ') || 'All syllabus units'}.
2. Bloom's Taxonomy Alignment: Ensure questions map accurately to Bloom's levels:
   - Remember: Recall facts, basic concepts, terms (e.g. Define, List, State)
   - Understand: Explain ideas, summarize (e.g. Explain, Describe, Differentiate)
   - Apply: Use information in new situations (e.g. Calculate, Solve, Implement)
   - Analyze: Draw connections, examine structure (e.g. Analyze, Compare, Deduce)
   - Evaluate: Justify a stand or decision (e.g. Evaluate, Assess, Critique)
   - Create: Produce new or original work (e.g. Design, Formulate, Synthesize)
3. Question Formats & Sections:
   - Section A: Multiple Choice Questions (MCQs) (${questionTypes.mcqCount || 0} questions, ${questionTypes.mcqMarks || 2} marks each). Must provide 4 distinct options (A, B, C, D).
   - Section B: Short Answer Questions (${questionTypes.shortCount || 0} questions, ${questionTypes.shortMarks || 5} marks each).
   - Section C: Descriptive / Long Answer / Numerical / Code Questions (${questionTypes.longCount || 0} questions, ${questionTypes.longMarks || 10} marks each).
4. Marks Distribution: Ensure the total marks equal ${totalMarks}.
5. Tone & Clarity: Professional, academic, precise, unambiguous. Include clear answer keys and step-by-step marking scheme / solutions for every question.`;

    const userPrompt = `Generate a ${totalMarks}-marks Question Paper for ${subjectName} (${courseCode}) at ${institutionName}.
Duration: ${durationMinutes} minutes.
Difficulty Level Target: ${difficulty} (Easy: ${difficultyRatio.easy}%, Medium: ${difficultyRatio.medium}%, Hard: ${difficultyRatio.hard}%).
Chapters covered: ${selectedChapters.join('; ')}.
Question breakdown requested:
- MCQs: ${questionTypes.mcqCount} questions of ${questionTypes.mcqMarks} marks each.
- Short Answer: ${questionTypes.shortCount} questions of ${questionTypes.shortMarks} marks each.
- Long Answer: ${questionTypes.longCount} questions of ${questionTypes.longMarks} marks each.
Bloom Taxonomy Weightage Emphasis:
- Remember: ${bloomDistribution.Remember}%
- Understand: ${bloomDistribution.Understand}%
- Apply: ${bloomDistribution.Apply}%
- Analyze: ${bloomDistribution.Analyze}%
- Evaluate: ${bloomDistribution.Evaluate}%
- Create: ${bloomDistribution.Create}%

Include detailed general instructions and full answer keys / marking schemes for each section.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            institutionName: { type: Type.STRING },
            courseCode: { type: Type.STRING },
            subjectName: { type: Type.STRING },
            totalMarks: { type: Type.NUMBER },
            durationMinutes: { type: Type.NUMBER },
            generalInstructions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  instructions: { type: Type.STRING },
                  totalMarks: { type: Type.NUMBER },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        chapter: { type: Type.STRING },
                        type: { type: Type.STRING },
                        bloomLevel: { type: Type.STRING },
                        difficulty: { type: Type.STRING },
                        marks: { type: Type.NUMBER },
                        questionText: { type: Type.STRING },
                        options: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        answerKey: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                      },
                      required: [
                        'chapter',
                        'type',
                        'bloomLevel',
                        'difficulty',
                        'marks',
                        'questionText',
                        'answerKey',
                      ],
                    },
                  },
                },
                required: ['title', 'instructions', 'questions'],
              },
            },
          },
          required: [
            'title',
            'institutionName',
            'courseCode',
            'subjectName',
            'totalMarks',
            'durationMinutes',
            'generalInstructions',
            'sections',
          ],
        },
      },
    });

    if (!response.text) {
      throw new Error('AI service returned empty response');
    }

    const paperData = JSON.parse(response.text);

    // Add unique IDs and timestamp
    const timestamp = new Date().toISOString().split('T')[0];
    const generatedPaper = {
      id: `paper-${Date.now()}`,
      ...paperData,
      selectedChapters,
      difficulty,
      difficultyBreakdown: difficultyRatio,
      bloomBreakdown: bloomDistribution,
      createdAt: timestamp,
      isSaved: false,
    };

    res.json({ success: true, paper: generatedPaper });
  } catch (error: any) {
    console.error('Error generating question paper:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate question paper.',
    });
  }
});

// Single AI question generator endpoint
app.post('/api/generate-question', async (req, res) => {
  try {
    const { subjectName, chapter, bloomLevel, difficulty, questionType, marks } = req.body;

    const ai = getGenAIClient();

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: `Generate a single ${difficulty} difficulty ${questionType} question worth ${marks} marks for subject ${subjectName}, chapter: ${chapter}.
Bloom's Taxonomy Level target: ${bloomLevel}.
Provide: questionText, options (if MCQ), answerKey, explanation.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questionText: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answerKey: { type: Type.STRING },
            explanation: { type: Type.STRING },
          },
          required: ['questionText', 'answerKey'],
        },
      },
    });

    if (!response.text) {
      throw new Error('Empty AI response');
    }

    const qData = JSON.parse(response.text);
    const newQuestion = {
      id: `q-${Date.now()}`,
      subjectId: subjectName.toLowerCase().replace(/\s+/g, '-'),
      subjectName,
      chapter: chapter || 'General',
      type: questionType || 'Short Answer',
      bloomLevel: bloomLevel || 'Apply',
      difficulty: difficulty || 'Medium',
      marks: marks || 5,
      ...qData,
      createdAt: new Date().toISOString().split('T')[0],
    };

    res.json({ success: true, question: newQuestion });
  } catch (error: any) {
    console.error('Error generating question:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bloomia AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
