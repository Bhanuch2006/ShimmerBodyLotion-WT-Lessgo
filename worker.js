const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = 4000;
const SERVER_URL = "http://localhost:3000";
const workerUrl = `http://localhost:${PORT}`;

// ================= REGISTER =================
async function registerWorker() {
    try {
        await axios.post(`${SERVER_URL}/register`, { workerUrl });
        console.log("✅ Registered:", workerUrl);
    } catch (err) {
        console.error("❌ Registration failed:", err.message);
    }
}

// Auto re-register
setInterval(registerWorker, 10000);

// ================= DOWNLOAD =================
async function downloadFile(url, outputPath) {
    const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);

        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// ================= EXECUTE =================
app.post('/execute', async (req, res) => {
    try {
        const { files } = req.body;

        if (!files || files.length === 0) {
            return res.status(400).json({ error: "No files provided" });
        }

        const jobsPath = path.join(__dirname, 'jobs');
        if (!fs.existsSync(jobsPath)) fs.mkdirSync(jobsPath);

        let mainFile = "";

        // Download all files
        for (let file of files) {
            const cleanPath = file.replace(/\\/g, '/');
            let fileName = path.basename(cleanPath);

            // Normalize names
            if (fileName.endsWith('.py')) fileName = 'main.py';
            if (fileName.endsWith('.csv')) fileName = 'data.csv';

            const localPath = path.join(jobsPath, fileName);

            console.log("⬇️ Downloading:", cleanPath);

            await downloadFile(`${SERVER_URL}/${cleanPath}`, localPath);

            if (fileName === 'main.py') mainFile = fileName;
        }

        console.log("🧠 Executing:", mainFile);

        // 🔥 FIX: absolute path execution
        const mainFilePath = path.join(jobsPath, mainFile);
        const command = `py "${mainFilePath}"`;

        exec(command, { timeout: 60000 }, (err, stdout, stderr) => {

            if (stdout) console.log("STDOUT:\n", stdout);
            if (stderr) console.log("STDERR:\n", stderr);

            // Cleanup
            fs.readdirSync(jobsPath).forEach(file => {
                fs.unlinkSync(path.join(jobsPath, file));
            });

            if (err) {
                return res.json({
                    status: "error",
                    error: stderr
                });
            }

            res.json({
                status: "success",
                result: stdout
            });
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start worker
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Worker running at ${workerUrl}`);
    registerWorker();
});