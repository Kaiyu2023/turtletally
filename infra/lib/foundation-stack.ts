import { Stack, type StackProps, Validations } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export class FoundationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    Validations.of(this).acknowledge({
      id: 'CloudFormation-Validate::F0001',
      reason: 'Milestone 0 intentionally proves synthesis without creating AWS resources.',
    });
  }
}
