export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Autenticação necessária', code = 'UNAUTHORIZED') => new AppError(401, code, message);
export const forbidden = (message = 'Você não tem permissão para isso', code = 'FORBIDDEN') => new AppError(403, code, message);
export const notFound = (message = 'Não encontrado', code = 'NOT_FOUND') => new AppError(404, code, message);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);
export const tooMany = (message = 'Muitas tentativas. Aguarde e tente novamente.', code = 'RATE_LIMITED') => new AppError(429, code, message);
