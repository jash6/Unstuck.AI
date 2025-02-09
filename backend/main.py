# from fastapi import FastAPI, File, UploadFile, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from pydantic import BaseModel

# from typing import List
# import os
# import pinecone

# from llama_index import (
#     VectorStoreIndex,
#     SimpleDirectoryReader,
#     StorageContext,
#     ServiceContext,
#     load_index_from_storage,
# )
# from llama_index.vector_stores import PineconeVectorStore
# from llama_index.llms import OpenAI

# import tempfile

# app = FastAPI()
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:3000"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Initialize Pinecone
# pinecone.init(
#     api_key=os.getenv("PINECONE_API_KEY"),
#     environment=os.getenv("PINECONE_ENVIRONMENT")
# )
# index_name = "document-qa"

# # Create Pinecone index if it doesn't exist
# if index_name not in pinecone.list_indexes():
#     pinecone.create_index(
#         name=index_name,
#         dimension=1536,  # OpenAI embeddings dimension
#         metric="cosine"
#     )

# pinecone_index = pinecone.Index(index_name)

# # Initialize LlamaIndex components
# llm = OpenAI(model="gpt-4", temperature=0.1)
# service_context = ServiceContext.from_defaults(llm=llm)

# # Create vector store
# vector_store = PineconeVectorStore(pinecone_index=pinecone_index)
# storage_context = StorageContext.from_defaults(vector_store=vector_store)

# class QueryRequest(BaseModel):
#     query: str

# @app.post("/upload")
# async def upload_files(files: List[UploadFile] = File(...)):
#     try:
#         # Create a temporary directory to store uploaded files
#         with tempfile.TemporaryDirectory() as temp_dir:
#             # Save uploaded files to temporary directory
#             for file in files:
#                 file_path = os.path.join(temp_dir, file.filename)
#                 with open(file_path, "wb") as buffer:
#                     content = await file.read()
#                     buffer.write(content)
            
#             # Load documents using LlamaIndex
#             documents = SimpleDirectoryReader(temp_dir).load_data()
            
#             # Create and store the index
#             index = VectorStoreIndex.from_documents(
#                 documents,
#                 storage_context=storage_context,
#                 service_context=service_context
#             )
            
#         return {"message": "Files processed successfully"}
    
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# @app.post("/query")
# async def query_documents(request: QueryRequest):
#     try:
#         # Load the index from storage
#         index = VectorStoreIndex.from_vector_store(
#             vector_store,
#             service_context=service_context
#         )
        
#         # Create query engine
#         query_engine = index.as_query_engine(
#             response_mode="tree_summarize",
#             streaming=False,
#             similarity_top_k=3
#         )
        
#         # Execute query
#         response = query_engine.query(request.query)
        
#         # Extract source documents
#         source_texts = []
#         if hasattr(response, 'source_nodes'):
#             for node in response.source_nodes:
#                 source_texts.append(node.node.text[:200] + "...")  # First 200 chars of each source
        
#         return {
#             "response": str(response),
#             "sources": source_texts
#         }
    
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(app, host="0.0.0.0", port=8000)



from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import uuid
from dotenv import load_dotenv
from langchain.embeddings import OpenAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import Pinecone
from langchain.document_loaders import PyPDFLoader
from langchain.chat_models import ChatOpenAI
from langchain.chains import ConversationalRetrievalChain
import pinecone
import redis
from redis.commands.json.path import Path
import json

load_dotenv()

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
pinecone.init(
    api_key=os.getenv("PINECONE_API_KEY"),
    environment=os.getenv("PINECONE_ENV")
)

redis_client = redis.Redis(
    host=os.getenv("UPSTASH_REDIS_HOST"),
    port=int(os.getenv("UPSTASH_REDIS_PORT")),
    password=os.getenv("UPSTASH_REDIS_PASSWORD"),
    ssl=True
)

embeddings = OpenAIEmbeddings()
index_name = "upstack"

if index_name not in pinecone.list_indexes():
    pinecone.create_index(index_name, dimension=1536)

vector_store = Pinecone.from_existing_index(index_name, embeddings)

class ChatRequest(BaseModel):
    message: str
    history: List[dict]

def process_pdf(file: UploadFile) -> List[str]:
    # Save uploaded file temporarily
    temp_path = f"temp_{uuid.uuid4()}.pdf"
    with open(temp_path, "wb") as temp_file:
        temp_file.write(file.file.read())

    # Load and split the PDF
    loader = PyPDFLoader(temp_path)
    documents = loader.load()
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    texts = text_splitter.split_documents(documents)

    # Store in Pinecone
    vector_store.add_documents(texts)

    # Clean up temp file
    os.remove(temp_path)
    
    return [doc.page_content for doc in texts]

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    try:
        for file in files:
            if not file.filename.endswith('.pdf'):
                raise HTTPException(status_code=400, detail="Only PDF files are supported")
            texts = process_pdf(file)
            
            # Cache the raw text in Redis
            file_key = f"doc:{file.filename}"
            redis_client.json().set(file_key, Path.root_path(), {
                'filename': file.filename,
                'chunks': texts
            })
        
        return {"message": "Files processed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(request: ChatRequest):
    try:
        # Initialize conversation chain
        llm = ChatOpenAI(temperature=0)
        conversation = ConversationalRetrievalChain.from_llm(
            llm=llm,
            retriever=vector_store.as_retriever(search_kwargs={"k": 3}),
            return_source_documents=True,
        )

        # Convert history format
        chat_history = [(h["content"], h["content"]) for h in request.history[:-1]]

        # Get response
        result = conversation({
            "question": request.message,
            "chat_history": chat_history
        })

        # Extract sources
        sources = []
        for doc in result["source_documents"]:
            if hasattr(doc, "metadata") and "source" in doc.metadata:
                sources.append(doc.metadata["source"])

        return {
            "response": result["answer"],
            "sources": list(set(sources))  # Remove duplicates
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)