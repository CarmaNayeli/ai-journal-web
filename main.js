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
const apiKeyInput = document.getElementById('apiKeyInput');
const saveSettingsBtn = document.getElementById('saveSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const elevenLabsKeyInput = document.getElementById('elevenLabsKeyInput');
const voiceBtn = document.getElementById('voiceBtn');
const micBtn = document.getElementById('micBtn');
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
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const attachedImagesDiv = document.getElementById('attachedImages');

let conversationHistory = [];
let sessionContext = '';
let todos = storage.get('todos', []);

// Voice state
let voiceEnabled = storage.get('voiceEnabled', false);
let voiceConfigs = {};
let currentAudio = null;

async function loadVoiceConfigs() {
    try {
        const res = await fetch('/companions/voices.json');
        voiceConfigs = await res.json();
    } catch (e) {
        voiceConfigs = {};
    }
}
loadVoiceConfigs();

function stripMarkdown(text) {
    return text
        .replace(/\*\*(.+?)\*\*/gs, '$1')
        .replace(/\*(.+?)\*/gs, '$1')
        .replace(/#{1,6}\s+/g, '')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\btodos\b/gi, 'to-dos')
        .replace(/\btodo\b/gi, 'to-do')
        .trim();
}

async function speakText(text) {
    const elevenKey = storage.get('elevenLabsApiKey', '');
    if (!elevenKey || !voiceEnabled || !currentCompanion) return;
    const voiceConfig = voiceConfigs[currentCompanion.id];
    if (!voiceConfig?.voiceId) return;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }

    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.voiceId}/stream`, {
            method: 'POST',
            headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: stripMarkdown(text),
                model_id: 'eleven_turbo_v2_5',
                voice_settings: {
                    stability: voiceConfig.stability ?? 0.5,
                    similarity_boost: 0.75,
                    style: voiceConfig.style ?? 0.0,
                    speed: voiceConfig.speed ?? 1.0
                }
            })
        });
        if (!response.ok) return;

        const mediaSource = new MediaSource();
        const audio = new Audio();
        audio.src = URL.createObjectURL(mediaSource);
        currentAudio = audio;

        await new Promise(resolve => mediaSource.addEventListener('sourceopen', resolve, { once: true }));
        const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
        const reader = response.body.getReader();

        audio.play();

        const waitForBuffer = () => new Promise(resolve => {
            if (!sourceBuffer.updating) { resolve(); return; }
            sourceBuffer.addEventListener('updateend', resolve, { once: true });
        });

        while (true) {
            const { done, value } = await reader.read();
            await waitForBuffer();
            if (done) { mediaSource.endOfStream(); break; }
            sourceBuffer.appendBuffer(value);
        }

        audio.onended = () => { URL.revokeObjectURL(audio.src); currentAudio = null; };
    } catch (e) {
        console.error('ElevenLabs TTS error:', e);
    }
}

// Migrate legacy flat contextNotes → notes_shared
(function migrateContextNotes() {
    const legacy = storage.get('contextNotes', null);
    if (legacy !== null) {
        const existing = storage.get('notes_shared', '');
        storage.set('notes_shared', existing ? `${existing}\n${legacy}` : legacy);
        storage.set('contextNotes', null);
    }
})();
let showArchive = false;
let journalRecording = false;
let currentCompanion = null;
let allCompanions = [];
let attachedImages = [];

// Load companions from JSON files
async function loadCompanions() {
    try {
        const companionFiles = [
            'anchor', 'athena', 'bloom', 'bolt', 'chrysalis', 'clover',
            'compass', 'echo', 'grove', 'jest', 'keeper', 'luna',
            'muse', 'phoenix', 'prism', 'river', 'rowan', 'seren',
            'spark', 'still', 'sunny', 'sylvan', 'tide', 'veil',
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

📋 **View Context** - Click 📋 to manage your context notes. Notes come in two kinds: **Shared Notes** are visible to all your companions (great for your name, preferences, and ongoing projects), and **Companion Notes** are private to each companion (so our conversations and relationship stay our own). I'll save notes automatically as we talk — you can also edit them directly anytime.

🔇 **Voice** - Click 🔇 to enable companion voices (requires a free ElevenLabs API key — add it in ⚙️ Settings). Click 🎤 to speak your messages instead of typing\* .

🎭 **Switch Companions** - Click 🎭 anytime to choose a different companion if you need a different kind of support. Each companion remembers things relevant to their own space with you, while still knowing the basics about who you are.

\*Voice input requires Chrome or Edge — it won't appear on other browsers.

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
    const blocks = [];
    
    // Block 1: Companion personality
    const companionPrompt = currentCompanion?.personality?.systemPrompt || 
        `You are a supportive journaling companion. Help the user reflect on their thoughts and feelings through gentle questions and active listening.`;
    
    blocks.push({
        type: 'text',
        text: companionPrompt,
        cache_control: { type: 'ephemeral' }
    });
    
    // Block 2: Tool usage guidelines
    blocks.push({
        type: 'text',
        text: `\n\nTool Usage Guidelines:
- Use the save_note tool regularly to remember important details about the user
- Use scope="shared" for identity info all companions should know (name, preferences, links, major projects)
- Use scope="companion" (default) for notes specific to your domain, relationship, and conversations with the user
- Save notes when you learn something new that would be helpful to remember in future conversations
- Use read_companion_notes only when the user explicitly asks you to look at another companion's notes — it will prompt the user for permission first
- Use todos to help the user track tasks and action items
- Use web search and URL reading when the user needs current information or references external content
- IMPORTANT: When managing todos, you can call multiple tools in the same response. For example, to mark a todo complete: first call list_todos to get the ID, then immediately call update_todo with that ID and completed=true. Don't wait for user confirmation between tool calls.`
    });
    
    // Block 3: Shared notes (visible to all companions)
    const sharedNotes = storage.get('notes_shared', '');
    const companionNotes = storage.get(`notes_${currentCompanion?.id || 'unknown'}`, '');
    if (sharedNotes || companionNotes) {
        let notesText = '';
        if (sharedNotes) notesText += `\n\nShared Notes (known by all companions):\n${sharedNotes}`;
        if (companionNotes) notesText += `\n\nYour Notes (specific to you as ${currentCompanion?.name || 'this companion'}):\n${companionNotes}`;

        // Cross-companion awareness: list other companions that have notes, without exposing content
        const companions = allCompanions || [];
        const othersWithNotes = companions
            .filter(c => c.id !== currentCompanion?.id && storage.get(`notes_${c.id}`, ''))
            .map(c => c.name);
        if (othersWithNotes.length > 0) {
            notesText += `\n\n(Note: ${othersWithNotes.join(', ')} also ${othersWithNotes.length === 1 ? 'has' : 'have'} companion-specific notes you don't have direct access to.)`;
        }

        blocks.push({
            type: 'text',
            text: notesText,
            cache_control: { type: 'ephemeral' }
        });
    }
    
    return blocks;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message && attachedImages.length === 0) return;
    
    const apiKey = storage.get('anthropicApiKey', '');
    if (!apiKey) {
        addMessage('Please configure your API key in settings first.', 'system');
        return;
    }
    
    // Build message content with images
    let messageContent = [];
    
    // Add images first
    if (attachedImages.length > 0) {
        for (const img of attachedImages) {
            messageContent.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: img.mimeType,
                    data: img.data
                }
            });
        }
    }
    
    // Add text
    if (message) {
        messageContent.push({
            type: 'text',
            text: message
        });
    }
    
    // Display user message
    if (attachedImages.length > 0) {
        addMessage(`${message}\n[${attachedImages.length} image(s) attached]`, 'user');
    } else {
        addMessage(message, 'user');
    }
    
    messageInput.value = '';
    clearAttachedImages();
    
    conversationHistory.push({
        role: 'user',
        content: messageContent.length === 1 ? messageContent[0].text || messageContent[0] : messageContent
    });
    
    // Show typing indicator
    let typingIndicator = addMessage('...', 'assistant');
    typingIndicator.classList.add('typing-indicator');
    
    try {
        // Define tools for the companion
        const tools = [
            {
                name: 'save_note',
                description: 'Save a note that will persist across conversations. Use scope="shared" for identity info, preferences, or facts all companions should know (e.g. name, links, ongoing projects). Use scope="companion" (default) for notes specific to your relationship and domain with this user.',
                input_schema: {
                    type: 'object',
                    properties: {
                        note: {
                            type: 'string',
                            description: 'The note to save'
                        },
                        scope: {
                            type: 'string',
                            enum: ['shared', 'companion'],
                            description: 'Where to save the note. "shared" = visible to all companions. "companion" = only visible to you (default).'
                        }
                    },
                    required: ['note']
                }
            },
            {
                name: 'read_companion_notes',
                description: 'Read another companion\'s private notes, with user permission. Only use this when the user explicitly asks you to look at what another companion knows or has recorded. The user will be prompted to approve access.',
                input_schema: {
                    type: 'object',
                    properties: {
                        companion_id: {
                            type: 'string',
                            description: 'The ID of the companion whose notes you want to read (e.g. "muse", "river", "keeper")'
                        }
                    },
                    required: ['companion_id']
                }
            },
            {
                name: 'search_web',
                description: 'Search the web for information using DuckDuckGo. Use this when the user asks about current events, needs factual information, wants to look something up, or references something you don\'t have knowledge about. Returns search results with titles, snippets, and URLs.',
                input_schema: {
                    type: 'object',
                    properties: {
                        query: {
                            type: 'string',
                            description: 'The search query to look up on the web'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'read_url',
                description: 'Fetch and read the content from a URL. This tool automatically handles both static and JavaScript-heavy sites - it will try a simple fetch first, and if it detects JavaScript bundles or minimal content, it will automatically retry with JS rendering (using Jina Reader). You only need to call this tool once per URL - the retry happens automatically within the same tool execution. Works with all types of sites including SPAs, React apps, Squarespace, Next.js, etc.',
                input_schema: {
                    type: 'object',
                    properties: {
                        url: {
                            type: 'string',
                            description: 'The URL to fetch and read'
                        }
                    },
                    required: ['url']
                }
            },
            {
                name: 'add_todo',
                description: 'Add a new todo item to the user\'s todo list.',
                input_schema: {
                    type: 'object',
                    properties: {
                        text: {
                            type: 'string',
                            description: 'The todo item text'
                        },
                        description: {
                            type: 'string',
                            description: 'Optional description or additional details for the todo item'
                        },
                        link: {
                            type: 'string',
                            description: 'Optional URL link related to the todo item'
                        }
                    },
                    required: ['text']
                }
            },
            {
                name: 'remove_todo',
                description: 'Remove a todo item from the user\'s todo list by its ID.',
                input_schema: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'The ID of the todo item to remove'
                        }
                    },
                    required: ['id']
                }
            },
            {
                name: 'update_todo',
                description: 'Update an existing todo item. Use this to mark todos as complete (completed=true), archive them (archived=true), or change the text, description, or link. NEVER use remove_todo to archive - always use archived=true instead. You MUST call this tool to actually update a todo - just finding it with list_todos is not enough.',
                input_schema: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'The ID of the todo item to update (get this from list_todos)'
                        },
                        text: {
                            type: 'string',
                            description: 'The new todo item text'
                        },
                        description: {
                            type: 'string',
                            description: 'New description or additional details for the todo item'
                        },
                        link: {
                            type: 'string',
                            description: 'New URL link related to the todo item'
                        },
                        completed: {
                            type: 'boolean',
                            description: 'Set to true to mark the todo as complete, false to mark as incomplete'
                        },
                        archived: {
                            type: 'boolean',
                            description: 'Set to true to archive the todo, false to unarchive it. Use this instead of deleting when the user wants to archive.'
                        }
                    },
                    required: ['id']
                }
            },
            {
                name: 'list_todos',
                description: 'Get all todo items from the user\'s todo list. By default only shows active (incomplete) todos. Set include_archived to true to see completed todos as well.',
                input_schema: {
                    type: 'object',
                    properties: {
                        include_archived: {
                            type: 'boolean',
                            description: 'If true, includes completed/archived todos in the list. Default is false.'
                        }
                    },
                    required: []
                }
            },
        ];
        
        // Use proxy endpoint to avoid CORS issues
        let response = await axios.post('/api/chat', {
            apiKey: apiKey,
            system: buildSystemPrompt(),
            messages: conversationHistory,
            tools: tools
        });
        
        // Handle tool use loop - keep calling Claude until it stops using tools
        while (response.data.stop_reason === 'tool_use') {
            const assistantContent = response.data.content;
            
            // Add assistant message to history
            conversationHistory.push({
                role: 'assistant',
                content: assistantContent
            });
            
            // Show any text the assistant said before using tools
            const textBlocks = assistantContent.filter(b => b.type === 'text');
            if (textBlocks.length > 0) {
                typingIndicator.remove();
                const preToolText = textBlocks.map(b => b.text).join('\n');
                addMessage(preToolText, 'assistant');
                speakText(preToolText);
                typingIndicator = addMessage('...', 'assistant');
                typingIndicator.classList.add('typing-indicator');
            }
            
            // Process all tool uses
            const toolResults = [];
            const toolUses = assistantContent.filter(block => block.type === 'tool_use');
            console.log('Tool use loop - processing', toolUses.length, 'tools');
            
            for (const toolUse of toolUses) {
                console.log('Processing tool:', toolUse.name, 'with ID:', toolUse.id);
                if (toolUse.name === 'read_companion_notes') {
                    const targetId = toolUse.input.companion_id?.toLowerCase();
                    const targetCompanion = allCompanions.find(c => c.id === targetId);
                    const targetName = targetCompanion?.name || targetId;
                    const permitted = confirm(`${currentCompanion?.name} wants to read ${targetName}'s private notes. Allow?`);
                    if (permitted) {
                        const notes = storage.get(`notes_${targetId}`, '');
                        addMessage(`🔓 Access granted: ${currentCompanion?.name} can see ${targetName}'s notes.`, 'system');
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: notes
                                ? `${targetName}'s notes:\n${notes}`
                                : `${targetName} has no companion-specific notes saved yet.`
                        });
                    } else {
                        addMessage(`🔒 Access denied: ${currentCompanion?.name} cannot see ${targetName}'s notes.`, 'system');
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `User did not grant permission to read ${targetName}'s notes.`
                        });
                    }

                } else if (toolUse.name === 'save_note') {
                    const note = toolUse.input.note;
                    const scope = toolUse.input.scope || 'companion';
                    const storageKey = scope === 'shared' ? 'notes_shared' : `notes_${currentCompanion?.id || 'unknown'}`;
                    const currentNotes = storage.get(storageKey, '');
                    const timestamp = new Date().toLocaleString();
                    const newNote = `[${timestamp}] ${note}`;
                    const updatedNotes = currentNotes ? `${currentNotes}\n${newNote}` : newNote;
                    storage.set(storageKey, updatedNotes);
                    const scopeLabel = scope === 'shared' ? 'shared context' : 'your notes';
                    addMessage(`📝 Note saved to ${scopeLabel}: ${note}`, 'system');
                    
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: 'Note saved successfully.'
                    });
                    
                } else if (toolUse.name === 'search_web') {
                    const query = toolUse.input.query;
                    addMessage(`🔍 Searching web for: ${query}...`, 'system');
                    
                    try {
                        // Use DuckDuckGo API
                        const searchResponse = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
                        const searchData = await searchResponse.json();
                        
                        let results = '';
                        if (searchData.AbstractText) {
                            results += `Summary: ${searchData.AbstractText}\n\n`;
                        }
                        if (searchData.RelatedTopics && searchData.RelatedTopics.length > 0) {
                            results += 'Related topics:\n';
                            searchData.RelatedTopics.slice(0, 5).forEach((topic, i) => {
                                if (topic.Text) {
                                    results += `${i + 1}. ${topic.Text}\n`;
                                    if (topic.FirstURL) results += `   ${topic.FirstURL}\n`;
                                }
                            });
                        }
                        
                        if (!results) {
                            results = 'No results found. Try a different search query.';
                        }
                        
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: results
                        });
                    } catch (error) {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `Error searching web: ${error.message}`
                        });
                    }
                    
                } else if (toolUse.name === 'read_url') {
                    const url = toolUse.input.url;
                    addMessage(`📄 Fetching content from: ${url}...`, 'system');
                    
                    try {
                        // Try simple fetch first
                        let proxyUrl = `/api/fetch-url?url=${encodeURIComponent(url)}`;
                        let urlResponse = await fetch(proxyUrl);
                        let urlData = await urlResponse.json();
                        
                        if (urlData.error) {
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolUse.id,
                                content: `Error fetching URL: ${urlData.error}`
                            });
                        } else if (urlData.content) {
                            // Strip HTML tags for cleaner text
                            const cleanText = urlData.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                            
                            // Check if content is mostly JavaScript (heuristic)
                            const jsIndicators = ['function\\(', 'var ', 'const ', 'let ', '=>', 'window\\.', 'document\\.'];
                            const jsCount = jsIndicators.reduce((count, indicator) => 
                                count + (cleanText.match(new RegExp(indicator, 'g')) || []).length, 0);
                            const isJsHeavy = jsCount > 20 || cleanText.includes('__NEXT_DATA__') || cleanText.includes('webpack') || cleanText.includes('squarespace');
                            
                            // Trigger retry if JS-heavy OR if content is mostly code (high ratio of JS indicators to total length)
                            const jsRatio = cleanText.length > 0 ? jsCount / (cleanText.length / 100) : 0;
                            if (isJsHeavy || jsRatio > 0.5) {
                                // Retry with JS rendering
                                addMessage(`🔄 Detected JS-heavy site, retrying with rendering...`, 'system');
                                proxyUrl = `/api/fetch-url?url=${encodeURIComponent(url)}&js=true`;
                                urlResponse = await fetch(proxyUrl);
                                urlData = await urlResponse.json();
                                
                                if (urlData.content) {
                                    const renderedText = urlData.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                                    const preview = renderedText.substring(0, 3000) + (renderedText.length > 3000 ? '...' : '');
                                    toolResults.push({
                                        type: 'tool_result',
                                        tool_use_id: toolUse.id,
                                        content: preview || 'URL fetched but no content found.'
                                    });
                                } else {
                                    toolResults.push({
                                        type: 'tool_result',
                                        tool_use_id: toolUse.id,
                                        content: 'Unable to render JavaScript content.'
                                    });
                                }
                            } else {
                                // Use the simple fetch result
                                const preview = cleanText.substring(0, 3000) + (cleanText.length > 3000 ? '...' : '');
                                toolResults.push({
                                    type: 'tool_result',
                                    tool_use_id: toolUse.id,
                                    content: preview || 'URL fetched but no content found.'
                                });
                            }
                        } else {
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolUse.id,
                                content: 'Unable to fetch URL content.'
                            });
                        }
                    } catch (error) {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `Error fetching URL: ${error.message}. The URL may be blocked or inaccessible.`
                        });
                    }
                } else if (toolUse.name === 'add_todo') {
                    const { text, description, link } = toolUse.input;
                    const todo = {
                        id: Date.now().toString(),
                        text,
                        description: description || '',
                        link: link || '',
                        completed: false,
                        createdAt: new Date().toISOString()
                    };
                    
                    todos = storage.get('todos', []);
                    todos.push(todo);
                    storage.set('todos', todos);
                    
                    // Refresh todo panel if open
                    if (todoPanel && !todoPanel.classList.contains('hidden')) {
                        renderTodos();
                    }
                    
                    addMessage(`✅ Added todo: "${text}"`, 'system');
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: `Todo added successfully: "${text}"`
                    });
                    
                } else if (toolUse.name === 'remove_todo') {
                    const { id } = toolUse.input;
                    todos = storage.get('todos', []);
                    const index = todos.findIndex(t => t.id === id);
                    
                    if (index !== -1) {
                        const removed = todos.splice(index, 1)[0];
                        storage.set('todos', todos);
                        
                        // Refresh todo panel if open
                        if (todoPanel && !todoPanel.classList.contains('hidden')) {
                            renderTodos();
                        }
                        
                        addMessage(`🗑️ Removed todo: "${removed.text}"`, 'system');
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `Todo removed successfully: "${removed.text}"`
                        });
                    } else {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `Todo with ID ${id} not found`
                        });
                    }
                    
                } else if (toolUse.name === 'update_todo') {
                    try {
                        const { id, text, description, link, completed, archived } = toolUse.input;
                        console.log('update_todo called with:', { id, text, description, link, completed });
                        todos = storage.get('todos', []);
                        console.log('Current todos:', todos);
                        const todo = todos.find(t => t.id === id);
                        console.log('Found todo:', todo);
                        
                        if (todo) {
                            if (text !== undefined) todo.text = text;
                            if (description !== undefined) todo.description = description;
                            if (link !== undefined) todo.link = link;
                            if (completed !== undefined) {
                                console.log('Setting completed to:', completed);
                                todo.completed = completed;
                            }
                            if (archived !== undefined) {
                                todo.archived = archived;
                            }
                            
                            console.log('Updated todo:', todo);
                            storage.set('todos', todos);
                            console.log('Saved to storage');
                            
                            // Refresh todo panel if open
                            const panelHidden = todoPanel.classList.contains('hidden');
                            console.log('Todo panel hidden?', panelHidden);
                            if (todoPanel && !panelHidden) {
                                console.log('Calling renderTodos()');
                                renderTodos();
                            }
                            
                            addMessage(`✏️ Updated todo: "${todo.text}"`, 'system');
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolUse.id,
                                content: `Todo updated successfully: "${todo.text}"`
                            });
                        } else {
                            console.error('Todo not found with id:', id);
                            console.error('Available todo IDs:', todos.map(t => t.id));
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolUse.id,
                                content: `Todo with ID ${id} not found. Available IDs: ${todos.map(t => t.id).join(', ')}`
                            });
                        }
                    } catch (error) {
                        console.error('Error in update_todo:', error);
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `Error updating todo: ${error.message}`
                        });
                    }
                    
                } else if (toolUse.name === 'list_todos') {
                    try {
                        const includeArchived = toolUse.input.include_archived || false;
                        todos = storage.get('todos', []);
                        const filtered = includeArchived ? todos : todos.filter(t => !t.completed);
                        
                        if (filtered.length === 0) {
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolUse.id,
                                content: includeArchived ? 'No todos found.' : 'No active todos. All caught up!'
                            });
                        } else {
                            const todoList = filtered.map(t => 
                                `- [${t.completed ? 'x' : ' '}] ${t.text} (ID: ${t.id})${t.description ? ` - ${t.description}` : ''}${t.link ? ` - ${t.link}` : ''}`
                            ).join('\n');
                            
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolUse.id,
                                content: `Todo list (${filtered.length} items):\n${todoList}`
                            });
                        }
                    } catch (error) {
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `Error listing todos: ${error.message}`
                        });
                    }
                    
                } else {
                    // Unknown tool - still need to provide a result
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: `Unknown tool: ${toolUse.name}`
                    });
                }
            }
            
            // Verify we have a result for every tool use - if not, add error results
            if (toolResults.length !== toolUses.length) {
                console.error('Mismatch: tool uses vs tool results', { toolUses: toolUses.length, toolResults: toolResults.length });
                // Add error results for any missing tool results
                toolUses.forEach(toolUse => {
                    const hasResult = toolResults.some(r => r.tool_use_id === toolUse.id);
                    if (!hasResult) {
                        console.error('Missing result for tool:', toolUse.name, toolUse.id);
                        toolResults.push({
                            type: 'tool_result',
                            tool_use_id: toolUse.id,
                            content: `Error: Tool execution failed for ${toolUse.name}`
                        });
                    }
                });
            }
            
            // Send tool results back to Claude and continue the loop
            conversationHistory.push({
                role: 'user',
                content: toolResults
            });
            
            // Make another API call with tool results
            response = await axios.post('/api/chat', {
                apiKey: apiKey,
                system: buildSystemPrompt(),
                messages: conversationHistory,
                tools: tools
            });
        }
        
        // Remove typing indicator
        typingIndicator.remove();
        
        // Extract final text response (after all tool uses are done)
        const finalContent = response.data.content;
        const finalText = finalContent.filter(b => b.type === 'text').map(b => b.text).join('\n');
        
        if (finalText) {
            addMessage(finalText, 'assistant');
            speakText(finalText);
        }
        
        conversationHistory.push({
            role: 'assistant',
            content: finalContent
        });
        
        // Save to journal if recording
        if (journalRecording && finalText) {
            saveToJournal(message, finalText);
        }
        
    } catch (error) {
        console.error('Error:', error);
        typingIndicator.remove();
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
    
    filteredTodos.forEach((todo) => {
        const todoItem = document.createElement('div');
        todoItem.className = `todo-item ${todo.completed ? 'completed' : ''} ${todo.archived ? 'archived' : ''}`;
        todoItem.dataset.todoId = todo.id;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = todo.completed;
        checkbox.className = 'todo-checkbox';
        
        const span = document.createElement('span');
        span.textContent = todo.text;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'todo-actions';
        
        const archiveBtn = document.createElement('button');
        archiveBtn.textContent = todo.archived ? '📤' : '📦';
        archiveBtn.title = todo.archived ? 'Unarchive' : 'Archive';
        archiveBtn.className = 'archive-btn';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete';
        deleteBtn.className = 'delete-btn';
        
        actionsDiv.appendChild(archiveBtn);
        actionsDiv.appendChild(deleteBtn);
        
        todoItem.appendChild(checkbox);
        todoItem.appendChild(span);
        todoItem.appendChild(actionsDiv);
        
        todoList.appendChild(todoItem);
    });
}

