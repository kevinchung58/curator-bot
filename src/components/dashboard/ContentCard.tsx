'use client';

import type { ProcessedContent } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, Send, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

type ContentCardProps = {
  content: ProcessedContent;
  onProcess: (articleId: string, articleUrl: string) => void;
  onSendToLine: (content: ProcessedContent) => void;
  onDismiss: (articleId: string) => void;
  isProcessing: boolean;
  defaultTopic: string;
};

export function ContentCard({ content, onProcess, onSendToLine, onDismiss, isProcessing, defaultTopic }: ContentCardProps) {
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

  const handleDismiss = () => {
    onDismiss(content.id);
  }

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
      <CardHeader>
        {content.status === 'processed' ? (
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
            <p className="ml-2 text-muted-foreground">Processing content...</p>
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
             <p>{content.errorMessage || 'An error occurred during processing.'}</p>
           </div>
        )}
         {content.status === 'sentToLine' && (
           <div className="flex items-center text-green-600">
             <CheckCircle2 className="h-5 w-5 mr-2" />
             <p>Content proposal sent to LINE.</p>
           </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 justify-end pt-4 border-t">
        {(content.status === 'new' || content.status === 'error') && (
          <Button onClick={handleProcess} disabled={isProcessing} variant="outline" size="sm">
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Process Content
          </Button>
        )}
        {content.status === 'processed' && (
          <Button onClick={handleSendToLine} variant="default" size="sm" className="bg-green-600 hover:bg-green-700 text-white">
            <Send className="mr-2 h-4 w-4" />
            Send to LINE
          </Button>
        )}
         <Button onClick={handleDismiss} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
}
