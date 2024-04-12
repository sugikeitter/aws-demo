import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpnVpc } from './vpc-for-clientvpn';
import { SharedVpcWithNwfw } from './vpc-for-shared-with-tgw-nwfw';
import { TransitGateway } from './tgw-for-sharedvpc';
import { VpcRouteForTgw } from './vpcsroute-for-tgw';
import { AppsVpc } from './vpc-for-apps'

export interface MultiVpcsProps extends StackProps {
  maxAzs: number,
  vpcCidrForShared: string,
  vpcCidrForApp: string,
  vpcCidrForVPN: string,
}

export class MultiVpcsStack extends Stack {
  public readonly vpcForPublicApps: ec2.Vpc;

  constructor(scope: Construct, id: string, props: MultiVpcsProps) {
    super(scope, id, props);

    const sharedVpcConst = new SharedVpcWithNwfw(this, 'Shared', props.maxAzs, props.vpcCidrForShared);
    const appVpcConst = new AppsVpc(this, 'App', 3, props.vpcCidrForApp) // この VPC は AZ を 3 つで固定
    const vpnVpcConst = new VpnVpc(this, 'Vpn', props.maxAzs, props.vpcCidrForVPN);
    this.vpcForPublicApps = appVpcConst.vpc;

    const tgw = new TransitGateway(this, 'Tgw', {
      sharedVpc: sharedVpcConst.vpc,
      vpnVpc: vpnVpcConst.vpc,
      appVpc: appVpcConst.vpc,
    });

    const routeForTgw = new VpcRouteForTgw(this, 'VpcRouteForTgw', {
      sharedVpc: sharedVpcConst.vpc,
      nwfwEndpointIds: sharedVpcConst.nwfwEndpointIds,
      vpnVpc: vpnVpcConst.vpc,
      appVpc: appVpcConst.vpc,
      tgw: tgw.tgw
    });
    // VPC 側のルートで Transit Gateway の ID を参照するため、ルートの設定処理の時点で Transit Gateway 作成が完了していないといけない
    //  そのため VPC 側のルート作成処理だけの Construct を分けて、Transit Gateway 作成の Construct と依存関係を設定
    routeForTgw.node.addDependency(tgw);
  }
}
