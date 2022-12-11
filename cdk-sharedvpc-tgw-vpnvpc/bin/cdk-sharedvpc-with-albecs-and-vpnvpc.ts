#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkMultiVpcsStack } from '../lib/cdk-sharedvpc-and-vpnvpc-stack';
import { RdsPostgresStack } from '../lib/rds-postgres-stack';
import { SharedVpcAlbStack } from '../lib/shared-vpc-alb-stack';

const app = new cdk.App();
const multiVpcsStack = new CdkMultiVpcsStack(app, 'CdkMultiVpcsStack', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION || "ap-northeast-1" }
});

const rdsPostgresStack = new RdsPostgresStack(app, 'CdkRds', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION || "ap-northeast-1" },
  vpc: multiVpcsStack.sharedVpc,
});

const albStack = new SharedVpcAlbStack(app, 'Alb', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION || "ap-northeast-1" },
  vpc: multiVpcsStack.sharedVpc,
  rdsPostgresStack: rdsPostgresStack, // RdsPostgresStack を用意せず、VPC と ALB 一式のみだけで良い場合はここをコメントアウトすれば OK
});