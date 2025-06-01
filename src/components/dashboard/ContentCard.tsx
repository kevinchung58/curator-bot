
'use client';

import type { ProcessedContent } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, Send, AlertCircle, CheckCircle2, Trash2, Github } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

type ContentCardProps = {
  content: ProcessedContent;
  onProcess: (articleId: string, articleUrl: string) => void;
  onSendToLine: (content: ProcessedContent) => void;
  onPublishToGithub: (content: ProcessedContent) => void;
  onDismiss: (articleId: string) => void;
  isProcessing: boolean;
  defaultTopic: string;
};

export function ContentCard({ content, onProcess, onSendToLine, onPublishToGithub, onDismiss, isProcessing, defaultTopic }: ContentCardProps) {
  const handleProcess = () => {
    if (content.status === 'new' || content.status === 'error') {
      onProcess(content.id, content.sourceUrl);
    }
  };

  const handleSendToLine = () => {
    if (content.status === 'processed') {
      onSendToLine(content);
    }
  }

  const handlePublishToGithub = () => {
    if (content.status === 'processed') {
      onPublishToGithub(content);
    }
  }

  const handleDismiss = () => {
    onDismiss(content.id);
  }

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
      <CardHeader>
        {content.status === 'processed' && content.title && content.title !== "Content Fetch Failed" ? (
          <CardTitle className="font-headline text-xl">{content.title}</CardTitle>
        ) : (
          <CardTitle className="font-headline text-xl truncate" title={content.sourceUrl.length > 50 ? content.sourceUrl : undefined}>
            {content.sourceUrl.length > 50 ? `${content.sourceUrl.substring(0, 47)}...` : content.sourceUrl}
          </CardTitle>
        )}
        <CardDescription className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          <Link href={content.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
            {content.sourceUrl}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        {content.status === 'processing' && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">{content.progressMessage || 'Processing content...'}</p>
          </div>
        )}
        {content.status === 'processed' && (
          <>
            <p className="text-sm text-muted-foreground mb-2 line-clamp-3">{content.summary}</p>
            <div className="flex flex-wrap gap-2">
              {content.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </>
        )}
        {content.status === 'error' && (
           <div className="flex items-center text-destructive">
             <AlertCircle className="h-5 w-5 mr-2" />
             <p>{content.errorMessage || content.progressMessage || 'An error occurred during processing.'}</p>
           </div>
        )}
         {content.status === 'sentToLine' && (
           <div className="flex items-center text-green-600">
             <CheckCircle2 className="h-5 w-5 mr-2" />
             <p>Content proposal sent to LINE.</p>
           </div>
        )}
         {content.status === 'publishedToGithub' && (
           <div className="flex items-center text-purple-600">
             <Github className="h-5 w-5 mr-2" />
             <p>{content.progressMessage || 'Content (simulated) published to GitHub.'}</p>
           </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 justify-end pt-4 border-t flex-wrap">
        {(content.status === 'new' || content.status === 'error') && (
          <Button onClick={handleProcess} disabled={isProcessing && content.id === (window as any).processingItemIdForButton} variant="outline" size="sm">
            {isProcessing && content.id === (window as any).processingItemIdForButton ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Process Content
          </Button>
        )}
        {content.status === 'processed' && (
          <>
            <Button onClick={handleSendToLine} variant="default" size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              <Send className="mr-2 h-4 w-4" />
              Send to LINE
            </Button>
            <Button onClick={handlePublishToGithub} variant="outline" size="sm" className="border-purple-500 text-purple-600 hover:bg-purple-50 hover:text-purple-700">
              <Github className="mr-2 h-4 w-4" />
              Publish to GitHub
            </Button>
          </>
        )}
         <Button onClick={handleDismiss} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
}
// Helper to potentially sync isProcessing state for button spinner if needed,
// though the direct prop `isProcessing` should generally cover it.
// This is a bit of a hack and might not be necessary if prop drilling is correct.
if (typeof window !== 'undefined') {
  (window as any).processingItemIdForButton = null;
}
