const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(express.json());

// ================= FILE UPLOAD =================
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage });

app.post('/upload', upload.array('files'), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
    }

    const files = req.files.map(f => f.path.replace(/\\/g, '/'));

    res.json({ files });
});

// Serve uploaded files
app.use(express.static(path.join(__dirname)));

// ================= WORKERS =================
let workers = [];

app.post('/register', (req, res) => {
    const { workerUrl } = req.body;

    if (!workers.includes(workerUrl)) {
        workers.push(workerUrl);
        console.log("✅ Worker registered:", workerUrl);
    }

    res.json({ status: "registered" });
});

// ================= JOB QUEUE =================
let jobQueue = [];
let isProcessing = false;

// Submit job
app.post('/submit-job', (req, res) => {
    const { files } = req.body;

    if (!files) {
        return res.status(400).json({ error: "No files provided" });
    }

    const job = {
        id: Date.now(),
        files,
        status: "queued"
    };

    jobQueue.push(job);

    console.log("📥 Job added:", job.id);

    processQueue();

    res.json({
        message: "Job queued",
        jobId: job.id
    });
});

// Scheduler
async function processQueue() {
    if (isProcessing) return;
    if (jobQueue.length === 0) return;
    if (workers.length === 0) {
        console.log("⚠️ No workers available");
        return;
    }

    isProcessing = true;

    const job = jobQueue.shift();
    const worker = workers[0];

    console.log("🚀 Running job:", job.id);

    try {
        const response = await axios.post(`${worker}/execute`, {
            files: job.files
        });

        console.log("📊 Full Response:", response.data);

    } catch (err) {
        console.error("❌ Job failed:", job.id);
    }

    isProcessing = false;

    processQueue();
}

// Queue status
app.get('/queue', (req, res) => {
    res.json({
        queueLength: jobQueue.length,
        jobs: jobQueue
    });
});

// Start server
app.listen(3000, '0.0.0.0', () => {
    console.log("🚀 Server running on port 3000");
});