window.toggleTodo = function(id) {
    console.log('toggleTodo called with id:', id);
    const todo = todos.find(t => t.id === id);
    console.log('Found todo:', todo);
    if (todo) {
        todo.completed = !todo.completed;
        storage.set('todos', todos);
        console.log('Todo updated, re-rendering');
        renderTodos();
    } else {
        console.error('Todo not found with id:', id);
    }
};

window.archiveTodo = function(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.archived = !todo.archived;
        storage.set('todos', todos);
        renderTodos();
    }
};

window.deleteTodo = function(id) {
    const index = todos.findIndex(t => t.id === id);
    if (index !== -1) {
        todos.splice(index, 1);
        storage.set('todos', todos);
        renderTodos();
    }
};

// Event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Handle paste events for images
messageInput.addEventListener('paste', async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64Data = event.target.result.split(',')[1];
                    attachedImages.push({
                        data: base64Data,
                        mimeType: file.type,
                        name: 'pasted-image.png'
                    });
                    renderAttachedImages();
                };
                reader.readAsDataURL(file);
            }
        }
    }
});

settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    if (!settingsPanel.classList.contains('hidden')) {
        apiKeyInput.value = storage.get('anthropicApiKey', '');
        elevenLabsKeyInput.value = storage.get('elevenLabsApiKey', '');
    }
});

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
});

saveSettingsBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
        storage.set('anthropicApiKey', apiKey);
    }
    const elevenKey = elevenLabsKeyInput.value.trim();
    storage.set('elevenLabsApiKey', elevenKey);
    addMessage('Settings saved!', 'system');
    settingsPanel.classList.add('hidden');
});

// Voice toggle
function updateVoiceBtn() {
    voiceBtn.textContent = voiceEnabled ? '🔊' : '🔇';
    voiceBtn.title = voiceEnabled ? 'Voice on — click to mute' : 'Voice off — click to enable';
}
updateVoiceBtn();

voiceBtn.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    storage.set('voiceEnabled', voiceEnabled);
    updateVoiceBtn();
    if (voiceEnabled) {
        startWakeWordListener();
        if (!storage.get('elevenLabsApiKey', '')) {
            addMessage(`🔊 Voice is on! To hear your companions speak, you'll need a free ElevenLabs API key:\n\n1. Go to **elevenlabs.io** and create a free account\n2. In your profile, go to **API Keys** and generate a key\n3. Paste it into ⚙️ **Settings** here\n\nVoice input (🎤) works right now without any key — that uses your browser's built-in speech recognition.\n\n\\*Voice input requires Chrome or Edge and won't appear on other browsers.`, 'system');
        }
    } else {
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
        stopWakeWordListener();
    }
});

