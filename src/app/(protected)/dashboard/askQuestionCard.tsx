"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import useProject from "@/hooks/use-project";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const AskQuestionCard = () => {
  const { project } = useProject();
  const [question, setQuestion] = useState("");
  const [open, setOpen] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setOpen(true);
    setQuestion("");
  };
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{project?.name}</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <Card className="relative col-span-3">
        <CardHeader>
          <CardTitle>Ask a Question about {project?.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="" onSubmit={onSubmit}>
            <textarea
              className=""
              placeholder="Type your question here..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <div className="h-4"></div>
            <button
              type="submit"
              className="bg-primary hover:bg-primary/80 self-end rounded-md px-4 py-2 text-white"
            >
              Ask CommitLytic
            </button>
          </form>
        </CardContent>
      </Card>
    </>
  );
};

export default AskQuestionCard;
