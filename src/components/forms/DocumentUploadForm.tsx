'use client';

import { useState, useCallback } from 'react';
import { Upload, X, File, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export interface FileData {
  name: string;
  type: string;
  size: number;
  base64Content: string;
}

interface DocumentUploadFormProps {
  onFilesChange: (files: FileData[]) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const DocumentUploadForm = ({ onFilesChange }: DocumentUploadFormProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);

  const processFiles = useCallback(async (acceptedFiles: File[]) => {
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        .includes(file.type);
      if (!isValidType) {
        toast.error(`${file.name} is not a valid document file. Please upload PDF or Word documents only.`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} exceeds the 10MB size limit.`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    setIsReading(true);
    try {
      const fileDataArray: FileData[] = await Promise.all(
        validFiles.map(async (file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
          base64Content: await readFileAsBase64(file),
        }))
      );

      setFiles(validFiles);
      onFilesChange(fileDataArray);
      toast.success('Documents uploaded successfully!');
    } catch {
      toast.error('Failed to read one or more files.');
    } finally {
      setIsReading(false);
    }
  }, [onFilesChange]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  }, [processFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    processFiles(selectedFiles);
  }, [processFiles]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      if (newFiles.length === 0) {
        onFilesChange([]);
      } else {
        // Re-read remaining files (they're still in memory as File objects)
        Promise.all(
          newFiles.map(async (file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            base64Content: await readFileAsBase64(file),
          }))
        ).then(onFilesChange);
      }
      return newFiles;
    });
    toast.success('Document removed');
  }, [onFilesChange]);

  return (
    <div className="w-full">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`w-full flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg transition-colors ${
          isDragging
            ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-500/10'
            : 'border-stone-300 dark:border-zinc-700'
        }`}
      >
        <input
          type="file"
          id="fileInput"
          multiple
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleFileSelect}
        />
        <label
          htmlFor="fileInput"
          className="flex flex-col items-center justify-center gap-2 cursor-pointer"
        >
          <Upload className="w-8 h-8 text-stone-500 dark:text-stone-400" />
          <p className="text-stone-500 dark:text-stone-400 text-center">
            {isReading ? (
              <span className="text-amber-600 dark:text-amber-500">Reading files...</span>
            ) : isDragging ? (
              <span className="text-amber-600 dark:text-amber-500">Drop your documents here</span>
            ) : (
              <span>
                Drag & drop your documents here or{' '}
                <span className="text-amber-600 dark:text-amber-500">browse</span>
              </span>
            )}
          </p>
          <p className="text-xs text-stone-400 dark:text-stone-500">
            Supports: PDF, DOC, DOCX (max 10MB each)
          </p>
        </label>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-stone-100 dark:bg-zinc-800 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <File className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                    {file.name}
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 hover:bg-stone-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentUploadForm;
