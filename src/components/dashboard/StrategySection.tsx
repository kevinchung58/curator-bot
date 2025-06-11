
'use client';

import { useActionState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { submitStrategyForm, type StrategyFormState } from '@/lib/actions';
import { StrategyFormSchema } from '@/lib/definitions'; 
import { Lightbulb, Loader2, ListChecks, Share2, Newspaper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const initialState: StrategyFormState = {
  message: null,
  errors: {},
  strategy: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-2 h-4 w-4" />}
      Formulate Strategy
    </Button>
  );
}

export function StrategySection() {
  const [state, formAction] = useActionState(submitStrategyForm, initialState);
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof StrategyFormSchema>>({
    resolver: zodResolver(StrategyFormSchema),
    defaultValues: {
      curriculum: '',
    },
  });

  function onValidSubmit(data: z.infer<typeof StrategyFormSchema>) {
    const formData = new FormData();
    formData.append('curriculum', data.curriculum);
    startTransition(() => {
      formAction(formData);
    });
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-primary" />
          Search Strategy Formulation
        </CardTitle>
        <CardDescription>
          Input your teaching curriculum or key topics, and the AI will suggest search keywords, target websites, and content types to monitor.
        </CardDescription>
      </CardHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onValidSubmit)} className="space-y-0"> {/* Removed space-y-4, CardContent will handle it */}
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="curriculum"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor={field.name} className="text-base">Teaching Curriculum / Topics</FormLabel>
                  <FormControl>
                    <Textarea
                      id={field.name}
                      placeholder="e.g., Introduction to Python programming, data structures, algorithms, web development basics..."
                      rows={6}
                      className="mt-1 text-base"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            {state?.message && (
              <p className={`text-sm ${state.strategy && (!state.errors || Object.keys(state.errors).length === 0) ? 'text-green-600' : 'text-destructive'}`}>
                {state.message}
              </p>
            )}
            <div className="ml-auto">
              <SubmitButton />
            </div>
          </CardFooter>
        </form>
      </Form>

      {state?.strategy && (
        <>
          <Separator className="my-6" />
          <CardContent className="space-y-6">
            <h3 className="text-xl font-headline font-semibold text-foreground">Generated Strategy</h3>
            
            <div>
              <h4 className="text-lg font-medium flex items-center gap-2 mb-2">
                <ListChecks className="h-5 w-5 text-accent" />
                Keywords
              </h4>
              <div className="flex flex-wrap gap-2">
                {state.strategy.keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="text-sm px-3 py-1">{keyword}</Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-lg font-medium flex items-center gap-2 mb-2">
                <Share2 className="h-5 w-5 text-accent" />
                Target Sites
              </h4>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                {state.strategy.targetSites.map((site) => (
                  <li key={site} className="text-sm">{site}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-lg font-medium flex items-center gap-2 mb-2">
                <Newspaper className="h-5 w-5 text-accent" />
                Content Types to Monitor
              </h4>
              <div className="flex flex-wrap gap-2">
                {state.strategy.contentTypesToMonitor.map((type) => (
                  <Badge key={type} variant="outline" className="text-sm px-3 py-1">{type}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}

