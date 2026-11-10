export function getDatabaseUnavailableMessage(error?: unknown): string {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const code = String(value.errorCode ?? value.code ?? '');

  if (code === 'P1000') {
    return 'MongoDB Atlas rejected the database credentials. Check the username and password in DATABASE_URL.';
  }

  if (code === 'P1001') {
    return 'Cannot reach MongoDB Atlas. Check your internet connection, Atlas network access list, and cluster status.';
  }

  if (code === 'P1013') {
    return 'DATABASE_URL is malformed. Check the MongoDB connection string and URL-encode special characters in the password.';
  }

  if (!process.env.DATABASE_URL?.trim()) {
    return 'DATABASE_URL is not configured. Add your MongoDB Atlas connection string to the project-root .env.local or .env file, then restart the development server.';
  }

  return 'The database request failed. Check the server terminal for the detailed error and verify your MongoDB Atlas connection.';
}

export function logDatabaseFailure(context: string, error: unknown): void {
  // Never log DATABASE_URL or any credential-bearing environment variables.
  console.error(`[TrustFlow][${context}] Database/session operation failed:`, error);
}
