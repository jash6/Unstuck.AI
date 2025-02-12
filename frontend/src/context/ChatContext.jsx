import React, { createContext, useState, useContext } from "react";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [chatVersion, setChatVersion] = useState(0);

  const refreshChatList = () => {
    console.log("refreshing chat list");
    setChatVersion((v) => v + 1);
  };

  return (
    <ChatContext.Provider value={{ chatVersion, refreshChatList }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChatContext = () => useContext(ChatContext);
