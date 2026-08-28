export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly userMessage: string,
    options?: ErrorOptions & { responseHeaders?: HeadersInit },
  ) {
    super(userMessage, options);
    this.name = "AppError";
    this.responseHeaders = options?.responseHeaders;
  }

  public readonly responseHeaders: HeadersInit | undefined;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.userMessage },
      { status: error.status, headers: error.responseHeaders },
    );
  }

  console.error(error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
