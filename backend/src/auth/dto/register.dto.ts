import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'admin@acme.test' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  password: string;

  @ApiProperty({ example: 'Alice Admin' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    example: 'Acme Inc',
    description: 'Creates a new organization; the registrant becomes its ADMIN.',
  })
  @IsString()
  @MinLength(1)
  organizationName: string;
}
