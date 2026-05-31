import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorBody {
  status: number;
  code: string;
  message: string;
}

/** Maps an HTTP status to a default machine-readable error code. */
const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

/**
 * Single source of truth for the API error shape:
 *   { "status": 400, "code": "VALIDATION_ERROR", "message": "..." }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toErrorBody(exception);

    if (body.status >= 500) {
      this.logger.error(
        `${body.code}: ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(body.status).json(body);
  }

  private toErrorBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      // class-validator errors arrive as { message: string[], error, statusCode }
      if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, any>;
        const rawMessage = r.message;
        const isValidation = Array.isArray(rawMessage);
        return {
          status,
          code:
            r.code ??
            (isValidation
              ? 'VALIDATION_ERROR'
              : STATUS_CODE_MAP[status] ?? 'ERROR'),
          message: isValidation
            ? rawMessage[0]
            : r.message ?? exception.message,
        };
      }

      return {
        status,
        code: STATUS_CODE_MAP[status] ?? 'ERROR',
        message: typeof res === 'string' ? res : exception.message,
      };
    }

    // Prisma known errors → friendly codes
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          status: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT',
          message: 'A record with this value already exists',
        };
      }
      if (exception.code === 'P2025') {
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: 'The requested record was not found',
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }
}
