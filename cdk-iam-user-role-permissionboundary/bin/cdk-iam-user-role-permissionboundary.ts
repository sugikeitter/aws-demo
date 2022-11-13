#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkIamUserRolePermissionboundaryStack } from '../lib/cdk-iam-user-role-permissionboundary-stack';

const app = new cdk.App();
new CdkIamUserRolePermissionboundaryStack(app, 'CdkIamUserRolePermissionboundaryStack', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: process.env.AWS_REGION || "ap-northeast-1" }
});