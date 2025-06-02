
'use client';

import type { ProcessedContent } from '@/lib/definitions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Loader2, Send, AlertCircle, CheckCircle2, Trash2, Github, ImagePlus, ImageOff } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import NextImage from 'next/image'; // Renamed to avoid conflict if Image is imported from lucide-react

type ContentCardProps = {
  content: ProcessedContent;
  onProcess: (articleId: string, articleUrl: string) => void;
  onSendToLine: (content: ProcessedContent) => void;
  onPublishToGithub: (content: ProcessedContent) => void;
  onGenerateImage: (contentId: string, title: string, summary: string) => void;
  onDismiss: (articleId: string) => void;
  isProcessingThisCard: boolean;
  isSendingThisCard: boolean;
  isPublishingThisCard: boolean;
  isGeneratingImageForThisCard: boolean;
  isTransitionGlobalPending: boolean;
  defaultTopic: string;
};

export function ContentCard({ 
  content, 
  onProcess, 
  onSendToLine, 
  onPublishToGithub,
  onGenerateImage,
  onDismiss, 
  isProcessingThisCard,
  isSendingThisCard,
  isPublishingThisCard,
  isGeneratingImageForThisCard,
  isTransitionGlobalPending,
  defaultTopic 
}: ContentCardProps) {
  
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

  const handleGenerateImage = () => {
    if (content.status === 'processed' && content.title && content.summary && (!content.imageStatus || content.imageStatus === 'none' || content.imageStatus === 'error' || content.imageStatus === 'generated')) {
      onGenerateImage(content.id, content.title, content.summary);
    }
  };

  const handleDismiss = () => {
    onDismiss(content.id);
  }

  const showProcessSpinner = isProcessingThisCard && isTransitionGlobalPending;
  const showSendSpinner = isSendingThisCard && isTransitionGlobalPending;
  const showPublishSpinner = isPublishingThisCard && isTransitionGlobalPending;
  const showGenerateImageSpinner = isGeneratingImageForThisCard && isTransitionGlobalPending;

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col h-full">
      <CardHeader>
        {content.status === 'processed' && content.title && content.title !== "Content Fetch Failed" && content.title !== "Content Extraction Failed" && content.title !== "AI System Error" ? (
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
      <CardContent className="flex-grow space-y-3">
        {content.status === 'processing' && (
          <div className="flex items-center justify-center h-full" aria-live="polite" aria-atomic="true">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">{content.progressMessage || 'Processing content...'}</p>
          </div>
        )}
        {content.status === 'processed' && (
          <>
            {content.imageStatus === 'generating' && (
              <div className="flex items-center justify-center p-4 border border-dashed rounded-md" aria-live="polite" aria-atomic="true">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-sm text-muted-foreground">Generating image...</p>
              </div>
            )}
            {content.imageStatus === 'generated' && content.imageUrl && (
              <div className="relative aspect-video w-full overflow-hidden rounded-md border">
                <NextImage
                  src={content.imageUrl} 
                  alt={content.title || 'Generated illustration'}
                  layout="fill"
                  objectFit="cover"
                  data-ai-hint={content.imageAiHint || 'illustration'}
                />
              </div>
            )}
            {content.imageStatus === 'error' && (
              <div className="flex items-center p-4 border border-dashed border-destructive rounded-md text-destructive" role="alert">
                <ImageOff className="h-6 w-6 mr-2" />
                <p className="text-sm">
                  Image generation failed: {content.imageErrorMessage || 'Unknown error'}
                </p>
              </div>
            )}
            <p className="text-sm text-muted-foreground line-clamp-3">{content.summary}</p>
            <div className="flex flex-wrap gap-2">
              {content.tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </>
        )}
        {content.status === 'error' && (
           <div className="flex items-center text-destructive" role="alert">
             <AlertCircle className="h-5 w-5 mr-2" />
             <p>{content.errorMessage || content.progressMessage || 'An error occurred during processing.'}</p>
           </div>
        )}
         {content.status === 'sentToLine' && (
           <div className="flex items-center text-green-600" aria-live="polite">
             <CheckCircle2 className="h-5 w-5 mr-2" />
             <p>Content proposal sent to LINE.</p>
           </div>
        )}
         {content.status === 'publishedToGithub' && (
           <div className="flex items-center text-purple-600" aria-live="polite">
             <Github className="h-5 w-5 mr-2" />
             <p>{content.progressMessage || 'Content published to GitHub.'}</p>
           </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 justify-end pt-4 border-t flex-wrap items-center">
        {(content.status === 'new' || content.status === 'error') && (
          <Button onClick={handleProcess} disabled={isTransitionGlobalPending} variant="outline" size="sm">
            {showProcessSpinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Process Content
          </Button>
        )}
        {content.status === 'processed' && (
          <>
            <Button onClick={handleSendToLine} disabled={isTransitionGlobalPending} variant="default" size="sm" className="bg-green-600 hover:bg-green-700 text-white">
              {showSendSpinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send to LINE
            </Button>
            <Button onClick={handlePublishToGithub} disabled={isTransitionGlobalPending} variant="outline" size="sm" className="border-purple-500 text-purple-600 hover:bg-purple-50 hover:text-purple-700">
              {showPublishSpinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Github className="mr-2 h-4 w-4" />}
              Publish to GitHub
            </Button>
             {(!content.imageStatus || content.imageStatus === 'none' || content.imageStatus === 'error') && (
              <Button
                onClick={handleGenerateImage}
                disabled={isTransitionGlobalPending || !content.title || !content.summary}
                variant="outline"
                size="sm"
                className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                title={!content.title || !content.summary ? "Cannot generate image without title and summary" : "Generate Illustrative Image"}
              >
                {showGenerateImageSpinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                Generate Image
              </Button>
            )}
            {content.imageStatus === 'generated' && content.imageUrl && (
              <Button
                onClick={handleGenerateImage} 
                disabled={isTransitionGlobalPending || !content.title || !content.summary}
                variant="outline"
                size="sm"
                className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                title="Re-generate Illustrative Image"
              >
                {showGenerateImageSpinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                Re-Generate Image
              </Button>
            )}
          </>
        )}
         <Button onClick={handleDismiss} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={isTransitionGlobalPending}>
            <Trash2 className="mr-2 h-4 w-4" />
            Dismiss
        </Button>
      </CardFooter>
    </Card>
  );
}

