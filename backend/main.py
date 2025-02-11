import os
import shutil
from pathlib import Path
from typing import List, Optional, Dict
from dotenv import load_dotenv
import pickle
import json
import dill

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
from llama_index.core.vector_stores import MetadataFilters, FilterCondition
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

# embed_model = OpenAIEmbedding(model="text-embedding-ada-002")
# Here, we use a HuggingFace embedding model:
embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

# embed_model = OpenAIEmbedding(model="text-embedding-3-small")
llm = OpenAI(model="gpt-3.5-turbo", temperature=0)
Settings.llm = llm
Settings.embed_model = embed_model

# -------------------------------------------------------------
# Pinecone Initialization
# -------------------------------------------------------------
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
pc = Pinecone(api_key=PINECONE_API_KEY)
pinecone_index = pc.Index("quickstart")


# -------------------------------------------------------------
# Redis Initialization
# -------------------------------------------------------------
REDIS_URL = os.getenv("UPSTASH_REDIS_URL")
REDIS_TOKEN = os.getenv("UPSTASH_REDIS_TOKEN")
redis_client = Redis(url=REDIS_URL, token=REDIS_TOKEN) if REDIS_URL else None


# -------------------------------------------------------------
# Redis Initialization
# -------------------------------------------------------------
temp_cache: Dict[str, List[Dict[str, str]]] = {}

# -------------------------------------------------------------
# FastAPI Application Setup
# -------------------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# -------------------------------------------------------------
# Helper Functions for storing/retrieving Processing
# -------------------------------------------------------------
# def save_chat(user_id: Optional[str], chat_id: str, query: str, response: str):
#     chat_entry = {"query": query, "response": response}
#     if user_id and redis_client:
#         redis_client.lpush(f"chat_history:{user_id}:{chat_id}", json.dumps(chat_entry))
#     else:
#         if user_id not in temp_cache:
#             temp_cache.setdefault(user_id, {}).setdefault(chat_id, []).append(chat_entry)

# def get_chat_history(user_id: Optional[str], chat_id: str):
#     if user_id and redis_client:
#         return redis_client.lrange(f"chat_history:{user_id}:{chat_id}", 0, -1) or []
#     return temp_cache.get(user_id, {}).get(chat_id, [])
# 2. Save Chat Function Fix - Make it async
async def save_chat(user_id: Optional[str], chat_id: str, query: str, response: str):
    chat_entry = {"query": query, "response": response}
    if user_id and redis_client:
        await redis_client.lpush(f"chat_history:{user_id}:{chat_id}", json.dumps(chat_entry))
    else:
        if user_id not in temp_cache:
            temp_cache[user_id] = {}
        if chat_id not in temp_cache[user_id]:
            temp_cache[user_id][chat_id] = []
        temp_cache[user_id][chat_id].append(chat_entry)

# 3. Get Chat History Fix - Make it async and fix the return type
async def get_chat_history(user_id: Optional[str], chat_id: str):
    if user_id and redis_client:
        history = await redis_client.lrange(f"chat_history:{user_id}:{chat_id}", 0, -1)
        return [json.loads(entry) for entry in history] if history else []
    return temp_cache.get(user_id, {}).get(chat_id, [])
# -------------------------------------------------------------
# Helper Functions for Document Processing
# -------------------------------------------------------------
def _load_data(file_path: str) -> List[Document]:
    parser = LlamaParse(result_type="text")
    json_objs = parser.get_json_result(file_path)
    json_list = json_objs[0]["pages"]
    return [
        Document(text=item["text"], metadata={"page_label": str(item["page"])})
        for item in json_list
    ]

def get_doc_tools(file_path: str, name: str):
    documents = _load_data(file_path)
    splitter = SentenceSplitter(chunk_size=1024)
    nodes = splitter.get_nodes_from_documents(documents)
   
    vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
    vector_index = VectorStoreIndex(nodes=nodes, vector_store=vector_store)

    summary_index = SummaryIndex(nodes)
    
    def vector_query(query: str, page_numbers: Optional[List[int]] = None) -> str:
        page_numbers = page_numbers or []
        metadata_dicts = [{"key": "page_label", "value": p} for p in page_numbers]
        query_engine = vector_index.as_query_engine(
            similarity_top_k=3,
            filters=MetadataFilters.from_dicts(metadata_dicts, condition=FilterCondition.OR),
        )
        retrievals = query_engine.query(query)
        return retrievals
    
    vector_query_tool = FunctionTool.from_defaults(name=f"vector_tool_{name}", fn=vector_query)
    
    summary_query_engine = summary_index.as_query_engine(response_mode="tree_summarize", use_async=True)
    summary_tool = QueryEngineTool.from_defaults(
        name=f"summary_tool_{name}",
        query_engine=summary_query_engine,
        description=f"Useful for summarization questions related to {name}",
    )
    return vector_query_tool, summary_tool

