import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PrivateVpcVpn } from './private-vpc-with-vpn';
import { SharedVpcAlb } from './shared-vpc-alb';
import { SharedVpcWithNwfw } from './shared-vpc-with-tgw-nwfw';
import { TransitGateway } from './transitgateway';
import { VpcRouteForTgw } from './vpc-route-for-tgw';

export class CdkMultiVpcsStack extends Stack {
  public readonly sharedVpc: ec2.Vpc;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const sharedVpc = new SharedVpcWithNwfw(this, 'SharedVpc');
    this.sharedVpc = sharedVpc.vpc;
    const vpnVpc = new PrivateVpcVpn(this, 'VpnVpc');
    const tgw = new TransitGateway(this, 'Tgw', {
      sharedVpc: sharedVpc.vpc,
      vpnVpc: vpnVpc.vpc,
    });

    const routeForTgw = new VpcRouteForTgw(this, 'VpcRouteForTgw', {
      sharedVpc: sharedVpc.vpc,
      nwfwEndpointIds: sharedVpc.nwfwEndpointIds,
      vpnVpc: vpnVpc.vpc,
      tgw: tgw.tgw
    });
    // VPC 側のルートで Transit Gateway の ID を参照するため、ルートの設定処理の時点で Transit Gateway 作成が完了していないといけない
    //  そのため VPC 側のルート作成処理だけの Construct を分けて、Transit Gateway 作成の Construct と依存関係を設定
    routeForTgw.node.addDependency(tgw);

    new SharedVpcAlb(this, 'Alb', {
      vpc: sharedVpc.vpc
    });
  }
}
