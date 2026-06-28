import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { PolicyService } from './policy.service';
import { UpdatePolicyDto, Policy } from './policy.interface';
import { AdminApiKeyGuard } from '../security/admin-api-key.guard';

@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  @Get('policy')
  getPolicy(): Policy {
    return this.policyService.getPolicy();
  }

  @Post('policy')
  async updatePolicy(@Body() newPolicy: UpdatePolicyDto = {}) {
    const updatedPolicy = await this.policyService.updatePolicy(newPolicy);
    return {
      message: 'Policy successfully updated and broadcasted!',
      policy: updatedPolicy,
    };
  }

}
