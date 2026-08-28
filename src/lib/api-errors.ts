/**
 * document-chat
 * Copyright (C) 2026 Famanias
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
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
