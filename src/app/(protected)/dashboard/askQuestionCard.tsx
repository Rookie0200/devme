"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import useProject from "@/hooks/use-project";
import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, FileCode, Loader2, Send, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { getIndexedFileCount, reindexProject } from "./actions";
import { toast } from "sonner";

// Type for file references from vector search
interface FileReference {
  fileName: string;
  sourceCode: string;
  summary: string;
  similarity: number;
}

const AskQuestionCard = () => {
  const { project } = useProject();
  const [question, setQuestion] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileReferences, setFileReferences] = useState<FileReference[]>([]);
  const [answer, setAnswer] = useState("");
  const [indexedCount, setIndexedCount] = useState<number | null>(null);
  const [reindexing, setReindexing] = useState(false);

  /**
   * Check indexing status on mount and when project changes
   */
  useEffect(() => {
    if (project?.id) {
      getIndexedFileCount(project.id)
        .then(setIndexedCount)
        .catch(console.error);
    }
  }, [project?.id]);

  /**
   * Handle re-indexing
   */
  const handleReindex = useCallback(async () => {
    if (!project?.id) return;
    
    setReindexing(true);
    try {
      const result = await reindexProject(project.id);
      if (result.success) {
        toast.success(result.message);
        // Poll for updated count
        setTimeout(() => {
          getIndexedFileCount(project.id).then(setIndexedCount).catch(console.error);
        }, 5000);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error("Failed to trigger re-indexing");
    } finally {
      setReindexing(false);
    }
  }, [project?.id]);

  /**
   * Handle form submission - calls the streaming API
   */
  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!project?.id || !question.trim()) return;

      // Reset state for new question
      setOpen(true);
      setLoading(true);
      setError(null);
      setAnswer(""); // Important: Reset answer for new question
      setFileReferences([]);

      try {
        // Call the streaming API route
        const response = await fetch("/api/qa", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: question.trim(),
            projectId: project.id,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to get response");
        }

        // Extract file references from header
        const fileRefsHeader = response.headers.get("X-File-References");
        if (fileRefsHeader) {
          try {
            const refs = JSON.parse(decodeURIComponent(fileRefsHeader));
            setFileReferences(refs);
          } catch {
            console.warn("Failed to parse file references");
          }
        }

        // Read the streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        // Stream the response chunks
        while (true) {
          const { done, value } = await reader.read();

          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          setAnswer((prev) => prev + chunk);
        }
      } catch (err) {
        console.error("Q&A Error:", err);
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [project?.id, question]
  );

  /**
   * Close dialog and optionally clear state
   */
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Optionally clear answer when closing
      // setAnswer("");
      // setFileReferences([]);
    }
  };

  return (
    <>
      {/* Answer Dialog */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {project?.name} - Q&A
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] pr-4">
            {/* Loading State */}
            {loading && !answer && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching codebase and generating response...</span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Answer */}
            {answer && (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap">{answer}</div>
                {loading && (
                  <span className="inline-block h-4 w-2 animate-pulse bg-primary" />
                )}
              </div>
            )}
          </ScrollArea>

          {/* File References */}
          {fileReferences.length > 0 && (
            <Collapsible className="mt-4">
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-muted p-3 hover:bg-muted/80">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileCode className="h-4 w-4" />
                  Referenced Files ({fileReferences.length})
                </span>
                <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {fileReferences.map((file, index) => (
                  <div
                    key={index}
                    className="rounded-md border bg-card p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <code className="font-mono text-xs text-primary">
                        {file.fileName}
                      </code>
                      <span className="text-xs text-muted-foreground">
                        {(file.similarity * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {file.summary}
                    </p>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </DialogContent>
      </Dialog>

      {/* Question Card */}
      <Card className="relative col-span-3">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Ask a Question about {project?.name}
            </CardTitle>
            <div className="flex items-center gap-2">
              {indexedCount !== null && (
                <span className="text-sm text-muted-foreground">
                  {indexedCount === 0 ? (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      No files indexed
                    </span>
                  ) : (
                    <span className="text-green-600">
                      {indexedCount} files indexed
                    </span>
                  )}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleReindex}
                disabled={reindexing}
                className="gap-2"
              >
                {reindexing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Indexing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    {indexedCount === 0 ? "Index Now" : "Re-index"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {indexedCount === 0 && (
            <div className="mb-4 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                ⚠️ Your repository hasn't been indexed yet. Click "Index Now" to analyze your codebase before asking questions.
              </p>
            </div>
          )}
          <form onSubmit={onSubmit}>
            <Textarea
              placeholder="Ask anything about your codebase... e.g., 'How does the authentication work?' or 'What does the user API do?'"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="min-h-[100px] resize-none"
              disabled={loading || indexedCount === 0}
            />
            <div className="mt-4 flex justify-end">
              <Button
                type="submit"
                disabled={loading || !question.trim() || indexedCount === 0}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Ask CommitLytic
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
};

export default AskQuestionCard;