// Mic / speech-to-text
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let wakeWordActive = false;
let isComposing = false;
let accumulatedText = '';

const WAKE_ALIASES = {
    'bloom':    ['blue', 'blew', 'blume'],
    'grove':    ['grow', 'groves'],
    'seren':    ['siren', 'serene'],
    'still':    ['steel', 'style'],
    'prism':    ['prison'],
    'jest':     ['just', 'chest'],
    'veil':     ['vale', 'bail', 'fail'],
};

function matchesWakeWord(transcript, name) {
    const candidates = [name, ...(WAKE_ALIASES[name] || [])];
    return candidates.some(n => transcript.includes(`hey ${n}`));
}

function startComposing() {
    isComposing = true;
    isListening = true;
    accumulatedText = '';
    micBtn.textContent = '🔴';
    micBtn.classList.add('listening');
    messageInput.value = '';
    messageInput.focus();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

function stopComposing() {
    isComposing = false;
    isListening = false;
    accumulatedText = '';
    micBtn.textContent = '🎤';
    micBtn.classList.remove('listening');
}

function startWakeWordListener() {
    if (!recognition) return;
    wakeWordActive = true;
    try { recognition.start(); } catch (e) {}
}

function stopWakeWordListener() {
    wakeWordActive = false;
    stopComposing();
    try { recognition.abort(); } catch (e) {}
}

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
        const name = (currentCompanion?.name || '').toLowerCase();
        const results = Array.from(e.results);
        const interim = results.map(r => r[0].transcript).join('');
        const finalChunk = results.filter(r => r.isFinal).map(r => r[0].transcript).join('').trim();
        const finalLower = finalChunk.toLowerCase();

        if (isComposing || isListening) {
            messageInput.value = accumulatedText + (accumulatedText ? ' ' : '') + interim;

            if (finalChunk) {
                if (finalLower.includes('send message')) {
                    accumulatedText = (accumulatedText + ' ' + finalChunk).replace(/send\s+message/gi, '').trim();
                    messageInput.value = accumulatedText;
                    stopComposing();
                    sendMessage();
                } else if (matchesWakeWord(finalLower, name)) {
                    stopComposing();
                } else {
                    accumulatedText = (accumulatedText + ' ' + finalChunk).trim();
                    messageInput.value = accumulatedText;
                }
            }
        } else if (wakeWordActive && finalChunk && matchesWakeWord(finalLower, name)) {
            startComposing();
        }
    };

    recognition.onend = () => {
        if (isComposing || isListening) {
            setTimeout(() => { try { recognition.start(); } catch (e) {} }, 100);
        } else if (wakeWordActive) {
            setTimeout(() => { try { recognition.start(); } catch (e) {} }, 150);
        }
    };

    recognition.onerror = (e) => {
        if (e.error === 'aborted') return;
        if (isComposing || isListening) {
            setTimeout(() => { try { recognition.start(); } catch (err) {} }, 300);
        } else if (wakeWordActive) {
            setTimeout(() => { try { recognition.start(); } catch (err) {} }, 500);
        }
    };

    if (voiceEnabled) startWakeWordListener();

} else {
    micBtn.style.display = 'none';
}

