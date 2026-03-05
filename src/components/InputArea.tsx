'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // --- NEW: Import Next.js Router ---
import { ArrowUp, LoaderCircle, FileText, BotMessageSquare } from 'lucide-react';
import { useFormStore } from '../store/formStore';
import { useChatStore } from '../store/chatStore'; // --- NEW: Import our Chat Store ---
import GuidedForm from './forms/GuidedForm';
import DocumentUploadForm from './forms/DocumentUploadForm';
import toast from 'react-hot-toast';

type InputView = 'text' | 'doc' | 'form';

const InputArea = () => {
  const [activeView, setActiveView] = useState<InputView>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [textInput, setTextInput] = useState('');

  // --- NEW: Get the router and the createChat action from our stores ---
  const router = useRouter();
  const createChat = useChatStore((state) => state.createChat);
  const sendMessageWithGemini = useChatStore((state) => state.sendMessageWithGemini);
  const formState = useFormStore(); // Fixed: Subscribe to form state changes

  // --- REWRITTEN: The new, unified submit logic ---
  const handleSubmit = async () => {
    setIsLoading(true);
    let userInput = '';
    let chatTitle = '';

    // 1. Consolidate input from any of the three views into a single string
    if (activeView === 'text') {
      if (!textInput.trim()) {
        toast.error("Please enter some text to analyze.");
        setIsLoading(false);
        return;
      }
      userInput = textInput;
      // Use first 5 words of the input as title, or if empty, use default
      chatTitle = textInput.split(' ').slice(0, 5).join(' ') + (textInput.split(' ').length > 5 ? '...' : '');
    } else if (activeView === 'form') {
      if (!formState.caseType) {
        toast.error("Please select a Case Type before submitting.");
        setIsLoading(false);
        return;
      }
      // Simple validation for demonstration
      if (!formState.complainantName || !formState.respondentName) {
         toast.error("Please fill in the Complainant and Respondent names.");
         setIsLoading(false);
         return;
      }
      userInput = `Guided Form Submission:\n- Case Type: ${formState.caseType}\n- Complainant: ${formState.complainantName}\n- Respondent: ${formState.respondentName}`;
      chatTitle = `${formState.caseType} Case`;
    } else { // Document view
      interface UploadedDocument {
        name: string;
      }
      const uploadedDocs = localStorage.getItem('uploadedDocuments');
      if (!uploadedDocs || JSON.parse(uploadedDocs).length === 0) {
        toast.error("Please upload at least one document.");
        setIsLoading(false);
        return;
      }
      const documents = JSON.parse(uploadedDocs);
      const docNames = documents.map((d: UploadedDocument) => d.name).join(', ');
      userInput = `Document Submission: The following documents were uploaded for analysis: ${docNames}`;
      // Create a better title format: "Document: filename"
      chatTitle = documents.length === 1 
        ? `Document: ${documents[0].name}` 
        : `Documents: ${documents.length} files`;
    }

    try {
      // 2. Create the new chat in our Zustand store (without response yet)
      const newChatId = createChat(userInput, chatTitle);

      // 3. Programmatically navigate to the new chat page
      router.push(`/chat/${newChatId}`);

      // 4. Send message with Gemini (will add the response)
      await sendMessageWithGemini(newChatId, userInput, true);

      // We can even clear the form/text input after submission if desired
      setTextInput('');
    } catch (error) {
      console.error('Error submitting case:', error);
      toast.error('Failed to submit case. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // --- (The rest of the component's JSX remains largely the same) ---

  const getButtonClassName = (viewName: InputView) => {
    const isActive = activeView === viewName;
    const baseClasses = "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors duration-200 focus:outline-none";
    const activeClasses = "bg-stone-800 dark:bg-zinc-700 text-white";
    const inactiveClasses = "bg-stone-200 dark:bg-zinc-800 text-stone-600 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-zinc-700";
    return `${baseClasses} ${isActive ? activeClasses : inactiveClasses}`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto py-6 px-4 mt-16">
      <div className="flex items-center justify-center gap-4 mb-6">
        <h1 className="text-3xl font-medium text-stone-800 dark:text-stone-200">
          Any new Case?
        </h1>
      </div>

      <div className="flex items-center justify-center gap-3 mb-6">
        <button onClick={() => setActiveView('text')} className={getButtonClassName('text')}>
          <BotMessageSquare size={16} /> Text Input
        </button>
        <button onClick={() => setActiveView('doc')} className={getButtonClassName('doc')}>
          <FileText size={16} /> Document Input
        </button>
        <button onClick={() => setActiveView('form')} className={getButtonClassName('form')}>
          Guided Form <span className="text-amber-600 dark:text-amber-500 font-normal ml-1">(recommended)</span>
        </button>
      </div>
      
      <div className="relative">
        {activeView === 'text' && (
          <div>
            <div className="relative">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="w-full h-48 p-4 pr-16 text-md bg-stone-100 dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg resize-none text-stone-800 dark:text-stone-200 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:bg-white dark:focus:bg-zinc-900 focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 focus:outline-none transition-all duration-200"
                placeholder="Paste the full case description, FIR details, or narrative here..."
              />
              <button 
                onClick={handleSubmit} 
                disabled={isLoading}
                className="absolute bottom-6 right-6 flex items-center justify-center w-10 h-10 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-800 rounded-full font-semibold hover:bg-stone-900 dark:hover:bg-white transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? <LoaderCircle size={20} className="animate-spin" /> : <ArrowUp size={20} />}
              </button>
            </div>
            <div className="text-center mt-4 mb-16">
              <p className="text-xs text-stone-500 dark:text-stone-400">WAKALAT.AI can make mistakes. Check important info.</p>
            </div>
          </div>
        )}

        {activeView === 'doc' && (
          <div className="flex flex-col items-center justify-center gap-4">
            <DocumentUploadForm />
          </div>
        )}

        {activeView === 'form' && <GuidedForm />}
      </div>

      {(activeView === 'doc' || activeView === 'form') && (
        <div className="flex flex-col items-center mt-6">
          <button 
            onClick={handleSubmit}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-800 rounded-full font-semibold text-sm hover:bg-stone-900 dark:hover:bg-white transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:ring-offset-1 disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isLoading ? ( <LoaderCircle size={18} className="animate-spin" /> ) : (
              <>
                <ArrowUp size={18} />
                Submit for Analysis
              </>
            )}
          </button>
          <div className="text-center mt-4 mb-16">
            <p className="text-xs text-stone-500 dark:text-stone-400">WAKALAT.AI can make mistakes. Check important info.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default InputArea;