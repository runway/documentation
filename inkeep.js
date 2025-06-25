function loadScript(url, callback) {
  const script = document.createElement("script");
  script.src = url;
  script.type = "text/javascript";
  script.onload = callback;
  document.head.appendChild(script);
}

loadScript(
  "https://cdn.jsdelivr.net/npm/@inkeep/cxkit-mintlify@0.5/dist/index.js",
  () => {
    const settings = {
      baseSettings: {
        apiKey: "ee18117d1f0d8ca2710394148cdb21da31c0eb3ce2d6f58c", // Replace with your actual Inkeep API key
        primaryBrandColor: "#C8A7F2", // Using your primary color from mint.json
        organizationDisplayName: "Runway", // Using your name from mint.json
        // Add other optional settings as needed
      },
      
      aiChatSettings: {
        // Optional: Add your logo
        // aiAssistantAvatar: "https://yourdomain.com/logo.svg",
        exampleQuestions: [
          "How do I get started with Runway?",
          "How do I use keyboard shortcuts?",
          "How do I build a page for reporting?",
          "How do I share my model with investors?,
        ],
        / Optional: customize the placeholder text
        chatInputPlaceholder: "Ask me anything about Runway...",
      },
      searchSettings: {
        // Optional: customize search behavior
        placeholder: "Search Runway docs...",
        tabSettings: {
          isAllTabEnabled: true,
          aiChatTabLabel: "Ask AI",
          webTabLabel: "Search Docs",
      },
    };

    // Initialize the UI components
    Inkeep.ModalSearchAndChat(settings); // Search Bar
    Inkeep.ChatButton(settings); // 'Ask AI' button
  }
);
