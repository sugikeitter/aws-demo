#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkSharedvpcWithAlbecsAndVpnvpcStack } from '../lib/cdk-sharedvpc-with-albecs-and-vpnvpc-stack';

const app = new cdk.App();
new CdkSharedvpcWithAlbecsAndVpnvpcStack(app, 'CdkSharedVpcAndVpnVpc', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION }
});