export function ownerEmails(value = process.env.OWNER_EMAILS ?? ""): string[] {
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined, configured = process.env.OWNER_EMAILS ?? ""): boolean {
  return Boolean(email && ownerEmails(configured).includes(email.trim().toLowerCase()));
}

export function isGoogleOAuthSession(authMethods: readonly string[], identityProviders: readonly string[]): boolean {
  return authMethods.includes("oauth") && identityProviders.includes("google");
}
