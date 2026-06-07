// ============================================================
    // colabor-ai Cloud - Frontend Logic
    // Login Google OAuth + Chat + WebSocket
    // ============================================================
    
    const API_BASE = window.location.origin;
    let authToken = localStorage.getItem('colabor_ai_token');
    let currentUser = null;
    let socket = null;
    let isProcessing = false;
    
    // ============================================
    // DOM Elements
    // ============================================
    const loginScreen = document.getElementById('loginScreen');
    const chatScreen = document.getElementById('chatScreen');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const messagesList = document.getElementById('messagesList');
    const typingIndicator = document.getElementById('typingIndicator');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const userInitial = document.getElementById('userInitial');
    
    // ============================================
    // Auto-resize textarea
    // ============================================
    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
        sendBtn.disabled = !messageInput.value.trim();
    });
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    sendBtn.addEventListener('click', sendMessage);
    
    // ============================================
    // Authentication
    // ============================================
    googleLoginBtn.addEventListener('click', () => {
        window.location.href = `${API_BASE}/auth/google`;
    });
    
    // ============================================
    // Modo Demonstracao
    // ============================================
    document.getElementById('demoLoginBtn').addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE}/auth/demo`, { method: 'POST' });
            const data = await res.json();
            if (data.token) {
                authToken = data.token;
                currentUser = data.user;
                localStorage.setItem('colabor_ai_token', authToken);
                showChat();
                connectWebSocket();
            } else {
                alert('Erro ao iniciar modo demonstracao: ' + (data.error || 'Erro desconhecido'));
            }
        } catch (err) {
            alert('Erro de conexao: ' + err.message);
        }
    });
    
    // Check if we have a token from OAuth callback
    function getTokenFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('token');
    }
    
    async function initAuth() {
        const urlToken = getTokenFromUrl();
        if (urlToken) {
            authToken = urlToken;
            localStorage.setItem('colabor_ai_token', authToken);
            // Clean URL
            window.history.replaceState({}, document.title, '/');
        }
    
        if (authToken) {
            try {
                const res = await fetch(`${API_BASE}/auth/validate`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const data = await res.json();
                if (data.valid) {
                    currentUser = data.user;
                    showChat();
                    connectWebSocket();
                    return;
                }
            } catch (err) {
                console.error('Auth error:', err);
            }
            // Token invalid
            localStorage.removeItem('colabor_ai_token');
            authToken = null;
        }
        showLogin();
    }
    
    function showLogin() {
        loginScreen.classList.remove('hidden');
        chatScreen.classList.add('hidden');
    }
    
    function showChat() {
        loginScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        if (currentUser) {
            userName.textContent = currentUser.name;
            if (currentUser.avatar_url) {
                userAvatar.src = currentUser.avatar_url;
                userAvatar.classList.remove('hidden');
                userInitial.classList.add('hidden');
            } else {
                userInitial.textContent = currentUser.name.charAt(0).toUpperCase();
            }
        }
        // Focus input
        setTimeout(() => messageInput.focus(), 300);
    }
    
    logoutBtn.addEventListener('click', async () => {
        if (authToken) {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        }
        if (socket) socket.close();
        localStorage.removeItem('colabor_ai_token');
        authToken = null;
        currentUser = null;
        showLogin();
        messagesList.innerHTML = '';
    });
    
    // ============================================
    // WebSocket
    // ============================================
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
    
        socket = new WebSocket(wsUrl);
    
        socket.onopen = () => {
            console.log('[WS] Conectado ao servidor');
            // Send auth
            socket.send(JSON.stringify({
                type: 'auth',
                token: authToken
            }));
        };
    
        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                handleWsMessage(msg);
            } catch (err) {
                console.error('[WS] Erro ao parsear mensagem:', err);
            }
        };
    
        socket.onclose = () => {
            console.log('[WS] Desconectado. Reconectando em 5s...');
            setTimeout(connectWebSocket, 5000);
        };
    
        socket.onerror = (err) => {
            console.error('[WS] Erro:', err);
        };
    }
    
    function handleWsMessage(msg) {
        switch (msg.type) {
            case 'agent_response':
                hideTyping();
                addMessage(msg.response || msg.data?.response, 'agent');
                isProcessing = false;
                break;
            case 'tool_result':
                // Tool executed, waiting for agent response
                break;
            case 'error':
                hideTyping();
                addMessage('Erro: ' + (msg.message || msg.error), 'agent');
                isProcessing = false;
                break;
            case 'auth_ok':
                console.log('[WS] Autenticado');
                break;
        }
    }
    
    // ============================================
    // Chat
    // ============================================
    async function sendMessage() {
        const text = messageInput.value.trim();
        if (!text || isProcessing) return;
    
        messageInput.value = '';
        messageInput.style.height = 'auto';
        sendBtn.disabled = true;
    
        addMessage(text, 'user');
        showTyping();
        isProcessing = true;
    
        try {
            // Send via REST API
            const res = await fetch(`${API_BASE}/agents/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ message: text })
            });
    
            const data = await res.json();
            hideTyping();
    
            if (data.success) {
                addMessage(data.response || data.data?.response, 'agent');
            } else {
                addMessage('Erro: ' + (data.error || 'Erro desconhecido'), 'agent');
            }
        } catch (err) {
            hideTyping();
            addMessage('Erro de conexão: ' + err.message, 'agent');
        }
    
        isProcessing = false;
    }
    
    function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = 'flex ' + (role === 'user' ? 'justify-end' : 'justify-start') + ' fade-in';
    
        const isUser = role === 'user';
        const maxWidth = window.innerWidth < 640 ? 'max-w-[85%]' : 'max-w-[70%]';
    
        div.innerHTML = `
            <div class="${maxWidth} ${isUser ? 'msg-user text-white rounded-2xl rounded-tr-md px-4 py-3' : 'msg-agent text-zinc-200 rounded-2xl rounded-tl-md px-4 py-3'}">
                ${isUser ? '' : '<div class="text-xs text-primary-400 font-medium mb-1">colabor-ai</div>'}
                <div class="text-sm leading-relaxed whitespace-pre-wrap">${escapeHtml(text)}</div>
                <div class="text-xs ${isUser ? 'text-white/50 text-right mt-1' : 'text-zinc-500 mt-1'}">${getTime()}</div>
            </div>
        `;
    
        messagesList.appendChild(div);
        scrollToBottom();
    }
    
    function showTyping() {
        typingIndicator.classList.remove('hidden');
        scrollToBottom();
    }
    
    function hideTyping() {
        typingIndicator.classList.add('hidden');
    }
    
    function scrollToBottom() {
        const container = document.getElementById('messagesContainer');
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    }
    
    function getTime() {
        const now = new Date();
        return now.getHours().toString().padStart(2, '0') + ':' +
               now.getMinutes().toString().padStart(2, '0');
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // ============================================
    // Init
    // ============================================
    initAuth();
    