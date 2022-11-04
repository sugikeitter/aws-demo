#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkMultiVpcsStack } from '../lib/cdk-sharedvpc-and-vpnvpc-stack';

const app = new cdk.App();
new CdkMultiVpcsStack(app, 'CdkMultiVpcsStack', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION || "ap-northeast-1" }
});