import axios from 'axios';

// Web storage wrapper (replaces electron-store)
const storage = {
    get(key, defaultValue) {
        const value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

// DOM elements
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const contextBtn = document.getElementById('contextBtn');
const contextPanel = document.getElementById('contextPanel');
const contextContent = document.getElementById('contextContent');
const closeContextBtn = document.getElementById('closeContext');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const apiKeyInput = document.getElementById('apiKey');
const saveSettingsBtn = document.getElementById('saveSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const todoBtn = document.getElementById('todoBtn');
const todoPanel = document.getElementById('todoPanel');
const closeTodoBtn = document.getElementById('closeTodo');
const newTodoInput = document.getElementById('newTodoInput');
const addTodoBtn = document.getElementById('addTodoBtn');
const todoList = document.getElementById('todoList');
const toggleArchiveBtn = document.getElementById('toggleArchiveBtn');
const journalBtn = document.getElementById('journalBtn');
const journalToggleBtn = document.getElementById('journalToggleBtn');
const journalPanel = document.getElementById('journalPanel');
const closeJournalBtn = document.getElementById('closeJournal');
const journalSearchInput = document.getElementById('journalSearchInput');
const journalSearchBtn = document.getElementById('journalSearchBtn');
const journalContent = document.getElementById('journalContent');
const companionBtn = document.getElementById('companionBtn');
const appTitle = document.getElementById('appTitle');
const welcomePanel = document.getElementById('welcomePanel');
const welcomeAcknowledge = document.getElementById('welcomeAcknowledge');
const welcomeContinue = document.getElementById('welcomeContinue');
const promptsBtn = document.getElementById('promptsBtn');
const promptSuggestions = document.getElementById('promptSuggestions');

let conversationHistory = [];
let sessionContext = '';
let todos = storage.get('todos', []);
let showArchive = false;
let journalRecording = false;
let currentCompanion = null;
let allCompanions = [];

// Load companions from JSON files
async function loadCompanions() {
    try {
        const companionFiles = [
            'anchor', 'athena', 'bloom', 'bolt', 'chrysalis', 'compass',
            'echo', 'keeper', 'luna', 'muse', 'phoenix', 'prism',
            'river', 'rowan', 'sage', 'spark', 'sunny', 'tide',
            'vesper', 'willow'
        ];
        
        const promises = companionFiles.map(async (name) => {
            const response = await fetch(`/companions/${name}.json`);
            const companion = await response.json();
            companion.id = name;
            return companion;
        });
        
        allCompanions = await Promise.all(promises);
        console.log('Loaded companions:', allCompanions.length);
        
        const currentCompanionId = storage.get('currentCompanion', 'rowan');
        await switchToCompanion(currentCompanionId, false);
    } catch (error) {
        console.error('Error loading companions:', error);
        addMessage('Welcome to AI Creature Journal!', 'assistant');
    }
}

async function switchToCompanion(companionId, showWelcome = true) {
    console.log('switchToCompanion called:', companionId, 'showWelcome:', showWelcome);
    const companion = allCompanions.find(c => c.id === companionId);
    if (!companion) {
        console.error('Companion not found:', companionId);
        return;
    }
    
    currentCompanion = companion;
    storage.set('currentCompanion', companionId);
    
    // Update UI
    appTitle.textContent = `${companion.emoji} ${companion.name}`;
    document.title = companion.appName || 'AI Creature Journal';
    console.log('Updated UI for companion:', companion.name);
    
    // Update colors if specified
    if (companion.colors && companion.colors.primary) {
        document.documentElement.style.setProperty('--primary-color', companion.colors.primary);
    }
    if (companion.colors && companion.colors.accent) {
        document.documentElement.style.setProperty('--accent-color', companion.colors.accent);
    }
    
    // Update placeholder
    if (companion.placeholder) {
        messageInput.placeholder = companion.placeholder;
    }
    
    // Update journal prompts
    updateJournalPrompts();
    
    // Show prompts button
    if (promptsBtn) {
        promptsBtn.classList.remove('hidden');
    }
    
    // Check if API key is set (only show setup on first launch)
    const apiKey = storage.get('anthropicApiKey', '');
    const hasSeenApiSetup = storage.get('hasSeenApiSetup', false);
    
    if (!apiKey && !hasSeenApiSetup) {
        // Show API key setup instructions (first time only)
        showApiKeySetup();
        storage.set('hasSeenApiSetup', true);
    } else {
        // Clear conversation and show welcome
        if (showWelcome) {
            conversationHistory = [];
            messagesDiv.innerHTML = '';
            
            // Show companion greeting
            addMessage(companion.personality.greeting, 'assistant');
            
            // Show feature tour
            console.log('Adding feature tour message');
            const featureTour = `**Here's how to use our space together:**

💭 **Journal Prompts** - Click the 💭 button for writing prompts tailored to help you reflect and explore.

📓 **Journal History** - Click 📓 to view and search your past journal entries.

⏺️ **Journal Recording** - Click ⏺️ to start/stop recording our conversation. Everything we discuss is automatically saved to your journal with timestamps.

✅ **Todo List** - Click ✅ to manage tasks. I can help you add, organize, and track your todos.

📋 **View Context** - Click 📋 to see your session summary.

🎭 **Switch Companions** - Click 🎭 anytime to choose a different companion if you need a different kind of support.

Ready when you are! What would you like to explore today?`;
            
            addMessage(featureTour, 'assistant');
            console.log('Feature tour message added');
        }
    }
}

function showApiKeySetup() {
    messagesDiv.innerHTML = '';
    const setupMessage = document.createElement('div');
    setupMessage.className = 'message assistant';
    setupMessage.innerHTML = `
        <div style="padding: 20px; background: #2a2a2a; border-radius: 10px; margin: 20px;">
            <h2 style="color: #fff; margin-top: 0;">🔑 API Key Required</h2>
            <p style="color: #ccc; line-height: 1.6;">To use ${currentCompanion.emoji} ${currentCompanion.name}, you need a Claude API key from Anthropic.</p>
            
            <div style="background: #ff6b35; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <strong style="color: #fff;">⚠️ Important: This costs real money!</strong>
                <p style="color: #fff; margin: 10px 0 0 0;">API usage is billed by Anthropic (~$15-60/month depending on usage).</p>
            </div>
            
            <h3 style="color: #fff; margin-top: 20px;">How to get your API key:</h3>
            <ol style="color: #ccc; line-height: 1.8;">
                <li>Go to <a href="https://console.anthropic.com" target="_blank" style="color: #d4a574;">console.anthropic.com</a></li>
                <li>Sign up or log in</li>
                <li>Add credits to your account (Settings → Billing)</li>
                <li>Go to API Keys section</li>
                <li>Create a new key and copy it</li>
            </ol>
            
            <p style="color: #ccc; margin-top: 20px;">
                <strong>Check your balance:</strong> 
                <a href="https://console.anthropic.com/settings/billing" target="_blank" style="color: #d4a574;">console.anthropic.com/settings/billing</a>
            </p>
            
            <div style="margin-top: 25px;">
                <button onclick="document.getElementById('settingsBtn').click()" 
                        style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; margin-right: 10px;">
                    Enter API Key →
                </button>
                <button onclick="window.open('https://console.anthropic.com', '_blank')" 
                        style="background: #555; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer;">
                    Get API Key
                </button>
            </div>
        </div>
    `;
    messagesDiv.appendChild(setupMessage);
}

function updateJournalPrompts() {
    if (!currentCompanion || !currentCompanion.journalPrompts) return;
    
    const promptsContainer = document.getElementById('promptSuggestions');
    if (!promptsContainer) return;
    
    promptsContainer.innerHTML = '';
    currentCompanion.journalPrompts.forEach(prompt => {
        const btn = document.createElement('button');
        btn.className = 'prompt-btn';
        btn.textContent = prompt;
        btn.addEventListener('click', () => {
            messageInput.value = prompt;
            promptsContainer.classList.add('hidden');
            messageInput.focus();
        });
        promptsContainer.appendChild(btn);
    });
}

function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const textDiv = document.createElement('div');
    textDiv.textContent = content;
    messageDiv.appendChild(textDiv);
    
    messagesDiv.appendChild(messageDiv);
    
    // Scroll to bottom with slight delay to ensure rendering is complete
    setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }, 10);
    
    return messageDiv;
}

