import { deepStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';

import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { FoundationStack } from '../lib/foundation-stack.js';

void test('foundation scaffold creates no AWS resources', () => {
  const app = new App();
  const stack = new FoundationStack(app, 'TestFoundation');
  const template = Template.fromStack(stack).toJSON();

  deepStrictEqual(template.Resources ?? {}, {});
});
