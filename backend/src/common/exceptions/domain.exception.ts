import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for domain errors that carry a machine-readable `code`.
 * The GlobalExceptionFilter surfaces this code in the response body.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message }, status);
  }
}

/** Raised when a task status transition violates the state machine. */
export class InvalidStatusTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super(
      'INVALID_STATUS_TRANSITION',
      `Cannot transition task from ${from} to ${to}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