function buildSystemPrompt() {
    const companionPrompt = currentCompanion?.personality?.systemPrompt || 
        `You are a supportive journaling companion. Help the user reflect on their thoughts and feelings through gentle questions and active listening.`;
    
    return [{
        type: 'text',
        text: companionPrompt,
        cache_control: { type: 'ephemeral' }
    }];
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    const apiKey = storage.get('anthropicApiKey', '');
    if (!apiKey) {
        addMessage('Please configure your API key in settings first.', 'system');
        return;
    }
    
    addMessage(message, 'user');
    messageInput.value = '';
    
    conversationHistory.push({
        role: 'user',
        content: message
    });
    
    try {
        const response = await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 8096,
            system: buildSystemPrompt(),
            messages: conversationHistory
        }, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            }
        });
        
        const assistantMessage = response.data.content[0].text;
        addMessage(assistantMessage, 'assistant');
        
        conversationHistory.push({
            role: 'assistant',
            content: assistantMessage
        });
        
        // Save to journal if recording
        if (journalRecording) {
            saveToJournal(message, assistantMessage);
        }
        
    } catch (error) {
        console.error('Error:', error);
        addMessage(`Error: ${error.response?.data?.error?.message || error.message}`, 'system');
    }
}

function saveToJournal(userMessage, assistantMessage) {
    const journal = storage.get('journal', []);
    const timestamp = new Date().toISOString();
    
    journal.push({
        timestamp,
        companion: currentCompanion.name,
        user: userMessage,
        assistant: assistantMessage
    });
    
    storage.set('journal', journal);
}

