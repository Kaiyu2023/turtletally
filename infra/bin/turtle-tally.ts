#!/usr/bin/env node
import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import { FoundationStack } from '../lib/foundation-stack.js';

const app = new App();

new FoundationStack(app, 'TurtleTallyFoundation');
Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));

app.synth();
