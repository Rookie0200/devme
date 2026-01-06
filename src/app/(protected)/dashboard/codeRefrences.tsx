"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {Prism as SyntaxHighlighter} from "react-syntax-highlighter"
import {lucario} from "react-syntax-highlighter/dist/esm/styles/prism";

type Props = {
  fileReferences: {
    fileName: string;
    sourceCode: string;
    summary: string;
  }[];
};
const CodeReferences = ({ fileReferences }: Props) => {
  const [tab, setTab] = useState(fileReferences[0]?.fileName || "");
  return (
    <div className="max-w-[70vw]">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex gap-2 overflow-scroll rounded-md bg-gray-200 p-1">
          {fileReferences.map((file) => (
            <button
            onClick={()=>{setTab(file.fileName)}}
              key={file.fileName}
              value={file.fileName}
              className={cn(
                "text-muted-foreground hover:bg-muted rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors",
                {
                  "bg-primary text-primary-foreground": tab === file.fileName,
                },
              )}
            >
              {file.fileName}
            </button>
          ))}
        </div>
        {fileReferences.map((file) => (
          <TabsContent key={file.fileName} value={file.fileName} className="max-h-[40vh] overflow-scroll max-w-7xl rounded-md">
           <SyntaxHighlighter language="typescript" style={lucario} className="rounded-md p-4">
              {file.sourceCode}
           </SyntaxHighlighter> 
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default CodeReferences;