micBtn.addEventListener('click', () => {
    if (!recognition) return;
    if (isComposing || isListening) {
        stopComposing();
    } else {
        startComposing();
        if (!wakeWordActive) try { recognition.start(); } catch (e) {}
    }
});

// Export data
const exportDataBtn = document.getElementById('exportDataBtn');
const importDataBtn = document.getElementById('importDataBtn');
const importFileInput = document.getElementById('importFileInput');

exportDataBtn.addEventListener('click', () => {
    const companionNotes = {};
    (allCompanions || []).forEach(c => {
        const n = storage.get(`notes_${c.id}`, '');
        if (n) companionNotes[c.id] = n;
    });
    const data = {
        version: '2.0',
        exportDate: new Date().toISOString(),
        currentCompanion: storage.get('currentCompanion', 'rowan'),
        journal: storage.get('journal', []),
        todos: storage.get('todos', []),
        notes_shared: storage.get('notes_shared', ''),
        companionNotes,
        hasSeenWelcome: storage.get('hasSeenWelcome', false),
        hasSeenApiSetup: storage.get('hasSeenApiSetup', false)
        // Note: API key is NOT exported for security
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-journal-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addMessage('✅ Data exported successfully! (API key not included for security)', 'system');
});

importDataBtn.addEventListener('click', () => {
    importFileInput.click();
});

importFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.version || !data.exportDate) {
            throw new Error('Invalid backup file format');
        }
        
        // Confirm before importing
        if (!confirm('This will replace your current journal entries and todos. Continue?')) {
            importFileInput.value = '';
            return;
        }
        
        // Import data
        if (data.currentCompanion) storage.set('currentCompanion', data.currentCompanion);
        if (data.journal) storage.set('journal', data.journal);
        if (data.todos) storage.set('todos', data.todos);
        if (data.hasSeenWelcome !== undefined) storage.set('hasSeenWelcome', data.hasSeenWelcome);
        if (data.hasSeenApiSetup !== undefined) storage.set('hasSeenApiSetup', data.hasSeenApiSetup);
        // v2.0 format
        if (data.notes_shared !== undefined) storage.set('notes_shared', data.notes_shared);
        if (data.companionNotes) {
            Object.entries(data.companionNotes).forEach(([id, notes]) => storage.set(`notes_${id}`, notes));
        }
        // v1.0 legacy format — migrate to shared
        if (data.contextNotes && !data.notes_shared) {
            storage.set('notes_shared', data.contextNotes);
        }
        
        addMessage(`✅ Data imported successfully! ${data.journal?.length || 0} journal entries and ${data.todos?.length || 0} todos restored.`, 'system');
        
        // Reload the page to apply changes
        setTimeout(() => {
            location.reload();
        }, 2000);
        
    } catch (error) {
        console.error('Import error:', error);
        addMessage('❌ Error importing data: ' + error.message, 'system');
    }
    
    importFileInput.value = '';
});

