from flask import Flask, request, jsonify, render_template, Response
import google.generativeai as genai
import os
import json
import numpy as np
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure Gemini AI
api_key = os.environ.get("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

# Setup Gemini model
generation_config = {
  "temperature": 0.7,
  "top_p": 0.95,
  "top_k": 40,
  "max_output_tokens": 8192,
  "response_mime_type": "text/plain",
}

system_prompt = """You are VoyageAI, a highly enthusiastic, expert AI Smart Trip Planner.
Answer in Markdown format. Keep your tone vibrant, incredibly helpful, and engaging. Address the user directly.
Always provide detailed daily itineraries, cost breakdowns, weather expectations, and insider tips when asked to plan a trip.
For follow-up questions, act as a travel agent providing alternatives, tweaks, or new information to their current plan.
CRITICAL: You will be provided with SECRET KNOWLEDGE BASE contexts. If any fit the user's destination, you MUST include and emphasize these secrets in the itinerary."""

model = genai.GenerativeModel(
  model_name="gemini-2.5-flash",
  generation_config=generation_config,
  system_instruction=system_prompt
)

# ----------------- RAG SYSTEM -----------------
KNOWLEDGE_BASE = []
DOCUMENT_EMBEDDINGS = []

def init_rag_system():
    global KNOWLEDGE_BASE, DOCUMENT_EMBEDDINGS
    try:
        # Load local JSON dataset
        with open('travel_data.json', 'r') as f:
            data = json.load(f)
            KNOWLEDGE_BASE = [item['content'] for item in data]
        
        # Pre-compute embeddings for the knowledge base
        if KNOWLEDGE_BASE and api_key:
            response = genai.embed_content(
                model="models/text-embedding-004",
                content=KNOWLEDGE_BASE,
                task_type="retrieval_document"
            )
            DOCUMENT_EMBEDDINGS = np.array(response['embedding'])
            print(f"RAG System initialized with {len(KNOWLEDGE_BASE)} documents.")
    except Exception as e:
        print(f"Failed to initialize RAG: {e}")

init_rag_system()

def get_most_relevant_context(query: str) -> str:
    if not KNOWLEDGE_BASE or len(DOCUMENT_EMBEDDINGS) == 0:
        return ""
    
    try:
        # Embed the incoming query (destination string)
        query_response = genai.embed_content(
            model="models/text-embedding-004",
            content=query,
            task_type="retrieval_query"
        )
        query_embedding = np.array(query_response['embedding'])
        
        # Calculate cosine similarity
        norm_docs = np.linalg.norm(DOCUMENT_EMBEDDINGS, axis=1)
        norm_query = np.linalg.norm(query_embedding)
        
        if norm_query == 0 or np.any(norm_docs == 0):
             return ""
             
        similarities = np.dot(DOCUMENT_EMBEDDINGS, query_embedding) / (norm_docs * norm_query)
        
        # Get best match
        best_idx = np.argmax(similarities)
        if similarities[best_idx] > 0.4:  # Threshold
            return KNOWLEDGE_BASE[best_idx]
    except Exception as e:
        print(f"RAG Retrieval Error: {e}")
        
    return ""
# ----------------------------------------------

@app.route("/", methods=["GET"])
def index():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    history = data.get("history", [])
    message = data.get("message", "")
    
    if not message:
        return jsonify({"error": "Message is required."}), 400

    try:
        # RAG Augmentation: Only augment the first initial prompt (where history is empty)
        if len(history) == 0:
            relevant_context = get_most_relevant_context(message)
            if relevant_context:
                message = f"{message}\n\n[SECRET TRAVEL CONTEXT (DO NOT MENTION YOU RECEIVED THIS EXTRA CONTEXT STYLISTICALLY, JUST PRESENT IT AS YOUR EXPERT KNOWLEDGE): {relevant_context}]"

        # Start a chat session with the provided history
        chat_session = model.start_chat(history=history)
        response = chat_session.send_message(message, stream=True)
        
        def generate():
            try:
                for chunk in response:
                    if chunk.text:
                        yield chunk.text
            except Exception as stream_err:
                yield f"\n\n**Error Streaming:** {str(stream_err)}"

        return Response(generate(), mimetype='text/plain')
    except Exception as e:
        print(f"Error generating content: {e}")
        return jsonify({"error": f"Failed: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(debug=True)
