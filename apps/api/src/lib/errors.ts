export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export const notFound = (resource: string) => new AppError(`${resource} was not found`, 404, 'NOT_FOUND');
