import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useParams, useLocation } from "react-router-dom";

const SourceBox = ({ source }) => (
  <div className="flex-1 min-w-[200px] max-w-[250px] bg-extradark-gray rounded-lg p-1 hover:bg-primary transition-colors cursor-pointer outline-solid">
    <div className="text-xs font-small text-gray-900 truncate">
      {source.document_name}
    </div>
    <div className="text-xs text-gray-500 mt-1 truncate">
      {source.source_text}
    </div>
    {source.page_number && (
      <div className="text-xs text-gray-400 mt-1">
        Page {source.page_number}
      </div>
    )}
  </div>
);

export default function ChatScreen() {
  const [searchVal, setSearchVal] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const { chatId } = useParams();
  const location = useLocation();
  const userId = location.state?.userId;
  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  useEffect(() => {
    const loadChat = async () => {
      try {
        const { data } = await axios.get(
          "https://wr5kffmhy5zsebmr7kzftu2hxa0hmybu.lambda-url.us-east-1.on.aws/chat-history/",
          {
            params: { user_id: userId, chat_id: chatId },
          }
        );
        const transformedHistory = data.history.flatMap((entry) => [
          { sender: "user", message: entry.query },
          { sender: "bot", message: entry.response },
        ]);
        setChatHistory(transformedHistory);
      } catch (error) {
        console.error("Failed to load chat:", error);
      }
    };

    if (userId && chatId) {
      loadChat();
    }
  }, [chatId, userId]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prevFiles) => [...prevFiles, ...files]);
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
      formData.append("user_id", userId);
      formData.append("chat_id", chatId);
      selectedFiles.forEach((file) => {
        formData.append("files", file);
      });
      const { data } = await axios.post(
        "https://wr5kffmhy5zsebmr7kzftu2hxa0hmybu.lambda-url.us-east-1.on.aws/upload/",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );
      alert(data.message);
      setSelectedFiles([]);
    } catch (error) {
      console.error("Upload failed:", error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleQuery = async () => {
    if (!searchVal.trim() || isThinking) return;
    const userMessage = { sender: "user", message: searchVal };
    setChatHistory((prev) => [...prev, userMessage]);
    setSearchVal("");
    const thinkingMessage = {
      sender: "bot",
      message: "Thinking",
      type: "thinking",
    };
    setChatHistory((prev) => [...prev, thinkingMessage]);
    setIsThinking(true);
    try {
      const { data } = await axios.get(
        "https://wr5kffmhy5zsebmr7kzftu2hxa0hmybu.lambda-url.us-east-1.on.aws/query/",
        {
          params: {
            query: searchVal,
            user_id: userId,
            chat_id: chatId,
          },
        }
      );
      setChatHistory((prev) => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          sender: "bot",
          message: data.response.response ?? data.response,
          sources: data.sources || [],
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

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey && selectedFiles.length === 0) {
      e.preventDefault();
      handleQuery();
    }
  };

  return (
    <div className="w-full h-screen flex flex-col max-w-screen-md mx-auto px-4 py-6">
      <div
        ref={chatContainerRef}
        className="flex-1 bg-gray-100 p-4 rounded-lg overflow-y-auto"
      >
        {chatHistory.map((chat, index) => (
          <div
            key={index}
            className={`p-3 my-2 rounded-2xl shadow-sm ${
              chat.sender === "user"
                ? "bg-extradark-gray max-w-[70%] text-white ml-auto"
                : "text-white mr-auto"
            }`}
          >
            {chat.type === "thinking" ? (
              <div className="flex items-center gap-2">
                <span>{chat.message}</span>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-100"></div>
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-200"></div>
                </div>
              </div>
            ) : (
              <>
                <span>{chat.message}</span>
                {chat.sources && chat.sources.length > 0 && (
                  <>
                    <div className="text-left font-small text-xs text-gray-800 mt-3">
                      Sources
                    </div>
                    <div className="flex gap-2 overflow-x-auto">
                      {chat.sources.slice(0, 4).map((source, sourceIndex) => (
                        <SourceBox key={sourceIndex} source={source} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="w-full relative py-3">
        <textarea
          placeholder="Ask anything..."
          className="w-full p-3 pl-12 pr-12 rounded-2xl bg-extradark-gray text-white resize-none h-18 focus:outline-none"
          value={searchVal}
          onChange={(e) => setSearchVal(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isThinking}
        />
        <button
          type="button"
          className="absolute inset-y-0 left-0 flex items-center pl-3"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={isUploading || isThinking}
        >
          <svg
            className="w-5 h-5 bg-primary rounded-2xl text-gray-600"
            fill="currentColor"
            viewBox="0 0 512 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M256 48a208 208 0 1 1 0 416 208 208 0 1 1 0-416zm0 464A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM232 368h48V344 280h64 24V232H344 280V168 144H232v24 64H168 144v48h24 64v64 24z" />
          </svg>
        </button>
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
                className="text-xs bg-primary text-white px-2 py-1 rounded"
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
              className="w-5 h-5 bg-primary rounded-2xl text-gray-600"
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
    </div>
  );
}
