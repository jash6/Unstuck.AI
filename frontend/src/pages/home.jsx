import { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function Home() {
  // States for text input, chat history, file uploads, and API call status
  const [searchVal, setSearchVal] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll chat history when messages are added.
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // --- File Upload Handlers ---

  // Modified handler: after setting the selected files, clear the file input value.
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    // Replace the current list with the new selection.
    setSelectedFiles((prevFiles) => [...prevFiles, ...files]);
    // Clear the file input so that a subsequent selection doesn't append to the list.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      alert("Please select files first.");
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("user_id", "user123"); // Replace with actual user id if needed.
      formData.append("chat_id", "chat123"); // Replace with actual chat id if needed.
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });
      const { data } = await axios.post(
        "http://localhost:8000/upload/",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      alert(data.message);
      setSelectedFiles([]);
      // Optionally update filePaths from backend response:
      // setFilePaths(data.file_paths || []);
    } catch (error) {
      console.error("Upload failed:", error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // --- Message (Query) Handlers ---
  const handleQuery = async () => {
    if (!searchVal.trim() || isThinking) return;
    // Add the user's message to the chat.
    const userMessage = { sender: "user", message: searchVal };
    setChatHistory((prev) => [...prev, userMessage]);
    setSearchVal("");
    // Add a "thinking" message with an animated spinner.
    const thinkingMessage = {
      sender: "bot",
      message: "Thinking",
      type: "thinking",
    };
    setChatHistory((prev) => [...prev, thinkingMessage]);
    setIsThinking(true);

    try {
      const { data } = await axios.get("http://localhost:8000/query/", {
        params: {
          query: searchVal,
          user_id: "user123",
          chat_id: "chat123",
        },
      });
      // Replace the "thinking" message with the actual response.
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          sender: "bot",
          message: data.response,
        };
        return newHistory;
      });
    } catch (error) {
      console.error("Query failed:", error);
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          sender: "bot",
          message: "Sorry, I encountered an error processing your query.",
        };
        return newHistory;
      });
    } finally {
      setIsThinking(false);
    }
  };

  // Allow sending the message with Enter (without Shift).
  // (If files are selected, Enter won’t trigger sending a query.)
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey && selectedFiles.length === 0) {
      e.preventDefault();
      handleQuery();
    }
  };

  return (
    <div
      className={`w-full h-screen flex flex-col max-w-screen-md mx-auto px-4 py-6 ${
        chatHistory.length === 0 ? "justify-center" : "justify-between"
      }`}
    >
      {/* If there is no chat history, center the greeting and input */}
      {chatHistory.length === 0 ? (
        <>
          <div className="text-center font-serif font-medium text-3xl text-gray-800 mb-4">
            Hi, how can I help you today? 🤗
          </div>
          {/* Input Area */}
          <div className="w-full relative rounded-lg bg-white">
            <textarea
              placeholder="Ask anything..."
              className="w-full p-3 pl-12 pr-12 text-black resize-none h-24 focus:outline-none"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isThinking}
            />
            {/* Left: File Upload Trigger */}
            <button
              type="button"
              className="absolute inset-y-0 left-0 flex items-center pl-3"
              onClick={() =>
                fileInputRef.current && fileInputRef.current.click()
              }
              disabled={isUploading || isThinking}
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="currentColor"
                viewBox="0 0 512 512"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM232 368h48V344 280h64 24V232H344 280V168 144H232v24 64H168 144v48h24 64v64 24z" />
              </svg>
            </button>
            {/* Right: Either Send or Upload (if files are selected) */}
            {selectedFiles.length > 0 ? (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <div className="flex items-center space-x-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center space-x-1">
                      <span className="text-sm">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(index)}
                        className="text-red-500 text-xs"
                        disabled={isUploading}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs bg-black text-white px-2 py-1 rounded"
                    onClick={handleUpload}
                    disabled={isUploading}
                  >
                    {isUploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3"
                onClick={handleQuery}
                disabled={isThinking || !searchVal.trim()}
              >
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="currentColor"
                  viewBox="0 0 448 512"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M429.8 273l17-17-17-17L276.2 85.4l-17-17-33.9 33.9 17 17L354.9 232 24 232 0 232l0 48 24 0 330.8 0L242.2 392.6l-17 17 33.9 33.9 17-17L429.8 273z" />
                </svg>
              </button>
            )}
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </>
      ) : (
        // If there IS chat history, show the header, chat messages, and input area at the bottom.
        <>
          <div>
            <div className="font-serif font-medium text-3xl text-gray-800 mb-4">
              Hi, how can I help you today? 🤗
            </div>
            <div
              ref={chatContainerRef}
              className="flex-1 bg-gray-100 p-4 rounded-lg overflow-y-auto h-96 mb-4"
            >
              {chatHistory.map((chat, index) => (
                <div
                  key={index}
                  className={`p-3 my-2 rounded-lg max-w-[80%] shadow-sm ${
                    chat.sender === "user"
                      ? "bg-white text-gray-800 ml-auto"
                      : "bg-white text-gray-800 mr-auto"
                  }`}
                >
                  {chat.type === "thinking" ? (
                    <div className="flex items-center gap-2">
                      <span>{chat.message}</span>
                      {/* Simple animated spinner */}
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-black rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-black rounded-full animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-black rounded-full animate-bounce delay-200"></div>
                      </div>
                    </div>
                  ) : (
                    <span>{chat.message}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Input Area */}
          <div className="w-full relative rounded-lg bg-white">
            <textarea
              placeholder="Ask anything..."
              className="w-full p-3 pl-12 pr-12 text-black resize-none h-24 focus:outline-none"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isThinking}
            />
            {/* Left: File Upload Trigger */}
            <button
              type="button"
              className="absolute inset-y-0 left-0 flex items-center pl-3"
              onClick={() =>
                fileInputRef.current && fileInputRef.current.click()
              }
              disabled={isUploading || isThinking}
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="currentColor"
                viewBox="0 0 512 512"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM232 368h48V344 280h64 24V232H344 280V168 144H232v24 64H168 144v48h24 64v64 24z" />
              </svg>
            </button>
            {/* Right: Either Send or Upload (if files are selected) */}
            {selectedFiles.length > 0 ? (
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <div className="flex items-center space-x-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center space-x-1">
                      <span className="text-sm">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteFile(index)}
                        className="text-red-500 text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-xs bg-black text-white px-2 py-1 rounded"
                    onClick={handleUpload}
                    disabled={isUploading}
                  >
                    {isUploading ? "Uploading..." : "Upload"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex items-center pr-3"
                onClick={handleQuery}
                disabled={isThinking || !searchVal.trim()}
              >
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="currentColor"
                  viewBox="0 0 448 512"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M429.8 273l17-17-17-17L276.2 85.4l-17-17-33.9 33.9 17 17L354.9 232 24 232 0 232l0 48 24 0 330.8 0L242.2 392.6l-17 17 33.9 33.9 17-17L429.8 273z" />
                </svg>
              </button>
            )}
            <input
              type="file"
              multiple
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </>
      )}
    </div>
  );
}
