import { z } from "zod";
import { CAMPUS, MAX_ITEM_IMAGES, MAX_LOAN_DAYS, MIN_LOAN_DAYS } from "./constants";
import { isValidDateString } from "./dates";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const dateStringSchema = z
  .string()
  .regex(DATE_REGEX, "Use YYYY-MM-DD")
  .refine(isValidDateString, "Not a real calendar date");

export const dateRangeSchema = z
  .object({
    start_date: dateStringSchema,
    end_date: dateStringSchema,
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: "End date must be on or after the start date",
    path: ["end_date"],
  });

/* --------------------------------- auth ---------------------------------- */

export const emailSchema = z.email("Enter a valid email address");

/** All auth is restricted to Bennett University accounts. */
export const bennettEmailSchema = emailSchema
  .transform((value) => value.trim().toLowerCase())
  .refine(
    (value) => value.endsWith(`@${CAMPUS.emailDomain}`),
    `Use your Bennett email — it ends with @${CAMPUS.emailDomain}`,
  );

/** Mirrors the Supabase letters_digits policy (min length 8). */
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

export const signInSchema = z.object({
  email: bennettEmailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z
  .object({
    email: bennettEmailSchema,
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((value) => value.password === value.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  });

export const profileSetupSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name").max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number")
    .optional()
    .or(z.literal("")),
  department: z.string().trim().min(2, "Select your department").max(80),
  year_of_study: z.number().int().min(1).max(6),
});

export const verificationDecisionSchema = z.object({
  profile_id: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

/* --------------------------------- items --------------------------------- */

export const itemSchema = z.object({
  title: z.string().trim().min(3, "Give your item a title").max(100),
  description: z.string().trim().min(10, "Describe the item and its condition").max(2000),
  category_id: z.uuid("Choose a category"),
  condition: z.enum(["new", "good", "fair", "worn"]),
  deposit_amount: z.number().int().min(0).max(100000),
  max_loan_days: z.number().int().min(MIN_LOAN_DAYS).max(MAX_LOAN_DAYS),
  pickup_location_id: z.uuid("Choose a pickup spot").nullable(),
  image_paths: z
    .array(z.string())
    .min(1, "Add at least one photo")
    .max(MAX_ITEM_IMAGES, `Up to ${MAX_ITEM_IMAGES} photos`),
});

export const availabilityBlockSchema = z
  .object({
    item_id: z.uuid(),
    reason: z.enum(["manual", "maintenance"]),
    note: z.string().trim().max(200).optional(),
  })
  .and(dateRangeSchema);

/* -------------------------------- requests -------------------------------- */

export const borrowRequestSchema = z
  .object({
    item_id: z.uuid(),
    message: z.string().trim().max(500).optional(),
  })
  .and(dateRangeSchema);

export const requestResponseSchema = z.discriminatedUnion("action", [
  z.object({ request_id: z.uuid(), action: z.literal("approve") }),
  z.object({
    request_id: z.uuid(),
    action: z.literal("decline"),
    decline_reason: z.string().trim().max(300).optional(),
  }),
]);

export const waitlistJoinSchema = z
  .object({
    item_id: z.uuid(),
  })
  .and(dateRangeSchema);

/* --------------------------------- loans ---------------------------------- */

export const handoverTokenSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

export const handoverConfirmSchema = z.object({
  loan_id: z.uuid(),
  token: handoverTokenSchema,
  kind: z.enum(["pickup", "return"]),
});

export const incidentSchema = z.object({
  loan_id: z.uuid(),
  type: z.enum(["damage", "lost", "late", "no_show", "other"]),
  description: z.string().trim().min(10, "Describe what happened").max(2000),
  photo_paths: z.array(z.string()).max(6).default([]),
});

export const incidentResolveSchema = z.object({
  incident_id: z.uuid(),
  decision: z.enum(["resolved", "rejected"]),
  resolution_note: z.string().trim().min(5).max(2000),
  fine_amount: z.number().int().min(0).max(100000).optional(),
  fine_user_id: z.uuid().optional(),
});

/* --------------------------------- reviews --------------------------------- */

export const reviewSchema = z.object({
  loan_id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

/* ---------------------------------- chat ----------------------------------- */

export const messageSchema = z
  .object({
    conversation_id: z.uuid(),
    body: z.string().trim().max(2000),
    image_path: z.string().nullable().optional(),
  })
  .refine((v) => v.body.length > 0 || Boolean(v.image_path), {
    message: "Write a message or attach a photo",
    path: ["body"],
  });

/* -------------------------------- moderation ------------------------------- */

export const reportSchema = z.object({
  target: z.enum(["item", "user", "message"]),
  target_id: z.uuid(),
  reason: z.string().trim().min(5, "Tell us what's wrong").max(1000),
});

export const fineActionSchema = z.object({
  fine_id: z.uuid(),
  action: z.enum(["settle", "waive"]),
});

/* ---------------------------------- types ---------------------------------- */

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ProfileSetupInput = z.infer<typeof profileSetupSchema>;
export type VerificationDecisionInput = z.infer<typeof verificationDecisionSchema>;
export type ItemInput = z.infer<typeof itemSchema>;
export type AvailabilityBlockInput = z.infer<typeof availabilityBlockSchema>;
export type BorrowRequestInput = z.infer<typeof borrowRequestSchema>;
export type RequestResponseInput = z.infer<typeof requestResponseSchema>;
export type WaitlistJoinInput = z.infer<typeof waitlistJoinSchema>;
export type HandoverConfirmInput = z.infer<typeof handoverConfirmSchema>;
export type IncidentInput = z.infer<typeof incidentSchema>;
export type IncidentResolveInput = z.infer<typeof incidentResolveSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
export type FineActionInput = z.infer<typeof fineActionSchema>;
