# import os
# import shutil
# from pathlib import Path
# from typing import List, Optional, Dict, Any
# from dotenv import load_dotenv
# import json
# import uuid

# import uvicorn
# from fastapi import FastAPI, UploadFile, File, Query, Form, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from werkzeug.utils import secure_filename

# from llama_index.llms.openai import OpenAI
# from llama_index.embeddings.openai import OpenAIEmbedding
# from llama_index.core import Settings, VectorStoreIndex, SummaryIndex
# from llama_index.core.schema import Document
# from llama_parse import LlamaParse
# from llama_index.core.node_parser import SentenceSplitter
# from llama_index.core.tools import FunctionTool, QueryEngineTool
# from llama_index.core.vector_stores import MetadataFilters, FilterCondition
# from llama_index.core.agent import ReActAgentWorker, AgentRunner
# from llama_index.vector_stores.pinecone import PineconeVectorStore

# from pinecone import Pinecone
# from upstash_redis import Redis

import os
import shutil
from pathlib import Path
from typing import List, Optional, Dict
from dotenv import load_dotenv
import pickle
import json
import dill
import uuid
import random
import string
import uvicorn
from fastapi import FastAPI, UploadFile, File, Query, Depends, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from werkzeug.utils import secure_filename
# -------------------------------------------------------------
# LLM and Embedding Model Configuration
# -------------------------------------------------------------
from llama_index.llms.openai import OpenAI
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.core import Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

# -------------------------------------------------------------
# Llama Index and Related Modules
# -------------------------------------------------------------
from llama_index.core.schema import Document
from llama_parse import LlamaParse
from llama_index.core import VectorStoreIndex, SummaryIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.tools import FunctionTool, QueryEngineTool
from llama_index.core.vector_stores import MetadataFilters, FilterCondition, MetadataFilter
from llama_index.core.agent import ReActAgentWorker, AgentRunner
from llama_index.vector_stores.pinecone import PineconeVectorStore
# -------------------------------------------------------------
# Database and Cache Configuration
# -------------------------------------------------------------
from pinecone import Pinecone, ServerlessSpec
from upstash_redis import Redis

import nest_asyncio
nest_asyncio.apply()

load_dotenv()

# Configuration for Embedding Model and LLM
embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
llm = OpenAI(model="gpt-3.5-turbo", temperature=0)
Settings.llm = llm
Settings.embed_model = embed_model

# Pinecone Initialization
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
pinecone_index = pc.Index("quickstart")

# Redis Initialization
redis_client = Redis(url=os.getenv("UPSTASH_REDIS_URL"), token=os.getenv("UPSTASH_REDIS_TOKEN")) if os.getenv("UPSTASH_REDIS_URL") else None

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Helper Functions
async def save_chat(user_id: str, chat_id: str, query: str, response: str):
    chat_entry = json.dumps({"query": query, "response": response})
    redis_client.lpush(f"chat_history:{user_id}:{chat_id}", chat_entry)

async def get_chat_history(user_id: str, chat_id: str):
    history = redis_client.lrange(f"chat_history:{user_id}:{chat_id}", 0, -1)
    return [json.loads(entry) for entry in history] if history else []

def _load_data(file_path: str) -> List[Document]:
    print(file_path)
    parser = LlamaParse(result_type="markdown")
    documents = parser.load_data(file_path)
    print(documents)
    docs = []
    for doc in documents:
        docs.append(Document(text=doc.get_content(), metadata={"page_label": doc.metadata.get("page_label", "1")}))    
    return docs


def create_document_tools(user_id: str, chat_id: str, user_document_id: str, document_name: str):
    vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
    vector_index = VectorStoreIndex.from_vector_store(vector_store)
    
    # Vector Query Tool
    def vector_query(query: str) -> str:
        if not query.strip():
            return "Please provide a valid query"
            
        filters = MetadataFilters(
            filters=[
                MetadataFilter(key="user_id", value=str(user_id)),
                MetadataFilter(key="chat_id", value=str(chat_id)),
                MetadataFilter(key="user_document_id", value=str(user_document_id))
            ]
        )
        try:
            query_engine = vector_index.as_query_engine(
                similarity_top_k=5, 
                filters=filters,
                response_mode="compact"
            )
            response = query_engine.query(query)
            return str(response) if response else "No relevant information found"
        except Exception as e:
            return f"Error querying document: {str(e)}"
    
    vector_tool = FunctionTool.from_defaults(
        name=f"vector_{user_document_id}",
        description=f"Query content from {document_name}",
        fn=vector_query
    )
    
    # Summary Tool
    def summary_query(query: str = "Please provide a comprehensive summary of this document.") -> str:
        filters = MetadataFilters(
            filters=[
                MetadataFilter(key="user_id", value=str(user_id)),
                MetadataFilter(key="chat_id", value=str(chat_id)),
                MetadataFilter(key="user_document_id", value=str(user_document_id))
            ]
        )
        
        try:
            summary_query_engine = vector_index.as_query_engine(
                response_mode="tree_summarize",
                filters=filters,
                similarity_top_k=2
            )
            response = summary_query_engine.query(query)
            return str(response) if response else "Unable to generate summary"
        except Exception as e:
            return f"Error generating summary: {str(e)}"
    
    summary_tool = FunctionTool.from_defaults(
        name=f"summary_{user_document_id}",
        description=f"Generate a comprehensive summary of {document_name}",
        fn=summary_query
    )
    
    return vector_tool, summary_tool

