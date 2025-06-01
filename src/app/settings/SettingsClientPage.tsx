
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveSettings, type SettingsFormState } from '@/lib/actions';
import type { AppSettings } from '@/lib/definitions';
import { Loader2, Save, Bot, MessageSquare, Github, Info } from 'lucide-react';
import React, { useEffect, useState } // Removed useMemo as it wasn't used after all
from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  const [state, formAction] = useActionState(saveSettings, initialSettingsState);
  const [currentSettings, saveSettingsToLocalStorage, isLoadingSettings] = useAppSettings();
  const { toast } = useToast();

  // Local state to manage form input values, initialized from currentSettings
  // This is necessary because defaultValue in Input doesn't re-render on prop change
  const [formValues, setFormValues] = useState<Partial<AppSettings>>({});

  useEffect(() => {
    if (!isLoadingSettings) {
      setFormValues(currentSettings);
    }
  }, [currentSettings, isLoadingSettings]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };


  useEffect(() => {
    if (state?.message) {
      if (state.errors && Object.keys(state.errors).length > 0) {
        toast({ title: "Validation Error", description: state.message, variant: "destructive" });
      } else if (state.settings) {
         toast({ title: "Settings Updated", description: state.message });
         saveSettingsToLocalStorage(state.settings); // Update settings via the hook
      } else {
        // This case might occur if the action returns a message but no settings or errors
        // For example, an informational message from the server action
        toast({ title: "Info", description: state.message });
      }
    }
  }, [state, toast, saveSettingsToLocalStorage]);

  const userPreferenceFields: { id: keyof AppSettings; label: string; type: string; placeholder: string; icon: React.ElementType }[] = [
    { id: 'defaultTopic', label: 'Default Curation Topic', type: 'text', placeholder: 'e.g., Python Programming', icon: Bot },
    { id: 'lineUserId', label: 'LINE User ID (for notifications)', type: 'text', placeholder: 'Uxxxxxxxxxxxx', icon: MessageSquare },
    { id: 'githubRepoUrl', label: 'GitHub Repository URL (for publishing)', type: 'url', placeholder: 'https://github.com/user/repo.git', icon: Github },
  ];
  
  if (isLoadingSettings) {
    return (
      <Card className="shadow-lg max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="font-headline">Application Settings</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="font-headline">Application Settings</CardTitle>
        <CardDescription>
          Configure your user preferences. These settings are saved in your browser's local storage.
          Sensitive API keys for backend services (like Google AI, LINE, GitHub) must be configured as environment variables on the server.
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>API Key Configuration</AlertTitle>
            <AlertDescription>
              For the application to function correctly with AI features and integrations, ensure the following server-side environment variables are set:
              <ul className="list-disc list-inside mt-1 text-xs">
                <li><code className="font-mono bg-muted px-1 py-0.5 rounded">GOOGLE_API_KEY</code>: For Google AI (Gemini) features.</li>
                <li><code className="font-mono bg-muted px-1 py-0.5 rounded">LINE_CHANNEL_ACCESS_TOKEN</code>: For LINE integration.</li>
                <li><code className="font-mono bg-muted px-1 py-0.5 rounded">GITHUB_PAT</code>: For publishing to GitHub.</li>
              </ul>
              These keys are not managed through this UI for security reasons.
            </AlertDescription>
          </Alert>

          {userPreferenceFields.map(field => (
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
                value={formValues[field.id] || ''}
                onChange={handleInputChange}
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
          {state?.message && (!state.errors || Object.keys(state.errors).length === 0) && !state.settings && (
             // Display server message if it's not a validation error and not a settings update confirmation (already handled by toast)
             <p className="text-sm text-muted-foreground">{state.message}</p>
          )}
          <div className="ml-auto">
             <SubmitButton />
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
