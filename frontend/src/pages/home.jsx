import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { Upload, Loader } from "lucide-react";
import { useChatContext } from "../context/ChatContext";

const LoadingSpinner = () => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center h-full z-50">
    <div className="bg-white p-6 rounded-lg shadow-xl flex flex-col items-center space-y-4">
      <Loader className="w-8 h-8 text-purple-600 animate-spin" />
      <p className="text-gray-700">Uploading your files...</p>
    </div>
  </div>
);

export default function Home() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { user, logout } = useUser();
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const dropZoneRef = useRef(null);
  const { refreshChatList } = useChatContext();

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prevFiles) => [...prevFiles, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles((prevFiles) => [...prevFiles, ...files]);
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
      const userId = user
        ? user.id
        : localStorage.getItem("guestUserId")
          ? localStorage.getItem("guestUserId")
          : null;
      const startChatUrl = userId
        ? `https://wr5kffmhy5zsebmr7kzftu2hxa0hmybu.lambda-url.us-east-1.on.aws/start_chat/?user_id=${userId}`
        : "https://wr5kffmhy5zsebmr7kzftu2hxa0hmybu.lambda-url.us-east-1.on.aws/start_chat/";

      const response = await fetch(startChatUrl);
      const chatdata = await response.json();
      const chatId = chatdata.chat_id;
      if (!user) {
        localStorage.setItem("guestUserId", chatdata.user_id);
      }
      const formData = new FormData();
      user
        ? formData.append("user_id", user.id)
        : formData.append("user_id", chatdata.user_id);
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
      refreshChatList();
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
    <div className="w-full h-screen flex flex-col max-w-screen-md mx-auto px-4 py-6">
      {isUploading && <LoadingSpinner />}
      <div className="flex flex-col items-center justify-center h-full space-y-4 mt-8">
        <div className="text-center font-serif font-medium text-3xl text-primary mb-4">
          Hi, how can I help you today? 🚀
        </div>
        <div
          ref={dropZoneRef}
          className={`w-full max-w-2xl p-3 border-2 border-dashed rounded-lg bg-extradark-gray
            ${isDragging ? "border-purple-500 bg-purple-50" : "border-gray-300"}
            transition-colors duration-200 ease-in-out`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center space-y-4">
            <div className="p-2 bg-purple-100 rounded-full">
              <Upload className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <p className="text-m font-medium text-black">Click to upload</p>
              <p className="text-sm text-black">or drag and drop files</p>
            </div>
            <p className="text-sm text-black">
              Drop Slides, Lecture, Notes and start chatting
            </p>
          </div>
        </div>

        {selectedFiles.length > 0 && (
          <div className="w-full max-w-2xl">
            <div className="mt-4 space-y-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-gray-50 p-2 rounded"
                >
                  <span className="text-m text-primary">{file.name}</span>
                  <button
                    onClick={() => handleDeleteFile(index)}
                    className="text-primary hover:text-red"
                    disabled={isUploading}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="mt-4 w-full bg-black text-white py-2 px-4 rounded-lg hover:bg-purple-700 disabled:bg-purple-300"
            >
              {isUploading ? "Uploading..." : "Upload Files"}
            </button>
          </div>
        )}

        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
