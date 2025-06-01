
'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { processDiscoveredContent, sendToLineAction, publishToGithubAction } from '@/lib/actions';
import type { ProcessedContent, AppSettings } from '@/lib/definitions';
import { ContentCard } from './ContentCard';
import { PlusCircle, Search, Bot, AlertTriangle, Info, Github, CheckCircle2, XCircle, HelpCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppSettings } from '@/hooks/useAppSettings';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

export function DiscoveredContentSection() {
  const [discoveredItems, setDiscoveredItems] = useState<ProcessedContent[]>([]);
  const [newUrl, setNewUrl] = useState('');
  
  const [appSettings, _, isLoadingAppSettings] = useAppSettings();
  const [currentTopic, setCurrentTopic] = useState('General AI'); // Default fallback
  const [currentLineUserId, setCurrentLineUserId] = useState<string | undefined>(undefined);
  const [currentGithubRepoUrl, setCurrentGithubRepoUrl] = useState<string | undefined>(undefined);
  
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [publishingItemId, setPublishingItemId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const [isTransitionGlobalPending, startTransition] = useTransition();

  type AgentStatusValue = 'running' | 'degraded' | 'offline' | 'unknown';
  const [agentStatus, setAgentStatus] = useState<AgentStatusValue>('running'); // Start with running
  const [agentStatusMessage, setAgentStatusMessage] = useState('Agent is running smoothly (Simulated).');


  useEffect(() => {
    if (!isLoadingAppSettings) {
      setCurrentTopic(appSettings.defaultTopic || 'General AI');
      setCurrentLineUserId(appSettings.lineUserId);
      setCurrentGithubRepoUrl(appSettings.githubRepoUrl);
    }
  }, [appSettings, isLoadingAppSettings]);


  useEffect(() => {
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

    // Simulate agent status changes for demonstration
    const statuses: Array<{ status: AgentStatusValue, message: string }> = [
      { status: 'running', message: 'Agent is running smoothly (Simulated).' },
      { status: 'degraded', message: 'Agent experiencing some delays (Simulated).' },
      { status: 'offline', message: 'Agent is currently offline (Simulated).' },
    ];
    let currentIndex = 0; 
    setAgentStatus(statuses[currentIndex].status);
    setAgentStatusMessage(statuses[currentIndex].message);

    const intervalId = setInterval(() => {
      currentIndex = (currentIndex + 1) % statuses.length;
      setAgentStatus(statuses[currentIndex].status);
      setAgentStatusMessage(statuses[currentIndex].message);
    }, 15000); 

    return () => clearInterval(intervalId);
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
    setSendingItemId(content.id);
    startTransition(async () => {
      const result = await sendToLineAction(content, currentLineUserId);
      if (result.success) {
        setDiscoveredItems(prev => prev.map(item => item.id === content.id ? {...item, status: 'sentToLine'} : item));
        toast({ title: 'Sent to LINE', description: result.message });
      } else {
        toast({ title: 'LINE Error', description: result.message, variant: 'destructive' });
      }
      setSendingItemId(null);
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
    setPublishingItemId(content.id);
    startTransition(async () => {
      const result = await publishToGithubAction(content, currentGithubRepoUrl);
      if (result.success) {
        setDiscoveredItems(prev => prev.map(item => item.id === content.id ? {...item, status: 'publishedToGithub', progressMessage: result.message } : item));
        toast({ title: 'Published to GitHub', description: result.message });
      } else {
        toast({ title: 'GitHub Publish Error', description: result.message, variant: 'destructive' });
      }
      setPublishingItemId(null);
    });
  };


  const handleDismissItem = (articleId: string) => {
    setDiscoveredItems(prev => prev.filter(item => item.id !== articleId));
    toast({ title: 'Item Dismissed', description: 'The content item has been removed.'});
  };

  if (isLoadingAppSettings) {
     return (
      <Card className="shadow-lg mt-8">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            Content Monitoring & Processing
          </CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
        <CardContent>
           <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg mt-8">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Content Monitoring & Processing
        </CardTitle>
        <CardDescription>
          Add URLs of discovered content or connect to a monitoring agent (feature pending). Then, process them to generate summaries and tags. Current topic for processing: <span className="font-semibold text-primary">{currentTopic}</span>.
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            {agentStatus === 'running' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
            {agentStatus === 'degraded' && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
            {agentStatus === 'offline' && <XCircle className="h-4 w-4 text-red-600" />}
            {agentStatus === 'unknown' && <HelpCircle className="h-4 w-4 text-gray-500" />}
            <span>Agent Status: {agentStatusMessage}</span>
          </div>
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
          <Button onClick={handleAddUrl} className="w-full sm:w-auto" disabled={isTransitionGlobalPending}>
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
                  isProcessingThisCard={processingItemId === item.id}
                  isSendingThisCard={sendingItemId === item.id}
                  isPublishingThisCard={publishingItemId === item.id}
                  isTransitionGlobalPending={isTransitionGlobalPending}
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
