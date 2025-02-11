import { useState, useEffect } from "react";
import axios from "axios";
import { SearchMenu } from "../components/searchMenu";

export default function Home() {
  const [searchVal, setSearchVal] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  // Optionally remove filePaths if not needed
  const [filePaths, setFilePaths] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  // Update chat history when a new message is added
  useEffect(() => {
    const chatContainer = document.querySelector(".chat-box");
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }, [chatHistory]);

  // Clear file input when selectedFiles is reset
  useEffect(() => {
    if (selectedFiles.length === 0) {
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) fileInput.value = "";
    }
  }, [selectedFiles]);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    setSelectedFiles(files);
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert("Please select files first.");
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      // Add the required Form fields
      formData.append("user_id", "user123"); // Replace with actual user ID if needed
      formData.append("chat_id", "chat123"); // Replace with actual chat ID if needed

      // Append files
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });

      // Corrected axios call without expecting file_paths from the response
      const { data } = await axios.post(
        "http://localhost:8000/upload/",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      alert(data.message); // Display the backend response message
      setSelectedFiles([]);
    } catch (error) {
      console.error("Upload failed:", error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuery = async () => {
    if (!searchVal.trim()) return;

    const userQuery = { sender: "user", message: searchVal };

    try {
      setChatHistory((prev) => [...prev, userQuery]);

      const { data } = await axios.get("http://localhost:8000/query/", {
        params: {
          query: searchVal,
          user_id: "user123", // Replace with actual user ID if needed
          chat_id: "chat123", // Replace with actual chat ID if needed
        },
      });

      const botResponse = { sender: "bot", message: data.response };
      setChatHistory((prev) => [...prev, botResponse]);
      setSearchVal("");
    } catch (error) {
      console.error("Query failed:", error);
      setChatHistory((prev) => [
        ...prev,
        {
          sender: "bot",
          message: "Sorry, I encountered an error processing your query.",
        },
      ]);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleQuery();
    }
  };

  return (
    <div className="w-full h-full mx-auto max-w-screen-md px-4 py-6">
      <div className="font-serif font-medium text-3xl text-gray-800 mb-6">
        Hi, how can I help you today? 🤗
      </div>

      {/* Chat History */}
      <div className="chat-box bg-gray-100 p-4 rounded-lg h-96 overflow-y-auto mb-6">
        {chatHistory.map((chat, index) => (
          <div
            key={index}
            className={`p-3 my-2 rounded-lg ${
              chat.sender === "user"
                ? "bg-white text-gray-800 ml-auto max-w-[80%] shadow-sm"
                : "bg-white text-gray-800 mr-auto max-w-[80%] shadow-sm"
            }`}
          >
            {chat.message}
          </div>
        ))}
      </div>

      {/* File Upload and Input Area */}
      <div className="space-y-4">
        {/* File Selection Area */}
        <div className="flex items-center gap-2">
          <input
            type="file"
            onChange={handleFileChange}
            className="flex-1 p-2 border rounded"
            multiple
          />
          <button
            onClick={handleUpload}
            className="bg-blue-500 hover:bg-blue-600 text-black px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isUploading ? "Uploading..." : `Upload (${selectedFiles.length})`}
          </button>
        </div>

        {/* Selected Files Display */}
        {selectedFiles.length > 0 && (
          <div className="text-sm text-gray-600">
            Selected files: {selectedFiles.map((file) => file.name).join(", ")}
          </div>
        )}

        {/* Uploaded Files Display */}
        {filePaths.length > 0 && (
          <div className="text-sm text-green-600">
            Uploaded files:{" "}
            {filePaths.map((path) => path.split("/").pop()).join(", ")}
          </div>
        )}

        {/* Input Area */}
        <div className="relative">
          <textarea
            placeholder="Ask anything..."
            className="w-full p-3 border rounded-lg resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button
            onClick={handleQuery}
            className="w-full mt-2 bg-green-500 hover:bg-green-600 text-black py-2 px-4 rounded-lg transition-colors"
          >
            Send
          </button>
          <SearchMenu searchValue={searchVal} />
        </div>
      </div>
    </div>
  );
}