const sharedNotesTextarea = document.getElementById('sharedNotesTextarea');
const companionNotesTextarea = document.getElementById('companionNotesTextarea');
const companionNotesLabel = document.getElementById('companionNotesLabel');
const saveContextBtn = document.getElementById('saveContextBtn');
const clearContextBtn = document.getElementById('clearContextBtn');

contextBtn.addEventListener('click', () => {
    contextPanel.classList.toggle('hidden');
    if (!contextPanel.classList.contains('hidden')) {
        sharedNotesTextarea.value = storage.get('notes_shared', '');
        companionNotesTextarea.value = storage.get(`notes_${currentCompanion?.id || 'unknown'}`, '');
        if (companionNotesLabel && currentCompanion) {
            companionNotesLabel.textContent = `${currentCompanion.name}'s Notes`;
        }
    }
});

closeContextBtn.addEventListener('click', () => {
    contextPanel.classList.add('hidden');
});

saveContextBtn.addEventListener('click', () => {
    storage.set('notes_shared', sharedNotesTextarea.value.trim());
    storage.set(`notes_${currentCompanion?.id || 'unknown'}`, companionNotesTextarea.value.trim());
    addMessage('✅ Context notes saved!', 'system');
});

clearContextBtn.addEventListener('click', () => {
    if (confirm('Clear all context notes (shared and companion-specific)?')) {
        storage.set('notes_shared', '');
        storage.set(`notes_${currentCompanion?.id || 'unknown'}`, '');
        sharedNotesTextarea.value = '';
        companionNotesTextarea.value = '';
        addMessage('🗑️ Context notes cleared.', 'system');
    }
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
        todos.push({ 
            id: Date.now().toString(),
            text, 
            completed: false, 
            archived: false,
            createdAt: new Date().toISOString()
        });
        storage.set('todos', todos);
        newTodoInput.value = '';
        renderTodos();
    }
});

