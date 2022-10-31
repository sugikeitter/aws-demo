import {
  aws_ec2 as ec2
 } from "aws-cdk-lib";
import { Construct } from "constructs";

export interface VpcRouteForTgwProps {
  sharedVpc: ec2.Vpc,
  nwfwEndpointIds: string[],
  vpnVpc: ec2.Vpc,
  tgw: ec2.CfnTransitGateway
}

export class VpcRouteForTgw extends Construct {
  constructor(scope: Construct, id: string, props: VpcRouteForTgwProps) {
    super(scope, id);

    // VPCのルートテーブルにtgw attachのルートを
    props.vpnVpc.selectSubnets({subnetGroupName: 'private'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRoutePrivate' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: '0.0.0.0/0',
        transitGatewayId: props.tgw.attrId,
      }));
    });

    // TODO
    props.sharedVpc.selectSubnets({subnetGroupName: 'nwfw'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'TgwRouteShared' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.vpnVpc.vpcCidrBlock,
        transitGatewayId: props.tgw.attrId,
      }));
    });

    // tgw endpoint があるサブネットから 0.0.0.0 へは Network Firewall endpoint のルートを追加
    props.sharedVpc.selectSubnets({subnetGroupName: 'tgw'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedTgwEni' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: "0.0.0.0/0",
        vpcEndpointId: props.nwfwEndpointIds[i]
      }));
    });

    // PrivateVpcから来たトラフィックをTGWを経由して戻すが、そのためにはNetwork Firewall endpoint を通過させる
    props.sharedVpc.selectSubnets({subnetGroupName: 'public'}).subnets.forEach((subnet, i) => {
      subnet.node.children.push(new ec2.CfnRoute(this, 'RouteSharedPublicToPrivateVpc' + i, {
        routeTableId: subnet.routeTable.routeTableId,
        destinationCidrBlock: props.vpnVpc.vpcCidrBlock, // vpnVpc の CIDR
        vpcEndpointId: props.nwfwEndpointIds[i]
      }));
    });
  }
}