'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { processDiscoveredContent, sendToLineAction } from '@/lib/actions';
import type { ProcessedContent, AppSettings } from '@/lib/definitions';
import { ContentCard } from './ContentCard';
import { PlusCircle, Search, Bot, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

// Mock function to simulate fetching settings. In a real app, this would come from a store or API.
async function getAppSettings(): Promise<Partial<AppSettings>> {
  // Simulate API call
  return new Promise(resolve => {
    setTimeout(() => {
      // Try to load from localStorage, or use defaults
      if (typeof window !== 'undefined') {
        const storedSettings = localStorage.getItem('contentCuratorAppSettings');
        if (storedSettings) {
          resolve(JSON.parse(storedSettings));
          return;
        }
      }
      resolve({ defaultTopic: 'General AI' }); 
    }, 100);
  });
}


export function DiscoveredContentSection() {
  const [discoveredItems, setDiscoveredItems] = useState<ProcessedContent[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [currentTopic, setCurrentTopic] = useState('General Tech');
  const [processingItemId, setProcessingItemId] = useState<string | null>(null);
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Load settings, specifically defaultTopic
    getAppSettings().then(settings => {
      if (settings.defaultTopic) {
        setCurrentTopic(settings.defaultTopic);
      }
    });
    // Load items from localStorage
    if (typeof window !== 'undefined') {
      const savedItems = localStorage.getItem('discoveredContentItems');
      if (savedItems) {
        setDiscoveredItems(JSON.parse(savedItems));
      }
    }
  }, []);

  useEffect(() => {
    // Save items to localStorage whenever they change
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
      // Basic URL validation
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
    setDiscoveredItems(prev => prev.map(item => item.id === articleId ? { ...item, status: 'processing' } : item));

    startTransition(async () => {
      const result = await processDiscoveredContent(articleId, articleUrl, currentTopic);
      if (result.processedContent) {
        setDiscoveredItems(prev => prev.map(item => item.id === articleId ? { ...result.processedContent!, status: 'processed' } : item));
        toast({ title: 'Success', description: result.message });
      } else {
        setDiscoveredItems(prev => prev.map(item => item.id === articleId ? { ...item, status: 'error', errorMessage: result.error } : item));
        toast({ title: 'Error Processing', description: result.error, variant: 'destructive' });
      }
      setProcessingItemId(null);
    });
  };
  
  const handleSendToLine = (content: ProcessedContent) => {
    startTransition(async () => {
      // Simulate sending to LINE
      const result = await sendToLineAction(content);
      setDiscoveredItems(prev => prev.map(item => item.id === content.id ? {...item, status: 'sentToLine'} : item));
      toast({ title: 'Sent to LINE', description: result.message });
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