// Event delegation for todo list - using both click and change events
console.log('Setting up todo list event listener on:', todoList);

// Handle checkbox changes
todoList.addEventListener('change', (e) => {
    console.log('Todo list change event!', e.target);
    if (e.target.classList.contains('todo-checkbox')) {
        const todoItem = e.target.closest('.todo-item');
        if (todoItem) {
            const todoId = todoItem.dataset.todoId;
            console.log('Checkbox changed for todo:', todoId);
            window.toggleTodo(todoId);
        }
    }
});

// Handle button clicks
todoList.addEventListener('click', (e) => {
    console.log('Todo list clicked!', e.target);
    const todoItem = e.target.closest('.todo-item');
    console.log('Closest todo-item:', todoItem);
    if (!todoItem) return;
    
    const todoId = todoItem.dataset.todoId;
    console.log('Todo ID:', todoId);
    
    if (e.target.classList.contains('archive-btn')) {
        console.log('Archive clicked for todo:', todoId);
        window.archiveTodo(todoId);
    } else if (e.target.classList.contains('delete-btn')) {
        console.log('Delete clicked for todo:', todoId);
        window.deleteTodo(todoId);
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

// Image attachment handlers
attachBtn.addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    
    for (const file of files) {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64Data = event.target.result.split(',')[1];
                attachedImages.push({
                    data: base64Data,
                    mimeType: file.type,
                    name: file.name
                });
                renderAttachedImages();
            };
            reader.readAsDataURL(file);
        }
    }
    
    imageInput.value = ''; // Reset input
});

