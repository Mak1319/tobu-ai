"use client";

import * as React from 'react';

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  LockIcon,
  ShieldIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function TokenReset() {
  const [step, setStep] = React.useState<'token' | 'password' | 'complete'>(
    'token'
  );
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    React.useState(false);

  function onSubmitToken(e: React.FormEvent) {
    e.preventDefault();
    setStep('password');
  }

  function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setStep('complete');
  }

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  const toggleConfirmPasswordVisibility = () => {
    setIsConfirmPasswordVisible(!isConfirmPasswordVisible);
  };

  return (
    <div className="container mx-auto px-4 py-12 md:px-6 md:py-16">
      <Card className="mx-auto max-w-md">
        <CardHeader className="space-y-1">
          {step === 'token' && (
            <>
              <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <KeyIcon className="text-primary h-6 w-6" />
              </div>
              <CardTitle className="text-center text-2xl">
                Verify Reset Code
              </CardTitle>
              <CardDescription className="text-center">
                Enter the reset code from your email to continue
              </CardDescription>
            </>
          )}

          {step === 'password' && (
            <>
              <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <LockIcon className="text-primary h-6 w-6" />
              </div>
              <CardTitle className="text-center text-2xl">
                Create New Password
              </CardTitle>
              <CardDescription className="text-center">
                Set a new secure password for your account
              </CardDescription>
            </>
          )}

          {step === 'complete' && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2Icon className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-center text-2xl">
                Password Updated
              </CardTitle>
              <CardDescription className="text-center">
                Your password has been reset successfully
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent>
          {/* Step indicators */}
          <div className="mb-6 flex items-center justify-center">
            <div className="flex w-2/3 items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${step !== 'token' ? 'bg-primary text-primary-foreground' : 'border-input bg-background border'}`}
              >
                1
              </div>
              <div
                className={`h-1 flex-1 ${step !== 'token' ? 'bg-primary' : 'bg-muted'}`}
              ></div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${step === 'complete' ? 'bg-primary text-primary-foreground' : 'border-input bg-background border'}`}
              >
                2
              </div>
              <div
                className={`h-1 flex-1 ${step === 'complete' ? 'bg-primary' : 'bg-muted'}`}
              ></div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${step === 'complete' ? 'bg-primary text-primary-foreground' : 'border-input bg-background border'}`}
              >
                3
              </div>
            </div>
          </div>

          {step === 'token' && (
            <form onSubmit={onSubmitToken} className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="token">Reset Code</FieldLabel>
                  <Input
                    id="token"
                    placeholder="Enter reset code"
                    className="text-center text-lg tracking-widest"
                  />
                  <FieldDescription>
                    Check your email for a 6-8 character code we sent you
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <Button type="submit" className="w-full">
                Verify Code <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={onSubmitPassword} className="space-y-4">
              <Alert className="mb-4 bg-blue-50 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                <ShieldIcon className="h-4 w-4" />
                <AlertDescription>
                  Your identity has been verified. Now create a new secure
                  password.
                </AlertDescription>
              </Alert>

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="password">New Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="password"
                      placeholder="••••••••"
                      type={isPasswordVisible ? 'text' : 'password'}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent dark:hover:bg-transparent"
                      onClick={togglePasswordVisibility}
                    >
                      {isPasswordVisible ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                      <span className="sr-only">
                        Toggle password visibility
                      </span>
                    </Button>
                  </div>
                  <FieldDescription>
                    Must have at least 8 characters with uppercase,
                    lowercase, and number
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirm Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      placeholder="••••••••"
                      type={isConfirmPasswordVisible ? 'text' : 'password'}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent dark:hover:bg-transparent"
                      onClick={toggleConfirmPasswordVisibility}
                    >
                      {isConfirmPasswordVisible ? (
                        <EyeOffIcon className="h-4 w-4" />
                      ) : (
                        <EyeIcon className="h-4 w-4" />
                      )}
                      <span className="sr-only">
                        Toggle confirm password visibility
                      </span>
                    </Button>
                  </div>
                </Field>
              </FieldGroup>

              <Button type="submit" className="w-full">
                Reset Password
              </Button>
            </form>
          )}

          {step === 'complete' && (
            <div className="space-y-4 text-center">
              <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900">
                <p className="text-green-800 dark:text-green-300">
                  Your password has been successfully reset. Your account is now
                  secure.
                </p>
              </div>
              <Button className="w-full" render={<a href="#" />} nativeButton={false}>Sign in with new password</Button>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-center">
          {step !== 'complete' && (
            <p className="text-muted-foreground text-sm">
              Remember your password?{' '}
              <a href="#" className="text-primary underline">
                Sign in
              </a>
            </p>
          )}

          {step === 'complete' && (
            <p className="text-muted-foreground text-sm">
              Need help?{' '}
              <a href="#" className="text-primary underline">
                Contact support
              </a>
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
