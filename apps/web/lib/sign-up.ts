import { z } from "zod";

export const signUpSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(100, "Your name must be 100 characters or fewer."),
    email: z.string().trim().toLowerCase().email("Enter a valid work email."),
    password: z
      .string()
      .min(10, "Use at least 10 characters for your password.")
      .max(128, "Your password must be 128 characters or fewer."),
    confirmPassword: z.string(),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

export function parseSignUpForm(form: FormData): SignUpInput {
  return signUpSchema.parse({
    fullName: String(form.get("fullName") ?? ""),
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    confirmPassword: String(form.get("confirmPassword") ?? ""),
  });
}

export function signUpErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Check your account details and try again.";
  }
  return "We couldn’t create your account. Try again or sign in if you already registered.";
}
