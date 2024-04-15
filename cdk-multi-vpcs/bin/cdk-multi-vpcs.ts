#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MultiVpcsStack } from '../lib/stack-vpcs';
import { AlbAppStack } from '../lib/stack-alb-apps';

const app = new cdk.App();

const awsAccount = process.env.AWS_ACCOUNT_ID
const awsRegion = process.env.AWS_REGION || "ap-northeast-1";
const maxAzs = parseInt(process.env.MAX_AZS || "2");

const vpcCidrForShared = process.env.MY_SHARED_VPC_TGW_VPN_CIDR || "10.90.0.0/16";
const vpcCidrForApp = process.env.VPN_CIDR_FOR_PUBLIC_APP || "10.91.0.0/16";
// VPN VPC の CIDR は Default VPC と同じ CIDR の 10.0.0.0/16 にしておけば、デフォルト VPC のインスタンスから VPN VPC の NLB へ PrivateLink で接続できることの確認も可能できる
const vpcCidrForVPN = process.env.VPC_CIDR_FOR_CLIENT_VPN || "10.0.0.0/16";

const multiVpcsStack = new MultiVpcsStack(app, 'CdkDemoVpcs', {
  env: { account: awsAccount, region: awsRegion },
  maxAzs,
  vpcCidrForShared,
  vpcCidrForApp,
  vpcCidrForVPN,
});

new AlbAppStack(app, 'CdkDemoApps', {
  env: { account: awsAccount, region: awsRegion },
  vpc: multiVpcsStack.vpcForPublicApps,
});
