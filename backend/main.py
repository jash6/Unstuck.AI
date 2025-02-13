import os
import boto3
from io import BytesIO
from botocore.exceptions import NoCredentialsError, ClientError
from pathlib import Path
from typing import List, Optional, Dict, Any
import json
import uuid
import random
import string
import datetime
from fastapi import FastAPI, UploadFile, File, Query, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from werkzeug.utils import secure_filename
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.utilities import parameters
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver

# Initialize AWS utilities
logger = Logger()
tracer = Tracer()
metrics = Metrics()

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
from pinecone import Pinecone
from upstash_redis import Redis

import nest_asyncio
nest_asyncio.apply()

class Config:
    def __init__(self):
        # Initialize SSM client
        self.ssm = boto3.client('ssm')
        self._load_config()

    def _load_config(self):
        # Load configuration from AWS Parameter Store
        self.OPENAI_API_KEY = self._get_parameter('/myapp/prod/openai_key')
        self.LLAMA_CLOUD_API_KEY = self._get_parameter('/myapp/prod/llama_cloud_api_key')
        self.PINECONE_API_KEY = self._get_parameter('/myapp/prod/pinecone_key')
        self.UPSTASH_REDIS_URL = self._get_parameter('/myapp/prod/redis_url')
        self.UPSTASH_REDIS_TOKEN = self._get_parameter('/myapp/prod/redis_token')
        self.S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME', 'unstuckai')

    def _get_parameter(self, param_name: str) -> str:
        try:
            response = self.ssm.get_parameter(
                Name=param_name,
                WithDecryption=True
            )
            return response['Parameter']['Value']
        except Exception as e:
            logger.error(f"Error fetching parameter {param_name}: {str(e)}")
            raise

class LambdaConfig:
    def __init__(self):
        self.tmp_dir = '/tmp'
        self.max_payload = 6 * 1024 * 1024  # 6MB Lambda payload limit

    def get_temp_file_path(self, filename: str) -> str:
        return os.path.join(self.tmp_dir, filename)

# Initialize configuration
config = Config()

# Initialize models and services
embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")
llm = OpenAI(api_key=config.OPENAI_API_KEY, model="gpt-3.5-turbo", temperature=0)
Settings.llm = llm
Settings.embed_model = embed_model

# Pinecone Initialization
pc = Pinecone(api_key=config.PINECONE_API_KEY)
pinecone_index = pc.Index("quickstart")

# Redis Initialization
redis_client = Redis(url=config.UPSTASH_REDIS_URL, token=config.UPSTASH_REDIS_TOKEN)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

s3_client = boto3.client('s3')

# Helper Functions
@tracer.capture_method
async def save_chat(user_id: str, chat_id: str, query: str, response: str):
    try:
        chat_entry = json.dumps({"query": query, "response": str(response)})
        redis_client.lpush(f"chat_history:{user_id}:{chat_id}", chat_entry)
    except Exception as e:
        logger.error(f"Error saving chat: {str(e)}")
        raise

@tracer.capture_method
async def get_chat_history(user_id: str, chat_id: str):
    try:
        history = redis_client.lrange(f"chat_history:{user_id}:{chat_id}", 0, -1)
        return [json.loads(entry) for entry in history] if history else []
    except Exception as e:
        logger.error(f"Error getting chat history: {str(e)}")
        return []

@tracer.capture_method
def upload_to_s3(file_content: bytes, filename: str) -> str:
    try:
        s3_key = f"uploads/{filename}"
        s3_client.put_object(
            Bucket=config.S3_BUCKET_NAME,
            Key=s3_key,
            Body=file_content
        )
        return f"https://{config.S3_BUCKET_NAME}.s3.amazonaws.com/{s3_key}"
    except Exception as e:
        logger.error(f"Error uploading to S3: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to upload file to S3")

@tracer.capture_method
def _load_data(file_path: str) -> List[Document]:
    try:
        parser = LlamaParse(result_type="text",api_key=config.LLAMA_CLOUD_API_KEY)
        json_objs = parser.get_json_result(file_path)
        docs = []
        for json_obj in json_objs:
            docs.extend([
                Document(text=page["text"], metadata={"page_label": str(page["page"])})
                for page in json_obj["pages"]
            ])
        return docs
    except Exception as e:
        logger.error(f"Error loading data: {str(e)}")
        raise