# -------------------------------------------------------------
# API Endpoints
# -------------------------------------------------------------
@app.get("/")
def read_root():
    return {"message": "Welcome to ReAct API with LLM and Pinecone integration."}

@app.get("/files/")
def list_uploaded_files():
    files = os.listdir(UPLOAD_DIR)
    return {"uploaded_files": files}

@app.get("/chat-history/")
def get_chat_history_endpoint(user_id: str = Query(...), chat_id: str = Query(...)):
    history = get_chat_history(user_id, chat_id)
    return {"user_id": user_id, "chat_id": chat_id, "history": [json.loads(entry) for entry in history]}


# @app.post("/upload/")
# async def upload_files(files: List[UploadFile] = File(...)):
#     uploaded_file_paths = []
#     TOOLS_DIR = "./tools"
#     os.makedirs(TOOLS_DIR, exist_ok=True)
#     for file in files:
#         filename = secure_filename(file.filename)
#         file_path = os.path.join(UPLOAD_DIR, filename)
#         # Save the file
#         with open(file_path, "wb") as buffer:
#             shutil.copyfileobj(file.file, buffer)
#         uploaded_file_paths.append(file_path)

#         # Process tools
#         vector_tool, summary_tool = get_doc_tools(file_path, Path(filename).stem)

#         # Store tools using pickle (to avoid reprocessing on every query)
#         tools_path = os.path.join(TOOLS_DIR, f"{filename}.pkl")
#         with open(tools_path, "wb") as f:
#             dill.dump([vector_tool, summary_tool], f)

#         # Save file-tool mapping in Redis (store file name → tool path)
#         redis_client.set(filename, json.dumps(tools_path))

#     return {"message": "Files processed and uploaded successfully", "file_paths": uploaded_file_paths}

@app.post("/upload/")
async def upload_files(
    files: List[UploadFile] = File(...),
    user_id: str = Form(...),
    chat_id: str = Form(...)
):
    for file in files:
        file_path = os.path.join(UPLOAD_DIR, secure_filename(file.filename))
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Load documents
        documents = _load_data(file_path)
        for doc in documents:
            doc.metadata.update({"user_id": user_id, "chat_id": chat_id})
        
        # Create nodes with embeddings
        nodes = SentenceSplitter(chunk_size=1024).get_nodes_from_documents(documents)
        
        # Explicitly generate embeddings for nodes
        for node in nodes:
            node_embedding = embed_model.get_text_embedding(
                node.get_content()
            )
            node.embedding = node_embedding
        
        # Add nodes to vector store
        vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
        vector_store.add(nodes)
        
    return {"message": "Files processed successfully"}

# @app.get("/query/")
# def query_documents(query: str = Query(...), file_names: str = Query(""), user_id: Optional[str] = Query(None), chat_id: str = Query(...)):
#     file_names_list = [name.strip() for name in file_names.split(",") if name.strip()]

#     # If no files, use default LLM
#     if not file_names_list:
#         response = llm.complete(query).text
#         save_chat(user_id, chat_id, query, response)  # Store chat with chat_id
#         return {"query": query, "response": response, "chat_id": chat_id}

#     tools = []
#     for file_name in file_names_list:
#         tools_path = json.loads(redis_client.get(file_name))
#         if not tools_path:
#             return {"error": f"File '{file_name}' has not been uploaded or processed."}

#         # Load precomputed tools
#         with open(tools_path, "rb") as f:
#             vector_tool, summary_tool = pickle.load(f)
#         tools.extend([vector_tool, summary_tool])

#     # Create agent dynamically when querying (no memory overhead between requests)
#     agent_worker = ReActAgentWorker.from_tools(tools, verbose=True)
#     agent = AgentRunner(agent_worker)
#     response = agent.query(query)
#     save_chat(user_id, chat_id, query, str(response))  # Save using chat_id
#     return {"query": query, "response": str(response), "chat_id": chat_id}

from llama_index.core.vector_stores import MetadataFilters, FilterCondition

@app.get("/query/")
def query_documents(
    query: str = Query(...),
    user_id: str = Query(...),
    chat_id: str = Query(...)
):
    # Create metadata filters using the proper class
    filters = MetadataFilters(
        filters=[
            {"key": "user_id", "value": user_id},
            {"key": "chat_id", "value": chat_id}
        ],
        condition=FilterCondition.AND
    )

    # Initialize query engine
    vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
    vector_index = VectorStoreIndex.from_vector_store(vector_store)
    
    query_engine = vector_index.as_query_engine(
        similarity_top_k=3,
        filters=filters
    )

    # Execute query
    response = query_engine.query(query)
    save_chat(user_id, chat_id, query, str(response))
    
    return {"response": str(response)}

# -------------------------------------------------------------
# Run the Application
# -------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
