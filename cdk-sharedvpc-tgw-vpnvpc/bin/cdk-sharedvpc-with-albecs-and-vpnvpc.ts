#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkMultiVpcsStack } from '../lib/cdk-sharedvpc-and-vpnvpc-stack';
import { RdsPostgresStack } from '../lib/rds-postgres-stack';

const app = new cdk.App();
const multiVpcsStack = new CdkMultiVpcsStack(app, 'CdkMultiVpcsStack', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION || "ap-northeast-1" }
});

// TODO ALB も別 Stack

const dbInstance = new RdsPostgresStack(app, 'CdkRds', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION || "ap-northeast-1" },
  vpc: multiVpcsStack.sharedVpc,
});