@tracer.capture_method
def create_document_tools(user_id: str, chat_id: str, user_document_id: str, document_name: str):
    try:
        vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
        vector_index = VectorStoreIndex.from_vector_store(vector_store)
        
        def vector_query(query: str) -> Dict[str, Any]:
            if not query.strip():
                return {"response": "Please provide a valid query", "sources": []}
                
            filters = MetadataFilters(
                filters=[
                    MetadataFilter(key="user_id", value=str(user_id)),
                    MetadataFilter(key="chat_id", value=str(chat_id)),
                    MetadataFilter(key="user_document_id", value=str(user_document_id))
                ],
                condition=FilterCondition.AND
            )
            
            try:
                query_engine = vector_index.as_query_engine(
                    similarity_top_k=5,
                    filters=filters,
                    response_mode="compact"
                )
                response = query_engine.query(query)
                
                if not response or not response.source_nodes:
                    return {"response": "No relevant information found", "sources": []}

                sources = [{
                    "source_text": node.text[:200],
                    "page_number": node.metadata.get("page_label", "Unknown"),
                    "document_name": document_name
                } for node in response.source_nodes]
                
                return {"response": str(response), "sources": sources}
            except Exception as e:
                logger.error(f"Error in vector query: {str(e)}")
                return {"response": f"Error querying document: {str(e)}", "sources": []}

        vector_tool = FunctionTool.from_defaults(
            name=f"vector_{user_document_id}",
            description=f"Search for specific information in the document titled '{document_name}'.",
            fn=vector_query
        )

        def summary_query(query: str = "Please provide a comprehensive summary of this document.") -> Dict[str, Any]:
            filters = MetadataFilters(
                filters=[
                    MetadataFilter(key="user_id", value=str(user_id)),
                    MetadataFilter(key="chat_id", value=str(chat_id)),
                    MetadataFilter(key="user_document_id", value=str(user_document_id))
                ],
                condition=FilterCondition.AND
            )
            
            try:
                summary_query_engine = vector_index.as_query_engine(
                    response_mode="tree_summarize",
                    filters=filters,
                    similarity_top_k=5
                )
                response = summary_query_engine.query(query)
                
                sources = [{
                    "source_text": node.text[:50],
                    "page_number": node.metadata.get("page_label", "Unknown"),
                    "document_name": document_name
                } for node in response.source_nodes]
                
                return {"response": str(response), "sources": sources}
            except Exception as e:
                logger.error(f"Error in summary query: {str(e)}")
                return {"response": f"Error querying document: {str(e)}", "sources": []}

        summary_tool = FunctionTool.from_defaults(
            name=f"summary_{user_document_id}",
            description=f"Generate comprehensive summaries of the document titled '{document_name}'.",
            fn=summary_query
        )

        return vector_tool, summary_tool
    except Exception as e:
        logger.error(f"Error creating document tools: {str(e)}")
        raise

# API Endpoints
@app.get("/start_chat/")
@tracer.capture_method
async def start_chat(user_id: str = None):
    try:
        if not user_id:
            user_id = f"guest_{''.join(random.choices(string.ascii_letters + string.digits, k=8))}"
        chat_id = str(uuid.uuid4())
        redis_client.sadd(f"user:{user_id}:chats", chat_id)
        return {"user_id": user_id, "chat_id": chat_id}
    except Exception as e:
        logger.error(f"Error starting chat: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start chat")