function loadJournal() {
    const journal = storage.get('journal', []);
    journalContent.innerHTML = '';
    
    if (journal.length === 0) {
        journalContent.innerHTML = '<p style="color: #999; padding: 20px;">No journal entries yet. Start recording to save your conversations!</p>';
        return;
    }
    
    journal.reverse().forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'journal-entry';
        entryDiv.innerHTML = `
            <div class="journal-header">
                <strong>${entry.companion}</strong>
                <span>${new Date(entry.timestamp).toLocaleString()}</span>
            </div>
            <div class="journal-message"><strong>You:</strong> ${entry.user}</div>
            <div class="journal-message"><strong>${entry.companion}:</strong> ${entry.assistant}</div>
        `;
        journalContent.appendChild(entryDiv);
    });
}

function renderTodos() {
    todoList.innerHTML = '';
    const filteredTodos = showArchive ? todos : todos.filter(t => !t.archived);
    
    filteredTodos.forEach((todo, index) => {
        const todoItem = document.createElement('div');
        todoItem.className = `todo-item ${todo.completed ? 'completed' : ''} ${todo.archived ? 'archived' : ''}`;
        
        todoItem.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="window.toggleTodo(${index})">
            <span>${todo.text}</span>
            <div class="todo-actions">
                <button onclick="window.archiveTodo(${index})" title="${todo.archived ? 'Unarchive' : 'Archive'}">
                    ${todo.archived ? '📤' : '📦'}
                </button>
                <button onclick="window.deleteTodo(${index})" title="Delete">🗑️</button>
            </div>
        `;
        
        todoList.appendChild(todoItem);
    });
}

window.toggleTodo = function(index) {
    todos[index].completed = !todos[index].completed;
    storage.set('todos', todos);
    renderTodos();
};

window.archiveTodo = function(index) {
    todos[index].archived = !todos[index].archived;
    storage.set('todos', todos);
    renderTodos();
};

window.deleteTodo = function(index) {
    todos.splice(index, 1);
    storage.set('todos', todos);
    renderTodos();
};

// Event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    if (!settingsPanel.classList.contains('hidden')) {
        apiKeyInput.value = storage.get('anthropicApiKey', '');
    }
});

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
        storage.set('anthropicApiKey', apiKey);
        addMessage('API key saved successfully!', 'system');
        settingsPanel.classList.add('hidden');
    }
});

contextBtn.addEventListener('click', () => {
    contextPanel.classList.toggle('hidden');
    if (!contextPanel.classList.contains('hidden')) {
        contextContent.textContent = sessionContext || 'No session context yet.';
    }
});

closeContextBtn.addEventListener('click', () => {
    contextPanel.classList.add('hidden');
});

todoBtn.addEventListener('click', () => {
    todoPanel.classList.toggle('hidden');
    if (!todoPanel.classList.contains('hidden')) {
        renderTodos();
    }
});

closeTodoBtn.addEventListener('click', () => {
    todoPanel.classList.add('hidden');
});

addTodoBtn.addEventListener('click', () => {
    const text = newTodoInput.value.trim();
    if (text) {
        todos.push({ text, completed: false, archived: false });
        storage.set('todos', todos);
        newTodoInput.value = '';
        renderTodos();
    }
});

newTodoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        addTodoBtn.click();
    }
});

toggleArchiveBtn.addEventListener('click', () => {
    showArchive = !showArchive;
    toggleArchiveBtn.textContent = showArchive ? '📂' : '📦';
    renderTodos();
});

journalBtn.addEventListener('click', () => {
    journalPanel.classList.toggle('hidden');
    if (!journalPanel.classList.contains('hidden')) {
        loadJournal();
    }
});

closeJournalBtn.addEventListener('click', () => {
    journalPanel.classList.add('hidden');
});

journalToggleBtn.addEventListener('click', () => {
    journalRecording = !journalRecording;
    journalToggleBtn.classList.toggle('recording', journalRecording);
    journalToggleBtn.title = journalRecording ? 'Stop Journal Recording' : 'Start Journal Recording';
    const status = journalRecording ? 'started' : 'stopped';
    addMessage(`📓 Journal recording ${status}`, 'system');
});

if (promptsBtn) {
    promptsBtn.addEventListener('click', () => {
        if (promptSuggestions) {
            promptSuggestions.classList.toggle('hidden');
            promptsBtn.classList.toggle('active');
        }
    });
}

// Welcome panel
window.handleWelcomeContinue = function() {
    storage.set('hasSeenWelcome', true);
    welcomePanel.classList.add('hidden');
    
    // Show companion selection
    const welcomeContent = document.querySelector('.welcome-content');
    welcomeContent.innerHTML = `
        <h1>🎭 Choose Your Companion</h1>
        <p class="welcome-subtitle">Take the quiz or browse all companions</p>
        <div style="display: flex; gap: 20px; justify-content: center; margin-top: 30px;">
            <button onclick="window.startQuiz()" style="background: #4CAF50; color: #fff; border: none; padding: 15px 30px; border-radius: 10px; font-size: 18px; cursor: pointer;">
                📝 Take Quiz
            </button>
            <button onclick="window.browseCompanions()" style="background: #2196F3; color: #fff; border: none; padding: 15px 30px; border-radius: 10px; font-size: 18px; cursor: pointer;">
                🎭 Browse All
            </button>
        </div>
    `;
    welcomePanel.classList.remove('hidden');
};

function checkFirstLaunch() {
    const hasSeenWelcome = storage.get('hasSeenWelcome', false);
    if (!hasSeenWelcome) {
        welcomePanel.classList.remove('hidden');
    }
}

// Quiz system
const quizQuestions = [
    {
        question: "What brings you here today?",
        answers: [
            { text: "I need help solving a problem or debugging", companions: ['athena', 'sage', 'compass'] },
            { text: "I want to process emotions or relationships", companions: ['rowan', 'willow', 'echo'] },
            { text: "I'm working on creative projects", companions: ['muse', 'river', 'spark'] },
            { text: "I just want to journal casually", companions: ['sunny', 'tide', 'bloom'] }
        ]
    },
    {
        question: "What kind of support do you prefer?",
        answers: [
            { text: "Direct, analytical, problem-solving", companions: ['athena', 'bolt', 'compass'] },
            { text: "Gentle, nurturing, emotionally supportive", companions: ['rowan', 'willow', 'luna'] },
            { text: "Playful, creative, imaginative", companions: ['river', 'muse', 'spark'] },
            { text: "Casual and friendly", companions: ['sunny', 'bloom', 'tide'] }
        ]
    },
    {
        question: "What are you focusing on?",
        answers: [
            { text: "Technical work or learning", companions: ['athena', 'sage', 'bolt'] },
            { text: "Personal growth or healing", companions: ['phoenix', 'chrysalis', 'anchor'] },
            { text: "Creative expression", companions: ['muse', 'prism', 'river'] },
            { text: "Just life stuff", companions: ['sunny', 'tide', 'bloom'] }
        ]
    }
];

let quizAnswers = [];

window.startQuiz = function() {
    quizAnswers = [];
    showQuizQuestion(0);
};

function showQuizQuestion(questionIndex) {
    if (questionIndex >= quizQuestions.length) {
        showQuizResults();
        return;
    }
    
    const question = quizQuestions[questionIndex];
    const welcomeContent = document.querySelector('.welcome-content');
    
    welcomeContent.innerHTML = `
        <h1>Question ${questionIndex + 1} of ${quizQuestions.length}</h1>
        <h2 style="margin: 30px 0;">${question.question}</h2>
        <div style="display: flex; flex-direction: column; gap: 15px; max-width: 500px; margin: 0 auto;">
            ${question.answers.map((answer, i) => `
                <button onclick="window.answerQuiz(${questionIndex}, ${i})" 
                        style="background: #2a2a2a; color: #fff; border: 2px solid #444; padding: 20px; border-radius: 10px; font-size: 16px; cursor: pointer; text-align: left; transition: all 0.2s;"
                        onmouseover="this.style.borderColor='#d4a574'"
                        onmouseout="this.style.borderColor='#444'">
                    ${answer.text}
                </button>
            `).join('')}
        </div>
    `;
    
    welcomePanel.classList.remove('hidden');
}

window.answerQuiz = function(questionIndex, answerIndex) {
    const answer = quizQuestions[questionIndex].answers[answerIndex];
    quizAnswers.push(answer.companions);
    showQuizQuestion(questionIndex + 1);
};

function showQuizResults() {
    // Count companion mentions
    const companionCounts = {};
    quizAnswers.flat().forEach(id => {
        companionCounts[id] = (companionCounts[id] || 0) + 1;
    });
    
    // Get top 3 companions
    const topCompanions = Object.entries(companionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => allCompanions.find(c => c.id === id));
    
    const welcomeContent = document.querySelector('.welcome-content');
    welcomeContent.innerHTML = `
        <h1>✨ Your Recommended Companions</h1>
        <p class="welcome-subtitle">Based on your answers, these companions might be a great fit:</p>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 30px;">
            ${topCompanions.map(companion => `
                <div onclick="window.selectCompanionFromQuiz('${companion.id}')" 
                     style="background: #2a2a2a; padding: 20px; border-radius: 10px; cursor: pointer; text-align: center; border: 2px solid #444; transition: all 0.2s;"
                     onmouseover="this.style.borderColor='#d4a574'"
                     onmouseout="this.style.borderColor='#444'">
                    <div style="font-size: 48px; margin-bottom: 10px;">${companion.emoji}</div>
                    <h3 style="margin: 10px 0;">${companion.name}</h3>
                    <p style="color: #999; font-size: 14px;">${companion.archetype}</p>
                </div>
            `).join('')}
        </div>
        <div style="margin-top: 30px;">
            <button onclick="window.browseCompanions()" style="background: #555; color: #fff; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer;">
                Or browse all companions
            </button>
        </div>
    `;
}

window.selectCompanionFromQuiz = async function(companionId) {
    console.log('selectCompanionFromQuiz called with:', companionId);
    welcomePanel.classList.add('hidden');
    await switchToCompanion(companionId, true);
};

window.browseCompanions = function() {
    const welcomeContent = document.querySelector('.welcome-content');
    
    welcomeContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h1 style="margin: 0;">🎭 All Companions</h1>
            <button onclick="window.startQuiz()" style="background: #555; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px;">
                ← Take Quiz Instead
            </button>
        </div>
        <p class="welcome-subtitle">Choose the companion that resonates with you</p>
        <div id="companionGridWelcome" class="companion-grid"></div>
    `;
    
    const grid = document.getElementById('companionGridWelcome');
    
    allCompanions.forEach((companion) => {
        const card = document.createElement('div');
        card.className = 'companion-card';
        
        const focusAreas = companion.personality?.focusAreas || companion.personality?.focus || [];
        const description = Array.isArray(focusAreas) && focusAreas.length > 0
            ? focusAreas.slice(0, 2).join(', ')
            : companion.personality?.tone || '';
        
        card.innerHTML = `
            <div class="companion-emoji">${companion.emoji}</div>
            <div class="companion-name">${companion.name}</div>
            <div class="companion-archetype">${companion.archetype}</div>
            <div class="companion-description">${description}</div>
        `;
        
        card.addEventListener('click', async () => {
            welcomePanel.classList.add('hidden');
            await switchToCompanion(companion.id, true);
        });
        
        grid.appendChild(card);
    });
    
    welcomePanel.classList.remove('hidden');
};

companionBtn.addEventListener('click', () => {
    browseCompanions();
});

// Crisis resources by country
const crisisResources = {
    'US': {
        name: 'United States',
        resources: [
            { name: 'Suicide & Crisis Lifeline', contact: '988 (call or text)', url: 'https://988lifeline.org' },
            { name: 'Crisis Text Line', contact: 'Text HOME to 741741', url: 'https://www.crisistextline.org' },
            { name: 'Emergency', contact: '911', url: null }
        ]
    },
    'CA': {
        name: 'Canada',
        resources: [
            { name: 'Canada Suicide Prevention Service', contact: '1-833-456-4566 (call or text)', url: 'https://www.crisisservicescanada.ca' },
            { name: 'Kids Help Phone', contact: '1-800-668-6868 or text 686868', url: 'https://kidshelpphone.ca' },
            { name: 'Emergency', contact: '911', url: null }
        ]
    },
    'GB': {
        name: 'United Kingdom',
        resources: [
            { name: 'Samaritans', contact: '116 123', url: 'https://www.samaritans.org' },
            { name: 'Crisis Text Line UK', contact: 'Text SHOUT to 85258', url: 'https://giveusashout.org' },
            { name: 'Emergency', contact: '999 or 112', url: null }
        ]
    },
    'AU': {
        name: 'Australia',
        resources: [
            { name: 'Lifeline', contact: '13 11 14', url: 'https://www.lifeline.org.au' },
            { name: 'Beyond Blue', contact: '1300 22 4636', url: 'https://www.beyondblue.org.au' },
            { name: 'Emergency', contact: '000', url: null }
        ]
    },
    'NZ': {
        name: 'New Zealand',
        resources: [
            { name: 'Lifeline', contact: '0800 543 354', url: 'https://www.lifeline.org.nz' },
            { name: '1737 Need to Talk?', contact: '1737 (call or text)', url: 'https://1737.org.nz' },
            { name: 'Emergency', contact: '111', url: null }
        ]
    },
    'IE': {
        name: 'Ireland',
        resources: [
            { name: 'Samaritans', contact: '116 123', url: 'https://www.samaritans.org' },
            { name: 'Pieta House', contact: '1800 247 247', url: 'https://www.pieta.ie' },
            { name: 'Emergency', contact: '999 or 112', url: null }
        ]
    },
    'DE': {
        name: 'Germany',
        resources: [
            { name: 'Telefonseelsorge', contact: '0800 111 0 111 or 0800 111 0 222', url: 'https://www.telefonseelsorge.de' },
            { name: 'Emergency', contact: '112', url: null }
        ]
    },
    'FR': {
        name: 'France',
        resources: [
            { name: 'SOS Amitié', contact: '09 72 39 40 50', url: 'https://www.sos-amitie.com' },
            { name: 'Emergency', contact: '112', url: null }
        ]
    },
    'ES': {
        name: 'Spain',
        resources: [
            { name: 'Teléfono de la Esperanza', contact: '717 003 717', url: 'https://www.telefonodelaesperanza.org' },
            { name: 'Emergency', contact: '112', url: null }
        ]
    },
    'IT': {
        name: 'Italy',
        resources: [
            { name: 'Telefono Amico', contact: '02 2327 2327', url: 'https://www.telefonoamico.it' },
            { name: 'Emergency', contact: '112', url: null }
        ]
    },
    'NL': {
        name: 'Netherlands',
        resources: [
            { name: '113 Suicide Prevention', contact: '0800 0113', url: 'https://www.113.nl' },
            { name: 'Emergency', contact: '112', url: null }
        ]
    },
    'SE': {
        name: 'Sweden',
        resources: [
            { name: 'Mind Självmordslinjen', contact: '90101', url: 'https://mind.se' },
            { name: 'Emergency', contact: '112', url: null }
        ]
    },
    'IN': {
        name: 'India',
        resources: [
            { name: 'AASRA', contact: '91-9820466726', url: 'http://www.aasra.info' },
            { name: 'Vandrevala Foundation', contact: '1860 2662 345', url: 'https://www.vandrevalafoundation.com' },
            { name: 'Emergency', contact: '112', url: null }
        ]
    },
    'JP': {
        name: 'Japan',
        resources: [
            { name: 'TELL Lifeline', contact: '03-5774-0992', url: 'https://telljp.com' },
            { name: 'Emergency', contact: '110 or 119', url: null }
        ]
    },
    'BR': {
        name: 'Brazil',
        resources: [
            { name: 'CVV', contact: '188', url: 'https://www.cvv.org.br' },
            { name: 'Emergency', contact: '190 or 192', url: null }
        ]
    },
    'MX': {
        name: 'Mexico',
        resources: [
            { name: 'Línea de la Vida', contact: '800 911 2000', url: null },
            { name: 'Emergency', contact: '911', url: null }
        ]
    },
    'ZA': {
        name: 'South Africa',
        resources: [
            { name: 'SADAG', contact: '0800 567 567', url: 'https://www.sadag.org' },
            { name: 'Lifeline', contact: '0861 322 322', url: null },
            { name: 'Emergency', contact: '10111', url: null }
        ]
    }
};

window.showLocalCrisisResources = async function() {
    try {
        // Try to detect country using a free geolocation API
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        const countryCode = data.country_code;
        
        const resources = crisisResources[countryCode] || crisisResources['US'];
        
        const resourcesHTML = resources.resources.map(r => {
            const link = r.url ? `<a href="${r.url}" target="_blank" style="color: #d4a574;">${r.name}</a>` : r.name;
            return `<li><strong>${link}:</strong> ${r.contact}</li>`;
        }).join('');
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';
        modal.innerHTML = `
            <div style="background: #2a2a2a; padding: 30px; border-radius: 15px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto;">
                <h2 style="color: #fff; margin-top: 0;">🌍 Crisis Resources - ${resources.name}</h2>
                <p style="color: #ccc;">If you're in crisis, please reach out:</p>
                <ul style="color: #ccc; line-height: 2;">
                    ${resourcesHTML}
                </ul>
                <p style="color: #999; font-size: 14px; margin-top: 20px;">
                    💡 For more international resources, visit 
                    <a href="https://findahelpline.com" target="_blank" style="color: #d4a574;">findahelpline.com</a>
                </p>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 20px; width: 100%;">
                    Close
                </button>
            </div>
        `;
        document.body.appendChild(modal);
        
    } catch (error) {
        console.error('Error detecting location:', error);
        // Fallback to US resources
        alert('Unable to detect your location. Showing US resources.\n\n988 - Suicide & Crisis Lifeline\nText HOME to 741741 - Crisis Text Line\n\nFor international resources, visit findahelpline.com');
    }
};

// Initialize
checkFirstLaunch();
loadCompanions();
