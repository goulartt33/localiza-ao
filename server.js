const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Banco de dados simples
const DB_FILE = 'database.json';

function readDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        return { locations: [], devices: [] };
    }
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Rota para receber dados
app.post('/track', (req, res) => {
    const data = req.body;
    const db = readDB();
    
    // Adicionar timestamp
    data.timestamp = new Date().toISOString();
    data.id = Date.now() + Math.random().toString(36).substr(2, 5);
    
    db.locations.push(data);
    
    // Atualizar dispositivo
    const deviceIndex = db.devices.findIndex(d => d.deviceId === data.deviceId);
    if (deviceIndex === -1) {
        db.devices.push({
            deviceId: data.deviceId,
            firstSeen: data.timestamp,
            lastSeen: data.timestamp,
            locations: [data],
            status: 'online'
        });
    } else {
        db.devices[deviceIndex].lastSeen = data.timestamp;
        db.devices[deviceIndex].locations.push(data);
    }
    
    saveDB(db);
    console.log('📍 Dados recebidos:', data.deviceId);
    res.json({ status: 'success', received: true });
});

// Dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/data', (req, res) => {
    res.json(readDB());
});

// Limpar dados (opcional)
app.delete('/api/clear', (req, res) => {
    saveDB({ locations: [], devices: [] });
    res.json({ status: 'cleared' });
});

app.listen(port, () => {
    console.log(`🚀 Sistema rodando na porta: ${port}`);
});
