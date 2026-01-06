"use client";

import MDEditor from "@uiw/react-md-editor";
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
import {
  ChevronDown,
  FileCode,
  Loader2,
  Send,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { getIndexedFileCount, reindexProject } from "./actions";
import { toast } from "sonner";
import CodeReferences from "./codeRefrences";
import { api } from "@/trpc/react";

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
  const saveQuestion = api.project.saveQuestion.useMutation();

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
          getIndexedFileCount(project.id)
            .then(setIndexedCount)
            .catch(console.error);
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
      setAnswer("");
      setFileReferences([]);
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
    [project?.id, question],
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
            <div className="item-center flex gap-2">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="text-primary h-5 w-5" />
                {project?.name} - Q&A
              </DialogTitle>
              <Button
                disabled={saveQuestion.isPending}
                variant={"outline"}
                onClick={() => {
                  saveQuestion.mutate(
                    {
                      projectId: project!.id,
                      question: question,
                      answer: answer,
                      fileReferences: fileReferences,
                    },
                    {
                      onSuccess: () => {
                        toast.success("Question and answer saved to Q&A!");
                      },
                      onError: (err) => {
                        toast.error(
                          "Failed to save question and answer: " + err.message,
                        );
                      },
                    },
                  );
                }}
              >
                Save to Q&A
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] pr-4">
            {/* Loading State */}
            {loading && !answer && (
              <div className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching codebase and generating response...</span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-destructive/10 text-destructive rounded-md p-4">
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Answer */}
            <MDEditor.Markdown
              source={answer}
              className="h-full max-h-[50vh] max-w-[70vw] overflow-scroll"
            />
            <CodeReferences fileReferences={fileReferences} />

            <Button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
            ></Button>
          </ScrollArea>

          {/* File References */}
          {fileReferences.length > 0 && (
            <Collapsible className="mt-4">
              <CollapsibleTrigger className="bg-muted hover:bg-muted/80 flex w-full items-center justify-between rounded-md p-3">
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
                    className="bg-card rounded-md border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-primary font-mono text-xs">
                        {file.fileName}
                      </code>
                      <span className="text-muted-foreground text-xs">
                        {(file.similarity * 100).toFixed(1)}% match
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
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
                <span className="text-muted-foreground text-sm">
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
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                ⚠️ Your repository hasn't been indexed yet. Click "Index Now" to
                analyze your codebase before asking questions.
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
