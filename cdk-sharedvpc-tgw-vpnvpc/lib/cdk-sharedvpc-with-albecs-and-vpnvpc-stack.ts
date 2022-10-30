import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PrivateVpcVpn } from './private-vpc-with-vpn';
import { SharedVpcWithTgwNwfw } from './shared-vpc-with-tgw-nwfw';
import { TransitGateway } from './transitgateway';

export class CdkSharedvpcWithAlbecsAndVpnvpcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sharedVpc = new SharedVpcWithTgwNwfw(this, 'DemoSharedVpcWithTgwNwfw');
    const vpnVpc = new PrivateVpcVpn(this, 'DemoPrivateVpcVpn', {})
    new TransitGateway(this, 'DemoTgw', {
      sharedVpc: sharedVpc.vpc,
      vpnVpc: vpnVpc.vpc,
    });
  }
}
