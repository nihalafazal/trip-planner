document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const fabTrigger = document.getElementById('fab-trigger');
    const aiWidget = document.getElementById('ai-widget');
    const closeWidgetBtn = document.getElementById('close-widget');
    const navPlanBtn = document.getElementById('nav-plan-btn');
    const heroPlanBtn = document.getElementById('hero-plan-btn');
    
    // Form & Chat Elements
    const tripForm = document.getElementById('trip-form');
    const chatContainer = document.getElementById('chat-container');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatHistoryEl = document.getElementById('chat-history');
    const generateBtnText = document.querySelector('.btn-text');
    const generateBtn = document.getElementById('generate-btn');

    // Toggle Widget
    function toggleWidget() {
        aiWidget.classList.toggle('hidden');
    }

    fabTrigger.addEventListener('click', toggleWidget);
    closeWidgetBtn.addEventListener('click', () => aiWidget.classList.add('hidden'));
    navPlanBtn.addEventListener('click', (e) => { e.preventDefault(); aiWidget.classList.remove('hidden'); });
    heroPlanBtn.addEventListener('click', () => aiWidget.classList.remove('hidden'));

    // Destination Cards Integration
    const destinationCards = document.querySelectorAll('.destination-card');
    destinationCards.forEach(card => {
        card.addEventListener('click', () => {
            const dest = card.getAttribute('data-location');
            document.getElementById('destination').value = dest;
            aiWidget.classList.remove('hidden');
            
            // Auto-fill sensible default settings to allow instant planning!
            if (!document.getElementById('duration').value) document.getElementById('duration').value = '5';
            if (!document.getElementById('season').value) document.getElementById('season').value = 'Spring';
            if (!document.getElementById('travelers').value) document.getElementById('travelers').value = 'Couple';
            if (!document.getElementById('budget').value) document.getElementById('budget').value = 'Moderate (Standard)';
            if (!document.getElementById('interests').value) document.getElementById('interests').value = 'Sightseeing, Food, Culture';
            
            // Programmatically submit the form for instant response
            tripForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        });
    });

    // Chat Logic
    let conversationHistory = [];

    function appendMessage(role, text) {
        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble');
        
        if (role === 'user') {
            bubble.classList.add('user-bubble');
            bubble.textContent = text;
        } else {
            bubble.classList.add('ai-bubble');
            try {
                bubble.innerHTML = marked.parse ? marked.parse(text) : marked(text);
            } catch (e) {
                console.error("Markdown parse error:", e);
                bubble.textContent = text; // safe fallback
            }
        }
        
        chatHistoryEl.appendChild(bubble);
        chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
    }

    async function sendToChat(message, isInitial = false) {
        if (isInitial) {
            generateBtn.disabled = true;
            generateBtnText.textContent = "Generating...";
        } else {
            chatInput.disabled = true;
        }

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    history: conversationHistory
                })
            });

            if (!response.ok) {
                const data = await response.json();
                appendMessage('model', `**Error:** ${data.error}`);
                return;
            }

            if (isInitial) {
                chatForm.classList.remove('hidden');
            }

            // STREAMING LOGIC REPLACES WAITING!
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let aiMessageText = "";

            // Create a blank bubble that we will live-update
            const bubble = document.createElement('div');
            bubble.classList.add('chat-bubble', 'ai-bubble');
            chatHistoryEl.appendChild(bubble);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunkText = decoder.decode(value, { stream: true });
                aiMessageText += chunkText;
                
                // Live parse and update the bubble
                try {
                    bubble.innerHTML = marked.parse ? marked.parse(aiMessageText) : marked(aiMessageText);
                } catch(e) {
                    bubble.textContent = aiMessageText;
                }
                chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
            }

            // Update local history for next time
            conversationHistory.push({ role: 'user', parts: [message] });
            conversationHistory.push({ role: 'model', parts: [aiMessageText] });

        } catch (err) {
            appendMessage('model', `**Network Error:** Could not connect.`);
        } finally {
            if (isInitial) {
                generateBtn.disabled = false;
                generateBtnText.textContent = "Start Trip Chat";
            } else {
                chatInput.disabled = false;
                chatInput.focus();
            }
        }
    }

    // INITIAL FORM SUBMISSION
    tripForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const destination = document.getElementById('destination').value;
        const duration = document.getElementById('duration').value;
        const season = document.getElementById('season').value;
        const travelers = document.getElementById('travelers').value;
        const budget = document.getElementById('budget').value;
        const interests = document.getElementById('interests').value;

        const prompt = `I need you to plan a trip!
Destination: ${destination}
Duration: ${duration} days
Season: ${season}
Travelers: ${travelers}
Budget Level: ${budget}
Interests: ${interests}

Please generate my full itinerary now including daily breakdown, weather, and budget tips!`;

        // Switch UI from Form to Chat
        tripForm.style.display = 'none';
        chatContainer.classList.remove('hidden');

        appendMessage('user', `Hey, please plan a ${duration}-day trip to ${destination} for a ${budget} budget!`);
        sendToChat(prompt, true);
    });

    // FOLLOW-UP CHAT SUBMISSION
    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';
        appendMessage('user', text);
        sendToChat(text, false);
    });
});
