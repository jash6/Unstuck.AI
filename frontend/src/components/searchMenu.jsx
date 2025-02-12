import { useRef } from "react";

export const SearchMenu = ({
  searchValue,
  onSendMessage,
  onFileChange,
  selectedFiles,
  onDeleteFile,
  onUpload,
  isUploading,
  isThinking,
}) => {
  const fileInputRef = useRef(null);

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded shadow flex flex-col mt-2">
      {/* File Upload & File List */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            disabled={isUploading || isThinking}
          >
            Upload File
          </button>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            className="hidden"
            onChange={onFileChange}
          />
          {/* Show the list of selected files (if any) */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-col">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="text-red-500 hover:underline"
                    onClick={() => onDeleteFile(index)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded"
          onClick={onSendMessage}
          disabled={isThinking || !searchValue.trim()}
        >
          {isThinking ? (
            <div className="flex items-center gap-1">
              <span>Thinking</span>
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          ) : (
            "Send"
          )}
        </button>
      </div>
      {/* Upload Button (only appears if files have been selected) */}
      {selectedFiles.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1 rounded"
            onClick={onUpload}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : `Upload (${selectedFiles.length})`}
          </button>
        </div>
      )}
    </div>
  );
};
