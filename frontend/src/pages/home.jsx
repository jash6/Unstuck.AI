import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [searchVal, setSearchVal] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const { user, logout } = useUser();
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

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
      const startChatUrl = user
        ? `http://localhost:8000/start_chat/?user_id=${user.id}`
        : "http://localhost:8000/start_chat/";

      const response = await fetch(startChatUrl);
      const chatdata = await response.json();
      const chatId = chatdata.chat_id;

      const formData = new FormData();
      user
        ? formData.append("user_id", user.id)
        : formData.append("user_id", chatdata.user_id);
      formData.append("chat_id", chatId);
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
      navigate(`/chat/${chatId}`, {
        state: { userId: user ? user.id : chatdata.user_id },
      });
      setSelectedFiles([]);
    } catch (error) {
      console.error("Upload failed:", error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };
  return (
    <div
      className={`w-full h-screen flex flex-col max-w-screen-md mx-auto px-4 py-6 justify-center`}
    >
      <>
        <div className="text-center font-serif font-medium text-3xl text-gray-800 mb-4">
          Hi, how can I help you today? 🤗
        </div>
        <div className="w-full relative rounded-lg bg-white">
          {/* Left: File Upload Trigger */}
          <button
            type="button"
            className="absolute inset-y-0 left-0 flex items-center pl-3"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isUploading}
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
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </>
    </div>
  );
}