def generate_chat_id():
    return str(uuid.uuid4())

def generate_temporary_user_id():
    return "guest_" + ''.join(random.choices(string.ascii_letters + string.digits, k=8))

# API Endpoints
@app.get("/start_chat/")
async def start_chat(user_id: str = None):
    if not user_id:
        user_id = generate_temporary_user_id()
    chat_id = redis_client.get(f"user:{user_id}:chat")
    if not chat_id:
        chat_id = generate_chat_id()
        redis_client.set(f"user:{user_id}:chat", chat_id)
    return {"user_id": user_id, "chat_id": chat_id}


@app.post("/upload/")
async def upload_files(
    files: List[UploadFile] = File(...),
    user_id: str = Form(...),
    chat_id: str = Form(...)
):
    for file in files:
        user_document_id = str(uuid.uuid4())
        filename = secure_filename(file.filename)
        file_path = os.path.join(UPLOAD_DIR, filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        documents = _load_data(file_path)
        nodes = []
        for doc in documents:
            doc.metadata.update({"user_id": user_id, "chat_id": chat_id, "user_document_id": user_document_id})
            nodes.extend(SentenceSplitter(chunk_size=1024).get_nodes_from_documents([doc]))
        
        
        
        for node in nodes:
            node.embedding = embed_model.get_text_embedding(node.get_content())
        
        vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
        vector_store.add(nodes)

        for i in nodes:
            print(i.metadata)
        metadata = {
        "filename": filename,
        "user_id": user_id,
        "chat_id": chat_id,
        "document_id": user_document_id,
        }
        redis_client.set(f"document:{user_document_id}:metadata", json.dumps(metadata))
        
        # redis_client.hset(
        #     f"document:{document_id}:metadata",
        #     {"filename", filename,
        #     "user_id", user_id,
        #     "chat_id", chat_id,
        #     "document_id", document_id}
        # )
        redis_client.sadd(f"user:{user_id}:chat:{chat_id}:documents", user_document_id)
    
    return {"message": "Files uploaded successfully"}

# Modify the query endpoint to configure agent properly
@app.get("/query/")
async def query_documents(
    query: str = Query(...),
    user_id: str = Query(...),
    chat_id: str = Query(...)
):
    document_ids = redis_client.smembers(f"user:{user_id}:chat:{chat_id}:documents")
    
    # Always start with base LLM response capability
    base_tools = [
        FunctionTool.from_defaults(
            name="general_llm",
            description="Useful for answering general questions not specific to uploaded documents",
            fn=lambda q: str(llm.complete(q))
        )
    ]

    # Add document tools if available
    doc_tools = []
    for doc_id in document_ids:
        metadata = redis_client.get(f"document:{doc_id}:metadata")
        if metadata:
            metadata = json.loads(metadata)
            vector_tool, summary_tool = create_document_tools(
                user_id, chat_id, doc_id, metadata.get("filename", "")
            )
            doc_tools.extend([vector_tool, summary_tool])

    # Create agent with proper configuration
    agent_worker = ReActAgentWorker.from_tools(
        tools=base_tools + doc_tools,
        llm=llm,
        max_iterations=15,  # Increased from default 10
        verbose=True,
        handle_parsing_errors=True  # Add error handling for tool parsing
    )
    agent = AgentRunner(agent_worker)
    
    try:
        response = agent.query(query)
        response_text = str(response)
    except Exception as e:
        response_text = f"Error processing query: {str(e)}"
    
    await save_chat(user_id, chat_id, query, response_text)
    return {"response": response_text}

@app.get("/chat-history/")
async def get_chat_history_endpoint(user_id: str = Query(...), chat_id: str = Query(...)):
    history = await get_chat_history(user_id, chat_id)
    return {"history": history}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)