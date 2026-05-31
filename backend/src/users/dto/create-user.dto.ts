import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'newuser@acme.test' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  password: string;

  @ApiProperty({ example: 'New User' })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ enum: Role, example: Role.MEMBER })
  @IsEnum(Role)
  role: Role;
}
