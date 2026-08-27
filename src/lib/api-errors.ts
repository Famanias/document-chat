export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly userMessage: string,
    options?: ErrorOptions,
  ) {
    super(userMessage, options);
    this.name = "AppError";
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json({ error: error.userMessage }, { status: error.status });
  }

  console.error(error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
