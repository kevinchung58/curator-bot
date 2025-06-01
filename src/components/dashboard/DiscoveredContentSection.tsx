
'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { processDiscoveredContent, sendToLineAction, publishToGithubAction } from '@/lib/actions';
import type { ProcessedContent, AppSettings } from '@/lib/definitions';
import { ContentCard } from './ContentCard';
import { PlusCircle, Search, Bot, AlertTriangle, Info, Github } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

async function getAppSettings(): Promise<Partial<AppSettings>> {
  return new Promise(resolve => {
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        const storedSettings = localStorage.getItem('contentCuratorAppSettings');
        if (storedSettings) {
          try {
            const parsedSettings = JSON.parse(storedSettings) as AppSettings;
            resolve({
              defaultTopic: parsedSettings.defaultTopic || 'General AI',
              lineUserId: parsedSettings.lineUserId,
              githubRepoUrl: parsedSettings.githubRepoUrl
            });
            return;
          } catch (e) {
            console.error("Failed to parse settings from localStorage", e);
          }
        }
      }
      resolve({ defaultTopic: 'General AI', lineUserId: undefined, githubRepoUrl: undefined });
    }, 100);
  });
}


export function DiscoveredContentSection() {
  const [discoveredItems, setDiscoveredItems] = useState<ProcessedContent[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [currentTopic, setCurrentTopic] = useState('General Tech');
  const [currentLineUserId, setCurrentLineUserId] = useState<string | undefined>(undefined);
  const [currentGithubRepoUrl, setCurrentGithubRepoUrl] = useState<string | undefined>(undefined);
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getAppSettings().then(settings => {
      if (settings.defaultTopic) {
        setCurrentTopic(settings.defaultTopic);
      }
      if (settings.lineUserId) {
        setCurrentLineUserId(settings.lineUserId);
      }
      if (settings.githubRepoUrl) {
        setCurrentGithubRepoUrl(settings.githubRepoUrl);
      }
    });
    if (typeof window !== 'undefined') {
      const savedItems = localStorage.getItem('discoveredContentItems');
      if (savedItems) {
        try {
          setDiscoveredItems(JSON.parse(savedItems));
        } catch (e) {
            console.error("Failed to parse discovered items from localStorage", e);
            localStorage.removeItem('discoveredContentItems');
        }
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('discoveredContentItems', JSON.stringify(discoveredItems));
    }
  }, [discoveredItems]);


  const handleAddUrl = () => {
    if (newUrl.trim() === '') {
      toast({ title: 'Error', description: 'URL cannot be empty.', variant: 'destructive' });
      return;
    }
    try {
      new URL(newUrl);
    } catch (_) {
      toast({ title: 'Error', description: 'Invalid URL format.', variant: 'destructive' });
      return;
    }

    const newItemId = uuidv4();
    setDiscoveredItems(prev => [
      { id: newItemId, sourceUrl: newUrl, title: '', summary: '', tags: [], status: 'new' },
      ...prev,
    ]);
    setNewUrl('');
    toast({ title: 'URL Added', description: 'New URL ready for processing.' });
  };

  const handleProcessContent = (articleId: string, articleUrl: string) => {
    setProcessingItemId(articleId);
    if (typeof window !== 'undefined') { (window as any).processingItemIdForButton = articleId; }
    setDiscoveredItems(prev => prev.map(item => item.id === articleId ? { ...item, status: 'processing', progressMessage: 'Initiating content processing...' } : item));

    startTransition(async () => {
      const result = await processDiscoveredContent(articleId, articleUrl, currentTopic);
      if (result.processedContent) {
        setDiscoveredItems(prev => prev.map(item => item.id === articleId ? { ...result.processedContent! } : item));
        toast({
          title: result.processedContent.status === 'processed' ? 'Success' : 'Processing Issue',
          description: result.message || (result.processedContent.status === 'processed' ? 'Content processed.' : 'An issue occurred.'),
          variant: result.processedContent.status === 'error' ? 'destructive' : 'default',
        });
      } else {
        setDiscoveredItems(prev => prev.map(item => item.id === articleId ? { ...item, status: 'error', errorMessage: result.error, progressMessage: 'Processing failed catastrophically.' } : item));
        toast({ title: 'Error Processing', description: result.error, variant: 'destructive' });
      }
      setProcessingItemId(null);
      if (typeof window !== 'undefined') { (window as any).processingItemIdForButton = null; }
    });
  };

  const handleSendToLine = (content: ProcessedContent) => {
    if (!currentLineUserId) {
      toast({
        title: 'LINE User ID Missing',
        description: 'Please set your LINE User ID in the Settings page before sending content.',
        variant: 'destructive',
      });
      return;
    }
    startTransition(async () => {
      const result = await sendToLineAction(content, currentLineUserId);
      if (result.success) {
        setDiscoveredItems(prev => prev.map(item => item.id === content.id ? {...item, status: 'sentToLine'} : item));
        toast({ title: 'Sent to LINE', description: result.message });
      } else {
        toast({ title: 'LINE Error', description: result.message, variant: 'destructive' });
      }
    });
  };

  const handlePublishToGithub = (content: ProcessedContent) => {
    if (!currentGithubRepoUrl) {
      toast({
        title: 'GitHub Repo URL Missing',
        description: 'Please set your GitHub Repository URL in the Settings page before publishing.',
        variant: 'destructive',
      });
      return;
    }
    startTransition(async () => {
      const result = await publishToGithubAction(content, currentGithubRepoUrl);
      if (result.success) {
        setDiscoveredItems(prev => prev.map(item => item.id === content.id ? {...item, status: 'publishedToGithub', progressMessage: result.message } : item));
        toast({ title: 'Published to GitHub (Simulated)', description: result.message });
      } else {
        toast({ title: 'GitHub Publish Error', description: result.message, variant: 'destructive' });
      }
    });
  };


  const handleDismissItem = (articleId: string) => {
    setDiscoveredItems(prev => prev.filter(item => item.id !== articleId));
    toast({ title: 'Item Dismissed', description: 'The content item has been removed.'});
  };


  return (
    <Card className="shadow-lg mt-8">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Content Monitoring & Processing
        </CardTitle>
        <CardDescription>
          Add URLs of discovered content or connect to a monitoring agent (feature pending). Then, process them to generate summaries and tags. Current topic for processing: <span className="font-semibold text-primary">{currentTopic}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-2 items-end">
          <div className="flex-grow">
            <Label htmlFor="new-url">Add New URL to Process</Label>
            <Input
              id="new-url"
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="mt-1 text-base"
            />
          </div>
          <Button onClick={handleAddUrl} className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add URL
          </Button>
        </div>

        {discoveredItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="mx-auto h-12 w-12 mb-2" />
            <p className="font-semibold">No content items yet.</p>
            <p>Add URLs manually above or wait for the monitoring agent (simulated).</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-headline font-medium">Items to Process ({discoveredItems.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discoveredItems.map((item) => (
                <ContentCard
                  key={item.id}
                  content={item}
                  onProcess={handleProcessContent}
                  onSendToLine={handleSendToLine}
                  onPublishToGithub={handlePublishToGithub}
                  onDismiss={handleDismissItem}
                  isProcessing={processingItemId === item.id || isPending}
                  defaultTopic={currentTopic}
                />
              ))}
            </div>
          </div>
        )}
        <Card className="bg-accent/20 border-accent/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2 text-accent-foreground/80">
              <Info className="h-5 w-5" />
              Note on Content Monitoring Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-accent-foreground/70">
              The actual content monitoring agent is a backend process. This UI section allows manual URL input for now.
              In a full implementation, discovered content would automatically appear here.
              The default topic for processing is currently set to "{currentTopic}". This can be configured in Settings.
            </p>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