function renderAttachedImages() {
    attachedImagesDiv.innerHTML = '';
    
    attachedImages.forEach((img, index) => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'attached-image';
        imgDiv.innerHTML = `
            <img src="data:${img.mimeType};base64,${img.data}" alt="${img.name}">
            <button class="remove-btn" onclick="window.removeAttachedImage(${index})">×</button>
        `;
        attachedImagesDiv.appendChild(imgDiv);
    });
}

window.removeAttachedImage = function(index) {
    attachedImages.splice(index, 1);
    renderAttachedImages();
};

function clearAttachedImages() {
    attachedImages = [];
    attachedImagesDiv.innerHTML = '';
}

// Welcome panel
window.handleWelcomeContinue = async function() {
    storage.set('hasSeenWelcome', true);
    welcomePanel.classList.add('hidden');
    
    // Check if user has a saved companion
    const savedCompanionId = storage.get('currentCompanion', null);
    if (savedCompanionId && allCompanions.length > 0) {
        // Load the last used companion with greeting
        await switchToCompanion(savedCompanionId, true);
        return;
    }
    
    // No saved companion - show companion selection
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
        <p style="color: #999; font-size: 13px; margin: -10px 0 16px; text-align: center;">
            Each companion keeps their own private notes about your conversations. Basic info like your name and preferences is shared across all of them, so you never have to re-introduce yourself.
        </p>
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
    let countryCode = 'US';
    let detectedCountry = '';
    
    try {
        // Try multiple geolocation APIs for better accuracy
        try {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            if (data.country_code) {
                countryCode = data.country_code;
                detectedCountry = data.country_name || '';
            }
        } catch (e) {
            // Fallback to timezone-based detection
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const tzToCountry = {
                'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
                'America/Toronto': 'CA', 'America/Vancouver': 'CA',
                'Europe/London': 'GB', 'Europe/Dublin': 'IE',
                'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
                'Pacific/Auckland': 'NZ',
                'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES',
                'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Stockholm': 'SE',
                'Asia/Kolkata': 'IN', 'Asia/Tokyo': 'JP',
                'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX',
                'Africa/Johannesburg': 'ZA'
            };
            countryCode = tzToCountry[timezone] || 'US';
        }
        
        const resources = crisisResources[countryCode] || crisisResources['US'];
        
        const resourcesHTML = resources.resources.map(r => {
            const link = r.url ? `<a href="${r.url}" target="_blank" style="color: #d4a574;">${r.name}</a>` : r.name;
            return `<li><strong>${link}:</strong> ${r.contact}</li>`;
        }).join('');
        
        // Create country selector dropdown
        const countryOptions = Object.entries(crisisResources)
            .sort((a, b) => a[1].name.localeCompare(b[1].name))
            .map(([code, data]) => `<option value="${code}" ${code === countryCode ? 'selected' : ''}>${data.name}</option>`)
            .join('');
        
        const modal = document.createElement('div');
        modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 20px;';
        modal.innerHTML = `
            <div style="background: #2a2a2a; padding: 30px; border-radius: 15px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto;">
                <h2 style="color: #fff; margin-top: 0;">🌍 Crisis Resources</h2>
                <div style="margin-bottom: 20px;">
                    <label style="color: #ccc; display: block; margin-bottom: 8px;">Select your country:</label>
                    <select id="countrySelect" style="width: 100%; padding: 10px; background: #1a1a1a; color: #fff; border: 1px solid #444; border-radius: 8px; font-size: 16px;">
                        ${countryOptions}
                    </select>
                </div>
                <div id="resourcesContent">
                    <p style="color: #ccc;">If you're in crisis, please reach out:</p>
                    <ul style="color: #ccc; line-height: 2;">
                        ${resourcesHTML}
                    </ul>
                </div>
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
        
        // Add change listener for country selector
        const select = modal.querySelector('#countrySelect');
        const contentDiv = modal.querySelector('#resourcesContent');
        select.addEventListener('change', (e) => {
            const selectedCountry = crisisResources[e.target.value];
            const newResourcesHTML = selectedCountry.resources.map(r => {
                const link = r.url ? `<a href="${r.url}" target="_blank" style="color: #d4a574;">${r.name}</a>` : r.name;
                return `<li><strong>${link}:</strong> ${r.contact}</li>`;
            }).join('');
            contentDiv.innerHTML = `
                <p style="color: #ccc;">If you're in crisis, please reach out:</p>
                <ul style="color: #ccc; line-height: 2;">
                    ${newResourcesHTML}
                </ul>
            `;
        });
        
    } catch (error) {
        console.error('Error showing crisis resources:', error);
        alert('Unable to load crisis resources. For international resources, visit findahelpline.com');
    }
};

// Initialize
checkFirstLaunch();
loadCompanions();
