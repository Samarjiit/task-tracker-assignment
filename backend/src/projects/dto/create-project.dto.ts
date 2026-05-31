import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Website Revamp' })
  @IsString()
  @MinLength(1, { message: 'name is required' })
  name: string;

  @ApiPropertyOptional({ example: 'Q3 marketing site rebuild' })
  @IsOptional()
  @IsString()
  description?: string;
}
