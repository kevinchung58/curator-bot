
'use client'; 

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: 'An unknown error occurred.',
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, errorMessage: error.message || 'An unexpected error occurred.' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error in ErrorBoundary:", error, errorInfo);
  }

  private handleResetError = () => {
    this.setState({ hasError: false, errorMessage: '' });
    // Optionally, you could try to trigger a re-render of children or navigate,
    // but for simplicity, we'll just reset the boundary's state.
    // A full page refresh might be more robust, which user can do manually.
  }

  public render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive" className="my-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Oops! Something Went Wrong</AlertTitle>
          <AlertDescription>
            <p>{this.props.fallbackMessage || 'An unexpected error occurred in this part of the application.'}</p>
            <p className="mt-2 text-xs font-mono bg-red-100 dark:bg-red-900 p-2 rounded">
              Error: {this.state.errorMessage}
            </p>
            <p className="mt-2 text-xs">
              You can try to <Button variant="link" className="p-0 h-auto text-xs text-destructive underline" onClick={() => window.location.reload()}>refresh the page</Button>.
              If the problem persists, please contact support.
            </p>
            {/* 
            // Optional: A button to attempt to reset the error boundary state. 
            // This is less common and might not always recover the underlying issue.
            <Button variant="outline" size="sm" onClick={this.handleResetError} className="mt-3">
              Try to recover
            </Button> 
            */}
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
