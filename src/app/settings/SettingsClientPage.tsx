'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveSettings, type SettingsFormState } from '@/lib/actions';
import type { AppSettings } from '@/lib/definitions';
import { Loader2, Save, KeyRound, Bot, MessageSquare, Github } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

const initialSettingsState: SettingsFormState = {
  message: null,
  errors: {},
  settings: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
      Save Settings
    </Button>
  );
}

export function SettingsClientPage() {
  const [state, formAction] = useFormState(saveSettings, initialSettingsState);
  const [currentSettings, setCurrentSettings] = useState<Partial<AppSettings>>({});
  const { toast } = useToast();

  useEffect(() => {
    // Load settings from localStorage on component mount
    if (typeof window !== 'undefined') {
      const storedSettings = localStorage.getItem('contentCuratorAppSettings');
      if (storedSettings) {
        setCurrentSettings(JSON.parse(storedSettings));
      }
    }
  }, []);

  useEffect(() => {
    if (state?.message) {
      if (state.errors && Object.keys(state.errors).length > 0) {
        toast({ title: "Validation Error", description: state.message, variant: "destructive" });
      } else if (state.settings) {
         toast({ title: "Settings Updated", description: state.message });
         // Save to localStorage
         if (typeof window !== 'undefined') {
           localStorage.setItem('contentCuratorAppSettings', JSON.stringify(state.settings));
           setCurrentSettings(state.settings); // Update local state for display
         }
      } else {
        toast({ title: "Info", description: state.message });
      }
    }
  }, [state, toast]);


  const inputFields: { id: keyof AppSettings; label: string; type: string; placeholder: string; icon: React.ElementType }[] = [
    { id: 'openRouterApiKey', label: 'OpenRouter API Key', type: 'password', placeholder: 'sk-or-xxxxxxxx', icon: KeyRound },
    { id: 'googleApiKey', label: 'Google AI API Key (Gemini)', type: 'password', placeholder: 'AIzaSyxxxxxxxx', icon: Bot },
    { id: 'defaultTopic', label: 'Default Curation Topic', type: 'text', placeholder: 'e.g., Python Programming', icon: Bot },
    { id: 'lineChannelAccessToken', label: 'LINE Channel Access Token', type: 'password', placeholder: 'LINE Token', icon: MessageSquare },
    { id: 'lineChannelSecret', label: 'LINE Channel Secret', type: 'password', placeholder: 'LINE Secret', icon: MessageSquare },
    { id: 'lineUserId', label: 'LINE User ID (for notifications)', type: 'text', placeholder: 'Uxxxxxxxxxxxx', icon: MessageSquare },
    { id: 'githubPat', label: 'GitHub Personal Access Token', type: 'password', placeholder: 'ghp_xxxxxxxx', icon: Github },
    { id: 'githubRepoUrl', label: 'GitHub Repository URL', type: 'url', placeholder: 'https://github.com/user/repo.git', icon: Github },
  ];

  return (
    <Card className="shadow-lg max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="font-headline">Application Settings</CardTitle>
        <CardDescription>
          Configure API keys and other settings for the Content Curator Bot. Settings are saved in your browser's local storage.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-6">
          {inputFields.map(field => (
            <div key={field.id}>
              <Label htmlFor={field.id} className="text-base flex items-center gap-2">
                <field.icon className="h-4 w-4 text-muted-foreground" />
                {field.label}
              </Label>
              <Input
                id={field.id}
                name={field.id}
                type={field.type}
                placeholder={field.placeholder}
                defaultValue={currentSettings[field.id] || ''}
                className="mt-1 text-base"
                aria-describedby={`${field.id}-error`}
              />
              {state?.errors?.[field.id] && (
                <p id={`${field.id}-error`} className="mt-1 text-sm text-destructive">
                  {state.errors[field.id]?.join(', ')}
                </p>
              )}
            </div>
          ))}
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:items-center">
          {state?.message && (!state.errors || Object.keys(state.errors).length === 0) && (
             <p className="text-sm text-green-600">{state.message}</p>
          )}
          <div className="ml-auto">
             <SubmitButton />
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