@app.post("/upload/")
@tracer.capture_method
async def upload_files(
    files: List[UploadFile] = File(...),
    user_id: str = Form(...),
    chat_id: str = Form(...),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    lambda_config = LambdaConfig()
    try:
        for file in files:
            content = await file.read()
            if len(content) > lambda_config.max_payload:
                raise HTTPException(status_code=413, detail="File too large for Lambda")
            
            user_document_id = str(uuid.uuid4())
            filename = secure_filename(file.filename)
            
            # Save to temporary location
            temp_path = lambda_config.get_temp_file_path(filename)
            with open(temp_path, 'wb') as f:
                f.write(content)
            
            # Upload to S3
            s3_url = upload_to_s3(content, filename)
            
            # Clean up temp file
            os.remove(temp_path)
            
            background_tasks.add_task(
                _process_document_async,
                s3_url,
                user_id,
                chat_id,
                user_document_id,
                filename
            )
        
        return {"message": "Files uploaded successfully"}
    except Exception as e:
        logger.error(f"Error in file upload: {str(e)}")
        raise HTTPException(status_code=500, detail="File upload failed")

@tracer.capture_method
async def _process_document_async(s3_url: str, user_id: str, chat_id: str, user_document_id: str, filename: str):
    try:
        documents = _load_data(s3_url)
        nodes = []
        for doc in documents:
            doc.metadata.update({
                "user_id": user_id,
                "chat_id": chat_id,
                "user_document_id": user_document_id
            })
            nodes.extend(SentenceSplitter(chunk_size=1024).get_nodes_from_documents([doc]))
            
        for node in nodes:
            node.embedding = embed_model.get_text_embedding(node.get_content())
        
        vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
        vector_store.add(nodes)

        metadata = {
            "filename": filename,
            "user_id": user_id,
            "chat_id": chat_id,
            "document_id": user_document_id,
            "s3_url": s3_url
        }

        redis_client.set(f"document:{user_document_id}:metadata", json.dumps(metadata))
        redis_client.sadd(f"user:{user_id}:chat:{chat_id}:documents", user_document_id)
    except Exception as e:
        logger.error(f"Error processing document: {str(e)}")
        raise

@app.get("/query/")
@tracer.capture_method
async def query_documents(
    query: str = Query(...),
    user_id: str = Query(...),
    chat_id: str = Query(...)
):
    try:
        document_ids = redis_client.smembers(f"user:{user_id}:chat:{chat_id}:documents")
        doc_tools = []
        
        for doc_id in document_ids:
            metadata = redis_client.get(f"document:{doc_id}:metadata")
            if metadata:
                metadata = json.loads(metadata)
                vector_tool, summary_tool = create_document_tools(
                    user_id,
                    chat_id,
                    doc_id,
                    metadata.get("filename", "")
                )
                doc_tools.extend([vector_tool, summary_tool])

        agent_worker = ReActAgentWorker.from_tools(
            tools=doc_tools,
            llm=llm,
            max_iterations=15,
            verbose=True,
            handle_parsing_errors=True
        )
        agent = AgentRunner(agent_worker)
        
        response_text = agent.query(query)
        sources = []
        
        for tool in doc_tools:
            if isinstance(tool, FunctionTool):
                if tool.fn.__name__ == 'vector_query':
                    vector_response = tool.fn(query)
                    if "sources" in vector_response:
                        sources.extend(vector_response["sources"])
                elif tool.fn.__name__ == 'summary_query':
                    summary_response = tool.fn(query)
                    if "sources" in summary_response:
                        sources.extend(summary_response["sources"])

        # Evaluate response quality
        evaluation_prompt = (
            "Evaluate the quality of the following response to a user query. "
            "If the response does not contain relevant information or is unclear, return 'BAD'. "
            "Otherwise, return 'GOOD'.\n\n"
            f"Query: {query}\nResponse: {response_text}\nEvaluation:"
        )
        evaluation_result = str(llm.complete(evaluation_prompt)).strip()

        if evaluation_result == "BAD":
            fallback_response = str(llm.complete(query))
            response_text = str(fallback_response)

        await save_chat(user_id, chat_id, query, response_text)
        return {"response": response_text, "sources": sources}
        
    except Exception as e:
        logger.error(f"Error in query processing: {str(e)}")
        raise HTTPException(status_code=500, detail="Query processing failed")

@app.get("/chat-history/")
@tracer.capture_method
async def get_chat_history_endpoint(
    user_id: str = Query(...),
    chat_id: str = Query(...)
):
    try:
        history = await get_chat_history(user_id, chat_id)
        return {"history": history}
    except Exception as e:
        logger.error(f"Error retrieving chat history: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve chat history")

@app.get("/get_chats/")
@tracer.capture_method
async def get_chats(user_id: str):
    try:
        chat_ids = redis_client.smembers(f"user:{user_id}:chats")
        chats = []
        for chat_id in chat_ids:
            metadata = redis_client.get(f"chat:{chat_id}:metadata")
            if metadata:
                chat_data = json.loads(metadata)
                chats.append(chat_data)
        chats.sort(key=lambda x: x["created_at"], reverse=True)
        return {"chats": chats}
    except Exception as e:
        logger.error(f"Error retrieving chats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve chats")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global error handler: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error occurred"}
    )

# Lambda handler configuration
@logger.inject_lambda_context
@tracer.capture_lambda_handler
def lambda_handler(event: dict, context: dict) -> dict:
    """
    AWS Lambda handler for the FastAPI application
    """
    # Initialize expensive operations only once during cold start
    if not hasattr(lambda_handler, 'mangum_handler'):
        lambda_handler.mangum_handler = Mangum(app, lifespan="off")
    
    try:
        response = lambda_handler.mangum_handler(event, context)
        return response
    except Exception as e:
        logger.error(f"Lambda handler error: {str(e)}")
        return {
            "statusCode": 500,
            "body": json.dumps({"detail": "Internal server error occurred"})
        }

# Only run the app directly when not in Lambda environment
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)